# CLAUDE.md

Contexto del proyecto para Claude Code. Leer esto siempre antes de proponer código.

## Qué estamos haciendo

Hackathon de 24hs — **Aleph Hackathon 2026**, track **Pears (Tether / Holepunch)**.
Equipo de 4 personas. Deadline de jurado: **domingo 23, 13:00 hora ARG**.

El entregable es una **CLI standalone**, escrita para el runtime **Bare**, desplegada con la
**Pear CLI**, instalable con `pear install pear://<key>` y con **updates OTA P2P** funcionando.

Idea todavía abierta. Dirección probable: **un juego de terminal P2P**. Ver `docs/07-ideas.md`.

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

## Verificado empíricamente el 22-ago (no asumir, ya está probado)

- **Pear instalado: v3.2.0.** `pear -v` — **es `-v`, no `--version`** (tira "Unrecognized Flag").
- La lista real de comandos de la CLI confirma que **no existen `run` ni `init`**.
- **`npm start` falla con `sh: bare: command not found`** hasta que se linkea el binario:
  `ln -sf ../bare-runtime/bin/bare node_modules/.bin/bare`. Hay que rehacerlo tras borrar `node_modules`.
- **`workers/main.js` del template es solo `require('hello-pear-worker')`** — la lógica real está en
  ese paquete npm, no inline como dice la doc. Es la mejor referencia de uso de `PearRuntime`.
- **`crypto.data(b4a.from(str))` → 32 bytes determinísticos.** Sirve para derivar topics desde
  nombres de sala legibles.
- El template tiene branches no documentadas: **`origin/tui`** y `origin/simplify`.
  **Mirar `tui` antes de escribir el render del juego desde cero.**
- **`Bare.env` NO existe.** Para env vars: `require('bare-process').env`. La app no usa ninguna.
- ✅ **El P2P funciona ENTRE MÁQUINAS REALES.** Franco ↔ Gino con `test-msg/app/conectar.js`
  (HyperDHT por clave directa): conectó en 7.7s y sostuvo 327s de charla. Repetido desde una
  segunda red: 12.6s. Ver `test-msg/docs/09-conexion-directa.md`.
  `firewalled=true` en el DHT es normal, no es un error.
- ⚠️ **Un test en UNA SOLA máquina no prueba nada de P2P.** HyperDHT toma un atajo por LAN
  (`remota: 192.168.x.x`, `punches consistent=0`) y **nunca ejercita el hole punching**.
  Perdí horas reportando como "funciona" algo que solo funcionaba en localhost.
- **Conexión directa por clave > topic, para probar conectividad.** Sin announce/lookup no hay
  race ni anuncios fantasma. `DHT.keyPair(seed)` da clave estable entre reinicios.
- **El DHT devuelve claves de peers MUERTOS.** Verificado. Como Hyperswarm genera clave nueva por
  arranque, tus propias corridas viejas aparecen como "otro peer". Invalidó un diagnóstico entero.
- **El tiempo de conexión tiene MUCHA varianza por un race de announce/lookup en el DHT.**
  Medido sin mitigar: 43s, 7s, 6s. Con `discovery.refresh()` cada 5s: 6s, 11s, 7s, 6s.
  **Dar 60s antes de concluir que algo P2P no conecta.** Un test de 20s me dio un falso negativo
  que me llevó a culpar a NAT hairpinning — hipótesis equivocada.
- **`discovery.flushed()` resuelve cuando TU announce propagó, no cuando encontraste a alguien.**
  Confundir las dos cosas fue el origen del malentendido.
- **Para el lobby del juego: mostrar "buscando jugadores…".** No asumir conexión instantánea.
- 🧟 **Los procesos zombi falsean los tests.** Un proceso viejo en la misma sala reaparece como
  "peer fantasma" — parece un bug o un mock, y es real. **Siempre `npm run ps` antes de concluir
  algo de un test P2P**, y usar una sala distinta por prueba (`--room prueba-$(date +%s)`).
  Limpiar con `npm run stop`. Ver `test-msg/docs/08-procesos-zombi.md`.
- El cierre limpio no es cosmético: `app.exit()` solo no alcanza porque el listener de stdin
  mantiene vivo el event loop. Hay que soltar stdin, acotar el teardown con timeout y salir explícito.

## Método para debuggear P2P (aprendido a la fuerza)

No teorizar sobre la causa. Aislar capas de a una, hay scripts listos en `test-msg/app/`:

1. `node diag-node.js A` → ¿Hyperswarm puro anda en esta red?
2. `bare diag-bare.js A 1` → ¿anda bajo Bare?
3. `bare diag-bare.js A 2` → ¿anda con dos swarms, como el worker?
4. `npm start` → ¿anda la app real?

El primer escalón que falla es la capa culpable. Saltearse escalones lleva a hipótesis equivocadas.
Detalle en `test-msg/docs/05-diagnostico-red.md`.

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

Dos frentes en paralelo: `spikes/` (pruebas de Gino) y `test-msg/` (chat P2P de prueba).
Bitácora paso a paso: **`test-msg/docs/`**.

### Riesgos técnicos — despejados ✅

- [x] **Input en tiempo real en Bare** — `bare-tty` da raw mode. → `spikes/01-raw-input/`
- [x] **P2P con Hyperswarm** — discovery por sala, JSON con framing, reconexión. → `spikes/02-hyperswarm/`
- [x] **P2P ENTRE MÁQUINAS REALES** — Franco ↔ Gino con `test-msg/app/conectar.js`
      (HyperDHT por clave directa): 7.7s, charla de 327s. Repetido desde otra red: 12.6s.
      → `test-msg/docs/09-conexion-directa.md`

**Un juego de terminal P2P es viable.** Condiciones de diseño no negociables: heartbeat de
aplicación para detectar peers caídos, y retry del `join` (el discovery falla ~30% al primer intento).

### Pipeline — **NADA DE ESTO ESTÁ HECHO** 🔴

Prioridad #1. Un juego perfecto sin OTA no califica.

- [ ] Definir **quién genera y seedea la key definitiva** (bloquea todo lo de abajo — sólo esa
      máquina puede publicar la v2, y tiene que estar viva durante el juzgado)
- [x] Binarios buildeados — **5 plataformas cross-compiladas desde el Mac**
      (darwin-arm64/x64, linux-x64/arm64, win32-x64). La doc oficial dice que no se puede: se puede.
- [x] `pear build` → `deploy-multi/` (⚠️ **paso obligatorio**: stagear `out/` publica SIN el binario)
- [x] `pear stage` → `pear://0.7.9nbjj…`
- [x] `pear seed` corriendo (levanta versiones nuevas solo, no hay que reiniciarlo)
- [x] **Instalado vía `pear install` en otra máquina** — Gino, Ubuntu, 90 MB desde 1 peer.
      Los binarios cross-compilados **corren**, no sólo tienen el formato correcto.
- [x] `delay: 5000` en el updater (`workers/main.js:44`) — sin esto espera hasta 1 HORA.
      ⚠️ El cambio sólo surte efecto desde la versión SIGUIENTE: la instancia instalada
      corre su propio código.
- [x] v1.0.1 publicada con el fix (5 plataformas, drive length 13)
- [ ] Gino reinstala 1.0.1 y deja la app corriendo
- [ ] **OTA v1.0.1 → v1.0.2 demostrado** ← lo único que falta del pipeline

> La key `pear://9nbjjp5jmtxxq3jj8ko7z4sdfnohucgwyjsxspdpsnuc8yf136my` es **de prueba**,
> generada en `test-msg/app`. Nunca se stageó ni se seedeó nada en ella.

### Resto

- [ ] Idea del juego definida (Barbie trabajando en juego + UI)
- [ ] Integrar la capa P2P verificada con el juego
- [ ] Máquina de Roman no conecta — ver `test-msg/docs/10-caso-roman.md` (no bloquea)
- [ ] README + video demo

**Mantener `test-msg/docs/03-bitacora.md` actualizado con cada error nuevo y su fix.**
