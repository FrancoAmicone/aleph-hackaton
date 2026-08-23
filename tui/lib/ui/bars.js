// The animated glitch bars behind the title.
//
// Each row is cut into blocks of a width particular to that row, and each block
// is either empty or filled with one shade of blue. Rows drift sideways at
// their own speed and direction, so the bars slide past each other and shear —
// the datamosh look of the reference — instead of marching in step.
//
//   bars(width, rows, t)   // -> array of coloured lines, one per row
//
// Pure and deterministic: the pattern is hashed from (row, block) and the only
// changing input is `t`, so any frame can be rendered on demand and asserted on
// without a clock.
const { style } = require('../tea')
const { SKY, LIGHT, BLUE, MID, NAVY } = require('./palette')

// How far `t` advances per frame.
const SPEED = 0.16

// Solid bright bars, halftone mid bars, and sparse dark ones — the three
// textures the reference is built from.
const SOLID = '█'
const HALF = '▒'
const SPARSE = '░'
const GLYPHS = [' ', SOLID, HALF, SPARSE]

// A cheap integer hash. Same (a, b) always gives the same block, which is what
// keeps the animation reproducible.
function hash(a, b) {
  let x = (Math.imul(a, 374761393) + Math.imul(b, 668265263)) >>> 0
  x = (x ^ (x >>> 13)) >>> 0
  x = Math.imul(x, 1274126177) >>> 0
  return (x ^ (x >>> 16)) >>> 0
}

// What a single block looks like: a glyph and a colour, or empty space.
function block(y, idx) {
  const h = hash(y + 1, idx + 1)

  // A bit over a third of the row is left as gaps, which is what separates the
  // bars into bars rather than a solid wall.
  if (h % 100 < 36) return { ch: ' ', tone: -1 }

  const kind = (h >>> 8) % 100
  const flip = (h >>> 16) & 1

  if (kind < 34) return { ch: SOLID, tone: flip ? SKY : LIGHT }
  if (kind < 72) return { ch: HALF, tone: flip ? BLUE : MID }
  return { ch: SPARSE, tone: NAVY }
}

function bars(width, rows, t) {
  const out = []

  for (let y = 0; y < rows; y++) {
    const seed = hash(y + 1, 0)
    const direction = seed & 1 ? 1 : -1
    const speed = 0.6 + ((seed >>> 3) % 6) * 0.55
    const blockWidth = 4 + ((seed >>> 7) % 10)
    const offset = t * speed * direction

    let line = ''
    let run = ''
    let key = null

    for (let x = 0; x < width; x++) {
      const { ch, tone } = block(y, Math.floor((x + offset) / blockWidth))
      const next = `${ch}:${tone}`

      if (next !== key && run) {
        line += paint(run, key)
        run = ''
      }
      key = next
      run += ch
    }
    if (run) line += paint(run, key)

    out.push(line)
  }

  return out
}

// Runs of one glyph and colour are painted together, so a row costs a handful
// of escape sequences rather than one per column.
function paint(run, key) {
  const tone = Number(key.slice(2))
  if (tone < 0) return run
  return style().foreground(tone).render(run)
}

module.exports = { bars, block, hash, SPEED, GLYPHS }
