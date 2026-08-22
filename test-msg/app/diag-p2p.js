// Diagnóstico P2P entre dos máquinas.
//
// Distingue DOS fallas que se ven igual desde afuera:
//   A) Descubrimiento: el DHT no me devuelve al otro peer  -> problema de announce/lookup
//   B) Hole punching: lo veo en el DHT pero no puedo abrir la conexión -> problema de NAT/firewall
//
// Uso (LOS DOS AL MISMO TIEMPO):
//   node diag-p2p.js <tu-nombre> <sala>
//
// Corre 3 minutos. Hace lookup explícito al DHT cada 15s y fuerza refresh.

const Hyperswarm = require('hyperswarm')
const crypto = require('hypercore-crypto')
const b4a = require('b4a')

const label = process.argv[2] || 'peer'
const room = process.argv[3] || 'diag'
const DURACION_MS = 3 * 60 * 1000
const INTERVALO_MS = 15000

const topic = crypto.data(b4a.from(`test-msg:room:${room}`))
const swarm = new Hyperswarm()
const yo = b4a.toString(swarm.keyPair.publicKey, 'hex')

const t0 = Date.now()
const log = (m) => console.log(`[${label} +${((Date.now() - t0) / 1000).toFixed(0)}s] ${m}`)

log(`sala "${room}"`)
log(`mi clave  ${yo.slice(0, 12)}…`)
log(`topic     ${b4a.toString(topic, 'hex')}`)
log(`corriendo ${DURACION_MS / 60000} min — el otro peer tiene que estar corriendo AL MISMO TIEMPO`)

let conectados = 0
let vistoEnDht = 0

swarm.on('connection', (conn) => {
  conectados++
  log(`✅ CONEXION ESTABLECIDA con ${b4a.toString(conn.remotePublicKey, 'hex').slice(0, 12)}…`)
  conn.on('error', (e) => log(`   error de conexión: ${e.message}`))
  conn.on('data', (d) => log(`   📩 recibido: ${d.toString()}`))
  conn.once('close', () => {
    conectados--
    log(`   conexión cerrada`)
  })
  conn.write(`hola de ${label}`)
})

const discovery = swarm.join(topic, { client: true, server: true })

swarm.dht.ready().then(() => {
  log(`DHT ok | bootstrapped=${swarm.dht.bootstrapped} host=${swarm.dht.host} port=${swarm.dht.port} firewalled=${swarm.dht.firewalled}`)
})

discovery.flushed().then(() => log('mi announce se propagó al DHT'))

// Pregunta explícita al DHT: ¿quién está anunciado en este topic?
async function quienHay(n) {
  const vistos = new Map()
  try {
    for await (const res of swarm.dht.lookup(topic)) {
      for (const p of res.peers || []) {
        const k = b4a.toString(p.publicKey, 'hex')
        if (!vistos.has(k)) vistos.set(k, p)
      }
    }
  } catch (err) {
    log(`lookup #${n} falló: ${err.message}`)
    return
  }

  const otros = [...vistos.keys()].filter((k) => k !== yo)

  if (vistos.size === 0) {
    log(`🔍 lookup #${n}: el DHT no devuelve NADIE en este topic (ni a mí mismo)`)
  } else if (otros.length === 0) {
    log(`🔍 lookup #${n}: solo me veo a mí mismo. El otro peer NO está anunciado (o no propagó)`)
  } else {
    log(`🔍 lookup #${n}: ${otros.length} peer(s) ajeno(s) en el DHT → ${otros.map((k) => k.slice(0, 12) + '…').join(', ')}`)
    vistoEnDht++
    // Solo avisamos tras verlo 2 veces seguidas sin conectar: la conexión suele
    // establecerse pocos ms después del lookup, y avisar antes da un falso positivo.
    if (conectados === 0 && vistoEnDht >= 2) {
      log('   ⚠️  LO VEO EN EL DHT PERO NO PUEDO CONECTAR → falla el hole punching (NAT/firewall)')
    }
  }
}

let n = 0
const iv = setInterval(async () => {
  n++
  await quienHay(n)
  if (conectados === 0) {
    discovery.refresh({ client: true, server: true }).catch(() => {})
  }
  log(`   estado: ${conectados} conectado(s)`)
}, INTERVALO_MS)

setTimeout(async () => {
  clearInterval(iv)
  log('')
  log(`=== RESULTADO: ${conectados > 0 ? '✅ CONECTÓ' : '❌ NO CONECTÓ'} ===`)
  await swarm.destroy()
  process.exit(0)
}, DURACION_MS)
