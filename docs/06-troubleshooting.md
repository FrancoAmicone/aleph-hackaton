# Troubleshooting

Fuente oficial: https://docs.pears.com/how-to/troubleshooting/

Este archivo tiene dos mitades: los problemas genéricos del stack, y los **post-mortems de
los bugs que efectivamente nos pasaron**. La segunda mitad vale más que la primera: son
bugs que costaron horas y que ninguna doc oficial anticipa.

## Checklist rápido cuando algo no anda

1. ¿El `pear seed` está corriendo? (causa #1 de "no me instala")
2. ¿La key en `package.json` → `upgrade` es la misma que estás seedeando?
3. ¿Corriste `npm version` antes de re-stagear? Sin bump no hay update que detectar.
4. ¿Corriste `npm run deploy` después de `npm run make`? Stagear `out/` publica sin binarios.
5. ¿Estás corriendo con `--updates`? El default en dev es `--no-updates`.
6. ¿Cambiaste `name` o `productName` después del primer release? Rompe el path de storage.
7. Sidecar en estado raro → `pear sidecar shutdown` y reintentar.
8. `pear info pear://<key>` para confirmar qué hay realmente publicado.
9. Dos máquinas en la misma red NAT a veces no se ven — probar una por hotspot.
10. Probá **el binario compilado**, no sólo `npm start`. Hay bugs que sólo existen ahí.

---

# Parte 1 — Problemas del stack

## Unirse a un topic de Hyperswarm tarda mucho

Causas posibles (doc oficial):
- Redes con **NAT aleatorio** necesitan nodos adicionales para facilitar las conexiones.
- **Instancias de Hyperswarm que no se destruyeron** en el teardown impiden la limpieza de
  los registros del HyperDHT. → Siempre `await swarm.destroy()` al salir.
- **Firewalls** bloqueando tráfico.

> **MEDIDO (spike 2):** dos peers en la misma máquina, 10 corridas por escenario.
> Con teardown sucio (`kill -9`): **4/10** conectaron. Con teardown limpio
> (`await swarm.destroy()`): **7/10**. El teardown sucio **casi duplica los fallos**.
> Y aún limpio, 3 de 10 no conectan ni esperando 40 s. Cuando conecta, ~7 s.
> **Conclusión: hace falta retry del `join`.** Detalle en `04-p2p.md`.

> **[NUESTRO] El wifi de una hackathon es el peor caso** (NAT simétrico, portal cautivo,
> puertos bloqueados). Plan B: hotspot de celular. Y probar la conectividad entre dos
> máquinas **temprano**, no a las 3 AM.

## El DHT devuelve claves de peers muertos

Las corridas viejas siguen anunciadas un rato y el DHT te las devuelve como si fueran peers
vivos. Al debuggear, "encontré un peer" no significa "encontré a mi compañero": puede ser tu
propio proceso de hace diez minutos. Comparar la clave contra la que imprime el otro lado.

## `Uncaught Error: connection reset by peer` y se muere el proceso

Stack apuntando a `FramedStream._destroy` / `streamx`. **Falta el handler de error en el
stream que envuelve al `conn`**, no en el `conn`. Hay que registrar los dos:

```javascript
conn.on('error', ...)
framed.on('error', ...)   // este es el que falta siempre
```

Síntoma en un juego: un jugador cierra la ventana y al otro se le cae el proceso.

## El proceso no termina nunca / queda colgado al salir

Falta soltar algún handle propio. Un `setInterval` vivo (el game loop, el heartbeat, el
refresh del discovery) mantiene el loop de Bare aunque el swarm ya esté destruido.
`clearInterval()` en el teardown.

Si además hay un worker de `PearRuntime.run` activo, `Bare.exit()` a secas se cuelga: hay que
cerrar la App primero (`app.exit(code)`).

## El peer se cayó y el otro no se entera

Esperado: Hyperswarm va sobre UDX (UDP), no hay `RST` que avise. Un cierre ordenado se
detecta al instante; un `kill -9` **no se detectó en 10 s**. Hace falta un heartbeat de
aplicación. Ver `04-p2p.md`.

## `INVALID_URL: Invalid URL 'pear://<YOUR_KEY_HERE>'` (exit 134, core dumped)

La plantilla recién clonada trae ese placeholder en `package.json` → `upgrade`. El worker
crashea y **se lleva el proceso puesto**. `pear touch` + `npm pkg set upgrade=pear://<key>`
no es opcional ni para correr en dev.

## `kill` a un proceso de Bare no hace nada

`./node_modules/.bin/bare` es un wrapper de **Node** con `suppressSignals: true`: registra
handlers no-op para SIGTERM/SIGINT/SIGHUP y spawnea el binario real como hijo.

- Ctrl+C en una terminal anda bien (la señal va a todo el process group).
- Matar por PID al wrapper no propaga nada al hijo. En scripts, usar el binario real:
  `node_modules/bare-runtime-<platform>-<arch>/bin/bare`.

## `sh: bare: command not found`

npm no linkea el binario `bare` a `node_modules/.bin/`. Apuntar los scripts al shim directo
(`node node_modules/bare-runtime/bin/bare`) o poner el directorio en el PATH del script.
Ya está resuelto en `tui/package.json` — ver `09-the-great-pear.md`.

## Faltan módulos builtin al correr con Bare

Bare no incluye los módulos de Node por default. Usar las alternativas `bare-*`, import maps
para librerías cross-runtime, o aliases de npm para dependencias que asumen Node.
Tabla completa en `05-bare-runtime.md`.

## `AddonError: ADDON_NOT_FOUND`

- El addon nativo no está disponible para la plataforma/arquitectura actual.
- El addon no se linkeó durante la compilación.
- Caché de build → limpiar y recompilar.

---

# Parte 2 — Post-mortems: los bugs que nos pasaron

## 🔴 El worker que nunca entró al binario (v2.0.7)

**El más caro del proyecto.** El multijugador no arrancaba nunca desde el binario instalado,
y andaba perfecto con `npm start`.

**Síntoma:** en el log sale el `>> join` y **no vuelve absolutamente nada**. Ni siquiera
`{"t":"estado","estado":"buscando"}`, que `room.join()` emite de forma **sincrónica** antes
de tocar la red.

**Diagnóstico:** si no vuelve ni el evento sincrónico, el problema NO es P2P. La capa de red
nunca se instanció.

**Causa:** `PearRuntime.run('./workers/main.js')` va a `bare-sidecar`:

```js
this._process = spawn(bare, [entry, ...args], ...)
```

Spawnea **otro proceso** y le pasa la ruta como argumento; ese proceso la resuelve contra su
**cwd**. En un binario standalone no existe ningún `workers/main.js` en disco. Y `bare-pack`
tampoco lo empaquetó: escanea `require`s **estáticos**, y `'./workers/main.js'` es un string
que sólo existe en runtime.

**Por qué fue silencioso:** `run()` reenvía el stderr del worker como `{ type: 'worker' }`, y
el reductor de `app.js` lo tiraba en su `default:`. El spawn fallaba y nadie se enteraba.

**Cómo verificarlo sin correr nada** — buscar strings del módulo dentro del binario:

```bash
strings -a out/darwin-arm64/the-great-pear | grep -c "the-great-pear:room:"
# 0 = room.js NO está adentro     1 = sí está
```

**Arreglo:** sacar el worker. `bin.js` hace `require('./lib/net/room')` — un require estático
que bare-pack sí ve — y maneja la sala en el proceso principal.

> ### La lección general
> **Cualquier archivo que se cargue por una ruta resuelta en runtime no entra al bundle.**
> Vale para workers, plugins y `require` dinámico. El único camino seguro es un `require`
> literal en el árbol de dependencias del entrypoint.
>
> Y **siempre probar el binario compilado**, no sólo `npm start`. Este bug era invisible
> desde el código fuente.

## 🔴 La ruta del ejecutable rompía todos los updates

`lib/pear-cli.js` resolvía la ruta del binario así:

```js
path.resolve(Bare.argv[0])     // ❌
```

Cuando el binario se invoca **por nombre** —que es lo normal, porque `pear install` lo deja
en el PATH— `argv[0]` es sólo `the-great-pear`, sin ruta, y `resolve()` lo pega contra el
directorio actual. En Windows además pierde el `.exe`.

Síntoma real (Windows):

```
✗ falló la actualización: ENOENT: no such file or directory,
  rename "\\?\C:\Users\rroma\the-great-pear" -> ...
```

Su carpeta home, y sin extensión: ese archivo no existe.

**Reproducido con un binario sonda invocado por nombre desde otro directorio:**

```
argv[0]           : pathprobe
path.resolve(a0)  : /private/tmp/pathprobe            ← inventada
os.execPath()     : /private/tmp/fakebin/pathprobe    ← la real
```

**Fix:** `os.execPath()`, que devuelve la ruta real sin importar cómo se invocó. `argv[0]`
queda sólo como último recurso.

**Corolario:** las versiones que ya salieron con el bug **no pueden aplicar el update que lo
arregla** — llevan el código malo compilado adentro. Hubo que reinstalar a mano una vez.

## ⚠️ `pear install` se niega a sobrescribir

```
Refusing to overwrite existing: /Users/…/.local/bin/the-great-pear
To reinstall, manually remove then rerun command
```

Reinstalar es en dos pasos: `rm -f ~/.local/bin/the-great-pear` y después el `pear install`.
Sin el `rm`, el install falla y **uno queda en la versión vieja creyendo que reinstaló**.

## 🔴 Los asientos hardcodeados en 0 — dos partidas trabadas

El juego nació single-player con "vos" = asiento 0. Al pasar a online quedaron literales `0`
en la vista. Dos rondas de bugs:

**Primera:** `renderMesa` tenía las sillas fijas (`seatLine(game, 2)`, `flankBeside(game, 3)`).
Con 2 jugadores `game.hands[2]` es `undefined` y reventaba en `.length`:

```
view error: Cannot read properties of undefined (reading 'length')
```

Además las posiciones eran **absolutas**, no relativas a `view.me`: online, el invitado veía
al anfitrión sentado abajo — el lugar que tiene que ocupar uno mismo.

**Segunda, la que trabó la mano en el `+4`:** cinco lugares calculaban la vista para el
asiento 0 en vez de para `view.me`.

| Archivo:línea | Código viejo | Qué rompía |
|---|---|---|
| `screen.js:393` | `currentActor() === 0` | tu mano no se resaltaba en tu turno |
| `screen.js:475` | `legalActions(0)` | **toda la línea de comandos** |
| `screen.js:550` | `chooser === 0` | el cartel "Elegí el color" |
| `screen.js:554` | `currentActor() !== 0` | el "está pensando…" |
| `result.js:60` | `winner() === 0` | el invitado veía DERROTA al ganar |

El que trabó la partida es `legalActions(0)`: el invitado jugó el `+4`, entró en
`choose-color`, y la línea de comandos le mostraba lo que podía hacer **el anfitrión**. Nunca
vio `R/Y/G/B`.

Detalle cruel: el *handler de teclas* sí usaba `this.me` correctamente. Apretando `R` a
ciegas funcionaba. La UI simplemente no se lo decía.

**Por qué ningún test lo agarró:** el modo local es 1 humano + 3 bots, y el humano siempre es
el asiento 0. `view.me === 0` en todas las partidas de test, así que `0` y `view.me` eran
indistinguibles. El bug sólo existe cuando `me !== 0`, y eso sólo pasa online.

Tests agregados, los tres verificados contra el código viejo:

- `mesa: renders with 2 and 3 players, from every seat`
- `comandos: son los del jugador local, no los del asiento 0`
- `resultado: gana el que gana, no siempre el asiento 0`

> ### La regla
> **Cualquier `0` literal en la vista es un bug de multijugador.** El asiento local es
> `view.me`; el `0` sólo funciona de casualidad porque el modo local lo hace cierto.
> Y **el modo local con bots no es una prueba del modo online**: siempre tiene 4 jugadores y
> el asiento local siempre es 0 — justo las dos suposiciones que el online rompe.

## Dos bugs de carrera en el lobby

**1. El invitado se creía asiento 0 por un instante.** El anfitrión reparte asientos apenas
se abre la conexión, antes de que llegue el `hello`; en esa primera lista el invitado no
figura y `_emitSeats` caía al default `0`. Si un `start` se colara en esa ventana, dos
jugadores jugarían el mismo asiento y la partida divergiría.
**Arreglo:** si mi clave no está en la lista y no soy el anfitrión, no emito nada.

**2. ENTER mientras esperabas reiniciaba el discovery.** Sin asientos todavía, ENTER caía en
la rama de join y **destruía el swarm para crear otro**. Como el discovery tarda 6-15 s y
falla ~30 % al primer intento, el que se impacientaba se saboteaba solo.
**Arreglo:** con sala abierta, ENTER sin asientos sólo muestra "esperando jugadores…".

## Cómo NO medir si un update está descargando

Mirar si crece el storage (`~/Library/Application Support/<app>/pear-runtime/`) **no sirve**:
el corestore reutiliza bloques y el tamaño queda plano aunque la descarga esté en curso.
Cinco minutos viendo 135 MB fijos mientras el update se aplicaba igual.

**La única señal confiable es `the-great-pear --version`.**

## Un test en UNA sola máquina no prueba nada de P2P

HyperDHT toma un atajo por LAN (`punches consistent=0`) y nunca ejercita el hole punching.
Dos procesos en la misma máquina sirven para verificar el cableado, no la red.

---

## Dónde pedir ayuda

- Chat de Keet del track (link completo en `08-links.md`)
- https://github.com/holepunchto — issues de cada repo
