# the-great-pear — manual operativo

Todos los comandos del juego, verificados el 23-ago-2026.
El juego vive en `tui/`. La app de prueba `test-msg/` queda como banco de pruebas.

## La key

```
pear://u9y7y9xqggifyeihhi9i1cswyqdrtdjbg75y6obxxy6hwe6uu66o
```

Es la identidad permanente. Lo que cambia en cada release es la versión
(`pear://0.7.u9y7…` — el número es el drive length). Para instalar se usa la key **sin** versión.

| | |
|---|---|
| `name` / `productName` | `the-great-pear` |
| Binario | `the-great-pear` (`.exe` en Windows) |
| Versión publicada | 2.0.0 |

⚠️ **`productName` define el nombre del binario Y el directorio de storage persistente.**
Cambiarlo después del primer release rompe a quien ya instaló. No se toca.

---

## Correr el juego en desarrollo

```bash
cd tui
npm install
npm start                  # updates deshabilitados
npm start:updates          # con el updater activo
```

### ⚠️ El symlink de `bare` — ya resuelto, pero sepan por qué

El template trae `"start": "bare bin.js"`, pero **npm no linkea el binario `bare`** a
`node_modules/.bin/`. Verificado: le pasa a cualquiera que clone.

```
$ npm start
sh: bare: command not found
```

**Ya está arreglado en el repo** — los scripts apuntan al shim directo:

```json
"start": "node node_modules/bare-runtime/bin/bare bin.js --no-updates",
"start:updates": "node node_modules/bare-runtime/bin/bare bin.js --updates"
```

`bin/bare` es un script de node con shebang, así que funciona igual en macOS, Linux y Windows.
**No hace falta ningún symlink.**

El mismo problema afecta a `npm test`: `brittle-bare` spawnea `bare` y no lo encuentra
(`env: bare: No such file or directory`). Resuelto poniéndolo en el PATH del script:

```json
"test": "PATH=\"$PWD/node_modules/bare-runtime/bin:$PATH\" brittle-bare test/index.js"
```

Si preferís tener `bare` a mano en la terminal (opcional, y hay que rehacerlo tras cada
`npm install`):
```bash
ln -sf ../bare-runtime/bin/bare node_modules/.bin/bare
```

### ⚠️ El juego necesita un TTY

Es una TUI: **no se puede redirigir la salida a un archivo**. Si lo hacés:

```
Uncaught Error: tea: no output stream (not a TTY); pass opts.output
```

No es un bug. Significa que sólo se puede probar en una terminal de verdad —
ni con `> archivo.log`, ni desde un script automatizado sin pty.

---

## Instalar desde otra máquina

```bash
pear install pear://u9y7y9xqggifyeihhi9i1cswyqdrtdjbg75y6obxxy6hwe6uu66o
```

Salida esperada (verificada):

```
Installing... pear://u9y7y9xqggifyeihhi9i1cswyqdrtdjbg75y6obxxy6hwe6uu66o
[ Peers: 1 ] [ ⬇ 124.4MB - 55.3MB/s ]
App: the-great-pear
Version: 2.0.0
Link: pear://u9y7y9xqggifyeihhi9i1cswyqdrtdjbg75y6obxxy6hwe6uu66o
Verlink: pear://0.7.u9y7y9xqggifyeihhi9i1cswyqdrtdjbg75y6obxxy6hwe6uu66o
Pathname: /by-arch/darwin-arm64/app/the-great-pear
Target: /Users/<vos>/.local/bin/the-great-pear
Installed
```

**`pear install` NO abre el juego.** Sólo deja el binario en `~/.local/bin/`. Para jugar:

```bash
the-great-pear
```

Si dice "command not found", `~/.local/bin` no está en el PATH:
```bash
export PATH="$HOME/.local/bin:$PATH"      # agregalo a ~/.zshrc o ~/.bashrc
```

⚠️ **Sólo funciona si hay un `pear seed` corriendo.** Sin seed no hay quien sirva los bloques.

---

## Publicar una versión

```bash
cd tui

# 1. subir versión
npm version patch

# 2. compilar — CROSS-COMPILA, las 5 desde cualquier máquina
npm run make:darwin-arm64
npm run make:darwin-x64
npm run make:linux-x64
npm run make:linux-arm64
npm run make:win32-x64

# 3. armar la carpeta de deployment  ← PASO OBLIGATORIO
pear build --package=./package.json \
  --darwin-arm64-app ./out/darwin-arm64/the-great-pear \
  --darwin-x64-app   ./out/darwin-x64/the-great-pear \
  --linux-x64-app    ./out/linux-x64/the-great-pear \
  --linux-arm64-app  ./out/linux-arm64/the-great-pear \
  --win32-x64-app    ./out/win32-x64/the-great-pear.exe \
  --target ./deploy-<version>

# 4. stage — SIEMPRE dry-run primero
pear stage --dry-run pear://u9y7y9xqggifyeihhi9i1cswyqdrtdjbg75y6obxxy6hwe6uu66o ./deploy-<version>
pear stage           pear://u9y7y9xqggifyeihhi9i1cswyqdrtdjbg75y6obxxy6hwe6uu66o ./deploy-<version>
```

### 🔴 El control que no se saltea

El dry-run **tiene que listar los 5 binarios**:

```
+ /package.json (+1.8kB)
+ /by-arch/darwin-arm64/app/the-great-pear (+143.3MB)
+ /by-arch/darwin-x64/app/the-great-pear (+149.4MB)
+ /by-arch/linux-x64/app/the-great-pear (+177.6MB)
+ /by-arch/linux-arm64/app/the-great-pear (+179.3MB)
+ /by-arch/win32-x64/app/the-great-pear.exe (+95.1MB)
```

**Si no los ves, NO stagees.** Si stageás `out/` directamente en vez del deploy de `pear build`,
se publica **todo menos el binario** — porque `out/` está en `.gitignore` y `pear stage` lo
respeta. Falla en silencio: el juez instala y no le funciona nada.

### Cross-compilación

La doc oficial dice *"Build each platform's binary on a matching host"*. **Es falso.**
Verificado: las 5 plataformas salen de un Mac ARM, y Gino confirmó que el binario linux-x64
**corre** en su Ubuntu. Una sola máquina compila para todo el equipo.

---

## Seed — dejarlo corriendo

```bash
cd tui
nohup caffeinate -is pear seed pear://u9y7y9xqggifyeihhi9i1cswyqdrtdjbg75y6obxxy6hwe6uu66o \
  > ~/seed-juego.log 2>&1 &
```

- `nohup` → sobrevive al cierre de la terminal
- `caffeinate -is` → **impide que la Mac se duerma** (crítico para el domingo)

Verificar:
```bash
grep -E "announced|drive length" ~/seed-juego.log
```

Esperado:
```
^_^ announced
... drive length 7
... semantic version 2.0.0
... NAT type consistent
```

Monitorear: `tail -f ~/seed-juego.log` · Matar: `pkill -f "pear seed"`

⚠️ **Tiene que seguir corriendo durante todo el juzgado.** Si se corta, nadie instala ni actualiza.
Conviene un segundo seeder de respaldo en otra máquina.

📌 **No hay que reiniciarlo al publicar una versión** — detecta el drive length nuevo solo.

---

## El OTA

Ver `../test-msg/docs/12-ota-explicado.md` para el mecanismo completo. Lo específico de acá:

- **`delay: 5000`** está aplicado en `tui/lib/pear-cli.js`. Sin eso el updater espera
  **hasta 1 hora** antes de buscar una versión nueva.
- La copia instalada corre **su propio código**: bajar el delay en la v2 no sirve si la v1 ya
  salió con el default. Por eso está desde el primer release.
- La app arranca logueando `the-great-pear v2.0.0` y `Updates: enabled|disabled`; en la TUI eso
  entra como mensaje, no a stdout.

### ✅ `--version` para verificar el OTA

```bash
the-great-pear --version     # o -v
# the-great-pear v2.0.0
```

Agregado en `lib/pear-cli.js`, y responde **antes** de construir el Corestore y el Hyperswarm:
no levanta nada de red sólo para imprimir una línea.

Es la forma de confirmar que un update aterrizó sin abrir el juego. Sin este flag había que
entrar a la TUI y leer el log en pantalla — inservible para scriptear y para verificar un OTA.

---

## Estado

| | |
|---|---|
| Key definitiva | ✅ `u9y7y9xq…` |
| `productName: the-great-pear` | ✅ |
| `delay: 5000` | ✅ |
| 5 plataformas compiladas | ✅ |
| `pear build` + `pear stage` | ✅ drive length 7 |
| `pear seed` | ✅ |
| `pear install` verificado | ✅ 137 MB, queda en el PATH |
| El juego corre en terminal real | ✅ verificado por Franco |
| `--version` para verificar el OTA | ✅ |
| Tests | ✅ 133/133 |
| OTA sobre el juego | ⬜ |
| **Multijugador P2P** | ⬜ **lo único que falta de verdad** |

---

## Capa de red (Fase 2) — ✅ verificada

`tui/lib/net/room.js` + `tui/workers/main.js`. La red vive **en el worker de Bare**, nunca en
el proceso de la TUI: así el descubrimiento y el hole punching no le roban frames al render.

### Dos swarms, a propósito

`lib/pear-cli.js` ya tiene su swarm y le hace `store.replicate(connection)` a **toda** conexión,
porque el updater lo necesita. Meter tráfico de juego ahí haría que cada peer de la partida
reciba el protocolo de Hypercore. Por eso `room.js` levanta un swarm aparte.

### Protocolo

**TUI ↔ worker** (por `Bare.IPC` + `FramedStream`):

| Dirección | Mensaje |
|---|---|
| TUI → worker | `{ t: 'join', sala, nombre, anfitrion }` · `{ t: 'action', action }` · `{ t: 'leave' }` |
| worker → TUI | `{ t: 'estado' }` · `{ t: 'peers' }` · `{ t: 'seats' }` · `{ t: 'action' }` · `{ t: 'peer-lost' }` |

**Entre peers:** `hello` (nombre) · `seats` (semilla + asientos, sólo del anfitrión) ·
`action` (la acción del engine tal cual) · `ping` (heartbeat).

La configuración llega por IPC, no por argv: `createPearCli` spawnea con
`PearRuntime.run(script)` **sin argumentos**. Además así se puede entrar y salir de salas sin
respawnear el worker.

### Sincronización: lockstep determinístico

El anfitrión sortea una semilla y la reparte con los asientos. Todos construyen el mismo mazo.
**Por la red viajan sólo las acciones**, que ya son JSON plano (`{ type, seat, card }`).
No hay que serializar ni reconciliar estado.

### Resultados medidos (3 peers)

```
[anfitriona +6.3s] peers = 1 ["segundo"]
[anfitriona +8.2s] SEATS semilla=95248ca7… ["0:anfitriona","1:segundo","2:tercero"]
[tercero    +4.2s] SEATS semilla=95248ca7… ["0:anfitriona","1:segundo","2:tercero"]
[tercero   +16.0s] ACCION RECIBIDA {"type":"play","seat":0,...}
```

| Qué | Resultado |
|---|---|
| Conexión | 4-6 s |
| Misma semilla en todos | ✅ `95248ca7…` |
| Asientos consistentes | ✅ |
| Broadcast de acciones | ✅ malla completa, sin relay |
| **Caída abrupta (`kill -9`)** | ✅ detectada en **4-6 s** por el heartbeat |
| Cierre limpio | ✅ detectado al instante |

### Probar la red sin abrir el juego

```bash
cd tui
npm run net:test -- anfitriona misala anfitrion 40000    # terminal 1
npm run net:test -- invitado   misala -         37000    # terminal 2
```

Argumentos: `<nombre> <sala> [anfitrion] [duración-ms]`.
Ejercita `lib/net/room.js` sin TUI ni worker — sirve para probar la red aislada.

### Las dos cosas que no se tocan

1. **`framed.on('error')` además de `conn.on('error')`.** El `ECONNRESET` se propaga por el
   stream envolvente, no sólo por el `conn`. Sin los dos handlers, un jugador que cierra la
   ventana le tumba el proceso al otro.
2. **`clearInterval` en el teardown.** Los intervalos del refresh y del heartbeat mantienen vivo
   el event loop de Bare: sin limpiarlos el worker no termina nunca.
