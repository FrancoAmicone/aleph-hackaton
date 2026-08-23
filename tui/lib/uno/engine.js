// The UNO rules engine — a pure state machine. It owns no I/O and no timers:
// the UI and the AI both drive it through the same two methods, which is what
// makes the whole game headlessly testable.
//
//   const game = new Game({ players: [...], rng })
//   game.legalActions(seat)   // -> [{ type:'play', card }, { type:'draw' }, ...]
//   game.apply(action)        // -> mutates state, appends to game.events
//
// Everyone plays for themselves; there are no teams. With no Reverse card in
// the deck, play always moves the same way round the table.
const {
  COLORS,
  DRAW_TWO,
  WILD_FOUR,
  createDeck,
  shuffle,
  matches,
  value,
  isWild,
  sameCard,
  cardName
} = require('./deck')

const HAND_SIZE = 5
const CATCH_PENALTY = 2

class Game {
  constructor(opts = {}) {
    this.players = (opts.players || defaultPlayers()).map((p, seat) => ({
      seat,
      name: p.name,
      isAI: p.isAI !== false,
      level: p.level || 'normal'
    }))
    this.playerCount = this.players.length
    // One hand is the whole game: going out wins it. Any points at all
    // clear the target, so the first player to empty their hand takes it.
    this.target = opts.target || 1
    this.rng = opts.rng || Math.random

    this.scores = new Array(this.playerCount).fill(0)
    this.roundNumber = 0
    this.dealer = this.playerCount - 1
    this.events = []

    this.startRound()
  }

  // --- queries ---------------------------------------------------------

  get top() {
    return this.discard[this.discard.length - 1]
  }

  currentActor() {
    if (this.phase === 'choose-color') return this.chooser
    if (this.phase === 'play') return this.turn
    return null
  }

  isOver() {
    return this.phase === 'game-over'
  }

  winner() {
    if (!this.isOver()) return null
    return this.lastRound.winner
  }

  // The seat that plays after `seat`. No Reverse in this deck, so it is always
  // the same direction.
  nextSeat(seat) {
    return (seat + 1) % this.playerCount
  }

  // --- round lifecycle -------------------------------------------------

  startRound() {
    this.roundNumber++
    this.dealer = this.nextSeat(this.dealer)

    const deck = shuffle(createDeck(), this.rng)
    this.hands = []
    for (let seat = 0; seat < this.playerCount; seat++) {
      this.hands.push(deck.splice(0, HAND_SIZE))
    }

    // The first card turned over starts the pile. A +4 cannot start it, so it
    // goes back in and another is drawn.
    let first = deck.shift()
    while (isWild(first)) {
      deck.push(first)
      first = deck.shift()
    }

    this.draw = deck
    this.discard = [first]
    this.activeColor = first.color

    this.turn = this.nextSeat(this.dealer)
    this.phase = 'play'
    this.chooser = null
    this.pending = null // { count, rank } while a +2/+4 stack is live
    this.drawn = null // the card drawn this turn, if any
    this.unoWindow = null // { seat } while someone sits on one card uncalled
    this.lastRound = null

    this._log('deal', null, `Reparte ${this.players[this.dealer].name}`)

    // A +2 turned up at the start applies to the first player.
    if (first.rank === DRAW_TWO) {
      this.pending = { count: 2, rank: DRAW_TWO }
      this._log('turn', null, `Sale un ${cardName(first)}: le pega al primero`)
    }
  }

  nextRound() {
    if (this.isOver()) return
    this.startRound()
  }

  // --- legal actions ---------------------------------------------------

  legalActions(seat) {
    // Calling or catching UNO happens out of turn, so it is checked first.
    const uno = this._unoActions(seat)

    if (this.phase === 'choose-color') {
      if (this.chooser !== seat) return uno
      return COLORS.map((color) => ({ type: 'color', seat, color })).concat(uno)
    }

    if (this.phase !== 'play' || this.turn !== seat) return uno

    const hand = this.hands[seat]
    const actions = []

    // Facing a stack: either add to it with the same kind of card, or take it.
    if (this.pending) {
      for (const card of hand) {
        if (card.rank === this.pending.rank) actions.push({ type: 'play', seat, card })
      }
      actions.push({ type: 'take', seat })
      return actions.concat(uno)
    }

    // After drawing you may only play the card you drew — that is the rule the
    // draw is meant to enforce.
    if (this.drawn) {
      if (matches(this.drawn, this.top, this.activeColor)) {
        actions.push({ type: 'play', seat, card: this.drawn })
      }
      actions.push({ type: 'pass', seat })
      return actions.concat(uno)
    }

    for (const card of hand) {
      if (matches(card, this.top, this.activeColor)) actions.push({ type: 'play', seat, card })
    }
    actions.push({ type: 'draw', seat })
    return actions.concat(uno)
  }

  // Anyone may shout UNO while the window is open: the player on one card to
  // save themselves, anybody else to catch them.
  _unoActions(seat) {
    if (!this.unoWindow) return []
    return [{ type: 'uno', seat }]
  }

  // --- applying actions ------------------------------------------------

  apply(action) {
    if (!action) return this
    switch (action.type) {
      case 'play':
        return this._play(action.seat, action.card)
      case 'draw':
        return this._draw(action.seat)
      case 'pass':
        return this._pass(action.seat)
      case 'take':
        return this._take(action.seat)
      case 'color':
        return this._chooseColor(action.seat, action.color)
      case 'uno':
        return this._uno(action.seat)
      default:
        return this
    }
  }

  _play(seat, card) {
    const hand = this.hands[seat]
    const index = hand.findIndex((c) => sameCard(c, card))
    if (index === -1) return this

    this._closeUnoWindow(seat)

    hand.splice(index, 1)
    this.discard.push(card)
    this.drawn = null
    this._log('play', seat, `${this.players[seat].name} tira ${cardName(card)}`, { card })

    if (!isWild(card)) this.activeColor = card.color

    // Stacking: a +2 answers a +2, a +4 answers a +4, and the count grows.
    if (card.rank === DRAW_TWO || card.rank === WILD_FOUR) {
      const amount = card.rank === DRAW_TWO ? 2 : 4
      this.pending = {
        count: (this.pending ? this.pending.count : 0) + amount,
        rank: card.rank
      }
    }

    // One card left and nobody has said anything yet.
    if (hand.length === 1) this.unoWindow = { seat }

    if (hand.length === 0) return this._endRound(seat)

    // A +4 needs a colour before play can move on.
    if (isWild(card)) {
      this.phase = 'choose-color'
      this.chooser = seat
      return this
    }

    this.turn = this.nextSeat(seat)
    return this
  }

  _chooseColor(seat, color) {
    if (!COLORS.includes(color)) return this
    this.activeColor = color
    this.phase = 'play'
    this.chooser = null
    this._log('canto', seat, `${this.players[seat].name} pide ${color}`)
    this.turn = this.nextSeat(seat)
    return this
  }

  _draw(seat) {
    this._closeUnoWindow(seat)
    const card = this._takeFromPile()
    if (!card) return this._pass(seat)

    this.hands[seat].push(card)
    this.drawn = card
    this._log('draw', seat, `${this.players[seat].name} roba una carta`)

    // If it cannot be played the turn is over; no point making them pass.
    if (!matches(card, this.top, this.activeColor)) return this._pass(seat)
    return this
  }

  _pass(seat) {
    this._closeUnoWindow(seat)
    this.drawn = null
    this._log('turn', seat, `${this.players[seat].name} pasa`)
    this.turn = this.nextSeat(seat)
    return this
  }

  // Take the whole stack and lose the turn.
  _take(seat) {
    this._closeUnoWindow(seat)
    const count = this.pending.count
    for (let i = 0; i < count; i++) {
      const card = this._takeFromPile()
      if (card) this.hands[seat].push(card)
    }
    this._log('score', seat, `${this.players[seat].name} roba ${count} y pierde el turno`)
    this.pending = null
    this.drawn = null
    this.turn = this.nextSeat(seat)
    return this
  }

  _uno(seat) {
    const window = this.unoWindow
    if (!window) return this

    if (window.seat === seat) {
      this._log('canto', seat, `${this.players[seat].name}: ¡UNO!`)
      this.unoWindow = null
      return this
    }

    // Caught somebody sitting on one card without calling it.
    const caught = window.seat
    this._log(
      'canto',
      seat,
      `${this.players[seat].name} pesca a ${this.players[caught].name} sin cantar UNO`
    )
    for (let i = 0; i < CATCH_PENALTY; i++) {
      const card = this._takeFromPile()
      if (card) this.hands[caught].push(card)
    }
    this._log('score', caught, `${this.players[caught].name} roba ${CATCH_PENALTY}`)
    this.unoWindow = null
    return this
  }

  // The window shuts as soon as somebody else actually does something.
  _closeUnoWindow(seat) {
    if (this.unoWindow && this.unoWindow.seat !== seat) this.unoWindow = null
  }

  // Drawing from an empty pile reshuffles everything discarded except the card
  // currently in play.
  _takeFromPile() {
    if (this.draw.length === 0) {
      if (this.discard.length <= 1) return null
      const top = this.discard.pop()
      this.draw = shuffle(this.discard, this.rng)
      this.discard = [top]
      this._log('turn', null, 'Se acabó el mazo: se rebaraja el descarte')
    }
    return this.draw.shift() || null
  }

  // --- scoring ---------------------------------------------------------

  _endRound(winner) {
    // A +2 or +4 played as the last card still hits the next player, and those
    // cards count towards the winner's score.
    if (this.pending) {
      const victim = this.nextSeat(winner)
      for (let i = 0; i < this.pending.count; i++) {
        const card = this._takeFromPile()
        if (card) this.hands[victim].push(card)
      }
      this._log('score', victim, `${this.players[victim].name} roba ${this.pending.count}`)
      this.pending = null
    }

    let points = 0
    for (let seat = 0; seat < this.playerCount; seat++) {
      if (seat === winner) continue
      for (const card of this.hands[seat]) points += value(card)
    }

    this.scores[winner] += points
    this.unoWindow = null
    this.lastRound = { winner, points }
    this._log('score', winner, `${this.players[winner].name} se va con ${points} puntos`)

    // Emptying your hand wins the game outright — the whole game is one hand.
    // Points are kept for the result screen, not to decide anything.
    this.phase = 'game-over'
    this._log('over', winner, `¡${this.players[winner].name} gana la partida!`)
    return this
  }

  _log(kind, seat, text, extra) {
    this.events.push({ kind, seat, text, ...extra })
    if (this.events.length > 200) this.events.splice(0, this.events.length - 200)
  }
}

function defaultPlayers() {
  return [
    { name: 'Vos', isAI: false },
    { name: 'Rita', isAI: true },
    { name: 'Coco', isAI: true },
    { name: 'Nacho', isAI: true }
  ]
}

module.exports = { Game, HAND_SIZE, CATCH_PENALTY }
