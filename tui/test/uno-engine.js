// The UNO rules engine. Every test drives the real Game through
// legalActions/apply, with hands and piles stacked directly so each rule is
// exercised on its own.
const { test } = require('brittle')
const { Game, HAND_SIZE } = require('../lib/uno/engine')
const { createDeck, matches, value, COLORS } = require('../lib/uno/deck')

const card = (color, rank) => ({ color, rank })
const wild = () => ({ color: null, rank: '+4' })

function table(opts = {}) {
  const game = new Game({
    players: [
      { name: 'Vos', isAI: false },
      { name: 'Rita', isAI: true },
      { name: 'Coco', isAI: true },
      { name: 'Nacho', isAI: true }
    ],
    rng: () => 0.5,
    target: opts.target || 500
  })
  if (opts.hands) game.hands = opts.hands.map((h) => h.slice())
  if (opts.top) {
    game.discard = [opts.top]
    game.activeColor = opts.active || opts.top.color
  }
  if (opts.draw) game.draw = opts.draw.slice()

  // The constructor already dealt and turned a starter up, which may have left
  // a +2 stack live. Stacking a table by hand means starting from a clean one.
  game.pending = opts.pending || null
  game.drawn = null
  game.unoWindow = null
  game.phase = 'play'
  game.turn = opts.turn === undefined ? 0 : opts.turn
  return game
}

// The turn options, ignoring `uno` — that one is offered to the whole table
// whenever somebody is sitting on a single card.
const kinds = (game, seat) =>
  game
    .legalActions(seat)
    .map((a) => a.type)
    .filter((k) => k !== 'uno')
const playable = (game, seat) =>
  game
    .legalActions(seat)
    .filter((a) => a.type === 'play')
    .map((a) => a.card)

test('deck: 88 cards — numbers, +2 and +4, nothing else', (t) => {
  const deck = createDeck()
  t.is(deck.length, 88, 'eighty-eight cards')

  const ranks = new Set(deck.map((c) => c.rank))
  t.absent(ranks.has('salta'), 'no Skip')
  t.absent(ranks.has('reversa'), 'no Reverse')
  t.absent(ranks.has('comodin'), 'no plain Wild')

  t.is(deck.filter((c) => c.rank === '+4').length, 4, 'four +4')
  t.is(deck.filter((c) => c.rank === '+2').length, 8, 'two +2 per colour')
  t.is(deck.filter((c) => c.rank === 0).length, 4, 'one 0 per colour')
  t.is(deck.filter((c) => c.rank === 7).length, 8, 'two of each 1-9 per colour')
  t.is(deck.filter((c) => c.color === 'rojo').length, 21, '19 numbers + 2 draw-twos')
})

test('matching: colour, rank, or a +4 which always goes', (t) => {
  const top = card('rojo', 7)

  t.ok(matches(card('rojo', 3), top, 'rojo'), 'same colour')
  t.ok(matches(card('azul', 7), top, 'rojo'), 'same number')
  t.ok(matches(wild(), top, 'rojo'), 'a +4 is always playable')
  t.ok(matches(card('rojo', '+2'), top, 'rojo'), 'a +2 on its own colour')
  t.absent(matches(card('azul', 3), top, 'rojo'), 'neither colour nor number')

  // After a +4 the colour in play is the one named, not the card's own.
  t.ok(matches(card('verde', 1), wild(), 'verde'), 'follows the named colour')
  t.absent(matches(card('azul', 1), wild(), 'verde'), 'and not any other')
})

test('deal: five cards each, a starter turned up, dealer plays last', (t) => {
  const game = new Game({ rng: () => 0.5 })

  t.is(game.playerCount, 4, 'four at the table')
  for (const hand of game.hands) t.is(hand.length, HAND_SIZE, 'five cards')
  t.is(game.discard.length, 1, 'one card started the pile')
  t.absent(game.top.rank === '+4', 'a +4 never starts the pile')
  t.is(game.turn, game.nextSeat(game.dealer), 'left of the dealer opens')
  t.is(game.activeColor, game.top.color, 'the starter sets the colour')
})

test('play: only matching cards are offered, and the colour follows', (t) => {
  const game = table({
    top: card('rojo', 7),
    hands: [[card('rojo', 3), card('azul', 7), card('azul', 3), wild()], [], [], []]
  })

  const offered = playable(game, 0)
  t.is(offered.length, 3, 'colour, number and the +4')
  t.absent(
    offered.some((c) => c.color === 'azul' && c.rank === 3),
    'the blue 3 matches nothing'
  )

  game.apply({ type: 'play', seat: 0, card: card('azul', 7) })
  t.is(game.activeColor, 'azul', 'the colour in play follows the card')
  t.is(game.turn, 1, 'and the turn moves on')
})

test('draw: you may only play the card you drew', (t) => {
  const game = table({
    top: card('rojo', 7),
    hands: [[card('azul', 3)], [], [], []],
    draw: [card('rojo', 5), card('verde', 9)]
  })

  t.alike(kinds(game, 0), ['draw'], 'nothing matches, so only draw')

  game.apply({ type: 'draw', seat: 0 })
  t.is(game.hands[0].length, 2, 'the card went to hand')

  const offered = playable(game, 0)
  t.is(offered.length, 1, 'only the drawn card is offered')
  t.is(offered[0].rank, 5, 'the red 5 it drew')
  t.ok(kinds(game, 0).includes('pass'), 'or pass')
})

test('draw: an unplayable card ends the turn on its own', (t) => {
  const game = table({
    top: card('rojo', 7),
    hands: [[card('azul', 3)], [], [], []],
    draw: [card('verde', 9)]
  })

  game.apply({ type: 'draw', seat: 0 })
  t.is(game.turn, 1, 'the turn passed without asking')
  t.is(game.hands[0].length, 2, 'and the card was kept')
})

test('+2: the next player takes two and loses the turn', (t) => {
  const game = table({
    top: card('rojo', 7),
    hands: [[card('rojo', '+2'), card('azul', 8)], [card('azul', 3)], [], []],
    draw: [card('verde', 1), card('verde', 2), card('verde', 3)]
  })

  game.apply({ type: 'play', seat: 0, card: card('rojo', '+2') })
  t.alike(game.pending, { count: 2, rank: '+2' }, 'two are owed')
  t.is(game.turn, 1, 'to the next player')
  t.alike(kinds(game, 1), ['take'], 'with no +2 in hand, taking is all there is')

  game.apply({ type: 'take', seat: 1 })
  t.is(game.hands[1].length, 3, 'drew two')
  t.is(game.pending, null, 'the stack cleared')
  t.is(game.turn, 2, 'and the turn skipped past them')
})

test('+2: stacking grows the pile for whoever cannot answer', (t) => {
  const game = table({
    top: card('rojo', 7),
    hands: [
      [card('rojo', '+2'), card('azul', 8)],
      [card('azul', '+2'), card('verde', 8)],
      [card('verde', '+2'), card('rojo', 8)],
      [card('amarillo', 3)]
    ],
    draw: Array(10).fill(card('verde', 1))
  })

  game.apply({ type: 'play', seat: 0, card: card('rojo', '+2') })
  game.apply({ type: 'play', seat: 1, card: card('azul', '+2') })
  t.is(game.pending.count, 4, 'two plus two')

  game.apply({ type: 'play', seat: 2, card: card('verde', '+2') })
  t.is(game.pending.count, 6, 'and another two')

  t.alike(kinds(game, 3), ['take'], 'seat 3 has no +2, so it eats the lot')
  game.apply({ type: 'take', seat: 3 })
  t.is(game.hands[3].length, 7, 'one card plus six drawn')
})

test('+4: names a colour, and only another +4 can answer it', (t) => {
  const game = table({
    top: card('rojo', 7),
    hands: [[wild(), card('azul', 8)], [card('rojo', 3), wild()], [], []],
    draw: Array(10).fill(card('verde', 1))
  })

  game.apply({ type: 'play', seat: 0, card: wild() })
  t.is(game.phase, 'choose-color', 'the colour has to be named')
  t.is(game.currentActor(), 0, 'by whoever played it')
  t.alike(
    game
      .legalActions(0)
      .filter((a) => a.type === 'color')
      .map((a) => a.color),
    COLORS,
    'any of the four'
  )

  game.apply({ type: 'color', seat: 0, color: 'verde' })
  t.is(game.activeColor, 'verde', 'the named colour is in play')
  t.is(game.phase, 'play', 'and play resumes')
  t.is(game.turn, 1, 'with the next player')

  // A red 3 is in hand but a +2 stack only takes its own kind.
  t.alike(
    playable(game, 1).map((c) => c.rank),
    ['+4'],
    'only a +4 answers a +4'
  )
})

test('uno: calling it in time is safe; being caught costs two', (t) => {
  const safe = table({
    top: card('rojo', 7),
    hands: [[card('rojo', 3), card('azul', 9)], [], [], []],
    draw: Array(5).fill(card('verde', 1))
  })

  safe.apply({ type: 'play', seat: 0, card: card('rojo', 3) })
  t.alike(safe.unoWindow, { seat: 0 }, 'one card left, window open')

  safe.apply({ type: 'uno', seat: 0 })
  t.is(safe.unoWindow, null, 'calling it shuts the window')
  t.is(safe.hands[0].length, 1, 'no penalty')

  const caught = table({
    top: card('rojo', 7),
    hands: [[card('rojo', 3), card('azul', 9)], [], [], []],
    draw: Array(5).fill(card('verde', 1))
  })
  caught.apply({ type: 'play', seat: 0, card: card('rojo', 3) })
  caught.apply({ type: 'uno', seat: 2 })

  t.is(caught.hands[0].length, 3, 'caught: one card plus two drawn')
  t.is(caught.unoWindow, null, 'and the window shut')
})

test('uno: the window shuts once somebody else moves', (t) => {
  const game = table({
    top: card('rojo', 7),
    hands: [[card('rojo', 3), card('azul', 9)], [card('rojo', 5)], [], []],
    draw: Array(5).fill(card('verde', 1))
  })

  game.apply({ type: 'play', seat: 0, card: card('rojo', 3) })
  t.ok(game.unoWindow, 'window open')

  game.apply({ type: 'play', seat: 1, card: card('rojo', 5) })
  t.is(game.unoWindow, null, 'the next play closed it — too late to catch')
})

test('scoring: the winner banks what everyone else still holds', (t) => {
  const game = table({
    top: card('rojo', 7),
    hands: [[card('rojo', 3)], [card('azul', 9), card('verde', 5)], [card('rojo', '+2')], [wild()]]
  })

  game.apply({ type: 'play', seat: 0, card: card('rojo', 3) })

  // 9 + 5 + 20 + 50
  t.is(game.scores[0], 84, 'face values, +2 is 20, +4 is 50')
  t.is(game.phase, 'game-over', 'going out ends the game — the game is one hand')
  t.alike(game.lastRound, { winner: 0, points: 84 }, 'and it is recorded')
  t.is(game.winner(), 0, 'the winner is whoever went out, not whoever has most points')
})

test('scoring: card values', (t) => {
  t.is(value(card('rojo', 0)), 0, 'a zero is worth nothing')
  t.is(value(card('azul', 9)), 9, 'numbers are face value')
  t.is(value(card('verde', '+2')), 20, '+2 is twenty')
  t.is(value(wild()), 50, '+4 is fifty')
})

test('scoring: a +2 played last still hits the next player', (t) => {
  const game = table({
    top: card('rojo', 7),
    hands: [[card('rojo', '+2')], [card('azul', 9)], [], []],
    draw: [card('verde', 1), card('verde', 2)]
  })

  game.apply({ type: 'play', seat: 0, card: card('rojo', '+2') })

  t.is(game.hands[1].length, 3, 'they drew the two even though the round ended')
  t.is(game.scores[0], 12, 'and those cards counted: 9 + 1 + 2')
})

test('game: reaching the target ends it', (t) => {
  const game = table({
    top: card('rojo', 7),
    hands: [[card('rojo', 3)], [card('azul', 9)], [], []],
    target: 5
  })
  game.apply({ type: 'play', seat: 0, card: card('rojo', 3) })

  t.ok(game.scores[0] >= 5, 'past the target')
  t.ok(game.isOver(), 'game over')
  t.is(game.winner(), 0, 'and seat 0 took it')
  t.is(game.currentActor(), null, 'nobody is on turn')
})

test('pile: running out reshuffles the discards', (t) => {
  const game = table({
    top: card('rojo', 7),
    hands: [[card('azul', 3)], [], [], []],
    draw: []
  })
  game.discard = [card('rojo', 1), card('rojo', 2), card('rojo', 7)]

  game.apply({ type: 'draw', seat: 0 })

  t.is(game.discard.length, 1, 'only the card in play stays on the pile')
  t.is(game.hands[0].length, 2, 'and the draw succeeded')
})

test('rounds: the deal moves on and hands are dealt fresh', (t) => {
  const game = new Game({ rng: () => 0.5 })
  const dealer = game.dealer

  game.phase = 'round-over'
  game.nextRound()

  t.is(game.dealer, game.nextSeat(dealer), 'the deal moved on')
  t.is(game.roundNumber, 2, 'second round')
  for (const hand of game.hands) t.is(hand.length, HAND_SIZE, 'five cards again')
})

test('legal actions: only the player on turn may act', (t) => {
  const game = table({
    top: card('rojo', 7),
    hands: [[card('rojo', 3)], [card('rojo', 5)], [], []]
  })

  t.ok(game.legalActions(0).length > 0, 'the player on turn has options')
  t.is(game.legalActions(1).length, 0, 'the others have none')
})
