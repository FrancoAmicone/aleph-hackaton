// Envido and Flor point calculation.
//
//   envidoPoints([{rank:7,suit:'oro'},{rank:6,suit:'oro'},{rank:12,suit:'copa'}]) // 33
//   florPoints(threeOfTheSameSuit)                                               // 20 + values
const { envidoValue } = require('./deck')

// Two cards of the same suit: their values + 20. Otherwise the single highest
// card value (figures count 0, so a hand of three figures is worth 0).
function envidoPoints(hand) {
  const bySuit = new Map()
  for (const card of hand) {
    const bucket = bySuit.get(card.suit) || []
    bucket.push(envidoValue(card))
    bySuit.set(card.suit, bucket)
  }

  let best = 0
  for (const values of bySuit.values()) {
    if (values.length >= 2) {
      const [a, b] = values.sort((x, y) => y - x)
      best = Math.max(best, a + b + 20)
    } else {
      best = Math.max(best, values[0])
    }
  }
  return best
}

function hasFlor(hand) {
  return hand.length === 3 && hand.every((card) => card.suit === hand[0].suit)
}

// 20 + the three card values. Returns 0 for a hand without flor.
function florPoints(hand) {
  if (!hasFlor(hand)) return 0
  return 20 + hand.reduce((sum, card) => sum + envidoValue(card), 0)
}

module.exports = { envidoPoints, hasFlor, florPoints }
