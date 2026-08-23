// The AI policy, plus a fuzz run of complete games. The fuzz test is the real
// safety net: it proves engine and AI together always terminate, never
// deadlock, and never produce an illegal action or an impossible score.
const { test } = require('brittle')
const { Game } = require('../lib/uno/engine')
const { decide, chatter, bestColor } = require('../lib/uno/ai')
const { value } = require('../lib/uno/deck')

const card = (color, rank) => ({ color, rank })
const wild = () => ({ color: null, rank: '+4' })

function seeded(seed) {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 4294967296
  }
}

function aiGame(seed, level = 'normal', target = 500) {
  return new Game({
    players: ['Vos', 'Rita', 'Coco', 'Nacho'].map((name) => ({ name, isAI: true, level })),
    rng: seeded(seed),
    target
  })
}

// Play a whole game out with every seat driven by the AI.
function playOut(game, rng) {
  let steps = 0
  while (!game.isOver()) {
    if (steps++ > 60000) return { deadlock: true, steps }

    // Somebody may owe a UNO call even when it is not their turn.
    const seat = game.currentActor()
    if (seat === null) return { deadlock: true, steps }

    const legal = game.legalActions(seat)
    const action = decide(game, seat, rng)
    if (!action) return { deadlock: true, steps }

    const ok = legal.some(
      (a) =>
        a.type === action.type &&
        a.color === action.color &&
        (!a.card ||
          (action.card && a.card.color === action.card.color && a.card.rank === action.card.rank))
    )
    if (!ok) return { illegal: action, steps }

    game.apply(action)
  }
  return { steps }
}

test('ai: plays a matching card rather than drawing', (t) => {
  const game = aiGame(1)
  game.hands = [[card('rojo', 3), card('azul', 8)], [], [], []]
  game.discard = [card('rojo', 7)]
  game.activeColor = 'rojo'
  game.pending = null
  game.drawn = null
  game.unoWindow = null
  game.phase = 'play'
  game.turn = 0

  const action = decide(game, 0, seeded(9))
  t.is(action.type, 'play', 'it plays')
  t.is(action.card.color, 'rojo', 'the card that matches')
})

test('ai: answers a stack rather than eating it', (t) => {
  const game = aiGame(2)
  game.hands = [[card('rojo', 3)], [card('azul', '+2'), card('verde', 4)], [], []]
  game.discard = [card('rojo', '+2')]
  game.activeColor = 'rojo'
  game.pending = { count: 2, rank: '+2' }
  game.drawn = null
  game.unoWindow = null
  game.phase = 'play'
  game.turn = 1

  const action = decide(game, 1, () => 0.1)
  t.is(action.type, 'play', 'it stacks')
  t.is(action.card.rank, '+2', 'with its own +2')
})

test('ai: names the colour it holds most of', (t) => {
  const hand = [card('verde', 1), card('verde', 5), card('verde', 9), card('rojo', 2)]
  t.is(
    bestColor(hand, () => 0.5),
    'verde',
    'green, three of them'
  )

  // A hand of nothing but wilds has no colour to prefer, so it picks one.
  const wilds = [wild(), wild()]
  t.ok(
    ['rojo', 'amarillo', 'verde', 'azul'].includes(bestColor(wilds, () => 0.5)),
    'still names one'
  )
})

test('ai: a hard rival always calls its own UNO', (t) => {
  const game = aiGame(3, 'hard')
  game.hands = [[card('rojo', 3)], [], [], []]
  game.unoWindow = { seat: 0 }
  game.phase = 'play'
  game.turn = 0

  const action = decide(game, 0, () => 0.99)
  t.is(action.type, 'uno', 'it shouts before anything else')
})

test('ai: a hard rival catches somebody who forgot', (t) => {
  const game = aiGame(4, 'hard')
  game.hands = [[card('rojo', 3)], [card('azul', 4), card('azul', 5)], [], []]
  game.discard = [card('rojo', 7)]
  game.activeColor = 'rojo'
  game.pending = null
  game.drawn = null
  game.unoWindow = { seat: 0 } // seat 0 never called
  game.phase = 'play'
  game.turn = 1

  const action = decide(game, 1, () => 0.1)
  t.is(action.type, 'uno', 'it pounces')
  t.is(action.seat, 1, 'as itself, which the engine reads as a catch')
})

test('fuzz: 200 four-handed games finish cleanly', (t) => {
  let rounds = 0
  let steps = 0

  for (let seed = 1; seed <= 200; seed++) {
    const game = aiGame(seed, ['easy', 'normal', 'hard'][seed % 3])
    const result = playOut(game, seeded(seed * 7919))

    if (result.deadlock) {
      t.fail(`seed ${seed}: deadlocked after ${result.steps} steps`)
      return
    }
    if (result.illegal) {
      t.fail(`seed ${seed}: illegal action ${JSON.stringify(result.illegal)}`)
      return
    }
    const winner = game.winner()
    if (winner === null || game.hands[winner].length !== 0) {
      t.fail(
        `seed ${seed}: ended without anyone going out — ${game.hands.map((h) => h.length).join('/')}`
      )
      return
    }

    rounds += 1
    steps += result.steps
  }

  t.pass(`200 games, ${steps} actions — all legal, all ended on an empty hand`)
  t.ok(steps / 200 > 10, 'a game takes real turns, not one')
})

test('fuzz: cards are conserved — hands plus piles always make 88', (t) => {
  const game = aiGame(42)
  const rng = seeded(99)

  for (let i = 0; i < 4000 && !game.isOver(); i++) {
    const seat = game.currentActor()
    if (seat === null) break

    const total = game.hands.flat().length + game.draw.length + game.discard.length
    if (total !== 88) {
      t.fail(`a card went missing: ${total} of 88 at step ${i}`)
      return
    }
    game.apply(decide(game, seat, rng))
  }
  t.pass('no card was ever lost or duplicated')
})

test('fuzz: the winner banks exactly what the losers were holding', (t) => {
  const { value } = require('../lib/uno/deck')
  for (let seed = 1; seed <= 40; seed++) {
    const game = aiGame(seed)
    const result = playOut(game, seeded(seed * 31))
    if (result.deadlock || result.illegal) {
      t.fail(`seed ${seed}: ${result.deadlock ? 'deadlock' : 'illegal action'}`)
      return
    }
    const winner = game.winner()
    let held = 0
    for (let seat = 0; seat < game.playerCount; seat++) {
      if (seat !== winner) for (const c of game.hands[seat]) held += value(c)
    }
    if (game.scores[winner] !== held) {
      t.fail(`seed ${seed}: winner scored ${game.scores[winner]} but losers held ${held}`)
      return
    }
  }
  t.pass('40 games: every score equals the cards left in the losing hands')
})

test('chatter: gives the loud cards a line', (t) => {
  t.ok(
    chatter({ type: 'play', card: card('rojo', '+2') }, () => 0),
    'a +2 talks'
  )
  t.ok(
    chatter({ type: 'play', card: wild() }, () => 0),
    'a +4 talks'
  )
  t.ok(
    chatter({ type: 'uno' }, () => 0),
    'so does UNO'
  )
  t.is(
    chatter({ type: 'play', card: card('rojo', 3) }, () => 0),
    null,
    'a plain number is quiet'
  )
  t.is(chatter(null), null, 'no action, no line')
})

test('values: a round score is the sum of what the losers hold', (t) => {
  const hand = [card('rojo', 9), card('azul', '+2'), wild()]
  const total = hand.reduce((n, c) => n + value(c), 0)
  t.is(total, 79, '9 + 20 + 50')
})
