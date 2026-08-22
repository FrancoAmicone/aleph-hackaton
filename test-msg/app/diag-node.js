// Diagnóstico de conectividad. Hyperswarm puro, sin Pear de por medio.
// Uso: node _diag.js <etiqueta> [sala]
const Hyperswarm = require('hyperswarm')
const crypto = require('hypercore-crypto')
const b4a = require('b4a')

const label = process.argv[2] || '?'
const room = process.argv[3] || 'diag-aleph'

const swarm = new Hyperswarm()
const topic = crypto.data(b4a.from(`test-msg:room:${room}`))

const t0 = Date.now()
const log = (m) => console.log(`[${label} +${((Date.now() - t0) / 1000).toFixed(1)}s] ${m}`)

log(`yo soy ${b4a.toString(swarm.keyPair.publicKey, 'hex').slice(0, 6)}`)
log(`topic ${b4a.toString(topic, 'hex')}`)

swarm.on('connection', (conn) => {
  log('*** CONEXION con ' + b4a.toString(conn.remotePublicKey, 'hex').slice(0, 6) + ' ***')
  conn.on('error', (e) => log('conn error: ' + e.message))
  conn.on('data', (d) => log('RECIBI: ' + d.toString()))
  conn.write(`ping de ${label}`)
})

swarm.dht.ready().then(() => {
  log(`DHT listo | bootstrapped=${swarm.dht.bootstrapped} host=${swarm.dht.host} port=${swarm.dht.port} firewalled=${swarm.dht.firewalled}`)
})

const disco = swarm.join(topic, { client: true, server: true })
disco.flushed().then(() => log('announce al DHT completo'))

const iv = setInterval(() => log(`peers conectados = ${swarm.connections.size}`), 10000)

const DUR = Number(process.env.DUR || 60000)
setTimeout(() => {
  log(`FIN. total peers = ${swarm.connections.size}`)
  clearInterval(iv)
  swarm.destroy().then(() => process.exit(0))
}, DUR)
