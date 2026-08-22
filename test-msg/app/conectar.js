// Conexión directa por clave pública con HyperDHT.
// Basado en: https://docs.pears.com/how-to/connect-to-peers/connect-two-peers-by-key-with-hyperdht/
//
// A diferencia de Hyperswarm, acá NO hay topic, NO hay announce/lookup y NO hay
// anuncios fantasma de corridas viejas. El cliente va directo contra una clave.
// Es el test más limpio posible de "¿estas dos máquinas pueden abrir un túnel?".
//
//   Franco:  node conectar.js servidor mi-frase-secreta
//            -> imprime su clave pública, se la pasa a Roman
//
//   Roman:   node conectar.js cliente <clave-que-le-paso-franco>

const DHT = require('hyperdht')
const crypto = require('hypercore-crypto')
const b4a = require('b4a')

const modo = process.argv[2]
const arg = process.argv[3]

const t0 = Date.now()
const log = (m) => console.log(`[+${((Date.now() - t0) / 1000).toFixed(1)}s] ${m}`)

if (modo !== 'servidor' && modo !== 'cliente' && modo !== 'nat') {
  console.log('uso:')
  console.log('  node conectar.js nat                              (solo diagnóstico de red)')
  console.log('  node conectar.js servidor <frase-secreta>')
  console.log('  node conectar.js cliente  <clave-hex-del-servidor>')
  process.exit(1)
}

const dht = new DHT()

main().catch((err) => {
  console.error('error fatal:', err.message)
  process.exit(1)
})

async function main() {
// ESPERAR a que el DHT esté listo antes de hacer nada.
// Sin esto, connect() sale antes de que el nodo sepa su propia dirección y
// situación de NAT, y el holepunch aborta. Era un bug real de este script:
// Roman conectaba en +0.0s y su DHT recién estaba listo en +10.9s.
log('inicializando DHT…')
await dht.ready()

const randomized = dht.randomized
log(`DHT listo | host=${dht.host} port=${dht.port} firewalled=${dht.firewalled} randomized=${randomized}`)

console.log('')
console.log('  ── TU RED ──────────────────────────────────────────')
console.log(`  IP pública : ${dht.host}`)
console.log(`  Puerto     : ${dht.port}`)
console.log(`  NAT        : ${randomized ? '⚠️  ALEATORIO (simétrico / CGNAT)' : '✅ CONSISTENTE'}`)
if (randomized) {
  console.log('')
  console.log('  ⚠️  Tu NAT asigna un puerto distinto por cada destino.')
  console.log('     El hole punching NO puede funcionar desde esta red si el otro')
  console.log('     lado también está detrás de NAT. Típico de datos móviles/CGNAT.')
  console.log('     Probá desde un wifi hogareño.')
}
console.log('  ────────────────────────────────────────────────────')
console.log('')

if (modo === 'nat') {
  await dht.destroy()
  process.exit(0)
}

// ---------------------------------------------------------------- SERVIDOR
if (modo === 'servidor') {
  if (!arg) {
    console.log('falta la frase secreta: node conectar.js servidor mi-frase')
    process.exit(1)
  }

  // Derivar el keyPair de una frase hace que la clave sea SIEMPRE la misma.
  // Sin esto, DHT.keyPair() da una clave nueva en cada arranque y habría que
  // pasársela al otro cada vez.
  const seed = crypto.data(b4a.from(`test-msg:seed:${arg}`))
  const keyPair = DHT.keyPair(seed)
  const clave = b4a.toString(keyPair.publicKey, 'hex')

  const server = dht.createServer((conn) => {
    const peer = b4a.toString(conn.remotePublicKey, 'hex')
    log(`✅ CONEXION ENTRANTE de ${peer.slice(0, 12)}…`)
    console.log('   Escribí algo + Enter para responderle.\n')

    conn.on('error', (e) => log(`error de conexión: ${e.message}`))
    conn.on('data', (d) => console.log(`📩 ${peer.slice(0, 8)}: ${d.toString().trim()}`))
    conn.once('close', () => log('conexión cerrada'))

    process.stdin.on('data', (d) => {
      const t = d.toString().trim()
      if (t) conn.write(t)
    })

    conn.write('hola, soy el servidor')
  })

  server.listen(keyPair).then(() => {
    console.log('')
    console.log('══════════════════════════════════════════════════════════════════')
    console.log('  ESCUCHANDO. Pasale ESTA clave al otro:')
    console.log('')
    console.log(`  ${clave}`)
    console.log('')
    console.log('  El otro corre:')
    console.log(`  node conectar.js cliente ${clave}`)
    console.log('══════════════════════════════════════════════════════════════════')
    console.log('')
    log('esperando conexión…')
  })

  process.once('SIGINT', () => {
    console.log('\ncerrando (des-anunciando la clave)…')
    server.close().then(() => dht.destroy()).then(() => process.exit(0))
    setTimeout(() => process.exit(0), 3000)
  })
}

// ----------------------------------------------------------------- CLIENTE
if (modo === 'cliente') {
  if (!arg || arg.length !== 64) {
    console.log('falta la clave del servidor (64 caracteres hex)')
    process.exit(1)
  }

  const publicKey = b4a.from(arg, 'hex')
  log(`conectando a ${arg.slice(0, 12)}…`)

  let conectado = false
  const conn = dht.connect(publicKey)

  conn.once('open', () => {
    conectado = true
    log(`✅ CONECTADO al servidor`)
    console.log('   Escribí algo + Enter para mandarle un mensaje.\n')
    conn.write('hola, soy el cliente')
  })

  conn.on('data', (d) => console.log(`📩 servidor: ${d.toString().trim()}`))

  conn.on('error', (e) => {
    log(`❌ error: ${e.code || ''} ${e.message}`)
    console.log('')
    if (e.code === 'HOLEPUNCH_ABORTED' || e.code === 'CANNOT_HOLEPUNCH') {
      console.log('   ── QUÉ SIGNIFICA ─────────────────────────────────────────')
      console.log('   El servidor SE ENCONTRÓ (el descubrimiento funcionó).')
      console.log('   Lo que falló fue abrir el túnel directo entre las dos redes.')
      console.log('')
      console.log(`   Tu NAT es: ${randomized ? 'ALEATORIO ⚠️' : 'consistente ✅'}`)
      console.log('   Pedile al otro que corra:  npm run conectar -- nat')
      console.log('')
      console.log('   Si CUALQUIERA de los dos tiene NAT aleatorio, el hole punching')
      console.log('   directo no va a andar desde esa red. Probá los dos desde wifi')
      console.log('   hogareño (NO datos móviles / hotspot: usan CGNAT aleatorio).')
      console.log('   ──────────────────────────────────────────────────────────')
    } else {
      console.log('   Verificá que el servidor esté corriendo y la clave sea correcta.')
    }
  })

  conn.once('close', () => log('conexión cerrada'))

  process.stdin.on('data', (d) => {
    const t = d.toString().trim()
    if (t) conn.write(t)
  })

  setTimeout(() => {
    if (!conectado) {
      log('⏱️  30s sin conectar.')
      console.log('   Verificá que el servidor esté CORRIENDO en la otra máquina')
      console.log('   y que la clave sea exactamente la que imprimió.')
    }
  }, 30000)

  process.once('SIGINT', () => {
    console.log('\ncerrando…')
    dht.destroy().then(() => process.exit(0))
    setTimeout(() => process.exit(0), 3000)
  })
}
} // fin de main()
