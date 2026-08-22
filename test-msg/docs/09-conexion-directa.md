# Conexión directa por clave — VERIFICADA ENTRE MÁQUINAS REALES

Doc oficial: https://docs.pears.com/how-to/connect-to-peers/connect-two-peers-by-key-with-hyperdht/
Implementación: `test-msg/app/conectar.js`

## ✅ Resultado (22-ago-2026)

**Franco ↔ Gino, máquinas distintas, redes distintas: FUNCIONA.**

```
[+6.1s] conectando a a1a4fe833ed2…
[+7.7s] ✅ CONECTADO al servidor
[+7.8s] 📩 servidor: hola, soy el servidor
```

- Conversación bidireccional sostenida **327 segundos** sin cortes
- Repetido desde una **segunda red** de Franco (`186.157.164.121`): conectó en 12.6s
- Tiempos de conexión: **7.7s** y **12.6s**

Esto valida, con máquinas reales y hole punching real:

| | |
|---|---|
| HyperDHT hace hole punching entre redes distintas | ✅ |
| El código de `conectar.js` es correcto | ✅ |
| `DHT.keyPair(seed)` da clave estable entre reinicios | ✅ |
| El P2P del track es viable | ✅ |

> ⚠️ **Ojo con los tests en una sola máquina.** Antes de esto, todas las pruebas "exitosas"
> habían sido en un solo host, y HyperDHT ahí toma un **atajo por LAN** (se veía
> `remota: 192.168.112.218:49737` y `punches consistent=0`). O sea: **nunca ejercitaban el
> hole punching**. Un test en una sola máquina NO prueba que el P2P funcione.

## Cómo se usa

```bash
# El que abre la sala
node conectar.js servidor <frase-secreta>
# -> imprime su clave pública de 64 hex; se la pasa al otro

# El que entra
node conectar.js cliente <clave-hex>

# Solo diagnóstico de red, sin necesitar al otro
node conectar.js nat
```

La clave se deriva de la frase con `DHT.keyPair(crypto.data(...))`, así que **es siempre la misma**
para la misma frase. No hay que re-pasarla en cada reinicio.

⚠️ **Frases distintas = claves distintas.** Nos costó una ronda de debug: uno escuchaba con
`loquesea1` y el otro se conectaba a la clave de `loquesea`. Verificar que la clave que imprime
el servidor sea **exactamente** la que pega el cliente.

## Logs

Cada corrida escribe `test-msg/app/logs/<modo>-<timestamp>.log`, con timestamps y las
estadísticas internas del DHT:

```
STATS al-conectar | punches consistent=1 random=0 open=0 | relaying attempts=0 successes=0 aborts=0
```

- `punches.consistent/random/open` — perforaciones intentadas por tipo de NAT
- `relaying.*` — uso de relays
- `punches` en 0 con conexión exitosa = se conectaron por **LAN**, no por hole punching

## Diferencias con Hyperswarm

| | Hyperswarm (topic) | HyperDHT (clave) |
|---|---|---|
| Dirección | Hash del nombre de sala | Clave pública del servidor |
| Roles | Simétricos | Asimétricos: uno escucha, otro llama |
| Descubrimiento | announce + lookup | Ninguno |
| Race de arranque | **Sí** | No |
| Anuncios fantasma | **Sí** (ver abajo) | No |
| Identidad | Nueva en cada arranque | Estable con seed |

### Los anuncios fantasma de Hyperswarm

Verificado: **el DHT devuelve claves de peers que ya murieron.** Se anunció un peer, se lo mató,
y un lookup posterior con nadie vivo igual devolvió su clave.

Como `new Hyperswarm()` genera una clave nueva por arranque, **tus propias corridas anteriores
aparecen como "otro peer"**. Eso invalidó un diagnóstico entero: el script decía "el otro ya está
en el DHT" cuando en realidad se estaba viendo a sí mismo del pasado.

Con conexión directa por clave esto no puede pasar: si el servidor no está vivo, hay error.

## Diagnóstico de NAT

`node conectar.js nat` reporta en ~10s:

```
  IP pública : 200.80.213.210
  Puerto     : 56174
  NAT        : ✅ CONSISTENTE
```

`randomized` viene de HyperDHT:

```js
get randomized() { return this._nat.host !== null && this._nat.port === 0 }
```

- **CONSISTENTE** → el NAT mapea el mismo puerto externo. Hole punching viable.
- **ALEATORIO** → puerto distinto por destino (NAT simétrico / CGNAT). La doc oficial dice que
  falla cuando ambos lados son aleatorios; hace falta relay.

`firewalled=true` es **normal** y no es un error — es el estado esperado detrás de cualquier NAT
doméstico.

## Los dos errores de HyperDHT y qué significan

| Error | Significa |
|---|---|
| `CANNOT_HOLEPUNCH` | No hay por dónde intentarlo (el servidor no publicó relays) |
| `HOLEPUNCH_ABORTED` | **Se encontró al servidor** y se intentó perforar, pero no se abrió el túnel |
| `PEER_CONNECTION_FAILED` | No se llegó al servidor. Suele ser clave equivocada o servidor caído |

`HOLEPUNCH_ABORTED` es buena señal en un sentido: el descubrimiento funcionó.

## Estado pendiente

**Roman no logra conectar** desde su Ubuntu, ni en la wifi del venue ni por hotspot,
siempre con `HOLEPUNCH_ABORTED` y `randomized=false`. Con Gino funciona sin problemas.
Ver `10-caso-roman.md`.
