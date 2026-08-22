// Conexión directa por clave pública con HyperDHT.
// Doc: https://docs.pears.com/how-to/connect-to-peers/connect-two-peers-by-key-with-hyperdht/
//
// No hay topic, no hay announce/lookup, no hay anuncios fantasma.
// El cliente va directo contra una clave. Es el test más limpio de
// "¿estas dos máquinas pueden abrir un túnel?".
//
//   node conectar.js nat                          -> solo diagnóstico de red
//   node conectar.js servidor <frase>             -> escucha, imprime su clave
//   node conectar.js cliente  <clave-hex>         -> se conecta a esa clave
//
// Todo queda logueado en ./logs/<modo>-<timestamp>.log

const DHT = require('hyperdht')
const crypto = require('hypercore-crypto')
const b4a = require('b4a')
const fs = require('fs')
const path = require('path')

const modo = process.argv[2]
const arg = process.argv[3]

if (modo !== 'servidor' && modo !== 'cliente' && modo !== 'nat') {
  console.log('uso:')
  console.log('  node conectar.js nat                      (diagnóstico de red)')
  console.log('  node conectar.js servidor <frase-secreta>')
  console.log('  node conectar.js cliente  <clave-hex-del-servidor>')
  process.exit(1)
}

// ------------------------------------------------------------------ LOGGING
const dirLogs = path.join(__dirname, 'logs')
fs.mkdirSync(dirLogs, { recursive: true })

const sello = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
const archivoLog = path.join(dirLogs, `${modo}-${sello}.log`)

const t0 = Date.now()
const transcurrido = () => `+${((Date.now() - t0) / 1000).toFixed(1)}s`

fs.writeFileSync(archivoLog, `=== conectar.js ${modo} — ${new Date().toISOString()} ===\n`)

function log(msg, soloArchivo = false) {
  const linea = `[${transcurrido()}] ${msg}`
  if (!soloArchivo) console.log(linea)
  try {
    fs.appendFileSync(archivoLog, linea + '\n')
  } catch {}
}

console.log(`\n📝 log: ${archivoLog}`)
console.log(`   seguilo con:  tail -f ${archivoLog}\n`)

const dht = new DHT()

// Volcado periódico de las estadísticas internas del DHT.
// punches.{consistent,random,open} = intentos de perforación por tipo
// relaying.{attempts,successes,aborts} = uso de relays
function stats(etiqueta) {
  const s = dht.stats
  log(
    `STATS ${etiqueta} | punches consistent=${s.punches.consistent} random=${s.punches.random} open=${s.punches.open}` +
      ` | relaying attempts=${s.relaying.attempts} successes=${s.relaying.successes} aborts=${s.relaying.aborts}`,
    true
  )
}

main().catch((err) => {
  log(`ERROR FATAL: ${err.stack || err.message}`)
  process.exit(1)
})

async function main() {
  log('inicializando DHT…')
  await dht.ready()

  const randomized = dht.randomized

  log(`DHT listo | host=${dht.host} port=${dht.port} firewalled=${dht.firewalled} randomized=${randomized}`)
  log(`bootstrapped=${dht.bootstrapped} ephemeral=${dht.ephemeral}`, true)
  stats('inicial')

  console.log('')
  console.log('  ── TU RED ──────────────────────────────────────────')
  console.log(`  IP pública : ${dht.host}`)
  console.log(`  Puerto     : ${dht.port}`)
  console.log(`  NAT        : ${randomized ? '⚠️  ALEATORIO (simétrico / CGNAT)' : '✅ CONSISTENTE'}`)
  console.log('  ────────────────────────────────────────────────────')
  console.log('')

  if (modo === 'nat') {
    await dht.destroy()
    process.exit(0)
  }

  // Muestreo continuo mientras el proceso vive.
  const muestreo = setInterval(() => stats('periodico'), 5000)

  // ------------------------------------------------------------- SERVIDOR
  if (modo === 'servidor') {
    if (!arg) {
      console.log('falta la frase: node conectar.js servidor mi-frase')
      process.exit(1)
    }

    // Derivar de una frase hace que la clave sea siempre la misma entre reinicios.
    const seed = crypto.data(b4a.from(`test-msg:seed:${arg}`))
    const keyPair = DHT.keyPair(seed)
    const clave = b4a.toString(keyPair.publicKey, 'hex')

    log(`frase="${arg}" -> clave=${clave}`, true)

    const server = dht.createServer((conn) => {
      const peer = b4a.toString(conn.remotePublicKey, 'hex')
      log(`✅ CONEXION ENTRANTE de ${peer.slice(0, 12)}…`)
      log(`   remota: ${conn.rawStream?.remoteHost}:${conn.rawStream?.remotePort}`, true)
      stats('al-conectar')
      console.log('   Escribí algo + Enter para responderle.\n')

      conn.on('error', (e) => log(`error de conexión: ${e.code || ''} ${e.message}`))
      conn.on('data', (d) => log(`📩 ${peer.slice(0, 8)}: ${d.toString().trim()}`))
      conn.once('close', () => log('conexión cerrada'))

      process.stdin.on('data', (d) => {
        const t = d.toString().trim()
        if (t) {
          conn.write(t)
          log(`enviado: ${t}`, true)
        }
      })

      conn.write('hola, soy el servidor')
    })

    await server.listen(keyPair)

    console.log('══════════════════════════════════════════════════════════════════')
    console.log('  ESCUCHANDO. Pasale ESTA clave al otro:')
    console.log('')
    console.log(`  ${clave}`)
    console.log('')
    console.log('══════════════════════════════════════════════════════════════════\n')
    log('esperando conexión…')
    log(`server.listen OK | firewalled=${dht.firewalled}`, true)

    process.once('SIGINT', () => {
      clearInterval(muestreo)
      stats('final')
      console.log('\ncerrando (des-anunciando la clave)…')
      server.close().then(() => dht.destroy()).then(() => process.exit(0))
      setTimeout(() => process.exit(0), 3000)
    })
  }

  // -------------------------------------------------------------- CLIENTE
  if (modo === 'cliente') {
    if (!arg || arg.length !== 64) {
      console.log('falta la clave del servidor (64 caracteres hex)')
      process.exit(1)
    }

    const publicKey = b4a.from(arg, 'hex')
    log(`conectando a ${arg.slice(0, 12)}…`)
    log(`clave completa: ${arg}`, true)

    let conectado = false
    const conn = dht.connect(publicKey)

    conn.once('open', () => {
      conectado = true
      log('✅ CONECTADO al servidor')
      log(`   remota: ${conn.rawStream?.remoteHost}:${conn.rawStream?.remotePort}`, true)
      stats('al-conectar')
      console.log('   Escribí algo + Enter para mandarle un mensaje.\n')
      conn.write('hola, soy el cliente')
    })

    conn.on('data', (d) => log(`📩 servidor: ${d.toString().trim()}`))

    conn.on('error', (e) => {
      log(`❌ error: ${e.code || ''} ${e.message}`)
      stats('al-fallar')

      if (e.code === 'HOLEPUNCH_ABORTED' || e.code === 'CANNOT_HOLEPUNCH') {
        console.log('')
        console.log('   ── QUÉ SIGNIFICA ─────────────────────────────────────────')
        console.log('   El servidor SE ENCONTRÓ. Falló abrir el túnel directo.')
        console.log(`   Tu NAT: ${randomized ? 'ALEATORIO ⚠️' : 'consistente ✅'}`)
        console.log('')
        console.log(`   Mandá este log:  ${archivoLog}`)
        console.log('   ──────────────────────────────────────────────────────────')
      }
    })

    conn.once('close', () => log('conexión cerrada'))

    process.stdin.on('data', (d) => {
      const t = d.toString().trim()
      if (t) {
        conn.write(t)
        log(`enviado: ${t}`, true)
      }
    })

    setTimeout(() => {
      if (!conectado) {
        log('⏱️  30s sin conectar')
        stats('30s')
      }
    }, 30000)

    process.once('SIGINT', () => {
      clearInterval(muestreo)
      stats('final')
      console.log('\ncerrando…')
      dht.destroy().then(() => process.exit(0))
      setTimeout(() => process.exit(0), 3000)
    })
  }
}
