# Bitácora — qué se hizo, qué falló

Sesión del **22-ago-2026**. Orden cronológico real.

---

## ✅ Entorno verificado

```
pear      v3.2.0
node      v22.14.0
npm       11.4.1
bare      NO estaba en el PATH global (no hace falta, el proyecto lo trae)
```

`pear -v` confirmó que la CLI expone: `touch, seed, stage, build, provision, multisig, info,
dump, install, data`. **No aparecen `run` ni `init`** — confirma que la doc vieja que los menciona
está desactualizada. Bien que lo verificamos antes de escribir nada.

---

## ⚠️ Error 1 — `npm install` cortó con ECONNRESET

```
npm error code ECONNRESET
npm error network read ECONNRESET
```

**Causa:** blip de red, no un problema real del proyecto.
**Fix:** reintentar. Al segundo intento: `added 212 packages in 4s`.

---

## ✅ Error 2 — `sh: bare: command not found` (RESUELTO en el repo)

```bash
$ npm start
> bare bin.mjs --no-updates
sh: bare: command not found
```

**Causa:** `bare-runtime` declara `"bin": { "bare": "bin/bare" }` en su package.json, pero npm
**no crea el symlink** en `node_modules/.bin/`. El binario existe y funciona
(`node_modules/bare-runtime/bin/bare --version` → `v1.29.4`), simplemente no queda linkeado.

**Verificado que es reproducible:** instalación limpia en un directorio vacío con el mismo
`package.json` + `package-lock.json` → `.bin/` contiene `bare-build, bare-link, bare-pack,
bare-unpack, brittle…` pero **no `bare`**. O sea: le pasa a cualquiera que clone.

**Primer fix (manual, descartado):**
```bash
ln -sf ../bare-runtime/bin/bare node_modules/.bin/bare
```
Funciona pero hay que rehacerlo tras cada `npm install` y no es cross-platform.

**Fix definitivo (aplicado):** `bin/bare` es un script de node con shebang:

```js
#!/usr/bin/env node
require('../lib/spawn')(__filename, { stdio: 'inherit', ... })
```

Entonces se puede invocar por path directo, sin depender del link:

```json
"start": "node node_modules/bare-runtime/bin/bare bin.mjs --no-updates",
"start:updates": "node node_modules/bare-runtime/bin/bare bin.mjs --updates"
```

Funciona en macOS, Linux y Windows. Verificado borrando el symlink y corriendo `npm start`: anduvo.

---

## ✅ Template verificado sin modificar

```
Updates: disabled
CLI ready. Press Ctrl+C to stop.
Application storage: /var/folders/.../T/pear/test-msg/app-storage
Hello from worker
```

Baseline OK antes de tocar código.

---

## ✅ Hallazgo — el worker del template es un paquete npm

`workers/main.js` del template es literalmente:

```js
require('hello-pear-worker')
```

La doc oficial dice que ese archivo "tiene el código peer-to-peer", pero en realidad está en el
paquete [`hello-pear-worker`](https://github.com/holepunchto/hello-pear-worker).
Lo leímos de `node_modules/` y lo inlineamos, porque necesitamos editarlo.

**Esa fuente es la mejor referencia de cómo se usa `PearRuntime` correctamente.**

---

## ✅ Hallazgo — branches no documentadas

`git branch -r` del template:

```
origin/main
origin/variant/single-thread
origin/variant/daemon
origin/tui              ← no está en la doc oficial
origin/simplify         ← no está en la doc oficial
origin/add-agents-main
origin/add-agents-single
origin/add-agents-daemon
```

**`origin/tui` puede ahorrarnos horas en el juego.** Vale la pena mirarla antes de escribir
el render desde cero.

---

## ✅ Verificado — `crypto.data()` para salas por nombre

```js
crypto.data(b4a.from('test-msg:general'))
// -> Buffer de 32 bytes
// -> 26d4b592d663ddc228954a791019326ea46890b06247e0dac2c15acbb746b0f0
// -> determinístico: mismo input = mismo output
```

Sirve para derivar el topic desde un nombre de sala legible. Confirmado empíricamente, no asumido.

---

## ✅ Error 3 — RESUELTO: "los peers no se conectan" era un test mal hecho

### Cómo se veía el problema

Primer test: dos instancias en la misma máquina, misma sala, storage separado, **ventana de 20s**.
Los dos derivaron el mismo topic y anunciaron OK, pero ningún evento `connection`.

### La hipótesis que planteé estaba MAL

Dije que era probablemente **NAT hairpinning** (dos peers detrás de la misma IP pública que no se
pueden ver). **Falso.** Lo di como lo más probable sin haberlo medido.

### Cómo se descartó — diagnóstico incremental

Se aislaron las variables de a una, cada una con su propio test:

| # | Qué se probó | Resultado |
|---|---|---|
| 1 | Hyperswarm puro en **node**, 1 swarm, misma máquina | ✅ conectó en **6s**, ping bidireccional |
| 2 | Hyperswarm puro en **bare**, 1 swarm | ✅ conectó en **5.7s** |
| 3 | Hyperswarm en **bare, DOS swarms** (como el worker) | ✅ conectó en **5.7s** |
| 4 | **La app real**, ventana de 45s | ✅ conectó, mensajes en ambas direcciones |
| 5 | La app real, midiendo tiempo | ✅ **7 segundos** |

Datos del DHT en todas las corridas:
```
bootstrapped=true  host=200.80.213.210  firewalled=true
```

> `firewalled=true` es **normal** y no impide nada — es el estado esperado detrás de un NAT
> doméstico. Hyperswarm hace hole punching justamente para eso. No confundirlo con un error.

### Conclusión real

**El código estaba bien. El test estaba mal.** La conexión tarda ~6-7s en el caso típico y yo
cortaba a los 20.

> ⚠️ **Corregido más abajo:** dije acá que la primera corrida fue "un fallo transitorio no
> reproducible". **Era reproducible.** Es el race de announce/lookup, que puede llevar el tiempo
> de conexión a 40s+. Ver el hallazgo de varianza al final de este documento.

### Lecciones

1. **NAT hairpinning no es un problema acá.** Dos peers en la misma máquina y en la misma red
   se conectan sin drama. Descartado con evidencia.
2. **Dar 30-60 segundos antes de concluir que algo no conecta.** El primer arranque puede ser lento.
3. **Aislar variables antes de teorizar.** Los tests 1-3 tardaron 3 minutos y descartaron
   tres hipótesis que yo había puesto en orden equivocado.

---

## ⚠️ Error 4 — script de diagnóstico fuera del proyecto

Primer intento de diagnóstico escrito en un directorio temporal → `Cannot find module 'hyperswarm'`.
Resolución de módulos de node: el script tiene que estar **dentro de `app/`** para ver `node_modules`.

Los scripts quedaron en `app/diag-node.js` y `app/diag-bare.js`. Ver `05-diagnostico-red.md`.

---

## ⚠️ Error 5 — `Bare.env` no existe

```
Uncaught TypeError: Cannot read properties of undefined (reading 'DUR')
```

**Aclaración importante: esto NO era una variable de entorno que Pear pidiera.**
Era `DUR`, una variable **mía**, inventada para el script de diagnóstico, para poder cambiar
cuántos segundos corría el test sin editar el archivo:

```bash
DUR=45000 bare diag-bare.js A 1     # lo que intenté hacer
```

En Node eso se lee con `process.env.DUR`. Escribí `Bare.env.DUR` asumiendo que el global `Bare`
tendría un `env` — **no lo tiene**.

**La app no necesita ninguna variable de entorno.** Toda su configuración va por flags de CLI
(`--room`, `--storage`, `--log`, `--no-updates`).

### Cómo se leen variables de entorno en Bare

```js
const process = require('bare-process')
process.env.MI_VARIABLE
```

Es decir: igual que en Node, pero **importando `bare-process` explícitamente**.
No hay `process` global, y `Bare.env` no existe.

**Fix aplicado:** en vez de variable de entorno, la duración pasó a ser un argumento posicional
(`Bare.argv[5]`), que es más simple y no depende de ningún módulo.

Otro caso del gotcha general: **Bare no es Node**. Ver `../../docs/05-bare-runtime.md`.

---

## ✅ Mejora — agregado `--log` para seguir en tiempo real

La app solo imprimía a stdout, sin archivo. Se agregó:

```bash
npm start -- --room hackaton --log /tmp/peerA.log
tail -f /tmp/peerA.log
```

Escribe con timestamps `HH:MM:SS.mmm`, trunca en cada arranque, y manda `yo > ...` solo al
archivo (la terminal ya hace eco de lo que tipeás). Detalle en `06-logs-y-monitoreo.md`.

Implementado con `bare-fs` (`appendFileSync`), envuelto en try/catch para que un fallo de
escritura no tumbe la app.

---

## 🔍 Hallazgo — el tiempo de conexión tiene MUCHA varianza

Al probar el `--log` apareció una corrida que **no conectó en 25 segundos**, contradiciendo
el "7s" medido antes. Se midió en serio:

**Tres corridas, sin mitigación: `43s`, `7s`, `6s`.**

### Causa

Race de arranque. Cuando dos peers arrancan al mismo tiempo:

```
A: announce ──► DHT
A: lookup   ──► DHT   → todavía no ve a B (el announce de B no propagó)
B: announce ──► DHT
B: lookup   ──► DHT   → encuentra a A ✅
```

Si el lookup de A sale antes de que el announce de B se propague, A depende de que B lo encuentre.
Si **ambos** lookups salen temprano, hay que esperar el refresh automático del DHT, que es lento.

> Esto explica también el "falso negativo" del error 3: **no fue transitorio, fue esta varianza.**
> Corregido lo que decía antes esa sección.

### Mitigación aplicada

`swarm.join()` devuelve un objeto de discovery con `refresh()`. Se fuerza cada 5 segundos
mientras no haya nadie conectado:

```js
const discovery = chatSwarm.join(topic, { client: true, server: true })

const refresher = setInterval(() => {
  if (conns.size > 0) return
  discovery.refresh({ client: true, server: true }).catch(() => {})
}, 5000)
```

**Cuatro corridas con la mitigación: `6s`, `11s`, `7s`, `6s`.**

Peor caso: de 43s a 11s. Muestras chicas, pero el mecanismo explica la mejora.

⚠️ **Para el juego:** el lobby necesita un "buscando jugadores…". No asumir conexión instantánea.

---

## ✅ Estado del chat: FUNCIONA

Verificado el 22-ago, dos peers, misma máquina:

```
========== A ==========
* sala "prueba9" lista | sos 7a81a8 | topic 6432db9ebe5d…
* 70f37d entró a la sala (1 conectado/s)
70f37d > te leo, soy B

========== B ==========
* 7a81a8 entró a la sala (1 conectado/s)
* sala "prueba9" lista | sos 70f37d | topic 6432db9ebe5d…
7a81a8 > hola soy A
```

Conexión bidireccional, mensajes cruzando en ambos sentidos, ~7 segundos hasta conectar.

**Falta confirmar entre máquinas distintas** — no porque se dude del código, sino porque el
escenario del juzgado es ese y hay que validarlo. Ver `04-probar-con-equipo.md`.

---

## ⚠️ Error 6 — `warning: adding embedded git repository: test-msg/app`

Al hacer `git add test-msg/`, git avisó que `test-msg/app` era **un repo dentro de otro repo**
(quedó así porque lo clonamos con `git clone`), y sugirió usar `git submodule add`.

**Submódulo era la opción incorrecta.** Un submódulo guarda solo un *puntero* al repo original
de Holepunch: quien clonara nuestro repo recibiría el `hello-pear-bare` original **sin ninguno de
nuestros cambios**, o directamente un directorio vacío.

**Fix aplicado:** eliminar el `.git` interno para que `app/` sean archivos normales del repo.

```bash
git reset -q test-msg/app          # sacar el gitlink del índice
rm -rf test-msg/app/.git           # borrar el historial del template
git add -A
```

**Partimos de este commit del template** (queda registrado acá porque ese historial ya no existe
localmente):

```
repo    https://github.com/holepunchto/hello-pear-bare
branch  main
commit  e391b8a8330e514df4fe37cd6dfc7572a4d0e21e
msg     isDev Windows fix (#38)
fecha   Thu Jul 30 09:30:48 2026 -0300
```

También se agregó un `.gitignore` en la raíz (`node_modules/`, `out/`, `dist/`, `*.log`, `.DS_Store`).
Verificado antes de commitear: **0 archivos de `node_modules` en el índice**, y `package-lock.json`
sí incluido para que las instalaciones sean reproducibles.

---

## Pendientes inmediatos

1. ⬜ Confirmar el chat **entre dos máquinas** (validación, no debug).
2. ⬜ `npm run make` — ver si el binario buildea.
3. ⬜ Resolver si una CLI necesita `pear build` + `pear provision` o si alcanza con `stage`.
4. ⬜ `pear seed` + `pear install` desde otra máquina.
5. ⬜ OTA end-to-end. Ojo con el `delay` de 1 hora por defecto.
