// The rules engine. Every test drives the real Game through legalActions/apply,
// with hands stacked directly so each rule is exercised in isolation.
const { test } = require('brittle')
const {
  Game,
  handWinner,
  acceptValue,
  rejectValue,
  envidoEscalations
} = require('../lib/truco/engine')

const card = (rank, suit) => ({ rank, suit })

// A deterministic two-player game with hands stacked by the caller.
function duel(hands, opts = {}) {
  const game = new Game({
    players: [
      { name: 'Vos', isAI: false },
      { name: 'Rita', isAI: true }
    ],
    conFlor: opts.conFlor === true,
    target: opts.target || 30,
    rng: () => 0.5
  })
  if (hands) stack(game, hands)
  if (opts.scores) game.scores = opts.scores.slice()
  return game
}

// Deal a specific set of hands, keeping game.dealt (which envido and flor are
// measured from) in step with game.hands.
function stack(game, hands) {
  game.hands = hands.map((h) => h.slice())
  game.dealt = hands.map((h) => h.slice())
}

const cantos = (game, seat) =>
  game
    .legalActions(seat)
    .filter((a) => a.type === 'canto')
    .map((a) => a.canto)

test('handWinner: standard parda resolution', (t) => {
  t.is(handWinner([0, 0], 0), 0, 'two straight tricks wins')
  t.is(handWinner([0, 1], 0), null, 'split needs a third')
  t.is(handWinner([0, 1, 1], 0), 1, 'third trick decides a split')
  t.is(handWinner([null, 1], 0), 1, 'primera parda: the second trick decides')
  t.is(handWinner([0, null], 0), 0, 'segunda parda: the first trick holds')
  t.is(handWinner([null, null, null], 1), 1, 'three pardas: the mano takes it')
  t.is(handWinner([null, null, 0], 1), 0, 'two pardas: the third decides')
  t.is(handWinner([0, 1, null], 0), 0, 'tercera parda: the first winner takes it')
  t.is(handWinner([0], 0), null, 'one trick is never enough')
})

test('trick: the stronger card wins and leads the next', (t) => {
  const game = duel([
    [card(1, 'espada'), card(4, 'copa'), card(5, 'copa')],
    [card(3, 'oro'), card(6, 'basto'), card(7, 'copa')]
  ])

  game.apply({ type: 'play', seat: 0, card: card(1, 'espada') })
  game.apply({ type: 'play', seat: 1, card: card(3, 'oro') })

  t.alike(game.trickResults, [0], 'seat 0 took the trick')
  t.is(game.turn, 0, 'and leads the next one')
  t.is(game.trickIndex, 1, 'moved to the second trick')
  t.is(game.hands[0].length, 2, 'card left the hand')
})

test('trick: equal cards across teams are a parda', (t) => {
  const game = duel([
    [card(3, 'oro'), card(4, 'copa'), card(5, 'copa')],
    [card(3, 'espada'), card(6, 'basto'), card(7, 'copa')]
  ])

  game.apply({ type: 'play', seat: 0, card: card(3, 'oro') })
  game.apply({ type: 'play', seat: 1, card: card(3, 'espada') })

  t.alike(game.trickResults, [null], 'parda recorded')
  t.is(game.turn, game.trickLead, 'the lead stays put')
})

test('truco: refusing hands over the level below', (t) => {
  const game = duel()

  game.apply({ type: 'canto', seat: 0, canto: 'truco' })
  t.is(game.phase, 'response', 'waiting on the rival')
  t.is(game.currentActor(), 1, 'the rival answers')

  game.apply({ type: 'no-quiero', seat: 1 })
  t.is(game.scores[0], 1, 'truco refused pays 1')
  t.is(game.phase, 'hand-over', 'the hand ends there')
})

test('truco: accepting makes the hand worth 2, and can be raised', (t) => {
  const game = duel()

  game.apply({ type: 'canto', seat: 0, canto: 'truco' })
  game.apply({ type: 'quiero', seat: 1 })
  t.is(game.handValue(), 2, 'truco querido vale 2')
  t.is(game.phase, 'play', 'play resumes')
  t.is(game.turn, 0, 'with the player who called')

  t.absent(cantos(game, 0).includes('retruco'), 'the calling side cannot raise itself')

  game.apply({ type: 'play', seat: 0, card: game.hands[0][0] })
  t.ok(cantos(game, 1).includes('retruco'), 'the rival can raise to retruco')

  game.apply({ type: 'canto', seat: 1, canto: 'retruco' })
  game.apply({ type: 'no-quiero', seat: 0 })
  t.is(game.scores[1], 2, 'retruco refused pays 2')
})

test('truco: vale cuatro is the ceiling', (t) => {
  const game = duel()
  game.apply({ type: 'canto', seat: 0, canto: 'truco' })
  game.apply({ type: 'canto', seat: 1, canto: 'retruco' })
  game.apply({ type: 'canto', seat: 0, canto: 'vale-cuatro' })
  game.apply({ type: 'quiero', seat: 1 })

  t.is(game.handValue(), 4, 'vale cuatro querido vale 4')
  t.is(game.trucoLevel, 3, 'topped out')
  t.absent(
    cantos(game, 1).some((c) => c.startsWith('vale')),
    'nothing above vale cuatro'
  )
})

test('envido: chain values on accept and refuse', (t) => {
  t.is(acceptValue(['envido']), 2, 'envido querido vale 2')
  t.is(acceptValue(['envido', 'envido']), 4, 'envido envido vale 4')
  t.is(acceptValue(['envido', 'real-envido']), 5, 'envido + real vale 5')
  t.is(rejectValue(['envido']), 1, 'envido no querido paga 1')
  t.is(rejectValue(['envido', 'envido']), 2, 'the second refusal pays the first')
  t.is(rejectValue(['envido', 'real-envido']), 2, 'real refused pays the envido below it')
  t.is(rejectValue(['envido', 'real-envido', 'falta-envido']), 5, 'falta refused pays the rest')

  t.alike(envidoEscalations(['real-envido']), ['falta-envido'], 'only falta tops a real')
  t.alike(envidoEscalations(['falta-envido']), [], 'falta is final')
  t.ok(envidoEscalations(['envido']).includes('envido'), 'envido can be re-raised once')
  t.absent(envidoEscalations(['envido', 'envido']).includes('envido'), 'but not twice')
})

test('envido: the higher hand takes the points', (t) => {
  const game = duel([
    [card(7, 'oro'), card(6, 'oro'), card(4, 'copa')], // 33
    [card(7, 'copa'), card(5, 'copa'), card(4, 'basto')] // 32
  ])

  game.apply({ type: 'canto', seat: 0, canto: 'envido' })
  game.apply({ type: 'quiero', seat: 1 })

  t.is(game.scores[0], 2, 'the 33 wins 2 points')
  t.is(game.scores[1], 0, 'the 32 gets nothing')
  t.ok(game.envidoDone, 'envido is spent')
  t.is(game.phase, 'play', 'the hand carries on')
  t.absent(cantos(game, 0).includes('envido'), 'and cannot be called again')
})

test('envido: the mano wins a tie', (t) => {
  const game = duel([
    [card(7, 'oro'), card(6, 'oro'), card(4, 'copa')], // 33
    [card(7, 'copa'), card(6, 'copa'), card(4, 'basto')] // 33
  ])
  t.is(game.mano, 0, 'seat 0 is mano')

  game.apply({ type: 'canto', seat: 1, canto: 'envido' })
  game.apply({ type: 'quiero', seat: 0 })

  t.is(game.scores[0], 2, 'the mano takes the tie')
  t.is(game.scores[1], 0, 'even though the rival called it')
})

test('envido: falta envido is worth what the leader still needs', (t) => {
  const game = duel(
    [
      [card(7, 'oro'), card(6, 'oro'), card(4, 'copa')],
      [card(4, 'copa'), card(5, 'basto'), card(10, 'espada')]
    ],
    { scores: [12, 22] }
  )

  t.is(game.faltaValue(), 8, '30 - 22')
  game.apply({ type: 'canto', seat: 0, canto: 'falta-envido' })
  game.apply({ type: 'quiero', seat: 1 })
  t.is(game.scores[0], 20, '12 + 8')
})

test('envido: counted from the dealt hand, not from what is left', (t) => {
  const game = duel([
    [card(7, 'oro'), card(6, 'oro'), card(4, 'copa')], // 33
    [card(5, 'copa'), card(4, 'basto'), card(10, 'espada')] // 5
  ])

  // Play one of the two oros away — envido is still open in the first trick.
  game.apply({ type: 'play', seat: 0, card: card(7, 'oro') })
  t.is(game.trickIndex, 0, 'still in the first trick')
  t.ok(cantos(game, 1).includes('envido'), 'envido can still be called')

  game.apply({ type: 'canto', seat: 1, canto: 'envido' })
  game.apply({ type: 'quiero', seat: 0 })

  // From the two cards left it would be 4; from the dealt three it is 33.
  t.is(game.scores[0], 2, 'the dealt hand still counts 33 and wins')
  t.is(game.scores[1], 0, 'not the 4 left in hand')
})

test('flor: still declarable after a card is played in the first trick', (t) => {
  const game = duel(
    [
      [card(7, 'oro'), card(6, 'oro'), card(5, 'oro')], // flor 38
      [card(5, 'copa'), card(4, 'basto'), card(10, 'espada')]
    ],
    { conFlor: true }
  )

  game.apply({ type: 'play', seat: 0, card: card(7, 'oro') })
  game.apply({ type: 'play', seat: 1, card: card(5, 'copa') })
  // Seat 0 took the trick, so the hand moved on and flor is gone with it.
  t.is(game.trickIndex, 1, 'into the second trick')
  t.absent(cantos(game, 0).includes('flor'), 'flor cannot be declared late')

  const open = duel(
    [
      [card(7, 'oro'), card(6, 'oro'), card(5, 'oro')],
      [card(5, 'copa'), card(4, 'basto'), card(10, 'espada')]
    ],
    { conFlor: true }
  )
  open.apply({ type: 'play', seat: 0, card: card(7, 'oro') })
  t.ok(cantos(open, 1).length >= 0, 'the first trick is still open')
  open.turn = 0
  t.ok(cantos(open, 0).includes('flor'), 'flor survives a played card in trick one')

  open.apply({ type: 'canto', seat: 0, canto: 'flor' })
  t.is(open.scores[0], 3, 'and is scored from the three dealt cards')
})

test('envido: only in the first trick', (t) => {
  const game = duel([
    [card(1, 'espada'), card(4, 'copa'), card(5, 'copa')],
    [card(3, 'oro'), card(6, 'basto'), card(7, 'copa')]
  ])

  t.ok(cantos(game, 0).includes('envido'), 'available up front')
  game.apply({ type: 'play', seat: 0, card: card(1, 'espada') })
  game.apply({ type: 'play', seat: 1, card: card(3, 'oro') })

  t.is(game.trickIndex, 1, 'into the second trick')
  t.absent(cantos(game, 0).includes('envido'), 'envido is gone')
  t.ok(cantos(game, 0).includes('truco'), 'truco is still live')
})

test('envido: "el envido está primero" parks the truco', (t) => {
  const game = duel([
    [card(4, 'copa'), card(5, 'basto'), card(10, 'espada')], // 15
    [card(7, 'oro'), card(6, 'oro'), card(4, 'copa')] // 33
  ])

  game.apply({ type: 'canto', seat: 0, canto: 'truco' })
  t.ok(cantos(game, 1).includes('envido'), 'the rival may answer with envido')

  game.apply({ type: 'canto', seat: 1, canto: 'envido' })
  t.is(game.currentActor(), 0, 'the envido goes back to the truco caller')

  game.apply({ type: 'quiero', seat: 0 })
  t.is(game.scores[1], 2, 'the envido settles first')
  t.is(game.phase, 'response', 'and the truco is still on the table')
  t.is(game.pending.kind, 'truco', 'waiting on the truco answer')

  game.apply({ type: 'quiero', seat: 1 })
  t.is(game.handValue(), 2, 'truco accepted afterwards')
  t.is(game.turn, 0, 'play resumes with the caller')
})

test('flor: beats envido and pays 3 when unanswered', (t) => {
  const game = duel(
    [
      [card(7, 'oro'), card(6, 'oro'), card(5, 'oro')], // flor 38
      [card(7, 'copa'), card(5, 'basto'), card(4, 'espada')]
    ],
    { conFlor: true }
  )

  t.ok(cantos(game, 0).includes('flor'), 'flor is available')
  t.absent(cantos(game, 0).includes('envido'), 'a flor hand cannot call envido')

  game.apply({ type: 'canto', seat: 0, canto: 'flor' })
  t.is(game.scores[0], 3, 'la flor es buena: 3 points')
  t.ok(game.envidoDone, 'flor closes the envido')
  t.is(game.phase, 'play', 'play continues')
})

test('flor: contraflor is played out between two flores', (t) => {
  const game = duel(
    [
      [card(7, 'oro'), card(6, 'oro'), card(5, 'oro')], // 38
      [card(7, 'copa'), card(6, 'copa'), card(4, 'copa')] // 37
    ],
    { conFlor: true }
  )

  game.apply({ type: 'canto', seat: 0, canto: 'flor' })
  t.is(game.phase, 'response', 'the rival flor must answer')
  t.is(game.currentActor(), 1, 'and it is seat 1')

  game.apply({ type: 'canto', seat: 1, canto: 'contraflor' })
  game.apply({ type: 'quiero', seat: 0 })
  t.is(game.scores[0], 6, 'the higher flor takes 6')
  t.is(game.scores[1], 0, 'the lower flor gets nothing')
})

test('mazo: folding pays the rival what is on the table', (t) => {
  const game = duel()
  game.apply({ type: 'canto', seat: 0, canto: 'truco' })
  game.apply({ type: 'quiero', seat: 1 })
  game.apply({ type: 'mazo', seat: 0 })

  t.is(game.scores[1], 2, 'the rival banks the truco')
  t.is(game.phase, 'hand-over', 'hand over')
})

test('game: reaching the target ends it', (t) => {
  const game = duel(null, { scores: [29, 0] })
  game.apply({ type: 'canto', seat: 0, canto: 'truco' })
  game.apply({ type: 'no-quiero', seat: 1 })

  t.is(game.scores[0], 30, 'capped at the target')
  t.ok(game.isOver(), 'game over')
  t.is(game.winner(), 0, 'seat 0 team wins')
  t.is(game.currentActor(), null, 'nobody is on turn')
})

test('four-handed: teams, turn order and the mano rotating', (t) => {
  const game = new Game({ rng: () => 0.5 })

  t.is(game.playerCount, 4, 'four seats')
  t.alike(
    game.players.map((p) => p.team),
    [0, 1, 0, 1],
    'partners sit opposite'
  )
  t.is(game.hands.flat().length, 12, 'three cards each')
  t.is(game.mano, 0, 'seat 0 is mano first')

  for (let i = 0; i < 4; i++) {
    const seat = game.currentActor()
    t.is(seat, i, `seat ${i} plays in order`)
    game.apply({ type: 'play', seat, card: game.hands[seat][0] })
  }
  t.is(game.trickResults.length, 1, 'the trick resolved after four cards')

  const mano = game.mano
  game.phase = 'hand-over'
  game.nextHand()
  t.is(game.mano, (mano + 1) % 4, 'the deal moves on')
  t.is(game.hands.flat().length, 12, 'fresh cards dealt')
})

test('four-handed: a canto is answered by the rival team', (t) => {
  const game = new Game({ rng: () => 0.5 })

  game.apply({ type: 'canto', seat: 0, canto: 'truco' })
  t.is(game.currentActor(), 1, 'the next rival answers')
  t.is(game.teamOf(1), 1, 'and is on the other team')
  t.is(game.legalActions(2).length, 0, 'a partner cannot answer for them')
})

test('four-handed: partners win the trick together', (t) => {
  const game = new Game({ rng: () => 0.5 })
  game.hands = [
    [card(4, 'copa'), card(5, 'copa'), card(6, 'copa')],
    [card(4, 'basto'), card(5, 'basto'), card(6, 'basto')],
    [card(1, 'espada'), card(3, 'oro'), card(2, 'oro')],
    [card(4, 'oro'), card(5, 'oro'), card(6, 'oro')]
  ]
  game.dealt = game.hands.map((h) => h.slice())

  game.apply({ type: 'play', seat: 0, card: card(4, 'copa') })
  game.apply({ type: 'play', seat: 1, card: card(4, 'basto') })
  game.apply({ type: 'play', seat: 2, card: card(1, 'espada') })
  game.apply({ type: 'play', seat: 3, card: card(4, 'oro') })

  t.alike(game.trickResults, [0], 'the partner’s ancho takes it for team 0')
  t.is(game.turn, 2, 'and that partner leads')
})

test('legal actions: only the player on turn may act', (t) => {
  const game = duel()
  t.ok(game.legalActions(0).length > 0, 'the player on turn has options')
  t.is(game.legalActions(1).length, 0, 'the other seat has none')

  const plays = game.legalActions(0).filter((a) => a.type === 'play')
  t.is(plays.length, 3, 'three cards to choose from')
  t.ok(
    game.legalActions(0).some((a) => a.type === 'mazo'),
    'folding is always allowed'
  )
})
