// The table screen.
//
//   PARTIDA │ CHAT / LOG          <- the little that is not on the felt
//              Coco
//   Nacho  ╭ deck · discard ╮  Rita
//              You
//           your cards
//   [1-9] play · [D] draw · …   <- every command, one line
//
// Pure: every function takes the game plus a view-state bag and returns a
// string, drawn at the fixed canvas size. Nothing here reads the terminal or
// reflows, which is what lets the tests assert on exact frames.
const { style } = require('../tea')
const cards = require('./cards')
const { SKY, LIGHT, BLUE, MID, STRONG, WHITE, CARD_COLORS } = require('./palette')

const { COLOR_NAMES } = require('../uno/deck')
const { CANVAS, pad, fit } = require('./canvas')

// Frames of the spinner shown while the rivals are thinking.
const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

const FELT = 46
const FLANK = 12

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
      ? style().bold(true).foreground(SKY).render(' UNO!')
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
    rows.push(style().bold(true).foreground(SKY).render('UNO!'))
  }
  const said = view.says && view.says[seat]
  if (said) rows.push(style().italic(true).foreground(SKY).render(`«${said}»`))

  return rows.map((r) => pad(style.truncate(r, FLANK), FLANK, align)).join('\n')
}

// A flank centred on the felt's rows. Built to a fixed height so the seat
// stays put whether or not it has a UNO! or a speech bubble that frame.
function flankBeside(game, seat, view, align) {
  const rows = flankLine(game, seat, view, align).split('\n')
  const feltRows = TABLE_ROWS
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
// The table is round: an ellipse drawn row by row, the felt inside it. Each
// row's half-width comes from the ellipse equation, so the edge is smooth at
// the top and bottom and widest in the middle, where the cards sit.
// Sized to look ROUND, not just closed. A terminal cell is about twice as
// tall as wide, so a circle needs roughly twice as many columns as rows.
// 46 wide by 23 tall is a 1:1 visual aspect, and 23 rows keeps the jump
// between consecutive rows small enough that the edge reads as a curve
// rather than a staircase.
const TABLE_ROWS = 23
const TABLE_HALF_W = 23

// Half-width of an ellipse at a given row, for a horizontal radius `a` and a
// vertical radius `b`.
function ellipseHalfWidth(row, a, b, rows) {
  const y = row - (rows - 1) / 2
  if (Math.abs(y) >= b) return 0
  return Math.max(0, Math.round(a * Math.sqrt(1 - (y * y) / (b * b))))
}

// The ring is the outer ellipse minus an inner one shrunk on BOTH axes. Near
// the top and bottom the inner ellipse runs out before the outer does, so
// the band widens until the two sides meet — the ring closes as a curve,
// with no flat cap drawn anywhere. RING_W is the thickness at the sides.
const RING_W = 3

function tableRow(row) {
  const b = (TABLE_ROWS - 1) / 2
  const outer = ellipseHalfWidth(row, TABLE_HALF_W, b, TABLE_ROWS)
  const inner = ellipseHalfWidth(row, TABLE_HALF_W - RING_W, b - RING_W / 2, TABLE_ROWS)
  return { outer, inner }
}

// Exactly `span` visible columns: content centred, then cut or padded to fit.
// pad() alone can overshoot when the content is wider than the span, which
// is what pushed the right side of the ring off-centre.
function hole_(content, span) {
  const w = style.width(content)
  if (w > span) return style.truncate(content, span)
  const left = Math.floor((span - w) / 2)
  return ' '.repeat(left) + content + ' '.repeat(span - w - left)
}

function feltBlock(game, view) {
  const width = TABLE_HALF_W * 2
  const dealing = view.dealt !== undefined

  // What goes on the felt, centred: the pile, the discard (full size), the
  // colour chip — one block, then laid over the ellipse rows.
  const pileCount = dealing
    ? game.draw.length + (game.playerCount * 5 - view.dealt)
    : game.draw.length
  const mazo = stack(
    pad(style().faint(true).render(`DECK ${pileCount}`), 9),
    pad(cards.bigBack(), 9)
  )

  // During the deal there is no discard and no colour in play yet, and the
  // cards need clear lanes to fly through — so the felt shows only the deck at
  // its centre, the source every card is thrown from. Once play begins the
  // full three-column dashboard comes back.
  let inner
  let status
  if (dealing) {
    inner = mazo
    status = ''
  } else {
    const descarte = stack(
      pad(style().faint(true).render('DISCARD'), 9),
      pad(cards.big(game.top), 9)
    )
    const colorLabel = COLOR_NAMES[game.activeColor] || '—'
    const color = stack(
      pad(style().faint(true).render('COLOR'), 9),
      '',
      pad(cards.colorChip(game.activeColor), 9),
      pad(
        style()
          .foreground(game.activeColor ? CARD_COLORS[game.activeColor] : WHITE)
          .render(colorLabel),
        9
      )
    )
    // 9 + 2 + 9 + 2 + 9 = 31 columns, inside the 32-column hole at its widest.
    inner = style.joinHorizontal(style.position.top, mazo, '  ', descarte, '  ', color)
    status = stackLine(game)
  }
  const innerRows = inner.split('\n')

  // Lay the content into the hole's middle rows, the status line under it.
  const contentTop = Math.floor((TABLE_ROWS - innerRows.length - 2) / 2) + 1
  // The table edge is white: structural chrome, not a card and not an accent.
  const ring = style().foreground(WHITE)
  const rows = []
  // The table-grid row each output line stands for, so the flying card can be
  // stamped by position: rows at the very top and bottom are skipped, so output
  // index and grid row are not the same thing.
  const rowR = []
  for (let r = 0; r < TABLE_ROWS; r++) {
    const { outer, inner: hole } = tableRow(r)
    if (outer === 0) continue
    const side = ' '.repeat(TABLE_HALF_W - outer)
    if (hole === 0) {
      rows.push(side + ring.render('█'.repeat(outer * 2)) + side)
      rowR.push(r)
      continue
    }
    const band = outer - hole
    const span = hole * 2
    const ci = r - contentTop
    let body
    if (ci >= 0 && ci < innerRows.length) body = innerRows[ci]
    else if (ci === innerRows.length + 1) body = status
    else body = ''
    // The hole must be EXACTLY `span` wide regardless of what is in it, or the
    // right-hand ring drifts by however much the content over- or undershoots
    // the centre. Centre the content, then hard-cut the result to the span.
    body = hole_(body, span)
    rows.push(side + ring.render('█'.repeat(band)) + body + ring.render('█'.repeat(band)) + side)
    rowR.push(r)
  }
  if (dealing) stampFlyingCard(rows, rowR, game, view)
  return tableSprite(rows.join('\n'))
}

// --- the flying card -----------------------------------------------------

// The card grows as it travels, from a slip at the centre to a full-size back
// as it reaches the hand — the closer it gets, the bigger it reads. Each size
// is a plain sprite; the largest whose threshold `t` has passed is drawn.
const FLY_SIZES = [
  { at: 0.0, lines: ['┌─┐', '└─┘'] },
  { at: 0.4, lines: ['┌───┐', '│▚▚▚│', '└───┘'] },
  { at: 0.72, lines: ['┌─────┐', '│▚▚▚▚▚│', '│▚▚▚▚▚│', '└─────┘'] }
]

// While the deck deals, one card is always on its way from the centre of the
// felt out to the seat about to receive it. It is drawn as a sprite laid over
// the felt at the interpolated point between the middle and that seat's side of
// the table — down to you, up to the far seat, out to the flanks — swelling and
// brightening the whole way so it clearly arrives rather than fades out.
function stampFlyingCard(rows, rowR, game, view) {
  const flight = inFlight(game, view)
  if (!flight) return

  const n = game.playerCount
  const offset = (flight.seat - (view.me ?? 0) + n) % n
  const t = Math.max(0, Math.min(1, flight.t))

  // The centre of the hole, and how far a card travels before it reaches the
  // seat — kept short of the ring so even the full-size sprite clears the edge.
  const centreR = Math.floor((TABLE_ROWS - 1) / 2)
  const centreC = TABLE_HALF_W
  const REACH_R = 6
  const REACH_C = 15

  let r = centreR
  let c = centreC
  if (offset === 0)
    r = Math.round(centreR + REACH_R * t) // you, below
  else if (offset === 2)
    r = Math.round(centreR - REACH_R * t) // across, above
  else if (offset === 1)
    c = Math.round(centreC + REACH_C * t) // right flank
  else if (offset === 3)
    c = Math.round(centreC - REACH_C * t) // left flank
  else return

  // Cool blue far off, warming to a white flash as it lands in the hand.
  const tone = t < 0.4 ? BLUE : t < 0.72 ? LIGHT : t < 0.92 ? SKY : WHITE
  const paint = style().bold(true).foreground(tone)

  const size = FLY_SIZES.filter((s) => t >= s.at).pop() || FLY_SIZES[0]
  const w = size.lines[0].length
  const h = size.lines.length
  const topR = r - Math.floor(h / 2)
  const atCol = c - Math.floor(w / 2)

  size.lines.forEach((sprite, i) => stampRow(rows, rowR, topR + i, atCol, paint.render(sprite), w))
}

// Overlay one sprite row, but only where it fully clears the felt hole — never
// over the solid ring or off its edge, so the table outline stays intact even
// as the card swells near a narrow part of the ellipse.
function stampRow(rows, rowR, r, atCol, stamp, w) {
  const idx = rowR.indexOf(r)
  if (idx === -1) return
  const { inner: hole } = tableRow(r)
  if (hole === 0 || atCol < TABLE_HALF_W - hole || atCol + w > TABLE_HALF_W + hole) return
  rows[idx] = overlayAt(rows[idx], atCol, stamp, w)
}

// Splice a pre-styled sprite `w` cells wide into a styled line at visible column
// `atCol`, dropping the cells it covers. ANSI escapes are always copied through
// (so the runs behind the sprite still close), only visible cells are replaced.
function overlayAt(line, atCol, stamp, w) {
  let out = ''
  let vis = 0
  let placed = false
  let i = 0
  while (i < line.length) {
    if (line[i] === '\x1b') {
      let j = i + 1
      while (j < line.length && !/[A-Za-z]/.test(line[j])) j++
      out += line.slice(i, j + 1)
      i = j + 1
      continue
    }
    const cp = line.codePointAt(i)
    const ch = String.fromCodePoint(cp)
    if (vis >= atCol && vis < atCol + w) {
      if (!placed) {
        out += stamp
        placed = true
      }
    } else {
      out += ch
    }
    vis += 1
    i += ch.length
  }
  return out
}

// The table is the ring and nothing else — no floor, no shadow.
function tableSprite(top) {
  return top
}

// A live +2/+4 stack is the most urgent thing on the table.
function stackLine(game) {
  if (!game.pending) return style().faint(true).render('no stack')
  return style()
    .bold(true)
    .foreground(SKY)
    .render(`▲ ${game.pending.count} cards pending (${game.pending.rank})`)
}

// Los cuatro lugares de la mesa, en orden de turno a partir del jugador local:
// abajo soy yo, y de ahí derecha, arriba e izquierda.
//
// Antes esto era 0 abajo, 1 derecha, 2 arriba, 3 izquierda — fijo. Rompía de
// dos maneras: con menos de cuatro jugadores `game.hands[2]` es undefined y el
// render explotaba ("Cannot read properties of undefined"), y online cada uno
// veía al asiento 0 sentado abajo aunque el de abajo tiene que ser uno mismo.
function asientoEn(game, view, offset) {
  const n = game.playerCount
  if (offset >= n) return null // esa silla no existe en esta mesa
  return ((view.me ?? 0) + offset) % n
}

function renderMesa(game, view) {
  const w = CANVAS.width
  const abajo = asientoEn(game, view, 0)
  const derecha = asientoEn(game, view, 1)
  const arriba = asientoEn(game, view, 2)
  const izquierda = asientoEn(game, view, 3)

  // Una silla vacía sigue ocupando su columna: si no, la mesa se corre de lugar
  // según cuánta gente haya y el ancho del frame deja de ser constante.
  const flanco = (seat, align) =>
    seat === null ? ' '.repeat(FLANK) : flankBeside(game, seat, view, align)

  // The flanks sit level with the felt, not with the legs: the felt is the
  // first rows of the sprite, so a top-aligned join puts the seat beside it
  // and lets the carpentry hang below on its own.
  const sprite = feltBlock(game, view)
  const table = style.joinHorizontal(
    style.position.top,
    flanco(izquierda, 'right'),
    ' ',
    sprite,
    ' ',
    flanco(derecha, 'left')
  )

  return stack(
    pad(arriba === null ? '' : seatLine(game, arriba, view), w),
    pad(table, w),
    pad(abajo === null ? '' : seatLine(game, abajo, view), w)
  )
}

// --- panels --------------------------------------------------------------

// Only what the score line does not already carry.
function partidaLines(game, view = {}) {
  const actor = game.currentActor()
  const rows = [
    ['Turn', actor === null ? '—' : game.players[actor].name],
    ['Your hand', `${game.hands[view.me ?? 0].length} cards`]
  ]

  return rows
    .map(
      ([term, value]) =>
        style().foreground(WHITE).render(term.padEnd(10)) +
        style().bold(true).foreground(SKY).render(value)
    )
    .join('\n')
}

// The running feed, tagged by who said it.
function chatLines(game, width, height) {
  const lines = []

  for (const event of game.events.slice(-height * 2)) {
    const who =
      event.seat === null || event.seat === undefined ? 'TABLE' : game.players[event.seat].name
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
  const me = view.me ?? 0
  const hand = game.hands[me].slice(0, dealtTo(game, me, view))
  const yours = view.dealt === undefined && game.currentActor() === me && game.phase === 'play'

  if (hand.length === 0) {
    const text = view.dealt === undefined ? '(no cards)' : 'dealing…'
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
  const more = hidden > 0 ? style().faint(true).render(`  +${hidden} off-screen`) : ''

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

function renderScore(game, width, view = {}) {
  const fewest = Math.min(...game.hands.map((h) => h.length))
  const parts = game.players.map((p, seat) => {
    const n = game.hands[seat].length
    const tone = seat === (view.me ?? 0) ? SKY : n === fewest ? LIGHT : WHITE
    return (
      style().foreground(tone).render(`${p.name} `) +
      style().bold(true).foreground(tone).render(String(n))
    )
  })

  const left = ' ' + parts.join(style().faint(true).render('  ·  '))
  const right = view.updateStatus
    ? style()
        .foreground(view.updateStatus.color)
        .render(view.updateStatus.text + ' ')
    : style().faint(true).render('cards in hand ')
  const room = width - style.width(left) - style.width(right)
  return left + ' '.repeat(Math.max(1, room)) + right
}

// --- commands ------------------------------------------------------------

// What you can do right now, as [key, label] pairs, taken straight from the
// engine's legal actions so the list can never drift from the rules.
function commands(game, view = {}) {
  if (game.phase === 'game-over') {
    return [
      ['ENTER', 'menu'],
      ['ESC', 'quit']
    ]
  }
  if (game.phase === 'round-over') {
    return [
      ['ENTER', 'continue'],
      ['ESC', 'menu']
    ]
  }

  // Qué puede hacer EL JUGADOR LOCAL. Con `0` fijo, online todos veían los
  // comandos del anfitrión: el que jugaba un comodín nunca veía R/A/V/Z y la
  // partida se trababa en choose-color. Pasó en la primera mano Franco-Gino.
  const actions = game.legalActions(view.me ?? 0)
  if (actions.length === 0) return []

  const has = (type) => actions.some((a) => a.type === type)
  const rows = []

  if (has('color')) {
    rows.push(['R', 'red'], ['Y', 'yellow'], ['G', 'green'], ['B', 'blue'])
  } else {
    if (has('play')) rows.push(['1-9', 'play'], ['←/→', 'select'], ['ENTER', 'throw'])
    if (has('draw')) rows.push(['D', 'draw'])
    if (has('take')) rows.push(['D', `take ${game.pending.count}`])
    if (has('pass')) rows.push(['P', 'pass'])
  }

  if (has('uno')) rows.push(['U', game.unoWindow.seat === (view.me ?? 0) ? 'UNO!' : 'catch'])
  rows.push(['ESC', 'menu'])
  return rows
}

// One line under the hand. If the full set does not fit, the softest hints go
// before the ones that actually move the game on.
const OPTIONAL = ['select', 'play']

function commandLine(game, width, view = {}) {
  if (view.dealt !== undefined) return ''
  let rows = commands(game, view)
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
    return style().foreground(WHITE).render(`  ${game.players[game.dealer].name} deals…`)
  }

  if (game.phase === 'game-over') {
    // Ganar es que gane MI asiento, no el 0. Con el 0 fijo, online el invitado
    // que ganaba leía "franco won" en vez de "YOU WON". Es el mismo bug que ya
    // se arregló en result.js:82; volvió en otro archivo.
    const won = game.winner() === (view.me ?? 0)
    return style()
      .bold(true)
      .foreground(won ? SKY : MID)
      .render(
        won
          ? '  YOU WON THE GAME!  ENTER to go back to the menu'
          : `  ${game.players[game.winner()].name} won.  ENTER to go back to the menu`
      )
  }

  if (game.phase === 'round-over') {
    const { winner, points } = game.lastRound || {}
    return style()
      .foreground(LIGHT)
      .render(`  ${game.players[winner].name} went out with ${points} points · ENTER to continue`)
  }

  if (game.phase === 'choose-color' && game.chooser === (view.me ?? 0)) {
    return style().bold(true).foreground(SKY).render('  Pick the next colour')
  }

  if (game.currentActor() !== (view.me ?? 0)) {
    const spin = SPINNER[Math.floor((view.frame || 0) / 2) % SPINNER.length]
    const name = game.players[game.currentActor()].name
    return (
      style().foreground(SKY).render(`  ${spin} `) +
      style().foreground(WHITE).render(`${name} is thinking…`)
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
      .render(
        `  ${game.pending.count} coming your way — answer with a ${game.pending.rank} or take them`
      )
  }

  return style().foreground(WHITE).render('  Your turn.')
}

// --- the whole frame -----------------------------------------------------

function renderGame(game, view) {
  const width = CANVAS.width

  // One line of state: whose turn, and the last thing that happened at the
  // table. The panels this replaced spent seven rows on the same thing.
  const actor = game.currentActor()
  const turno =
    style().faint(true).render('turn ') +
    style()
      .bold(true)
      .foreground(SKY)
      .render(actor === null ? '—' : game.players[actor].name)
  const last = game.events[game.events.length - 1]
  const ultimo = last ? style().foreground(WHITE).render(style.truncate(last.text, 70)) : ''
  const top = turno + '   ' + style().faint(true).render('·') + '   ' + ultimo

  // No header: the title and version are menu chrome, not table state. The
  // updater status it used to carry rides on the score line instead, so an
  // OTA notice can still reach the player mid-game.
  const body = stack(
    renderScore(game, width, view),
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
