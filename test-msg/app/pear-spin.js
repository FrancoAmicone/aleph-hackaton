// Pera ASCII 3D rotativa — estilo donut.c (Andy Sloane).
//
// El CUERPO es una superficie de revolución (perfil de gota). El TALLO no: es
// un tubo curvado modelado aparte, para que caiga hacia un lado en vez de
// quedar como una patita recta. Ambos se rotan y proyectan al mismo z-buffer.
//
// frame(spin, W, H) -> string es PURA (mismo input, mismo output), lista para
// portar a un componente `tea`: view() la llama con un ángulo que avanza por tick.
//
// Uso:
//   node pear-spin.js            -> animación (Ctrl+C para salir)
//   node pear-spin.js frame 0.8  -> un frame a ese ángulo y sale (debug)

const LUM = '.,-~:;=!*#$@' // 12 niveles de luminancia, oscuro -> claro

// Rampas de color ANSI-256 (portable). Cuerpo: verde oscuro (sombra) -> verde
// -> amarillo (donde más pega la luz, la panza). Tallo: marrón oscuro -> claro.
const BODY = [22, 28, 34, 40, 76, 112, 148, 184, 220, 226]
const STEM = [58, 94, 130, 136, 166, 172]
const colorFor = (lum, isStem) => {
  const ramp = isStem ? STEM : BODY
  return ramp[Math.min(ramp.length - 1, Math.max(0, Math.floor(lum * ramp.length)))]
}

// Inclinación fija: se inclina primero y DESPUÉS se gira sobre la vertical del
// mundo, así el eje precesa y la silueta cambia -> se lee el volumen.
const TILT = -0.5

// --- vectores ---
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const scl = (a, s) => [a[0] * s, a[1] * s, a[2] * s]
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const norm = (a) => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1
  return [a[0] / l, a[1] / l, a[2] / l]
}

// --- geometría del cuerpo (revolución) ---
function profile(v) {
  const p = 0.6,
    q = 1.7
  const r = Math.pow(v, p) * Math.pow(1 - v, q) * 2.7
  const y = v * 2.35 - 1.15
  return { r, y }
}
const bodyPoint = (u, v) => {
  const { r, y } = profile(v)
  return [r * Math.cos(u), y, r * Math.sin(u)]
}
const TOP = 1.2 // y del extremo superior del cuerpo (v=1)

// --- geometría del tallo (tubo curvado que se cae hacia +x) ---
const stemC = (t) => [0.55 * t * t, TOP + t * 0.72, 0.12 * t * t]
const stemR = (t) => 0.095 * (1 - 0.5 * t) // afina hacia la punta

function frame(spin, W, H) {
  const out = new Array(W * H).fill(' ')
  const col = new Array(W * H).fill(0)
  const zbuf = new Array(W * H).fill(0)

  const cosT = Math.cos(TILT),
    sinT = Math.sin(TILT)
  const cosS = Math.cos(spin),
    sinS = Math.sin(spin)
  const rot = (p) => {
    const x1 = p[0]
    const y1 = p[1] * cosT - p[2] * sinT
    const z1 = p[1] * sinT + p[2] * cosT
    return [x1 * cosS + z1 * sinS, y1, -x1 * sinS + z1 * cosS]
  }

  const L = norm([-0.4, 0.75, -1])
  const V = [0, 0, -1]
  const Hh = norm(add(L, V))
  const AMB = 0.18

  const K2 = 5.2,
    K1 = W * K2 * 0.3
  const cx = W / 2,
    cy = H / 2,
    ASPECT = 0.5

  const plot = (P, N, isStem) => {
    const Pr = rot(P),
      Nr = rot(N)
    const z = Pr[2] + K2
    if (z <= 0) return
    const ooz = 1 / z
    const xp = Math.round(cx + K1 * ooz * Pr[0])
    const yp = Math.round(cy - K1 * ooz * Pr[1] * ASPECT)
    if (xp < 0 || xp >= W || yp < 0 || yp >= H) return
    const idx = xp + W * yp
    if (ooz <= zbuf[idx]) return
    const diff = Math.max(0, dot(Nr, L))
    const spec = Math.pow(Math.max(0, dot(Nr, Hh)), 24)
    let lum = AMB + (1 - AMB) * diff + 0.7 * spec
    if (lum > 1) lum = 1
    zbuf[idx] = ooz
    out[idx] = LUM[Math.min(LUM.length - 1, Math.floor(lum * (LUM.length - 1)))]
    col[idx] = colorFor(lum, isStem)
  }

  // Cuerpo
  const e = 0.001
  for (let v = 0; v <= 1; v += 0.008) {
    for (let u = 0; u < 2 * Math.PI; u += 0.04) {
      const P = bodyPoint(u, v)
      const Pu = sub(bodyPoint(u + e, v), bodyPoint(u - e, v))
      const Pv = sub(bodyPoint(u, Math.min(v + e, 1)), bodyPoint(u, Math.max(v - e, 0)))
      let N = cross(Pv, Pu)
      if (N[0] * P[0] + N[2] * P[2] < 0) N = scl(N, -1)
      plot(P, norm(N), false)
    }
  }

  // Tallo: tubo alrededor de la curva stemC.
  for (let t = 0; t <= 1; t += 0.02) {
    const C = stemC(t)
    const T = norm(sub(stemC(Math.min(t + e, 1)), stemC(Math.max(t - e, 0))))
    const N1 = norm(cross(T, [0, 0, 1]))
    const N2 = norm(cross(T, N1))
    const rs = stemR(t)
    for (let a = 0; a < 2 * Math.PI; a += 0.4) {
      const dir = norm(add(scl(N1, Math.cos(a)), scl(N2, Math.sin(a))))
      plot(add(C, scl(dir, rs)), dir, true)
    }
  }

  // Emite con color ANSI-256, reusando el código mientras no cambie.
  const rows = []
  for (let y = 0; y < H; y++) {
    let line = '',
      cur = -1
    for (let x = 0; x < W; x++) {
      const idx = x + y * W
      const ch = out[idx]
      if (ch === ' ') {
        line += ' '
        continue
      }
      if (col[idx] !== cur) {
        line += `\x1b[38;5;${col[idx]}m`
        cur = col[idx]
      }
      line += ch
    }
    rows.push(line + '\x1b[0m')
  }
  return rows.join('\n')
}

module.exports = { frame }

// ---- CLI ----
if (require.main === module) {
  const W = 48,
    H = 32
  if (process.argv[2] === 'frame') {
    console.log(frame(Number(process.argv[3] || 0), W, H))
    process.exit(0)
  }
  process.stdout.write('\x1b[2J\x1b[?25l')
  let a = 0
  const iv = setInterval(() => {
    a += 0.045
    process.stdout.write('\x1b[H' + frame(a, W, H))
  }, 33)
  const bye = () => {
    clearInterval(iv)
    process.stdout.write('\x1b[?25h\n')
    process.exit(0)
  }
  process.on('SIGINT', bye)
}
