# Pear CLI — referencia

Fuente: https://docs.pears.com/reference/pear/cli/
Instalación: `curl https://install.pears.com/pear.sh | sh` (macOS/Linux) · `irm https://install.pears.com/pear.ps1 | iex` (Windows)
Menú interactivo: `pear --menu` (3.2.0+) · Ayuda: `pear help [command]`

## ⛔ Comandos ELIMINADOS en v3 — no usarlos

| Eliminado | Reemplazo |
|---|---|
| `pear run` | Embeber la librería Pear OTA (`pear-runtime`) |
| `pear init` | Clonar el repo template |
| `pear release` | `pear provision` + `pear multisig` |
| `pear presets` / `pear shift` / `pear drop` | Sin reemplazo |
| `pear gc sidecars` | Eliminado en 3.2.0 |

Si aparece alguno de estos en una sugerencia, es documentación vieja.

## Core

### `pear touch [flags]`
Crea un link Pear (la base para el discovery de la app).
- `--vanity <vanity>` — minar una key que arranque con ese prefijo
- `--json` — salida estructurada

### `pear build [flags]`
Ensambla builds de Electron por OS en un directorio de deployment multi-arquitectura.
- `--package [path]` — ubicación del `package.json` del proyecto
- `--target [path]` — directorio de salida del build
- `--<platform-arch>-app [path]` — paths de app por plataforma

### `pear stage <link> [dir]`
Sincroniza los cambios locales a los hypercores de Pear.
- `--dry-run` — previsualizar sin escribir
- `--ignore <paths>` — exclusiones separadas por coma
- `--only <paths>` — filtrar paths específicos

## Releases de producción

### `pear provision <source-verlink> <target-link> <production-verlink>`
Sincronización de bloques pre-producción (compacta y resincroniza a un link target).

### `pear multisig [command]`
Coordinación de firmas por quórum.
- `keys get|list|add|remove|paths`
- `link` — derivar el link multisig
- `request|sign|verify|commit` — flujo de firma

## Distribución y ejecución

### `pear seed <link>`
Comparte el proyecto en la red P2P. **Tiene que estar corriendo para que otros instalen.**
- `--until-sync <key>` — salir cuando un peer sincronizó del todo

### `pear install <link>`
Instala apps desde links Pear en las carpetas de aplicaciones del SO.
- `--only <paths>` — filtrar archivos específicos

## Inspección

### `pear info [link] [dir]`
Lee información del proyecto/app/plataforma.
- `--metadata` / `--manifest` / `--multisig` / `--key`

### `pear changelog [link]`
Muestra el changelog versionado desde `CHANGELOG.md`.
- `--of <semver>` — filtrar por versión
- `--max <n>` — límite de entradas (default 10)

### `pear dump [flags] <link> [dir]`
Descarga archivos de un link.
- `--list` — mostrar paths disponibles
- `--checkout <n>` — traer una versión específica

### `pear cores` (nuevo en 3.1.0)
Lista las entradas del corestore de la plataforma.
- `--all-cores` — incluir cores vacíos

### `pear data [flags] [command]`
Explora la base de datos de la plataforma. Subcomandos: `dht`, `multisig`.

### `pear versions`
Info de versiones. `--modules` para incluir versiones de módulos.

## Mantenimiento

### `pear sidecar [command]`
Maneja el servidor de corestore por IPC.
- `shutdown` | `inspect`
- `--log-level <0-3>`

### `pear gc [flags] [command]`
Garbage collection.
- `cores <link>` — limpiar cores específicos

> **Debug tip:** si el sidecar queda en estado raro (instalaciones que no avanzan, cores colgados),
> `pear sidecar shutdown` y reintentar es el primer movimiento.
