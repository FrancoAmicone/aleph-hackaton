// GRAN TRUCO ARGENTINO — a Truco game for the terminal, delivered over Pear.
//
// This file is only the wiring: `lib/pear-cli.js` owns the pear-runtime, the
// OTA updater and teardown, and `lib/ui/app.js` is the tea model that actually
// plays Truco. Updater progress is pushed into the model as Msgs so the alt
// screen is never corrupted by a stray console.log mid-hand.
const createPearCli = require('./lib/pear-cli')
const fs = require('bare-fs')
const App = require('./lib/ui/app')
const pkg = require('./package.json')

// Assigned once the Program starts; the updater handlers below fire later.
let send = () => {}

// Registro a archivo. La TUI se adueña de la pantalla completa, así que un
// console.log acá no se ve nunca: o corrompe el render, o se pierde. Para
// poder mirar la red mientras se juega, `--log <archivo>` vuelca cada mensaje
// que cruza el IPC y se sigue desde otra terminal con `tail -f`.
// Se asigna abajo, apenas paparam parsea los flags.
let archivoLog = null
const t0 = Date.now()

function registrar(dir, texto) {
  if (!archivoLog) return
  const t = ((Date.now() - t0) / 1000).toFixed(1).padStart(6)
  try {
    fs.appendFileSync(archivoLog, `[+${t}s] ${dir} ${texto}\n`)
  } catch {
    // disco lleno o ruta inválida: el juego sigue, el log no es crítico
  }
}

const status = (text, color) => {
  registrar('++', text)
  send({ type: 'update-status', text, color })
}

const cli = createPearCli(pkg, {
  flags: [
    ['--duelo', 'jugar mano a mano contra una sola IA'],
    ['--nivel <nivel>', 'rivales: facil | normal | duro'],
    ['--sin-flor', 'jugar sin flor'],
    ['--jugar', 'saltear el menú y repartir de una'],
    ['--sala <nombre>', 'sala de juego online (default: general)'],
    ['--nombre <nombre>', 'tu nombre en la mesa'],
    ['--log <archivo>', 'escribir el registro de red a un archivo (tail -f)']
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
  },

  // Cerrar la sala antes de bajar el runtime: un swarm que queda vivo deja
  // registros colgados en el DHT y degrada las conexiones siguientes.
  onTeardown: async () => {
    if (room) await room.destroy()
  }
})

// La red del juego, en este mismo proceso.
//
// Antes esto vivía en `workers/main.js`, spawneado con `PearRuntime.run()`.
// Andaba desde el código fuente y NO andaba en el binario instalado, en
// silencio: `bare-sidecar` hace `spawn(bare, [entry])` y ese proceso resuelve
// la ruta contra el cwd, pero un standalone no tiene ningún `workers/main.js`
// en disco. Y `bare-pack` tampoco lo empaquetaba, porque escanea `require`s
// estáticos y `'./workers/main.js'` es un string que sólo existe en runtime.
// Resultado: el `join` salía hacia un pipe muerto y la sala nunca se abría.
//
// Con un `require` normal bare-pack sí lo ve, y room.js viaja adentro del
// binario. De paso desaparecen un proceso, un spawn y el framing del IPC.
const { Room } = require('./lib/net/room')

let room = null

archivoLog = cli.flags.log || null

if (archivoLog) {
  try {
    fs.writeFileSync(archivoLog, `=== ${pkg.name} v${pkg.version} — ${new Date().toISOString()} ===\n`)
  } catch {}
}

// Lo que sale de la sala hacia el modelo.
const emitirRed = (evento) => {
  registrar('<<', JSON.stringify(evento))
  send({ type: 'net', evento })
}

// Lo que el modelo le pide a la red: join, action, start, leave.
const enviarRed = async (msg) => {
  registrar('>>', JSON.stringify(msg))
  try {
    switch (msg.t) {
      case 'join':
        if (room) await room.destroy()
        room = new Room({ sala: msg.sala, nombre: msg.nombre, onEvent: emitirRed })
        await room.join({ anfitrion: !!msg.anfitrion })
        break

      case 'action':
        if (room) room.enviarAccion(msg.action)
        break

      case 'start':
        if (room) room.enviarInicio()
        break

      case 'leave':
        if (room) await room.destroy()
        room = null
        emitirRed({ t: 'estado', estado: 'fuera' })
        break
    }
  } catch (err) {
    // Que un fallo de red sea VISIBLE. La versión anterior se lo tragaba y
    // parecía que el juego andaba: nos costó una prueba entera con Gino.
    registrar('!!', err.stack || err.message)
    emitirRed({ t: 'error', mensaje: err.message })
  }
}

cli.start(({ flags, send: sendMsg }) => {
  send = sendMsg
  return new App({ version: pkg.version, flags, net: enviarRed })
})
