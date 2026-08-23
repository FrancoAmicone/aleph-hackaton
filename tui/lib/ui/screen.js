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

function stack(...blocks) {
  return blocks.filter((b) => b !== null && b !== undefined).join('\n')
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
  const onTurn = game.currentActor() === seat
  const count = game.hands[seat].length

  const name = onTurn
    ? style().bold(true).foreground(SKY).render(`▶ ${player.name}`)
    : style()
        .foreground(count === 1 ? LIGHT : WHITE)
        .render(player.name)

  // One card left is the thing everyone at the table is watching for.
  const alarm = count === 1 ? style().bold(true).foreground(SKY).render(' ¡UNO!') : ''
  const said = view.says && view.says[seat]
  const bubble = said ? '  ' + style().italic(true).foreground(SKY).render(`«${said}»`) : ''

  return `${name} ${cards.backsInline(count)}${alarm}${bubble}`
}

function flankLine(game, seat, view, align) {
  const player = game.players[seat]
  const onTurn = game.currentActor() === seat
  const count = game.hands[seat].length

  const name = onTurn
    ? style().bold(true).foreground(SKY).render(player.name)
    : style()
        .foreground(count === 1 ? LIGHT : WHITE)
        .render(player.name)

  const rows = [name, cards.backsInline(count)]
  if (count === 1) rows.push(style().bold(true).foreground(SKY).render('¡UNO!'))
  const said = view.says && view.says[seat]
  if (said) rows.push(style().italic(true).foreground(SKY).render(`«${said}»`))

  return rows.map((r) => pad(style.truncate(r, FLANK), FLANK, align)).join('\n')
}

// --- the felt ------------------------------------------------------------

// The middle of the table: the draw pile, the discard pile, and the colour in
// play — which after a +4 is not the colour of the card showing, so it gets a
// swatch of its own rather than being left to inference.
function feltBlock(game) {
  const inner = FELT - 2
  const W = 14

  // Three columns of exactly four rows, so they line up whatever is in them.
  const column = (title, body) => {
    const lines = [pad(style().faint(true).render(title), W)]
    for (const line of String(body).split('\n')) lines.push(pad(line, W))
    while (lines.length < 4) lines.push(' '.repeat(W))
    return lines.slice(0, 4).join('\n')
  }

  const mazo = column(`MAZO ${game.draw.length}`, cards.smallBack())
  const descarte = column('DESCARTE', cards.small(game.top))
  const color = column(
    'COLOR',
    stack(
      cards.colorChip(game.activeColor),
      style()
        .foreground(game.activeColor ? CARD_COLORS[game.activeColor] : WHITE)
        .render(game.activeColor || '—')
    )
  )

  const middle = style.joinHorizontal(style.position.top, mazo, descarte, color)

  const rows = ['╭' + '─'.repeat(inner) + '╮']
  for (const line of middle.split('\n')) rows.push(pad(line, inner))
  rows.push(pad(stackLine(game), inner))
  rows.push('╰' + '─'.repeat(inner) + '╯')
  return rows.join('\n')
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
  const table = style.joinHorizontal(
    style.position.center,
    flankLine(game, 3, view, 'right'),
    ' ',
    feltBlock(game),
    ' ',
    flankLine(game, 1, view, 'left')
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
  const hand = game.hands[0]
  const yours = game.currentActor() === 0 && game.phase === 'play'

  if (hand.length === 0) return pad(style().faint(true).render('(sin cartas)'), CANVAS.width)

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

function commandLine(game, width) {
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

  const foot = [renderPrompt(game, view), commandLine(game, width)]
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
