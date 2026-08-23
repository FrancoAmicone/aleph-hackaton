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

---

## Multijugador (Fase 3) — ✅ lockstep verificado

### El dilema de los asientos

El juego nació single-player: **"vos" eras siempre el asiento 0**. `hands[0]` tu mano,
`currentActor() !== 0` "no es tu turno". Estaba así en 16 lugares.

Online los cuatro comparten **un solo estado**, y cada uno es un asiento distinto. "Asiento 0"
pasa a significar "el anfitrión", para todos.

Se evaluó **rotar** los asientos —que cada peer se relabele como 0— y **se descartó**: dos
jugadores renderizarían `hands[0]` y ambos creerían tener la primera mano repartida.

La solución es `this.me`: el modelo sabe qué asiento es. 12 reemplazos en `lib/ui/app.js` y 4 en
`lib/ui/screen.js`, todos mecánicos. **Con `me = 0` por defecto el modo local queda idéntico.**

### Cómo se sincroniza

```
anfitrión: crea sala → sortea semilla → reparte asientos → da el arranque
todos:     new Game({ players: asientos, rng: fromSeed(semilla) })
           → mismo mazo, mismas manos
jugada:    _act() manda la acción por red ANTES de aplicarla local
           el resto la recibe y hace game.apply(action)
```

Por el cable viajan **sólo acciones** (`{ type, seat, card }`). Cero estado.

`lib/rng.js` (mulberry32) hace posible el reparto determinístico. Verificado: misma semilla →
mismas manos y misma carta arriba; semilla distinta → mazo distinto.

### Resultado de la prueba de lockstep

Dos peers jugando una partida entera, cada uno eligiendo acciones legales al azar:

```
anfitriona  245 acciones  {"manos":[5,7],"top":{"color":"amarillo","rank":9},"turno":1,"mazo":12}
invitado    245 acciones  {"manos":[5,7],"top":{"color":"amarillo","rank":9},"turno":1,"mazo":12}
```

**Huellas idénticas.** Mismas manos, misma carta arriba, mismo turno, mismo color activo, mismo
mazo restante — sin haber mandado una sola vez el estado.

```bash
cd tui
npm run lockstep:test -- anfitriona misala anfitrion 55000   # terminal 1
npm run lockstep:test -- invitado   misala -         52000   # terminal 2
```

### Cómo se juega online

```bash
the-great-pear --room mipartida --name franco
```

En el menú:

| Tecla | Qué hace |
|---|---|
| `CREATE ROOM` + ENTER | crea la sala y espera jugadores (sos el anfitrión) |
| `JOIN ROOM` + ENTER | entra a la sala de `--room` |
| ENTER (con jugadores) | **el anfitrión** arranca la partida |
| `L` | partida **local** contra bots, sin red |

`L` es el modo de desarrollo: deja probar toda la UI sin coordinar a cuatro personas.

### Si alguien se cae

El heartbeat lo detecta en ~6s y **la partida se cancela**: cartel
`"Fulano se desconectó — partida cancelada"` y todos vuelven al menú. Sin IA no hay reemplazo
posible, y para 4 humanos es la salida honesta.

### Estado

| | |
|---|---|
| RNG determinístico por semilla | ✅ |
| Asiento propio (`me`) | ✅ modo local intacto |
| Acciones por red | ✅ |
| Lockstep con partida entera | ✅ **huellas idénticas tras 245 acciones** |
| Menú crear/unirse | ✅ |
| Tests | ✅ 772/772 |
| **Probado entre máquinas reales** | ⬜ **falta** |

---

## 🔴 El bug del updater y las 3 trampas (23-ago)

Tres cosas distintas se veían como "el OTA no anda". Las tres están resueltas y verificadas.

### 1. La ruta del ejecutable — el bug de verdad

`lib/pear-cli.js` resolvía la ruta del binario así:

```js
path.resolve(Bare.argv[0])     // ❌
```

Cuando el binario se invoca **por nombre** —que es lo normal, porque `pear install` lo deja en el
PATH— `argv[0]` es sólo `the-great-pear`, sin ruta, y `resolve()` lo pega contra el directorio
actual. En Windows además pierde el `.exe`.

Síntoma real (Roman, Windows):
```
✗ falló la actualización: ENOENT: no such file or directory,
  rename "\\?\C:\Users\rroma\the-great-pear" -> ...
```
Su carpeta home, y sin extensión: ese archivo no existe.

**Reproducido antes de arreglar**, con un binario sonda invocado por nombre desde otro directorio:
```
argv[0]           : pathprobe
path.resolve(a0)  : /private/tmp/pathprobe            ← inventada
os.execPath()     : /private/tmp/fakebin/pathprobe    ← la real
```

**Fix:** `os.execPath()`, que devuelve la ruta real sin importar cómo se invocó.
`argv[0]` queda sólo como último recurso.

### 2. El updater roto no puede arreglarse a sí mismo

La copia instalada corre **su propio código**. Las versiones 2.0.0 y 2.0.1 llevan el
`path.resolve` malo compilado adentro: fallan al aplicar *cualquier* update, incluido el que
trae el arreglo.

**Hay que reinstalar a mano una vez.** Es la misma lección del `delay`, y vale como regla
general: **un cambio en el updater sólo surte efecto a partir de la versión siguiente.**

### 3. ⚠️ `pear install` se NIEGA a sobrescribir

```
Refusing to overwrite existing:
  /Users/francoamicone/.local/bin/the-great-pear
To reinstall, manually remove then rerun command
```

Reinstalar es en **dos pasos**:
```bash
rm -f ~/.local/bin/the-great-pear                       # Windows: borrar el .exe
pear install pear://u9y7y9xqggifyeihhi9i1cswyqdrtdjbg75y6obxxy6hwe6uu66o
```

Sin el `rm`, `pear install` falla y uno queda en la versión vieja creyendo que reinstaló.

### ✅ Verificación del OTA end-to-end

Con la 2.0.4 instalada y **corriendo**, se publicó la 2.0.5:

```
$ the-great-pear --version
the-great-pear v2.0.5      ← se actualizó sola, sin reinstalar
```

Funciona también el caso de arranque: si la versión ya estaba publicada cuando abrís la app,
la aplica al inicio.

### Cómo NO medir si está descargando

Mirar si crece el storage (`~/Library/Application Support/<app>/pear-runtime/`) **no sirve**:
el corestore reutiliza bloques y el tamaño queda plano aunque la descarga esté en curso.
Estuve 5 minutos viendo 135MB fijos mientras el update se aplicaba igual.

**La única señal confiable es `--version`.**

---

## El bug que hizo que el multijugador nunca arrancara (v2.0.7)

**Síntoma:** en `red.log` sale el `>> join` y **no vuelve absolutamente nada**.
Ni siquiera `{"t":"estado","estado":"buscando"}`, que `room.join()` emite de forma
sincrónica antes de tocar la red.

**Diagnóstico:** si no vuelve ni el evento sincrónico, el problema NO es P2P.
La capa de red nunca se instanció.

**Causa:** `PearRuntime.run('./workers/main.js')` → `bare-sidecar`:

```js
this._process = spawn(bare, [entry, ...args], ...)
```

Spawnea **otro proceso** y le pasa la ruta como argumento. Ese proceso la resuelve
contra su **cwd**. En un binario standalone no existe ningún `workers/main.js` en
disco. Y `bare-pack` tampoco lo empaquetó: escanea `require`s **estáticos**, y
`'./workers/main.js'` es un string que sólo existe en runtime.

Andaba con `npm start` (el archivo está en disco) y **no** andaba instalado.

**Cómo verificarlo sin correr nada** — buscar strings del worker en el binario:

```bash
strings -a out/darwin-arm64/the-great-pear | grep -c "the-great-pear:room:"
# 0 = room.js NO está adentro     1 = sí está
```

**Por qué fue silencioso:** `run()` reenvía el stderr del worker como
`{ type: 'worker' }`, y el reductor de `app.js` lo tira en su `default:`.
El spawn fallaba y nadie se enteraba.

**Arreglo:** sacar el worker. `bin.js` hace `require('./lib/net/room')` — un require
estático que bare-pack sí ve — y maneja la sala en el proceso principal.
Desaparecen un proceso, un spawn y el framing del IPC.

### Lección general

**Cualquier archivo que se cargue por una ruta en runtime no entra al bundle.**
Vale para workers, para plugins y para `require` dinámico. El único camino seguro
es un `require` literal en el árbol de dependencias del entrypoint.

Y siempre probar **el binario compilado**, no sólo `npm start`. Este bug era
invisible desde el código fuente.

## Dos bugs más que destapó el `--log`

**1. El invitado se creía asiento 0 por un instante.** El anfitrión reparte asientos
apenas se abre la conexión, antes de que llegue el `hello`; en esa primera lista el
invitado no figura y `_emitSeats` caía al default `0`. Si un `start` se colara en esa
ventana, dos jugadores jugarían el mismo asiento y la partida divergiría.
Arreglado: si mi clave no está en la lista y no soy el anfitrión, no emito nada.

**2. ENTER mientras esperabas reiniciaba el discovery.** Sin asientos todavía, ENTER
caía en la rama de join y **destruía el swarm para crear otro**. Como el discovery
tarda 6-15s y falla ~30% al primer intento, el que se impacientaba se saboteaba solo.
Arreglado: con sala abierta, ENTER sin asientos sólo muestra "esperando jugadores…".

## Cómo se lee `red.log`

```
>> lo que la UI le pide a la red
<< lo que la red le devuelve a la UI
++ el updater
!! un error
```

| Última línea | Dónde está el problema |
|---|---|
| sólo el encabezado | no se apretó CREATE/JOIN todavía |
| `>> join` y nada más | **la capa de red no existe** (el bug de arriba) |
| `buscando` y nada más | el swarm no levanta |
| `anunciado`, nunca `peers` | discovery: no se encuentran en el DHT |
| `peers` pero nunca `seats` | conectaron, el `hello` no cruza |
| `seats` y no `start` | falta que el anfitrión apriete ENTER |

Comparar el `topic` de los dos peers: si difiere, escribieron distinto el `--room`.

## Manejar la TUI sin manos (para verificar sin coordinar gente)

`script` no sirve: no acepta un fifo como stdin y no entrega las teclas.
Hace falta un pty de verdad — `scripts/drive-tui.py` lo hace con `pty.fork()`.

```bash
python3 scripts/drive-tui.py 70 "6:CR,50:CR" ./out/darwin-arm64/the-great-pear \
  --no-updates --room prueba --name anfitrion --log /tmp/p1.log
```

**Ojo con el arranque en frío:** un binario recién compilado tarda ~30s en arrancar
la primera vez (macOS verifica la firma de 143MB). Los tiempos del driver se
descalabran; correrlo dos veces y usar la segunda.

**Y esto no prueba P2P.** Dos procesos en la misma máquina toman un atajo por LAN y
nunca ejercitan el hole punching. Sirve para verificar el cableado, no la red.

---

## Primera partida real entre máquinas (23-ago 09:38) — el P2P anda

Franco (anfitrión) ↔ Gino (invitado), redes distintas, binario instalado por `pear install`:

| | Franco | Gino |
|---|---|---|
| topic | `8efaf23174c8` | `8efaf23174c8` ✓ |
| semilla | `6c1c6685…` | `6c1c6685…` ✓ |
| miAsiento | 0 | 1 ✓ |
| `peers` | +39.5s | +7.8s |
| `start` | enviado | recibido ✓ |
| `action` | recibida | enviada ✓ |

**Una acción del engine cruzó el cable y llegó bien.** El lockstep funciona entre máquinas.

Notar la asimetría del discovery: Gino encontró a Franco en 7.8s, Franco a Gino en 39.5s.
Está dentro de lo esperado por el race de announce/lookup. **Dar 60s.**

### Pero el render explotaba: la mesa estaba cableada a 4 jugadores

```
view error: Cannot read properties of undefined (reading 'length')
```

`renderMesa` tenía los asientos fijos: `seatLine(game, 2)`, `flankBeside(game, 3)`.
Con 2 jugadores `game.hands[2]` es `undefined` y `dealtTo` reventaba en `.length`.

Y había un segundo bug en la misma función, más silencioso: las posiciones eran
**absolutas**, no relativas a `view.me`. Online, Gino veía a Franco sentado abajo —
el lugar que tiene que ocupar uno mismo.

**Arreglado:** las sillas se calculan como `(me + offset) % playerCount`, y la que
no existe se omite conservando su ancho para que el frame no se corra.

**Por qué no lo agarraron los tests:** todos construían mesas de 4. El modo local
siempre es 1 humano + 3 bots, así que el caso nunca aparecía. Agregado
`test/ui.js` → *"mesa: renders with 2 and 3 players, from every seat"*: 2, 3 y 4
jugadores × cada asiento. Verificado que **falla** con el código viejo.

### Lección

El modo local con bots no es una prueba del modo online. Siempre tiene 4 jugadores
y el asiento local siempre es 0 — justo las dos suposiciones que el online rompe.

### Un log por corrida

Dos instancias apuntando al mismo `--log` se pisan: el archivo queda con dos
encabezados y las líneas intercaladas, imposible de leer. Usar un nombre por corrida:

```bash
the-great-pear --room aleph --name franco --log ~/red-$(date +%H%M%S).log
```

---

## Mano completa Franco ↔ Gino (23-ago 09:58) — y los 5 asientos hardcodeados

**16 acciones cruzaron el cable**: `play`, `+2`, `take`, `draw`, `uno`. El lockstep
aguantó toda la mano. La partida se trabó recién en el `+4`.

```
[+426.4s] << {"type":"play","seat":1,"card":{"color":null,"rank":"+4"}}
[+507.4s] << {"t":"peer-lost","nombre":"gino","motivo":"cerró"}
```

Nunca llegó la acción `{type:'color'}` que sigue al comodín.

### La causa: la vista preguntaba siempre por el asiento 0

`_act()` sí manda la acción de color. El problema era que **la UI nunca se la ofrecía
al jugador correcto**. Cinco lugares calculaban la vista para el asiento 0 en vez de
para `view.me`:

| Archivo:línea | Código viejo | Qué rompía |
|---|---|---|
| `screen.js:393` | `currentActor() === 0` | tu mano no se resaltaba en tu turno |
| `screen.js:475` | `legalActions(0)` | **toda la línea de comandos** |
| `screen.js:550` | `chooser === 0` | el cartel "Elegí el color" |
| `screen.js:554` | `currentActor() !== 0` | el "está pensando…" |
| `result.js:60` | `winner() === 0` | el invitado veía DERROTA al ganar |

El que trabó la partida es `legalActions(0)`: Gino jugó el `+4`, entró en
`choose-color`, y la línea de comandos le mostraba lo que podía hacer **Franco**.
Nunca vio `R/A/V/Z`.

Detalle cruel: el *handler de teclas* sí usaba `this.me` correctamente. Si Gino
apretaba `R` a ciegas, funcionaba. La UI simplemente no se lo decía.

### Por qué ningún test lo agarró

El modo local es **1 humano + 3 bots, y el humano siempre es el asiento 0**.
`view.me === 0` en todas las partidas de test, así que `0` y `view.me` eran
indistinguibles. El bug sólo existe cuando `me !== 0`, y eso sólo pasa online.

Tests nuevos, los tres verificados contra el código viejo:

- `mesa: renders with 2 and 3 players, from every seat`
- `comandos: son los del jugador local, no los del asiento 0`
- `resultado: gana el que gana, no siempre el asiento 0`

### La regla

**Cualquier `0` literal en la vista es un bug de multijugador.** El asiento local es
`view.me`; el `0` sólo funciona de casualidad porque el modo local lo hace cierto.
Buscar `=== 0`, `!== 0` y `(0)` en todo lo que renderiza antes de dar por buena una
pantalla nueva.
