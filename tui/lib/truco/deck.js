// The Spanish 40-card deck and the Truco Argentino card ranking.
//
// A card is a plain object `{ rank, suit }` — no class, so it survives
// JSON round-trips over the wire (Hyperswarm) and into snapshots.
//
//   const { createDeck, shuffle, strength, compare } = require('./deck')
//   const deck = shuffle(createDeck(), rng)
//   strength({ rank: 1, suit: 'espada' })  // 14 — la brava
const SUITS = ['espada', 'basto', 'oro', 'copa']
const RANKS = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12]

const GLYPHS = { espada: '♠', basto: '♣', oro: '♦', copa: '♥' }
const SUIT_NAMES = { espada: 'espada', basto: 'basto', oro: 'oro', copa: 'copa' }

// The four "cartas bravas" outrank everything and are identified by rank+suit.
const BRAVAS = {
  'espada:1': 14, // el ancho de espada — la brava
  'basto:1': 13, // el ancho de basto
  'espada:7': 12, // el siete de espada
  'oro:7': 11 // el siete de oro
}

// Everything else ranks purely by number. Note 1 (de copa/oro) sits above the
// figures, and 7 (de copa/basto) sits below them — the "falsos" of each.
const BY_RANK = { 3: 10, 2: 9, 1: 8, 12: 7, 11: 6, 10: 5, 7: 4, 6: 3, 5: 2, 4: 1 }

function createDeck() {
  const deck = []
  for (const suit of SUITS) {
    for (const rank of RANKS) deck.push({ rank, suit })
  }
  return deck
}

// Fisher-Yates with an injectable rng so hands are reproducible in tests.
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

// Truco strength: 14 (ancho de espada) down to 1 (cualquier cuatro).
// Equal strength between rivals is a "parda".
function strength(card) {
  return BRAVAS[`${card.suit}:${card.rank}`] || BY_RANK[card.rank]
}

// -1 / 0 / +1, so it drops straight into Array#sort.
function compare(a, b) {
  const sa = strength(a)
  const sb = strength(b)
  return sa === sb ? 0 : sa > sb ? 1 : -1
}

// Value a card contributes to envido/flor: figures are worth nothing.
function envidoValue(card) {
  return card.rank >= 10 ? 0 : card.rank
}

function sameCard(a, b) {
  return !!a && !!b && a.rank === b.rank && a.suit === b.suit
}

function cardId(card) {
  return `${card.rank}:${card.suit}`
}

function glyph(suit) {
  return GLYPHS[suit]
}

// "1 de espada" — for the log feed and screen-reader-friendly output.
function cardName(card) {
  return `${card.rank} de ${SUIT_NAMES[card.suit]}`
}

module.exports = {
  SUITS,
  RANKS,
  GLYPHS,
  createDeck,
  shuffle,
  strength,
  compare,
  envidoValue,
  sameCard,
  cardId,
  glyph,
  cardName
}
