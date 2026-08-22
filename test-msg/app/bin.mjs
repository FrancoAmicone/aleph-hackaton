import { command, flag, summary } from 'paparam'
import { persistent } from 'bare-storage'
import process from 'bare-process'
import os from 'bare-os'
import fs from 'bare-fs'
import { isWindows } from 'which-runtime'
import path from 'bare-path'
import pkg from './package.json'
import App from './app.js'

const appName = pkg.productName || pkg.name
const isDev = path.basename(Bare.argv[0]) === (isWindows ? 'bare.exe' : 'bare')

const cmd = command(
  appName,
  summary(pkg.description),
  flag('--version|-v', 'Print the current version'),
  flag('--storage <dir>', 'custom storage directory'),
  flag('--no-updates', 'disable OTA updates for this run'),
  flag('--room|-r <name>', 'sala de chat a la que unirse (default: general)'),
  flag('--log <file>', 'además de la pantalla, escribir todo a este archivo')
)

cmd.parse(Bare.argv.slice(isDev ? 2 : 1))
if (cmd.flags.help) Bare.exit()
if (cmd.flags.version) {
  console.log(`${appName} v${pkg.version}`)
  Bare.exit()
}

const updates = cmd.flags.updates
const storage = cmd.flags.storage || (isDev ? null : path.join(persistent(), appName))
const dir = storage || path.join(os.tmpdir(), 'pear', appName)
const room = cmd.flags.room || 'general'

// --- logging ---------------------------------------------------------------
// Todo lo que se imprime pasa por acá. Con --log se duplica a un archivo con
// timestamp, para poder seguirlo con `tail -f` desde otra terminal.
const logFile = cmd.flags.log ? path.resolve(cmd.flags.log) : null

if (logFile) {
  fs.writeFileSync(logFile, `--- test-msg v${pkg.version} | sala ${room} | ${new Date().toISOString()} ---\n`)
}

// Escribe solo al archivo (la terminal ya hace eco de lo que tipeás).
function writeLog(line) {
  if (!logFile) return
  const ts = new Date().toISOString().slice(11, 23) // HH:MM:SS.mmm
  try {
    fs.appendFileSync(logFile, `[${ts}] ${line}\n`)
  } catch {
    // si el log falla no queremos tumbar la app
  }
}

// Pantalla + archivo.
//
// El console.log va en try/catch a propósito: si el proceso padre (npm, una tubería)
// muere antes que nosotros, stdout queda roto y escribir tira EPIPE. Sin esto, esa
// excepción rompe el handler de cierre y el proceso queda zombi en el swarm.
function print(...args) {
  const line = args
    .map((a) => (typeof a === 'string' ? a : a instanceof Error ? a.stack : JSON.stringify(a)))
    .join(' ')

  try {
    console.log(line)
  } catch {
    // stdout roto; seguimos, el archivo de log es la fuente de verdad
  }

  writeLog(line)
}

print(`Updates: ${updates === false ? 'disabled' : 'enabled'}`)
if (logFile) print(`Log: ${logFile}`)

const app = new App({
  dir,
  app: isDev ? null : os.execPath(),
  updates,
  version: pkg.version,
  upgrade: pkg.upgrade,
  name: isWindows ? appName + '.exe' : appName,
  room
})

app.on('message', (message) => print(message))
app.on('updating', () => print('[updater] getting new update'))
app.on('updating-delta', (delta) => print('[updater]', delta))
app.on('updated', () => print('[updater] update complete... applying'))
app.on('update-applied', () =>
  print('[updater] applied update, restart to run latest version')
)
app.on('error', (err) => print('[app:error]', err))

// Cierre ordenado.
//
// El template original hacía `app.exit(code)` y confiaba en que el event loop se vaciara
// solo. No alcanza: nuestro listener de stdin lo mantiene vivo, y el worker de Bare
// (con sus dos swarms) puede tardar o quedarse colgado destruyéndose. Resultado: Ctrl+C
// no cerraba nada y los procesos quedaban zombis en el swarm.
//
// Acá: cortamos stdin, damos un plazo acotado para el teardown limpio, y salimos sí o sí.
const FORCE_EXIT_MS = 3000
let closing = false

async function shutdown(code, signal) {
  if (closing) {
    // Segundo Ctrl+C: el usuario quiere salir YA.
    print(`\n[${signal}] forzando salida`)
    Bare.exit(code)
    return
  }
  closing = true

  print(`\n[${signal}] cerrando… (Ctrl+C de nuevo para forzar)`)

  try {
    process.stdin.pause()
  } catch {}

  // Red de seguridad: si el teardown se cuelga, salimos igual.
  const forced = setTimeout(() => {
    print('[shutdown] timeout, saliendo a la fuerza')
    Bare.exit(code)
  }, FORCE_EXIT_MS)

  try {
    await app.close()
  } catch (err) {
    print('[shutdown:error]', err)
  }

  clearTimeout(forced)
  Bare.exit(code)
}

process.on('SIGHUP', () => shutdown(129, 'SIGHUP'))
process.on('SIGINT', () => shutdown(130, 'SIGINT'))
process.on('SIGQUIT', () => shutdown(131, 'SIGQUIT'))
process.on('SIGTERM', () => shutdown(143, 'SIGTERM'))

try {
  await app.ready()

  print(`\n=== test-msg v${pkg.version} | sala: ${room} ===`)
  print('Escribí y Enter para mandar. Ctrl+C para salir.\n')

  // stdin vive en el proceso principal; el swarm vive en el worker.
  // Cada línea baja por IPC y el worker la broadcastea a los peers conectados.
  process.stdin.on('data', (data) => {
    const text = data.toString().trim()
    if (text.length > 0) {
      app.say(text)
      writeLog(`yo > ${text}`)
    }
  })
} catch (err) {
  print('[app:error]', err)
  await app.close().finally(() => Bare.exit(1))
}
