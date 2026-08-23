// Rain for the loss: grey-blue drops fall across the whole canvas and splash
// on the floor; as the shower eases off, the result shows through behind it.
//
// rain(age, behind) is pure. `behind` is the finished result frame, canvas
// sized; it is dissolved in cell by cell while the rain thins, and the last
// frame is exactly `behind` with nothing on top. The app runs this on the
// same fast clock as the fireworks.
const { W, H, hash, layer, put, emit } = require('./compose')

const SHOW_MS = 40
const FRAMES = 60

// Drops: how many at full pour, and how the shower comes and goes.
const DROPS = 150
const RISE = 8 // frames to reach full pour
const EASE_FROM = 0.55 // fraction of the show where it starts to ease off
const REVEAL_FROM = 0.45 // fraction where the result starts to show through

// Fast drops are long and bright; slow ones are specks far away.
const KINDS = [
  { speed: 1.6, glyph: '|', tone: 67 },
  { speed: 1.3, glyph: '|', tone: 103 },
  { speed: 1.0, glyph: "'", tone: 60 },
  { speed: 0.7, glyph: '.', tone: 240 },
  { speed: 0.5, glyph: '.', tone: 237 }
]
const SPLASH = 240

function rain(age, behind) {
  const k = Math.min(1, age / FRAMES)

  // How hard it is raining right now, 0..1.
  const pour =
    age < RISE ? age / RISE : k < EASE_FROM ? 1 : Math.max(0, 1 - (k - EASE_FROM) / (1 - EASE_FROM))
  // How much of the result has come through, 0..1.
  const reveal = k < REVEAL_FROM ? 0 : Math.min(1, (k - REVEAL_FROM) / (1 - REVEAL_FROM))

  const grid = layer(behind, reveal)

  const active = Math.round(DROPS * pour)
  for (let i = 0; i < active; i++) {
    const kind = KINDS[Math.floor(hash(i, 3) * KINDS.length)]
    const x = Math.floor(hash(i, 1) * W)
    // Each drop runs its own loop down the screen, offset so they never line up.
    const cycle = H + 6
    const pos = (hash(i, 2) * cycle + age * kind.speed) % cycle
    const y = pos - 3
    if (y < H - 1) {
      put(grid, x, y, kind.glyph, kind.tone)
      // A faint tail on the fast ones.
      if (kind.speed >= 1.3 && y > 0) put(grid, x, y - 1, '.', kind.tone)
    } else if (y < H + 2) {
      // On the floor: a splash either side for a couple of frames.
      put(grid, x - 1, H - 1, '~', SPLASH)
      put(grid, x, H - 1, '.', SPLASH)
      put(grid, x + 1, H - 1, '~', SPLASH)
    }
  }

  return emit(grid)
}

module.exports = { rain, FRAMES, SHOW_MS }
