// Prueba de conexión entre dos máquinas.
//
// Uso:  node p2p-test.js <tu-nombre> <sala>
//
// NO hace falta arrancar al mismo tiempo. El que arranca primero espera.
// Corre hasta que se conecten (o hasta Ctrl+C).
// Una vez conectados, lo que escribas y mandes con Enter le llega al otro.

const Hyperswarm = require('hyperswarm')
const crypto = require('hypercore-crypto')
const b4a = require('b4a')

const nombre = process.argv[2] || 'peer'
const sala = process.argv[3] || 'test'

const topic = crypto.data(b4a.from(`test-msg:room:${sala}`))
const swarm = new Hyperswarm()
const yo = b4a.toString(swarm.keyPair.publicKey, 'hex')

const conns = new Set()
let vistoEnDht = false

console.log(`\n=== prueba P2P — ${nombre} — sala "${sala}" ===`)
console.log(`topic: ${b4a.toString(topic, 'hex').slice(0, 16)}…`)
console.log(`Esperando al otro peer… (no hace falta arrancar juntos)\n`)

swarm.on('connection', (conn) => {
  const otro = b4a.toString(conn.remotePublicKey, 'hex').slice(0, 8)
  conns.add(conn)

  console.log(`\n✅ CONECTADO con ${otro}  —  ${conns.size} peer(s)`)
  console.log(`   Escribí algo y Enter para mandarle un mensaje.\n`)

  conn.on('data', (d) => console.log(`📩 ${otro}: ${d.toString()}`))
  conn.on('error', () => {})
  conn.once('close', () => {
    conns.delete(conn)
    console.log(`\n❌ ${otro} se desconectó — ${conns.size} peer(s)\n`)
  })

  conn.write(`saludo automático de ${nombre}`)
})

const discovery = swarm.join(topic, { client: true, server: true })

// Mandar lo que se tipea a todos los conectados.
process.stdin.on('data', (d) => {
  const texto = d.toString().trim()
  if (!texto) return
  if (conns.size === 0) {
    console.log('   (todavía no hay nadie conectado)')
    return
  }
  for (const c of conns) c.write(`${nombre}: ${texto}`)
})

// Mientras no haya nadie: reintentar y avisar qué está pasando.
// El refresh fuerza un announce+lookup nuevo; sin esto, si los dos peers hacen su
// lookup antes de que el announce del otro se propague, pueden tardar minutos en verse.
async function intentar() {
  if (conns.size > 0) return

  try {
    await discovery.refresh({ client: true, server: true })
  } catch {}

  // ¿El otro ya está anunciado en el DHT?
  try {
    const claves = new Set()
    for await (const res of swarm.dht.lookup(topic)) {
      for (const p of res.peers || []) claves.add(b4a.toString(p.publicKey, 'hex'))
    }
    claves.delete(yo)

    if (claves.size > 0 && !vistoEnDht) {
      vistoEnDht = true
      console.log(`👀 el otro peer YA aparece en el DHT — intentando abrir la conexión…`)
    }
    if (claves.size === 0) {
      process.stdout.write('.')
    }
  } catch {}
}

const iv = setInterval(intentar, 5000)
intentar()

// Aviso útil si tarda mucho, con el diagnóstico ya hecho.
setTimeout(() => {
  if (conns.size === 0) {
    console.log(`\n⏱️  Más de 2 minutos sin conectar.`)
    console.log(
      vistoEnDht
        ? '   Se ven en el DHT pero no se abre el túnel → hole punching bloqueado (NAT/firewall).\n   Probá que uno de los dos use hotspot de celular.'
        : '   El otro peer NO aparece en el DHT → o no está corriendo, o está en otra sala.\n   Verificá que el "topic" sea idéntico en las dos máquinas.'
    )
  }
}, 120000)

function salir() {
  clearInterval(iv)
  console.log('\ncerrando…')
  swarm.destroy().then(() => process.exit(0))
  setTimeout(() => process.exit(0), 3000)
}

process.on('SIGINT', salir)
process.on('SIGTERM', salir)
