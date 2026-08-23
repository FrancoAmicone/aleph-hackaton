const { command, flag } = require('paparam')
const storageAPI = require('bare-storage')
const os = require('bare-os')
const path = require('bare-path')
const Corestore = require('corestore')
const Hyperswarm = require('hyperswarm')
const PearRuntime = require('pear-runtime')
const { isWindows } = require('which-runtime')
const { Program } = require('./tea')

// Wires up pear-runtime, the OTA updater, swarm replication and teardown, then
// drives a tea TUI as the app. A CLI only has to describe its own flags, decide
// what happens on update, and build its model.
//
// Everything the wrapper would normally print — version banner, updater
// progress, worker IPC — is routed into the model as Msgs instead of stdout, so
// it never corrupts the alt-screen:
//   { type: 'log',    level, line }                wrapper/updater output
//   { type: 'worker', stream, script, data|code }  a spawned worker's streams
//
// `handlers.onUpdate` is REQUIRED — applying an update and how/when to restart
// is a product decision every CLI must make. Everything else is optional.
//
//   const cli = createPearCli(pkg, {
//     flags: [['--message <text>', 'description']],
//     handlers: { onUpdate: async ({ updater }) => { await updater.applyUpdate() } }
//   })
//   cli.start(({ run, flags }) => new App({ run, flags }))
function createPearCli(pkg, opts = {}) {
  const handlers = opts.handlers || {}
  if (typeof handlers.onUpdate !== 'function') {
    throw new Error(
      'createPearCli: handlers.onUpdate is required — decide what happens when an update is ready ' +
        '(e.g. async ({ updater }) => { await updater.applyUpdate() })'
    )
  }

  const appName = pkg.productName || pkg.name
  const userFlags = opts.flags || []

  // The running Program; `send` forwards a Msg into it once started.
  let program = null
  const send = (msg) => {
    if (program) program.send(msg)
  }

  // Buffered logger. Wrapper output collects here and, once the Program is
  // running, flushes into the model as { type: 'log' } Msgs — so nothing the
  // wrapper says ever lands on the raw screen.
  const logBuffer = []
  let logSink = null
  function emit(level, parts) {
    const line = parts.map(stringify).join(' ')
    if (logSink) logSink(level, line)
    else logBuffer.push([level, line])
  }
  const log = (...args) => emit('info', args)
  const logError = (...args) => emit('error', args)

  const cmd = command(
    appName,
    flag('--version|-v', 'print the version and exit'),
    flag('--storage <dir>', 'custom storage directory for pear-runtime'),
    flag('--no-updates', 'disable OTA updates for this run'),
    ...userFlags.map(([usage, description]) => flag(usage, description))
  )

  // In development argv is ['bare', 'bin.js', ...flags], but a standalone build
  // is invoked directly, so argv is ['/path/to/truco', ...flags]. Slicing a
  // fixed 2 swallows the first flag in a built binary — which silently disables
  // every documented flag for anyone running an installed copy.
  const isDev = path.basename(Bare.argv[0] || '').startsWith('bare')

  cmd.parse(global.Bare.argv.slice(isDev ? 2 : 1))

  // --version has to answer BEFORE any of the peer-to-peer machinery exists.
  // The app is a TUI, so the only other way to read the running version is to
  // open it and read the log on screen — useless for scripting, and useless for
  // confirming an OTA update landed. Printing straight to stdout (not through
  // the buffered logger) keeps it pipeable: `the-great-pear --version`.
  //
  // Exiting here also avoids constructing the Corestore and the Hyperswarm just
  // to tear them down again.
  if (cmd.flags.version) {
    console.log(`${appName} v${pkg.version}`)
    global.Bare.exit(0)
  }

  const flags = cmd.flags
  const updates = flags.updates
  const storage = flags.storage || (isDev ? null : path.join(storageAPI.persistent(), appName))
  const dir = storage || path.join(os.tmpdir(), 'pear', appName)
  const store = new Corestore(path.join(dir, 'pear-runtime', 'corestore'))
  const swarm = new Hyperswarm()

  log(`${appName} v${pkg.version}`)
  log(`Updates: ${updates === false ? 'disabled' : 'enabled'}`)

  const runningAppPath =
    !isDev && global.Bare && Array.isArray(Bare.argv) && typeof Bare.argv[0] === 'string'
      ? path.resolve(Bare.argv[0])
      : null

  // On macOS `pear install` lays the app down as a bundle, so the executable
  // runs from inside <name>.app/Contents/MacOS/. When that is how we were
  // started, the updater must look for the bundle in the drive and swap the
  // bundle directory — not the bare executable inside it. Run the plain binary
  // directly and it keeps updating as a plain binary.
  const BUNDLE_SUFFIX = `.app${path.sep}Contents${path.sep}MacOS${path.sep}`
  const bundleAt = runningAppPath ? runningAppPath.indexOf(BUNDLE_SUFFIX) : -1
  const inBundle = bundleAt !== -1

  const bundleName = inBundle
    ? `${appName}.app`
    : isWindows && !appName.endsWith('.exe')
      ? `${appName}.exe`
      : appName

  const appTarget = inBundle ? runningAppPath.slice(0, bundleAt + 4) : runningAppPath

  const pear = new PearRuntime({
    dir,
    app: appTarget,
    updates,
    version: pkg.version,
    upgrade: pkg.upgrade,
    name: bundleName,
    store,
    swarm,
    // Sin esto pear-runtime usa su default de 3600000 ms: hasta UNA HORA de espera
    // aleatoria antes de siquiera buscar una versión nueva. Sirve para no golpear
    // el swarm con miles de clientes a la vez, pero hace imposible demostrar el OTA.
    //
    // Ojo: la copia instalada corre SU PROPIO código, así que bajarlo en la v2 no
    // sirve — la que espera es la v1. Tiene que estar desde el primer release.
    delay: 5000
  })

  const ctx = { pear, swarm, store, appName, dir }

  if (updates !== false) {
    const updater = pear.updater
    const updaterCtx = { ...ctx, updater }

    updater.on('updating', () => {
      if (handlers.onUpdating) handlers.onUpdating(updaterCtx)
      else log('[updater] getting new update')
    })

    updater.on('updating-delta', (delta) => {
      if (handlers.onUpdatingDelta) handlers.onUpdatingDelta(delta, updaterCtx)
      else log('[updater]', delta)
    })

    updater.on('updated', () => handlers.onUpdate(updaterCtx))

    // Replication is load-bearing for the updater itself, so it always runs.
    // onConnection augments it rather than replacing it.
    //
    // A connection can still land after the store has started closing — during
    // teardown, or when a second copy of the app loses the race for the same
    // storage directory. Corestore throws "Corestore is closed" from
    // replicate() in that window, and unguarded it surfaces as an uncaught
    // rejection that takes the whole game down. Drop the late connection.
    swarm.on('connection', (connection) => {
      try {
        store.replicate(connection)
      } catch (err) {
        connection.destroy()
        if (handlers.onError) handlers.onError(err, ctx)
        return
      }
      if (handlers.onConnection) handlers.onConnection(connection, ctx)
    })

    swarm.join(updater.drive.core.discoveryKey, {
      client: true,
      server: false
    })
  }

  pear.on('error', (err) => {
    if (handlers.onError) handlers.onError(err, ctx)
    else logError('[pear-runtime:error]', err)
  })

  const workers = []

  // run(script, { onData, onStdout, onStderr, onExit }) — by default each stream
  // is forwarded into the model as a { type: 'worker' } Msg; pass a handler to
  // intercept that stream instead.
  function run(script, runOpts = {}) {
    const worker = PearRuntime.run(script)
    workers.push(worker)

    worker.stdout.on('data', (data) => {
      if (runOpts.onStdout) runOpts.onStdout(data)
      else send({ type: 'worker', stream: 'stdout', script, data })
    })
    worker.stderr.on('data', (data) => {
      if (runOpts.onStderr) runOpts.onStderr(data)
      else send({ type: 'worker', stream: 'stderr', script, data })
    })
    worker.on('data', (data) => {
      if (runOpts.onData) runOpts.onData(data)
      else send({ type: 'worker', stream: 'ipc', script, data })
    })
    worker.on('exit', (code) => {
      if (runOpts.onExit) runOpts.onExit(code)
      else send({ type: 'worker', stream: 'exit', script, code })
    })

    return worker
  }

  let tearingDown = false
  async function teardown(code = 0) {
    if (tearingDown) return
    tearingDown = true
    for (const worker of workers) {
      try {
        worker.destroy()
      } catch {}
    }
    // Close the runtime gracefully, but never let a slow/hung close trap the
    // user at a dead prompt: with updates enabled, pear.close() tears down the
    // swarm + updater + store, any of which can stall on live connections. Race
    // it against a short grace period, then exit no matter what so shell control
    // returns promptly.
    try {
      await Promise.race([
        Promise.resolve(pear?.close()).catch(() => {}),
        new Promise((resolve) => setTimeout(resolve, 1000))
      ])
    } catch {}
    global.Bare.exit(code)
  }

  // start(build) — build the model and run it as the UI.
  //   build({ run, send, flags, ...ctx }) => model
  // The Program owns signal handling, so the terminal is always restored before
  // we close the pear runtime and exit.
  function start(build, programOpts = {}) {
    const model = build({ run, send, flags, ...ctx })

    program = new Program(model, programOpts)
    logSink = (level, line) => send({ type: 'log', level, line })
    for (const [level, line] of logBuffer.splice(0)) logSink(level, line)

    const done = program.run().then(
      () => teardown(0),
      () => teardown(1)
    )
    return { program, send, done }
  }

  return { start, run, teardown, flags, ...ctx }
}

function stringify(value) {
  if (value instanceof Error) return value.stack || value.message
  if (typeof value === 'string') return value
  try {
    return typeof value === 'object' ? JSON.stringify(value) : String(value)
  } catch {
    return String(value)
  }
}

module.exports = createPearCli
