// GRAN TRUCO ARGENTINO — a Truco game for the terminal, delivered over Pear.
//
// This file is only the wiring: `lib/pear-cli.js` owns the pear-runtime, the
// OTA updater and teardown, and `lib/ui/app.js` is the tea model that actually
// plays Truco. Updater progress is pushed into the model as Msgs so the alt
// screen is never corrupted by a stray console.log mid-hand.
const createPearCli = require('./lib/pear-cli')
const FramedStream = require('framed-stream')
const b4a = require('b4a')
const App = require('./lib/ui/app')
const pkg = require('./package.json')

// Assigned once the Program starts; the updater handlers below fire later.
let send = () => {}

const status = (text, color) => send({ type: 'update-status', text, color })

const cli = createPearCli(pkg, {
  flags: [
    ['--duelo', 'jugar mano a mano contra una sola IA'],
    ['--nivel <nivel>', 'rivales: facil | normal | duro'],
    ['--sin-flor', 'jugar sin flor'],
    ['--jugar', 'saltear el menú y repartir de una'],
    ['--sala <nombre>', 'sala de juego online (default: general)'],
    ['--nombre <nombre>', 'tu nombre en la mesa']
  ],
  handlers: {
    onUpdating: () => status('⇣ bajando actualización…', 'brightyellow'),

    onUpdatingDelta: (delta) => {
      const blocks = delta && delta.blocks ? delta.blocks : null
      status(blocks ? `⇣ actualizando (${blocks} bloques)…` : '⇣ actualizando…', 'brightyellow')
    },

    // Required: a new version is on disk. Apply it and tell the player — the
    // running hand is left alone, the new binary takes over on restart.
    onUpdate: async ({ updater }) => {
      status('⇣ aplicando actualización…', 'brightyellow')
      try {
        await updater.applyUpdate()
        status('✓ nueva versión lista — reiniciá para jugarla', 'brightgreen')
      } catch (err) {
        status(`✗ falló la actualización: ${err.message}`, 'brightred')
      }
    },

    onError: (err) => status(`✗ ${err.message || err}`, 'brightred')
  }
})

// El worker de red: dueño del Hyperswarm del juego. La TUI no toca sockets.
//
// onData vacío a propósito: por defecto `run` reenvía cada chunk crudo al
// modelo como { type: 'worker' }, y acá lo que queremos son mensajes enteros.
// FramedStream sobre el mismo stream se encarga de rearmarlos.
const worker = cli.run('./workers/main.js', { onData: () => {} })
const net = new FramedStream(worker)

net.on('error', () => {})

net.on('data', (buf) => {
  let evento
  try {
    evento = JSON.parse(buf.toString())
  } catch {
    return
  }
  send({ type: 'net', evento })
})

// Lo que el modelo le manda al worker: join, action, start, leave.
const enviarRed = (msg) => {
  try {
    net.write(b4a.from(JSON.stringify(msg)))
  } catch {
    // el worker se está cerrando
  }
}

cli.start(({ flags, send: sendMsg }) => {
  send = sendMsg
  return new App({ version: pkg.version, flags, net: enviarRed })
})
