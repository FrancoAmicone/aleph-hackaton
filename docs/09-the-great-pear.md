# the-great-pear — cómo funciona la aplicación

El README de la raíz es la puerta de entrada para alguien que **usa** el juego: cómo
instalarlo, las reglas, las teclas, los flags. Este documento es para alguien que va a
**tocar el código o publicar una versión**: qué pieza hace qué, por qué está así, y los
comandos exactos de operación.

El juego vive en `tui/`.

---

## 1. Identidad de la app — lo que no se cambia nunca

```
pear://u9y7y9xqggifyeihhi9i1cswyqdrtdjbg75y6obxxy6hwe6uu66o
```

Esa key es la identidad permanente del proyecto, creada con `pear touch`. Lo que cambia en
cada release es el *verlink* (`pear://0.7.u9y7…`), donde el número es el drive length. Para
instalar se usa la key **sin** versión.

| | |
|---|---|
| `name` / `productName` | `the-great-pear` |
| Binario | `the-great-pear` (`.exe` en Windows) |
| Campo `upgrade` de `package.json` | la key de arriba |

⚠️ **`productName` define el nombre del binario Y el directorio de storage persistente.**
Cambiarlo después del primer release rompe a todos los que ya instalaron: su copia va a
buscar un artefacto con el nombre viejo y no lo va a encontrar nunca. No se toca.

Para ver qué hay publicado de verdad en el link:

```bash
pear info pear://u9y7y9xqggifyeihhi9i1cswyqdrtdjbg75y6obxxy6hwe6uu66o
pear dump --list pear://u9y7y9xqggifyeihhi9i1cswyqdrtdjbg75y6obxxy6hwe6uu66o
```

---

## 2. Arquitectura

Tres capas, todas **en un solo proceso**:

```
bin.js                    cableado: flags, log a archivo, puente red ↔ modelo
├── lib/pear-cli.js       plantilla: pear-runtime, updater OTA, swarm, teardown
├── lib/net/room.js       la sala P2P: Hyperswarm, asientos, heartbeat
└── lib/ui/app.js         el modelo tea: menú → mesa → resultado
    ├── lib/uno/          las reglas (engine puro) y los bots
    └── lib/tea/          el framework TUI (de la plantilla, sin tocar)
```

### Por qué un solo proceso

La red **vivía en un worker de Bare** (`workers/main.js`), spawneado con
`PearRuntime.run('./workers/main.js')`. Andaba con `npm start` y **no andaba en el binario
instalado**, en silencio. Ver el post-mortem completo en `06-troubleshooting.md`; el resumen
es que `bare-pack` sólo empaqueta lo que alcanza por `require` **estático**, y una ruta que
se resuelve en runtime nunca entra al bundle.

Hoy `bin.js` hace `require('./lib/net/room')` — un require literal que bare-pack sí ve — y
maneja la sala en el proceso principal. Desaparecieron un proceso, un spawn y el framing del
IPC.

### Dos swarms, a propósito

`lib/pear-cli.js` levanta su propio Hyperswarm y le hace `store.replicate(connection)` a
**toda** conexión entrante, porque el updater lo necesita. Si el tráfico del juego fuera por
ese mismo swarm, cada jugador de la partida terminaría recibiendo el protocolo de Hypercore.

Por eso `room.js` levanta un swarm aparte. Cuesta un nodo DHT más y separa limpiamente
"distribuir el binario" de "jugar la partida".

### El modelo tea

`lib/tea` es una implementación de la Elm Architecture para terminales Bare: un modelo con
`update(msg) -> [modelo, cmd]` y `view() -> string`. Viene con la plantilla y **no se tocó**.

Todo lo de `lib/uno` y `lib/ui` es nuestro. La regla que sostiene el diseño:

> **El engine sabe las reglas; nadie más.** `game.legalActions(seat)` devuelve todas las
> jugadas disponibles, y tanto la UI como los bots eligen de esa lista. Los bots no pueden
> hacer trampa, la línea de comandos no puede desincronizarse de las reglas, y el juego
> entero se testea sin terminal.

Y la que sostiene el render:

> **Un canvas fijo de 120×38, nunca reflowed.** Toda pantalla se dibuja a ese tamaño exacto
> y se centra en la terminal. Una ventana más chica recibe un pedido de agrandarse, no un
> segundo layout. Por eso las funciones de render no tienen umbrales de ancho ni ramas
> adaptativas.

### El updater nunca escribe en pantalla

Un `console.log` durante una mano rompe la alt-screen. `lib/pear-cli.js` enruta los logs del
wrapper hacia el modelo como Msgs, y `bin.js` convierte los eventos del updater en una línea
de estado en la esquina superior derecha.

---

## 3. Multijugador: lockstep determinístico

Dos a cuatro personas, cada una en su máquina y su red. Sin servidor, sin port forwarding,
sin cuentas.

### Cómo se encuentran

El nombre de sala se hashea a un topic de 32 bytes, con un prefijo de namespace para no
chocar con otra app que hashee el mismo nombre:

```js
this.topic = crypto.data(b4a.from(`the-great-pear:room:${sala}`))
```

Dos personas que tipean el mismo `--room` caen en el mismo topic sin copiarse hex. Como el
hash es del string crudo, **`aleph` y `Aleph` son salas distintas**.

`swarm.join(topic, { client: true, server: true })` — los dos en `true`: todos son iguales,
no hay servidor.

### Cómo se sincronizan

```
anfitrión: crea sala → sortea una semilla → reparte asientos → da el arranque
todos:     new Game({ players: asientos, rng: fromSeed(semilla) })
           → mismo mazo, mismas manos
jugada:    _act() manda la acción por red ANTES de aplicarla local
           el resto la recibe y hace game.apply(action)
```

Por el cable viajan **sólo acciones** — `{ type, seat, card }`, el vocabulario del propio
engine. Cero estado de juego serializado, nada que reconciliar. `lib/rng.js` (mulberry32)
hace posible el reparto determinístico a partir de la semilla.

### El protocolo

**UI → red** (`bin.js` → `room.js`): `join` · `action` · `start` · `leave`

**Red → UI**: `estado` · `peers` · `seats` · `start` · `action` · `peer-lost` · `error`

**Entre peers**: `hello` (nombre) · `seats` (semilla + asientos, sólo del anfitrión) ·
`start` · `action` · `ping` (heartbeat)

### El asiento propio (`this.me`)

El juego nació single-player: **"vos" eras siempre el asiento 0**. Online los cuatro
comparten un solo estado y cada uno es un asiento distinto.

Se evaluó **rotar** los asientos —que cada peer se relabele como 0— y se descartó: dos
jugadores renderizarían `hands[0]` y ambos creerían tener la primera mano repartida.

La solución es `this.me`: el modelo sabe qué asiento es. Con `me = 0` por defecto, el modo
local queda idéntico.

> 🔴 **La regla que se paga cara:** *cualquier `0` literal en la vista es un bug de
> multijugador.* El asiento local es `view.me`; el `0` sólo funciona de casualidad porque el
> modo local lo hace cierto. Antes de dar por buena una pantalla nueva, buscar `=== 0`,
> `!== 0` y `(0)` en todo lo que renderiza. Costó dos partidas trabadas — ver
> `06-troubleshooting.md`.

### Descubrimiento: lento y poco confiable, por diseño

| | |
|---|---|
| Conectar cuando conecta | 6-15 s |
| Falla al primer intento | ~30 % de las veces |
| Asimetría medida entre máquinas | 7.8 s de un lado, 39.5 s del otro |

Por eso `room.js` re-anuncia cada 5 s mientras esté solo (`REFRESH_MS`), y la pantalla dice
`looking for players…` todo el tiempo. **Dar hasta 60 segundos.** El detalle medido está en
`04-p2p.md`.

### Caídas

Hyperswarm va sobre UDX, que es UDP: cerrar la tapa de la laptop no genera ningún `RST` y el
otro lado esperaría para siempre. Los peers se mandan `ping` cada 2 s (`PING_MS`) y dan por
muerto al que no dio señales en 6 s (`DEAD_MS`). Detección medida: 4-6 s.

Sin IA que ocupe un asiento vacío, **la partida se cancela**: todos ven quién se fue y
vuelven al menú.

---

## 4. Correr en desarrollo

```bash
cd tui
npm install
npm start                  # updates deshabilitados
npm run start:updates      # con el updater activo
npm test                   # 138 tests, 840 asserts
```

### El binario `bare` no queda en el PATH

La plantilla trae `"start": "bare bin.js"`, pero **npm no linkea el binario `bare`** a
`node_modules/.bin/`. Le pasa a cualquiera que clone:

```
$ npm start
sh: bare: command not found
```

Ya está arreglado en el repo — los scripts apuntan al shim directo, que es un script de node
con shebang y funciona igual en macOS, Linux y Windows:

```json
"start": "node node_modules/bare-runtime/bin/bare bin.js --no-updates",
"test": "PATH=\"$PWD/node_modules/bare-runtime/bin:$PATH\" brittle-bare test/index.js"
```

### El juego necesita un TTY

Es una TUI: **no se puede redirigir la salida a un archivo.**

```
Uncaught Error: tea: no output stream (not a TTY); pass opts.output
```

No es un bug. Significa que sólo se prueba en una terminal de verdad — ni con `> log.txt`,
ni desde un script sin pty. Para manejarla sin manos está `scripts/drive-tui.py`, que abre
un pty real con `pty.fork()`.

### Probar la red sin abrir el juego

```bash
npm run net:test      -- anfitriona misala anfitrion 40000    # terminal 1
npm run net:test      -- invitado   misala -         37000    # terminal 2

npm run lockstep:test -- anfitriona misala anfitrion 55000    # partida entera
npm run lockstep:test -- invitado   misala -         52000
```

Argumentos: `<nombre> <sala> [anfitrion] [duración-ms]`. Ejercitan `lib/net/room.js` sin TUI
— sirven para probar la red aislada.

> ⚠️ **Dos procesos en la misma máquina no prueban P2P.** HyperDHT toma un atajo por LAN
> (`punches consistent=0`) y nunca ejercita el hole punching. Sirve para verificar el
> cableado, no la red.

---

## 5. Publicar una versión

```bash
cd tui

# 1. subir versión — el updater compara este número
npm version patch

# 2. compilar. CROSS-COMPILA: las 5 plataformas desde cualquier máquina
npm run make:darwin-arm64
npm run make:darwin-x64
npm run make:linux-x64
npm run make:linux-arm64
npm run make:win32-x64

# 3. armar la carpeta de deployment      ← PASO OBLIGATORIO
npm run deploy

# 4. stage — SIEMPRE dry-run primero
pear stage --dry-run pear://u9y7y9xqggifyeihhi9i1cswyqdrtdjbg75y6obxxy6hwe6uu66o ./deploy
pear stage           pear://u9y7y9xqggifyeihhi9i1cswyqdrtdjbg75y6obxxy6hwe6uu66o ./deploy
```

### Qué hace `npm run deploy` (y por qué no `pear build`)

`scripts/deploy.js` arma exactamente la forma que el updater espera:

```
deploy/
  package.json                                   # su `version` es la que se compara
  by-arch/
    darwin-arm64/app/the-great-pear              # binario pelado
    darwin-arm64/app/the-great-pear.app          # + bundle, sólo en darwin
    darwin-x64/app/…
    linux-x64/app/the-great-pear
    linux-arm64/app/the-great-pear
    win32-x64/app/the-great-pear.exe
```

En macOS se publican **dos artefactos por arquitectura**: el binario pelado y un bundle
`<name>.app`. `lib/pear-cli.js` le pide al updater uno u otro según cómo se invocó la copia
que corre (la lógica de `bundleName`): si arrancó desde adentro de un `.app`, el updater
tiene que reemplazar el **directorio del bundle**; si es un binario suelto, reemplaza el
archivo. Publicar los dos hace que cada estilo de instalación encuentre lo suyo.

> **Ojo, esto no está verificado del todo.** `scripts/deploy.js` afirma en sus comentarios
> que el `.app` es *la única* forma que `pear install` busca en darwin, pero una instalación
> real en Mac resolvió `Pathname: /by-arch/darwin-arm64/app/the-great-pear` — el binario
> pelado. Publicar ambos es la opción segura y es lo que hace `npm run deploy`; cuál de los
> dos usa efectivamente `pear install` en cada caso está sin confirmar.

`pear build` está pensado para bundles de Electron y no arma esta estructura para una CLI de
`bare-build`. Por eso el flujo es `npm run deploy`.

### 🔴 El control que no se saltea

El dry-run **tiene que listar los binarios bajo `/by-arch/`**:

```
+ /package.json (+1.8kB)
+ /by-arch/darwin-arm64/app/the-great-pear (+143.3MB)
+ /by-arch/darwin-arm64/app/the-great-pear.app/Contents/MacOS/the-great-pear (+143.3MB)
+ /by-arch/linux-x64/app/the-great-pear (+177.6MB)
…
```

**Si no los ves, NO stagees.** Si stageás `out/` directamente en vez de `deploy/`, se
publica **todo menos los binarios** — porque `out/` está en `.gitignore` y `pear stage`
respeta gitignore. Falla en silencio: el juez instala y no le funciona nada.

### Cross-compilación

La doc oficial dice *"Build each platform's binary on a matching host"*. **Es falso.**
Verificado: las 5 plataformas salen de un Mac ARM, y el binario linux-x64 corre en Ubuntu.
Una sola máquina compila para todo el equipo.

---

## 6. Seed — dejarlo corriendo

```bash
# macOS
nohup caffeinate -is pear seed pear://u9y7y9xqggifyeihhi9i1cswyqdrtdjbg75y6obxxy6hwe6uu66o \
  > ~/seed-juego.log 2>&1 &

# Linux
nohup systemd-inhibit --what=idle:sleep \
  pear seed pear://u9y7y9xqggifyeihhi9i1cswyqdrtdjbg75y6obxxy6hwe6uu66o \
  > ~/seed-juego.log 2>&1 &
```

- `nohup` → sobrevive al cierre de la terminal
- `caffeinate -is` / `systemd-inhibit` → impide que la máquina se duerma

Verificar:

```bash
grep -E "announced|drive length" ~/seed-juego.log
```

```
^_^ announced
... drive length 7               # sube con cada stage
... semantic version 2.0.0       # la que estés publicando
... NAT type consistent
```

Monitorear con `tail -f ~/seed-juego.log`, matar con `pkill -f "pear seed"`.

⚠️ **Tiene que seguir corriendo durante todo el juzgado.** Si se corta, nadie instala ni
actualiza — el error que ve el otro lado es `Network Timeout 30s`. Conviene un segundo
seeder de respaldo en otra máquina.

📌 **No hay que reiniciarlo al publicar una versión:** detecta el drive length nuevo solo.

---

## 7. Instalar desde otra máquina

```bash
pear install pear://u9y7y9xqggifyeihhi9i1cswyqdrtdjbg75y6obxxy6hwe6uu66o
```

Salida esperada (de una corrida real; los números varían):

```
Installing... pear://u9y7y9xq…
[ Peers: 1 ] [ ⬇ 124.4MB - 55.3MB/s ]
App: the-great-pear
Version: 2.0.0
Pathname: /by-arch/darwin-arm64/app/the-great-pear
Target: /Users/<vos>/.local/bin/the-great-pear
Installed
```

**`pear install` NO abre el juego.** Deja el binario en `~/.local/bin/`; se corre por nombre:

```bash
the-great-pear
```

Si dice `command not found`, falta el PATH:

```bash
export PATH="$HOME/.local/bin:$PATH"      # agregalo a ~/.zshrc o ~/.bashrc
```

### ⚠️ Reinstalar son dos pasos

```
Refusing to overwrite existing: /Users/…/.local/bin/the-great-pear
To reinstall, manually remove then rerun command
```

```bash
rm -f ~/.local/bin/the-great-pear      # en Windows, borrar el .exe
pear install pear://u9y7y9xq…
```

Sin el `rm`, `pear install` falla y uno **queda en la versión vieja creyendo que
reinstaló**.

### Si no llega a ningún peer

La descarga son ~140 MB; el timeout por defecto es corto:

```bash
pear install --timeout 300 pear://u9y7y9xq…
```

O bajar el binario crudo sin instalar:

```bash
pear dump pear://u9y7y9xq… ./pear-dl
./pear-dl/by-arch/linux-x64/app/the-great-pear
```

---

## 8. El OTA

El mecanismo general está en `03-deploy-ota.md`. Lo específico de esta app:

- **`delay: 5000`** en `lib/pear-cli.js`. El default de `pear-runtime` es `3600000` ms:
  hasta **una hora** de espera aleatoria antes de siquiera buscar una versión nueva. Sirve
  para no golpear el swarm con miles de clientes a la vez, pero hace imposible demostrar el
  OTA en vivo.
- **La ruta del ejecutable sale de `os.execPath()`**, no de `path.resolve(Bare.argv[0])`.
  Ver el post-mortem en `06-troubleshooting.md`.
- Con una copia corriendo, el update se descarga **mientras jugás**: la mano en curso no se
  interrumpe y el binario nuevo toma el control en el siguiente arranque. En la esquina
  aparece `⇣ downloading update…` → `⇣ applying update…` → `✓ new version ready — restart
  to play it`.

> 🔴 **Un cambio en el updater sólo surte efecto a partir de la versión SIGUIENTE.** La copia
> instalada corre su propio código: bajar el `delay` en la v2 no sirve si la v1 salió con el
> default, y una v1 con la ruta rota no puede aplicar ni siquiera el update que trae el
> arreglo. Un updater roto **no puede arreglarse a sí mismo** — hay que reinstalar a mano una
> vez.

### Verificar que un update aterrizó

```bash
the-great-pear --version
# the-great-pear v2.0.11
```

Responde **antes** de construir el Corestore y el Hyperswarm: no levanta nada de red sólo
para imprimir una línea. Es la única forma de confirmar un OTA sin abrir la TUI.

> **No mires el tamaño del storage.** El corestore reutiliza bloques y se queda plano aunque
> la descarga esté en curso — 5 minutos viendo 135 MB fijos mientras el update se aplicaba
> igual. **`--version` es la única señal confiable.**

---

## 9. Mirar la red mientras se juega

La TUI se adueña de la pantalla entera, así que un `console.log` o no se ve o corrompe el
render. `--log <archivo>` vuelca cada mensaje que cruza:

```bash
the-great-pear --room aleph --name franco --log ~/red-$(date +%H%M%S).log
tail -F ~/red.log      # -F, no -f: el archivo se trunca al arrancar
```

```
>>  lo que la UI le pide a la red        <<  lo que la red le devuelve
++  el updater                           !!  un error
```

| Última línea | Dónde está el problema |
|---|---|
| sólo el encabezado | no se apretó CREATE/JOIN todavía |
| `>> join` y nada más | la capa de red no se instanció |
| `buscando` / `looking` y nada más | el swarm no levanta |
| `anunciado`, nunca `peers` | discovery: no se encuentran en el DHT |
| `peers` pero nunca `seats` | conectaron, el `hello` no cruza |
| `seats` y no `start` | falta que el anfitrión apriete ENTER |

Comparar el `topic` de los dos peers: si difiere, escribieron distinto el `--room`.

> **Un archivo de log por corrida.** Dos instancias apuntando al mismo `--log` se pisan: el
> archivo queda con dos encabezados y las líneas intercaladas, ilegible.

---

## 10. Estado verificado

| | |
|---|---|
| Key definitiva y `productName` congelados | ✅ |
| 5 plataformas cross-compiladas desde un Mac | ✅ |
| `pear stage` + `pear seed` | ✅ |
| `pear install` desde otra máquina y otra red | ✅ Linux y Windows |
| **OTA end-to-end sobre el juego** | ✅ 2.0.4 corriendo → 2.0.5 sola, sin reinstalar |
| **Multijugador entre máquinas y redes distintas** | ✅ mano completa, 16 acciones |
| Lockstep, partida entera | ✅ huellas idénticas tras 245 acciones |
| Tests | ✅ 138/138 (840 asserts) |

### Las mediciones que importan

| Qué | Resultado |
|---|---|
| Conexión entre peers | 6-15 s (medido 7.8 s / 39.5 s en un mismo par) |
| Fallo de discovery al primer intento | ~30 % |
| Caída abrupta (`kill -9`) detectada | 4-6 s por heartbeat |
| Cierre limpio detectado | inmediato |
| Descarga del binario | ~140 MB |
| OTA aplicado tras publicar | segundos |
