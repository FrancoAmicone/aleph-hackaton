# La plantilla y nuestra estructura

Fuente: https://docs.pears.com/getting-started/from-a-template/start-from-hello-pear-bare/
Repo: https://github.com/holepunchto/hello-pear-bare

El track exige partir de alguna variante de `hello-pear-bare`. Este documento explica qué da
la plantilla, **cuál usamos** y cómo se mapea a los archivos del juego.

> Para correr, publicar u operar the-great-pear, el documento es `09-the-great-pear.md`.
> Este es el contexto de dónde salió el esqueleto.

## Instalar la Pear CLI

```bash
# macOS / Linux
curl https://install.pears.com/pear.sh | sh
# Windows
irm https://install.pears.com/pear.ps1 | iex
```

## Arranque de un proyecto nuevo

```bash
git clone https://github.com/holepunchto/hello-pear-bare
cd hello-pear-bare
npm install

pear touch                                   # -> pear://<key>
npm pkg set upgrade=pear://<key>             # sin esto el worker crashea, ni en dev
```

El placeholder `pear://<YOUR_KEY_HERE>` que trae la plantilla tira
`INVALID_URL` y **se lleva el proceso puesto**. Ver `06-troubleshooting.md`.

## Las variantes

| Branch | Forma | Para qué |
|---|---|---|
| `main` | Updater en un worker thread de Bare | Programas long-lived |
| `variant/single-thread` | Updater directo en el proceso principal, sin IPC | Long-lived sin thread aparte |
| `variant/daemon` | Updater en un daemon detached | Comandos one-shot tipo `git` |
| **`tui`** | **single-thread + `lib/tea`** | **la nuestra** |

### Por qué la branch `tui`

Trae dos cosas que no están en `main`:

- **`lib/tea`** — una implementación de la Elm Architecture (estilo Bubble Tea) para
  terminales Bare: `update(msg) -> [modelo, cmd]` y `view() -> string`, con componentes
  (list, table, spinner, textinput, viewport…). Se usa **sin tocar**.
- **`lib/pear-cli.js`** — cablea pear-runtime, el updater OTA, el swarm de replicación y el
  teardown, y expone una API chica: le pasás flags y handlers, y te devuelve `cli.start()`.

Un juego es un proceso long-lived con una TUI, así que el daemon queda descartado y el worker
thread de `main` no aporta nada — de hecho **el worker nos costó el bug más caro del
proyecto** (ver `06-troubleshooting.md`).

## Estructura de la plantilla vs la nuestra

| Plantilla (`main`) | Nosotros (`tui`) | Qué hace |
|---|---|---|
| `bin.mjs` | `bin.js` | entry: flags, y el cableado red ↔ modelo |
| `app.js` + `workers/main.js` | `lib/pear-cli.js` | runtime, updater, swarm, teardown |
| — | `lib/tea/` | el framework TUI (sin tocar) |
| — | `lib/uno/`, `lib/ui/`, `lib/net/` | el juego (nuestro) |
| `scripts/make.js` | ídem | detecta OS/arch y buildea |
| — | `scripts/deploy.js` | arma la carpeta que `pear stage` sube |
| `test/index.js` | ídem | entry de tests (`brittle`) |

El árbol completo del juego está en el README de la raíz.

## `lib/pear-cli.js` — la API que usamos

```javascript
const cli = createPearCli(pkg, {
  flags: [
    ['--room <name>', 'online room to play in'],
    ['--log <file>',  'write the network log to a file']
  ],
  handlers: {
    onUpdating:      () => status('⇣ downloading update…'),
    onUpdate:        async ({ updater }) => { await updater.applyUpdate() },
    onError:         (err) => status(`✗ ${err.message}`)
  },
  onTeardown: async () => { if (room) await room.destroy() }
})

cli.start(({ flags, send }) => new App({ version: pkg.version, flags, net }))
```

Aparte de `--version`, `--storage <dir>` y `--no-updates`, que vienen de fábrica.

### Los tres cambios que necesitó

`lib/pear-cli.js` es el de la plantilla salvo por esto:

1. **El parseo de argumentos estaba corrido en los binarios buildeados.** Hacía un
   `Bare.argv.slice(2)` fijo, correcto para `bare bin.js …` pero equivocado para un
   standalone invocado como `the-great-pear --room x`: se comía el primer flag en silencio, y
   `--storage <dir>` abortaba con `UNKNOWN_ARG`. Ahora el slice depende de si corre bajo
   `bare` o no.
2. **Una conexión tardía del swarm podía matar la app.** El handler de `connection` llamaba a
   `store.replicate()` sin guarda; si entraba una conexión con el store ya cerrándose —en el
   teardown, o cuando una segunda copia pierde la carrera por el mismo directorio de
   storage— Corestore tiraba `Corestore is closed` como rejection sin capturar. Ahora las
   conexiones tardías se descartan.
3. **Nombre de artefacto según la plataforma**, para que una copia instalada como `<app>.app`
   le pida al updater el bundle y reemplace el directorio, mientras que un binario pelado se
   sigue actualizando como binario pelado. Ver `09-the-great-pear.md` §5.

Y una configuración que no es un cambio de código pero es igual de importante:

```js
new PearRuntime({ …, delay: 5000 })   // el default son 3600000 ms = 1 hora
```

## Scripts de npm

| Script | Qué hace |
|---|---|
| `npm start` | Corre la CLI en dev, con `--no-updates` |
| `npm run start:updates` | Igual pero con el updater activo |
| `npm test` | Tests con `brittle-bare` |
| `npm run lint` / `npm run format` | prettier + lunte |
| `npm run make` | Detecta OS/arch y buildea a `out/<platform>-<arch>` |
| `npm run make:<platform>-<arch>` | Un target puntual — **cross-compila** |
| `npm run deploy` | Arma `deploy/` con la forma que `pear stage` espera |
| `npm run net:test` / `npm run lockstep:test` | Ejercitan la red sin abrir la TUI |

## Antes del primer release: congelar la identidad

```json
{
  "name": "the-great-pear",
  "productName": "the-great-pear",
  "upgrade": "pear://u9y7y9xqggifyeihhi9i1cswyqdrtdjbg75y6obxxy6hwe6uu66o"
}
```

> ⚠️ `productName || name` se usa **tanto para el nombre del binario como para el directorio
> de storage persistente**. Hay que definirlo **antes del primer release**: cambiarlo después
> rompe a todos los que ya instalaron.
