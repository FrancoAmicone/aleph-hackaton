// The root tea model: menu → table → result, plus the pacing that makes the
// AI feel like it is thinking rather than teleporting.
//
// The model never blocks. An AI turn is a `tick` Cmd that resolves to an
// { type: 'ai' } Msg, so input and OTA update messages stay responsive even
// while the rivals are playing.
const { quit, tick, key } = require('../tea')
const { Game } = require('../truco/engine')
const ai = require('../truco/ai')
const { renderGame } = require('./screen')
const { renderMenu, renderRules, MENU_ITEMS } = require('./menu')
const { fit, centre, tooSmall, tooSmallFor } = require('./canvas')

// How long the rivals "think", in ms.
const THINK_CANTO = 850
const THINK_PLAY = 550
const CLEAR_SAY = 2600

// The title screen's glitch bars: ~12fps is plenty for block characters and
// keeps the redraw cost off the floor.
const FRAME_MS = 80

class App {
  constructor(opts = {}) {
    this.version = opts.version || '0.0.0'
    this.flags = opts.flags || {}
    this.rng = opts.rng || Math.random
    // Tests set this to 0 so a whole hand plays out without real delays.
    this.think = opts.think || { canto: THINK_CANTO, play: THINK_PLAY }

    this.screen = 'menu' // menu | rules | game
    this.width = 80
    this.height = 24

    this.menuIndex = 0
    this.settings = {
      duelo: !!this.flags.duelo,
      nivel: this.flags.nivel || 'normal',
      conFlor: !this.flags.sinFlor
    }

    this.game = null
    this.frame = 0
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
    if (this.screen === 'menu') return true
    return this.screen === 'game' && !!this.game && this.game.currentActor() !== 0
  }

  _animate() {
    return this._animating() ? tick(FRAME_MS, () => ({ type: 'frame' })) : null
  }

  // --- lifecycle -------------------------------------------------------

  startGame() {
    const level = this.settings.nivel
    const roster = this.settings.duelo
      ? [
          { name: 'Vos', isAI: false },
          { name: 'Rita', isAI: true, level }
        ]
      : [
          { name: 'Vos', isAI: false },
          { name: 'Rita', isAI: true, level },
          { name: 'Coco', isAI: true, level },
          { name: 'Nacho', isAI: true, level }
        ]

    this.game = new Game({ players: roster, conFlor: this.settings.conFlor, rng: this.rng })
    this.screen = 'game'
    this.selected = 0
    this.says = {}
    this.message = null
    return this._maybeAI()
  }

  // Hand the turn to the AI if it is theirs, as a delayed Cmd.
  _maybeAI() {
    const game = this.game
    if (!game || game.phase === 'hand-over' || game.phase === 'game-over') return null

    const seat = game.currentActor()
    if (seat === null || seat === 0) return null

    const delay = game.phase === 'response' ? this.think.canto : this.think.play
    return tick(delay, () => ({ type: 'ai' }))
  }

  _runAI() {
    const game = this.game
    const seat = game.currentActor()
    if (seat === null || seat === 0) return null

    const action = ai.decide(game, seat, this.rng)
    if (!action) return null

    const line = ai.chatter(action, this.rng)
    if (line) this.says = { ...this.says, [seat]: line }

    game.apply(action)
    this.selected = Math.min(this.selected, Math.max(0, game.hands[0].length - 1))

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

      case 'frame':
        if (!this._animating()) return [this, null]
        this.frame++
        return [this, this._animate()]

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
    if (this.screen === 'rules') {
      if (key.matches(msg, 'escape', 'enter', 'q', 'r')) this.screen = 'menu'
      return [this, null]
    }
    return this._gameKey(msg)
  }

  _menuKey(msg) {
    if (key.matches(msg, 'q', 'escape')) return [this, quit]

    if (key.matches(msg, 'up', 'k')) {
      this.menuIndex = (this.menuIndex - 1 + MENU_ITEMS.length) % MENU_ITEMS.length
      return [this, null]
    }
    if (key.matches(msg, 'down', 'j')) {
      this.menuIndex = (this.menuIndex + 1) % MENU_ITEMS.length
      return [this, null]
    }

    const item = MENU_ITEMS[this.menuIndex]

    if (key.matches(msg, 'left', 'right', 'h', 'l')) {
      this._cycle(item.id, key.matches(msg, 'left', 'h') ? -1 : 1)
      return [this, null]
    }

    if (key.matches(msg, 'enter', 'space')) {
      switch (item.id) {
        case 'jugar':
          return [this, this.startGame()]
        case 'modo':
        case 'nivel':
        case 'flor':
          this._cycle(item.id, 1)
          return [this, null]
        case 'reglas':
          this.screen = 'rules'
          return [this, null]
        case 'salir':
          return [this, quit]
      }
    }

    return [this, null]
  }

  _cycle(id, dir) {
    if (id === 'modo') this.settings.duelo = !this.settings.duelo
    if (id === 'flor') this.settings.conFlor = !this.settings.conFlor
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
      return [this, this._animate()]
    }

    if (game.phase === 'game-over') {
      if (key.matches(msg, 'enter', 'space')) {
        this.screen = 'menu'
        this.game = null
        return [this, this._animate()]
      }
      return [this, null]
    }

    if (game.phase === 'hand-over') {
      if (key.matches(msg, 'enter', 'space')) {
        game.nextHand()
        this.says = {}
        this.selected = 0
        this.message = null
        return [this, this._maybeAI()]
      }
      return [this, null]
    }

    // Nothing to do while the rivals are thinking.
    if (game.currentActor() !== 0) return [this, null]

    const legal = game.legalActions(0)
    this.message = null

    // Card selection and play.
    if (game.phase === 'play') {
      const hand = game.hands[0]

      if (key.matches(msg, 'left', 'h')) {
        this.selected = (this.selected - 1 + hand.length) % hand.length
        return [this, null]
      }
      if (key.matches(msg, 'right', 'l')) {
        this.selected = (this.selected + 1) % hand.length
        return [this, null]
      }

      for (let i = 0; i < hand.length; i++) {
        if (key.matches(msg, String(i + 1))) return [this, this._play(hand[i])]
      }

      if (key.matches(msg, 'enter', 'space')) return [this, this._play(hand[this.selected])]
      if (key.matches(msg, 'm')) return [this, this._act({ type: 'mazo', seat: 0 }, legal)]
    }

    if (game.phase === 'response') {
      if (key.matches(msg, 'q')) return [this, this._act({ type: 'quiero', seat: 0 }, legal)]
      if (key.matches(msg, 'n')) return [this, this._act({ type: 'no-quiero', seat: 0 }, legal)]
    }

    // Cantos share one key table across both phases.
    const canto = this._cantoFor(msg, legal)
    if (canto) return [this, this._act({ type: 'canto', seat: 0, canto }, legal)]

    return [this, null]
  }

  _cantoFor(msg, legal) {
    const available = legal.filter((a) => a.type === 'canto').map((a) => a.canto)

    const chords = {
      t: ['truco', 'retruco', 'vale-cuatro'],
      e: ['envido'],
      r: ['real-envido'],
      a: ['falta-envido'],
      f: ['flor'],
      c: ['contraflor'],
      v: ['contraflor-al-resto']
    }

    for (const [chord, cantos] of Object.entries(chords)) {
      if (!key.matches(msg, chord)) continue
      const found = cantos.find((c) => available.includes(c))
      if (found) return found
      this.message = `No podés cantar eso ahora.`
      return null
    }
    return null
  }

  _play(card) {
    if (!card) return null
    return this._act({ type: 'play', seat: 0, card }, this.game.legalActions(0))
  }

  // Apply an action only if the engine actually offers it — the UI never
  // invents a move the rules do not allow.
  _act(action, legal) {
    const allowed = legal.some(
      (a) =>
        a.type === action.type &&
        a.canto === action.canto &&
        (!a.card ||
          (action.card && a.card.rank === action.card.rank && a.card.suit === action.card.suit))
    )
    if (!allowed) {
      this.message = 'Esa jugada no vale.'
      return null
    }

    this.game.apply(action)
    this.selected = Math.min(this.selected, Math.max(0, this.game.hands[0].length - 1))
    return this._maybeAI()
  }

  // --- view ------------------------------------------------------------

  view() {
    // One fixed canvas, centred. A window too small to hold it is asked to
    // grow rather than served a second, reflowed layout.
    if (tooSmallFor(this.width, this.height)) return tooSmall(this.width, this.height)

    const shared = { version: this.version, updateStatus: this.updateStatus, frame: this.frame }

    const canvas =
      this.screen === 'menu'
        ? renderMenu({ ...shared, index: this.menuIndex, settings: this.settings })
        : this.screen === 'rules'
          ? fit(renderRules())
          : renderGame(this.game, {
              ...shared,
              selected: this.selected,
              says: this.says,
              message: this.message
            })

    return centre(canvas, this.width, this.height)
  }
}

module.exports = App
