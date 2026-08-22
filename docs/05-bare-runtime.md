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
Para un juego con teclas sueltas hace falta raw mode — verificar la API de `bare-tty`.

**[NUESTRO]** Antes de meter una librería de TUI de npm (blessed, ink, etc.), asumir que **no** va
a andar en Bare hasta probar lo contrario. Escapes ANSI a mano es la apuesta segura.
