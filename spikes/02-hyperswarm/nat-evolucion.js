// ¿El diagnóstico de NAT es confiable justo después de dht.ready()?
//
// `randomized` viene de un NatSampler que acumula muestras de la red:
//   get randomized() { return this._nat.host !== null && this._nat.port === 0 }
//
// Si al momento de leerlo todavía no juntó muestras, host es null y randomized
// da false — indistinguible de "NAT consistente". Este script mide cómo
// evoluciona en el tiempo.
//
//   node nat-evolucion.js

const DHT = require('hyperdht')

const dht = new DHT()
const t0 = Date.now()
const t = () => `+${((Date.now() - t0) / 1000).toFixed(1)}s`

function snapshot(etiqueta) {
  const nat = dht._nat
  console.log(
    `[${t().padStart(7)}] ${etiqueta.padEnd(14)} ` +
      `host=${String(dht.host).padEnd(15)} port=${String(dht.port).padEnd(6)} ` +
      `randomized=${String(dht.randomized).padEnd(5)} firewalled=${String(dht.firewalled).padEnd(5)} ` +
      `muestras=${nat?.size ?? '?'}`
  )
}

async function main() {
  snapshot('antes-ready')
  await dht.ready()
  snapshot('justo-ready') // <- el momento en que conectar.js lo lee y lo congela

  let n = 0
  const iv = setInterval(() => {
    snapshot(`t+${++n * 3}s`)
    if (n >= 12) {
      clearInterval(iv)
      console.log('\n--- veredicto ---')
      console.log(`host final       : ${dht.host}`)
      console.log(`port final       : ${dht.port}`)
      console.log(`randomized final : ${dht.randomized}`)
      console.log(
        dht.randomized
          ? 'NAT ALEATORIO (simétrico/CGNAT) -> hole punching directo va a fallar seguido'
          : 'NAT consistente -> hole punching deberia funcionar'
      )
      dht.destroy().then(() => process.exit(0))
    }
  }, 3000)
}

main().catch((e) => {
  console.error('ERROR:', e.message)
  process.exit(1)
})
