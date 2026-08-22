# Bare runtime — lo que NO es Node

Fuentes:
- https://docs.pears.com/explanation/pear-and-bare/
- https://docs.pears.com/reference/modules/bare-modules/
- https://docs.pears.com/reference/bare/runtime/
- https://docs.pears.com/reference/modules/pear-modules/

## Pear vs Bare

- **Bare** es un runtime de JavaScript chico y embebible: sistema de módulos, loader de addons
  nativos, threads livianos. Encima de C (libjs, libuv, libudx).
- **Pear** es la capa de plataforma sobre Bare: CLI, spawn de runtime, updates OTA, servicios de app.

Bare es el motor; Pear es el producto.

## Las 3 diferencias que rompen código

### 1. No hay librería estándar

Bare casi no trae stdlib. Los módulos se instalan explícitamente como `bare-*`.
**Escribir `require('fs')` o `import path from 'path'` falla.**

### 2. Sistema de módulos flexible

Soporta CommonJS y ESM con interoperabilidad, más addons nativos y threads.

### 3. Independencia de plataforma

El mismo código de Bare corre igual en desktop (Electron), mobile (shells nativos) y terminal.
Hypercore, Hyperbee y Hyperdrive corren **sobre** Bare como módulos comunes, sin estatus especial
de runtime — por eso el código es realmente portable.

## Mapeo Node → Bare

| Node builtin | Bare |
|---|---|
| `fs` | `bare-fs` |
| `path` | `bare-path` |
| `os` | `bare-os` |
| `process` | `bare-process` |
| `events` | `bare-events` |
| `http` | `bare-http1` |
| `https` | `bare-https` |
| `crypto` | `bare-crypto` |
| `stream` | `bare-stream` |
| `zlib` | `bare-zlib` |
| `dns` | `bare-dns` |
| `net` (TCP) | `bare-tcp` |
| `tty` | `bare-tty` |
| `readline` | `bare-readline` |
| `child_process` | `bare-subprocess` |
| `worker_threads` | `bare-worker` |
| `assert` | `bare-assert` |
| `console` | `bare-console` |
| `Buffer` | `bare-buffer` / **`b4a`** (preferido) |
| `timers` | `bare-timers` |
| `util.inspect` | `bare-inspect` |
| `fetch` | `bare-fetch` |
| WebSockets | `bare-ws` |

Otros: `bare-module`, `bare-bundle`, `bare-pack`, `bare-make` (build/packaging),
`bare-encoding` (text encoding), `bare-daemon` (procesos detached).

## Globals de Bare

| Node | Bare |
|---|---|
| `process.argv` | `Bare.argv` (args de usuario desde `[2]`) |
| `process.exit(n)` | `Bare.exit(n)` |
| — | `Bare.IPC` (duplex stream hacia el proceso padre, en workers) |

## Reglas para no romperse

1. **Antes de agregar una dependencia npm, chequear que corra en Bare.** Si usa builtins de Node,
   o hay equivalente `bare-*`, o hay que aliasear en `package.json`, o no sirve.
2. **Para libs cross-runtime:** usar **import maps** para soportar Node y Bare a la vez.
3. **Para dependencias de terceros que asumen Node:** usar aliases de npm apuntando a los
   equivalentes de Bare.
4. **Nunca imports dinámicos condicionales.** `bare-pack` escanea el código estáticamente y no
   puede inferir imports que dependen de condiciones de runtime. Usar import maps en su lugar.
5. **`b4a` para todo lo que sean bytes.** Es el idiom del ecosistema Hypercore:
   `b4a.from(str, 'hex')`, `b4a.toString(buf, 'hex')`, `b4a.alloc(n)`, `b4a.equals(a, b)`.

## Para una TUI

`bare-tty` + `bare-readline` son la base para input interactivo de terminal.
`process.stdin.on('data', ...)` (vía `bare-process`) alcanza para input crudo tipo chat.

### Raw mode — ✅ VERIFICADO (spike 1)

**`bare-tty` sí da raw mode.** Doc oficial: https://docs.pears.com/reference/bare/modules/bare-tty/
Confirmado además en el código (`node_modules/bare-tty/index.js`) y probado end-to-end sobre
Bare v1.29.4 con `bare-tty@5.1.2`. Ver `spikes/01-raw-input/`.

```javascript
const tty = require('bare-tty')

const stdin = new tty.ReadStream(0)
const stdout = new tty.WriteStream(1)

stdin.setRawMode(true)                 // byte a byte, sin Enter, sin echo
stdin.on('data', (chunk) => { ... })   // Readable de bare-stream: NO bloquea el loop
stdin.setRawMode(false)                // restaurar
```

API: `ReadStream(fd)` con `setRawMode(bool)` / `setMode(n)` / `isTTY` / `fd`.
`WriteStream(fd)` con `columns` / `rows` / `getWindowSize()` y evento `resize` (SIGWINCH).
`tty.isTTY(fd)` y `tty.constants.mode.{NORMAL,RAW,IO}`.

**Las flechas** llegan como secuencias ANSI de 3 bytes: `ESC [ A/B/C/D` = `1b5b41`..`1b5b44`.
Un solo chunk puede traer varias teclas — hay que parsear el buffer entero, no asumir 1 tecla.

### Los 3 gotchas de raw mode (todos verificados)

1. **Ctrl+C NO es SIGINT.** Llega como el byte `0x03` y hay que manejarlo a mano. Un handler
   `process.on('SIGINT')` **no se dispara** con raw mode activo. Sin esto la app es incerrable.
2. **Restaurar la terminal siempre.** Si el proceso muere en raw mode, el shell del usuario
   queda sin echo, inutilizable. Conviene un `restore()` idempotente llamado desde la tecla de
   salida, el error handler y `Bare.on('exit')`.
3. **Salir de un proceso long-lived necesita dos cosas**: cerrar la App (`app.exit(code)`) **y**
   soltar todos los handles propios. Un `setInterval` vivo (el game loop, por ejemplo) mantiene
   el loop y el proceso no termina nunca. Con el worker de `PearRuntime.run` activo,
   `Bare.exit()` a secas se cuelga.

**[NUESTRO]** Antes de meter una librería de TUI de npm (blessed, ink, etc.), asumir que **no** va
a andar en Bare hasta probar lo contrario. Escapes ANSI a mano es la apuesta segura.

### El binario `bare` del template es un wrapper

`./node_modules/.bin/bare` es un script de **Node** que spawnea el binario real
(`node_modules/bare-runtime-<platform>-<arch>/bin/bare`) como hijo, con `suppressSignals: true`
— o sea registra handlers no-op para SIGTERM/SIGINT/SIGHUP.

- **Ctrl+C en una terminal anda bien**: la señal va a todo el process group y el hijo la recibe.
- **Matar por PID al wrapper no hace nada.** En scripts de test, usar el binario real.
