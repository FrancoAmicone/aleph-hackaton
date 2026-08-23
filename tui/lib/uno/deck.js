// The deck, trimmed to the cards this build plays with: numbers, +2 and +4.
// No Skip, no Reverse, no plain Wild — which means play only ever moves one
// way round the table, and the +4 is the only card that changes colour.
//
// A card is a plain object `{ color, rank }`. A +4 has `color: null` because it
// belongs to no colour until someone plays it and names one.
//
//   createDeck()            -> 88 cards
//   matches(card, top, active)  -> can this card be played right now?
const COLORS = ['rojo', 'amarillo', 'verde', 'azul']

const DRAW_TWO = '+2'
const WILD_FOUR = '+4'

// Standard UNO counts, minus the cards we dropped: one 0 and two of each 1-9
// per colour (19), two +2 per colour (8), four +4.
function createDeck() {
  const deck = []
  for (const color of COLORS) {
    deck.push({ color, rank: 0 })
    for (let rank = 1; rank <= 9; rank++) {
      deck.push({ color, rank })
      deck.push({ color, rank })
    }
    deck.push({ color, rank: DRAW_TWO })
    deck.push({ color, rank: DRAW_TWO })
  }
  for (let i = 0; i < 4; i++) deck.push({ color: null, rank: WILD_FOUR })
  return deck
}

// Fisher-Yates with an injectable rng, so a hand can be reproduced in a test.
function shuffle(deck, rng = Math.random) {
  const out = deck.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const tmp = out[i]
    out[i] = out[j]
    out[j] = tmp
  }
  return out
}

const isWild = (card) => card.rank === WILD_FOUR

// A card is playable if it is a +4 (always), or it shares the colour in play,
// or it shares the rank of the card on the pile. `active` is the colour in
// play, which is not always `top.color` — a +4 sets it to whatever was named.
function matches(card, top, active) {
  if (isWild(card)) return true
  if (card.color === active) return true
  return card.rank === top.rank
}

// What a card is worth to the winner of the round.
function value(card) {
  if (card.rank === WILD_FOUR) return 50
  if (card.rank === DRAW_TWO) return 20
  return card.rank
}

function sameCard(a, b) {
  return !!a && !!b && a.color === b.color && a.rank === b.rank
}

function cardName(card) {
  if (card.rank === WILD_FOUR) return '+4'
  return `${card.rank} ${card.color}`
}

module.exports = {
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
}
