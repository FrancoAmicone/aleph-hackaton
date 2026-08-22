// SPIKE 1 — input crudo DENTRO del template (App + worker de Bare + updater).
//
// Esto es lo que un juego real necesita: teclas en raw mode conviviendo con el
// pipeline del template, y una salida que cierre todo bien.
//
// HALLAZGO (ver README): salir de un long-lived en Bare tiene dos requisitos.
//   1. Cerrar la App — `app.exit(code)` (`Bare.exitCode = code; await close()`),
//      igual que hace bin.mjs en sus handlers de señal. Con el worker de
//      PearRuntime activo, `Bare.exit()` a secas se cuelga.
//   2. Soltar TODOS los handles propios (timers incluidos). Si queda un
//      setInterval vivo, el loop nunca se vacía y el proceso no termina nunca.
//
// Correr: ./node_modules/.bin/bare bin-spike.mjs --no-updates

import process from 'bare-process'
import os from 'bare-os'
import path from 'bare-path'
import b4a from 'b4a'
import { isWindows } from 'which-runtime'
import pkg from './package.json'
import App from './app.js'
import { startKeys } from './keys.js'

const appName = pkg.productName || pkg.name
const dir = path.join(os.tmpdir(), 'pear', appName)

const app = new App({
  dir,
  app: null,
  updates: false, // el spike no prueba OTA, sólo la convivencia con el worker
  version: pkg.version,
  upgrade: pkg.upgrade,
  name: isWindows ? appName + '.exe' : appName
})

app.on('message', (message) => console.log('[worker]', message))
app.on('error', (err) => console.error('[app:error]', err))

// --- teardown ------------------------------------------------------------
// Restaurar la terminal ANTES de cerrar la App: si el close se cuelga, el
// usuario igual recupera su shell.
let quitting = false

async function quit(reason, code = 0) {
  if (quitting) return
  quitting = true
  keys.restore()
  clearInterval(heartbeat) // sin esto el loop nunca se vacía y el proceso cuelga
  console.log(`\n[spike] saliendo por ${reason} — cerrando app...`)
  await app.exit(code)
  console.log('[spike] app cerrada. Terminal restaurada.')
}

const keys = startKeys({
  onKey(key) {
    const hex = b4a.toString(key.bytes, 'hex')
    console.log(`tecla: ${key.name.padEnd(10)} bytes: ${hex}`)

    if (key.name === 'ctrl-c') quit('Ctrl+C', 130)
    if (key.name === 'q') quit("tecla 'q'")
  },
  onError(err) {
    console.error('[spike] error en stdin:', err)
    Bare.exit(1)
  }
})

// En raw mode Ctrl+C llega como byte, no como SIGINT — pero estas señales
// siguen llegando por `kill`, así que se manejan igual.
process.on('SIGHUP', () => quit('SIGHUP', 129))
process.on('SIGTERM', () => quit('SIGTERM', 143))

console.log(`[spike] raw mode ON — terminal ${keys.stdout.columns}x${keys.stdout.rows}`)
console.log('[spike] probá: flechas, espacio, letras. Salir: q o Ctrl+C\n')

let ticks = 0
const heartbeat = setInterval(() => {
  console.log(`[heartbeat] ${++ticks}s — el loop sigue vivo`)
}, 1000)

try {
  await app.ready()
  console.log('[spike] app lista (worker corriendo)\n')
} catch (err) {
  console.error('[app:error]', err)
  keys.restore()
  await app.close().finally(() => Bare.exit(1))
}
