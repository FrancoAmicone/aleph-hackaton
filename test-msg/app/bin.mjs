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
function print(...args) {
  const line = args
    .map((a) => (typeof a === 'string' ? a : a instanceof Error ? a.stack : JSON.stringify(a)))
    .join(' ')

  console.log(line)
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

process.on('SIGHUP', () => app.exit(129))
process.on('SIGINT', () => app.exit(130))
process.on('SIGQUIT', () => app.exit(131))
process.on('SIGTERM', () => app.exit(143))

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
