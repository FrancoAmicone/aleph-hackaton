# SPIKE 2 — Hyperswarm

**Pregunta:** ¿dos procesos se encuentran por un topic e intercambian mensajes JSON?

**Respuesta: SÍ**, con una salvedad importante — ver *Riesgo abierto* abajo.

Verificado sobre Bare v1.29.4 con `hyperswarm@4.17.0`, dentro del template `hello-pear-bare`.

## Cómo correr

```bash
# dos terminales, misma sala
./node_modules/.bin/bare peer.js pear-pong ana
./node_modules/.bin/bare peer.js pear-pong beto
```

Salir con Ctrl+C (destruye el swarm).

## Qué funciona

- **Discovery por nombre de sala.** `crypto.data(b4a.from('pear-pong'))` → topic de 32 bytes
  determinístico. Verificado: mismo nombre → mismo topic, otra sala → topic distinto.
  Los jugadores tipean `pear-pong`, no 64 chars de hex.
- **Handshake sin roles.** Los dos peers corren el mismo código: `hello` → `welcome`.
  No hay servidor ni cliente.
- **Mensajes JSON con framing.** ping/pong con RTT medido: **0-2ms** entre peers locales.
- **Detección de desconexión**, en dos formas distintas (ver abajo).
- **Reconexión automática**: matando un peer y relanzándolo, Hyperswarm los volvió a
  conectar solo en ~7s, sin tocar nada.

## Los hallazgos que importan

### 1. Hacen falta DOS handlers de error, no uno

El más caro de los encontrados. Con `conn.on('error')` solamente, cuando el peer se cae
el proceso **muere**:

```
Uncaught Error: connection reset by peer
    at FramedStream._destroy (streamx/index.js:725:5)
```

El `ECONNRESET` se propaga por el **FramedStream** que envuelve al `conn`, no sólo por el
`conn`. En un juego eso significa: *un jugador cierra la ventana y al otro se le cae el juego.*
Hay que registrar los dos:

```js
conn.on('error', ...)
framed.on('error', ...)
```

### 2. Una caída abrupta NO se detecta sola

Hyperswarm va sobre **UDX (UDP)**. No hay `RST` de TCP que avise.

| Cómo se fue el peer | Se detecta |
|---|---|
| Cierre ordenado (`swarm.destroy()`) | **Inmediato** — llega `connection reset by peer` y `close` |
| Caída abrupta (`kill -9`, batería, cable) | **NO llegó nada en 10s** |

Por eso `peer.js` lleva un **heartbeat de aplicación**: cada peer manda `ping` cada 2s y
declara muerto al que no dio señales en 6s. Medido: **detección en ~7s**.

Un juego en tiempo real necesita esto sí o sí. El tick del ping hace de game tick.

### 3. Los mensajes JSON necesitan framing

Los streams duplex **no preservan límites de mensaje**: dos JSON seguidos pueden llegar
pegados en un chunk o partidos al medio, y `JSON.parse` revienta. `framed-stream`
(ya es dependencia del template) prefija cada mensaje con su longitud → 1 write = 1 `data`.

### 4. La public key del peer cambia en cada arranque

`new Hyperswarm()` genera un keyPair nuevo cada vez. En la prueba de reconexión, el mismo
"beto" volvió como `566efe98` primero y `63d92096` después.

**Implicancia:** si el juego quiere identidad persistente de jugador (puntaje, "es el mismo
que se reconectó"), hay que **guardar el keyPair en disco** y pasárselo al swarm. Si no,
cada reconexión es un desconocido.

### 5. `./node_modules/.bin/bare` es un wrapper de Node, no el binario

Registra handlers **no-op** para SIGTERM/SIGINT (`suppressSignals: true` en
`bare-runtime/lib/spawn.js`) y spawnea el binario real como hijo.

- **Ctrl+C en una terminal funciona bien** — la señal va a todo el process group, el hijo la recibe.
- **Matar por PID al wrapper no hace nada.** Para scripts, usar el binario real:
  `node_modules/bare-runtime-<platform>-<arch>/bin/bare`.

Verificado que el teardown funciona cuando la señal llega: `cerrando swarm... → swarm destruido, chau`.

### 6. Teardown: limpiar el interval (igual que en el Spike 1)

`swarm.destroy()` **y** `clearInterval(tick)`. Sin lo segundo el loop no se vacía y el
proceso queda colgado. Misma trampa que en el Spike 1.

## ⚠️ El discovery no es confiable al primer intento — MEDIDO

10 corridas por escenario, dos peers en la **misma máquina**, topic nuevo cada vez:

| Teardown de la corrida anterior | Conectaron | Tiempo cuando conectó |
|---|---|---|
| Sucio (`kill -9`, sin `swarm.destroy()`) | **4 / 10** | siempre 7s |
| Limpio (SIGINT → `await swarm.destroy()`) | **7 / 10** | 7s (una vez 10s) |

### a) El teardown sucio casi duplica los fallos

40% → 70% de éxito con sólo cerrar bien. Confirma empíricamente lo que advierte
`docs/06-troubleshooting.md`: los swarms sin destruir dejan registros colgados en el HyperDHT
y degradan las conexiones siguientes.

**`await swarm.destroy()` no es prolijidad, es funcionalidad.**

(Detalle honesto: la primera medición dio 4/10 porque *el script de test* mataba los peers con
`kill -9`. La metodología estaba produciendo el problema que intentaba medir.)

### b) Aún con teardown limpio, 3 de 10 no conectan

Y no es que tarden: el timeout era de **40s** y los éxitos siempre llegaron a los ~7s.
O se entra en la ventana de reanuncio del DHT, o no se entra.

**Consecuencia de diseño para el juego [NUESTRO]:** hace falta **retry**. Si no apareció nadie
en ~10-15s: `swarm.leave(topic)` + `swarm.join(topic)`, mostrando "buscando jugadores..." en
pantalla. Con 70% por intento, tres intentos dan ~97%.
**Nunca asumir que el primer join encuentra al otro jugador.**

### Contexto que baja la alarma

Los dos peers corrían en la misma máquina, o sea el mismo NAT — el caso de hairpinning más
difícil que existe. La doc oficial ya lo advierte (`06-troubleshooting.md`: *"Dos máquinas en
la misma red NAT a veces no se ven"*).

> **Pendiente:** medir entre **dos máquinas distintas**, que es el escenario real de la demo.
> Es la única prueba que despeja este riesgo del todo.

## ✅ Sobrevive a un corte de internet (medido)

`test-sin-internet.sh` bloquea UDP saliente hacia internet (loopback y LAN pasan), dejando
el DHT inalcanzable, y cuenta si dos peers **ya conectados** siguen hablando. Necesita root:

```bash
sudo bash test-sin-internet.sh
```

**Resultado con 30s de DHT caído:**

```
pongs antes del corte:   0
pongs después de 30s:    15  (+15)
peers dados por muertos: 0

VEREDICTO: la conexión SOBREVIVIÓ — siguieron hablando sin DHT.
```

El tick es cada 2s → 30s / 2s = 15 ticks esperados, **15 pongs recibidos**. No se perdió
ni un mensaje. Confirmado: **el DHT sirve para encontrarse, no para hablar.**

**Alcance de esta medición — importa:** los dos peers corrían en la **misma máquina**, así que
su tráfico era local y nunca pasó por internet. Lo que queda probado es que *la conexión
establecida no depende del DHT*. Para dos jugadores en máquinas distintas:

| Situación | ¿Sobrevive al corte de internet? |
|---|---|
| Los dos en la **misma LAN** (mismo wifi del evento) | Sí — el tráfico es LAN, no toca internet |
| En **redes distintas** (hole punching por IPs públicas) | No — ahí el tráfico sí va por internet |

**Para el domingo:** si el wifi del evento sigue en pie pero pierde internet, con los jugadores
ya adentro de la partida, **la partida sigue**. Lo que no sobrevive es que se caiga el wifi entero.

## Contexto: P2P no es "sin internet"

Para **encontrarse** hace falta internet. HyperDHT arranca con bootstrap nodes hardcodeados:

```
88.99.3.86@node1.hyperdht.org:49737
142.93.90.113@node2.hyperdht.org:49737
138.68.147.8@node3.hyperdht.org:49737
```

Y Hyperswarm **no tiene mDNS ni descubrimiento de LAN** (verificado por grep). Sin llegar a
esos nodos, dos peers no se encuentran aunque estén en el mismo wifi.

Una vez conectados, el tráfico va **directo** entre peers — ahí sí no hay nadie en el medio.

Para P2P sin infraestructura de red existe **BLE-swarm** (Bluetooth LE), mencionado por el
track y en `docs/04-p2p.md`. Alto riesgo, alto impacto visual.

## Archivos

| Archivo | Qué es |
|---|---|
| `peer.js` | El spike. Swarm + handshake + JSON framed + heartbeat + teardown. |
| `test-sin-internet.sh` | Mide supervivencia a corte de DHT. Necesita root. |

El resto son archivos del template `hello-pear-bare` sin tocar.
