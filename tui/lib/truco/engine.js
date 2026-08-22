// The Truco Argentino rules engine — a pure state machine over seats, tricks
// and cantos. It owns no I/O and no timers: the UI and the AI both drive it
// through the same two methods, which makes the whole game headlessly testable.
//
//   const game = new Game({ players: [...], rng })
//   game.legalActions(seat)   // -> [{ type:'play', card }, { type:'canto', canto:'truco' }, ...]
//   game.apply(action)        // -> mutates state, appends to game.events
//
// Seats are numbered clockwise from 0; team = seat % 2, so in a 4-player game
// seats 0+2 play against 1+3. The human is always seat 0.
const { createDeck, shuffle, strength, sameCard, cardName } = require('./deck')
const { envidoPoints, hasFlor, florPoints } = require('./envido')

const ENVIDO_VALUES = { envido: 2, 'real-envido': 3 }
const TRUCO_NAMES = ['truco', 'retruco', 'vale-cuatro']

const LABELS = {
  envido: 'Envido',
  'real-envido': 'Real Envido',
  'falta-envido': 'Falta Envido',
  truco: 'Truco',
  retruco: 'Quiero Retruco',
  'vale-cuatro': 'Quiero Vale Cuatro',
  flor: 'Flor',
  contraflor: 'Contraflor',
  'contraflor-al-resto': 'Contraflor al Resto',
  quiero: 'Quiero',
  'no-quiero': 'No quiero',
  mazo: 'Me voy al mazo'
}

class Game {
  constructor(opts = {}) {
    this.players = (opts.players || defaultPlayers()).map((p, seat) => ({
      seat,
      team: seat % 2,
      name: p.name,
      isAI: p.isAI !== false,
      level: p.level || 'normal'
    }))
    this.playerCount = this.players.length
    this.target = opts.target || 30
    this.conFlor = opts.conFlor !== false
    this.rng = opts.rng || Math.random

    this.scores = [0, 0]
    this.handNumber = 0
    this.mano = 0
    this.events = []
    this.phase = 'play'

    this.startHand()
  }

  // --- queries ---------------------------------------------------------

  teamOf(seat) {
    return seat % 2
  }

  teamName(team) {
    return team === 0 ? 'Nosotros' : 'Ellos'
  }

  // Points the current hand is worth if it is played out.
  handValue() {
    return this.trucoAccepted ? this.trucoLevel + 1 : 1
  }

  // Falta envido is worth what the leading team still needs to win.
  faltaValue() {
    return Math.max(1, this.target - Math.max(this.scores[0], this.scores[1]))
  }

  // The seat that must act next, or null when the hand/game is over.
  currentActor() {
    if (this.phase === 'response') return this.pending.responder
    if (this.phase === 'play') return this.turn
    return null
  }

  isOver() {
    return this.phase === 'game-over'
  }

  winner() {
    if (!this.isOver()) return null
    return this.scores[0] >= this.target ? 0 : 1
  }

  // --- hand lifecycle --------------------------------------------------

  startHand() {
    const deck = shuffle(createDeck(), this.rng)

    this.handNumber++
    this.hands = []
    for (let seat = 0; seat < this.playerCount; seat++) {
      this.hands.push(deck.splice(0, 3))
    }

    // Envido and flor are properties of the three cards you were dealt, and
    // both can still be called after a card has been played in the first
    // trick — so they are always computed from this snapshot, never from what
    // happens to be left in hand.
    this.dealt = this.hands.map((hand) => hand.slice())

    this.trickIndex = 0
    this.tricks = [[]]
    this.trickResults = []
    this.trickLead = this.mano
    this.turn = this.mano

    this.trucoLevel = 0
    this.trucoTeam = null
    this.trucoAccepted = false

    this.envidoDone = false
    this.envidoChain = []
    this.florDone = false
    this.florChain = []
    this.florCantor = null

    this.pending = null
    this.pendingTruco = null
    this.turnBeforeCanto = null

    this.phase = 'play'
    this.lastHand = null

    this._log('deal', null, `Mano ${this.handNumber} — reparte ${this.players[this.dealer()].name}`)
  }

  dealer() {
    // The dealer sits immediately before the mano.
    return (this.mano - 1 + this.playerCount) % this.playerCount
  }

  nextHand() {
    if (this.isOver()) return
    this.mano = (this.mano + 1) % this.playerCount
    this.startHand()
  }

  // --- legal actions ---------------------------------------------------

  legalActions(seat) {
    if (this.phase === 'response' && this.pending.responder === seat) {
      return this._responseActions(seat)
    }
    if (this.phase !== 'play' || this.turn !== seat) return []

    const actions = []
    for (const card of this.hands[seat]) actions.push({ type: 'play', seat, card })

    for (const canto of this._availableCantos(seat)) {
      actions.push({ type: 'canto', seat, canto })
    }

    actions.push({ type: 'mazo', seat })
    return actions
  }

  _availableCantos(seat) {
    const cantos = []
    const team = this.teamOf(seat)

    // Flor must be declared during the first trick.
    if (this.conFlor && !this.florDone && this.trickIndex === 0 && hasFlor(this.dealt[seat])) {
      cantos.push('flor')
    }

    // Envido lives in the first trick only, and flor displaces it entirely.
    if (
      !this.envidoDone &&
      !this.florDone &&
      this.trickIndex === 0 &&
      this.envidoChain.length === 0 &&
      !(this.conFlor && hasFlor(this.dealt[seat]))
    ) {
      cantos.push('envido', 'real-envido', 'falta-envido')
    }

    // Truco can be raised by the side that does not already own the raise.
    if (this.trucoLevel < 3 && (this.trucoLevel === 0 || this.trucoTeam !== team)) {
      if (this.trucoLevel === 0 || this.trucoAccepted) cantos.push(TRUCO_NAMES[this.trucoLevel])
    }

    return cantos
  }

  _responseActions(seat) {
    const { kind, chain } = this.pending
    const actions = [
      { type: 'quiero', seat },
      { type: 'no-quiero', seat }
    ]

    if (kind === 'envido') {
      for (const canto of envidoEscalations(chain)) actions.push({ type: 'canto', seat, canto })
    }

    if (kind === 'truco') {
      // "El envido está primero": answering a truco in the first trick with an
      // envido is legal, and the envido is settled before the truco.
      if (
        this.trickIndex === 0 &&
        !this.envidoDone &&
        !this.florDone &&
        !(this.conFlor && hasFlor(this.dealt[seat]))
      ) {
        actions.push({ type: 'canto', seat, canto: 'envido' })
        actions.push({ type: 'canto', seat, canto: 'real-envido' })
        actions.push({ type: 'canto', seat, canto: 'falta-envido' })
      }
      if (this.trucoLevel < 3) {
        actions.push({ type: 'canto', seat, canto: TRUCO_NAMES[this.trucoLevel] })
      }
    }

    if (kind === 'flor') {
      const last = chain[chain.length - 1]
      if (last === 'flor') {
        return [
          { type: 'canto', seat, canto: 'contraflor' },
          { type: 'canto', seat, canto: 'contraflor-al-resto' },
          { type: 'no-quiero', seat }
        ]
      }
      return [
        { type: 'quiero', seat },
        { type: 'no-quiero', seat }
      ]
    }

    return actions
  }

  // --- applying actions ------------------------------------------------

  apply(action) {
    if (!action) return this
    const seat = action.seat

    switch (action.type) {
      case 'play':
        return this._playCard(seat, action.card)
      case 'canto':
        return this._canto(seat, action.canto)
      case 'quiero':
        return this._answer(seat, true)
      case 'no-quiero':
        return this._answer(seat, false)
      case 'mazo':
        return this._mazo(seat)
      default:
        return this
    }
  }

  _playCard(seat, card) {
    const hand = this.hands[seat]
    const index = hand.findIndex((c) => sameCard(c, card))
    if (index === -1) return this

    hand.splice(index, 1)
    this.tricks[this.trickIndex].push({ seat, card })
    this._log('play', seat, `${this.players[seat].name} juega ${cardName(card)}`, { card })

    if (this.tricks[this.trickIndex].length === this.playerCount) return this._resolveTrick()

    this.turn = this._nextSeat(this.turn)
    return this
  }

  _resolveTrick() {
    const plays = this.tricks[this.trickIndex]
    let best = plays[0]
    let tied = false

    for (const play of plays.slice(1)) {
      const diff = strength(play.card) - strength(best.card)
      if (diff > 0) {
        best = play
        tied = false
      } else if (diff === 0 && this.teamOf(play.seat) !== this.teamOf(best.seat)) {
        tied = true
      }
    }

    const winningTeam = tied ? null : this.teamOf(best.seat)
    this.trickResults.push(winningTeam)

    if (tied) {
      this._log('trick', null, `Baza ${this.trickIndex + 1}: parda`)
    } else {
      this._log(
        'trick',
        best.seat,
        `Baza ${this.trickIndex + 1}: la gana ${this.players[best.seat].name}`
      )
    }

    const decided = handWinner(this.trickResults, this.teamOf(this.mano))
    if (decided !== null) return this._endHand(decided, this.handValue(), 'bazas')

    this.trickIndex++
    this.tricks.push([])
    // On a parda the lead stays with whoever is closest to the mano.
    this.trickLead = tied ? this.trickLead : best.seat
    this.turn = this.trickLead
    return this
  }

  _canto(seat, canto) {
    const team = this.teamOf(seat)

    if (canto === 'flor') return this._cantoFlor(seat)

    if (canto === 'contraflor' || canto === 'contraflor-al-resto') {
      this.florChain.push(canto)
      this._log('canto', seat, `${this.players[seat].name}: ¡${LABELS[canto]}!`)
      this.pending = {
        kind: 'flor',
        chain: this.florChain,
        cantor: seat,
        responder: this.florCantor
      }
      return this
    }

    const isEnvido = canto === 'envido' || canto === 'real-envido' || canto === 'falta-envido'

    if (isEnvido) {
      // An envido raised in answer to a truco parks the truco until it settles.
      if (this.pending && this.pending.kind === 'truco') {
        this.pendingTruco = this.pending
      } else if (this.turnBeforeCanto === null) {
        this.turnBeforeCanto = this.turn
      }

      this.envidoChain.push(canto)
      this._log('canto', seat, `${this.players[seat].name}: ¡${LABELS[canto]}!`)
      this.pending = {
        kind: 'envido',
        chain: this.envidoChain,
        cantor: seat,
        responder: this._responderFor(seat)
      }
      this.phase = 'response'
      return this
    }

    // Truco chain.
    if (this.turnBeforeCanto === null) this.turnBeforeCanto = this.turn
    this.trucoLevel = TRUCO_NAMES.indexOf(canto) + 1
    this.trucoTeam = team
    this.trucoAccepted = false
    this._log('canto', seat, `${this.players[seat].name}: ¡${LABELS[canto]}!`)
    this.pending = {
      kind: 'truco',
      chain: TRUCO_NAMES.slice(0, this.trucoLevel),
      cantor: seat,
      responder: this._responderFor(seat)
    }
    this.phase = 'response'
    return this
  }

  _cantoFlor(seat) {
    this.florCantor = seat
    this.florChain = ['flor']
    this.envidoDone = true // la flor tapa el envido
    this._log('canto', seat, `${this.players[seat].name}: ¡Flor! (${florPoints(this.dealt[seat])})`)

    const rival = this._opponentWithFlor(seat)
    if (rival === null) {
      this.florDone = true
      this._award(this.teamOf(seat), 3, 'la flor es buena')
      return this._afterCantoResolved()
    }

    if (this.turnBeforeCanto === null) this.turnBeforeCanto = this.turn
    this.pending = { kind: 'flor', chain: this.florChain, cantor: seat, responder: rival }
    this.phase = 'response'
    return this
  }

  _answer(seat, accepted) {
    const pending = this.pending
    if (!pending) return this

    this._log('canto', seat, `${this.players[seat].name}: ${accepted ? '¡Quiero!' : 'No quiero'}`)

    if (pending.kind === 'envido') return this._resolveEnvido(accepted)
    if (pending.kind === 'flor') return this._resolveFlor(seat, accepted)
    return this._resolveTruco(accepted)
  }

  _resolveEnvido(accepted) {
    const chain = this.envidoChain
    const cantorTeam = this.teamOf(this.pending.cantor)
    this.envidoDone = true
    this.pending = null

    if (!accepted) {
      this._award(cantorTeam, rejectValue(chain), 'envido no querido')
      return this._afterCantoResolved()
    }

    const stake =
      chain[chain.length - 1] === 'falta-envido' ? this.faltaValue() : acceptValue(chain)

    // Declared in order from the mano, so the mano wins ties naturally.
    let bestSeat = this.mano
    let bestPoints = envidoPoints(this.dealt[this.mano])
    this._log('envido', this.mano, `${this.players[this.mano].name}: ${bestPoints}`)

    for (let i = 1; i < this.playerCount; i++) {
      const s = (this.mano + i) % this.playerCount
      const points = envidoPoints(this.dealt[s])
      if (points > bestPoints) {
        this._log('envido', s, `${this.players[s].name}: ${points} ¡son mejores!`)
        bestSeat = s
        bestPoints = points
      } else {
        this._log('envido', s, `${this.players[s].name}: son buenas`)
      }
    }

    this._award(this.teamOf(bestSeat), stake, `envido para ${this.players[bestSeat].name}`)
    return this._afterCantoResolved()
  }

  _resolveFlor(seat, accepted) {
    const chain = this.florChain
    const last = chain[chain.length - 1]
    this.florDone = true
    const responder = this.pending.responder
    const cantor = this.pending.cantor
    this.pending = null

    if (!accepted) {
      // Whoever backs down hands the points to the side that called.
      const points = last === 'flor' ? 4 : 4
      this._award(this.teamOf(cantor), points, `${LABELS[last]} no querida`)
      return this._afterCantoResolved()
    }

    const stake = last === 'contraflor-al-resto' ? this.faltaValue() : last === 'contraflor' ? 6 : 3

    let bestSeat = this.mano
    let bestPoints = florPoints(this.dealt[this.mano])
    for (let i = 1; i < this.playerCount; i++) {
      const s = (this.mano + i) % this.playerCount
      const points = florPoints(this.dealt[s])
      if (points > bestPoints) {
        bestSeat = s
        bestPoints = points
      }
    }

    for (const s of [cantor, responder]) {
      this._log('envido', s, `${this.players[s].name}: flor de ${florPoints(this.dealt[s])}`)
    }

    this._award(this.teamOf(bestSeat), stake, `flor para ${this.players[bestSeat].name}`)
    return this._afterCantoResolved()
  }

  _resolveTruco(accepted) {
    const cantorTeam = this.teamOf(this.pending.cantor)
    this.pending = null

    if (!accepted) {
      // Refusing hands over what the previous level was worth.
      return this._endHand(cantorTeam, this.trucoLevel, 'truco no querido')
    }

    this.trucoAccepted = true
    return this._afterCantoResolved()
  }

  // Play resumes with whoever was on turn when the canto interrupted them,
  // unless a parked truco still needs an answer.
  _afterCantoResolved() {
    if (this.phase === 'hand-over' || this.phase === 'game-over') return this

    if (this.pendingTruco) {
      this.pending = this.pendingTruco
      this.pendingTruco = null
      this.phase = 'response'
      return this
    }

    this.phase = 'play'
    if (this.turnBeforeCanto !== null) {
      this.turn = this.turnBeforeCanto
      this.turnBeforeCanto = null
    }
    return this
  }

  _mazo(seat) {
    this._log('canto', seat, `${this.players[seat].name} se va al mazo`)
    const rival = this.teamOf(seat) === 0 ? 1 : 0
    return this._endHand(rival, this.handValue(), 'se fueron al mazo')
  }

  _endHand(team, points, reason) {
    this.pending = null
    this.pendingTruco = null
    this._award(team, points, reason)
    if (this.phase === 'game-over') return this

    this.phase = 'hand-over'
    this.lastHand = { team, points, reason }
    return this
  }

  _award(team, points, reason) {
    if (points <= 0) return
    this.scores[team] = Math.min(this.target, this.scores[team] + points)
    this._log(
      'score',
      null,
      `${this.teamName(team)} +${points} (${reason}) — ${this.scores[0]}:${this.scores[1]}`
    )
    if (this.scores[team] >= this.target) {
      this.phase = 'game-over'
      this._log('over', null, `¡${this.teamName(team)} gana la partida!`)
    }
  }

  _responderFor(seat) {
    for (let i = 1; i < this.playerCount; i++) {
      const s = (seat + i) % this.playerCount
      if (this.teamOf(s) !== this.teamOf(seat)) return s
    }
    return null
  }

  _opponentWithFlor(seat) {
    for (let i = 1; i < this.playerCount; i++) {
      const s = (seat + i) % this.playerCount
      if (this.teamOf(s) !== this.teamOf(seat) && hasFlor(this.dealt[s])) return s
    }
    return null
  }

  _nextSeat(seat) {
    return (seat + 1) % this.playerCount
  }

  _log(kind, seat, text, extra) {
    this.events.push({ kind, seat, text, ...extra })
    if (this.events.length > 200) this.events.splice(0, this.events.length - 200)
  }
}

// Which raises are still open on an envido chain.
function envidoEscalations(chain) {
  const last = chain[chain.length - 1]
  if (last === 'falta-envido') return []
  if (last === 'real-envido') return ['falta-envido']
  const plainEnvidos = chain.filter((c) => c === 'envido').length
  return plainEnvidos < 2
    ? ['envido', 'real-envido', 'falta-envido']
    : ['real-envido', 'falta-envido']
}

// Accepting pays the whole chain; refusing pays everything below the last call.
function acceptValue(chain) {
  return chain.reduce((sum, canto) => sum + (ENVIDO_VALUES[canto] || 0), 0)
}

function rejectValue(chain) {
  const below = chain.slice(0, -1)
  return Math.max(
    1,
    below.reduce((sum, canto) => sum + (ENVIDO_VALUES[canto] || 0), 0)
  )
}

// Standard parda resolution over up to three trick results
// (team index, or null for a tie). Returns null while undecided.
function handWinner(results, manoTeam) {
  const [a, b, c] = results
  if (a === undefined) return null

  if (b === undefined) return null

  if (a !== null && a === b) return a
  if (a === null && b !== null) return b // primera parda: gana la segunda
  if (b === null && a !== null) return a // segunda parda: gana la primera

  if (a === null && b === null) {
    if (c === undefined) return null
    return c === null ? manoTeam : c // tres pardas: gana el mano
  }

  // Split 1-1: the third trick decides, and a parda there favours the first.
  if (c === undefined) return null
  return c === null ? a : c
}

function defaultPlayers() {
  return [
    { name: 'Vos', isAI: false },
    { name: 'Rita', isAI: true },
    { name: 'Coco', isAI: true },
    { name: 'Nacho', isAI: true }
  ]
}

module.exports = { Game, handWinner, envidoEscalations, acceptValue, rejectValue, LABELS }
