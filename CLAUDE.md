# CLAUDE.md

Contexto del proyecto para Claude Code. Leer esto siempre antes de proponer código.

## Qué estamos haciendo

Hackathon de 24hs — **Aleph Hackathon 2026**, track **Pears (Tether / Holepunch)**.
Equipo de 4 personas. Deadline de jurado: **domingo 23, 13:00 hora ARG**.

El entregable es una **CLI standalone**, escrita para el runtime **Bare**, desplegada con la
**Pear CLI**, instalable con `pear install pear://<key>` y con **updates OTA P2P** funcionando.

**La idea está definida: `the-great-pear`**, un UNO de terminal P2P. El juego vive en `tui/`.

**Idioma: responder siempre en español.** Código, nombres de variables y commits en inglés.

## Reglas duras del track (si algo de esto falla, no calificamos)

1. Partir de alguna variante de **`hello-pear-bare`** (no armar el scaffold a mano).
2. La herramienta tiene que instalarse con `pear install pear://<key>`.
3. Deploy real con la Pear CLI **+ seeding activo** durante todo el juzgado.
4. Demostrar un **update OTA P2P** en vivo (v1 instalada → release v2 → la v1 se actualiza sola).
5. Entregar el link `pear://`, repo público con README, video demo, y las plataformas del binario.
6. Conectividad P2P obligatoria — no vale mockear la red.

Detalle completo en `docs/00-track-pears.md`.

## Prioridad de trabajo (importa el orden)

La barra del track no es "app linda", es **"se instala por `pear://` y se auto-actualiza"**.
Por eso:

1. **Primero el pipeline**: clonar el template, `pear touch`, setear `upgrade`, `npm run make`,
   `pear stage`, `pear seed`, instalar desde otra máquina, publicar una v2 y ver el OTA aplicarse.
   Con un "hello world" pelado alcanza. **Esto se hace en las primeras horas, no al final.**
2. **Después** la lógica del juego / app encima de ese esqueleto que ya funciona.
3. **Al final** pulido de TUI y video.

Nunca al revés. Un juego hermoso sin OTA no puntúa.

## Stack y gotchas que Claude tiende a equivocar

### Esto NO es Node.js. Es Bare.

- **No hay stdlib de Node.** No existen `fs`, `path`, `os`, `process`, `events` como builtins.
  Se instalan explícitamente: `bare-fs`, `bare-path`, `bare-os`, `bare-process`, `bare-events`,
  `bare-tty`, `bare-readline`, `bare-subprocess`, `bare-buffer`, `bare-stream`.
- `Buffer` no está global — usar **`b4a`** para todo lo que sea bytes/hex. Es el idiom del ecosistema.
- `process.argv` → **`Bare.argv`** (ojo: los args de usuario arrancan en `Bare.argv[2]`).
- `process.exit()` → `Bare.exit()`.
- Antes de sugerir cualquier `npm install <paquete-de-node>`: verificar que corra en Bare.
  Si depende de builtins de Node, o hay equivalente `bare-*`, o hay que aliasear en package.json.
- **No usar imports dinámicos condicionales** — `bare-pack` escanea estático y no los ve.
  Si hace falta elegir módulo por runtime, usar **import maps**, no `if (...) require(...)`.

### Comandos de la Pear CLI que ya NO existen (v3)

`pear run`, `pear init`, `pear release`, `pear presets`, `pear shift`, `pear drop`.
Si Claude escribe `pear run` o `pear init` en una instrucción, está alucinando docs viejas.
El reemplazo de `pear run` es embeber la librería **`pear-runtime`** (que es lo que ya hace el template).
El reemplazo de `pear release` es `pear provision` + `pear multisig`.

### La variante del template importa

- `main` → updater en un worker thread de Bare. Para procesos largos (server, TUI, juego). **Probablemente la nuestra.**
- `variant/single-thread` → updater directo en el proceso principal, sin IPC. Más simple de debuggear.
- `variant/daemon` → updater en daemon detached. Para comandos one-shot tipo `git`.

Si el juego es una TUI que queda abierta → `main` o `single-thread`.

## Workflow de comandos

```bash
# setup inicial (una sola vez)
git clone https://github.com/holepunchto/hello-pear-bare
cd hello-pear-bare && npm install
pear touch                                  # genera pear://<key>
npm pkg set upgrade=pear://<key>
pear seed pear://<key>                      # dejar corriendo en una terminal aparte

# desarrollo
npm start                                   # updates deshabilitados
npm start -- --updates                      # probar el updater

# release
npm version patch
npm run make                                # binario -> out/<platform>-<arch>
pear stage --dry-run pear://<key> <dir>
pear stage pear://<key> <dir>

# consumo
pear install pear://<key>
```

Referencia completa en `docs/02-pear-cli.md` y `docs/03-deploy-ota.md`.

## Cómo quiero que trabajes

- **Verificá contra `docs/` antes de escribir código P2P o comandos de Pear.** La doc oficial está
  indexada en `docs/README.md` con qué archivo leer según el problema. Si el tema no está cubierto ahí,
  buscá el link oficial en `docs/08-links.md` y traelo con WebFetch — no inventes API.
- **Prototipos chicos y corribles.** Estamos en 24hs: preferí un script de 40 líneas que se pueda
  ejecutar ya antes que una arquitectura. Nada de abstracciones prematuras.
- **Un cambio a la vez, verificado.** Si algo no lo probaste, decilo explícitamente.
- No agregar dependencias sin chequear compatibilidad con Bare.
- No refactorizar código que ya funciona salvo que lo pida.

## Estado

### ✅ Riesgos técnicos despejados

- [x] **Input en tiempo real en Bare** — `bare-tty` da raw mode. → `spikes/01-raw-input/`
- [x] **P2P con Hyperswarm** — discovery por sala, JSON con framing. → `spikes/02-hyperswarm/`
- [x] **P2P ENTRE MÁQUINAS Y REDES DISTINTAS** — Franco ↔ Gino con `conectar.js` (HyperDHT por
      clave directa): 7.7s y charla de 327s. Repetido desde otra red: 12.6s.
- [x] **Pipeline completo verificado end-to-end**, incluido el **OTA**: una instancia v1.0.1
      detectó y aplicó la v1.0.2 sola, en 1 segundo. (Se probó sobre una app descartable,
      `test-msg`, antes de fijar la key definitiva.)

### the-great-pear — estado del pipeline

Key definitiva: **`pear://u9y7y9xqggifyeihhi9i1cswyqdrtdjbg75y6obxxy6hwe6uu66o`**

- [x] `productName: the-great-pear` (define binario **y** storage — no se cambia después)
- [x] `delay: 5000` en `lib/pear-cli.js` (sin esto el updater espera 1 hora)
- [x] 5 plataformas cross-compiladas **desde el Mac** (la doc oficial dice que no se puede; se puede)
- [x] `pear build` + `pear stage` → drive length 7, v2.0.0
- [x] `pear seed` corriendo
- [ ] `pear install` desde otra máquina
- [ ] OTA demostrado sobre el juego
- [ ] **Multijugador P2P** ← lo único que falta de verdad

### Lecciones caras (no repetirlas)

- **`pear build` es obligatorio.** Stagear `out/` publica **sin el binario**, en silencio,
  porque `out/` está en `.gitignore` y `pear stage` lo respeta. Si el dry-run no lista los
  binarios bajo `/by-arch/`, no stagees.
- **Un test en UNA sola máquina no prueba nada de P2P.** HyperDHT toma un atajo por LAN
  (`punches consistent=0`) y nunca ejercita el hole punching.
- **El DHT devuelve claves de peers muertos.** Tus corridas viejas aparecen como "otro peer".
- **`discovery.flushed()` resuelve cuando TU announce propagó**, no cuando encontraste a alguien.
- **Conectar tarda 6-15s** y el discovery falla ~30% al primer intento → el lobby necesita
  "buscando jugadores…" y retry.
- **El cambio de comportamiento del updater sólo aplica desde la versión SIGUIENTE**: la copia
  instalada corre su propio código.

Manual operativo del juego: `docs/09-the-great-pear.md`.
