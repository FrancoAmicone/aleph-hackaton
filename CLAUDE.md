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

### Riesgos técnicos — despejados ✅

Ambos verificados con código corrible en `spikes/`. Ver `docs/README.md`.

- [x] **Input en tiempo real en Bare** — `bare-tty` da raw mode. Flechas, espacio, Ctrl+C
      limpio, y funciona dentro del template. → `spikes/01-raw-input/`
- [x] **P2P con Hyperswarm** — discovery por nombre de sala, JSON con framing, detección de
      desconexión, reconexión automática. → `spikes/02-hyperswarm/`

**Un juego de terminal en tiempo real es viable.** Con dos condiciones de diseño no negociables:
heartbeat de aplicación para detectar peers caídos, y retry del `join` (el discovery falla
~30% al primer intento). Detalle en `docs/04-p2p.md`.

### Pipeline — **NADA DE ESTO ESTÁ HECHO** 🔴

Es la prioridad #1 del proyecto y sigue en cero. Un juego perfecto sin OTA no califica.

- [ ] Definir **quién genera y seedea la key** (bloquea todo lo de abajo — sólo esa máquina
      puede publicar la v2, y tiene que estar viva durante el juzgado)
- [ ] Template clonado como proyecto real (por ahora sólo existe dentro de `spikes/`)
- [ ] `pear://` link generado y seedeando
- [ ] Binario buildeado (`npm run make`)
- [ ] Instalado vía `pear install` en otra máquina
- [ ] OTA verificado end-to-end

### Resto

- [ ] Idea definida (ya no bloquea nada: los dos riesgos están despejados)
- [ ] Discovery probado **entre dos máquinas distintas** (lo medido fue en una sola,
      que es el peor caso de NAT)
- [ ] Lógica de la app
- [ ] README + video demo
