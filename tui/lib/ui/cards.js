// Drawing Spanish cards in a terminal.
//
// Every helper returns a rectangular block of the advertised size so the blocks
// drop straight into style.joinHorizontal/joinVertical without ragging. Only
// width-1 glyphs are used — an emoji would measure 1 here and render 2 in most
// terminals, which would shear the whole layout.
const { glyph } = require('../truco/deck')
const { style } = require('../tea')
const { SKY, LIGHT, BLUE, MID } = require('./palette')

// Espadas and bastos are the "black" suits of a Spanish deck; oro and copa the
// coloured ones. Mapped to terminal colours that stay legible on either theme.
// Four steps of the celeste ramp, one per suit. The glyphs (♠ ♣ ♦ ♥) are what
// actually name the suit; the colour is reinforcement, so keeping all four in
// the one palette costs nothing and keeps the table on-brand.
const SUIT_COLOR = { espada: SKY, basto: LIGHT, oro: BLUE, copa: MID }

// Card backs sit in the app palette; the suit colours above deliberately do
// not, since they are what tells the four Spanish suits apart at a glance.
// ANSI-256 index, for the same portability reason as lib/ui/screen.js.
const BACK = 26

const BIG = { width: 7, height: 5 }
const SMALL = { width: 5, height: 3 }

function tint(lines, color, bold) {
  const s = style().foreground(color)
  if (bold) s.bold(true)
  return lines.map((line) => s.render(line))
}

// A full-size card for the player's own hand.
//
//   ┌─────┐
//   │7    │
//   │  ♦  │
//   │    7│
//   └─────┘
function big(card, opts = {}) {
  const rank = String(card.rank)
  const suit = glyph(card.suit)
  const lines = [
    '┌─────┐',
    `│${rank.padEnd(5)}│`,
    `│  ${suit}  │`,
    `│${rank.padStart(5)}│`,
    '└─────┘'
  ]

  if (opts.selected) {
    // Lift the selected card out with a bold border in its own colour.
    return tint(
      ['┏━━━━━┓', `┃${rank.padEnd(5)}┃`, `┃  ${suit}  ┃`, `┃${rank.padStart(5)}┃`, '┗━━━━━┛'],
      SUIT_COLOR[card.suit],
      true
    ).join('\n')
  }

  const faded = opts.dim ? style().faint(true) : null
  const out = tint(lines, SUIT_COLOR[card.suit], false)
  return (faded ? out.map((l) => faded.render(l)) : out).join('\n')
}

// A compact card for the cards already on the table.
//
//   ┌───┐
//   │12♣│
//   └───┘
function small(card) {
  const label = `${card.rank}${glyph(card.suit)}`.padEnd(3)
  return tint(['┌───┐', `│${label}│`, '└───┘'], SUIT_COLOR[card.suit], true).join('\n')
}

// A face-down card — what the rivals are holding.
function smallBack() {
  return tint(['┌───┐', '│▚▚▚│', '└───┘'], BACK, false).join('\n')
}

function bigBack() {
  return tint(['┌─────┐', '│▚▚▚▚▚│', '│▚▚▚▚▚│', '│▚▚▚▚▚│', '└─────┘'], BACK, false).join('\n')
}

// An empty table slot: nothing played there yet.
function smallEmpty() {
  const faint = style().faint(true)
  return ['╌╌╌╌╌', '  ·  ', '╌╌╌╌╌'].map((l) => faint.render(l)).join('\n')
}

// A blank block of the same footprint, for seats that are out of the hand.
function blank(width, height) {
  return Array.from({ length: height }, () => ' '.repeat(width)).join('\n')
}

// The face-down fan a rival still holds, as a single line: "▚ ▚ ▚".
function backsInline(count) {
  if (count <= 0) return style().faint(true).render('—')
  return style()
    .foreground(BACK)
    .render(Array.from({ length: count }, () => '▚').join(' '))
}

module.exports = {
  big,
  small,
  smallBack,
  bigBack,
  smallEmpty,
  blank,
  backsInline,
  BIG,
  SMALL,
  SUIT_COLOR
}
