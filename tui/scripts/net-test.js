// Banco de pruebas de lib/net/room.js, sin TUI ni worker.
//   node _nettest.js <nombre> <sala> [anfitrion]
const { Room } = require('./lib/net/room')

const nombre = process.argv[2] || 'peer'
const sala = process.argv[3] || 'prueba'
const anfitrion = process.argv[4] === 'anfitrion'

const t0 = Date.now()
const log = (m) => console.log(`[${nombre} +${((Date.now() - t0) / 1000).toFixed(1)}s] ${m}`)

const room = new Room({
  sala,
  nombre,
  onEvent: (e) => {
    if (e.t === 'peers') log(`peers = ${e.lista.length} ${JSON.stringify(e.lista.map((p) => p.nombre))}`)
    else if (e.t === 'seats') log(`SEATS semilla=${e.semilla.slice(0, 8)}… asientos=${JSON.stringify(e.asientos.map((a) => `${a.seat}:${a.nombre}`))}`)
    else if (e.t === 'action') log(`ACCION RECIBIDA ${JSON.stringify(e.action)}`)
    else if (e.t === 'peer-lost') log(`PERDIDO ${e.nombre} (${e.motivo})`)
    else log(`${e.t} ${e.estado || ''}`)
  }
})

room.join({ anfitrion }).then(() => log('join() listo'))

// El anfitrión manda una acción de prueba a los 20s.
if (anfitrion) {
  setTimeout(() => {
    log('mando accion de prueba')
    room.enviarAccion({ type: 'play', seat: 0, card: { color: 'rojo', rank: 5 } })
  }, 20000)
}

const dur = Number(process.argv[5] || 45000)
setTimeout(async () => {
  log('cerrando…')
  await room.destroy()
  process.exit(0)
}, dur)
