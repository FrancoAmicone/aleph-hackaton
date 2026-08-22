# Cómo funciona el código

## Los 3 procesos

```
┌─────────────────────────────────────────────────────────┐
│ bin.mjs          PROCESO PRINCIPAL (Bare)               │
│                                                          │
│  - parsea flags (--room, --storage, --no-updates)       │
│  - lee stdin  ──────────────┐                           │
│  - imprime todo a stdout ◄──┼──────┐                    │
└─────────────────────────────┼──────┼────────────────────┘
                              │      │
                     app.say()│      │ evento 'message'
                              ▼      │
┌─────────────────────────────────────────────────────────┐
│ app.js           HOST DEL WORKER                        │
│                                                          │
│  - PearRuntime.run() spawnea el worker                  │
│  - FramedStream sobre el IPC (mensajes discretos)       │
│  - traduce mensajes crudos ──► eventos                  │
└─────────────────────────────┬───────────────────────────┘
                              │ Bare.IPC
                              ▼
┌─────────────────────────────────────────────────────────┐
│ workers/main.js  WORKER DE BARE (thread aparte)         │
│                                                          │
│  ┌──────────────────┐      ┌─────────────────────┐     │
│  │ updaterSwarm     │      │ chatSwarm           │     │
│  │ + Corestore      │      │ + conns Set         │     │
│  │ topic: discovery │      │ topic: hash(sala)   │     │
│  │ key del updater  │      │                     │     │
│  └──────────────────┘      └─────────────────────┘     │
└─────────────────────────────────────────────────────────┘
```

## Por qué el worker

El branch `main` del template corre el updater OTA en un **worker thread de Bare** para que el
chequeo/descarga de updates no bloquee el proceso principal. Nosotros metimos el chat en ese mismo
worker porque ahí ya vive la infraestructura P2P.

`stdin` **no** está en el worker — vive en el proceso principal. Por eso cada línea que tipeás baja
por IPC hasta el worker, que la broadcastea.

## El protocolo IPC

`FramedStream` envuelve `Bare.IPC` para que cada `write()` llegue como **un mensaje entero**
(sin framing, TCP te puede partir o pegar mensajes).

**Del proceso principal → worker:**

| Mensaje | Quién lo manda | Qué hace |
|---|---|---|
| `pear:applyUpdate` | `app.js` automático al recibir `updated` | aplica el update descargado |
| `chat:<texto>` | `app.say()` desde stdin | broadcast a todos los peers |

**Del worker → proceso principal:**

| Mensaje | Qué hace `app.js` |
|---|---|
| `updating` | emite evento `updating` |
| `updated` | emite `updated` **y responde `pear:applyUpdate`** |
| `pear:updateApplied` | emite `update-applied` |
| *cualquier otra cosa* | emite `message` → `bin.mjs` lo hace `console.log` |

**Ese último renglón es la clave:** cualquier `pipe.write('lo que sea')` desde el worker aparece en
pantalla. Por eso el chat "imprime" mandando strings arbitrarios.

## Los DOS swarms — decisión importante

El worker levanta **dos instancias de Hyperswarm**. La doc oficial dice "una sola por app", pero acá
está justificado:

```js
// updaterSwarm: cada conexión se entrega a store.replicate(conn)
updaterSwarm.on('connection', (connection) => store.replicate(connection))
```

`store.replicate()` **se adueña del stream** para hablar el protocolo binario de Hypercore.
Si escribiéramos bytes de chat en ese mismo socket, romperíamos la replicación (y el OTA).

Compartir un solo swarm requeriría multiplexar los dos protocolos con **protomux** sobre cada
conexión. Es lo correcto a futuro, pero es complejidad que no necesitamos para validar el flujo.

> **Para el juego:** si querés un solo swarm, mirá `variant/single-thread`, que le pasa `store` y
> `swarm` ya construidos al `PearRuntime`. Ahí sí compartís instancia, pero seguís necesitando
> protomux para no pisar la replicación.

## Salas por nombre

```js
const topic = crypto.data(b4a.from(`test-msg:room:${room}`))
```

Un topic de Hyperswarm son **32 bytes**. `crypto.data()` hashea cualquier string a 32 bytes de
forma determinística (verificado: mismo input → mismo output).

Resultado: dos personas que tipean `--room hackaton` caen en el mismo topic sin copiarse un hex
de 64 caracteres. Para el juego, esto es "código de sala".

El prefijo `test-msg:room:` es un namespace, para no colisionar con el topic de otra app que
hashee el mismo nombre.

```js
chatSwarm.join(topic, { client: true, server: true })
```

- `client: true` → busco peers en este topic
- `server: true` → me anuncio para que me encuentren

Los dos en true = todos son iguales, no hay servidor.

## Archivos modificados respecto del template

### `workers/main.js`
Antes era una línea: `require('hello-pear-worker')`.
Ahora tiene el contenido de ese paquete (copiado de
[hello-pear-worker](https://github.com/holepunchto/hello-pear-worker)) **más** el bloque del chat.

Se inlineó a propósito: la lógica P2P tiene que ser nuestra y editable, no una dependencia opaca.

### `app.js`
- El constructor acepta `room` y lo pasa como **argv\[6\]** al worker.
  ⚠️ El orden del array importa: el worker los lee por índice.
- Método público `say(text)` → manda `chat:<text>`.

### `bin.mjs`
- Flag `--room|-r <name>` (default `general`).
- Después de `app.ready()`, engancha `process.stdin` y manda cada línea con `app.say()`.

## Cómo el worker lee sus argumentos

```js
const argv = (index) => Bare.argv[index + (isBareKit ? 0 : 2)]
```

En desktop, `Bare.argv[0]` es el ejecutable y `[1]` el entrypoint, así que los args reales
arrancan en `[2]`. En mobile (BareKit) no existen esos dos, arrancan en `[0]`.
Ese helper normaliza el offset para que el mismo worker corra en las dos plataformas.

Orden actual:

| índice | valor |
|---|---|
| 0 | `updates` (string `'true'`/`'false'`) |
| 1 | `version` |
| 2 | `upgrade` (el `pear://`) |
| 3 | `name` |
| 4 | `dir` (storage) |
| 5 | `app` (path del ejecutable, vacío en dev) |
| 6 | **`room`** ← agregado por nosotros |

## Teardown

```js
goodbye(async () => {
  await chatSwarm.destroy()
  await updaterSwarm.destroy()
  await pear.close()
  await store.close()
})
```

No es opcional. Si el swarm no se destruye, quedan registros colgados en el HyperDHT y las
conexiones siguientes tardan más en establecerse — está listado como causa #1 de lentitud
en la doc oficial de troubleshooting.
