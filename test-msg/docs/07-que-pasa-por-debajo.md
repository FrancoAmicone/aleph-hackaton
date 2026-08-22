# Qué pasa a nivel bajo cuando dos peers se conectan

Fuente: https://docs.pears.com/explanation/peer-to-peer-demystified/

No hay servidor. Ninguna de las dos máquinas tiene IP pública ni puerto abierto.
Aun así se conectan directo. Cómo.

## Las piezas

| Pieza | Qué es |
|---|---|
| **HyperDHT** | Tabla hash distribuida. La capa de descubrimiento: dice *quién* está escuchando *qué*. |
| **UDX** | El transporte. UDP confiable, sobre el que corre todo. |
| **Noise / Secretstream** | El cifrado. Conexiones end-to-end encriptadas. |
| **Topic** | 32 bytes arbitrarios. El "canal" donde te anunciás y buscás. |
| **keyPair** | Tu identidad. La public key **es** tu dirección, independiente de dónde estés. |

## La secuencia

### 1. Se deriva el topic

```js
const topic = crypto.data(b4a.from(`test-msg:room:${room}`))
```

32 bytes determinísticos. Los dos peers que tipean la misma sala llegan al mismo número.
**El topic no es un lugar ni una dirección** — es solo una etiqueta bajo la cual registrarse.

En Pear, el topic suele ser el `discoveryKey` de un Hypercore. El del updater, por ejemplo:
```js
updaterSwarm.join(pear.updater.drive.core.discoveryKey, { client: true, server: false })
```

### 2. Announce y lookup

```js
chatSwarm.join(topic, { client: true, server: true })
```

Dos operaciones distintas, y acá está la clave de todo:

- **`server: true` → ANNOUNCE.** "Yo, la public key `49087c`, estoy escuchando en el topic `5ac3fa…`."
  Eso queda registrado en los nodos del DHT responsables de ese topic.
- **`client: true` → LOOKUP.** "¿Quién está escuchando en `5ac3fa…`?" El DHT devuelve una lista
  de public keys con sus direcciones observadas.

Con los dos en `true`, cada peer hace ambas: se anuncia y busca. Por eso no hay servidor —
todos son simétricos.

`discovery.flushed()` resuelve cuando **tu announce terminó de propagarse**.
⚠️ Que tu announce haya terminado **no significa** que hayas encontrado a nadie. Son cosas distintas.
Es exactamente el malentendido que nos hizo perder tiempo (ver `03-bitacora.md`).

### 3. Hole punching

Acá está la magia. Las dos máquinas están detrás de NAT: IP privada, sin puertos abiertos.
Ninguna puede "llamar" a la otra.

De la doc oficial:

> "UDP hole punching coordinates both peers through a rendezvous point so that each opens a path
> through its local firewall."

El mecanismo:

1. Los dos peers ya están hablando con nodos del DHT, así que **cada uno tiene un socket UDP
   saliente abierto**. Su router anotó "este puerto interno ↔ este puerto externo".
2. Un nodo del DHT hace de **rendezvous**: le dice a cada uno la dirección observada del otro.
3. Los dos mandan paquetes UDP al otro **al mismo tiempo**.
4. El primer paquete de A probablemente muere en el NAT de B. Pero al salir, **abrió el agujero en
   el NAT de A**. Lo mismo del otro lado.
5. Cuando llega el paquete de B, el NAT de A ya tiene la regla y lo deja pasar.

Los dos "perforan" su propio firewall desde adentro. Por eso `firewalled=true` en el DHT
**no es un error** — es el estado esperado, y hole punching existe justamente para eso.

> "Works on most consumer networks" pero no está garantizado en redes corporativas.
> Cuando falla, **Pear soporta paths de relay**.

### 4. Cifrado

Establecida la ruta UDP, se levanta un stream cifrado con **Noise (vía Secretstream)**.
End-to-end: los nodos del DHT coordinaron el encuentro pero **no pueden leer nada**.

La autenticación sale gratis del keyPair: cuando el handshake termina, `conn.remotePublicKey`
es criptográficamente el peer que decía ser. No hace falta certificado ni CA.

```js
const peer = b4a.toString(conn.remotePublicKey, 'hex').slice(0, 6)
```

### 5. Ya es un stream

```js
conn.write('hola')
conn.on('data', (d) => ...)
```

Un duplex stream común. Todo lo de arriba pasó una sola vez, al principio.

## El race de arranque — medido

Con dos peers arrancando **al mismo tiempo** hay una carrera:

```
A: announce ──────►  DHT
A: lookup   ──────►  DHT   ("¿quién hay?")  → todavía nadie, B no propagó
B: announce ──────►  DHT
B: lookup   ──────►  DHT   → encuentra a A ✅
```

Si el lookup de A corre antes de que el announce de B se propague, A no ve a nadie.
Depende de B encontrarlo a él (y ahí sí, la conexión es bidireccional y los dos reciben el evento).
Si **ambos** lookups salen temprano, hay que esperar al refresh automático, que es lento.

**Medido, tres corridas sin mitigación: 6s, 7s y 43s.**

### La mitigación

`swarm.join()` devuelve un objeto de discovery con un método `refresh()` que fuerza un
announce+lookup nuevo. Lo llamamos cada 5 segundos mientras no haya nadie conectado:

```js
const discovery = chatSwarm.join(topic, { client: true, server: true })

const refresher = setInterval(() => {
  if (conns.size > 0) return
  discovery.refresh({ client: true, server: true }).catch(() => {})
}, 5000)
```

**Medido con la mitigación, cuatro corridas: 6s, 11s, 7s, 6s.**

La cola de 43s desapareció. Son muestras chicas, pero la mejora del peor caso es clara y el
mecanismo explica por qué.

> **Para el juego:** esto importa para el UX del lobby. No asumas conexión instantánea.
> Mostrá "buscando jugadores…" y dejá que el refresh haga su trabajo. Un jugador que ve una
> pantalla muerta 40 segundos se va.

## Qué implica para nosotros

| Hecho | Consecuencia práctica |
|---|---|
| No hay servidor | Nadie "hostea" la partida. Si se van todos, no queda nada. |
| El topic es solo una etiqueta | Un nombre de sala adivinable = cualquiera entra. Para algo privado, el nombre tiene que ser secreto o hay que autenticar por public key. |
| La public key autentica | Se puede confiar en `conn.remotePublicKey` sin infraestructura extra. Sirve como identidad de jugador. |
| Hole punching puede fallar | En redes corporativas. Pear tiene relay, pero hay que contar con que alguien no pueda conectar. |
| Conectar tarda ~5-15s | Hace falta feedback visual mientras tanto. |
| Todo es efímero | Los mensajes existen solo mientras el peer está online. Para persistir hace falta Hypercore/Hyperbee. |

## El swarm del updater hace exactamente lo mismo

```js
updaterSwarm.join(pear.updater.drive.core.discoveryKey, { client: true, server: false })
```

Misma mecánica, dos diferencias:

- El topic es el **discoveryKey del Hyperdrive del release**, no un hash de sala.
- **`server: false`**: solo busca, no se anuncia. Es consumidor de updates, no distribuidor.
  Quien sí se anuncia (`server: true`) es **`pear seed`** — por eso el seed tiene que estar
  corriendo o nadie puede instalar ni actualizar.

Cuando corrés `pear install pear://KEY`, se hace lookup del discoveryKey de esa key, hole punch
contra quien la esté seedeando, y se replica el Hyperdrive con los binarios. **El OTA es el mismo
mecanismo P2P que el chat, con otro topic.**
