// Una sala de juego sobre Hyperswarm.
//
// Corre en el proceso principal, junto a la TUI. Vivió un tiempo dentro de un
// worker de Bare (`workers/main.js`) para que el descubrimiento no le robara
// frames al render, pero eso rompía el binario compilado: bare-pack sólo
// empaqueta lo que alcanza por un `require` estático, y la ruta del worker se
// resolvía en runtime. Ver docs/06-troubleshooting.md.
//
// Sobre el swarm: `lib/pear-cli.js` ya tiene el suyo y le hace
// `store.replicate(connection)` a TODA conexión entrante, porque el updater lo
// necesita. Si metiéramos tráfico de juego en ese mismo swarm, cada peer de la
// partida terminaría hablándole el protocolo de Hypercore al replicador.
// Por eso acá se levanta un swarm aparte, aunque cueste un nodo DHT más.
//
// Modelo de sincronización: lockstep determinístico.
//   - el anfitrión sortea una semilla y la reparte junto con los asientos
//   - todos construyen el mismo mazo a partir de esa semilla
//   - por la red viajan SOLO las acciones del engine, que ya son JSON plano
// No hace falta serializar ni reconciliar estado.

const Hyperswarm = require('hyperswarm')
const crypto = require('hypercore-crypto')
const b4a = require('b4a')
const FramedStream = require('framed-stream')

// Cada cuánto se fuerza un announce+lookup mientras estamos solos.
// Si dos peers arrancan a la vez, cada uno puede hacer su lookup antes de que
// el announce del otro se haya propagado por el DHT, y entonces no se ven hasta
// el refresh automático, que es lento. Medido sin esto: 6s, 7s y 43s.
// Con esto: 6s, 11s, 7s, 6s.
const REFRESH_MS = 5000

// Heartbeat. Hyperswarm va sobre UDX (UDP): una caída abrupta —cerrar la
// terminal, quedarse sin batería— no genera ningún RST, así que el otro lado
// no se entera nunca. Medido: 10 segundos sin recibir nada. Con ping cada 2s
// y un umbral de 6s, la detección baja a ~6 segundos.
const PING_MS = 2000
const DEAD_MS = 6000

const MAX_JUGADORES = 4

class Room {
  // onEvent(evento) — el worker lo reenvía tal cual a la TUI por IPC.
  constructor({ sala, nombre, onEvent }) {
    this.sala = sala
    this.nombre = nombre
    this.onEvent = onEvent

    // El topic son 32 bytes. Derivarlo hasheando el nombre de sala hace que dos
    // personas que tipean lo mismo caigan en el mismo lugar, sin copiar hex.
    // El prefijo es un namespace: evita chocar con otra app que hashee
    // el mismo nombre.
    this.topic = crypto.data(b4a.from(`the-great-pear:room:${sala}`))

    this.swarm = new Hyperswarm()
    this.yo = b4a.toString(this.swarm.keyPair.publicKey, 'hex')

    // clave hex del peer -> { conn, framed, nombre, ultimoVisto }
    this.peers = new Map()

    this.discovery = null
    this.refresher = null
    this.latido = null

    // El anfitrión es quien crea la sala. Reparte asientos y semilla.
    this.esAnfitrion = false
    this.semilla = null
    this.asientos = null
    this.cerrando = false
  }

  async join({ anfitrion = false } = {}) {
    this.esAnfitrion = anfitrion
    if (anfitrion) this.semilla = crypto.randomBytes(32).toString('hex')

    this.swarm.on('connection', (conn) => this._onConnection(conn))

    // client: busco peers · server: me anuncio para que me encuentren.
    // Los dos en true = todos son iguales, no hay servidor.
    this.discovery = this.swarm.join(this.topic, { client: true, server: true })

    this.refresher = setInterval(() => {
      if (this.peers.size > 0) return
      this.discovery.refresh({ client: true, server: true }).catch(() => {})
    }, REFRESH_MS)

    this.latido = setInterval(() => this._latir(), PING_MS)

    this._emit({
      t: 'estado',
      estado: 'buscando',
      sala: this.sala,
      anfitrion,
      topic: b4a.toString(this.topic, 'hex').slice(0, 12)
    })

    // flushed() resuelve cuando MI announce se propagó — NO cuando encontré a
    // alguien. Confundir las dos cosas nos costó horas de debug.
    await this.discovery.flushed().catch(() => {})
    this._emit({ t: 'estado', estado: 'anunciado', sala: this.sala })
  }

  _onConnection(conn) {
    const clave = b4a.toString(conn.remotePublicKey, 'hex')
    if (this.peers.has(clave)) {
      // Hyperswarm ya deduplica, pero una reconexión puede solaparse.
      conn.destroy()
      return
    }

    const framed = new FramedStream(conn)
    const peer = { conn, framed, clave, nombre: null, ultimoVisto: Date.now() }
    this.peers.set(clave, peer)

    // Hacen falta LOS DOS handlers de error. Con sólo conn.on('error'), un
    // ECONNRESET que llega por el stream envolvente tumba el proceso entero:
    // un jugador cierra la ventana y al otro se le cae el juego.
    conn.on('error', () => {})
    framed.on('error', () => {})

    framed.on('data', (buf) => this._onMessage(peer, buf))
    conn.once('close', () => this._dropPeer(clave, 'left'))

    this._send(peer, { t: 'hello', nombre: this.nombre })

    // Si soy el anfitrión y ya está la mesa, reparto asientos.
    if (this.esAnfitrion) this._repartirAsientos()

    this._emitPeers()
  }

  _onMessage(peer, buf) {
    let msg
    try {
      msg = JSON.parse(buf.toString())
    } catch {
      return // basura o un peer con otra versión del protocolo
    }

    peer.ultimoVisto = Date.now()

    switch (msg.t) {
      case 'hello':
        peer.nombre = msg.nombre
        this._emitPeers()
        if (this.esAnfitrion) this._repartirAsientos()
        break

      case 'seats':
        // Sólo el anfitrión reparte. Si soy anfitrión, ignoro: dos repartos
        // distintos darían dos mazos distintos y la partida divergiría.
        if (this.esAnfitrion) break
        this.semilla = msg.semilla
        this.asientos = msg.asientos
        this._emitSeats()
        break

      case 'action':
        // La acción del engine, tal cual. El seat viaja adentro.
        this._emit({ t: 'action', action: msg.action })
        break

      case 'start':
        // Sólo el anfitrión da el arranque. Si dos peers repartieran o
        // arrancaran, las partidas divergirían.
        if (!this.esAnfitrion) this._emit({ t: 'start' })
        break

      case 'ping':
        break // ya actualizamos ultimoVisto arriba
    }
  }

  // El anfitrión asigna asientos por orden de llegada y comparte la semilla.
  _repartirAsientos() {
    const conocidos = [...this.peers.values()].filter((p) => p.nombre)
    const asientos = [{ nombre: this.nombre, clave: this.yo, seat: 0 }]

    conocidos.slice(0, MAX_JUGADORES - 1).forEach((p, i) => {
      asientos.push({ nombre: p.nombre, clave: p.clave, seat: i + 1 })
    })

    this.asientos = asientos
    this.broadcast({ t: 'seats', semilla: this.semilla, asientos })
    this._emitSeats()
  }

  // El modelo necesita saber CUÁL de los asientos es el suyo: el juego está
  // escrito asumiendo que "yo" soy un índice concreto, y online ese índice ya
  // no es siempre 0. Lo resolvemos acá, que es donde se conoce la clave propia.
  _emitSeats() {
    const mio = (this.asientos || []).find((a) => a.clave === this.yo)

    // El anfitrión reparte apenas se abre la conexión, antes de que llegue el
    // `hello` del otro: en esa primera lista el invitado todavía no figura.
    // Emitirla igual haría que se creyera asiento 0 —el del anfitrión— hasta
    // el reparto siguiente. Si un `start` cayera en esa ventana, dos jugadores
    // jugarían el mismo asiento y la partida divergiría. Mejor no emitir nada:
    // el reparto bueno llega milisegundos después.
    if (!mio && !this.esAnfitrion) return

    this._emit({
      t: 'seats',
      semilla: this.semilla,
      asientos: this.asientos,
      miAsiento: mio ? mio.seat : 0
    })
  }

  // Manda una acción del engine a todos y la devuelve al modelo propio.
  enviarAccion(action) {
    this.broadcast({ t: 'action', action })
  }

  // El anfitrión da el arranque: todos construyen la partida con la semilla.
  enviarInicio() {
    if (!this.esAnfitrion) return
    this.broadcast({ t: 'start' })
    this._emit({ t: 'start' })
  }

  broadcast(msg) {
    for (const peer of this.peers.values()) this._send(peer, msg)
  }

  _send(peer, msg) {
    try {
      peer.framed.write(b4a.from(JSON.stringify(msg)))
    } catch {
      // el peer se está cayendo; el close lo va a limpiar
    }
  }

  _latir() {
    const ahora = Date.now()
    for (const [clave, peer] of this.peers) {
      if (ahora - peer.ultimoVisto > DEAD_MS) {
        this._dropPeer(clave, 'disconnected')
        continue
      }
      this._send(peer, { t: 'ping' })
    }
  }

  _dropPeer(clave, motivo) {
    const peer = this.peers.get(clave)
    if (!peer) return
    this.peers.delete(clave)
    try {
      peer.conn.destroy()
    } catch {}

    this._emit({ t: 'peer-lost', nombre: peer.nombre || clave.slice(0, 6), motivo })
    this._emitPeers()
  }

  _emitPeers() {
    this._emit({
      t: 'peers',
      lista: [...this.peers.values()].map((p) => ({
        nombre: p.nombre,
        clave: p.clave.slice(0, 6)
      }))
    })
  }

  _emit(evento) {
    if (!this.cerrando) this.onEvent(evento)
  }

  async destroy() {
    if (this.cerrando) return
    this.cerrando = true

    // Los intervalos mantienen vivo el event loop de Bare: sin esto el worker
    // no termina nunca, aunque el swarm ya esté destruido.
    clearInterval(this.refresher)
    clearInterval(this.latido)

    for (const peer of this.peers.values()) {
      try {
        peer.conn.destroy()
      } catch {}
    }
    this.peers.clear()

    // Destruir el swarm no es prolijidad: los que no se destruyen dejan
    // registros colgados en el HyperDHT y degradan las conexiones siguientes.
    // Medido: teardown sucio 4/10 conexiones exitosas, limpio 7/10.
    try {
      await this.swarm.destroy()
    } catch {}
  }
}

module.exports = { Room, MAX_JUGADORES }
