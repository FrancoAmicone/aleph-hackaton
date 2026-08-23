// The interface. Two things matter here and both are checked without a
// terminal: that the canvas is always exactly the size it claims (an
// overflowing line tears the alt-screen), and that keys drive the model the
// way the on-screen hints promise.
const { test } = require('brittle')
const { PassThrough, Writable } = require('bare-stream')
const { Program, KeyMsg, style } = require('../lib/tea')
const { stripAnsi } = require('../lib/tea/style')
const { Game } = require('../lib/uno/engine')
const {
  renderMesa,
  panel,
  commands,
  commandLine,
  partidaLines,
  chatLines
} = require('../lib/ui/screen')
const { bars, block, GLYPHS } = require('../lib/ui/bars')
const { CANVAS } = require('../lib/ui/canvas')
const palette = require('../lib/ui/palette')
const cardsUi = require('../lib/ui/cards')
const App = require('../lib/ui/app')

function seeded(seed) {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 4294967296
  }
}

// A key press as the decoder delivers it: matching is done on `name`.
const press = (name) => new KeyMsg({ name, sequence: name })

function app(opts = {}) {
  const model = new App({
    version: '1.0.0',
    flags: opts.flags || {},
    rng: opts.rng || seeded(2024),
    think: { canto: 0, play: 0, say: 0, deal: 0 }
  })
  model.update({
    type: 'resize',
    width: opts.width || CANVAS.width,
    height: opts.height || CANVAS.height
  })
  return model
}

async function step(model, msg) {
  const [, cmd] = model.update(msg)
  await runCmd(model, cmd)
  return model
}

// Runs a Cmd chain to completion — except frames. An animation tick re-arms
// itself forever (that is what keeps the bars moving), so following it would
// never return. Tests that care about animation drive frames by hand.
async function runCmd(model, cmd) {
  if (!cmd) return
  const cmds = Array.isArray(cmd) ? cmd : [cmd]
  for (const c of cmds) {
    if (!c) continue
    const msg = await c()
    if (!msg || msg.type === 'quit' || msg.type === 'frame') continue
    const [, next] = model.update(msg)
    await runCmd(model, next)
  }
}

const lines = (frame) => frame.split('\n')
const widest = (frame) => Math.max(...lines(frame).map(style.width))
const card = (color, rank) => ({ color, rank })

// A table with a known hand, pile and colour.
function stacked(opts = {}) {
  const game = new Game({ rng: seeded(5) })
  if (opts.hands) game.hands = opts.hands.map((h) => h.slice())
  if (opts.top) {
    game.discard = [opts.top]
    game.activeColor = opts.active || opts.top.color
  }
  game.pending = opts.pending || null
  game.drawn = null
  game.unoWindow = null
  game.phase = 'play'
  game.turn = 0
  return game
}

const view = { selected: 0, says: {}, version: '1.0.0', frame: 0 }

// Deal, then force a known table with the turn on you. Assertions that follow
// use model.update() rather than step(), because step() also runs the AI's
// commands and a rival would land a card on top before the assert.
function seat0(model, opts = {}) {
  model.startGame()
  const g = model.game
  g.hands[0] = (opts.hand || [card('rojo', 3), card('azul', 8)]).slice()
  g.discard = [opts.top || card('rojo', 7)]
  g.activeColor = opts.active || g.discard[0].color
  g.pending = opts.pending || null
  g.drawn = null
  g.unoWindow = null
  g.phase = 'play'
  g.turn = 0
  if (opts.draw) g.draw = opts.draw.slice()
  model.selected = 0
  return g
}

test('every screen is drawn at exactly the canvas size', (t) => {
  const model = app()

  for (const [name, prepare] of [
    ['menu', () => {}],
    ['rules', () => (model.screen = 'rules')],
    ['table', () => model.startGame()]
  ]) {
    prepare()
    const frame = lines(model.view())
    t.is(frame.length, CANVAS.height, `${name} is ${CANVAS.height} rows`)
    t.is(widest(frame.join('\n')), CANVAS.width, `${name} is ${CANVAS.width} columns`)
  }
})

test('the canvas is centred in a larger terminal', (t) => {
  const model = app({ width: CANVAS.width + 20, height: CANVAS.height + 6 })
  const frame = lines(model.view())

  t.is(frame.length, CANVAS.height + 3, 'padded down by half the spare rows')
  t.ok(
    frame.slice(3).every((line) => line.startsWith(' '.repeat(10))),
    'and indented by half the spare columns'
  )
})

test('a terminal too small for the canvas is asked to grow', (t) => {
  const model = app({ width: 80, height: 24 })
  const frame = stripAnsi(model.view())

  t.ok(frame.includes('muy chica'), 'says the window is too small')
  t.ok(frame.includes(`${CANVAS.width}×${CANVAS.height}`), 'names the size it needs')
})

test('the canvas holds its size through a whole round', async (t) => {
  const model = app()
  model.startGame()

  const rng = seeded(77)
  let guard = 0

  // One hand is the whole game now, so this runs until someone goes out — and
  // stops the moment the model leaves the table for the result screen.
  while (model.game && !model.game.isOver() && model.screen === 'game' && guard++ < 600) {
    const frame = model.view()
    if (widest(frame) !== CANVAS.width || lines(frame).length !== CANVAS.height) {
      t.fail(`canvas changed size: ${widest(frame)}x${lines(frame).length}`)
      return
    }

    const game = model.game
    if (game.currentActor() !== 0) {
      await step(model, { type: 'ai' })
      continue
    }

    // Drive the human seat with the AI so the round keeps moving.
    const { decide } = require('../lib/uno/ai')
    const action = decide(game, 0, rng)
    if (!action) break

    if (action.type === 'play') {
      const index = game.hands[0].findIndex(
        (c) => c.color === action.card.color && c.rank === action.card.rank
      )
      // Past the ninth card there is no number key, so aim the selection.
      model.selected = index
      await step(model, press(index < 9 ? String(index + 1) : 'enter'))
    } else if (action.type === 'draw' || action.type === 'take') {
      await step(model, press('d'))
    } else if (action.type === 'pass') {
      await step(model, press('p'))
    } else if (action.type === 'uno') {
      await step(model, press('u'))
    } else if (action.type === 'color') {
      await step(model, press({ rojo: 'r', amarillo: 'a', verde: 'v', azul: 'z' }[action.color]))
    } else {
      break
    }
  }

  t.ok(guard < 600, 'the hand progressed rather than stalling')
  t.ok(model.game.isOver(), 'and it ran all the way to someone going out')
  t.is(model.screen, 'result', 'which lands on the result screen')
  t.ok(guard > 5, `and it took real turns to get there (${guard})`)
})

test('number keys play that card', (t) => {
  const model = app()
  seat0(model)

  model.update(press('1'))
  t.is(model.game.hands[0].length, 1, 'the card left the hand')
  t.is(model.game.top.rank, 3, 'and landed on the pile')
})

test('an illegal card is refused with a message, not played', (t) => {
  const model = app()
  seat0(model, { hand: [card('azul', 8), card('rojo', 3)] })

  model.update(press('1')) // the blue 8 matches nothing

  t.is(model.game.hands[0].length, 2, 'the hand is untouched')
  t.ok(model.message, 'and the player is told why')
})

test('arrow keys move the selection and wrap around', (t) => {
  const model = app()
  seat0(model, { hand: [card('rojo', 3), card('rojo', 4), card('rojo', 5)] })

  t.is(model.selected, 0, 'starts on the first card')
  model.update(press('right'))
  t.is(model.selected, 1, 'right moves along')
  model.update(press('left'))
  model.update(press('left'))
  t.is(model.selected, model.game.hands[0].length - 1, 'left wraps to the end')
})

test('D draws, and eats the stack when there is one', (t) => {
  const drawing = app()
  seat0(drawing, { hand: [card('azul', 8)], draw: [card('verde', 9), card('verde', 2)] })

  drawing.update(press('d'))
  t.is(drawing.game.hands[0].length, 2, 'drew a card')

  const eating = app()
  seat0(eating, {
    hand: [card('azul', 8)],
    top: card('rojo', '+2'),
    pending: { count: 4, rank: '+2' },
    draw: Array(8).fill(card('verde', 1))
  })

  eating.update(press('d'))
  t.is(eating.game.hands[0].length, 5, 'ate the whole stack of four')
  t.is(eating.game.pending, null, 'and the stack cleared')
})

test('a +4 asks for a colour, and the letter keys name it', (t) => {
  const model = app()
  seat0(model, { hand: [{ color: null, rank: '+4' }, card('azul', 8)] })

  model.update(press('1'))
  t.is(model.game.phase, 'choose-color', 'it asks')
  t.ok(stripAnsi(model.view()).includes('Elegí'), 'and says so on screen')

  model.update(press('v'))
  t.is(model.game.activeColor, 'verde', 'the named colour is in play')
  t.is(model.game.phase, 'play', 'and play resumes')
})

test('U shouts UNO while the window is open', (t) => {
  const model = app()
  seat0(model, { hand: [card('rojo', 3)] })
  model.game.unoWindow = { seat: 0 }

  model.update(press('u'))
  t.is(model.game.unoWindow, null, 'the window shut')
  t.is(model.game.hands[0].length, 1, 'with no penalty')
})

test('panel: draws an exact rectangle whatever is inside it', (t) => {
  for (const body of ['', 'una linea', 'a\nb\nc', Array(40).fill('desborde').join('\n')]) {
    const drawn = panel('TITULO', body, 24, 9).split('\n')
    t.is(drawn.length, 9, 'exactly the requested height')
    t.ok(
      drawn.every((line) => style.width(line) === 24),
      'and exactly the requested width'
    )
  }
})

test('mesa: never grows wider than the canvas, whatever is said', (t) => {
  const game = stacked({ top: card('rojo', 7), hands: [[card('rojo', 3)], [], [], []] })

  t.ok(widest(renderMesa(game, view)) <= CANVAS.width, 'the quiet table fits')

  const loud = renderMesa(game, { ...view, says: { 1: '¡Y cambio de color carajo!' } })
  t.ok(widest(loud) <= CANVAS.width, 'and so does a loud one')

  // A hand that ate two big stacks must not widen the row either.
  game.hands[1] = Array(24).fill(card('verde', 1))
  t.ok(widest(renderMesa(game, view)) <= CANVAS.width, 'nor a player holding two dozen cards')
})

test('mesa: the table is a piece of furniture, not a floating box', (t) => {
  const game = stacked({ top: card('rojo', 7), hands: [[card('rojo', 3)], [], [], []] })
  const plain = stripAnsi(renderMesa(game, view))

  // Top, rim, two leg rows, floor, shadow — in that order, each on its own row.
  const order = ['╰', '║', '║', '╨', '░░░']
  let at = -1
  for (const mark of order) {
    const next = plain.indexOf(mark, at + 1)
    t.ok(next > at, `${mark} comes after the previous part`)
    at = next
  }

  // The legs stand on the floor: the ╨ feet sit on the same columns as the ║.
  const rows = plain.split('\n')
  const legRow = rows.find((r) => r.includes('║'))
  const floorRow = rows.find((r) => r.includes('╨'))
  const legCols = [...legRow].map((ch, i) => (ch === '║' ? i : -1)).filter((i) => i >= 0)
  const footCols = [...floorRow].map((ch, i) => (ch === '╨' ? i : -1)).filter((i) => i >= 0)
  t.alike(footCols, legCols, 'each foot is directly under its leg')

  // The chrome must never widen the row or push the screen out of shape.
  t.ok(widest(renderMesa(game, view)) <= CANVAS.width, 'the furniture fits the canvas')
})

test('comandos: one line, only what the rules allow, and it always fits', (t) => {
  const game = stacked({
    top: card('rojo', 7),
    hands: [[card('rojo', 3), card('azul', 8)], [], [], []]
  })
  const line = commandLine(game, CANVAS.width)
  const plain = stripAnsi(line)

  t.is(plain.split('\n').length, 1, 'a single line')
  t.ok(style.width(line) <= CANVAS.width, `fits (${style.width(line)}/${CANVAS.width})`)
  t.ok(plain.includes('robar'), 'drawing is offered')
  t.ok(plain.includes('jugar') || plain.includes('tirar'), 'and playing')

  // Facing a stack, the draw key becomes "eat the stack".
  const owing = stacked({
    top: card('rojo', '+2'),
    hands: [[card('azul', 8)], [], [], []],
    pending: { count: 4, rank: '+2' }
  })
  t.ok(stripAnsi(commandLine(owing, CANVAS.width)).includes('comer 4'), 'it says how many')

  for (const phase of ['round-over', 'game-over']) {
    const over = stacked({ top: card('rojo', 7), hands: [[card('rojo', 3)], [], [], []] })
    over.phase = phase
    over.lastRound = { winner: 0, points: 10 }
    const l = commandLine(over, CANVAS.width)
    t.ok(style.width(l) <= CANVAS.width, `${phase} fits`)
  }
})

test('comandos: offers the colours only while one is being chosen', (t) => {
  const game = stacked({ top: card('rojo', 7), hands: [[card('rojo', 3)], [], [], []] })
  t.absent(stripAnsi(commandLine(game, CANVAS.width)).includes('amarillo'), 'not while playing')

  game.phase = 'choose-color'
  game.chooser = 0
  const naming = stripAnsi(commandLine(game, CANVAS.width))
  for (const color of ['rojo', 'amarillo', 'verde', 'azul']) {
    t.ok(naming.includes(color), `${color} is offered`)
  }
  t.ok(commands(game).length >= 4, 'commands() is the shared source')
})

test('partida: reports only what the score line does not', (t) => {
  const game = stacked({ top: card('rojo', 7), hands: [[card('rojo', 3)], [], [], []] })
  const drawn = stripAnsi(partidaLines(game))

  t.ok(/Turno\s+Vos/.test(drawn), 'whose turn it is')
  t.ok(/Tu mano\s+1/.test(drawn), 'and how many cards you hold')
})

test('chat: tags the speaker without repeating their name', (t) => {
  const game = stacked({
    top: card('rojo', 7),
    hands: [[card('rojo', 3), card('azul', 8)], [], [], []]
  })
  game.apply({ type: 'play', seat: 0, card: card('rojo', 3) })

  const drawn = stripAnsi(chatLines(game, 40, 6)).split('\n')
  t.is(drawn.length, 6, 'padded to the panel height')

  const played = drawn.find((line) => line.includes('tira'))
  t.ok(played.startsWith('[VOS]'), 'tagged with the speaker')
  t.absent(/\[VOS\]\s+Vos/.test(played), 'and the name is not repeated')
})

test('palette: every colour is a 256-colour index, and reaches the cards', (t) => {
  for (const [name, value] of Object.entries(palette)) {
    if (name === 'RAMP' || name === 'CARD_COLORS') continue
    t.is(typeof value, 'number', `${name} is an ANSI-256 index`)
    t.ok(value >= 16 && value <= 255, `${name} avoids the theme-dependent 0-15`)
  }

  // The four card colours have to be told apart, so they must all differ.
  const inks = Object.values(palette.CARD_COLORS)
  t.is(new Set(inks).size, 4, 'the four card colours are distinct')

  for (const color of ['rojo', 'amarillo', 'verde', 'azul']) {
    const drawn = cardsUi.big(card(color, 5))
    t.ok(/\x1b\[38;5;\d+m/.test(drawn), `${color} is drawn with a 256-colour code`)
    t.absent(/38;5;undefined/.test(drawn), `${color} resolved to a real colour`)
  }
})

test('cards: every card is exactly the same rectangle', (t) => {
  const { BIG, SMALL } = cardsUi
  const every = []
  for (const color of ['rojo', 'amarillo', 'verde', 'azul']) {
    for (let rank = 0; rank <= 9; rank++) every.push(card(color, rank))
    every.push(card(color, '+2'))
  }
  every.push({ color: null, rank: '+4' })

  for (const c of every) {
    const drawn = cardsUi.big(c).split('\n')
    const name = `${c.rank} ${c.color || 'comodín'}`
    t.is(drawn.length, BIG.height, `${name} is ${BIG.height} rows`)
    t.is(Math.max(...drawn.map(style.width)), BIG.width, `${name} is ${BIG.width} columns`)
    // A pear is two columns wide, so an off-by-one here shears the whole hand.
    t.ok(
      drawn.every((line) => style.width(line) === BIG.width),
      `${name} has no ragged row`
    )

    const compact = cardsUi.small(c).split('\n')
    t.is(Math.max(...compact.map(style.width)), SMALL.width, `${name} compact is ${SMALL.width}`)
  }
})

test('cards: the rank is printed, in the corners and the middle', (t) => {
  for (const rank of [0, 7, 9, '+2', '+4']) {
    const drawn = stripAnsi(cardsUi.big(card('rojo', rank)))
    const pattern = new RegExp(String(rank).replace('+', '\\+'), 'g')
    t.is((drawn.match(pattern) || []).length, 3, `a ${rank} shows its rank three times`)
  }
})

test('cards: a +4 is drawn as a wild, not as a colour it does not have', (t) => {
  const wild = cardsUi.big({ color: null, rank: '+4' })
  t.ok(stripAnsi(wild).includes('+4'), 'it says +4')
  t.absent(/38;5;undefined/.test(wild), 'and still has an ink')
})

test('bars: renders an exact rectangle from the glitch alphabet', (t) => {
  const rows = bars(60, 5, 0)

  t.is(rows.length, 5, 'one line per row')
  t.ok(
    rows.every((line) => style.width(line) === 60),
    'every line is exactly the requested width'
  )

  const glyphs = new Set(stripAnsi(rows.join('')).split(''))
  t.ok(
    [...glyphs].every((ch) => GLYPHS.includes(ch)),
    'drawn only from the glitch alphabet'
  )
})

test('bars: deterministic, and the rows shear past each other', (t) => {
  t.alike(bars(40, 3, 2.5), bars(40, 3, 2.5), 'the same t gives the same frame')
  t.unlike(
    stripAnsi(bars(60, 4, 0).join('\n')),
    stripAnsi(bars(60, 4, 3.2).join('\n')),
    'the pattern moves with t'
  )

  const frame = stripAnsi(bars(60, 5, 1.1).join('\n')).split('\n')
  t.ok(new Set(frame).size > 1, 'rows differ from one another')
  t.is(block(0, 0).ch, block(0, 0).ch, 'a block is stable for a given row and index')
})

test('the canvas never reflows, whatever the terminal', (t) => {
  const small = app({ width: CANVAS.width, height: CANVAS.height })
  const large = app({ width: CANVAS.width + 40, height: CANVAS.height + 12 })

  const trim = (frame) =>
    stripAnsi(frame)
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .join('\n')

  t.alike(trim(small.view()), trim(large.view()), 'same layout, only the padding changes')
})

test('deal: cards land one at a time, in turn order, and play waits for the last', async (t) => {
  // A real deal, not the instant one the other tests use.
  const model = new App({
    version: '1.0.0',
    flags: {},
    rng: seeded(4242),
    think: { canto: 0, play: 0, say: 0 }
  })
  model.update({ type: 'resize', width: CANVAS.width, height: CANVAS.height })
  model.startGame()

  t.ok(model.dealing, 'the deal is in progress')
  t.is(model.dealing.total, 20, 'twenty cards for four players')
  t.absent(model._maybeAI(), 'the AI is not handed the turn while cards are in the air')

  // Nobody has anything yet; the UNO alarm must not fire on a half-dealt hand.
  let frame = stripAnsi(model.view())
  t.absent(frame.includes('¡UNO!'), 'no false UNO during the deal')
  t.ok(frame.includes('Reparte'), 'the prompt says who is dealing')

  // Keys do nothing until the last card lands.
  model.update(press('1'))
  t.is(model.game.hands[0].length, 5, 'a keystroke mid-deal is ignored')

  // Drive the frames by hand and watch the cards arrive.
  const seen = []
  let guard = 0
  while (model.dealing && guard++ < 200) {
    model.update({ type: 'frame' })
    seen.push(model.dealing ? model.dealing.landed : 20)
  }
  t.absent(model.dealing, 'the deal finished')
  t.ok(guard < 200, `and did so in a bounded number of frames (${guard})`)
  t.ok(
    seen.every((n, i) => i === 0 || n >= seen[i - 1]),
    'cards only ever land, never un-land'
  )

  // Everything is back to normal once the last card is down.
  frame = stripAnsi(model.view())
  t.absent(frame.includes('Reparte'), 'the deal prompt is gone')
  t.ok(frame.includes('['), 'and the commands are back')
})

test('deal: a new round deals again, and escape abandons it cleanly', (t) => {
  const model = new App({
    version: '1.0.0',
    flags: {},
    rng: seeded(7),
    think: { canto: 0, play: 0, say: 0 }
  })
  model.update({ type: 'resize', width: CANVAS.width, height: CANVAS.height })
  model.startGame()
  t.ok(model.dealing, 'first round deals')

  model.update(press('escape'))
  t.is(model.screen, 'menu', 'escape still works mid-deal')
  t.is(model.dealing, null, 'and clears the deal rather than leaving it ticking')
})

test('animation: runs on the menu and while rivals think, not on your turn', (t) => {
  const model = app()
  t.ok(model._animating(), 'the menu bars animate')

  model.startGame()
  model.game.turn = 0
  model.game.phase = 'play'
  t.absent(model._animating(), 'nothing animates while it is your move')

  model.game.turn = 1
  t.ok(model._animating(), 'the spinner animates while a rival thinks')

  model.screen = 'rules'
  t.absent(model._animating(), 'the rules card is still')
})

test('menu: two buttons, arrows switch, CREATE deals, JOIN says there is no room yet', (t) => {
  const model = app()
  t.is(model.screen, 'menu', 'starts at the menu')
  t.is(model.menuIndex, 0, 'CREATE ROOM has the focus')

  const frame = stripAnsi(model.view())
  t.ok(frame.includes('▸ C R E A T E   R O O M ◂'), 'the focused button wears the arrows')
  t.ok(frame.includes('J O I N   R O O M'), 'the other is drawn plain')

  model.update(press('right'))
  t.is(model.menuIndex, 1, 'right moves to JOIN')
  model.update(press('left'))
  t.is(model.menuIndex, 0, 'left moves back')
  model.update(press('right'))
  model.update(press('right'))
  t.is(model.menuIndex, 0, 'and it wraps rather than running off the end')

  // No network yet: JOIN must say so, not pretend.
  model.menuIndex = 1
  model.update(press('enter'))
  t.is(model.screen, 'menu', 'JOIN stays on the menu')
  t.ok(model.message && model.message.includes('salas'), 'and says there is no room to join')

  model.menuIndex = 0
  model.update(press('enter'))
  t.is(model.screen, 'game', 'CREATE ROOM deals')
  t.is(model.game.playerCount, 4, 'four at the table by default')
})

test('menu: the pear turns as frames advance, and the title arches', (t) => {
  const { archText } = require('../lib/ui/menu')
  const model = app()

  const a = stripAnsi(model.view())
  model.frame = 12
  const b = stripAnsi(model.view())
  t.unlike(a, b, 'the menu redraws differently as the pear spins')
  t.is(lines(b).length, CANVAS.height, 'and stays exactly the canvas height')

  // The arch: the end letters sit lower than the middle ones. Measure the row
  // each letter's topmost ink appears on, scanning the letter's whole column
  // span — a single column can hit a gap inside a glyph.
  const arch = archText('PEAR', 2)
  t.ok(
    arch.every((r) => r.length === arch[0].length),
    'every row is the same width'
  )
  const topRow = (from, to) => arch.findIndex((r) => r.slice(from, to + 1).trim().length > 0)
  const P = topRow(0, 4)
  const E = topRow(6, 10)
  const A = topRow(12, 16)
  const R = topRow(18, 22)
  t.ok(P > E, `P (row ${P}) starts below E (row ${E})`)
  t.ok(R > A, `R (row ${R}) starts below A (row ${A})`)
  t.is(E, A, 'the two middle letters sit level')
})

test('menu: rules screen opens and closes', (t) => {
  const model = app()
  model.update(press('r')) // rules live on a key now, not a menu row
  t.is(model.screen, 'rules', 'rules opened')

  const frame = stripAnsi(model.view())
  t.ok(frame.includes('REGLAS'), 'and it renders')
  t.ok(frame.includes('+4'), 'covering the cards this deck actually has')

  model.update(press('escape'))
  t.is(model.screen, 'menu', 'escape goes back')
})

test('updater progress reaches the screen instead of stdout', (t) => {
  const model = app()
  model.update({ type: 'log', level: 'info', line: '[updater] getting new update' })

  t.ok(model.updateStatus, 'the status was captured')
  model.update({ type: 'update-status', text: '✓ v1.0.1 lista', color: 231 })
  t.ok(stripAnsi(model.view()).includes('v1.0.1'), 'the applied-update banner shows')
})

test('program: draws the menu and quits cleanly on ctrl+c', async (t) => {
  const chunks = []
  const output = new Writable({
    write(data, enc, cb) {
      chunks.push(Buffer.from(data))
      cb()
    }
  })
  const input = new PassThrough()

  const model = new App({
    version: '1.0.0',
    flags: {},
    rng: seeded(9),
    think: { canto: 0, play: 0, say: 0, deal: 0 }
  })
  const program = new Program(model, {
    input,
    output,
    isTTY: true,
    width: CANVAS.width,
    height: CANVAS.height,
    fps: 0
  })

  const done = program.run()
  await new Promise((resolve) => setTimeout(resolve, 15))

  input.write('\x03') // ctrl+c
  await done

  const drawn = Buffer.concat(chunks).toString('utf8')
  t.ok(drawn.length > 0, 'the program drew something')
  t.ok(drawn.includes('C R E A T E   R O O M'), 'it drew the menu')
})

test('program: plays a card through the real key decoder', async (t) => {
  const chunks = []
  const output = new Writable({
    write(data, enc, cb) {
      chunks.push(Buffer.from(data))
      cb()
    }
  })
  const input = new PassThrough()

  const model = new App({
    version: '1.0.0',
    flags: { jugar: true },
    rng: seeded(3),
    think: { canto: 0, play: 0, say: 0, deal: 0 }
  })
  const program = new Program(model, {
    input,
    output,
    isTTY: true,
    width: CANVAS.width,
    height: CANVAS.height,
    fps: 0
  })

  const done = program.run()
  await new Promise((resolve) => setTimeout(resolve, 15))

  t.is(model.screen, 'game', '--jugar dealt straight away')

  // Force a hand and a pile so the keystroke has a legal move to make.
  model.game.hands[0] = [card('rojo', 3), card('azul', 8)]
  model.game.discard = [card('rojo', 7)]
  model.game.activeColor = 'rojo'
  model.game.pending = null
  model.game.turn = 0
  model.game.phase = 'play'

  input.write('1')
  await new Promise((resolve) => setTimeout(resolve, 30))
  t.is(model.game.hands[0].length, 1, 'the keystroke played a card')

  input.write('\x03')
  await done
  t.pass('and the program shut down')
})
