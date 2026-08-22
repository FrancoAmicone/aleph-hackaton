// The title screen and the rules card.
const { style } = require('../tea')
const { CANVAS, pad, fit } = require('./canvas')
const { SKY, MID, WHITE, NAVY } = require('./palette')
const { bars, SPEED } = require('./bars')

const MENU_ITEMS = [
  { id: 'jugar', label: 'Jugar' },
  { id: 'modo', label: 'Modo' },
  { id: 'nivel', label: 'Rivales' },
  { id: 'flor', label: 'Con flor' },
  { id: 'reglas', label: 'Reglas' },
  { id: 'salir', label: 'Salir' }
]

// The headline: 96 columns, which is what sets the canvas width.
const HEADLINE = [
  '███████╗██╗░░░░░  ░██████╗░██████╗░░█████╗░███╗░░██╗  ████████╗██████╗░██╗░░░██╗░█████╗░░█████╗░',
  '██╔════╝██║░░░░░  ██╔════╝░██╔══██╗██╔══██╗████╗░██║  ╚══██╔══╝██╔══██╗██║░░░██║██╔══██╗██╔══██╗',
  '█████╗░░██║░░░░░  ██║░░██╗░██████╔╝███████║██╔██╗██║  ░░░██║░░░██████╔╝██║░░░██║██║░░╚═╝██║░░██║',
  '██╔══╝░░██║░░░░░  ██║░░╚██╗██╔══██╗██╔══██║██║╚████║  ░░░██║░░░██╔══██╗██║░░░██║██║░░██╗██║░░██║',
  '███████╗███████╗  ╚██████╔╝██║░░██║██║░░██║██║░╚███║  ░░░██║░░░██║░░██║╚██████╔╝╚█████╔╝╚█████╔╝',
  '╚══════╝╚══════╝  ░╚═════╝░╚═╝░░╚═╝╚═╝░░╚═╝╚═╝░░╚══╝  ░░░╚═╝░░░╚═╝░░╚═╝░╚═════╝░░╚════╝░░╚════╝░'
]

// Rows of glitch bars above and below the title. Fixed, like everything else.
const BAND_ROWS = 4

const SHADOW = '░'

// The pulse the selected row's marker cycles through.
const MARKERS = ['▶', '▷', '▶', '▸']

// White letters with a dark shadow behind them, as in the reference. The ░
// cells in the art are the shadow, so they take the dark tone while the strokes
// stay white. Runs of one or the other are painted together, so a row costs a
// handful of escape sequences rather than one per column.
function paintRow(line) {
  const solid = style().bold(true).foreground(WHITE)
  const shade = style().foreground(NAVY)

  let out = ''
  let run = ''
  let shadow = null

  for (const ch of line) {
    const isShadow = ch === SHADOW
    if (shadow === null) shadow = isShadow
    if (isShadow !== shadow) {
      out += (shadow ? shade : solid).render(run)
      run = ''
      shadow = isShadow
    }
    run += ch
  }
  if (run) out += (shadow ? shade : solid).render(run)
  return out
}

// White letters, dark shadow, always at full size.
function titleBlock() {
  return HEADLINE.map(paintRow).join('\n')
}

const LEVEL_LABEL = { facil: 'fáciles', normal: 'normales', duro: 'duros' }

function valueFor(item, settings) {
  switch (item.id) {
    case 'modo':
      return settings.duelo ? 'mano a mano (1 vs 1)' : 'de a cuatro (2 vs 2)'
    case 'nivel':
      return LEVEL_LABEL[settings.nivel]
    case 'flor':
      return settings.conFlor ? 'sí' : 'no'
    default:
      return null
  }
}

function renderMenu(view) {
  const width = CANVAS.width
  const title = titleBlock()

  // A sun between the suits, flanking the wordmark.
  const suits = style().foreground(SKY).render('♠ ♥ ♦ ♣')
  const sun = style().bold(true).foreground(SKY).render('☼')
  const word = style().bold(true).foreground(WHITE).render('A R G E N T I N O')
  const subtitle = `${suits}   ${sun}  ${word}  ${sun}   ${suits}`

  // The marker on the selected row pulses, so the screen reads as live even
  // while nothing else is happening.
  const pulse = MARKERS[Math.floor((view.frame || 0) / 3) % MARKERS.length]

  const rows = MENU_ITEMS.map((item, i) => {
    const active = i === view.index
    const bullet = active ? style().foreground(SKY).render(`${pulse} `) : '  '
    const label = active
      ? style().bold(true).foreground(SKY).render(item.label.padEnd(10))
      : style().foreground(WHITE).render(item.label.padEnd(10))

    const value = valueFor(item, view.settings)
    const shown = value
      ? style()
          .foreground(active ? SKY : WHITE)
          .render(value)
      : ''

    const arrows = value && active ? style().foreground(SKY).render('  ←/→') : ''
    return `${bullet}${label}${shown}${arrows}`
  })

  const box = style()
    .width(46)
    .padding(1, 2)
    .border(style.borders.rounded)
    .borderForeground(MID)
    .render(rows.join('\n'))

  const footer = style()
    .foreground(WHITE)
    .render('↑/↓ moverse · ENTER elegir · ←/→ cambiar · Q salir')

  const status = view.updateStatus
    ? style().foreground(view.updateStatus.color).render(view.updateStatus.text)
    : style().foreground(WHITE).render(`v${view.version}  ·  corriendo sobre Pear + Bare`)

  const t = (view.frame || 0) * SPEED

  // The lower band is offset in time so the two are never mirror images.
  const above = bars(width, BAND_ROWS, t)
  const below = bars(width, BAND_ROWS, t + 41.7)

  return fit(
    [
      ...above,
      pad(title, width),
      ...below,
      '',
      pad(subtitle, width),
      '',
      pad(box, width),
      '',
      pad(footer, width),
      pad(status, width)
    ].join('\n')
  )
}

const RULES = [
  ['Objetivo', 'Llegar a 30 puntos. 0-14 son malas, 15-29 son buenas.'],
  ['La baraja', '40 cartas españolas: 1 al 7, 10, 11 y 12. Sin ochos ni nueves.'],
  ['Orden', '1♠ > 1♣ > 7♠ > 7♦ > 3 > 2 > 1 (falso) > 12 > 11 > 10 > 7 (falso) > 6 > 5 > 4'],
  ['Bazas', 'Tres bazas por mano. Gana la mano quien gane dos.'],
  ['Parda', 'Empate en una baza. Primera parda: decide la segunda. Todas pardas: gana el mano.'],
  ['Envido', 'Dos cartas del mismo palo: suma + 20. Si no, la carta más alta. Figuras valen 0.'],
  ['Cantos', 'Envido 2 · Real Envido 3 · Falta Envido: lo que le falta al puntero.'],
  ['Truco', 'Truco 2 · Retruco 3 · Vale Cuatro 4. No querido paga el escalón anterior.'],
  ['Flor', 'Tres cartas del mismo palo: 20 + sus valores. Tapa el envido y paga 3.'],
  ['El envido primero', 'Si te cantan truco en la primera baza, podés contestar con envido.']
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

module.exports = { renderMenu, renderRules, MENU_ITEMS, titleBlock, BAND_ROWS }
