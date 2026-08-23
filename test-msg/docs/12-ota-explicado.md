# OTA — cómo funciona, cómo probarlo, cómo debuggearlo

El update OTA P2P es **el requisito #4 del track** y lo que más pesa en el juzgado.

## La idea en una frase

La app publicada es un **Hyperdrive** (un filesystem P2P). El updater es un peer que replica ese
drive. Cuando aparecen bloques nuevos, descarga la versión nueva y reemplaza el binario.

**No hay servidor de updates.** Es el mismo mecanismo P2P del chat, con otro topic.

## Las piezas y cómo están conectadas

```
                    tu máquina                          la del juez
┌────────────────────────────────┐        ┌──────────────────────────────────┐
│  pear stage  → escribe al      │        │  binario instalado v1.0.0        │
│                Hyperdrive      │        │    │                             │
│  pear seed   → lo ANUNCIA      │        │    └── worker de Bare            │
│                (server: true)  │        │          │                       │
│                                │        │          ├── PearRuntime         │
│         drive length 7 ────────┼───DHT──┼──────────┤   updater             │
│                                │        │          │     (client: true)    │
└────────────────────────────────┘        └──────────────────────────────────┘
```

En `workers/main.js`:

```js
const store = new Corestore(path.join(dir, 'pear-runtime', 'corestore'))
const updaterSwarm = new Hyperswarm()
const pear = new PearRuntime({ ...updaterConfig, swarm: updaterSwarm, store })

if (updates !== false) {
  updaterSwarm.on('connection', (connection) => store.replicate(connection))
  updaterSwarm.join(pear.updater.drive.core.discoveryKey, {
    client: true,   // busco a quien tenga la app
    server: false   // NO me anuncio: soy consumidor, no distribuidor
  })
}
```

Dos cosas para entender bien:

1. **El topic es `pear.updater.drive.core.discoveryKey`** — se deriva de tu key `pear://`.
   Todas las instancias de la app buscan en el mismo topic sin coordinarse.
2. **`server: false`** — quien se anuncia es **`pear seed`**. Por eso si el seed se cae,
   nadie puede instalar ni actualizar. No es un detalle operativo, es estructural.

## El baile completo, mensaje por mensaje

```
  worker (Bare thread)                app.js                    bin.mjs
         │                              │                          │
   detecta versión nueva                │                          │
         │──── "updating" ─────────────>│──── evento 'updating' ──>│ "[updater] getting new update"
         │                              │                          │
   descarga los bloques                 │                          │
         │──── "updated" ──────────────>│──── evento 'updated' ───>│ "[updater] update complete..."
         │                              │                          │
         │<─── "pear:applyUpdate" ──────│ (automático)             │
         │                              │                          │
   applyUpdate()                        │                          │
         │─── "pear:updateApplied" ────>│─ evento 'update-applied'>│ "[updater] applied update,
         │                              │                          │  restart to run latest version"
```

El código exacto (`app.js`) que dispara la aplicación automática:

```js
if (message === 'updated') {
  this.emit('updated')
  this._send('pear:applyUpdate')     // <- responde solo, sin intervención
  return
}
```

Y en el worker:

```js
if (message === 'pear:applyUpdate') {
  await pear.ready()
  await pear.updater.applyUpdate()
  pipe.write('pear:updateApplied')
}
```

**Los 3 logs del final son la demo.** Grabalos.

## Qué tipo de "actualización" se hace

Se reemplaza **el binario entero**, no archivos sueltos de JS. Un `pear stage` nuevo escribe una
versión nueva del Hyperdrive; el updater replica **sólo los bloques que cambiaron** (por eso el
evento `updating-delta`), y al terminar swapea el ejecutable.

Consecuencia práctica: **cualquier cambio de código sirve para demostrar el OTA.** No hace falta
que sea algo profundo. Cambiar un string de bienvenida y bumpear la versión alcanza — y para el
video es mejor, porque el cambio se ve al instante.

## Cómo probarlo, paso a paso

### Requisitos previos

- `pear seed` **corriendo** en la máquina que publica
- La otra máquina con la app instalada por `pear install`
- La app corriendo **con updates habilitados**

⚠️ **En dev el default es `--no-updates`.** `npm start` NO chequea updates. Hay que usar:
```bash
npm start -- --updates
```
El binario instalado sí tiene updates activos por defecto.

### Publicar la v2

```bash
# 1. subir versión
npm version patch                 # 1.0.0 -> 1.0.1

# 2. recompilar TODAS las plataformas
npm run make:darwin-arm64
npm run make:linux-x64
npm run make:win32-x64
# ... las que correspondan

# 3. armar el deploy
pear build --package=./package.json \
  --darwin-arm64-app ./out/darwin-arm64/test-msg \
  --linux-x64-app   ./out/linux-x64/test-msg \
  --win32-x64-app   ./out/win32-x64/test-msg.exe \
  --target ./deploy-1.0.1

# 4. stage (el seed lo levanta solo, NO hay que reiniciarlo)
pear stage pear://KEY ./deploy-1.0.1
```

### Qué mirar del otro lado

```
[updater] getting new update
[updater] update complete... applying
[updater] applied update, restart to run latest version
```

Con `--log`, además queda en archivo con timestamps:
```bash
tail -f /tmp/demo.log | grep updater
```

## ⚠️ El delay de 1 hora

`PearRuntime` tiene:

| Opción | Default | Qué hace |
|---|---|---|
| `delay` | `3600000` (1 hora) | Espera máxima **aleatoria** antes de buscar updates |

Es para que miles de clientes no golpeen el swarm a la vez. **Para la demo hay que bajarlo**,
si no esperás hasta una hora a que se dispare.

Se pasa en el constructor, en `workers/main.js`:

```js
const pear = new PearRuntime({ ...updaterConfig, swarm: updaterSwarm, store, delay: 5000 })
```

> ✅ **APLICADO en v1.0.1** (`workers/main.js:44`).
>
> **La trampa, confirmada:** la instancia instalada corre *su propio* código. La v1.0.0 se
> publicó sin `delay`, así que esa instancia espera hasta 1 hora **aunque la v2 tenga el delay
> bajo**. Por eso hubo que publicar una v1.0.1 con el fix y reinstalarla ANTES de la demo.
>
> Regla general: **cualquier cambio en el comportamiento del updater sólo surte efecto a partir
> de la versión SIGUIENTE a la que lo introduce.**

## Cómo debuggear si no anda

En orden, del más común al menos:

### 1. ¿El seed está corriendo?
```bash
ps aux | grep "pear seed"
```
Causa #1 de "no actualiza". Sin seed no hay quien sirva los bloques.

### 2. ¿La versión subió de verdad?
El `pear stage` imprime el drive length nuevo:
```
Latest: 7
pear://0.7.<key>
```
Si el número no cambió, no publicaste nada. Y el log del seed tiene que mostrar
`... drive length 7`.

### 3. ¿La app corre con updates?
```
Updates: disabled     <- así NO va a actualizar nunca
Updates: enabled      <- así sí
```
Lo imprime `bin.mjs` al arrancar.

### 4. ¿La key coincide?
```bash
npm pkg get upgrade
```
Tiene que ser exactamente la key que estás seedeando. Un typo acá y el updater busca en un
topic que no existe, sin dar error.

### 5. ¿Hay conectividad al seeder?
El updater necesita hole punching contra la máquina que seedea, igual que el chat.
Si la red bloquea, el update no baja. Probar con `conectar.js` entre esas dos máquinas.

### 6. ¿Se está esperando el delay?
Ver la sección de arriba. Si todo lo demás está bien y no pasa nada, es esto.

### 7. Estado real del link
```bash
pear info pear://<key>
```
Muestra qué hay publicado. `--metadata`, `--manifest`, `--key` para secciones puntuales.

### 8. Sidecar en estado raro
```bash
pear sidecar shutdown
```
Y reintentar.

## Errores de bulto que hay que evitar

| Error | Consecuencia |
|---|---|
| Cambiar `productName`/`name` después del primer release | Rompe el directorio de storage de quien ya instaló |
| No recompilar todas las plataformas en la v2 | Los usuarios de las que faltan no reciben el update |
| Stagear `out/` en vez del deploy de `pear build` | Se publica sin binario, en silencio |
| Matar el seed entre v1 y v2 | El update nunca baja |
| Olvidar `npm version` | El updater no ve nada nuevo |

## Estado

| | |
|---|---|
| Mecanismo entendido y documentado | ✅ |
| `pear stage` de v1.0.0 multiplataforma | ✅ drive length 7 |
| `pear seed` corriendo | ✅ |
| `pear install` en otra máquina | ✅ Gino, Ubuntu, 90 MB desde 1 peer |
| Binarios cross-compilados corren | ✅ linux-x64 en Ubuntu |
| Delay bajado a 5000 ms | ✅ v1.0.1 |
| v1.0.1 publicada (5 plataformas) | ✅ drive length 13 |
| Gino reinstala 1.0.1 | ⬜ **siguiente paso** |
| OTA v1.0.1 → v1.0.2 demostrado | ⬜ **lo único que falta** |
