# Paso a paso — de cero a OTA

Todos los comandos se corren desde `test-msg/app/` salvo que diga otra cosa.
Los pasos ✅ ya están hechos. Los ⬜ faltan.

---

## ✅ Paso 0 — Verificar que Pear está instalado

```bash
pear -v
```

Salida real que obtuvimos:
```
pear://0.37.smw4thqaqed9iq6bae7a9cxd4fesruixgkafe38jny33ahs33igy / v3.2.0
Key=pear://smw4thqaqed9iq6bae7a9cxd4fesruixgkafe38jny33ahs33igy
SemVer=3.2.0
Fork=0
Length=37
```

**Ojo:** es `-v`, no `--version`. `pear --version` tira "Unrecognized Flag".

Si no está instalado: `curl https://install.pears.com/pear.sh | sh`

> 📖 `../../docs/02-pear-cli.md`

---

## ✅ Paso 1 — Clonar el template

```bash
mkdir -p test-msg
git clone https://github.com/holepunchto/hello-pear-bare test-msg/app
cd test-msg/app
npm install
```

El track **exige** partir de `hello-pear-bare`. Usamos la branch `main` (updater en worker thread),
que es la indicada para programas long-lived como un chat o un juego.

> Branches disponibles: `main`, `variant/single-thread`, `variant/daemon`, y además existen
> `tui`, `simplify`, `add-agents-*` que no están documentadas oficialmente.
> **`origin/tui` puede ser muy útil para el juego** — vale mirarla.

> 📖 `../../docs/01-quickstart.md`

---

## ✅ Paso 2 — El binario `bare` (ya resuelto en el repo)

El template traía `"start": "bare bin.mjs --no-updates"`, pero **npm no linkea** el binario `bare`
a `node_modules/.bin/`. Verificado con una instalación limpia: **es reproducible**, le pasa a todos.

```
$ npm start
sh: bare: command not found
```

**Ya está arreglado en el repo.** Los scripts apuntan al shim directo:

```json
"start": "node node_modules/bare-runtime/bin/bare bin.mjs --no-updates",
"start:updates": "node node_modules/bare-runtime/bin/bare bin.mjs --updates"
```

`bin/bare` es un script de node con shebang, así que invocarlo con `node <path>` funciona igual
en macOS, Linux y Windows. **No hace falta ningún symlink.**

> Si preferís tener `bare` a mano en la terminal:
> `ln -sf ../bare-runtime/bin/bare node_modules/.bin/bare`
> Es opcional, y hay que rehacerlo cada vez que se borre `node_modules`.

---

## ✅ Paso 3 — Verificar el template SIN tocar nada

Antes de escribir una línea de código propio, confirmar que el boilerplate arranca:

```bash
npm start
```

Salida esperada:
```
Updates: disabled

CLI ready. Press Ctrl+C to stop.

Application storage: /var/folders/.../T/pear/test-msg/app-storage
Hello from worker
```

Si esto no sale, no tiene sentido seguir.

---

## ✅ Paso 4 — Generar la key del proyecto

```bash
pear touch
```

Salida real:
```
pear://9nbjjp5jmtxxq3jj8ko7z4sdfnohucgwyjsxspdpsnuc8yf136my
```

**Esta key ES el proyecto.** Es la dirección donde vive la app en la red P2P.
Todo el mundo la va a usar para instalar. Guardarla.

`pear touch` solo genera el par de claves, no toca la red.

---

## ✅ Paso 5 — Configurar package.json

```bash
npm pkg set upgrade=pear://9nbjjp5jmtxxq3jj8ko7z4sdfnohucgwyjsxspdpsnuc8yf136my
npm pkg set name=test-msg
npm pkg set productName=test-msg
npm pkg set version=1.0.0
npm pkg set description="Chat P2P de terminal - prueba de flujo Pear OTA"
```

⚠️ **`productName || name` define el nombre del binario Y el directorio de storage persistente.**
Cambiarlo después del primer release rompe el storage de los usuarios ya instalados.
**Definirlo bien ANTES del primer `pear stage`.**

También hay que renombrar el binario en los scripts de build, que vienen hardcodeados:

```bash
sed -i '' 's/--name hello-pear-bare/--name test-msg/g' package.json
```

---

## ✅ Paso 6 — Escribir el chat

Ver `02-como-funciona.md` para el detalle de qué se tocó.
Resumen: `workers/main.js` (swarm + chat), `app.js` (pasar la sala + método `say`),
`bin.mjs` (flag `--room` + leer stdin).

Dependencias que agregamos explícitamente (ya estaban como transitivas, pero se usan directo):

```bash
npm pkg set dependencies.b4a=^1.8.1
npm pkg set dependencies.hypercore-crypto=^3.7.0
npm install
```

---

## ✅ Paso 7 — Probar el chat entre dos peers

**Verificado y funcionando.** Conectan en ~7 segundos.

Dos terminales, misma sala, **storage distinto** (obligatorio si es la misma máquina):

```bash
npm start -- --room hackaton --storage /tmp/peerA
npm start -- --room hackaton --storage /tmp/peerB
```

Entre dos máquinas distintas alcanza con:
```bash
npm start -- --room hackaton
```

Con log a archivo para seguirlo con `tail -f` (ver `06-logs-y-monitoreo.md`):
```bash
npm start -- --room hackaton --log /tmp/peerA.log
```

Salida real obtenida:
```
=== test-msg v1.0.0 | sala: prueba9 ===
* worker arriba | v1.0.0 | storage: .../A/app-storage
* sala "prueba9" lista | sos 7a81a8 | topic 6432db9ebe5d…
* 70f37d entró a la sala (1 conectado/s)
70f37d > te leo, soy B
```

⏱️ **Dale 60 segundos antes de concluir que no funciona.** El caso típico es 6-7s, pero hay un race
de announce/lookup en el DHT que puede estirarlo. Medido sin mitigar: 43s, 7s, 6s.
Ya está mitigado con `discovery.refresh()` (6s, 11s, 7s, 6s), pero la varianza es inherente.
Nos comimos un falso negativo por cortar a los 20s — ver `03-bitacora.md`.

Si no conecta, `05-diagnostico-red.md` tiene el árbol de decisión para separar red de código.

**Falta:** confirmar entre dos máquinas distintas. Ver `04-probar-con-equipo.md`.

---

## ⬜ Paso 8 — Buildear el binario

```bash
npm run make
```

Detecta OS/arch y deja el binario en `out/<platform>-<arch>`.
Targets específicos: `npm run make:darwin-arm64`, `make:linux-x64`, `make:win32-x64`, etc.

⚠️ Cada plataforma se buildea en un host de esa plataforma. Repartir entre el equipo.

> 📖 `../../docs/01-quickstart.md`

---

## ⬜ Paso 9 — Stage (subir al hypercore)

```bash
pear stage --dry-run pear://9nbjjp5jmtxxq3jj8ko7z4sdfnohucgwyjsxspdpsnuc8yf136my ./out/darwin-arm64
pear stage pear://9nbjjp5jmtxxq3jj8ko7z4sdfnohucgwyjsxspdpsnuc8yf136my ./out/darwin-arm64
```

Siempre `--dry-run` primero para ver qué archivos va a subir.

⚠️ **Punto a verificar:** la doc oficial de deployment describe `pear build` + `pear provision`
para apps de **desktop (Electron)**. Para una **CLI hecha con bare-build** no está claro si hacen
falta. Hipótesis a probar: alcanza con `touch → upgrade → version → make → stage → seed`.
**Este es el primer experimento que hay que hacer.**

> 📖 `../../docs/03-deploy-ota.md`

---

## ⬜ Paso 10 — Seed (poner online)

```bash
pear seed pear://9nbjjp5jmtxxq3jj8ko7z4sdfnohucgwyjsxspdpsnuc8yf136my
```

**Dejarlo corriendo en una terminal dedicada.** Si esto se corta, nadie puede instalar.

---

## ⬜ Paso 11 — Instalar desde otra máquina

```bash
pear install pear://9nbjjp5jmtxxq3jj8ko7z4sdfnohucgwyjsxspdpsnuc8yf136my
```

Verificar que el binario quedó instalado y corre.

---

## ⬜ Paso 12 — Probar el OTA (lo que se juzga)

Con la v1.0.0 corriendo en la máquina B:

```bash
# máquina A
npm version patch          # -> 1.0.1
npm run make
pear stage pear://9nbjj... ./out/darwin-arm64
```

En la máquina B, la instancia que está corriendo debería loguear:
```
[updater] getting new update
[updater] update complete... applying
[updater] applied update, restart to run latest version
```

**Ese output es el video demo.** Grabar las dos terminales lado a lado.

⚠️ La instancia tiene que correr **con updates habilitados**. En dev el default es `--no-updates`:
```bash
npm start -- --updates
```

⚠️ `delay` por defecto es 3600000ms (1 hora) antes de chequear updates. Para la demo hay que
bajarlo o forzar el chequeo. Ver `PearRuntime` opción `delay` en `../../docs/03-deploy-ota.md`.

---

## Checklist de verificación rápida

```bash
pear -v                                    # pear instalado
node_modules/.bin/bare --version           # bare linkeado
npm pkg get name productName version upgrade   # config correcta
npm start                                  # arranca
pear info pear://9nbjj...                  # qué hay publicado en la key
```
