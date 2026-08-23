// The root tea model: menu → table → result, plus the pacing that makes the
// AI feel like it is thinking rather than teleporting.
//
// The model never blocks. An AI turn is a `tick` Cmd that resolves to an
// { type: 'ai' } Msg, so input and OTA update messages stay responsive even
// while the rivals are playing.
const { quit, tick, key } = require('../tea')
const { Game } = require('../uno/engine')
const ai = require('../uno/ai')
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
      jugadores: Number(this.flags.jugadores) || 4,
      nivel: this.flags.nivel || 'normal',
      meta: Number(this.flags.meta) || 500
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
    const names = ['Vos', 'Rita', 'Coco', 'Nacho'].slice(0, this.settings.jugadores)
    const roster = names.map((name, i) => ({ name, isAI: i > 0, level }))

    this.game = new Game({ players: roster, target: this.settings.meta, rng: this.rng })
    this.screen = 'game'
    this.selected = 0
    this.says = {}
    this.message = null
    return this._maybeAI()
  }

  // Hand the turn to the AI if it is theirs, as a delayed Cmd.
  _maybeAI() {
    const game = this.game
    if (!game || game.phase === 'round-over' || game.phase === 'game-over') return null

    const seat = game.currentActor()
    if (seat === null || seat === 0) return null

    // A live UNO window gets a longer beat, so there is time to shout.
    const delay = game.unoWindow ? this.think.canto : this.think.play
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
        case 'jugadores':
        case 'nivel':
        case 'meta':
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

    if (game.phase === 'round-over') {
      if (key.matches(msg, 'enter', 'space')) {
        game.nextRound()
        this.says = {}
        this.selected = 0
        this.message = null
        return [this, this._maybeAI()]
      }
      return [this, null]
    }

    // Shouting UNO happens out of turn — to save yourself, or to catch a rival
    // who went quiet on one card.
    if (key.matches(msg, 'u') && game.unoWindow) {
      return [this, this._act({ type: 'uno', seat: 0 }, game.legalActions(0))]
    }

    // Naming a colour after a +4.
    if (game.phase === 'choose-color' && game.chooser === 0) {
      const colors = { r: 'rojo', a: 'amarillo', v: 'verde', z: 'azul' }
      for (const [chord, color] of Object.entries(colors)) {
        if (key.matches(msg, chord)) {
          return [this, this._act({ type: 'color', seat: 0, color }, game.legalActions(0))]
        }
      }
      return [this, null]
    }

    if (game.currentActor() !== 0) return [this, null]

    const legal = game.legalActions(0)
    this.message = null
    const hand = game.hands[0]

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
    const action = { type: 'play', seat: 0, card }
    const legal = this.game.legalActions(0)

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
