// SPIKE 1 — lector de teclas en raw mode para Bare.
//
// Esta es la pieza reutilizable: decodifica bytes crudos del TTY en teclas
// con nombre, y garantiza que la terminal se restaure pase lo que pase.
//
// El shutdown NO se decide acá a propósito: el caller elige qué hacer con
// 'q' / Ctrl+C, porque dentro del template hay que cerrar la App antes de salir
// (ver bin-spike.mjs). Ver README.md.

const tty = require('bare-tty')

// Las flechas llegan como secuencias ANSI de 3 bytes: ESC [ A/B/C/D.
const ARROWS = { 0x41: 'up', 0x42: 'down', 0x43: 'right', 0x44: 'left' }

// Un solo chunk puede traer varias teclas (typeahead, o el paste de una secuencia).
function decode(buf) {
  const keys = []
  let i = 0

  while (i < buf.length) {
    const byte = buf[i]

    if (byte === 0x1b && buf[i + 1] === 0x5b && ARROWS[buf[i + 2]]) {
      keys.push({ name: ARROWS[buf[i + 2]], bytes: buf.subarray(i, i + 3) })
      i += 3
      continue
    }

    let name
    if (byte === 0x03) name = 'ctrl-c'
    else if (byte === 0x20) name = 'space'
    else if (byte === 0x0d) name = 'enter'
    else if (byte === 0x7f) name = 'backspace'
    else if (byte === 0x1b) name = 'escape'
    else if (byte === 0x09) name = 'tab'
    else if (byte >= 0x20 && byte < 0x7f) name = String.fromCharCode(byte)
    else name = `byte-0x${byte.toString(16).padStart(2, '0')}`

    keys.push({ name, bytes: buf.subarray(i, i + 1) })
    i += 1
  }

  return keys
}

// Activa raw mode y empieza a emitir teclas. Devuelve { restore, stdout }.
// restore() es idempotente: se puede llamar de varios paths de salida sin miedo.
function startKeys({ onKey, onError, hideCursor = true }) {
  // En raw mode el driver no traduce nada: no hay line buffering, no hay echo,
  // y Ctrl+C NO genera SIGINT — llega como el byte 0x03. Se maneja en onKey.
  if (!tty.isTTY(0)) {
    throw new Error('stdin no es un TTY (¿pipe o redirección?). Raw mode necesita un TTY real.')
  }

  const stdin = new tty.ReadStream(0)
  const stdout = new tty.WriteStream(1)

  let restored = false

  function restore() {
    if (restored) return
    restored = true
    try {
      stdin.setRawMode(false)
    } catch {
      // el handle ya puede estar cerrado; no hay nada que restaurar
    }
    if (hideCursor) stdout.write('\x1b[?25h')
    stdin.destroy()
  }

  stdin.setRawMode(true)
  if (hideCursor) stdout.write('\x1b[?25l')

  stdin.on('data', (chunk) => {
    for (const key of decode(chunk)) onKey(key)
  })

  stdin.on('error', (err) => {
    restore()
    if (onError) onError(err)
  })

  // Red de seguridad: si algo tira y nadie lo agarra, igual restauramos.
  // Si la terminal queda en raw mode, el shell del usuario queda inutilizable.
  Bare.on('exit', restore)

  return { restore, stdout, stdin }
}

module.exports = { decode, startKeys }
