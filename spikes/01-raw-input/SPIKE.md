# SPIKE 1 — Input crudo en Bare

**Pregunta:** ¿se pueden leer teclas sueltas (sin Enter) sin bloquear el loop, en Bare?

**Respuesta: SÍ.** `bare-tty` da raw mode. Verificado end-to-end sobre Bare v1.29.4,
dentro del template `hello-pear-bare`. **No hay que cambiar de idea: el juego en tiempo real es viable.**

## Evidencia

`bare-tty@5.1.2` — API confirmada en la doc oficial
(https://docs.pears.com/reference/bare/modules/bare-tty/) y en el código instalado
(`node_modules/bare-tty/index.js:38`):

```js
setRawMode(enabled) {
  return this.setMode(enabled ? constants.mode.RAW : constants.mode.NORMAL)
}
```

`ReadStream` extiende `Readable` de `bare-stream` → es event-driven (`.on('data')`),
**no bloquea el loop**. Cada corrida incluye un heartbeat de 1s que sigue latiendo
mientras se tipea; si el input fuera bloqueante, no se vería.

## Cómo correr

```bash
npm install
npm run spike            # demo standalone
npm run spike:template   # dentro del template (App + worker de Bare)
```

Salir con `q` o `Ctrl+C`. Ambos restauran la terminal.

### Test automatizado

Raw mode necesita un TTY real, así que no alcanza con pipes. `test-pty.py` corre el spike
dentro de un pty, le manda teclas y **verifica el estado de la terminal con `termios`**:

```bash
python3 test-pty.py q     ./node_modules/.bin/bare raw-input.js
python3 test-pty.py ctrlc ./node_modules/.bin/bare bin-spike.mjs --no-updates
```

Resultados obtenidos (los 4 casos):

| Caso | raw mode | terminal restaurada | exit code |
|---|---|---|---|
| standalone + `q` | OK | OK | 0 |
| standalone + Ctrl+C | OK | OK | 130 |
| template + `q` | OK | OK | 0 |
| template + Ctrl+C | OK | OK | 130 |

`termios` medido antes / durante / después: `icanon,echo` pasa de `True,True` →
`False,False` (raw) → `True,True` (restaurado).

## Qué funciona

- **Flechas** — llegan como ANSI de 3 bytes (`1b5b41`..`1b5b44`), decodificadas a `up/down/left/right`.
- **Espacio** (`20`), letras, Enter, Tab, Backspace, Escape.
- **Typeahead**: varias teclas en un mismo chunk se decodifican todas (probado con `\x1b[A\x1b[Ax `).
- **Tamaño de terminal**: `WriteStream.columns/rows` + evento `resize` (SIGWINCH). Gratis para el juego.

## Los 3 gotchas que importan

### 1. En raw mode, Ctrl+C NO es SIGINT

Llega como el **byte `0x03`**. Si no lo manejás a mano, el juego es incerrable.
El handler de `process.on('SIGINT')` que usa la doc de P2P **no se dispara** con raw mode activo.

### 2. Hay que restaurar la terminal SIEMPRE

Si el proceso muere en raw mode, el shell del usuario queda sin echo — inutilizable.
`keys.js` lo cubre con un `restore()` idempotente llamado desde la tecla de salida,
desde el error handler y desde `Bare.on('exit')`.

### 3. Salir de un long-lived tiene DOS requisitos

Este costó encontrarlo — el proceso quedaba colgado con la app ya cerrada:

1. **Cerrar la App**: `app.exit(code)` (`Bare.exitCode = code; await close()`). Con el worker
   de `PearRuntime.run` activo, `Bare.exit()` a secas se cuelga.
2. **Soltar todos los handles propios**, timers incluidos. Un `setInterval` vivo mantiene
   el loop y el proceso no termina nunca. El game loop del juego entra justo en esta categoría.

## Archivos

| Archivo | Qué es |
|---|---|
| `keys.js` | **La pieza reutilizable.** Decoder de teclas + raw mode + restore idempotente. |
| `raw-input.js` | Demo standalone. |
| `bin-spike.mjs` | Integrado al template: App + worker + teardown correcto. **Este es el patrón a copiar.** |
| `test-pty.py` | Test automatizado con pty + verificación de termios. |

El resto son archivos del template `hello-pear-bare` sin tocar.

## Notas

- `upgrade` en `package.json` apunta a una **key descartable del spike**
  (`pear://gisx7sp6...`), sólo para que el worker no crashee con el placeholder.
  **No es la key del proyecto.** Esa se genera una sola vez, aparte, y define quién publica.
- Sin `upgrade` válido el worker tira `INVALID_URL: pear://<YOUR_KEY_HERE>` y se lleva
  el proceso puesto (exit 134). Vale para cualquiera que clone el template.
- **No probado:** Windows. Las secuencias ANSI de flechas y el raw mode de `bare-tty`
  deberían andar en Windows Terminal, pero no lo verifiqué. Si alguien del equipo está en
  Windows, conviene que corra `npm run spike` temprano.
