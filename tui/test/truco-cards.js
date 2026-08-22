// The card layer: ranking, deck integrity and envido/flor arithmetic.
const { test } = require('brittle')
const { createDeck, shuffle, strength, compare, envidoValue, cardId } = require('../lib/truco/deck')
const { envidoPoints, hasFlor, florPoints } = require('../lib/truco/envido')

const card = (rank, suit) => ({ rank, suit })

test('deck: 40 unique Spanish cards, no 8s or 9s', (t) => {
  const deck = createDeck()
  t.is(deck.length, 40, 'forty cards')
  t.is(new Set(deck.map(cardId)).size, 40, 'all distinct')
  t.absent(
    deck.some((c) => c.rank === 8 || c.rank === 9),
    'ochos y nueves excluded'
  )
})

test('deck: shuffle permutes without losing cards', (t) => {
  let seed = 7
  const rng = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648
  const deck = createDeck()
  const mixed = shuffle(deck, rng)

  t.is(mixed.length, 40, 'same size')
  t.alike(new Set(mixed.map(cardId)), new Set(deck.map(cardId)), 'same cards')
  t.unlike(mixed.map(cardId), deck.map(cardId), 'order changed')
  t.alike(deck, createDeck(), 'source deck untouched')
})

test('ranking: the four bravas outrank everything, in order', (t) => {
  const order = [
    card(1, 'espada'),
    card(1, 'basto'),
    card(7, 'espada'),
    card(7, 'oro'),
    card(3, 'copa'),
    card(2, 'basto'),
    card(1, 'oro'),
    card(12, 'copa'),
    card(11, 'oro'),
    card(10, 'basto'),
    card(7, 'copa'),
    card(6, 'oro'),
    card(5, 'espada'),
    card(4, 'copa')
  ]

  for (let i = 1; i < order.length; i++) {
    t.ok(
      strength(order[i - 1]) > strength(order[i]),
      `${cardId(order[i - 1])} beats ${cardId(order[i])}`
    )
  }
})

test('ranking: falsos tie with their own rank across suits', (t) => {
  t.is(compare(card(1, 'oro'), card(1, 'copa')), 0, 'anchos falsos are pardas')
  t.is(compare(card(7, 'copa'), card(7, 'basto')), 0, 'sietes falsos are pardas')
  t.is(compare(card(3, 'oro'), card(3, 'espada')), 0, 'threes are pardas')
  t.ok(strength(card(1, 'oro')) > strength(card(12, 'espada')), 'ancho falso beats a figure')
  t.ok(strength(card(7, 'copa')) < strength(card(10, 'espada')), 'siete falso loses to a figure')
})

test('envido: two of a suit sum + 20, figures worth nothing', (t) => {
  t.is(envidoValue(card(12, 'oro')), 0, 'figures are zero')
  t.is(envidoValue(card(7, 'oro')), 7, 'pips are face value')

  t.is(envidoPoints([card(7, 'oro'), card(6, 'oro'), card(12, 'copa')]), 33, 'the maximum, 33')
  t.is(envidoPoints([card(7, 'oro'), card(5, 'oro'), card(4, 'basto')]), 32, '7+5+20')
  t.is(envidoPoints([card(12, 'oro'), card(11, 'oro'), card(4, 'basto')]), 20, 'two figures = 20')
  t.is(
    envidoPoints([card(1, 'oro'), card(7, 'copa'), card(4, 'basto')]),
    7,
    'no pair: highest card'
  )
  t.is(envidoPoints([card(12, 'oro'), card(11, 'copa'), card(10, 'basto')]), 0, 'three figures = 0')
})

test('envido: picks the best suit when a hand holds two options', (t) => {
  const hand = [card(6, 'oro'), card(5, 'oro'), card(7, 'copa')]
  t.is(envidoPoints(hand), 31, '6+5+20 beats the lone 7')
})

test('flor: three of a suit, 20 + values', (t) => {
  const flor = [card(7, 'oro'), card(6, 'oro'), card(5, 'oro')]
  t.ok(hasFlor(flor), 'three of a suit is flor')
  t.is(florPoints(flor), 38, '20 + 7 + 6 + 5')

  const noFlor = [card(7, 'oro'), card(6, 'oro'), card(5, 'copa')]
  t.absent(hasFlor(noFlor), 'two of a suit is not flor')
  t.is(florPoints(noFlor), 0, 'no flor scores nothing')
  t.is(florPoints([card(12, 'copa'), card(11, 'copa'), card(10, 'copa')]), 20, 'flor of figures')
})
