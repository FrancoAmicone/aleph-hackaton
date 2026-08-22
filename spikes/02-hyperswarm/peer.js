// SPIKE 2 — Hyperswarm: dos procesos que se encuentran por topic e
// intercambian mensajes JSON.
//
// Correr (dos terminales, misma sala):
//   ./node_modules/.bin/bare peer.js pear-pong ana
//   ./node_modules/.bin/bare peer.js pear-pong beto
//
// Salir: Ctrl+C (destruye el swarm; ver "teardown" abajo).

const Hyperswarm = require('hyperswarm')
const crypto = require('hypercore-crypto')
const FramedStream = require('framed-stream')
const b4a = require('b4a')
const process = require('bare-process')

const room = Bare.argv[2] || 'pear-pong'
const me = Bare.argv[3] || b4a.toString(crypto.randomBytes(3), 'hex')

// El topic es de 32 bytes. crypto.data() hashea el nombre de sala a esos 32 bytes
// de forma determinística, así los dos jugadores tipean "pear-pong" en vez de
// copiarse 64 chars de hex. Verificado: length 32, mismo nombre -> mismo topic.
const topic = crypto.data(b4a.from(room))

const swarm = new Hyperswarm()
const peers = new Map() // publicKey hex -> { conn, framed, name }

function log(...args) {
  console.log(`[${me}]`, ...args)
}

// --- mensajería ----------------------------------------------------------
// Los streams duplex NO preservan límites de mensaje: si mandás dos JSON
// seguidos, pueden llegar pegados en un chunk o partidos al medio.
// FramedStream (ya es dependencia del template) prefija cada mensaje con su
// longitud, así 1 write = 1 'data'. Sin esto, JSON.parse revienta.
function send(framed, msg) {
  framed.write(b4a.from(JSON.stringify(msg)))
}

swarm.on('connection', (conn, info) => {
  const key = b4a.toString(info.publicKey, 'hex')
  const short = key.slice(0, 8)

  const framed = new FramedStream(conn)
  peers.set(key, { conn, framed, name: short, lastSeen: Date.now() })
  log(`+ conectado con ${short} (peers: ${peers.size})`)

  // Handshake: el que llega saluda, el otro responde. No hay rol de
  // servidor/cliente — los dos corren exactamente el mismo código.
  send(framed, { type: 'hello', from: me })

  framed.on('data', (data) => {
    let msg
    try {
      msg = JSON.parse(b4a.toString(data))
    } catch (err) {
      log(`! JSON inválido de ${short}:`, err.message)
      return
    }

    const peer = peers.get(key)
    if (peer) peer.lastSeen = Date.now()

    if (msg.type === 'hello') {
      if (peer) peer.name = msg.from
      log(`  <- hello de "${msg.from}"`)
      send(framed, { type: 'welcome', from: me })
      return
    }

    if (msg.type === 'welcome') {
      if (peer) peer.name = msg.from
      log(`  <- welcome de "${msg.from}" — handshake completo`)
      return
    }

    if (msg.type === 'ping') {
      log(`  <- ping #${msg.seq} de "${msg.from}"`)
      send(framed, { type: 'pong', from: me, seq: msg.seq, t: msg.t })
      return
    }

    if (msg.type === 'pong') {
      log(`  <- pong #${msg.seq} de "${msg.from}" (RTT ${Date.now() - msg.t}ms)`)
      return
    }

    log(`  <- desconocido:`, msg)
  })

  // --- desconexión -------------------------------------------------------
  // 'close' es el evento que importa: se dispara tanto si el peer se cae como
  // si cierra ordenado. 'error' NO siempre llega (un kill -9 remoto puede
  // cerrar limpio del lado nuestro), por eso la limpieza va en 'close'.
  conn.once('close', () => {
    const name = peers.get(key)?.name || short
    peers.delete(key)
    log(`- se fue "${name}" (peers: ${peers.size})`)
  })

  // HACEN FALTA LOS DOS handlers de error. Cuando el peer se cae, el ECONNRESET
  // se propaga por el FramedStream que envuelve al conn — no sólo por el conn.
  // Sin el de framed, el proceso muere con "Uncaught Error: connection reset by
  // peer" (verificado: core dumped). O sea: si un jugador cierra, al otro se le
  // cae el juego.
  conn.on('error', (err) => log(`! error con ${short}: ${err.message}`))
  framed.on('error', (err) => log(`! error de framing con ${short}: ${err.message}`))
})

// --- game tick -----------------------------------------------------------
// Ping periódico: hace las veces del tick de un juego y deja ver en vivo
// cuándo un peer deja de responder.
// Un peer que no dio señales en PEER_TIMEOUT se declara muerto por nuestra cuenta.
// Hace falta: si el otro se cae abruptamente (kill -9, cable, batería) NO llega
// ningún aviso — Hyperswarm va sobre UDX (UDP), no hay RST de TCP que avise.
// Verificado: con kill -9 el evento 'close' no llegó en 10s. Con cierre ordenado
// sí llega al instante.
const PEER_TIMEOUT = 6000

let seq = 0
const tick = setInterval(() => {
  if (peers.size === 0) return
  seq++

  const now = Date.now()
  for (const peer of peers.values()) {
    if (peer.dead) continue

    if (now - peer.lastSeen > PEER_TIMEOUT) {
      peer.dead = true
      log(`⏱ "${peer.name}" no responde hace ${now - peer.lastSeen}ms — lo doy por muerto`)
      // destroy() dispara 'close', que es el ÚNICO lugar donde se limpia el Map.
      // Un solo punto de limpieza evita estados a medias.
      peer.conn.destroy()
      continue
    }

    send(peer.framed, { type: 'ping', from: me, seq, t: now })
  }
}, 2000)

// --- teardown ------------------------------------------------------------
// Si el swarm no se destruye quedan registros colgados en el DHT y las
// próximas conexiones tardan más (ver docs/06-troubleshooting.md).
let closing = false

async function shutdown() {
  if (closing) return
  closing = true
  clearInterval(tick) // sin esto el loop no se vacía y el proceso cuelga (lección del spike 1)
  log('cerrando swarm...')
  await swarm.destroy()
  log('swarm destruido, chau')
}

process.once('SIGINT', shutdown)
process.once('SIGTERM', shutdown)

// --- join ----------------------------------------------------------------
// client:true + server:true = cualquiera se conecta con cualquiera.
const discovery = swarm.join(topic, { client: true, server: true })

log(`sala "${room}" -> topic ${b4a.toString(topic, 'hex').slice(0, 16)}...`)
log('esperando peers... (Ctrl+C para salir)')

// flushed() resuelve cuando el topic terminó de anunciarse en el DHT.
discovery.flushed().then(() => log('topic anunciado en el DHT'))
