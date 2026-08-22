# Deploy, seeding y OTA

Fuentes:
- https://docs.pears.com/how-to/operate-an-app/manual-deployment/deployment/
- https://docs.pears.com/reference/pear/runtime/
- https://docs.pears.com/explanation/availability-and-blind-peering/
- https://docs.pears.com/explanation/deployment-releasing-apps-p2p/

**Esto es lo que se juzga. Que funcione end-to-end es la prioridad #1 del proyecto.**

## Los 8 pasos fundacionales (doc oficial)

### 0. Touch y seed
Crear el link `pear://` y anunciarlo en el swarm:
```bash
pear touch
pear seed pear://qxenz5wmspmryjc13m9yzsqj1conqotn8fb4ocbufwtz9mtbqq5o
```

### 1. Setear el upgrade link
```bash
npm pkg set upgrade=pear://qxenz5wmspmryjc13m9yzsqj1conqotn8fb4ocbufwtz9mtbqq5o
```

### 2. Versionar
```bash
npm version [<newversion> | major | minor | patch | premajor | preminor | prepatch | prerelease]
```

### 3. Hacer los distribuibles
```bash
npm run make
```

### 4. Armar el directorio de deployment
```bash
pear build \
  --package=./pear-chat/package.json \
  --darwin-arm64-app ./pear-chat/out/PearChat-darwin-arm64/PearChat.app \
  --target pear-chat-1.0.1
```

### 5. Stage
```bash
pear stage --dry-run pear://[link] ./pear-chat-1.0.1
pear stage pear://[link] ./pear-chat-1.0.1
```

### 6. Provision
```bash
pear provision pear://[source] pear://[target] pear://[production]
```

### 7. Multisig
Producción gateada por firma con quórum. **[NUESTRO]** Para la hackathon esto es opcional —
el track pide instalación por `pear://` y OTA, no una cadena de release firmada multiparte.
No gastar tiempo acá hasta tener todo lo demás.

### 8. Submissions a stores
Empaquetado para Flathub / Snap Store. Irrelevante para la hackathon.

> ⚠️ **Nota de precisión:** los pasos 4 y 6 (`pear build`, `pear provision`) están documentados para
> **releases de desktop (Electron)**. Para una **CLI buildeada con `bare-build`** (`npm run make`, que
> tira `out/<platform>-<arch>`) el flujo mínimo viable es `touch → upgrade → version → make → stage → seed`.
> **Verificar esto empíricamente temprano** y ajustar este documento con lo que realmente funcione.

## Flujo mínimo que tenemos que demostrar

```bash
# --- Máquina A (nosotros) ---
pear touch                        # -> pear://KEY   (guardarla, es LA key del proyecto)
npm pkg set upgrade=pear://KEY
npm run make
pear stage pear://KEY ./out/<platform>-<arch>
pear seed pear://KEY              # DEJAR CORRIENDO, terminal dedicada

# --- Máquina B (el juez / otro integrante) ---
pear install pear://KEY
<app>                             # corre la v1

# --- Máquina A: publicar v2 ---
npm version patch
npm run make
pear stage pear://KEY ./out/<platform>-<arch>

# --- Máquina B: la instancia corriendo detecta y aplica el update ---
# [updater] getting new update
# [updater] update complete... applying
# [updater] applied update, restart to run latest version
```

**Ese último bloque de logs es el video demo.** Grabar las dos terminales lado a lado.

## API de `pear-runtime`

```javascript
const PearRuntime = require('pear-runtime')
const pear = new PearRuntime({ dir, version, upgrade, name, app })
```

### Opciones del constructor

| Opción | Tipo | Req. | Default | Descripción |
|---|---|---|---|---|
| `dir` | String | Sí | — | Directorio de datos del runtime |
| `upgrade` | String | Sí | — | Link de upgrade, normalmente del campo `upgrade` de `package.json` |
| `name` | String | Sí | — | Product name de la app |
| `version` | String | No | `0.0.0-0` | Versión actual, se usa para decidir updates |
| `app` | String | No | — | Path al bundle (`.app`, `.AppImage`, etc.) |
| `updates` | Boolean | No | `true` | Habilita/deshabilita OTA |
| `storage` | String | No | `<dir>/app-storage` | Override del path de storage P2P |
| `store` | Corestore | No | — | Instancia de Corestore existente |
| `swarm` | Hyperswarm | No | — | Instancia de Hyperswarm existente |
| `bundled` | Boolean | No | `!!app` | Si la app está bundleada |
| `delay` | Integer | No | `3600000` | Delay máximo (ms) antes de buscar updates |

> **[NUESTRO] Para la demo:** bajar `delay` para no esperar una hora a que chequee updates.

### Propiedades

- `pear.storage` — path de storage de la app, para configurar el Corestore.

### Métodos

| Método | Devuelve | Descripción |
|---|---|---|
| `pear.ready()` | Promise | Esperar la inicialización |
| `pear.close()` | Promise | Cerrar el runtime en el teardown |
| `pear.run(path, args)` | Stream | Ejecutar un worker de Bare (también existe como método estático) |
| `pear.updater.applyUpdate()` | — | Aplicar el update staged y reiniciar la app |

### Eventos

```javascript
pear.updater.on('updating', () => {
  // descarga del update en progreso
})

pear.updater.on('updated', () => {
  // nueva versión staged; llamar applyUpdate() para aplicarla
})

pear.on('error', console.error) // errores de red, etc.
```

### Comunicación con el worker

Los workers acceden al IPC vía `Bare.IPC` (duplex stream) y reciben args por `Bare.argv`:

```javascript
// proceso principal
const IPC = pear.run('./workers/main.js', [pear.storage])

// worker (main.js)
const storage = Bare.argv[2]
Bare.IPC.on('data', (data) => {})
Bare.IPC.write('message')
```

## Seeding — no subestimar esto

- `pear seed pear://KEY` tiene que estar **corriendo** para que alguien pueda instalar.
- El track exige que esté seedeando **durante todo el juzgado** (domingo 23, 13:00 ARG en adelante).
- **[NUESTRO]** Plan concreto: dejar el seed corriendo en al menos **dos máquinas del equipo**
  (redundancia por si una se duerme / pierde wifi). Desactivar el sleep de la laptop.
- Ver también *blind peering* (https://docs.pears.com/how-to/blind-peering/) para disponibilidad
  sin depender de nuestras máquinas — si sobra tiempo, es la solución robusta.

## Automatización

Publicar con GitHub Actions vía `pear-ci`:
https://docs.pears.com/how-to/operate-an-app/github-actions/
