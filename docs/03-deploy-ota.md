# Deploy, seeding y OTA

Fuentes:
- https://docs.pears.com/how-to/operate-an-app/manual-deployment/deployment/
- https://docs.pears.com/reference/pear/runtime/
- https://docs.pears.com/explanation/availability-and-blind-peering/
- https://docs.pears.com/explanation/deployment-releasing-apps-p2p/

**Esto es lo que se juzga.** El track pide instalación por `pear install pear://<key>` y un
update OTA P2P demostrado funcionando.

Los comandos concretos del juego están en `09-the-great-pear.md`. Acá va el mecanismo y la
API.

## El flujo, para una CLI de Bare

La doc oficial describe **ocho pasos** pensados para apps de desktop (Electron). Para una CLI
buildeada con `bare-build`, verificado end-to-end, el flujo real es de cinco:

```bash
pear touch                          # -> pear://KEY  (una sola vez en la vida del proyecto)
npm pkg set upgrade=pear://KEY

npm version patch                   # el updater compara ESTE número
npm run make:<platform>-<arch>      # una vez por plataforma; cross-compila
npm run deploy                      # arma deploy/ con la forma que espera el updater
pear stage --dry-run pear://KEY ./deploy
pear stage           pear://KEY ./deploy
pear seed            pear://KEY     # DEJAR CORRIENDO, terminal dedicada
```

Los tres pasos que la doc oficial incluye y nosotros salteamos:

| Paso oficial | Por qué no |
|---|---|
| `pear build` | Está pensado para bundles de Electron. Para una CLI no arma el `.app` de macOS que el updater necesita — lo hace `npm run deploy`. Ver abajo. |
| `pear provision` + `pear multisig` | Releases de producción firmados por quórum. El track no lo pide. |
| Submissions a stores | Flathub / Snap. Irrelevante. |

## La forma que el updater espera

`pear-runtime-updater` busca exactamente dos cosas en el drive:

```
/package.json                            -> su `version` se compara con la que corre
/by-arch/<platform>-<arch>/app/<name>    -> el artefacto a reemplazar
```

`scripts/deploy.js` copia lo que dejó `npm run make` a esa forma:

```
deploy/
  package.json
  by-arch/
    darwin-arm64/app/the-great-pear        # binario pelado
    darwin-arm64/app/the-great-pear.app    # + bundle, sólo en darwin
    linux-x64/app/the-great-pear
    win32-x64/app/the-great-pear.exe
```

**En macOS van dos artefactos por arquitectura**, el binario pelado y un bundle `<name>.app`.
`lib/pear-cli.js` le pide al updater uno u otro según cómo se invocó la copia que corre: desde
adentro de un `.app` hay que reemplazar el directorio del bundle, y un binario suelto se
reemplaza como archivo. Publicar los dos hace que cada estilo de instalación encuentre lo
suyo — ver la salvedad en `09-the-great-pear.md` §5.

Todas las plataformas viajan en el mismo stage, así que **un solo link `pear://` sirve a
todas** y cada copia corriendo se baja el artefacto que le corresponde a su host.

## 🔴 Nunca stagear `out/` directamente

`out/` está en `.gitignore` y **`pear stage` respeta gitignore**. Stagear `out/` publica el
`package.json` y **nada más** — sin un solo binario, en silencio. El juez instala y no le
funciona nada.

Por eso el dry-run no es opcional: **tiene que listar los binarios bajo `/by-arch/`**.

```
+ /package.json (+1.8kB)
+ /by-arch/darwin-arm64/app/the-great-pear (+143.3MB)
+ /by-arch/linux-x64/app/the-great-pear (+177.6MB)
…
```

Si no los ves, no stagees.

## Cross-compilación: la doc oficial se equivoca

Dice *"Build each platform's binary on a matching host"*. **Es falso** para `bare-build`.
Verificado: las 5 plataformas salen de un Mac ARM, y el binario `linux-x64` **corre** en
Ubuntu instalado por `pear install`. Una sola máquina compila para todo el equipo.

## Seeding — no subestimar esto

- `pear seed pear://KEY` tiene que estar **corriendo** para que alguien pueda instalar o
  actualizar. Sin seeder, el otro lado ve `Network Timeout 30s`.
- El track exige seeding **durante todo el juzgado**.
- **[NUESTRO]** Dejarlo en al menos **dos máquinas** por redundancia, con la suspensión
  desactivada (`caffeinate -is` en macOS, `systemd-inhibit` en Linux).
- No hay que reiniciarlo al publicar una versión: detecta el drive length nuevo solo.
- Para disponibilidad sin depender de nuestras máquinas existe el *blind peering*:
  https://docs.pears.com/how-to/blind-peering/

## API de `pear-runtime`

```javascript
const PearRuntime = require('pear-runtime')
const pear = new PearRuntime({ dir, version, upgrade, name, app })
```

### Opciones del constructor

| Opción | Tipo | Req. | Default | Descripción |
|---|---|---|---|---|
| `dir` | String | Sí | — | Directorio de datos del runtime |
| `upgrade` | String | Sí | — | Link de upgrade, del campo `upgrade` de `package.json` |
| `name` | String | Sí | — | Product name — **el artefacto que se busca en el drive** |
| `version` | String | No | `0.0.0-0` | Versión actual, se usa para decidir updates |
| `app` | String | No | — | Path al bundle (`.app`, `.AppImage`) o al ejecutable |
| `updates` | Boolean | No | `true` | Habilita/deshabilita OTA |
| `storage` | String | No | `<dir>/app-storage` | Override del path de storage P2P |
| `store` | Corestore | No | — | Instancia de Corestore existente |
| `swarm` | Hyperswarm | No | — | Instancia de Hyperswarm existente |
| `bundled` | Boolean | No | `!!app` | Si la app está bundleada |
| `delay` | Integer | No | `3600000` | Delay máximo (ms) antes de buscar updates |

> 🔴 **`delay` es el que arruina las demos.** El default es **una hora** de espera aleatoria
> antes de siquiera buscar una versión nueva — existe para que miles de clientes no golpeen
> el swarm a la vez. Nosotros usamos `delay: 5000`.
>
> Y tiene que estar **desde el primer release**: la copia instalada corre su propio código,
> así que bajarlo en la v2 no sirve — la que espera una hora es la v1.

### Métodos y eventos

| Método | Descripción |
|---|---|
| `pear.ready()` | Esperar la inicialización |
| `pear.close()` | Cerrar el runtime en el teardown |
| `pear.updater.applyUpdate()` | Aplicar el update descargado |

```javascript
pear.updater.on('updating', () => {})        // descarga en progreso
pear.updater.on('updating-delta', (d) => {}) // progreso por bloques
pear.updater.on('updated', () => {})         // nueva versión en disco -> applyUpdate()
pear.on('error', console.error)
```

`pear.storage` da el path de storage de la app, para configurar el Corestore.

## Las tres trampas del OTA

1. **Un updater roto no puede arreglarse a sí mismo.** La copia instalada corre su propio
   código: si la v1 tiene el bug, no va a poder aplicar ni el update que trae el arreglo.
   Cualquier cambio en el updater surte efecto **a partir de la versión siguiente**. Si sale
   mal, hay que reinstalar a mano una vez.
2. **`pear install` se niega a sobrescribir.** Reinstalar es `rm` + `install`. Sin el `rm`,
   falla y uno queda en la versión vieja creyendo que reinstaló.
3. **El tamaño del storage no dice nada.** El corestore reutiliza bloques y se queda plano
   aunque la descarga esté en curso. La única señal confiable es `<app> --version`.

## Automatización

Publicar con GitHub Actions vía `pear-ci`:
https://docs.pears.com/how-to/operate-an-app/github-actions/
