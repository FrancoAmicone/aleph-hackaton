# Quickstart — hello-pear-bare

Fuente: https://docs.pears.com/getting-started/from-a-template/start-from-hello-pear-bare/
Repo: https://github.com/holepunchto/hello-pear-bare

## Instalar la Pear CLI

```bash
# macOS / Linux
curl https://install.pears.com/pear.sh | sh
# Windows
irm https://install.pears.com/pear.ps1 | iex
```

## Arranque

```bash
git clone https://github.com/holepunchto/hello-pear-bare
cd hello-pear-bare
npm install
```

Generar el link de upgrade:

```bash
pear touch
# -> pear://qxenz5wmspmryjc13m9yzsqj1conqotn8fb4ocbufwtz9mtbqq5o
```

Setearlo en `package.json`:

```json
"upgrade": "pear://qxenz5wmspmryjc13m9yzsqj1conqotn8fb4ocbufwtz9mtbqq5o"
```

Correr:

```bash
npm start                 # dev, updates deshabilitados
npm start -- --updates    # con el updater activo
```

## Estructura del template

| Path | Qué hace | ¿Se edita? |
|---|---|---|
| `bin.mjs` | Parsea flags de CLI, resuelve el storage path, construye la App, loguea eventos del updater | Sí |
| `app.js` | Spawnea el worker de Bare vía `PearRuntime.run`, envuelve el IPC en `FramedStream`, convierte mensajes en eventos | A veces |
| `workers/main.js` | El worker de Bare que tiene el código P2P y el updater de `pear-runtime` | Sí |
| `package.json` | Metadata, scripts, upgrade link, targets de build | Sí |
| `scripts/make.js` | Detecta OS/arch y corre el target de build correspondiente | Casi nunca |
| `test/index.js` | Entry de tests (usa `brittle`) | Sí |

**Acá es donde va la lógica del juego: `workers/main.js`** (y los flags en `bin.mjs`).

## Arquitectura en 3 capas (branch `main`)

1. `bin.mjs` — entry. Parsea con `paparam`: `--version`, `--storage`, `--no-updates`.
2. `app.js` — host. Maneja el ciclo de vida del worker y los eventos del updater.
3. `workers/main.js` — worker de Bare. Contiene la lógica P2P.

### bin.mjs — definición del comando

```javascript
const cmd = command(
  appName,
  summary(pkg.description),
  flag('--version|-v', 'Print the current version'),
  flag('--storage <dir>', 'custom storage directory'),
  flag('--no-updates', 'disable OTA updates for this run')
)
```

### bin.mjs — resolución de storage

```javascript
const updates = cmd.flags.updates
const storage = cmd.flags.storage || (isDev ? null : path.join(persistent(), appName))
const dir = storage || path.join(os.tmpdir(), 'pear', appName)

console.log(`Updates: ${updates === false ? 'disabled' : 'enabled'}`)

const app = new App({
  dir,
  app: isDev ? null : os.execPath(),
  updates,
  version: pkg.version,
  upgrade: pkg.upgrade,
  name: isWindows ? appName + '.exe' : appName
})
```

### app.js — spawn del worker

```javascript
_open() {
  this.IPC = PearRuntime.run(require.resolve('./workers/main.js'), [
    String(this.updates),
    this.version,
    this.upgrade,
    this.name,
    this.dir,
    this.app || ''
  ])
  this.pipe = new FramedStream(this.IPC)

  this.pipe.on('data', (data) => this._onmessage(data))
}
```

### Eventos del updater y señales

```javascript
app.on('message', (message) => console.log(message))
app.on('updating', () => console.log('[updater] getting new update'))
app.on('updating-delta', (delta) => console.log('[updater]', delta))
app.on('updated', () => console.log('[updater] update complete... applying'))
app.on('update-applied', () =>
  console.log('[updater] applied update, restart to run latest version')
)
app.on('error', (err) => console.error('[app:error]', err))

process.on('SIGHUP', () => app.exit(129))
process.on('SIGINT', () => app.exit(130))
process.on('SIGQUIT', () => app.exit(131))
process.on('SIGTERM', () => app.exit(143))
```

> Estos logs son **oro para el video demo**: muestran el OTA aplicándose en vivo.

## Variantes

### `main` — recomendada para servicios long-lived
`pear-runtime` adentro de un worker thread de Bare.
```bash
git clone https://github.com/holepunchto/hello-pear-bare
```

### `variant/single-thread`
`pear-runtime` construido directo en el proceso principal de Bare — sin worker, sin framing de IPC.
Para programas long-lived cuya lógica P2P no necesita thread aparte.

```bash
git clone -b variant/single-thread https://github.com/holepunchto/hello-pear-bare
```

```javascript
_open() {
  const store = new Corestore(path.join(this.dir, 'pear-runtime', 'corestore'))
  const swarm = new Hyperswarm()

  this.store = store
  this.swarm = swarm

  const pear = new PearRuntime({
    dir: this.dir,
    app: this.app,
    updates: this.updates,
    version: this.version,
    upgrade: this.upgrade,
    name: this.name,
    store,
    swarm
  })

  this.pear = pear
}
```

### `variant/daemon`
`pear-runtime` corre en un proceso `bare-daemon` detached que el comando en foreground spawnea
y retorna inmediatamente. Para invocaciones cortas de CLI (tipo `git`) que no deben bloquear
esperando el update check.

```bash
git clone -b variant/daemon https://github.com/holepunchto/hello-pear-bare
```

```javascript
// bin.mjs
if (updates !== false) {
  try {
    App.spawnUpdater(dir, os.execPath(), isDev ? Bare.argv[1] : null, wait)
  } catch (err) {
    console.error('[app:error]', err)
    Bare.exit(1)
  }
}
```

```javascript
// app.js
static spawnUpdater(dir, app, entrypoint, updateWindow) {
  const args = entrypoint === null ? [] : [entrypoint]
  args.push('--updater', '--storage', dir)
  if (updateWindow !== undefined) {
    args.push('--update-window', String(updateWindow))
  }
  return daemon.spawn(app, args)
}
```

Comportamiento del daemon:
- El comando en foreground retorna al toque, no bloquea.
- Toma un lock `updater.lock` (una sola instancia).
- Loguea a `<storage>/updates.log` en vez de stdout.
- `--update-window` default: 30 segundos (tiempo para arrancar la descarga). Una vez que arrancó,
  espera indefinidamente hasta terminar.

```bash
npm start -- --updates --update-window 60000
```

## Scripts de npm

| Script | Qué hace |
|---|---|
| `npm start` | Corre la CLI en dev (`--no-updates` por default) |
| `npm test` | Tests con `brittle-bare` |
| `npm run lint` | Lint + formato |
| `npm run format` | Aplica prettier |
| `npm run make` | Detecta OS/arch y buildea |
| `npm run make:darwin-arm64` | Build específico (también `darwin-x64`, `linux-arm64`, `linux-x64`, `win32-arm64`, `win32-x64`) |

Output: `out/<platform>-<arch>`.

> **Importante:** cada binario se buildea en un host que matchee la plataforma.
> Con 4 personas: repartir las máquinas para cubrir darwin-arm64 / linux-x64 / win32-x64.

## Antes del primer release: configurar package.json

```json
{
  "name": "your-app-name",
  "productName": "Your App Display Name",
  "description": "What it does",
  "author": "Your Name",
  "license": "MIT",
  "upgrade": "pear://your-generated-link"
}
```

> `productName || name` se usa **tanto para el nombre del binario como para el directorio de storage
> persistente** — hay que definirlos **antes del primer release**, cambiarlos después rompe el storage.

## Ejemplo: agregar un flag

```javascript
const cmd = command(
  appName,
  summary(pkg.description),
  flag('--version|-v', 'Print the current version'),
  flag('--storage <dir>', 'custom storage directory'),
  flag('--no-updates', 'disable OTA updates for this run'),
  flag('--name <name>', 'who to greet on startup')
)
```

```javascript
if (cmd.flags.name) console.log(`Hello, ${cmd.flags.name}!`)
```

```bash
npm start -- --name YourName
```

## Instalar OTA

Con el release seedeando:

```bash
pear install pear://<key>
```

Los releases siguientes se distribuyen automáticamente por el swarm — no hace falta reinstalar.
