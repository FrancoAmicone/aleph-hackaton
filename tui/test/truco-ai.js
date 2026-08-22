// The AI policy, plus a fuzz run of complete games. The fuzz test is the real
// safety net: it proves engine and AI together always terminate, never deadlock,
// and never produce an illegal action or an impossible score.
const { test } = require('brittle')
const { Game } = require('../lib/truco/engine')
const { decide, handStrength, chatter } = require('../lib/truco/ai')

const card = (rank, suit) => ({ rank, suit })

// Deterministic rng so a failure is reproducible from its seed.
function seeded(seed) {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 4294967296
  }
}

function aiGame(seed, playerCount = 4, level = 'normal') {
  const names = ['Vos', 'Rita', 'Coco', 'Nacho'].slice(0, playerCount)
  return new Game({
    players: names.map((name) => ({ name, isAI: true, level })),
    rng: seeded(seed),
    conFlor: true
  })
}

// Play a whole game out with every seat driven by the AI.
function playOut(game, rng, t) {
  let steps = 0
  while (!game.isOver()) {
    if (steps++ > 20000) return { deadlock: true, steps }

    if (game.phase === 'hand-over') {
      game.nextHand()
      continue
    }

    const seat = game.currentActor()
    if (seat === null) return { deadlock: true, steps }

    const legal = game.legalActions(seat)
    const action = decide(game, seat, rng)

    if (!action) return { deadlock: true, steps }

    // Every action the AI returns must be one the engine actually offered.
    const isLegal = legal.some(
      (a) =>
        a.type === action.type &&
        a.canto === action.canto &&
        (!a.card ||
          (action.card && a.card.rank === action.card.rank && a.card.suit === action.card.suit))
    )
    if (!isLegal) return { illegal: action, legal, steps }

    game.apply(action)
  }
  return { steps }
}

test('handStrength: ranks hands sensibly', (t) => {
  const monster = handStrength([card(1, 'espada'), card(1, 'basto'), card(7, 'espada')])
  const decent = handStrength([card(3, 'oro'), card(2, 'copa'), card(12, 'basto')])
  const rubbish = handStrength([card(4, 'copa'), card(5, 'oro'), card(6, 'basto')])

  t.ok(monster > decent, 'las bravas beat a middling hand')
  t.ok(decent > rubbish, 'a middling hand beats scraps')
  t.ok(monster <= 1 && rubbish >= 0, 'stays inside 0..1')
})

test('ai: answers a hopeless truco with no quiero', (t) => {
  const game = new Game({
    players: [
      { name: 'Vos', isAI: false },
      { name: 'Rita', isAI: true, level: 'duro' }
    ],
    rng: () => 0.5
  })
  game.hands = [
    [card(1, 'espada'), card(1, 'basto'), card(7, 'espada')],
    [card(4, 'copa'), card(5, 'oro'), card(6, 'basto')]
  ]
  game.dealt = game.hands.map((h) => h.slice())
  game.envidoDone = true

  game.apply({ type: 'canto', seat: 0, canto: 'truco' })
  const answer = decide(game, 1, () => 0.99) // no bluffing
  t.is(answer.type, 'no-quiero', 'scraps refuse the truco')
})

test('ai: accepts a truco holding the bravas', (t) => {
  const game = new Game({
    players: [
      { name: 'Vos', isAI: false },
      { name: 'Rita', isAI: true, level: 'normal' }
    ],
    rng: () => 0.5
  })
  game.hands = [
    [card(4, 'copa'), card(5, 'oro'), card(6, 'basto')],
    [card(1, 'espada'), card(1, 'basto'), card(7, 'espada')]
  ]
  game.dealt = game.hands.map((h) => h.slice())
  game.envidoDone = true

  game.apply({ type: 'canto', seat: 0, canto: 'truco' })
  const answer = decide(game, 1, () => 0.99)
  t.ok(answer.type === 'quiero' || answer.type === 'canto', 'a monster hand does not fold')
})

test('ai: declares flor as soon as it can', (t) => {
  const game = new Game({
    players: [
      { name: 'Vos', isAI: false },
      { name: 'Rita', isAI: true }
    ],
    rng: () => 0.5,
    conFlor: true
  })
  game.hands = [
    [card(4, 'copa'), card(5, 'basto'), card(6, 'oro')],
    [card(7, 'oro'), card(6, 'oro'), card(5, 'oro')]
  ]
  game.dealt = game.hands.map((h) => h.slice())
  game.turn = 1

  t.is(decide(game, 1, () => 0.5).canto, 'flor', 'flor is never left on the table')
})

test('ai: plays the cheapest card that still takes the trick', (t) => {
  const game = new Game({
    players: [
      { name: 'Vos', isAI: false },
      { name: 'Rita', isAI: true, level: 'duro' }
    ],
    rng: () => 0.5
  })
  game.hands = [
    [card(2, 'copa'), card(4, 'oro'), card(5, 'oro')],
    [card(1, 'espada'), card(3, 'oro'), card(4, 'basto')]
  ]
  game.dealt = game.hands.map((h) => h.slice())
  game.envidoDone = true
  game.trucoLevel = 3 // no room left to call, so it must play

  game.apply({ type: 'play', seat: 0, card: card(2, 'copa') })
  const action = decide(game, 1, () => 0.99)

  t.is(action.type, 'play', 'it plays')
  t.is(action.card.rank, 3, 'the 3 beats the 2 without spending the ancho')
})

test('ai: does not waste a good card when the partner already holds the trick', (t) => {
  const game = new Game({ rng: () => 0.5 })
  game.hands = [
    [card(4, 'copa'), card(5, 'copa'), card(6, 'copa')], // team 0
    [card(1, 'espada'), card(5, 'oro'), card(4, 'oro')], // team 1
    [card(5, 'copa'), card(6, 'copa'), card(7, 'copa')], // team 0
    [card(1, 'basto'), card(6, 'oro'), card(4, 'basto')] // team 1 — on turn last
  ]
  game.envidoDone = true
  game.trucoLevel = 3 // no cantos left, so the AI must play a card

  game.apply({ type: 'play', seat: 0, card: card(4, 'copa') })
  game.apply({ type: 'play', seat: 1, card: card(1, 'espada') }) // partner takes the lead
  game.apply({ type: 'play', seat: 2, card: card(5, 'copa') })

  t.is(game.currentActor(), 3, 'seat 3 is last to play')
  const action = decide(game, 3, () => 0.99)

  t.is(action.type, 'play', 'it plays a card')
  t.is(action.card.rank, 4, 'it throws its lowest rather than burn the ancho de basto')
  t.is(action.card.suit, 'basto', 'the 4 de basto')
})

test('ai: cannot beat the trick, so it throws its cheapest card', (t) => {
  const game = new Game({ rng: () => 0.5 })
  game.hands = [
    [card(1, 'espada'), card(5, 'copa'), card(6, 'copa')],
    [card(12, 'basto'), card(6, 'oro'), card(4, 'basto')],
    [card(5, 'oro'), card(6, 'basto'), card(7, 'copa')],
    [card(10, 'oro'), card(5, 'basto'), card(4, 'oro')]
  ]
  game.dealt = game.hands.map((h) => h.slice())
  game.envidoDone = true
  game.trucoLevel = 3

  game.apply({ type: 'play', seat: 0, card: card(1, 'espada') }) // unbeatable
  const action = decide(game, 1, () => 0.99)

  t.is(action.type, 'play', 'it plays')
  t.is(action.card.rank, 4, 'nothing beats the brava, so it spends the least')
})

test('fuzz: 200 four-handed games finish cleanly', (t) => {
  let totalSteps = 0
  let hands = 0

  for (let seed = 1; seed <= 200; seed++) {
    const game = aiGame(seed, 4, ['facil', 'normal', 'duro'][seed % 3])
    const result = playOut(game, seeded(seed * 7919), t)

    if (result.deadlock) {
      t.fail(`seed ${seed}: deadlocked after ${result.steps} steps`)
      return
    }
    if (result.illegal) {
      t.fail(`seed ${seed}: illegal action ${JSON.stringify(result.illegal)}`)
      return
    }

    const [a, b] = game.scores
    if (Math.max(a, b) !== 30 || Math.min(a, b) > 29) {
      t.fail(`seed ${seed}: impossible final score ${a}:${b}`)
      return
    }

    totalSteps += result.steps
    hands += game.handNumber
  }

  t.pass(`200 games, ${hands} hands, ${totalSteps} actions — all legal and terminating`)
  t.ok(hands / 200 > 3, 'games last a sensible number of hands')
})

test('fuzz: 200 two-handed games finish cleanly', (t) => {
  for (let seed = 1; seed <= 200; seed++) {
    const game = aiGame(seed, 2, seed % 2 ? 'duro' : 'normal')
    const result = playOut(game, seeded(seed * 104729), t)

    if (result.deadlock || result.illegal) {
      t.fail(`seed ${seed}: ${result.deadlock ? 'deadlock' : 'illegal action'}`)
      return
    }
    if (Math.max(...game.scores) !== 30) {
      t.fail(`seed ${seed}: no winner at 30`)
      return
    }
  }
  t.pass('200 duels, all legal and terminating')
})

test('fuzz: every hand keeps its twelve cards accounted for', (t) => {
  const game = aiGame(42, 4)
  const rng = seeded(99)

  for (let i = 0; i < 40 && !game.isOver(); i++) {
    if (game.phase === 'hand-over') {
      game.nextHand()
      const dealt = game.hands.flat().length
      t.is(dealt, 12, 'twelve cards dealt every hand')
      continue
    }
    const seat = game.currentActor()
    const inHand = game.hands.flat().length
    const played = game.tricks.flat().length
    t.is(inHand + played, 12, 'cards are conserved through the hand')
    game.apply(decide(game, seat, rng))
  }
  t.pass('card conservation held')
})

test('chatter: gives every canto a line', (t) => {
  t.ok(
    chatter({ type: 'canto', canto: 'truco' }, () => 0),
    'truco talks'
  )
  t.ok(
    chatter({ type: 'quiero' }, () => 0),
    'quiero talks'
  )
  t.is(
    chatter({ type: 'play', card: card(1, 'espada') }, () => 0),
    null,
    'playing is silent'
  )
  t.is(chatter(null), null, 'no action, no line')
})
