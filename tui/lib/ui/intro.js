// The into-game transition: the menu gives way to the pear at the centre, which
// swells — spinning faster as it comes — until its flesh floods the screen, and
// then the table is dealt behind it.
//
//   renderIntro(frame)   // -> a full canvas of nothing but the growing pear
//
// Pure and deterministic: a function of the frame counter alone, so it renders
// on demand and needs no clock. INTRO_FRAMES is exported so the model knows
// when the swell is done and it is time to reveal the board.
const { frame } = require('./pear')
const { CANVAS } = require('./canvas')

const INTRO_FRAMES = 16

// The pear starts about the size it was on the menu and zooms in hard. Zoomed
// past ~7 the point cloud goes sparse rather than fuller, so the last stretch
// leans on the background flood, not more zoom, to close the screen.
const ZOOM_START = 0.34
const ZOOM_END = 7
const SPIN_START = 0.6
const SPIN_PER_FRAME = 0.13

// The pear can only cover so much of a wide canvas on its own, so once it is
// large its own green floods the gaps and the corners. To avoid flashes the
// fill eases up ONE hue — black → dark → medium green — and then holds there,
// blending with the pear's flesh instead of jumping to a bright wash. The last
// index repeats, so the reveal cuts away from a steady colour, never mid-step.
const BG_START = 0.5
const GREENS = [16, 22, 22, 28, 28, 28]

function renderIntro(f) {
  const t = Math.min(1, f / (INTRO_FRAMES - 1))
  // Ease in: it drifts, then rushes the screen — the accelerando that sells the
  // hand-off into the game.
  const zoom = ZOOM_START + (ZOOM_END - ZOOM_START) * t * t
  const spin = SPIN_START + f * SPIN_PER_FRAME

  let bg = null
  if (t >= BG_START) {
    const p = (t - BG_START) / (1 - BG_START)
    bg = GREENS[Math.min(GREENS.length - 1, Math.floor(p * GREENS.length))]
  }

  return frame(spin, CANVAS.width, CANVAS.height, zoom, bg)
}

module.exports = { renderIntro, INTRO_FRAMES }
