// Worker de Bare. Corre dos cosas en paralelo:
//   1. El updater OTA de Pear (esto viene tal cual del boilerplate hello-pear-worker)
//   2. El chat P2P sobre Hyperswarm (esto lo agregamos nosotros)
//
// Original de referencia: https://github.com/holepunchto/hello-pear-worker
//
// Se comunica con el proceso principal (app.js) por Bare.IPC, envuelto en FramedStream
// para que cada write() sea un mensaje discreto y no un chorro de bytes.

const PearRuntime = require('pear-runtime')
const Hyperswarm = require('hyperswarm')
const Corestore = require('corestore')
const goodbye = require('graceful-goodbye')
const FramedStream = require('framed-stream')
const crypto = require('hypercore-crypto')
const b4a = require('b4a')
const path = require('bare-path')
const storage = require('bare-storage')
const { isBareKit } = require('which-runtime')

// En mobile el worker no recibe argv[0] (ejecutable) ni argv[1] (entrypoint),
// así que se corrige el offset para poder reusar el mismo worker en toda plataforma.
const argv = (index) => Bare.argv[index + (isBareKit ? 0 : 2)]

const updaterConfig = {
  updates: argv(0) !== 'false',
  version: argv(1),
  upgrade: argv(2),
  name: argv(3),
  dir: argv(4) || storage.persistent(),
  app: argv(5)
}

const room = argv(6) || 'general'

const pipe = new FramedStream(Bare.IPC)

// ---------------------------------------------------------------------------
// 1. UPDATER OTA
// ---------------------------------------------------------------------------

const store = new Corestore(path.join(updaterConfig.dir, 'pear-runtime', 'corestore'))
const updaterSwarm = new Hyperswarm()
const pear = new PearRuntime({ ...updaterConfig, swarm: updaterSwarm, store, delay: 5000 })

pear.updater.on('error', (err) => pipe.write(`[updater:error] ${err.message}`))

if (updaterConfig.updates !== false) {
  // Este swarm es EXCLUSIVO del updater: cada conexión se entrega a store.replicate(),
  // que toma control del stream para hablar el protocolo de Hypercore.
  updaterSwarm.on('connection', (connection) => store.replicate(connection))
  updaterSwarm.join(pear.updater.drive.core.discoveryKey, {
    client: true,
    server: false
  })
}

// app.js escucha estos dos y responde 'pear:applyUpdate' cuando llega 'updated'.
pear.updater.on('updating', () => pipe.write('updating'))
pear.updater.on('updated', () => pipe.write('updated'))

// ---------------------------------------------------------------------------
// 2. CHAT P2P
// ---------------------------------------------------------------------------
//
// OJO: swarm SEPARADO del updater, a propósito.
// El updater le pasa cada conexión a store.replicate(), que se adueña del stream.
// Si escribiéramos bytes de chat en ese mismo stream romperíamos la replicación.
// Compartir un solo swarm requiere multiplexar con protomux — innecesario acá.

// El topic son 32 bytes. Derivarlo hasheando el nombre de la sala hace que dos
// personas que tipean el mismo nombre caigan en el mismo topic, sin copiar hex.
const topic = crypto.data(b4a.from(`test-msg:room:${room}`))

const chatSwarm = new Hyperswarm()
const conns = new Set()
const me = b4a.toString(chatSwarm.keyPair.publicKey, 'hex').slice(0, 6)

chatSwarm.on('connection', (conn) => {
  const peer = b4a.toString(conn.remotePublicKey, 'hex').slice(0, 6)

  conns.add(conn)
  pipe.write(`* ${peer} entró a la sala (${conns.size} conectado/s)`)

  conn.on('data', (data) => pipe.write(`${peer} > ${data.toString()}`))

  // Sin este handler, un peer que se cae tira una excepción no capturada.
  conn.on('error', () => {})

  conn.once('close', () => {
    conns.delete(conn)
    pipe.write(`* ${peer} salió de la sala (${conns.size} conectado/s)`)
  })
})

// client: true  -> busco peers en este topic
// server: true  -> me anuncio para que otros me encuentren
const discovery = chatSwarm.join(topic, { client: true, server: true })

// flush() resuelve cuando el anuncio al DHT terminó.
chatSwarm.flush().then(() => {
  pipe.write(`* sala "${room}" lista | sos ${me} | topic ${b4a.toString(topic, 'hex').slice(0, 12)}…`)
})

// Si dos peers arrancan al mismo tiempo hay un race: cada uno hace su lookup antes
// de que el announce del otro se haya propagado por el DHT, y entonces no se ven
// hasta el siguiente ciclo de refresh automático (que es lento).
// Medido sin esto: 6s, 7s y 43s en tres corridas.
// Forzar un refresh mientras no haya nadie conectado corta esa cola larga.
const REFRESH_MS = 5000
const refresher = setInterval(() => {
  if (conns.size > 0) return
  discovery.refresh({ client: true, server: true }).catch(() => {})
}, REFRESH_MS)

// ---------------------------------------------------------------------------
// 3. IPC: mensajes que bajan desde el proceso principal
// ---------------------------------------------------------------------------

pipe.on('data', async (data) => {
  const message = data.toString()

  if (message === 'pear:applyUpdate') {
    await pear.ready()
    await pear.updater.applyUpdate()
    pipe.write('pear:updateApplied')
    return
  }

  if (message.startsWith('chat:')) {
    const text = message.slice(5)
    for (const conn of conns) conn.write(text)
    return
  }

  console.log(message)
})

goodbye(async () => {
  clearInterval(refresher)
  // Destruir los swarms en el teardown importa: si no, quedan registros colgados
  // en el HyperDHT y las próximas conexiones tardan más en establecerse.
  await chatSwarm.destroy()
  await updaterSwarm.destroy()
  await pear.close()
  await store.close()
})

pipe.write(`* worker arriba | v${updaterConfig.version} | storage: ${pear.storage}`)
