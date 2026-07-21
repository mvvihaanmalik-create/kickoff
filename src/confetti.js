// Confetti — a lightweight canvas particle burst for the goal celebration.
// Self-contained: no assets, capped particle count, short-lived (<~1.8s), so it
// never costs frame rate. Driven by the host loop via step(dt) — no own rAF.

const CFG = {
  count: 130, // particles per burst (capped)
  life: 1.7, // s: max lifetime
  gravity: 1400, // px/s²
  drag: 0.86, // per frame-ish velocity retention
  spread: 2.2, // rad: cone width of the initial fan
  speedMin: 520,
  speedMax: 1500,
  // Warm, celebratory palette with one cool pop (kept mostly warm per the brief).
  colors: ["#f4c15a", "#fff6e6", "#e8963b", "#e2564d", "#8fb8ff", "#f7d9a0"],
};

let canvas = null;
let ctx = null;
let dpr = 1;
const parts = [];

// A soft, feathered charcoal blob, pre-rendered once — drawn (scaled) per
// graphite particle so the dissolve reads as soft smudge, not hard dots. Cheap:
// one drawImage per particle.
// Premium vapour. The earlier version used five saturated rainbow hues at small
// size, which reads as cheap for one reason: you can see the individual dots and
// their colours argue with each other. High-end motion graphics do the opposite —
// ONE narrow hue family (here a cool blue→periwinkle drift), sprites large enough
// that neighbours overlap into a continuous mass, and very low per-puff alpha so
// density comes from accumulation rather than opacity. The result reads as one
// luminous cloud with internal depth instead of a handful of coloured balls.
const SMOKE_HUES = [
  [176, 206, 255], // pale ice — the highlights
  [138, 170, 246], // soft periwinkle
  [110, 140, 232], // the body of the cloud
  [206, 220, 255], // near-white lift
];
let smokeSprites = null;

// Extremely soft falloff: no hot core, no hard shoulder. Alpha stays under 0.30
// at the centre so overlap — not opacity — builds the density.
function makeSmokeSprite([r, g, b]) {
  const s = 256; // large, so upscaling never shows a hard sprite edge
  const c = document.createElement("canvas");
  c.width = c.height = s;
  const x = c.getContext("2d");
  const grad = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grad.addColorStop(0.00, `rgba(${r},${g},${b},0.28)`);
  grad.addColorStop(0.22, `rgba(${r},${g},${b},0.20)`);
  grad.addColorStop(0.46, `rgba(${r},${g},${b},0.10)`);
  grad.addColorStop(0.70, `rgba(${r},${g},${b},0.035)`);
  grad.addColorStop(1.00, `rgba(${r},${g},${b},0)`);
  x.fillStyle = grad;
  x.beginPath();
  x.arc(s / 2, s / 2, s / 2, 0, Math.PI * 2);
  x.fill();
  return c;
}

function makeSmokeSprites() {
  return SMOKE_HUES.map(makeSmokeSprite);
}

export function init(cv) {
  canvas = cv;
  ctx = cv.getContext("2d");
  if (!smokeSprites) smokeSprites = makeSmokeSprites();
  resize();
}

export function resize() {
  if (!canvas) return;
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor((window.innerWidth || 1280) * dpr);
  canvas.height = Math.floor((window.innerHeight || 800) * dpr);
  canvas.style.width = "100%";
  canvas.style.height = "100%";
}

// Fire a burst centered on (x, y), fanning up-and-out (biased toward `dir`).
export function burst(x, y, dir = -Math.PI / 2) {
  for (let i = 0; i < CFG.count; i++) {
    const a = dir + (Math.random() - 0.5) * CFG.spread;
    const sp = CFG.speedMin + Math.random() * (CFG.speedMax - CFG.speedMin);
    parts.push({
      x,
      y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 18,
      w: 6 + Math.random() * 8,
      h: 8 + Math.random() * 10,
      round: Math.random() < 0.25, // a few circles among the ribbons
      color: CFG.colors[(Math.random() * CFG.colors.length) | 0],
      t: 0,
      life: CFG.life * (0.6 + Math.random() * 0.4),
    });
  }
  // Hard cap so repeated goals can never pile up unbounded.
  if (parts.length > CFG.count * 2) parts.splice(0, parts.length - CFG.count * 2);
}

export function active() {
  return parts.length > 0;
}

// The Break — the thought bursts into luminous coloured smoke. Puffs originate
// across the whole ball (so it reads as the object coming apart, not a point
// burst), fan along the flick, churn on curl/turbulence, then billow UP and
// outward as they expand and fade — smoke, not falling dust.
// `density` scales the puff count: 1 for the full burst, a small fraction for
// the in-flight trail (which is emitted many times a second and must stay thin).
export function smudge(x, y, dir = 0, ballR = 40, power = 1, density = 1) {
  if (!smokeSprites) smokeSprites = makeSmokeSprites();
  const heavy = 0.5 + 0.5 * Math.min(1, power); // harder flick → bigger, faster
  const N = Math.max(1, Math.round((120 + 100 * heavy) * density));
  for (let i = 0; i < N; i++) {
    // Origin sampled across the ball's disc (√ for even area distribution).
    const oa = Math.random() * Math.PI * 2;
    const orr = Math.sqrt(Math.random()) * ballR;
    const ox = x + Math.cos(oa) * orr;
    const oy = y + Math.sin(oa) * orr;
    // Velocity: a wide fan along the flick, blended with a radial "burst apart"
    // from the ball centre so inner bits push out too.
    const a = dir + (Math.random() - 0.5) * 2.4;
    const sp = (50 + Math.random() * 520) * heavy;
    const ra = Math.atan2(oy - y, ox - x) || a;
    const rad = 0.35 + Math.random() * 0.3;
    parts.push({
      x: ox, y: oy,
      vx: Math.cos(a) * sp * (1 - rad) + Math.cos(ra) * sp * 0.6 * rad,
      vy: Math.sin(a) * sp * (1 - rad) + Math.sin(ra) * sp * 0.6 * rad,
      smudge: true,
      g: -0.05, // buoyant: smoke rises rather than falling
      sprite: (Math.random() * SMOKE_HUES.length) | 0,
      // Bigger and more varied than before: large puffs form the mass, small
      // ones ride its edges, and the overlap is what makes it read as vapour.
      size: 18 + Math.random() * 40,
      grow: 40 + Math.random() * 90,
      swirl: (Math.random() - 0.5) * 2.8,
      seed: Math.random() * 100,
      alpha: 0.55 + Math.random() * 0.45,
      t: 0,
      // Longer, staggered lives so the cloud thins out gradually instead of
      // all the puffs blinking out together.
      life: 1.1 + Math.random() * 1.5,
    });
  }
  if (parts.length > 420) parts.splice(0, parts.length - 420);
}

// Advance + draw one frame. dt in seconds.
export function step(dt) {
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!parts.length) return;
  const damp = Math.pow(CFG.drag, dt * 60);
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.t += dt;
    if (p.t >= p.life) {
      parts.splice(i, 1);
      continue;
    }
    const fade = 1 - p.t / p.life;

    // ── Soft graphite smudge — curl/turbulence drift + a feathered sprite that
    // grows and thins. Rendered separately (no rotate/fill path).
    if (p.smudge) {
      // Curl field: a cheap divergence-free-ish swirl so the cloud churns like
      // settling dust rather than flying in straight lines.
      p.vx += Math.sin(p.y * 0.012 + p.seed + p.t * 1.6) * p.swirl * 34 * dt;
      p.vy += Math.cos(p.x * 0.012 + p.seed * 1.7 + p.t * 1.6) * p.swirl * 34 * dt;
      p.vy += CFG.gravity * p.g * dt;
      const sd = Math.pow(0.9, dt * 60); // stronger drag → floaty settle
      p.vx *= sd;
      p.vy *= sd;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const sz = (p.size + p.t * p.grow) * 2 * dpr; // sprite covers ~2× radius
      // Bloom in over the first ~90ms, then fade on a cubic tail. The quick
      // swell is what sells "it burst apart"; the long tail is what keeps it
      // from looking like dots switching off.
      const inn = Math.min(1, p.t / 0.09);
      const a = inn * p.alpha * fade * fade * (0.55 + 0.45 * fade);
      ctx.globalAlpha = Math.max(0, a);
      ctx.drawImage(smokeSprites[p.sprite || 0], p.x * dpr - sz / 2, p.y * dpr - sz / 2, sz, sz);
      continue;
    }

    p.vy += CFG.gravity * (p.g ?? 1) * dt;
    p.vx *= damp;
    p.vy *= damp;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.rot += p.vr * dt;

    ctx.save();
    ctx.globalAlpha = Math.min(1, fade * 1.6);
    ctx.translate(p.x * dpr, p.y * dpr);
    ctx.rotate(p.rot);
    ctx.fillStyle = p.color;
    if (p.round) {
      ctx.beginPath();
      ctx.arc(0, 0, (p.w * 0.5) * dpr, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Flutter: squash width by the spin so ribbons flip like real paper.
      const w = p.w * Math.abs(Math.cos(p.rot)) * dpr;
      ctx.fillRect(-w / 2, (-p.h / 2) * dpr, w, p.h * dpr);
    }
    ctx.restore();
  }
}
