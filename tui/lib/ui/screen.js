// The table screen.
//
//   PARTIDA │ CHAT / LOG          <- the little that is not on the felt
//              Coco
//   Nacho  ╭ mazo · descarte ╮  Rita
//              Vos
//           tus cartas
//   [1-9] jugar · [D] robar · …   <- every command, one line
//
// Pure: every function takes the game plus a view-state bag and returns a
// string, drawn at the fixed canvas size. Nothing here reads the terminal or
// reflows, which is what lets the tests assert on exact frames.
const { style } = require('../tea')
const cards = require('./cards')
const { SKY, LIGHT, BLUE, MID, STRONG, WHITE, CARD_COLORS } = require('./palette')
const { CANVAS, COLUMNS, pad, fit } = require('./canvas')

// Frames of the spinner shown while the rivals are thinking.
const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

const FELT = 46
const FLANK = 12

// The table's carpentry. Browns for the wood, a dark grey for the floor and
// the shadow — none of them a card colour, so the table never looks like a
// card.
const WOOD = 130 // #af5f00
const WOOD_DARK = 94 // #875f00
const FLOOR = 238 // #444444
const SHADOW = 236 // #303030

function stack(...blocks) {
  return blocks.filter((b) => b !== null && b !== undefined).join('\n')
}

// During the deal the cards are handed out one at a time round the table, so a
// seat shows only what has reached it so far. `view.dealt` is how many cards
// have been dealt in total; undefined once the deal is over.
function dealtTo(game, seat, view) {
  const hand = game.hands[seat].length
  if (view.dealt === undefined) return hand
  const round = game.playerCount
  const full = Math.floor(view.dealt / round)
  const extra = view.dealt % round
  // Cards go out starting left of the dealer, the same order the turn moves.
  const order = (seat - game.nextSeat(game.dealer) + round) % round
  return Math.min(hand, full + (order < extra ? 1 : 0))
}

// The card that is in the air right now, if one is: which seat it is flying
// to, and how far along the way it has got (0..1).
function inFlight(game, view) {
  if (view.dealt === undefined || view.flight === undefined) return null
  const round = game.playerCount
  const seat = (game.nextSeat(game.dealer) + (view.dealt % round)) % round
  return { seat, t: view.flight }
}

// A titled box of an exact size, so the columns line up whatever is inside.
function panel(title, body, width, height, opts = {}) {
  const inner = width - 2
  const heading = style()
    .bold(true)
    .foreground(opts.tone || SKY)
    .render(title)

  const lines = [pad(heading, inner), ...String(body).split('\n')]
    .slice(0, height - 2)
    .map((line) => pad(line, inner, 'left'))

  while (lines.length < height - 2) lines.push(' '.repeat(inner))

  return style()
    .border(style.borders.rounded)
    .borderForeground(opts.tone || MID)
    .render(lines.join('\n'))
}

// --- seats ---------------------------------------------------------------

// A seat as one line: who they are, how many cards they hold, what they said.
function seatLine(game, seat, view) {
  const player = game.players[seat]
  const onTurn = view.dealt === undefined && game.currentActor() === seat
  const count = dealtTo(game, seat, view)

  const name = onTurn
    ? style().bold(true).foreground(SKY).render(`▶ ${player.name}`)
    : style()
        .foreground(count === 1 ? LIGHT : WHITE)
        .render(player.name)

  // One card left is the thing everyone at the table is watching for — but not
  // while the deal is still handing cards out.
  const alarm =
    count === 1 && view.dealt === undefined
      ? style().bold(true).foreground(SKY).render(' ¡UNO!')
      : ''
  const said = view.says && view.says[seat]
  const bubble = said ? '  ' + style().italic(true).foreground(SKY).render(`«${said}»`) : ''

  return `${name} ${cards.backsInline(count)}${alarm}${bubble}`
}

function flankLine(game, seat, view, align) {
  const player = game.players[seat]
  const onTurn = view.dealt === undefined && game.currentActor() === seat
  const count = dealtTo(game, seat, view)

  const name = onTurn
    ? style().bold(true).foreground(SKY).render(player.name)
    : style()
        .foreground(count === 1 ? LIGHT : WHITE)
        .render(player.name)

  const rows = [name, cards.backsInline(count)]
  if (count === 1 && view.dealt === undefined) {
    rows.push(style().bold(true).foreground(SKY).render('¡UNO!'))
  }
  const said = view.says && view.says[seat]
  if (said) rows.push(style().italic(true).foreground(SKY).render(`«${said}»`))

  return rows.map((r) => pad(style.truncate(r, FLANK), FLANK, align)).join('\n')
}

// A flank centred on the felt's rows. Built to a fixed height so the seat
// stays put whether or not it has a ¡UNO! or a speech bubble that frame.
function flankBeside(game, seat, view, align) {
  const rows = flankLine(game, seat, view, align).split('\n')
  const feltRows = 7 // border + 4 content rows + stack line + border
  const top = Math.max(0, Math.floor((feltRows - rows.length) / 2))
  const out = []
  for (let i = 0; i < top; i++) out.push(' '.repeat(FLANK))
  out.push(...rows)
  return out.join('\n')
}

// --- the felt ------------------------------------------------------------

// The middle of the table: the draw pile, the discard pile, and the colour in
// play — which after a +4 is not the colour of the card showing, so it gets a
// swatch of its own rather than being left to inference.
function feltBlock(game, view) {
  const inner = FELT - 2
  const W = 14

  // Three columns of exactly four rows, so they line up whatever is in them.
  const column = (title, body) => {
    const lines = [pad(style().faint(true).render(title), W)]
    for (const line of String(body).split('\n')) lines.push(pad(line, W))
    while (lines.length < 4) lines.push(' '.repeat(W))
    return lines.slice(0, 4).join('\n')
  }

  // While dealing, the pile is visibly still giving cards away.
  const left =
    view.dealt === undefined
      ? game.draw.length
      : game.draw.length + (game.playerCount * 5 - view.dealt)
  const mazo = column(`MAZO ${left}`, cards.smallBack())
  const descarte = column(
    'DESCARTE',
    view.dealt === undefined ? cards.small(game.top) : cards.smallEmpty()
  )
  const color = column(
    'COLOR',
    view.dealt === undefined
      ? stack(
          cards.colorChip(game.activeColor),
          style()
            .foreground(game.activeColor ? CARD_COLORS[game.activeColor] : WHITE)
            .render(game.activeColor || '—')
        )
      : cards.colorChip(null)
  )

  const middle = style.joinHorizontal(style.position.top, mazo, descarte, color)

  const top = ['╭' + '─'.repeat(inner) + '╮']
  for (const line of middle.split('\n')) top.push(pad(line, inner))
  top.push(pad(view.dealt === undefined ? stackLine(game) : dealLine(game, view), inner))
  top.push('╰' + '─'.repeat(inner) + '╯')

  return tableSprite(top.join('\n'))
}

// Dress the table top as a piece of furniture. The top is drawn by the caller
// and carries all the game state; everything added here is pure chrome, which
// is what keeps the game logic out of the carpentry.
//
//   ╭──────────────────╮   <- the felt (from the caller)
//   ╰──────────────────╯
//   ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀   <- the rim: the thickness of the wood
//      ║            ║      <- legs
//      ║            ║
//    ▁▁╨▁▁▁▁▁▁▁▁▁▁▁▁╨▁▁    <- feet on the floor, and the floor itself
//      ░░░░░░░░░░░░░░      <- shadow under the table
function tableSprite(top) {
  const lines = top.split('\n')
  const width = style.width(lines[0])

  // The rim sits one cell in from each edge, like a bevel seen from above.
  const rim = style()
    .foreground(WOOD_DARK)
    .render(' ' + '▀'.repeat(width - 2) + ' ')

  // Legs a fifth of the way in from each side, bold so they read as solid.
  const legAt = Math.max(2, Math.floor(width / 5))
  const legRow = () => {
    const leg = style().bold(true).foreground(WOOD).render('║')
    const gap = width - 2 * legAt - 2
    return ' '.repeat(legAt) + leg + ' '.repeat(gap) + leg + ' '.repeat(legAt)
  }

  // Feet meet the floor line; the floor runs the full width of the table.
  const foot = style().bold(true).foreground(WOOD).render('╨')
  const floorInk = style().foreground(FLOOR)
  const floor =
    floorInk.render('▁'.repeat(legAt)) +
    foot +
    floorInk.render('▁'.repeat(width - 2 * legAt - 2)) +
    foot +
    floorInk.render('▁'.repeat(legAt))

  // A soft shadow under the top, narrower than the table, so it looks lit
  // from above rather than painted on.
  const shadowW = width - 6
  const shadow =
    ' '.repeat(3) + style().foreground(SHADOW).render('░'.repeat(shadowW)) + ' '.repeat(3)

  return [...lines, rim, legRow(), legRow(), floor, shadow].join('\n')
}

// The bottom line of the felt during the deal: a card sliding from the pile
// towards whoever it is for, with the pile on the left and the seat's name on
// the right.
function dealLine(game, view) {
  const flight = inFlight(game, view)
  if (!flight) return style().faint(true).render('repartiendo…')

  const name = game.players[flight.seat].name
  const track = 22
  const at = Math.round(flight.t * (track - 1))

  let lane = ''
  for (let i = 0; i < track; i++) lane += i === at ? '▚' : '·'

  return (
    style().faint(true).render('mazo ') +
    style().foreground(MID).render(lane.slice(0, at)) +
    style().bold(true).foreground(SKY).render('▚') +
    style()
      .faint(true)
      .render(lane.slice(at + 1)) +
    style().faint(true).render(' ▶ ') +
    style().bold(true).foreground(SKY).render(name)
  )
}

// A live +2/+4 stack is the most urgent thing on the table.
function stackLine(game) {
  if (!game.pending) return style().faint(true).render('sin deudas')
  return style()
    .bold(true)
    .foreground(SKY)
    .render(`▲ ${game.pending.count} cartas en juego (${game.pending.rank})`)
}

function renderMesa(game, view) {
  const w = CANVAS.width
  // The flanks sit level with the felt, not with the legs: the felt is the
  // first rows of the sprite, so a top-aligned join puts the seat beside it
  // and lets the carpentry hang below on its own.
  const sprite = feltBlock(game, view)
  const table = style.joinHorizontal(
    style.position.top,
    flankBeside(game, 3, view, 'right'),
    ' ',
    sprite,
    ' ',
    flankBeside(game, 1, view, 'left')
  )

  return stack(pad(seatLine(game, 2, view), w), pad(table, w), pad(seatLine(game, 0, view), w))
}

// --- panels --------------------------------------------------------------

// Only what the score line does not already carry.
function partidaLines(game) {
  const actor = game.currentActor()
  const rows = [
    ['Turno', actor === null ? '—' : game.players[actor].name],
    ['Ronda', `${game.roundNumber} · a ${game.target}`],
    ['Tu mano', `${game.hands[0].length} cartas`]
  ]

  return rows
    .map(
      ([term, value]) =>
        style().foreground(WHITE).render(term.padEnd(9)) +
        style().bold(true).foreground(SKY).render(value)
    )
    .join('\n')
}

// The running feed, tagged by who said it.
function chatLines(game, width, height) {
  const lines = []

  for (const event of game.events.slice(-height * 2)) {
    const who =
      event.seat === null || event.seat === undefined ? 'MESA' : game.players[event.seat].name
    const tone =
      event.kind === 'score'
        ? SKY
        : event.kind === 'canto'
          ? LIGHT
          : event.kind === 'over'
            ? SKY
            : WHITE

    const said = event.text.replace(new RegExp(`^${who}:?\\s*`), '')
    const tag = style()
      .foreground(event.kind === 'score' ? SKY : BLUE)
      .render(`[${who.toUpperCase()}]`)
    const room = Math.max(6, width - style.width(tag) - 1)
    lines.push(`${tag} ${style().foreground(tone).render(style.truncate(said, room))}`)
  }

  const tail = lines.slice(-height)
  while (tail.length < height) tail.push('')
  return tail.join('\n')
}

// Your hand, the selected card lifted, numbered like the keys that play it.
// A hand grows well past the five it was dealt when stacks land on you, so it
// is capped at what the canvas holds and the overflow is counted, not drawn.
// Cards are 7 columns wide, so thirteen of them plus their gaps is what the
// canvas holds. A hand still grows past that when stacks land on you, so the
// window scrolls to follow the selection — every card stays reachable with the
// arrows even when it is not on screen.
const HAND_SLOTS = 13

function handWindow(total, selected) {
  if (total <= HAND_SLOTS) return 0
  const start = Math.min(Math.max(0, selected - Math.floor(HAND_SLOTS / 2)), total - HAND_SLOTS)
  return Math.max(0, start)
}

function handLines(game, view) {
  // During the deal you see only what has reached you, face up as it lands.
  const hand = game.hands[0].slice(0, dealtTo(game, 0, view))
  const yours = view.dealt === undefined && game.currentActor() === 0 && game.phase === 'play'

  if (hand.length === 0) {
    const text = view.dealt === undefined ? '(sin cartas)' : 'repartiendo…'
    return pad(style().faint(true).render(text), CANVAS.width)
  }

  const from = handWindow(hand.length, view.selected || 0)
  const shown = hand.slice(from, from + HAND_SLOTS)

  const blocks = shown.map((card, i) =>
    cards.big(card, { selected: yours && from + i === view.selected, dim: !yours })
  )

  const row = style.joinHorizontal(style.position.top, ...interleave(blocks, ' '))
  const numbers = shown
    .map((_, i) => {
      const at = from + i
      const tone = yours && at === view.selected ? SKY : STRONG
      return style()
        .foreground(tone)
        .render(pad(at < 9 ? `[${at + 1}]` : '·', cards.BIG.width))
    })
    .join(' ')

  // Say what is off-screen rather than pretending the hand is only this long.
  const hidden = hand.length - shown.length
  const more = hidden > 0 ? style().faint(true).render(`  +${hidden} fuera de vista`) : ''

  return stack(pad(row, CANVAS.width), pad(numbers + more, CANVAS.width))
}

function interleave(blocks, sep) {
  const out = []
  blocks.forEach((b, i) => {
    if (i > 0) out.push(sep)
    out.push(b)
  })
  return out
}

// --- chrome --------------------------------------------------------------

function renderHeader(game, view, width) {
  const title =
    style().foreground(MID).render(`${cards.PEAR}  `) +
    style().bold(true).foreground(WHITE).render('THE GREAT PEAR')

  const status = view.updateStatus
    ? style().foreground(view.updateStatus.color).render(view.updateStatus.text)
    : style().faint(true).render(`v${view.version}`)

  const room = width - style.width(title) - style.width(status)
  return title + ' '.repeat(Math.max(1, room)) + status
}

// Everyone's score on one line — there are no teams in UNO.
function renderScore(game, width) {
  const best = Math.max(...game.scores)
  const parts = game.players.map((p, seat) => {
    const tone = seat === 0 ? SKY : game.scores[seat] === best && best > 0 ? LIGHT : WHITE
    return (
      style().foreground(tone).render(`${p.name} `) +
      style().bold(true).foreground(tone).render(String(game.scores[seat]))
    )
  })

  const left = ' ' + parts.join(style().faint(true).render('  ·  '))
  const right = style().faint(true).render(`ronda ${game.roundNumber} · a ${game.target} `)
  const room = width - style.width(left) - style.width(right)
  return left + ' '.repeat(Math.max(1, room)) + right
}

// --- commands ------------------------------------------------------------

// What you can do right now, as [key, label] pairs, taken straight from the
// engine's legal actions so the list can never drift from the rules.
function commands(game) {
  if (game.phase === 'game-over') {
    return [
      ['ENTER', 'menú'],
      ['ESC', 'salir']
    ]
  }
  if (game.phase === 'round-over') {
    return [
      ['ENTER', 'seguir'],
      ['ESC', 'menú']
    ]
  }

  const actions = game.legalActions(0)
  if (actions.length === 0) return []

  const has = (type) => actions.some((a) => a.type === type)
  const rows = []

  if (has('color')) {
    rows.push(['R', 'rojo'], ['A', 'amarillo'], ['V', 'verde'], ['Z', 'azul'])
  } else {
    if (has('play')) rows.push(['1-9', 'jugar'], ['←/→', 'elegir'], ['ENTER', 'tirar'])
    if (has('draw')) rows.push(['D', 'robar'])
    if (has('take')) rows.push(['D', `comer ${game.pending.count}`])
    if (has('pass')) rows.push(['P', 'pasar'])
  }

  if (has('uno')) rows.push(['U', game.unoWindow.seat === 0 ? '¡UNO!' : 'pescar'])
  rows.push(['ESC', 'menú'])
  return rows
}

// One line under the hand. If the full set does not fit, the softest hints go
// before the ones that actually move the game on.
const OPTIONAL = ['elegir', 'jugar']

function commandLine(game, width, view = {}) {
  if (view.dealt !== undefined) return ''
  let rows = commands(game)
  if (rows.length === 0) return ''

  const render = (list) =>
    list
      .map(
        ([k, label]) =>
          style().bold(true).foreground(SKY).render(`[${k}]`) +
          style()
            .foreground(WHITE)
            .render(' ' + label)
      )
      .join(style().faint(true).render(' · '))

  let line = render(rows)
  for (const drop of OPTIONAL) {
    if (style.width(line) + 2 <= width) break
    rows = rows.filter(([, label]) => label !== drop)
    line = render(rows)
  }

  return '  ' + style.truncate(line, width - 2)
}

// The line that says what the game is waiting for.
function renderPrompt(game, view) {
  if (view.dealt !== undefined) {
    return style().foreground(WHITE).render(`  Reparte ${game.players[game.dealer].name}…`)
  }

  if (game.phase === 'game-over') {
    const won = game.winner() === 0
    return style()
      .bold(true)
      .foreground(won ? SKY : MID)
      .render(
        won
          ? '  ¡GANASTE LA PARTIDA!  ENTER para volver al menú'
          : `  Ganó ${game.players[game.winner()].name}.  ENTER para volver al menú`
      )
  }

  if (game.phase === 'round-over') {
    const { winner, points } = game.lastRound || {}
    return style()
      .foreground(LIGHT)
      .render(`  ${game.players[winner].name} se fue con ${points} puntos · ENTER para seguir`)
  }

  if (game.phase === 'choose-color' && game.chooser === 0) {
    return style().bold(true).foreground(SKY).render('  Elegí el color que sigue')
  }

  if (game.currentActor() !== 0) {
    const spin = SPINNER[Math.floor((view.frame || 0) / 2) % SPINNER.length]
    const name = game.players[game.currentActor()].name
    return (
      style().foreground(SKY).render(`  ${spin} `) +
      style().foreground(WHITE).render(`${name} está pensando…`)
    )
  }

  if (view.message) {
    return style()
      .bold(true)
      .foreground(SKY)
      .render('  ' + view.message)
  }

  if (game.pending) {
    return style()
      .bold(true)
      .foreground(SKY)
      .render(`  Te caen ${game.pending.count} — respondé con ${game.pending.rank} o comelas`)
  }

  return style().foreground(WHITE).render('  Tu turno.')
}

// --- the whole frame -----------------------------------------------------

const TOP = { partida: 34, chat: 84, rows: 7 }

function renderGame(game, view) {
  const width = CANVAS.width

  const top = style.joinHorizontal(
    style.position.top,
    panel('PARTIDA', partidaLines(game), TOP.partida, TOP.rows),
    ' '.repeat(COLUMNS.gutter),
    panel('CHAT / LOG', chatLines(game, TOP.chat - 2, TOP.rows - 3), TOP.chat, TOP.rows)
  )

  const body = stack(
    renderHeader(game, view, width),
    renderScore(game, width),
    '',
    pad(top, width),
    '',
    renderMesa(game, view),
    '',
    handLines(game, view)
  ).split('\n')

  const foot = [renderPrompt(game, view), commandLine(game, width, view)]
  const gap = Math.max(0, CANVAS.height - body.length - foot.length)

  return fit([...body, ...Array(gap).fill(''), ...foot].join('\n'))
}

module.exports = {
  renderGame,
  renderMesa,
  renderPrompt,
  commands,
  commandLine,
  partidaLines,
  chatLines,
  handLines,
  panel,
  FELT
}
