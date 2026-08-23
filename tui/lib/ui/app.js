// The root tea model: menu → table → result, plus the pacing that makes the
// AI feel like it is thinking rather than teleporting.
//
// The model never blocks. An AI turn is a `tick` Cmd that resolves to an
// { type: 'ai' } Msg, so input and OTA update messages stay responsive even
// while the rivals are playing.
const { quit, tick, key } = require('../tea')
const { Game } = require('../uno/engine')
const { fromSeed } = require('../rng')
const ai = require('../uno/ai')
const { renderGame } = require('./screen')
const { renderMenu, renderRules, MENU_ITEMS } = require('./menu')
const { renderResult, BUTTONS } = require('./result')
const { fit, centre, tooSmall, tooSmallFor } = require('./canvas')

// How long the rivals "think", in ms.
const THINK_CANTO = 850
const THINK_PLAY = 550
const CLEAR_SAY = 2600

// The title screen's glitch bars: ~12fps is plenty for block characters and
// keeps the redraw cost off the floor.
const FRAME_MS = 80

// The deal: each card takes this many frames to fly from the pile to its seat.
// Twenty cards at three frames is five seconds, which is enough to read as a
// deal and not so long it becomes a wait.
const DEAL_FRAMES = 3

class App {
  constructor(opts = {}) {
    this.version = opts.version || '0.0.0'
    this.flags = opts.flags || {}
    this.rng = opts.rng || Math.random
    // El asiento del jugador local. En modo local siempre es 0; online lo
    // asigna el anfitrión, así que el modelo no puede asumir 0 en ningún lado.
    this.me = 0
    // net(msg) manda un mensaje al worker de red. null = modo local, sin red.
    this.net = opts.net || null
    // { sala, estado, anfitrion, peers, asientos, semilla } mientras hay sala.
    this.online = null
    // Tests set this to 0 so a whole hand plays out without real delays.
    this.think = opts.think || { canto: THINK_CANTO, play: THINK_PLAY }

    this.screen = 'menu' // menu | rules | game | result
    this.resultIndex = 0
    this.width = 80
    this.height = 24

    this.menuIndex = 0
    this.settings = {
      jugadores: Number(this.flags.jugadores) || 4,
      nivel: this.flags.nivel || 'normal',
      meta: Number(this.flags.meta) || 500
    }

    this.game = null
    this.frame = 0
    // While a deal is in progress: how many cards have landed, and how many
    // frames the current one has been in the air. null between deals.
    this.dealing = null
    this.selected = 0
    this.says = {}
    this.message = null
    this.updateStatus = null
    this._sayTag = 0

    if (this.flags.jugar) this.startGame()
  }

  init() {
    return this._animate()
  }

  // Animation runs only where something is actually moving: the bars on the
  // menu, and the spinner while the rivals think. On the player's own turn
  // nothing moves, so the loop stops rather than redraw twelve times a second
  // for a still picture.
  _animating() {
    if (this.think.frame === 0) return false
    if (this.screen === 'menu' || this.screen === 'result') return true
    if (this.screen !== 'game' || !this.game) return false
    return this.dealing !== null || this.game.currentActor() !== this.me
  }

  _animate() {
    return this._animating() ? tick(FRAME_MS, () => ({ type: 'frame' })) : null
  }

  // --- lifecycle -------------------------------------------------------

  startGame() {
    const level = this.settings.nivel

    // Online: los asientos y la semilla los reparte el anfitrión. Todos los
    // jugadores son humanos — no hay IA que sincronizar, y cada acción tiene
    // un dueño inequívoco.
    const online = this.online && this.online.asientos
    const roster = online
      ? this.online.asientos.map((a) => ({ name: a.nombre, isAI: false, level }))
      : ['Vos', 'Rita', 'Coco', 'Nacho']
          .slice(0, this.settings.jugadores)
          .map((name, i) => ({ name, isAI: i > 0, level }))

    // Misma semilla en todos los peers = mismo mazo. Es lo que permite mandar
    // sólo las acciones por la red en vez del estado entero.
    const rng = online ? fromSeed(this.online.semilla) : this.rng

    this.game = new Game({ players: roster, target: this.settings.meta, rng })
    this.screen = 'game'
    this.selected = 0
    this.says = {}
    this.message = null
    return this._startDeal()
  }

  // Kick off the deal animation. Tests set think.deal = 0 and get the cards
  // instantly; the AI is not handed the turn until the last card lands.
  _startDeal() {
    if (this.think.deal === 0 || this.think.frame === 0) {
      this.dealing = null
      return this._maybeAI()
    }
    this.dealing = { landed: 0, age: 0, total: this.game.playerCount * 5 }
    return this._animate()
  }

  // One frame of the deal. Returns true when the last card has landed.
  _advanceDeal() {
    const deal = this.dealing
    if (!deal) return true
    deal.age++
    if (deal.age >= DEAL_FRAMES) {
      deal.age = 0
      deal.landed++
    }
    if (deal.landed >= deal.total) {
      this.dealing = null
      return true
    }
    return false
  }

  // Hand the turn to the AI if it is theirs, as a delayed Cmd.
  _maybeAI() {
    const game = this.game
    if (!game || game.phase === 'game-over') return null
    if (this.dealing !== null) return null
    // Online no hay bots: cada asiento es una persona y su acción llega por red.
    if (this.online) return null

    const seat = game.currentActor()
    if (seat === null || seat === this.me) return null

    // A live UNO window gets a longer beat, so there is time to shout.
    const delay = game.unoWindow ? this.think.canto : this.think.play
    return tick(delay, () => ({ type: 'ai' }))
  }

  _runAI() {
    const game = this.game
    const seat = game.currentActor()
    if (seat === null || seat === this.me) return null

    const action = ai.decide(game, seat, this.rng)
    if (!action) return null

    const line = ai.chatter(action, this.rng)
    if (line) this.says = { ...this.says, [seat]: line }

    game.apply(action)
    this.selected = Math.min(this.selected, Math.max(0, game.hands[this.me].length - 1))
    if (game.isOver()) {
      this.screen = 'result'
      this.resultIndex = 0
      return this._animate()
    }

    const linger = typeof this.think.say === 'number' ? this.think.say : CLEAR_SAY
    const clear = line ? tick(linger, () => ({ type: 'unsay', seat, tag: ++this._sayTag })) : null
    const next = this._maybeAI()
    return [clear, next].filter(Boolean)
  }

  // --- update ----------------------------------------------------------

  update(msg) {
    if (!msg) return [this, null]

    switch (msg.type) {
      case 'resize':
        this.width = msg.width
        this.height = msg.height
        return [this, null]

      case 'frame': {
        if (!this._animating()) return [this, null]
        this.frame++
        if (this.dealing !== null && this._advanceDeal()) {
          // Last card down: the deal is over and play can begin.
          return [this, [this._maybeAI(), this._animate()].filter(Boolean)]
        }
        return [this, this._animate()]
      }

      case 'ai':
        if (this.screen !== 'game') return [this, null]
        return [this, this._runAI()]

      case 'unsay': {
        const says = { ...this.says }
        delete says[msg.seat]
        this.says = says
        return [this, null]
      }

      // Anything the pear wrapper would have printed — version banner and
      // updater progress — arrives here instead of on the raw screen.
      case 'log':
        return [this, this._onLog(msg)]

      case 'update-status':
        this.updateStatus = { text: msg.text, color: msg.color }
        return [this, null]

      case 'key':
        return this._onKey(msg)

      // Todo lo que llega del worker de red. El worker no sabe nada del juego:
      // manda eventos y acá se decide qué hacer con ellos.
      case 'net':
        return this._onNet(msg.evento)

      default:
        return [this, null]
    }
  }

  _onNet(e) {
    if (!e) return [this, null]

    switch (e.t) {
      case 'estado':
        if (e.estado === 'fuera') {
          this.online = null
          return [this, null]
        }
        this.online = { ...(this.online || {}), estado: e.estado, sala: e.sala }
        // Conectar tarda entre 6 y 15 segundos: sin este cartel la pantalla
        // parece colgada y la gente cierra el juego antes de que enganche.
        this.message =
          e.estado === 'buscando'
            ? `Sala "${e.sala}" — buscando jugadores…`
            : `Sala "${e.sala}" — anunciada, esperando…`
        return [this, null]

      case 'peers': {
        const otros = e.lista.filter((p) => p.nombre).map((p) => p.nombre)
        this.online = { ...(this.online || {}), peers: otros }
        this.message = otros.length
          ? `En la sala: vos + ${otros.join(', ')}`
          : 'Sala vacía — esperando jugadores…'
        return [this, null]
      }

      case 'seats':
        // El asiento propio lo resuelve el worker, que es quien conoce la
        // clave pública de este peer.
        this.me = e.miAsiento
        this.online = {
          ...(this.online || {}),
          asientos: e.asientos,
          semilla: e.semilla
        }
        return [this, null]

      case 'start':
        if (!this.online || !this.online.asientos) return [this, null]
        this.settings.jugadores = this.online.asientos.length
        return [this, this.startGame()]

      case 'action': {
        // Una acción de otro jugador. Se aplica tal cual: todos los peers
        // corren el mismo engine sobre el mismo mazo, así que el resultado
        // es idéntico sin mandar estado.
        if (!this.game || this.screen !== 'game') return [this, null]
        this.game.apply(e.action)
        this.selected = Math.min(
          this.selected,
          Math.max(0, this.game.hands[this.me].length - 1)
        )
        if (this.game.isOver()) {
          this.screen = 'result'
          this.resultIndex = 0
        }
        return [this, this._animate()]
      }

      case 'peer-lost':
        // Sin IA no hay quien reemplace al que se fue: se avisa y todos vuelven
        // al menú. Es la salida honesta para una partida de 4 humanos.
        this.message = `${e.nombre} ${e.motivo} — partida cancelada`
        this.screen = 'menu'
        this.game = null
        this.dealing = null
        this.online = { ...(this.online || {}), asientos: null }
        this.me = 0
        return [this, this._animate()]

      case 'error':
        this.message = `Error de red: ${e.mensaje}`
        return [this, null]

      default:
        return [this, null]
    }
  }

  _onLog(msg) {
    const line = String(msg.line || '')
    if (/\[updater\]/.test(line)) {
      this.updateStatus = {
        text: '⇣ ' + line.replace(/^\[updater\]\s*/, ''),
        color: 'brightyellow'
      }
    }
    return null
  }

  _onKey(msg) {
    if (key.matches(msg, 'ctrl+c')) return [this, quit]

    if (this.screen === 'menu') return this._menuKey(msg)
    if (this.screen === 'result') return this._resultKey(msg)
    if (this.screen === 'rules') {
      if (key.matches(msg, 'escape', 'enter', 'q', 'r')) this.screen = 'menu'
      return [this, null]
    }
    return this._gameKey(msg)
  }

  _menuKey(msg) {
    if (key.matches(msg, 'q', 'escape')) return [this, quit]

    // Two buttons side by side, so left/right is the natural way to move.
    if (key.matches(msg, 'left', 'right', 'h', 'l', 'up', 'down', 'k', 'j', 'tab')) {
      this.menuIndex = this.menuIndex === 0 ? 1 : 0
      return [this, null]
    }

    if (key.matches(msg, 'r')) {
      this.screen = 'rules'
      return [this, null]
    }

    // Con una sala armada, ENTER arranca la partida (sólo el anfitrión puede).
    if (key.matches(msg, 'enter', 'space') && this.online && this.online.asientos) {
      if (!this.online.anfitrion) {
        this.message = 'Esperá a que el anfitrión arranque la partida.'
        return [this, null]
      }
      if (this.online.asientos.length < 2) {
        this.message = 'Hacen falta al menos 2 jugadores.'
        return [this, null]
      }
      if (this.net) this.net({ t: 'start' })
      return [this, null]
    }

    // Ya estamos en una sala, esperando gente. ENTER acá NO puede volver a
    // joinear: eso destruye el swarm y reinicia el discovery desde cero, o sea
    // que el que se impacienta y aprieta ENTER se sabotea solo. Medido: el
    // discovery tarda 6-15s y falla ~30% al primer intento, así que esta
    // ventana de espera es justo cuando la gente aprieta teclas.
    if (key.matches(msg, 'enter', 'space') && this.online) {
      this.message = `Sala "${this.online.sala}" — esperando jugadores…`
      return [this, null]
    }

    if (key.matches(msg, 'enter', 'space')) {
      const item = MENU_ITEMS[this.menuIndex]

      // Sin capa de red (tests, o el worker caído) el juego sigue siendo el de
      // siempre: una partida local contra bots.
      if (!this.net) {
        if (item.id === 'create') return [this, this.startGame()]
        this.message = 'No hay red disponible — jugá local.'
        return [this, null]
      }

      const sala = this.flags.sala || 'general'
      const nombre = this.flags.nombre || 'jugador'
      this.online = { sala, anfitrion: item.id === 'create', peers: [], asientos: null }
      this.net({ t: 'join', sala, nombre, anfitrion: item.id === 'create' })
      this.message =
        item.id === 'create'
          ? `Creando sala "${sala}" — buscando jugadores…`
          : `Entrando a "${sala}" — buscando…`
      return [this, null]
    }

    // L = jugar local contra bots, sin red. Es el modo de desarrollo: deja
    // probar toda la UI sin coordinar a cuatro personas.
    if (key.matches(msg, 'L')) {
      this.online = null
      this.me = 0
      return [this, this.startGame()]
    }

    return [this, null]
  }

  _resultKey(msg) {
    if (key.matches(msg, 'left', 'right', 'h', 'l', 'up', 'down', 'k', 'j', 'tab')) {
      this.resultIndex = this.resultIndex === 0 ? 1 : 0
      return [this, null]
    }
    if (key.matches(msg, 'escape', 'q')) {
      this.screen = 'menu'
      this.game = null
      return [this, this._animate()]
    }
    if (key.matches(msg, 'enter', 'space')) {
      if (BUTTONS[this.resultIndex].id === 'rematch') return [this, this.startGame()]
      this.screen = 'menu'
      this.game = null
      return [this, this._animate()]
    }
    return [this, null]
  }

  _cycle(id, dir) {
    if (id === 'jugadores') {
      const counts = [2, 3, 4]
      const i = counts.indexOf(this.settings.jugadores)
      this.settings.jugadores = counts[(i + dir + counts.length) % counts.length]
    }
    if (id === 'meta') {
      const metas = [200, 300, 500]
      const i = metas.indexOf(this.settings.meta)
      this.settings.meta = metas[(i + dir + metas.length) % metas.length]
    }
    if (id === 'nivel') {
      const levels = ai.LEVELS
      const i = levels.indexOf(this.settings.nivel)
      this.settings.nivel = levels[(i + dir + levels.length) % levels.length]
    }
  }

  _gameKey(msg) {
    const game = this.game

    if (key.matches(msg, 'escape')) {
      this.screen = 'menu'
      this.dealing = null
      return [this, this._animate()]
    }

    // Nothing else does anything until the deal has landed.
    if (this.dealing !== null) return [this, null]

    if (game.phase === 'game-over') {
      // The result screen takes over; any key gets you there.
      this.screen = 'result'
      this.resultIndex = 0
      return [this, this._animate()]
    }

    // Shouting UNO happens out of turn — to save yourself, or to catch a rival
    // who went quiet on one card.
    if (key.matches(msg, 'u') && game.unoWindow) {
      return [this, this._act({ type: 'uno', seat: this.me }, game.legalActions(this.me))]
    }

    // Naming a colour after a +4.
    if (game.phase === 'choose-color' && game.chooser === this.me) {
      const colors = { r: 'rojo', a: 'amarillo', v: 'verde', z: 'azul' }
      for (const [chord, color] of Object.entries(colors)) {
        if (key.matches(msg, chord)) {
          return [
            this,
            this._act({ type: 'color', seat: this.me, color }, game.legalActions(this.me))
          ]
        }
      }
      return [this, null]
    }

    if (game.currentActor() !== this.me) return [this, null]

    const legal = game.legalActions(this.me)
    this.message = null
    const hand = game.hands[this.me]

    if (key.matches(msg, 'left', 'h')) {
      this.selected = (this.selected - 1 + hand.length) % hand.length
      return [this, null]
    }
    if (key.matches(msg, 'right', 'l')) {
      this.selected = (this.selected + 1) % hand.length
      return [this, null]
    }

    for (let i = 0; i < Math.min(hand.length, 9); i++) {
      if (key.matches(msg, String(i + 1))) return [this, this._play(hand[i])]
    }

    if (key.matches(msg, 'enter', 'space')) return [this, this._play(hand[this.selected])]

    // One key for both, since only ever one of them is legal at a time: with a
    // stack on the table you eat it, otherwise you draw one.
    if (key.matches(msg, 'd')) {
      const take = legal.find((a) => a.type === 'take')
      const draw = legal.find((a) => a.type === 'draw')
      if (take || draw) return [this, this._act(take || draw, legal)]
      this.message = 'No podés robar ahora.'
      return [this, null]
    }

    if (key.matches(msg, 'p')) {
      const pass = legal.find((a) => a.type === 'pass')
      if (pass) return [this, this._act(pass, legal)]
      this.message = 'Sólo podés pasar después de robar.'
      return [this, null]
    }

    return [this, null]
  }

  _play(card) {
    if (!card) return null
    const action = { type: 'play', seat: this.me, card }
    const legal = this.game.legalActions(this.me)

    const allowed = legal.some(
      (a) => a.type === 'play' && a.card.color === card.color && a.card.rank === card.rank
    )
    if (!allowed) {
      this.message = 'Esa carta no va acá.'
      return null
    }
    return this._act(action, legal)
  }

  // Apply an action only if the engine actually offers it — the UI never
  // invents a move the rules do not allow.
  _act(action, legal) {
    const allowed = legal.some(
      (a) =>
        a.type === action.type &&
        a.color === action.color &&
        (!a.card ||
          (action.card && a.card.color === action.card.color && a.card.rank === action.card.rank))
    )
    if (!allowed) {
      this.message = 'Esa jugada no vale.'
      return null
    }

    // Online: la acción viaja ANTES de aplicarse local, así el resto la ve
    // cuanto antes. Todos aplican la misma acción sobre el mismo estado.
    if (this.online && this.net) this.net({ t: 'action', action })

    this.game.apply(action)
    this.selected = Math.min(this.selected, Math.max(0, this.game.hands[this.me].length - 1))
    if (this.game.isOver()) {
      this.screen = 'result'
      this.resultIndex = 0
      return this._animate()
    }
    return this._maybeAI()
  }

  // --- view ------------------------------------------------------------

  view() {
    // One fixed canvas, centred. A window too small to hold it is asked to
    // grow rather than served a second, reflowed layout.
    if (tooSmallFor(this.width, this.height)) return tooSmall(this.width, this.height)

    const shared = {
      version: this.version,
      updateStatus: this.updateStatus,
      frame: this.frame,
      me: this.me,
      online: this.online
    }

    const canvas =
      this.screen === 'menu'
        ? renderMenu({
            ...shared,
            index: this.menuIndex,
            settings: this.settings,
            message: this.message
          })
        : this.screen === 'rules'
          ? fit(renderRules())
          : this.screen === 'result'
            ? renderResult(this.game, { ...shared, index: this.resultIndex })
            : renderGame(this.game, {
                ...shared,
                selected: this.selected,
                says: this.says,
                message: this.message,
                dealt: this.dealing ? this.dealing.landed : undefined,
                flight: this.dealing ? this.dealing.age / DEAL_FRAMES : undefined
              })

    return centre(canvas, this.width, this.height)
  }
}

module.exports = App
