// The title screen and the rules card.
const { style } = require('../tea')
const { CANVAS, pad, fit } = require('./canvas')
const { SKY, MID, WHITE } = require('./palette')
const { bars, SPEED } = require('./bars')
const { frame } = require('./pear')

// The two buttons, in the order they sit on screen.
const MENU_ITEMS = [
  { id: 'create', label: 'CREATE ROOM' },
  { id: 'join', label: 'JOIN ROOM' }
]

// A 5-row block font — the glyphs "THE GREAT PEAR" needs.
const FONT = {
  T: ['█████', '  █  ', '  █  ', '  █  ', '  █  '],
  H: ['█   █', '█   █', '█████', '█   █', '█   █'],
  E: ['█████', '█    ', '███  ', '█    ', '█████'],
  G: [' ████', '█    ', '█  ██', '█   █', ' ████'],
  R: ['████ ', '█   █', '████ ', '█  █ ', '█   █'],
  A: [' ███ ', '█   █', '█████', '█   █', '█   █'],
  P: ['████ ', '█   █', '████ ', '█    ', '█    '],
  ' ': ['   ', '   ', '   ', '   ', '   ']
}

// Big text on an ∩ arch: each whole letter shifts down by how far it sits
// from the centre, so the line wraps over the pear without breaking a stroke.
// `amp` is how many rows the ends drop below the middle.
function archText(str, amp) {
  const blocks = [...str.toUpperCase()].map((ch) => FONT[ch] || FONT[' '])
  const widths = blocks.map((b) => b[0].length)
  const gap = 1
  const totalW = widths.reduce((a, w) => a + w + gap, 0) - gap

  const centres = []
  let x = 0
  for (const w of widths) {
    centres.push(x + w / 2)
    x += w + gap
  }
  const mid = totalW / 2
  const offs = centres.map((c) => {
    const t = mid ? (c - mid) / mid : 0
    return Math.round(amp * t * t)
  })

  const grid = Array.from({ length: 5 + amp }, () => Array(totalW).fill(' '))
  x = 0
  blocks.forEach((b, i) => {
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < widths[i]; c++) {
        if (b[r][c] !== ' ') grid[offs[i] + r][x + c] = b[r][c]
      }
    }
    x += widths[i] + gap
  })
  return grid.map((row) => row.join(''))
}

// Yellow at the top fading to green at the base: the pear's own colours.
const TITLE_TONES = [226, 220, 190, 184, 148, 112, 106]

function titleBlock() {
  const rows = [...archText('THE GREAT', 1), ...archText('PEAR', 1)]
  return rows
    .map((row, i) =>
      style()
        .bold(true)
        .foreground(TITLE_TONES[Math.min(TITLE_TONES.length - 1, i)])
        .render(row)
    )
    .join('\n')
}

// A big button. Focus lifts it out with arrows and yellow; idle is grey.
function button(label, focus, inner) {
  const spaced = label.split('').join(' ')
  const core = focus ? `▸ ${spaced} ◂` : spaced
  const left = Math.floor((inner - core.length) / 2)
  const line = ' '.repeat(left) + core + ' '.repeat(inner - core.length - left)
  const tone = focus ? 226 : 244
  const rows = [
    '╔' + '═'.repeat(inner) + '╗',
    '║' + ' '.repeat(inner) + '║',
    '║' + line + '║',
    '║' + ' '.repeat(inner) + '║',
    '╚' + '═'.repeat(inner) + '╝'
  ]
  return rows.map((r, i) =>
    style()
      .foreground(tone)
      .bold(focus && i === 2)
      .render(r)
  )
}

// Rows of glitch bars above the title. Fixed, like everything else.
const BAND_ROWS = 2

// The pear: this wide, this tall. Sized so the title, the pear and the buttons
// all fit the 38-row canvas with room to breathe.
const PEAR_W = 34
const PEAR_H = 15

// The pear turns this much per frame of the loop.
const SPIN_PER_FRAME = 0.045

function renderMenu(view) {
  const width = CANVAS.width
  const t = (view.frame || 0) * SPEED

  const title = titleBlock()
  const tagline = style().foreground(108).render('· uno · delivered p2p over pear ·')
  const pear = frame((view.frame || 0) * SPIN_PER_FRAME, PEAR_W, PEAR_H)

  // Both buttons the same width, reserving room for the focus arrows.
  const inner = 'CREATE ROOM'.length * 2 - 1 + 4 + 6
  const row = style.joinHorizontal(
    style.position.top,
    button('CREATE ROOM', view.index === 0, inner).join('\n'),
    '      ',
    button('JOIN ROOM', view.index === 1, inner).join('\n')
  )

  const hint = view.message
    ? style().bold(true).foreground(226).render(view.message)
    : style().foreground(244).render('←/→ elegir   ·   ↵ entrar   ·   R reglas   ·   Q salir')

  const status = view.updateStatus
    ? style().foreground(view.updateStatus.color).render(view.updateStatus.text)
    : style().foreground(WHITE).render(`v${view.version}  ·  corriendo sobre Pear + Bare`)

  return fit(
    [
      ...bars(width, BAND_ROWS, t),
      pad(title, width),
      pad(tagline, width),
      pad(pear, width),
      pad(row, width),
      '',
      pad(hint, width),
      pad(status, width)
    ].join('\n')
  )
}

const RULES = [
  ['Objetivo', 'Quedarte sin cartas antes que los demás. La partida es a 500 puntos.'],
  ['Las peras', 'Cada carta lleva su valor en peras: contás las peras y esa es la carta.'],
  ['El mazo', '88 cartas en cuatro colores: 0-9 en peras, ocho +2 y cuatro +4.'],
  ['Reparto', 'Cinco cartas a cada uno. Se da vuelta una para empezar el descarte.'],
  ['Tu turno', 'Tirás una carta que coincida en color, o que tenga las mismas peras.'],
  ['Si no podés', 'Robás una del mazo. Si esa sirve, la podés tirar en el acto.'],
  ['+2', 'El siguiente roba dos y pierde el turno — salvo que responda con otro +2.'],
  ['+4', 'Se puede tirar siempre. Elegís el color y el siguiente roba cuatro.'],
  ['Apilar', 'Un +2 se responde con +2 y un +4 con +4: la cuenta se suma y sigue.'],
  ['¡UNO!', 'Al quedarte con una carta cantá UNO. Si te pescan callado, robás dos.'],
  ['Puntos', 'El que sale suma lo que quedó en las manos ajenas: número, +2 vale 20, +4 vale 50.']
]

function renderRules() {
  const width = CANVAS.width

  // The box is what actually clips, so truncate to ITS inner width, not the
  // canvas — otherwise long rules get cut mid-word by the border.
  const boxWidth = width - 10
  const termWidth = 18

  const rows = RULES.map(([term, text]) => {
    const label = style().bold(true).foreground(SKY).render(term.padEnd(termWidth))
    return (
      label +
      style()
        .foreground(WHITE)
        .render(style.truncate(text, boxWidth - termWidth))
    )
  })

  const box = style()
    .width(boxWidth)
    .padding(1, 2)
    .border(style.borders.rounded)
    .borderForeground(MID)
    .render(rows.join('\n'))

  const title = style().bold(true).foreground(SKY).render('REGLAS DEL TRUCO')
  const footer = style().foreground(WHITE).render('ENTER o ESC para volver')

  return ['', pad(title, width), '', pad(box, width), '', pad(footer, width)].join('\n')
}

module.exports = { renderMenu, renderRules, MENU_ITEMS, titleBlock, archText, BAND_ROWS }
