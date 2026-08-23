// The boot splash: the title wipes on with a bright wavefront sweeping across
// it left to right, then the tagline fades up before the menu takes over.
//
//   renderBoot({ frame, version })   // -> a full canvas, ready to be centred
//
// Pure and deterministic: the whole animation is a function of `frame`, so any
// moment of it can be rendered on demand and asserted on without a clock. The
// timing constants below are exported so the model can drive the same frames.
const { style } = require('../tea')
const { CANVAS, pad, fit } = require('./canvas')
const { archText } = require('./menu')

// The reveal is a wavefront that travels across the title. SWEEP_FRAMES is how
// long it takes to cross; BAND is how many columns of the leading edge burn
// bright white before settling into the gradient behind it.
const SWEEP_FRAMES = 26
const BAND = 4
// After the wipe lands, hold the finished logo (with its tagline) this long
// before handing over to the menu.
const HOLD_FRAMES = 14
const BOOT_FRAMES = SWEEP_FRAMES + HOLD_FRAMES

// Yellow at the top fading to green at the base — the pear's colours, the same
// ramp the menu title uses so the splash resolves seamlessly into it.
const TITLE_TONES = [226, 220, 190, 184, 148, 112, 106]
const WAVE = 231 // #ffffff — the bright crest of the sweep

// The uncoloured title grid: "THE GREAT" over "PEAR", both on a shallow arch.
// Every row is padded to the widest so a column index means the same thing on
// each line and the wavefront stays vertical.
const RAW = (() => {
  const rows = [...archText('THE GREAT', 1), ...archText('PEAR', 1)]
  const w = Math.max(...rows.map((r) => r.length))
  // Centre each word within the widest so PEAR sits under THE GREAT — the same
  // arrangement the menu resolves into — while a column index still means the
  // same place on every line, keeping the wavefront vertical.
  return rows.map((r) => {
    const room = w - r.length
    const left = Math.floor(room / 2)
    return ' '.repeat(left) + r + ' '.repeat(room - left)
  })
})()
const TITLE_W = RAW[0].length

// Paint one title row for a given wavefront position. Columns past the edge are
// still dark (blank); the BAND columns just behind it glow white; everything
// further back settles to the row's gradient tone. Same-styled cells are
// emitted as one run so a row costs a handful of escapes, not one per column.
function sweepRow(raw, tone, edge) {
  let line = ''
  let run = ''
  let paintKey = null

  const flush = () => {
    if (!run) return
    line += paintKey === null ? run : style().bold(true).foreground(paintKey).render(run)
    run = ''
  }

  for (let c = 0; c < raw.length; c++) {
    const glyph = raw[c]
    // A gap, or a cell the sweep has not reached yet: blank, unpainted.
    const key = glyph === ' ' || c > edge ? null : edge - c < BAND ? WAVE : tone
    if (key !== paintKey) {
      flush()
      paintKey = key
    }
    run += key === null ? ' ' : glyph
  }
  flush()
  return line
}

function titleAt(edge) {
  return RAW.map((raw, i) =>
    sweepRow(raw, TITLE_TONES[Math.min(TITLE_TONES.length - 1, i)], edge)
  ).join('\n')
}

function renderBoot(view) {
  const frame = view.frame || 0
  const width = CANVAS.width

  // Frames 0..SWEEP_FRAMES march the edge from the left margin clear off the
  // right (W + BAND), so the last glyph column gets its moment in the crest
  // before the wipe completes. After that the logo is simply lit.
  const edge =
    frame >= SWEEP_FRAMES
      ? TITLE_W + BAND
      : Math.round((frame / SWEEP_FRAMES) * (TITLE_W + BAND))

  const title = titleAt(edge)

  // The tagline belongs to the settled logo, so it fades up only once the wipe
  // has finished — a two-step brighten over the first few hold frames.
  const held = frame - SWEEP_FRAMES
  const tagline =
    held < 0
      ? ''
      : style()
          .foreground(held < 4 ? 65 : 108)
          .render('· uno · delivered p2p over pear ·')

  // Centre the block vertically so the splash reads as its own screen rather
  // than the menu with its furniture missing.
  const body = [pad(title, width), '', pad(tagline, width)].join('\n')
  const top = Math.max(0, Math.floor((CANVAS.height - style.height(body)) / 2))

  return fit([...Array(top).fill(''), body].join('\n'))
}

module.exports = { renderBoot, BOOT_FRAMES, SWEEP_FRAMES, HOLD_FRAMES }
