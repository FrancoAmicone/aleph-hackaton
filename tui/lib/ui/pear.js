// A rotating 3D ASCII pear, donut.c style.
//
// frame(spin, W, H) is pure: same input, same output. The menu calls it with
// an angle that advances on the frame loop, so the pear turns at whatever rate
// the loop runs and costs nothing while the menu is not showing.
//
// The model is a point cloud built once at load: a body of two fused spheres
// with a bent axis and vertical lobes (so the silhouette changes as it turns),
// a blush on one cheek, lenticels that ride the surface, a curved stem, a leaf
// and a contact shadow on the ground. Each frame only rotates, projects and
// shades the points into a z-buffer.
//
// Colour is worked out in HSL per point and snapped to the nearest ANSI-256
// index at emit time. Never truecolour: the terminal we target paints 38;2
// sequences in its default colour.

const CH = '.,:;~!=*#$@' // 11 levels of luminance, dark -> bright

// ---------------- geometry ----------------
const _x = [],
  _y = [],
  _z = [],
  _nx = [],
  _ny = [],
  _nz = [],
  _hu = [],
  _sa = [],
  _lb = [],
  _mu = [],
  _md = []

function push(x, y, z, a, b, c, hue, sat, lof, mul, mode) {
  const L = Math.hypot(a, b, c) || 1
  _x.push(x)
  _y.push(y)
  _z.push(z)
  _nx.push(a / L)
  _ny.push(b / L)
  _nz.push(c / L)
  _hu.push(hue)
  _sa.push(sat)
  _lb.push(lof)
  _mu.push(mul)
  _md.push(mode)
}

// A deterministic hash so the lenticels sit where they sat last frame.
function hash(i, j) {
  const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453
  return s - Math.floor(s)
}

// Profile: two spheres smoothly fused.
function pearR(y) {
  const a = 0.82 * 0.82 - (y + 0.35) * (y + 0.35)
  const b = 0.52 * 0.52 - (y - 0.42) * (y - 0.42)
  const r1 = a > 0 ? Math.sqrt(a) : 0
  const r2 = b > 0 ? Math.sqrt(b) : 0
  if (r1 <= 0 && r2 <= 0) return 0
  const k = 0.22
  const h = Math.max(0, Math.min(1, 0.5 + (0.5 * (r1 - r2)) / k))
  return r2 + (r1 - r2) * h + k * h * (1 - h)
}

// The axis bends, so the silhouette changes as the pear turns.
function bend(y) {
  const t = Math.max(0, y + 1.0)
  return 0.048 * t * t
}
function bendD(y) {
  const t = Math.max(0, y + 1.0)
  return 0.096 * t
}

function buildBody() {
  const prof = []
  for (let y = -1.17; y <= 0.945; y += 0.01) {
    const r = pearR(y)
    if (r <= 0.002) continue
    const dr = (pearR(y + 0.004) - pearR(y - 0.004)) / 0.008
    prof.push([y, r, dr, 112 - 84 * ((y + 1.17) / 2.11)])
  }

  const A1 = 0.038,
    A2 = 0.022 // vertical lobes
  const THB = 1.15,
    YB = -0.25 // centre of the blush
  for (let th = 0; th < 6.2832; th += 0.024) {
    const ct = Math.cos(th),
      st = Math.sin(th)
    for (let k = 0; k < prof.length; k++) {
      const y = prof[k][0],
        r = prof[k][1],
        dr = prof[k][2]
      const p1 = 3 * th + 0.8 * y,
        p2 = 5 * th - 1.2 * y
      const f = A1 * Math.cos(p1) + A2 * Math.cos(p2)
      const fT = -3 * A1 * Math.sin(p1) - 5 * A2 * Math.sin(p2)
      const fY = -0.8 * A1 * Math.sin(p1) + 1.2 * A2 * Math.sin(p2)
      const R = r * (1 + f),
        Rt = r * fT,
        Ry = dr * (1 + f) + r * fY
      const a1 = Rt * ct - R * st,
        a3 = Rt * st + R * ct
      const b1 = Ry * ct + bendD(y),
        b3 = Ry * st

      // Blush on one cheek.
      let da = th - THB
      da = ((((da + Math.PI) % 6.2832) + 6.2832) % 6.2832) - Math.PI
      const d = Math.hypot(R * da, y - YB)
      const g = Math.exp((-d * d) / 0.22)
      let hue = prof[k][3]
      hue += (9 - hue) * 0.72 * g
      let sat = 92,
        lof = -6 * g,
        mul = 1

      // Lenticels: they ride the surface as it turns.
      if (hash(Math.floor(th * 13), Math.floor((y + 2) * 15)) < 0.085) {
        hue = 34
        sat = 48
        lof = -13
        mul = 0.66
      }
      push(R * ct + bend(y), y, R * st, a3, a1 * b3 - a3 * b1, -a1, hue, sat, lof, mul, 0)
    }
  }
}

// The stem: a curved tube.
function stemC(t) {
  return [bend(0.9 + 0.5 * t) + 0.1 * t * t, 0.9 + 0.5 * t, 0.075 * t]
}

function buildStem() {
  for (let t = 0; t <= 1.0001; t += 0.018) {
    const c = stemC(t)
    const d = [0.2 * t + 0.048 * (1.9 + 0.5 * t), 0.5, 0.075]
    const dl = Math.hypot(d[0], d[1], d[2])
    const T = [d[0] / dl, d[1] / dl, d[2] / dl]
    let U = [T[1], -T[0], 0]
    const ul = Math.hypot(U[0], U[1], U[2])
    U = [U[0] / ul, U[1] / ul, U[2] / ul]
    const V = [T[1] * U[2] - T[2] * U[1], T[2] * U[0] - T[0] * U[2], T[0] * U[1] - T[1] * U[0]]
    const rad = 0.052 - 0.022 * t
    for (let f = 0; f < 6.2832; f += 0.2) {
      const cf = Math.cos(f),
        sf = Math.sin(f)
      const a = U[0] * cf + V[0] * sf,
        b = U[1] * cf + V[1] * sf,
        cc = U[2] * cf + V[2] * sf
      push(c[0] + rad * a, c[1] + rad * b, c[2] + rad * cc, a, b, cc, 26, 40, -9, 1, 0)
    }
  }
}

function buildLeaf() {
  const base = stemC(0.6)
  let A = [0.86, 0.32, 0.4],
    B = [-0.36, 0.1, 0.84]
  const al = Math.hypot(...A),
    bl = Math.hypot(...B)
  A = A.map((v) => v / al)
  B = B.map((v) => v / bl)
  const Nv = [A[1] * B[2] - A[2] * B[1], A[2] * B[0] - A[0] * B[2], A[0] * B[1] - A[1] * B[0]]
  for (let u = 0; u <= 1.0001; u += 0.02) {
    const w = 0.3 * Math.sin(Math.PI * Math.pow(u, 0.85))
    for (let v = -w; v <= w; v += 0.016) {
      const len = 0.82 * u,
        curl = 0.6 * v * Math.abs(v)
      const rib = Math.abs(v) < 0.022 ? -10 : 0
      push(
        base[0] + A[0] * len + B[0] * v + Nv[0] * curl,
        base[1] + A[1] * len + B[1] * v + Nv[1] * curl,
        base[2] + A[2] * len + B[2] * v + Nv[2] * curl,
        Nv[0] + B[0] * v * 1.6,
        Nv[1] + B[1] * v * 1.6,
        Nv[2] + B[2] * v * 1.6,
        128,
        62,
        -4 + rib,
        1,
        0
      )
    }
  }
}

// Contact shadow: it sits the pear on the ground.
function buildShadow() {
  for (let rho = 0.04; rho <= 1.0; rho += 0.03) {
    const steps = Math.max(6, Math.round(rho * 150))
    for (let s = 0; s < steps; s++) {
      if (rho > 0.62 && hash(s, Math.round(rho * 100)) < (rho - 0.62) / 0.42) continue
      const f = (s / steps) * 6.2832
      push(
        0.95 * rho * Math.cos(f),
        -1.27,
        0.95 * rho * Math.sin(f),
        0,
        1,
        0,
        226,
        14,
        -20,
        1 - rho * 0.8,
        1
      )
    }
  }
}

buildBody()
buildStem()
buildLeaf()
buildShadow()

const N = _x.length
const PX = Float32Array.from(_x),
  PY = Float32Array.from(_y),
  PZ = Float32Array.from(_z)
const NX = Float32Array.from(_nx),
  NY = Float32Array.from(_ny),
  NZ = Float32Array.from(_nz)
const HU = Float32Array.from(_hu),
  SA = Float32Array.from(_sa),
  LO = Float32Array.from(_lb)
const MU = Float32Array.from(_mu),
  MD = Int8Array.from(_md)
_x.length = _y.length = _z.length = _nx.length = _ny.length = _nz.length = 0
_hu.length = _sa.length = _lb.length = _mu.length = _md.length = 0

// ---------------- colour ----------------
// HSL -> nearest ANSI-256 index, memoised on the quantised key the renderer
// builds, so a frame costs a handful of lookups rather than conversions.
const CUBE = [0, 95, 135, 175, 215, 255]
const ansiCache = new Map()

function hslToRgb(h, s, l) {
  s /= 100
  l /= 100
  const c = (1 - Math.abs(2 * l - 1)) * s
  const hp = (((h % 360) + 360) % 360) / 60
  const x = c * (1 - Math.abs((hp % 2) - 1))
  let r = 0,
    g = 0,
    b = 0
  if (hp < 1) [r, g, b] = [c, x, 0]
  else if (hp < 2) [r, g, b] = [x, c, 0]
  else if (hp < 3) [r, g, b] = [0, c, x]
  else if (hp < 4) [r, g, b] = [0, x, c]
  else if (hp < 5) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  const m = l - c / 2
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255]
}

function nearestLevel(v) {
  let best = 0,
    bd = Infinity
  for (let i = 0; i < 6; i++) {
    const d = Math.abs(CUBE[i] - v)
    if (d < bd) {
      bd = d
      best = i
    }
  }
  return best
}

function ansiFor(key) {
  let idx = ansiCache.get(key)
  if (idx !== undefined) return idx
  const h = (key / 10000) | 0,
    rest = key % 10000,
    s = (rest / 100) | 0,
    l = rest % 100
  const [r, g, b] = hslToRgb(h, s, l)

  const ri = nearestLevel(r),
    gi = nearestLevel(g),
    bi = nearestLevel(b)
  const cubeD = (CUBE[ri] - r) ** 2 + (CUBE[gi] - g) ** 2 + (CUBE[bi] - b) ** 2
  idx = 16 + 36 * ri + 6 * gi + bi

  // The grey ramp is finer than the cube along the diagonal.
  const avg = (r + g + b) / 3
  const gi2 = Math.max(0, Math.min(23, Math.round((avg - 8) / 10)))
  const gv = 8 + 10 * gi2
  const greyD = (gv - r) ** 2 + (gv - g) ** 2 + (gv - b) ** 2
  if (greyD < cubeD) idx = 232 + gi2

  ansiCache.set(key, idx)
  return idx
}

// ---------------- render ----------------
const TILT = 0.3,
  cT = Math.cos(TILT),
  sT = Math.sin(TILT)
const LX = -0.45,
  LY = 0.56,
  LZ = -0.7 // light
const HX = -0.24,
  HY = 0.3,
  HZ = -0.92 // half vector -> specular highlight
const DIST = 5.0
const ASPECT = 2.0 // a terminal cell is about twice as tall as it is wide

// How far the model reaches on screen, in unscaled projection units, over a
// full turn. Measured once so a frame can scale the pear to exactly fill the
// rows it is given — the menu has few to spare — without ever clipping the
// leaf at the top or the shadow at the bottom.
const EXTENT = (() => {
  let umin = Infinity,
    umax = -Infinity,
    vmin = Infinity,
    vmax = -Infinity
  for (let a = 0; a < 6.2832; a += 0.1) {
    const ca = Math.cos(a),
      sa = Math.sin(a)
    for (let i = 0; i < N; i++) {
      const x = PX[i] * ca + PZ[i] * sa
      const z = -PX[i] * sa + PZ[i] * ca
      const y2 = PY[i] * cT - z * sT
      const z2 = PY[i] * sT + z * cT
      const ooz = 1 / (z2 + DIST)
      const u = -y2 * ooz,
        v = x * ooz
      if (u < umin) umin = u
      if (u > umax) umax = u
      if (v < vmin) vmin = v
      if (v > vmax) vmax = v
    }
  }
  return { umin, umax, vmin, vmax }
})()

// `zoom` scales the pear past its fit: at 1 the whole fruit sits inside W×H;
// above 1 it overflows and the projection clips to the box, so a big enough
// zoom fills the frame with nothing but pear — which is how the intro grows it
// until it covers the screen.
function frame(spin, W, H, zoom = 1, bg = null) {
  // Fill the height, unless the width is the tighter fit.
  const K1 =
    zoom *
    Math.min(
      (H - 0.02) / (EXTENT.umax - EXTENT.umin),
      (W - 0.02) / (ASPECT * (EXTENT.vmax - EXTENT.vmin))
    )
  const cy = 0.01 - K1 * EXTENT.umin + (H - 0.02 - K1 * (EXTENT.umax - EXTENT.umin)) / 2
  const cx = W * 0.5 - (ASPECT * K1 * (EXTENT.vmax + EXTENT.vmin)) / 2

  const zb = new Float32Array(W * H)
  const cb = new Int8Array(W * H).fill(-1)
  const kb = new Int32Array(W * H)
  const ca = Math.cos(spin),
    sa = Math.sin(spin)

  for (let i = 0; i < N; i++) {
    const x = PX[i] * ca + PZ[i] * sa
    const z = -PX[i] * sa + PZ[i] * ca
    const y2 = PY[i] * cT - z * sT
    const z2 = PY[i] * sT + z * cT

    const ooz = 1 / (z2 + DIST)
    const xp = (cx + ASPECT * K1 * x * ooz) | 0
    const yp = (cy - K1 * y2 * ooz) | 0
    if (xp < 0 || xp >= W || yp < 0 || yp >= H) continue
    const idx = yp * W + xp
    if (ooz <= zb[idx]) continue

    let lum
    if (MD[i] === 1) {
      lum = 0.06 + 0.2 * MU[i]
    } else {
      const ax = NX[i] * ca + NZ[i] * sa
      const az = -NX[i] * sa + NZ[i] * ca
      const ay2 = NY[i] * cT - az * sT
      const az2 = NY[i] * sT + az * cT
      let d = ax * LX + ay2 * LY + az2 * LZ
      if (d < 0) d = 0
      let s = ax * HX + ay2 * HY + az2 * HZ
      if (s < 0) s = 0
      lum = (0.15 + 0.85 * d * d) * MU[i] + 0.85 * Math.pow(s, 24)
    }
    // Fog: what recedes dims, so the volume reads as it turns.
    lum *= 1 - 0.34 * ((z2 + 1.35) / 2.7)
    if (lum > 1) lum = 1
    if (lum < 0) lum = 0

    zb[idx] = ooz
    cb[idx] = Math.min(10, (lum * 11) | 0)
    kb[idx] =
      Math.round(HU[i] / 3) * 3 * 10000 +
      (SA[i] | 0) * 100 +
      Math.max(6, Math.min(74, Math.round((26 + 44 * lum + LO[i]) / 4) * 4))
  }

  // Emit with ANSI-256 colour, reusing the code while it does not change. Empty
  // cells are spaces unless `bg` is given, in which case they are a filled block
  // in that colour — folded into the same run tracking, so no colour bleeds past
  // where it was set. The intro uses it to flood the gaps and cover the screen.
  const rows = []
  for (let j = 0; j < H; j++) {
    let line = '',
      cur = -1
    for (let i = 0; i < W; i++) {
      const k = j * W + i
      if (cb[k] < 0) {
        if (bg == null) {
          line += ' '
          continue
        }
        if (bg !== cur) {
          line += `\x1b[38;5;${bg}m`
          cur = bg
        }
        line += '█'
        continue
      }
      const col = ansiFor(kb[k])
      if (col !== cur) {
        line += `\x1b[38;5;${col}m`
        cur = col
      }
      line += CH[cb[k]]
    }
    rows.push(cur === -1 ? line : line + '\x1b[0m')
  }
  return rows.join('\n')
}

module.exports = { frame }
