// GRAN TRUCO ARGENTINO — a Truco game for the terminal, delivered over Pear.
//
// This file is only the wiring: `lib/pear-cli.js` owns the pear-runtime, the
// OTA updater and teardown, and `lib/ui/app.js` is the tea model that actually
// plays Truco. Updater progress is pushed into the model as Msgs so the alt
// screen is never corrupted by a stray console.log mid-hand.
const createPearCli = require('./lib/pear-cli')
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
    ['--jugar', 'saltear el menú y repartir de una']
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

cli.start(({ flags, send: sendMsg }) => {
  send = sendMsg
  return new App({ version: pkg.version, flags })
})
