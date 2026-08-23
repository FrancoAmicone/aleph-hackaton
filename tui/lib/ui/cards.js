// Drawing UNO cards in a terminal.
//
// Every helper returns a rectangular block of the advertised size so the blocks
// drop straight into style.joinHorizontal/joinVertical without ragging. Only
// width-1 glyphs are used — an emoji would measure 1 here and render 2 in most
// terminals, which would shear the whole layout.
//
// The rank is what identifies a card; the colour is the ink it is drawn in,
// exactly as on a real deck. A +4 belongs to no colour and is drawn white.
const { style } = require('../tea')
const { CARD_COLORS, COMODIN, MID, STRONG } = require('./palette')

const BIG = { width: 7, height: 5 }
const SMALL = { width: 5, height: 3 }

function toneOf(card) {
  return card.color ? CARD_COLORS[card.color] : COMODIN
}

function tint(lines, color, bold) {
  const s = style().foreground(color)
  if (bold) s.bold(true)
  return lines.map((line) => s.render(line))
}

const label = (card) => String(card.rank)

// A full-size card for the player's own hand.
//
//   ┌─────┐
//   │7    │
//   │  7  │
//   │    7│
//   └─────┘
function big(card, opts = {}) {
  const rank = label(card)
  const rows = [
    '┌─────┐',
    `│${rank.padEnd(5)}│`,
    `│${center(rank, 5)}│`,
    `│${rank.padStart(5)}│`,
    '└─────┘'
  ]

  if (opts.selected) {
    // Lift the selected card out with a heavy border in its own colour.
    return tint(
      [
        '┏━━━━━┓',
        `┃${rank.padEnd(5)}┃`,
        `┃${center(rank, 5)}┃`,
        `┃${rank.padStart(5)}┃`,
        '┗━━━━━┛'
      ],
      toneOf(card),
      true
    ).join('\n')
  }

  const out = tint(rows, opts.dim ? STRONG : toneOf(card), false)
  return out.join('\n')
}

// A compact card, for the discard pile.
//
//   ┌───┐
//   │ 7 │
//   └───┘
function small(card, opts = {}) {
  return tint(['┌───┐', `│${center(label(card), 3)}│`, '└───┘'], toneOf(card), !opts.dim).join('\n')
}

// A face-down card — the draw pile, and what the rivals are holding.
function smallBack() {
  return tint(['┌───┐', '│▚▚▚│', '└───┘'], MID, false).join('\n')
}

function bigBack() {
  return tint(['┌─────┐', '│▚▚▚▚▚│', '│▚▚▚▚▚│', '│▚▚▚▚▚│', '└─────┘'], MID, false).join('\n')
}

// An empty slot: nothing there yet.
function smallEmpty() {
  const faint = style().faint(true)
  return ['╌╌╌╌╌', '  ·  ', '╌╌╌╌╌'].map((l) => faint.render(l)).join('\n')
}

function blank(width, height) {
  return Array.from({ length: height }, () => ' '.repeat(width)).join('\n')
}

// The face-down fan a rival still holds, as a single line: "▚ ▚ ▚".
// Long hands are summarised rather than drawn out, so a player who ate a big
// stack cannot widen the row.
function backsInline(count) {
  if (count <= 0) return style().faint(true).render('—')
  const ink = style().foreground(MID)
  if (count <= 6) return ink.render(Array.from({ length: count }, () => '▚').join(' '))
  return ink.render(`▚▚▚ ×${count}`)
}

// A swatch of the colour currently in play, which after a +4 is not the colour
// of the card on the pile.
function colorChip(color) {
  if (!color) return style().faint(true).render('  ·  ')
  return style().bold(true).foreground(CARD_COLORS[color]).render('███')
}

function center(text, width) {
  const room = Math.max(0, width - text.length)
  const left = Math.floor(room / 2)
  return ' '.repeat(left) + text + ' '.repeat(room - left)
}

module.exports = {
  big,
  small,
  smallBack,
  bigBack,
  smallEmpty,
  blank,
  backsInline,
  colorChip,
  toneOf,
  BIG,
  SMALL
}
