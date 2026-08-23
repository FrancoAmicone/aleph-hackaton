// The canvas: one fixed size that every screen is drawn to.
//
// Nothing in the UI reflows. Screens draw at exactly CANVAS.width x
// CANVAS.height and the result is centred in whatever terminal it lands in; a
// terminal too small to hold it is asked to grow rather than served a different
// layout. That is what keeps the render functions free of width thresholds and
// adaptive branches — there is one layout and it is always the same one.
//
// The size is set by the table dashboard: three columns of 22, 64 and 30
// with a two-column gutter between them, and enough rows for the panels above
// and below the mesa. The centre is the widest because the table is the point
// of the screen; the side columns carry the panels around it. The 96-column headline on the title screen fits inside it
// comfortably.
const { style } = require('../tea')

const CANVAS = { width: 120, height: 38 }

// The three columns of the table screen, and the gutter between them.
const COLUMNS = { left: 22, centre: 64, right: 30, gutter: 2 }

// Pad a block out to an exact width, aligning its content left/centre/right.
function pad(block, width, align = 'center') {
  return block
    .split('\n')
    .map((line) => {
      const room = Math.max(0, width - style.width(line))
      if (align === 'left') return line + ' '.repeat(room)
      if (align === 'right') return ' '.repeat(room) + line
      const left = Math.floor(room / 2)
      return ' '.repeat(left) + line + ' '.repeat(room - left)
    })
    .join('\n')
}

// Force a block to exactly the canvas: every line padded to width, and the
// block padded or trimmed to height. Screens can then be composed loosely and
// still come out the same size every time.
function fit(block, width = CANVAS.width, height = CANVAS.height) {
  const lines = block.split('\n').map((line) => {
    const room = width - style.width(line)
    return room >= 0 ? line + ' '.repeat(room) : style.truncate(line, width)
  })

  while (lines.length < height) lines.push(' '.repeat(width))
  return lines.slice(0, height).join('\n')
}

// Centre the canvas in the terminal.
function centre(frame, termWidth, termHeight) {
  const lines = frame.split('\n')
  const left = Math.max(0, Math.floor((termWidth - CANVAS.width) / 2))
  const top = Math.max(0, Math.floor((termHeight - CANVAS.height) / 2))

  const padded = lines.map((line) => ' '.repeat(left) + line)
  return Array(top).fill('').concat(padded).join('\n')
}

function tooSmallFor(termWidth, termHeight) {
  return termWidth < CANVAS.width || termHeight < CANVAS.height
}

// Shown instead of the game when the window cannot hold the canvas. Drawn to
// whatever room there is, since by definition the canvas does not fit.
function tooSmall(termWidth, termHeight) {
  const want = `${CANVAS.width}×${CANVAS.height}`
  const have = `${termWidth}×${termHeight}`

  const lines = [
    style().bold(true).render('The window is too small'),
    '',
    style().render(`I need ${want} · you have ${have}`),
    '',
    style().faint(true).render('Make the terminal bigger or the font smaller')
  ]

  const width = Math.max(1, termWidth)
  const top = Math.max(0, Math.floor((termHeight - lines.length) / 2))
  return Array(top)
    .fill('')
    .concat(lines.map((line) => pad(line, width)))
    .join('\n')
}

module.exports = { CANVAS, COLUMNS, pad, fit, centre, tooSmall, tooSmallFor }
