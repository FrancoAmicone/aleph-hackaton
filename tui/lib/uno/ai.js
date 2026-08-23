// The rivals. A policy over `game.legalActions(seat)` — it never reads a hand
// it could not legally see, so the same function could drive a remote peer.
//
// Three levels: 'facil' plays whatever comes first and often forgets to call
// UNO, 'normal' plays the odds, 'duro' saves its +4 for when it hurts and
// catches you every time you sit on one card without saying anything.
const { WILD_FOUR, DRAW_TWO, COLORS, value } = require('./deck')

const LEVELS = ['facil', 'normal', 'duro']

const PROFILE = {
  facil: { callsUno: 0.55, catches: 0.15, savesWild: 0.1 },
  normal: { callsUno: 0.85, catches: 0.55, savesWild: 0.5 },
  duro: { callsUno: 1, catches: 0.95, savesWild: 0.85 }
}

function decide(game, seat, rng = Math.random) {
  const actions = game.legalActions(seat)
  if (actions.length === 0) return null

  const profile = PROFILE[game.players[seat].level] || PROFILE.normal
  const uno = actions.find((a) => a.type === 'uno')

  // Shouting UNO — for yourself, or to catch somebody else.
  if (uno && game.unoWindow) {
    const mine = game.unoWindow.seat === seat
    const chance = mine ? profile.callsUno : profile.catches
    if (rng() < chance) return uno
  }

  const others = actions.filter((a) => a.type !== 'uno')
  if (others.length === 0) return null

  // Naming a colour after a +4: pick whichever colour you hold most of.
  const colors = others.filter((a) => a.type === 'color')
  if (colors.length > 0) return { type: 'color', seat, color: bestColor(game.hands[seat], rng) }

  const plays = others.filter((a) => a.type === 'play')
  const take = others.find((a) => a.type === 'take')
  const draw = others.find((a) => a.type === 'draw')
  const pass = others.find((a) => a.type === 'pass')

  // Facing a stack: adding to it is almost always better than eating it, but a
  // weak player will sometimes just take the cards.
  if (take) {
    if (plays.length > 0 && rng() < 0.9) return plays[0]
    return take
  }

  if (plays.length === 0) return draw || pass || others[0]

  return { type: 'play', seat, card: choose(game, seat, plays, profile, rng) }
}

// Shed the most expensive card that still fits, so a round that ends early
// leaves as little in hand as possible — but hold the +4 back while the hand
// is still long, since it is the only card that can rescue a stuck turn.
function choose(game, seat, plays, profile, rng) {
  const hand = game.hands[seat]
  const cards = plays.map((a) => a.card)

  const wilds = cards.filter((c) => c.rank === WILD_FOUR)
  const plain = cards.filter((c) => c.rank !== WILD_FOUR)

  if (plain.length > 0 && wilds.length > 0 && hand.length > 2 && rng() < profile.savesWild) {
    return best(plain, hand)
  }

  // A +2 is worth playing while somebody else still has cards to eat.
  const punish = plain.find((c) => c.rank === DRAW_TWO)
  if (punish && rng() < 0.7) return punish

  return best(cards.length > 0 ? cards : plain, hand)
}

// Highest points first, tie-broken towards the colour you hold most of, so you
// keep a colour you can follow up on.
function best(cards, hand) {
  const counts = {}
  for (const card of hand) {
    if (card.color) counts[card.color] = (counts[card.color] || 0) + 1
  }
  return cards
    .slice()
    .sort((a, b) => value(b) - value(a) || (counts[b.color] || 0) - (counts[a.color] || 0))[0]
}

function bestColor(hand, rng) {
  const counts = {}
  for (const card of hand) {
    if (card.color) counts[card.color] = (counts[card.color] || 0) + 1
  }
  let pick = null
  let most = -1
  for (const color of COLORS) {
    const n = counts[color] || 0
    if (n > most) {
      most = n
      pick = color
    }
  }
  return most > 0 ? pick : COLORS[Math.floor(rng() * COLORS.length)]
}

// A little table talk.
const CHATTER = {
  '+2': ['¡Robá dos!', 'Tomá.', '¡Dos para vos!'],
  '+4': ['¡Cuatro!', '¡Y cambio de color!', 'Che, cuatro.'],
  uno: ['¡UNO!', '¡Me queda una!'],
  take: ['Uf…', 'Bueno, las robo.'],
  draw: ['No tengo…', 'A ver qué sale.']
}

function chatter(action, rng = Math.random) {
  if (!action) return null
  let key = null
  if (action.type === 'uno') key = 'uno'
  else if (action.type === 'take') key = 'take'
  else if (action.type === 'draw') key = 'draw'
  else if (action.type === 'play') {
    key = action.card.rank === WILD_FOUR ? '+4' : action.card.rank === DRAW_TWO ? '+2' : null
  }

  const lines = key && CHATTER[key]
  if (!lines) return null
  return lines[Math.floor(rng() * lines.length)]
}

module.exports = { decide, chatter, bestColor, LEVELS, PROFILE }
