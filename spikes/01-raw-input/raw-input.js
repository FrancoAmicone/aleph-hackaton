// SPIKE 1 — demo standalone de input crudo en Bare.
//
// Pregunta: ¿se pueden leer teclas sueltas (sin Enter) sin bloquear el loop?
// Respuesta: sí, con bare-tty. ReadStream.setRawMode(true) + eventos 'data'.
//
// Correr:  ./node_modules/.bin/bare raw-input.js
// Salir:   'q' o Ctrl+C (ambos restauran la terminal).
//
// Para la versión integrada al template ver bin-spike.mjs.

const b4a = require('b4a')
const { startKeys } = require('./keys.js')

let keys

function quit(reason, code = 0) {
  keys.restore()
  console.log(`\n[spike] saliendo por ${reason}. Terminal restaurada.`)
  Bare.exit(code)
}

keys = startKeys({
  onKey(key) {
    const hex = b4a.toString(key.bytes, 'hex')
    console.log(`tecla: ${key.name.padEnd(10)} bytes: ${hex}`)

    if (key.name === 'ctrl-c') quit('Ctrl+C', 130)
    if (key.name === 'q') quit("tecla 'q'")
  },
  onError(err) {
    console.error('[spike] error en stdin:', err)
    Bare.exit(1)
  }
})

console.log(`[spike] raw mode ON — terminal ${keys.stdout.columns}x${keys.stdout.rows}`)
console.log('[spike] probá: flechas, espacio, letras. Salir: q o Ctrl+C\n')

// Prueba de que el loop NO está bloqueado: este heartbeat sigue latiendo
// mientras se leen teclas. Si el input fuera bloqueante, no se vería.
let ticks = 0
setInterval(() => {
  console.log(`[heartbeat] ${++ticks}s — el loop sigue vivo`)
}, 1000)
