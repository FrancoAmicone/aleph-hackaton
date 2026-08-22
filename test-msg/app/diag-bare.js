// Diagnóstico bajo Bare. Uso: bare _diag2.js <etiqueta> <1|2 swarms>
const Hyperswarm = require('hyperswarm')
const crypto = require('hypercore-crypto')
const b4a = require('b4a')

const label = Bare.argv[2] || '?'
const nSwarms = Number(Bare.argv[3] || 1)
const room = Bare.argv[4] || 'diag-bare'

const t0 = Date.now()
const log = (m) => console.log(`[${label} +${((Date.now() - t0) / 1000).toFixed(1)}s] ${m}`)

log(`runtime=bare swarms=${nSwarms}`)

// Swarm "dummy" que simula al del updater: se crea pero (con --no-updates) no se une a nada.
let dummy = null
if (nSwarms === 2) {
  dummy = new Hyperswarm()
  log('swarm dummy (updater) creado')
}

const swarm = new Hyperswarm()
const topic = crypto.data(b4a.from(`test-msg:room:${room}`))

log(`yo soy ${b4a.toString(swarm.keyPair.publicKey, 'hex').slice(0, 6)}`)
log(`topic ${b4a.toString(topic, 'hex').slice(0, 16)}…`)

swarm.on('connection', (conn) => {
  log('*** CONEXION con ' + b4a.toString(conn.remotePublicKey, 'hex').slice(0, 6) + ' ***')
  conn.on('error', () => {})
  conn.on('data', (d) => log('RECIBI: ' + d.toString()))
  conn.write(`ping de ${label}`)
})

const disco = swarm.join(topic, { client: true, server: true })
disco.flushed().then(() => log('announce completo'))

swarm.dht.ready().then(() => {
  log(`DHT bootstrapped=${swarm.dht.bootstrapped} port=${swarm.dht.port}`)
})

const iv = setInterval(() => log(`peers = ${swarm.connections.size}`), 10000)

setTimeout(async () => {
  log(`FIN. peers = ${swarm.connections.size}`)
  clearInterval(iv)
  await swarm.destroy()
  if (dummy) await dummy.destroy()
  Bare.exit(0)
}, Number(Bare.argv[5] || 60000))
