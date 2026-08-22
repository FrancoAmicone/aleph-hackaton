# Pipeline de deploy — VERIFICADO paso a paso

Ejecutado el 22-ago-2026 sobre `test-msg/app`. Todo lo de acá **se corrió de verdad**.

## La duda que teníamos, resuelta

> ¿Una CLI necesita `pear build`, o alcanza con `pear stage` del `out/`?

**SÍ necesita `pear build`.** Y saltearlo falla de forma silenciosa y peligrosa.

### Qué pasa si stageás `out/` directamente

```bash
pear stage --dry-run pear://KEY ./out/darwin-arm64
```

Sube **el proyecto entero menos el binario**:

```
+ /package.json
+ /workers/main.js
+ /app.js
+ /logs/...            <- basura
+ /diag-node.js
...
```

**El binario NO aparece.** Causa: `out/` está en `.gitignore` y `pear stage` respeta el gitignore.
O sea, publicás algo que parece correcto y no tiene el ejecutable.

## Los 6 pasos que SÍ funcionan

### 1. Key (una sola vez)
```bash
pear touch
npm pkg set upgrade=pear://<key>
```

### 2. Nombre y versión — ANTES del primer release
```bash
npm pkg set name=<nombre> productName=<nombre> version=1.0.0
sed -i '' 's/--name hello-pear-bare/--name <nombre>/g' package.json
```
`productName || name` define el nombre del binario **y** el directorio de storage persistente.
Cambiarlo después rompe el storage de quien ya lo instaló.

### 3. Compilar el binario
```bash
npm run make
```
Detecta OS/arch y deja el ejecutable en `out/<platform>-<arch>/<nombre>`.

Verificado en darwin-arm64:
```
out/darwin-arm64/test-msg   Mach-O 64-bit executable arm64   77 MB
$ ./out/darwin-arm64/test-msg --version
test-msg v1.0.0
```

Es **standalone**: corre en una máquina sin Node ni npm.

### ✅ CROSS-COMPILA — la doc oficial se equivoca

La doc dice "Build each platform's binary on a matching host". **Es falso.**
Verificado: desde un **Mac ARM** salieron los binarios de las 5 plataformas.

```bash
npm run make:darwin-arm64    # Mach-O arm64        77 MB
npm run make:darwin-x64      # Mach-O x64          84 MB
npm run make:linux-x64       # ELF x86-64          94 MB
npm run make:linux-arm64     # ELF aarch64         95 MB
npm run make:win32-x64       # PE32+ .exe          54 MB
```

Comprobado con `file`:
```
out/linux-x64/test-msg      ELF 64-bit LSB pie executable, x86-64
out/win32-x64/test-msg.exe  PE32+ executable (console) x86-64, for MS Windows
```

**Una sola máquina compila para todo el equipo.** No hace falta repartir.

⚠️ En Windows el binario se llama `<nombre>.exe`, no `<nombre>`.
⚠️ Lo que **no** está verificado es que esos binarios *corran* en sus plataformas.
   Que Gino pruebe el de linux-x64 en su Ubuntu.

### 4. Armar la carpeta de deployment ← **EL PASO QUE FALTABA**
```bash
# una plataforma
pear build --package=./package.json \
  --darwin-arm64-app ./out/darwin-arm64/<nombre> \
  --target ./deploy-1.0.0

# TODAS de una (lo que conviene)
pear build --package=./package.json \
  --darwin-arm64-app ./out/darwin-arm64/<nombre> \
  --darwin-x64-app   ./out/darwin-x64/<nombre> \
  --linux-x64-app    ./out/linux-x64/<nombre> \
  --linux-arm64-app  ./out/linux-arm64/<nombre> \
  --win32-x64-app    ./out/win32-x64/<nombre>.exe \
  --target ./deploy-multi
```

⚠️ **`--<plat>-app` apunta al BINARIO**, no a un `.app` de Electron. La doc oficial muestra el
caso Electron y confunde.

Produce:
```
deploy-1.0.0/
├── package.json
└── by-arch/darwin-arm64/app/<nombre>
```

Flags por plataforma: `--darwin-arm64-app`, `--darwin-x64-app`, `--linux-arm64-app`,
`--linux-x64-app`, `--win32-x64-app`, `--win32-arm64-app`.
Se pueden pasar **varios a la vez** para un deploy multiplataforma.

### 5. Stage
```bash
pear stage --dry-run pear://KEY ./deploy-1.0.0    # SIEMPRE primero
pear stage pear://KEY ./deploy-1.0.0
```

El dry-run correcto se ve así:
```
+ /package.json (+2.5kB)
+ /by-arch/darwin-arm64/app/test-msg (+80.5MB)
```

**Si no ves el binario en esa lista, algo está mal.** No stagees.

Al terminar imprime la versión nueva: `pear://0.3.<key>` (el `3` es el drive length).

### 6. Seed — dejar corriendo
```bash
pear seed pear://KEY
```

Salida correcta:
```
^_^ announced
... drive length 3
... semantic version 1.0.0
... firewalled true
... NAT type consistent
--- network 0 peers, upload 0B - 0B/s, download 0B - 0B/s
```

`^_^ announced` es la confirmación. `0 peers` es normal hasta que alguien instale.

⚠️ **Tiene que seguir corriendo durante todo el juzgado.** Si se corta, nadie puede instalar
ni actualizar. Terminal dedicada, laptop sin suspensión, y conviene un segundo seeder de respaldo.

## Estado actual

| Paso | Estado |
|---|---|
| `pear touch` | ✅ `pear://9nbjjp5jmtxxq3jj8ko7z4sdfnohucgwyjsxspdpsnuc8yf136my` |
| `npm run make` | ✅ **5 plataformas cross-compiladas desde el Mac** |
| `pear build` | ✅ `deploy-multi/by-arch/<5 plataformas>/app/` |
| `pear stage` v1.0.0 (5 plataformas) | ✅ versión `0.7.` |
| `pear seed` | ✅ corriendo y anunciado |
| `pear install` desde otra máquina | ⬜ **falta** |
| OTA v1 → v2 | ⬜ **falta** |

## Lo que sigue

### Instalar desde otra máquina
```bash
pear install pear://9nbjjp5jmtxxq3jj8ko7z4sdfnohucgwyjsxspdpsnuc8yf136my
```
Sólo funciona si el seed está corriendo. Ojo: hoy sólo está publicado el binario
**darwin-arm64**, así que sólo instala en Mac ARM. Para Linux hay que compilar en Linux.

### Demostrar el OTA
```bash
npm version patch          # 1.0.0 -> 1.0.1
npm run make
pear build --package=./package.json --darwin-arm64-app ./out/darwin-arm64/<nombre> --target ./deploy-1.0.1
pear stage pear://KEY ./deploy-1.0.1
```
La instancia v1.0.0 corriendo en la otra máquina debería loguear:
```
[updater] getting new update
[updater] update complete... applying
[updater] applied update, restart to run latest version
```

⚠️ La instancia tiene que correr **con updates habilitados** (`npm start -- --updates`;
el default en dev es `--no-updates`), y `PearRuntime` tiene `delay` de 1 hora por defecto
antes de chequear updates — hay que bajarlo para la demo.
