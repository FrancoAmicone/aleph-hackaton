// Prueba de lockstep: dos peers juegan una partida ENTERA por red y tienen que
// terminar con estados idénticos, habiéndose mandado sólo acciones.
//
// Es la verificación que decide si el modelo de sincronización sirve. Si acá
// diverge, diverge en el juego real.
//
//   node scripts/lockstep-test.js <nombre> <sala> [anfitrion]
//
// Los dos peers juegan solos: cuando les toca, eligen una acción legal al azar
// (con su propio azar, no el del mazo) y la mandan.

const { Room } = require('../lib/net/room')
const { Game } = require('../lib/uno/engine')
const { fromSeed } = require('../lib/rng')

const nombre = process.argv[2] || 'peer'
const sala = process.argv[3] || 'lockstep'
const anfitrion = process.argv[4] === 'anfitrion'

const t0 = Date.now()
const log = (m) => console.log(`[${nombre} +${((Date.now() - t0) / 1000).toFixed(1)}s] ${m}`)

let game = null
let me = 0
let asientos = null
let semilla = null
let jugadas = 0

// Huella del estado: si dos peers tienen la misma, están sincronizados.
function huella(g) {
  return JSON.stringify({
    manos: g.hands.map((h) => h.length),
    top: g.top,
    turno: g.turn,
    fase: g.phase,
    color: g.activeColor,
    mazo: g.draw.length
  })
}

function arrancar() {
  const roster = asientos.map((a) => ({ name: a.nombre, isAI: false, level: 'normal' }))
  game = new Game({ players: roster, rng: fromSeed(semilla) })
  log(`PARTIDA ARRANCADA — soy asiento ${me} de ${roster.length}`)
  log(`  manos iniciales: ${JSON.stringify(game.hands.map((h) => h.length))}`)
  log(`  huella: ${huella(game)}`)
  setTimeout(turno, 300)
}

// Si es mi turno, juego y mando la acción.
function turno() {
  if (!game || game.isOver()) return
  if (game.currentActor() !== me) return

  const legal = game.legalActions(me)
  if (!legal.length) return

  const accion = legal[Math.floor(Math.random() * legal.length)]
  game.apply(accion)
  jugadas++
  room.enviarAccion(accion)

  if (game.isOver()) {
    log(`TERMINÓ — gana ${game.players[game.winner()].name}`)
    log(`  huella final: ${huella(game)}`)
    return
  }
  setTimeout(turno, 200)
}

const room = new Room({
  sala,
  nombre,
  onEvent: (e) => {
    switch (e.t) {
      case 'peers':
        log(`peers = ${e.lista.filter((p) => p.nombre).map((p) => p.nombre).join(', ') || '(nadie)'}`)
        break

      case 'seats':
        me = e.miAsiento
        asientos = e.asientos
        semilla = e.semilla
        log(`asientos: ${asientos.map((a) => `${a.seat}:${a.nombre}`).join(' ')} | yo=${me}`)
        break

      case 'start':
        arrancar()
        break

      case 'action':
        if (!game) return
        game.apply(e.action)
        jugadas++
        if (game.isOver()) {
          log(`TERMINÓ — gana ${game.players[game.winner()].name}`)
          log(`  huella final: ${huella(game)}`)
          return
        }
        setTimeout(turno, 200)
        break

      case 'peer-lost':
        log(`PERDIDO ${e.nombre}`)
        break
    }
  }
})

room.join({ anfitrion }).then(() => log('en la sala'))

// El anfitrión da el arranque cuando ya hay alguien más.
if (anfitrion) {
  setTimeout(() => {
    if (asientos && asientos.length >= 2) {
      log('doy el arranque')
      room.enviarInicio()
    } else {
      log('nadie se sumó, no arranco')
    }
  }, 15000)
}

setTimeout(async () => {
  log(`FIN — ${jugadas} acciones aplicadas`)
  if (game) log(`  HUELLA: ${huella(game)}`)
  await room.destroy()
  process.exit(0)
}, Number(process.argv[5] || 60000))
