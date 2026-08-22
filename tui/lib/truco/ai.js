// The AI players. A policy over `game.legalActions(seat)` — it never touches
// engine internals it could not legally see, so the same function can drive a
// remote peer later.
//
//   const action = decide(game, seat)   // -> an action ready for game.apply()
//
// Three levels: 'facil' plays honestly and softly, 'normal' plays the odds,
// 'duro' bluffs, counts what is still out, and squeezes the falta.
const { strength } = require('./deck')
const { envidoPoints, hasFlor, florPoints } = require('./envido')

const LEVELS = ['facil', 'normal', 'duro']

// Thresholds per level: envido points worth accepting/raising, and the hand
// strength (0..1) worth accepting/calling a truco on.
const PROFILE = {
  facil: { envidoQuiero: 24, envidoRaise: 31, trucoQuiero: 0.3, trucoCanto: 0.72, bluff: 0.05 },
  normal: { envidoQuiero: 26, envidoRaise: 29, trucoQuiero: 0.38, trucoCanto: 0.62, bluff: 0.12 },
  duro: { envidoQuiero: 27, envidoRaise: 28, trucoQuiero: 0.42, trucoCanto: 0.55, bluff: 0.28 }
}

// Strength of a card as 0..1 (14 possible ranks).
function cardScore(card) {
  return strength(card) / 14
}

// How good the cards still in hand are, 0..1.
function handStrength(hand) {
  if (hand.length === 0) return 0
  const scores = hand.map(cardScore).sort((a, b) => b - a)
  // The best card carries the hand, the rest support it.
  return scores.reduce((sum, s, i) => sum + s / (i + 1), 0) / 1.84
}

function decide(game, seat, rng = Math.random) {
  const actions = game.legalActions(seat)
  if (actions.length === 0) return null

  const profile = PROFILE[game.players[seat].level] || PROFILE.normal
  const hand = game.hands[seat]
  const dealt = game.dealt[seat]

  if (game.phase === 'response') return respond(game, seat, actions, profile, hand, dealt, rng)

  // Flor is free points and must be declared while the first trick is open.
  const flor = actions.find((a) => a.type === 'canto' && a.canto === 'flor')
  if (flor) return flor

  const canto = considerCanto(game, seat, actions, profile, hand, dealt, rng)
  if (canto) return canto

  return { type: 'play', seat, card: chooseCard(game, seat, hand, profile, rng) }
}

// --- calling ------------------------------------------------------------

// `hand` is what is still playable (truco judgement); `dealt` is the original
// three cards (envido and flor are fixed at the deal).
function considerCanto(game, seat, actions, profile, hand, dealt, rng) {
  const available = actions.filter((a) => a.type === 'canto').map((a) => a.canto)
  const points = envidoPoints(dealt)

  // Envido: call it when the hand is genuinely good, or occasionally as a bluff.
  if (available.includes('envido') && !game.envidoDone) {
    const strong = points >= profile.envidoRaise
    const desperate = game.target - game.scores[game.teamOf(seat)] <= 4

    if (points >= 31 && desperate && available.includes('falta-envido')) {
      return { type: 'canto', seat, canto: 'falta-envido' }
    }
    if (points >= 32 && available.includes('real-envido') && rng() < 0.5) {
      return { type: 'canto', seat, canto: 'real-envido' }
    }
    if (strong || rng() < profile.bluff * 0.5) return { type: 'canto', seat, canto: 'envido' }
  }

  // Truco: call it on a strong hand, when already ahead in the tricks, or as a
  // bluff. Never on the very first card of a mediocre hand.
  const trucoCanto = available.find((c) => c === 'truco' || c === 'retruco' || c === 'vale-cuatro')
  if (trucoCanto) {
    const power = handStrength(hand)
    const winningTricks = game.trickResults.filter((r) => r === game.teamOf(seat)).length
    const threshold = profile.trucoCanto - winningTricks * 0.14

    if (power >= threshold || rng() < profile.bluff * 0.4) {
      return { type: 'canto', seat, canto: trucoCanto }
    }
  }

  return null
}

// --- answering ----------------------------------------------------------

function respond(game, seat, actions, profile, hand, dealt, rng) {
  const kind = game.pending.kind
  const has = (type) => actions.find((a) => a.type === type)
  const canto = (name) => actions.find((a) => a.type === 'canto' && a.canto === name)

  if (kind === 'flor') {
    // Holding a flor of your own, contraflor is worth it when it is a big one.
    const mine = florPoints(dealt)
    if (canto('contraflor') && mine >= 32) return canto('contraflor')
    if (canto('contraflor-al-resto') && mine >= 37 && rng() < 0.4) {
      return canto('contraflor-al-resto')
    }
    return mine >= 29 ? has('quiero') || canto('contraflor') : has('no-quiero')
  }

  if (kind === 'envido') {
    const points = envidoPoints(dealt)
    if (points >= profile.envidoRaise + 3 && canto('real-envido') && rng() < 0.45) {
      return canto('real-envido')
    }
    if (points >= profile.envidoRaise && canto('envido') && rng() < 0.4) return canto('envido')
    return points >= profile.envidoQuiero ? has('quiero') : has('no-quiero')
  }

  // Truco. "El envido está primero" — with a big envido still unplayed, answer
  // the truco with an envido instead.
  if (canto('envido') && !game.envidoDone && !hasFlor(dealt)) {
    const points = envidoPoints(dealt)
    if (points >= profile.envidoRaise + 1) return canto('envido')
  }

  const power = handStrength(hand)
  const winningTricks = game.trickResults.filter((r) => r === game.teamOf(seat)).length
  const adjusted = power + winningTricks * 0.12

  const raise = canto('retruco') || canto('vale-cuatro') || canto('truco')
  if (raise && adjusted >= profile.trucoCanto + 0.12) return raise

  return adjusted >= profile.trucoQuiero ? has('quiero') : has('no-quiero')
}

// --- card play ----------------------------------------------------------

function chooseCard(game, seat, hand, profile, rng) {
  const level = game.players[seat].level

  if (level === 'facil' && rng() < 0.5) return hand[Math.floor(rng() * hand.length)]

  const sorted = hand.slice().sort((a, b) => strength(b) - strength(a))
  const plays = game.tricks[game.trickIndex]

  // Leading: take the trick early with the best card, but keep something back
  // for the last trick once the hand is already halfway won.
  if (plays.length === 0) {
    const ahead = game.trickResults.some((r) => r === game.teamOf(seat))
    if (ahead && sorted.length > 1) return sorted[0]
    return game.trickIndex === 0 ? sorted[0] : sorted[sorted.length - 1]
  }

  // Following: find the card on the table to beat.
  let best = plays[0]
  for (const play of plays) if (strength(play.card) > strength(best.card)) best = play

  const partnerWinning = game.teamOf(best.seat) === game.teamOf(seat)
  const lastToPlay = plays.length === game.playerCount - 1

  // If a partner already holds the trick and nobody is left to beat them,
  // there is no point burning a good card.
  if (partnerWinning && lastToPlay) return sorted[sorted.length - 1]

  // Otherwise play the cheapest card that still wins — a parda is worth having.
  const winners = sorted.filter((c) => strength(c) >= strength(best.card))
  if (winners.length > 0) return winners[winners.length - 1]

  return sorted[sorted.length - 1]
}

// A little table talk, chosen from the action the AI just took.
const CHATTER = {
  truco: ['¡Truco!', '¿Y esto?', '¡Truco, che!'],
  retruco: ['¡Quiero retruco!', '¡Retruco carajo!'],
  'vale-cuatro': ['¡Quiero vale cuatro!', '¡Vale cuatro y se acabó!'],
  envido: ['¡Envido!', '¿Envido tenés?'],
  'real-envido': ['¡Real envido!', '¡Real, y con ganas!'],
  'falta-envido': ['¡Falta envido!', '¡Falta y listo!'],
  flor: ['¡Flor!', '¡Mirá qué flor!'],
  quiero: ['¡Quiero!', 'Quiero, dale.'],
  'no-quiero': ['No quiero.', 'Paso, paso.']
}

function chatter(action, rng = Math.random) {
  if (!action) return null
  const key = action.type === 'canto' ? action.canto : action.type
  const lines = CHATTER[key]
  if (!lines) return null
  return lines[Math.floor(rng() * lines.length)]
}

module.exports = { decide, handStrength, chooseCard, chatter, LEVELS, PROFILE }
