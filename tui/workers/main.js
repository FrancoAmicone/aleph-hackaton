// Worker de Bare: dueño de la red del juego.
//
// La TUI corre en el proceso principal y no toca sockets; acá adentro vive el
// Hyperswarm de la partida. Se hablan por Bare.IPC, envuelto en FramedStream
// para que cada write() llegue como un mensaje entero (un stream duplex no
// preserva límites de mensaje: dos JSON seguidos pueden llegar pegados o
// partidos al medio, y JSON.parse revienta).
//
// No recibe argumentos por argv a propósito: `createPearCli` spawnea los
// workers con `PearRuntime.run(script)`, sin args. La configuración llega como
// un mensaje 'join', lo que además permite entrar y salir de salas sin
// respawnear el worker.
//
// Protocolo con la TUI
//   TUI -> worker : { t: 'join', sala, nombre, anfitrion }
//                   { t: 'action', action }
//                   { t: 'leave' }
//   worker -> TUI : { t: 'estado', estado, ... }   buscando | anunciado
//                   { t: 'peers', lista }
//                   { t: 'seats', semilla, asientos }
//                   { t: 'action', action }
//                   { t: 'peer-lost', nombre, motivo }
//                   { t: 'error', mensaje }

const FramedStream = require('framed-stream')
const b4a = require('b4a')
const { Room } = require('../lib/net/room')

const pipe = new FramedStream(Bare.IPC)

let room = null

function emit(evento) {
  try {
    pipe.write(b4a.from(JSON.stringify(evento)))
  } catch {
    // la TUI se está cerrando
  }
}

pipe.on('error', () => {})

pipe.on('data', async (buf) => {
  let msg
  try {
    msg = JSON.parse(buf.toString())
  } catch {
    return
  }

  try {
    switch (msg.t) {
      case 'join': {
        if (room) await room.destroy()
        room = new Room({ sala: msg.sala, nombre: msg.nombre, onEvent: emit })
        await room.join({ anfitrion: !!msg.anfitrion })
        break
      }

      case 'action': {
        if (room) room.enviarAccion(msg.action)
        break
      }

      case 'leave': {
        if (room) await room.destroy()
        room = null
        emit({ t: 'estado', estado: 'fuera' })
        break
      }
    }
  } catch (err) {
    emit({ t: 'error', mensaje: err.message })
  }
})

// El proceso principal destruye el worker en su teardown; esto es la red de
// seguridad para que el swarm se cierre igual si el worker muere por su cuenta.
Bare.on('exit', () => {
  if (room) room.destroy()
})
