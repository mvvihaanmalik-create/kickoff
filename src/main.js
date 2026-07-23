// KICKOFF — Phase 1: ball physics only, zero visual polish.
//
// The whole game lives here. One rAF loop, one pure integrate(dt) step shared
// by the live loop and the synchronous debug hooks. Three behaviors, one model:
//
//   • CHASE  — an under-damped spring toward the cursor: it accelerates, over-
//              shoots, corrects, settles. Curious, not obedient. Fast/far cursor
//              moves make a bigger displacement → bigger force → more overshoot,
//              for free (no per-phase scripting).
//   • KICK   — a click/drag adds a velocity impulse scaled by input intensity,
//              plus a spin value that curves the path (a cheap Magnus feel) and
//              decays over time.
//   • ROAM   — when left alone, the ball never freezes: it drifts at a steady
//              speed and bounces off all four viewport edges, DVD-logo style,
//              indefinitely. The moment the cursor moves again it cross-fades
//              back into CHASE.
//
// The blend between CHASE and ROAM is a single scalar `engage` (0 = roam,
// 1 = chase) that rises fast on cursor movement and falls gently into roam —
// so the switch cross-fades the velocity instead of snapping.
//
// Phase 3 adds a GOAL on the right edge and a phase machine (play → scored →
// returning) for the celebration and the ease back to idle.

import * as confetti from "./confetti.js";
import * as audio from "./audio.js";
import { initChrome, measureChrome } from "./chrome.js";

// ─────────────────────────────────────────────────────────────────────────
// CONFIG — every feel knob in one place. These WILL be retuned.
// ─────────────────────────────────────────────────────────────────────────
export const CONFIG = {
  // Chase spring (under-damped → overshoot + settle).
  chaseOmega: 5.6, // rad/s: how briskly it springs toward the cursor
  chaseZeta: 0.34, // <1 = under-damped; lower = more overshoot
  deadzone: 26, // px: stop pulling this close to the cursor (circle, don't jitter)
  surge: 0.16, // trot-like pulsing of the pull so it reads as a gait, not a glide

  // Engagement cross-fade (chase ↔ roam).
  engageHold: 2.0, // s: cursor idle this long → start drifting into roam
  engageRise: 9.0, // per s: perks into chase quickly when the cursor moves
  engageFall: 1.1, // per s: eases down into roam slowly (the cross-fade)

  // Roam (DVD drift).
  roamSpeed: 155, // px/s: gentle constant wander speed
  roamSteer: 1.6, // per s: how firmly it holds roamSpeed (tops up wall losses)

  // Kick impulse. Tuned punchier — a kick should feel like it has real weight
  // behind it, not a nudge; the ball leaves fast and travels.
  kickFromSpeed: 1.18, // flick speed → impulse (a fast drag hits harder)
  kickPokeGain: 3.8, // poke distance → impulse (a far poke hits harder)
  kickMin: 340, // px/s: even a soft tap lands a real little pop
  kickMax: 3000, // px/s: cap so a hard strike stays fast but on-screen
  flickIsDrag: 14, // px: drag longer than this reads as a swipe, not a poke

  // Spin / curve (the cheap Magnus approximation).
  spinFromKick: 0.9, // how much flick-curl / redirect becomes spin
  spinBase: 0.25, // a little spin on every kick so none flies dead-straight
  spinCurve: 0.9, // heading turn rate ≈ this·spin (rad/s); bends the path visibly
  spinDecay: 1.4, // per s: spin bleeds off

  // Global.
  rollFriction: 0.7, // per s: light rolling resistance on a free/kicked ball
  maxSpeed: 2600, // px/s safety clamp
  restitution: 0.88, // velocity kept on a wall bounce
  radius: 36, // px: must match #ball size in the HTML

  // Reactive props (elements the ball "tackles").
  elemRestitution: 0.72, // velocity the ball keeps when it caroms off a prop
  tackleGain: 1.3, // impact speed → how hard the prop is knocked
  tackleOmega: 15, // rad/s: prop spring back to rest
  tackleZeta: 0.4, // <1 = a little elastic recovery overshoot
  tackleMax: 60, // px: cap on how far a prop is displaced
  tackleRot: 0.13, // deg per px of horizontal offset (knocked-askew look)
  tackleCooldown: 0.11, // s: min gap between knocks from one prop (anti-buzz)

  // Goal (right edge) + celebration.
  goalDepth: 128, // px: how far the goal reaches in from the right edge
  goalMouth: 250, // px: vertical height of the goal opening
  goalMinMouth: 180, // px: keep the mouth usable on short viewports
  scoreSpeed: 430, // px/s: a shot must be at least this fast to count (roam can't)
  celebrateMs: 1900, // how long the celebration holds before the ball returns
  returnOmega: 3.6, // rad/s: critically-damped glide back to center after a goal
  shakeAmp: 16, // px: peak camera-shake amplitude on a goal
  shakeMs: 520, // ms: camera-shake duration

  // Roulette gesture — draw a circle around the ball → a spin flourish. ONE
  // gesture only (per the brief). It reuses the real spin mechanism: a big spin
  // burst + a tangential boost makes the ball loop a tight, decaying spiral.
  rouletteWindowMs: 1300, // the circle must be drawn within this window
  rouletteMinTurn: 5.4, // rad of accumulated turning to count (~0.86 of a full turn)
  rouletteMinR: 42, // px: average loop radius floor (ignore tiny jitter loops)
  rouletteMaxR: 430, // px: and ceiling (ignore giant sweeps)
  rouletteNearBall: 270, // px: the loop's centroid must be near the ball
  rouletteCooldownMs: 1200, // min gap between roulettes
  rouletteSpin: 13, // spin burst that bends the path into a tight spiral
  rouletteSpeed: 640, // px/s tangential boost so the ball actually loops
  flourishSpin: 1500, // deg/s extra visual whirl of the ball surface
  flourishDecay: 3.0, // per s: the whirl bleeds off

  // Mental Cache.
  thoughtCap: 120, // max characters shown on the ball face (the card shows the rest)
  ringCap: 22, // ≤ this many chars gets the 3D revolving wrap; longer stays a flat readable band
  breatheAmp: 0.03, // idle breathing: 100% → 103% → 100%
  breathePeriod: 4.2, // s per breathing cycle
  storeCaptureR: 96, // px: how near the goal the ball must come to be kept
  // (sized to the goal mouth so a manual flick into it registers naturally)
  storeWindowMs: 1800, // ms: only capture within this long after a user interaction
  storeMs: 340, // ms: the sink-into-dish animation
  wobbleAmp: 5, // px: idle wobble of shelf spheres (resting-together, no collision)
  readRate: 6.5, // per s: sphere↔card unwrap cross-transition speed
  breakSpeed: 900, // px/s: impact speed above which hitting an edge dissolves the
  // thought — high enough that a gentle drift/roam (155) never triggers it, only
  // a genuinely committed hard flick.
};

// ─────────────────────────────────────────────────────────────────────────
// State (viewport-pixel coordinates, origin top-left, center of ball = p).
// ─────────────────────────────────────────────────────────────────────────
const state = {
  px: 0,
  py: 0,
  vx: 0,
  vy: 0,
  angle: 0, // accumulated roll (deg)
  spin: 0, // signed angular impulse driving the path curve
  flourish: 0, // deg/s of extra visual whirl (roulette gesture), decays
  engage: 0, // 0 = roam, 1 = chase
  // Cursor tracking.
  mx: 0,
  my: 0,
  hasCursor: false,
  lastMoveAt: -1e9, // performance.now() of the last real cursor movement
  phase: "play", // "play" | "scored" | "returning"
  scoredAt: 0, // performance.now() when the last goal was scored
  goals: 0, // how many goals scored this session (for tests / feel)
  // Mental-cache: the active thought carried by the ball.
  visible: true, // in mental-cache mode the ball is hidden until a thought exists
  text: "", // the active thought's text
  thoughtId: null, // the active thought's id
  url: "", // source page, when captured from a tab
  storeAt: 0, // performance.now() when the sink-into-dish began
  storeScale: 1, // 1 → 0 as the ball sinks into the dish
  reading: false, // Unwrap: the sphere is frozen and reading as a flat card
  readAlpha: 0, // 0 = full sphere, 1 = full card (tweened cross-transition)
  letGoAt: 0, // performance.now() when the "let it go" flick started
  trailAt: 0, // last vapour-trail emission during that flight
};

let ball, body, shadowEl, initialized = false;
let goalEl, netEl, stageEl, flashEl; // DOM for the goal + celebration
let shakeUntil = 0; // performance.now() the camera shake ends

// Root/mode — the SAME engine drives the standalone page and the extension
// overlay. `ROOT` scopes every element lookup (document for the page, the
// injected stage for the overlay, so ids can't collide with an arbitrary host
// page). `OVERLAY` disables the spatial goal-scoring (in the overlay the goal
// fires from the session timer, not from kicking the ball into a zone).
let ROOT = document;
let OVERLAY = false;
let MENTAL = false; // "Mental Cache" mode: no ball until a thought is created; the
// active ball carries a text face + idle breathing; spatial goal stays off.
let faceEl = null; // the ball's upright text-label plate (mental-cache mode)
let ballR = CONFIG.radius; // physics radius; overridable per-mount (opts.radius)
const qId = (id) => ROOT.querySelector("#" + id);

// Mental-cache: the dish (store target), a store callback, per-frame hooks for
// the shelf, and the timestamp of the last deliberate user interaction (so idle
// roam can never accidentally get captured by the dish).
let dish = null; // { x, y } viewport coords of the dish center
let onStore = null; // (thought) => void — fired when a thought sinks into the dish
let onBreak = null; // (thought) => void — fired when a thought is broken (discarded)
let frameHooks = [];
let lastUserInteract = -1e9;
// The engine's own clock (whatever `now` integrate was last driven with). Actions
// triggered from outside (Keep / Let go) must stamp with THIS, not
// performance.now(), or their timers are compared against a different clock.
let engineNow = 0;
// How the current sink-into-goal should resolve: parked for later, finished, or
// snoozed until a wake time. Read by finishStore.
let storeMode = "keep";
let snoozeUntil = 0;

// Viewport size — polled every frame, never cached on a resize event, because
// the preview pane can load at 0×0 and never fire `resize`.
function vw() {
  return window.innerWidth || document.documentElement.clientWidth || 1280;
}
function vh() {
  return window.innerHeight || document.documentElement.clientHeight || 800;
}

// ─────────────────────────────────────────────────────────────────────────
// Reactive props — real DOM elements the ball tackles. Each carries a spring
// offset (ox,oy + velocity) that a hit knocks, then eases back to rest. The
// ball caroms off the prop's REST box (kept fixed for stable collision) while
// the visible element recoils on top — reads as "hit and recovered".
// ─────────────────────────────────────────────────────────────────────────
const props = [];

function initProps() {
  ROOT.querySelectorAll(".reactive").forEach((el) => {
    props.push({ el, box: null, ox: 0, oy: 0, ovx: 0, ovy: 0, cool: 0 });
  });
  measureProps();
}

// Rest bounding boxes in viewport coords — measured with any offset zeroed so
// the box is the element's true resting footprint. Recomputed on viewport size
// change (see the poll in integrate).
function measureProps() {
  for (const p of props) {
    const savedT = p.el.style.transform;
    p.el.style.transform = "";
    const r = p.el.getBoundingClientRect();
    p.el.style.transform = savedT;
    p.box = { l: r.left, t: r.top, R: r.right, B: r.bottom };
  }
}

// Swept circle-vs-box: segment (x0,y0)→(x1,y1) against a box already expanded
// by the ball radius. Returns the entry point + outward normal, or null.
function sweptBox(x0, y0, x1, y1, E) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  let tmin = 0;
  let tmax = 1;
  let nx = 0;
  let ny = 0;
  if (Math.abs(dx) < 1e-9) {
    if (x0 < E.l || x0 > E.R) return null;
  } else {
    let t1 = (E.l - x0) / dx;
    let t2 = (E.R - x0) / dx;
    let sign = -1;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; sign = 1; }
    if (t1 > tmin) { tmin = t1; nx = sign; ny = 0; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  if (Math.abs(dy) < 1e-9) {
    if (y0 < E.t || y0 > E.B) return null;
  } else {
    let t1 = (E.t - y0) / dy;
    let t2 = (E.B - y0) / dy;
    let sign = -1;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; sign = 1; }
    if (t1 > tmin) { tmin = t1; nx = 0; ny = sign; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  if (tmin <= 0 || tmin >= 1) return null;
  return { x: x0 + dx * tmin, y: y0 + dy * tmin, nx, ny };
}

// Resolve the ball against every prop: bounce the ball, knock the prop.
function resolveProps(prevX, prevY, now) {
  const r = ballR;
  for (const p of props) {
    if (!p.box) continue;
    const E = { l: p.box.l - r, t: p.box.t - r, R: p.box.R + r, B: p.box.B + r };
    let nx = 0;
    let ny = 0;
    let hit = false;

    if (state.px > E.l && state.px < E.R && state.py > E.t && state.py < E.B) {
      // Ended inside the expanded box → push out along the shallowest face.
      const dl = state.px - E.l;
      const dr = E.R - state.px;
      const dt2 = state.py - E.t;
      const db = E.B - state.py;
      const m = Math.min(dl, dr, dt2, db);
      if (m === dl) { state.px = E.l; nx = -1; }
      else if (m === dr) { state.px = E.R; nx = 1; }
      else if (m === dt2) { state.py = E.t; ny = -1; }
      else { state.py = E.B; ny = 1; }
      hit = true;
    } else {
      // Tunnelled across in one step → resolve at the entry point.
      const s = sweptBox(prevX, prevY, state.px, state.py, E);
      if (s) {
        state.px = s.x + s.nx * 0.01;
        state.py = s.y + s.ny * 0.01;
        nx = s.nx;
        ny = s.ny;
        hit = true;
      }
    }

    if (!hit) continue;

    const vn = state.vx * nx + state.vy * ny; // <0 while moving into the prop
    if (vn >= 0) continue;
    const impact = -vn; // approach speed = impact force
    const spd = Math.hypot(state.vx, state.vy) || 1;
    const dirx = state.vx / spd;
    const diry = state.vy / spd;

    // Bounce the ball off the prop.
    state.vx -= (1 + CONFIG.elemRestitution) * vn * nx;
    state.vy -= (1 + CONFIG.elemRestitution) * vn * ny;

    // Knock the prop along the ball's travel, scaled by impact force.
    if (now > p.cool) {
      const knock = Math.min(impact, CONFIG.maxSpeed) * CONFIG.tackleGain;
      p.ovx += dirx * knock;
      p.ovy += diry * knock;
      p.cool = now + CONFIG.tackleCooldown * 1000;
    }
  }
}

// Advance each prop's recoil spring back toward rest.
function stepProps(dt) {
  const k = CONFIG.tackleOmega * CONFIG.tackleOmega;
  const c = 2 * CONFIG.tackleZeta * CONFIG.tackleOmega;
  for (const p of props) {
    p.ovx += (k * -p.ox - c * p.ovx) * dt;
    p.ovy += (k * -p.oy - c * p.ovy) * dt;
    p.ox += p.ovx * dt;
    p.oy += p.ovy * dt;
    // Clamp displacement so a max-power strike can't fling a prop off-screen.
    const d = Math.hypot(p.ox, p.oy);
    if (d > CONFIG.tackleMax) {
      const s = CONFIG.tackleMax / d;
      p.ox *= s;
      p.oy *= s;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Goal — a target zone on the right edge. Its left plane `zx` sits inside the
// right wall, so a fast enough shot enters the zone and scores before it would
// reach the wall; a slow (roam) ball crosses the same line under the speed
// threshold, doesn't score, and simply bounces off the wall.
// ─────────────────────────────────────────────────────────────────────────
function getGoal(W, H) {
  const mouth = Math.min(CONFIG.goalMouth, Math.max(CONFIG.goalMinMouth, H * 0.42));
  const yTop = (H - mouth) / 2;
  return { zx: W - CONFIG.goalDepth, yTop, yBot: yTop + mouth, depth: CONFIG.goalDepth };
}

// Keep the goal DOM element matched to the scoring geometry.
function layoutGoal(W, H) {
  if (!goalEl) return;
  const g = getGoal(W, H);
  goalEl.style.left = `${g.zx}px`;
  goalEl.style.top = `${g.yTop}px`;
  goalEl.style.width = `${g.depth}px`;
  goalEl.style.height = `${g.yBot - g.yTop}px`;
}

// Restart a one-shot CSS animation class so it can replay on the next goal.
// Exported: the overlay widget reuses this for its own one-shot cues.
export function restartAnim(el, cls) {
  if (!el) return;
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

// The celebration: net billow, warm flash, confetti at the goal, crowd cheer,
// camera shake. The ball is handled by the phase machine in integrate().
function celebrate(W, H, now) {
  const g = getGoal(W, H);
  restartAnim(netEl, "is-billow");
  restartAnim(flashEl, "is-flash");
  const cx = g.zx + g.depth * 0.4;
  const cy = (g.yTop + g.yBot) / 2;
  confetti.burst(cx, cy, -Math.PI / 2); // fan upward out of the net
  confetti.burst(cx, cy, -Math.PI * 0.5 - 0.9); // a second, angled fan for volume
  audio.cheer();
  shakeUntil = now + CONFIG.shakeMs;
}

// ─────────────────────────────────────────────────────────────────────────
// The one physics step. Pure w.r.t. `state` + CONFIG + a supplied `now`.
// dt in seconds. Called by the rAF loop (real dt) and by __step (fixed dt).
// ─────────────────────────────────────────────────────────────────────────
let lastW = 0;
let lastH = 0;

function integrate(dt, now) {
  engineNow = now; // keep externally-triggered actions on the same clock
  const W = vw();
  const H = vh();
  const r = ballR;

  // Re-measure prop rest boxes + re-layout the goal when the viewport changes
  // (CSS-laid-out, so they only move on resize). Polled, never trusting `resize`.
  if (W !== lastW || H !== lastH) {
    lastW = W;
    lastH = H;
    measureProps();
    layoutGoal(W, H);
    confetti.resize();
    measureChrome(); // keep glass hover boxes in sync with layout
  }

  // ── Unwrap: tween the sphere↔card cross-fade every frame. While reading, the
  // ball is frozen (the card is a static readable panel); physics resume the
  // instant it re-wraps.
  const readTarget = state.reading ? 1 : 0;
  state.readAlpha += (readTarget - state.readAlpha) * Math.min(1, CONFIG.readRate * dt);
  if (state.reading) return;

  // ── Letting go: the flicked-away thought flies briefly, then dissolves in
  // mid-air. A deliberate discard — never an accidental corner-crash.
  if (state.phase === "lettinggo") {
    state.vy += 300 * dt; // a little gravity so it arcs as it leaves
    state.px += state.vx * dt;
    state.py += state.vy * dt;
    state.angle += ((state.vx * dt) / r) * (180 / Math.PI);
    // A vapour wake, emitted every ~28ms of flight. Without it a 3400px/s ball
    // is just a jump cut; the trail is what makes the speed legible.
    if (now - state.trailAt > 28) {
      state.trailAt = now;
      confetti.smudge(state.px - Math.sign(state.vx) * r * 0.5, state.py,
                      state.vx < 0 ? 0 : Math.PI, r * 0.45, 0.12, 0.05);
    }
    // Burst when it reaches an edge, or after a longer flight if it never does —
    // whichever comes first, so the dissolve always happens on screen.
    const atEdge = state.px < r * 0.5 || state.px > W - r * 0.5 ||
                   state.py < r * 0.5 || state.py > H - r * 0.5;
    if (atEdge || now - state.letGoAt > 900) breakThought(now, W, H);
    stepProps(dt);
    return;
  }

  // ── Storing: the ball sinks into the dish (scale → 0), then hands the thought
  // off to the shelf. Runs instead of normal physics.
  if (state.phase === "storing") {
    const p = Math.min(1, (now - state.storeAt) / CONFIG.storeMs);
    if (dish) {
      // A STRIKE into the goal, not a glide: accelerate hard toward the mouth so
      // Keep feels like burying a shot. Rate ramps with p (18→30) so it snaps
      // in decisively, and shrink is back-loaded (p²) so it stays ball-sized and
      // fast most of the flight, collapsing only as it hits the net.
      const rate = Math.min(1, (18 + 12 * p) * dt);
      state.px += (dish.x - state.px) * rate;
      state.py += (dish.y - state.py) * rate;
    }
    state.storeScale = 1 - p * p;
    if (p >= 1) finishStore();
    return;
  }

  // ── Celebration phases: the net holds the ball, then it glides home. These
  // run instead of the normal play physics (no chase, no scoring).
  if (state.phase === "scored") {
    state.vx *= Math.pow(0.05, dt); // the net absorbs the shot
    state.vy *= Math.pow(0.05, dt);
    state.px += state.vx * dt;
    state.py += state.vy * dt;
    stepProps(dt);
    if (now - state.scoredAt > CONFIG.celebrateMs) state.phase = "returning";
    return;
  }
  if (state.phase === "returning") {
    // Critically-damped glide back to the center of the pitch.
    const kR = CONFIG.returnOmega * CONFIG.returnOmega;
    const cR = 2 * CONFIG.returnOmega;
    const tx = W / 2;
    const ty = H / 2;
    state.vx += (kR * (tx - state.px) - cR * state.vx) * dt;
    state.vy += (kR * (ty - state.py) - cR * state.vy) * dt;
    state.px += state.vx * dt;
    state.py += state.vy * dt;
    state.angle += ((state.vx * dt) / r) * (180 / Math.PI);
    stepProps(dt);
    if (Math.hypot(tx - state.px, ty - state.py) < 6 && Math.hypot(state.vx, state.vy) < 30) {
      state.phase = "play";
    }
    return;
  }

  // ── Engagement: rise fast when the cursor is moving, fall slowly into roam.
  const idleFor = (now - state.lastMoveAt) / 1000;
  const target = state.hasCursor && idleFor < CONFIG.engageHold ? 1 : 0;
  const eRate = target > state.engage ? CONFIG.engageRise : CONFIG.engageFall;
  state.engage += (target - state.engage) * Math.min(1, eRate * dt);
  const e = state.engage;

  // ── CHASE force: under-damped spring toward the cursor, gated by engagement.
  const k = CONFIG.chaseOmega * CONFIG.chaseOmega;
  const c = 2 * CONFIG.chaseZeta * CONFIG.chaseOmega;
  const dxc = state.mx - state.px;
  const dyc = state.my - state.py;
  const dist = Math.hypot(dxc, dyc) || 1e-4;
  // Fade the pull inside the deadzone so it circles the cursor instead of jittering.
  const near = Math.min(1, dist / CONFIG.deadzone);
  // A gentle gait so the approach pulses like a trot rather than a dead glide.
  const surge =
    1 - CONFIG.surge + CONFIG.surge * (0.5 + 0.5 * Math.sin(now * 0.006));
  const pull = k * near * surge;
  let ax = e * (pull * dxc - c * state.vx);
  let ay = e * (pull * dyc - c * state.vy);

  // ── ROAM force: steer the speed toward roamSpeed without changing heading;
  // wall bounces set the heading, this keeps it perpetually moving.
  const sp = Math.hypot(state.vx, state.vy) || 1e-4;
  const rx = (state.vx / sp) * CONFIG.roamSpeed - state.vx;
  const ry = (state.vy / sp) * CONFIG.roamSpeed - state.vy;
  ax += (1 - e) * CONFIG.roamSteer * rx;
  ay += (1 - e) * CONFIG.roamSteer * ry;

  // ── Rolling friction (light; lets kicks roll far and roam coast).
  ax -= CONFIG.rollFriction * state.vx * e; // only damp while chasing/settling
  ay -= CONFIG.rollFriction * state.vy * e;

  // ── Spin → a force perpendicular to travel that curves the path. Rotating
  // the velocity vector (ax = -g·vy, ay = g·vx) does no work, so it only bends
  // the path — never adds energy. Accel magnitude = spinCurve·spin·speed.
  if (Math.abs(state.spin) > 1e-4) {
    const g = CONFIG.spinCurve * state.spin;
    ax += -g * state.vy;
    ay += g * state.vx;
    state.spin *= Math.exp(-CONFIG.spinDecay * dt);
  }

  // ── Integrate velocity, clamp for safety.
  state.vx += ax * dt;
  state.vy += ay * dt;
  const speed = Math.hypot(state.vx, state.vy);
  if (speed > CONFIG.maxSpeed) {
    const s = CONFIG.maxSpeed / speed;
    state.vx *= s;
    state.vy *= s;
  }

  // ── Integrate position.
  const prevX = state.px;
  const prevY = state.py;
  state.px += state.vx * dt;
  state.py += state.vy * dt;

  // ── Reactive props: carom off them and tackle them (before the walls, so a
  // prop against an edge still resolves cleanly).
  resolveProps(prevX, prevY, now);

  // ── Goal? Checked before the walls (which would reverse vx). Only a real shot
  // qualifies: crossing the mouth plane, moving into the goal, fast enough that
  // idle roam (slow) never triggers it. Disabled in the overlay — there the goal
  // is triggered by the session timer, not by kicking the ball into a zone.
  const g = getGoal(W, H);
  const shotSpeed = Math.hypot(state.vx, state.vy);
  if (
    !OVERLAY &&
    state.px > g.zx &&
    state.py > g.yTop &&
    state.py < g.yBot &&
    state.vx > 0 &&
    shotSpeed > CONFIG.scoreSpeed
  ) {
    state.phase = "scored";
    state.scoredAt = now;
    state.goals++;
    state.px = Math.min(state.px, W - r); // seat it just inside the net
    state.spin = 0;
    celebrate(W, H, now);
    stepProps(dt);
    return;
  }

  // ── Walls: reflect off all four edges (DVD bounce), clamp inside bounds.
  const minX = r, maxX = W - r, minY = r, maxY = H - r;

  // NOTE: edge-impact no longer destroys a thought. Crashing the ball into a
  // corner was far too easy to do by accident and lost real notes — discarding
  // is now an explicit action ("let it go"). Edges just bounce.

  if (state.px < minX) {
    state.px = minX;
    state.vx = Math.abs(state.vx) * CONFIG.restitution;
  } else if (state.px > maxX) {
    state.px = maxX;
    state.vx = -Math.abs(state.vx) * CONFIG.restitution;
  }
  if (state.py < minY) {
    state.py = minY;
    state.vy = Math.abs(state.vy) * CONFIG.restitution;
  } else if (state.py > maxY) {
    state.py = maxY;
    state.vy = -Math.abs(state.vy) * CONFIG.restitution;
  }

  // ── Roll: accumulate rotation from horizontal travel, plus any roulette whirl.
  state.angle += ((state.px - prevX) / r) * (180 / Math.PI);
  if (state.flourish) {
    state.angle += state.flourish * dt;
    state.flourish *= Math.exp(-CONFIG.flourishDecay * dt);
    if (Math.abs(state.flourish) < 1) state.flourish = 0;
  }

  // ── Advance prop recoil springs.
  stepProps(dt);

  // ── Store? Only in mental-cache, only when the active ball is brought near the
  // dish by a DELIBERATE recent interaction — so idle roam drifting past the
  // dish never gets accidentally captured.
  if (MENTAL && dish && state.visible) {
    const near = Math.hypot(state.px - dish.x, state.py - dish.y) < CONFIG.storeCaptureR + r;
    const deliberate = now - lastUserInteract < CONFIG.storeWindowMs;
    if (near && deliberate) beginStore(now);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Render — write transforms from state.
// ─────────────────────────────────────────────────────────────────────────
function render() {
  if (!ball) return;
  // Mental-cache: hide the ball entirely until a thought is activated.
  if (MENTAL) {
    ball.style.display = state.visible ? "" : "none";
    if (!state.visible) return;
  }
  // Idle breathing — a slow scale oscillation so a resting sphere reads as
  // alive (mental-cache only; the standalone ball doesn't breathe).
  let breathe = 1;
  if (MENTAL) {
    const t = performance.now() / 1000;
    breathe = 1 + CONFIG.breatheAmp * 0.5 * (1 - Math.cos((t / CONFIG.breathePeriod) * 2 * Math.PI));
  }
  // During a store, the ball shrinks into the dish (storeScale 1 → 0). During an
  // unwrap, it fades + shrinks as the flat card takes its place (readAlpha 0→1).
  const readShrink = 1 - 0.55 * state.readAlpha;
  const scale = breathe * (state.phase === "storing" ? state.storeScale : 1) * readShrink;
  ball.style.transform = `translate(${state.px}px, ${state.py}px) scale(${scale.toFixed(4)})`;
  if (MENTAL) ball.style.opacity = (1 - state.readAlpha).toFixed(3);
  body.style.transform = `rotate(${state.angle}deg)`;
  // Grounding shadow reacts to speed: a fast ball reads as slightly lifted —
  // its shadow shrinks and softens; at rest it sits full and solid.
  if (shadowEl) {
    const sp = Math.hypot(state.vx, state.vy);
    const lift = Math.min(1, sp / 1400); // 0 at rest → 1 when flying
    const scale = 1 - 0.22 * lift;
    // Centered via margin-left in CSS, so scale from the element center only.
    shadowEl.style.transform = `scale(${scale.toFixed(3)})`;
    shadowEl.style.opacity = (1 - 0.45 * lift).toFixed(3);
  }
  // Props recoil (translate) with a slight knocked-askew rotation.
  for (const p of props) {
    p.el.style.transform =
      `translate(${p.ox}px, ${p.oy}px) rotate(${p.ox * CONFIG.tackleRot}deg)`;
  }
  // Reveal the net only during the goal celebration; it fades back to the faint
  // idle glow otherwise (CSS transitions the opacity).
  if (netEl) netEl.classList.toggle("is-goal", state.phase === "scored");

  // Camera shake — a decaying jitter of the whole stage after a goal.
  if (stageEl) {
    const now = performance.now();
    if (now < shakeUntil) {
      const rem = (shakeUntil - now) / CONFIG.shakeMs; // 1 → 0
      const amp = CONFIG.shakeAmp * rem * rem;
      const sx = (Math.random() * 2 - 1) * amp;
      const sy = (Math.random() * 2 - 1) * amp;
      stageEl.style.transform = `translate(${sx}px, ${sy}px)`;
    } else if (stageEl.style.transform) {
      stageEl.style.transform = "";
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Input.
// ─────────────────────────────────────────────────────────────────────────
let down = null; // { x, y, t } of the last pointerdown, for drag detection

// Touch has no hover: pointermove only fires while a finger is down, so a
// touch device would otherwise sit in permanent roam and never chase. We treat
// a finger as a cursor only while it's actually touching, and hand control back
// to roam the moment it lifts — which is the honest analogue of "no cursor".
function onPointerMove(e) {
  if (e.pointerType === "touch" && !down) return; // stray touch-move, not a drag
  const x = e.clientX;
  const y = e.clientY;
  state.mx = x;
  state.my = y;
  state.hasCursor = true;
  const now = performance.now();
  state.lastMoveAt = now;
  feedGesturePoint(x, y, now); // watch for a circle-around-the-ball gesture
}

function onPointerDown(e) {
  audio.unlock(); // first gesture unlocks the crowd cheer (autoplay policy)
  // Standalone kicks are page-wide by design (click anywhere = kick), but a
  // real functional control (the mute toggle) needs its own click without
  // also launching the ball — marked .no-kick. Deliberately not stopPropagation:
  // that would also block chrome.js's window-level press-morph listener for
  // the same element, and the glass morph must fire on every interactive glass
  // button, including this one.
  if (e.target.closest && e.target.closest(".no-kick")) return;
  down = { x: e.clientX, y: e.clientY, t: performance.now() };
  state.mx = e.clientX;
  state.my = e.clientY;
  state.hasCursor = true;
  state.lastMoveAt = down.t;
  lastUserInteract = down.t; // grabbing/dragging the ball counts as deliberate
}

function onPointerUp(e) {
  if (!down) return;
  const upx = e.clientX;
  const upy = e.clientY;
  const dragx = upx - down.x;
  const dragy = upy - down.y;
  const dragLen = Math.hypot(dragx, dragy);
  const dts = Math.max(0.016, (performance.now() - down.t) / 1000);
  kick(upx, upy, dragx, dragy, dragLen, dragLen / dts);
  down = null;
  // Finger lifted: there is no lingering cursor to chase, so return to roam
  // immediately rather than freezing the ball at the last touch point.
  if (e.pointerType === "touch") state.hasCursor = false;
}

// A kick: velocity impulse in the direction implied by the gesture, scaled by
// its intensity, plus spin proportional to how off-center / curved it was.
function kick(cx, cy, dragx, dragy, dragLen, flickSpeed) {
  let dirx, diry, power;
  let flickCurl = 0; // signed: how much a swipe arced across the ball

  if (dragLen > CONFIG.flickIsDrag) {
    // Swipe: kick along the drag, power from flick speed. Curl from how much
    // the flick points across the ball rather than straight through it.
    dirx = dragx / dragLen;
    diry = dragy / dragLen;
    power = clamp(flickSpeed * CONFIG.kickFromSpeed, CONFIG.kickMin, CONFIG.kickMax);
    const toBallx = state.px - down.x;
    const toBally = state.py - down.y;
    const tl = Math.hypot(toBallx, toBally) || 1;
    flickCurl = (dirx * toBally - diry * toBallx) / tl;
  } else {
    // Poke: kick from the ball toward the click point, power from distance.
    let dx = cx - state.px;
    let dy = cy - state.py;
    let d = Math.hypot(dx, dy);
    if (d < 1e-3) {
      // Poked dead-center: nudge along current motion, else straight up.
      const s = Math.hypot(state.vx, state.vy);
      if (s > 12) { dx = state.vx; dy = state.vy; d = s; }
      else { dx = 0; dy = -1; d = 1; }
    }
    dirx = dx / d;
    diry = dy / d;
    power = clamp(d * CONFIG.kickPokeGain, CONFIG.kickMin, CONFIG.kickMax);
  }

  const powerFrac = power / CONFIG.kickMax;

  // Spin, from three sources so a kick's path always bends a little (never a
  // dead-straight line, per the brief): the swipe's own arc, redirecting the
  // ball's existing motion, and a small intrinsic base.
  const preSpeed = Math.hypot(state.vx, state.vy);
  let redirect = 0;
  if (preSpeed > 20) {
    // Cross of old velocity and new kick direction: harder turn → more curve.
    redirect = (state.vx * diry - state.vy * dirx) / preSpeed;
  }
  // Base spin: random sign but a guaranteed magnitude, so no kick flies
  // perfectly straight (per the brief) while still varying kick to kick.
  const baseSign = Math.random() < 0.5 ? -1 : 1;
  const base = baseSign * (0.6 + 0.4 * Math.random()) * CONFIG.spinBase;
  const spin =
    (flickCurl * CONFIG.spinFromKick +
      redirect * CONFIG.spinFromKick * 0.5 +
      base) *
    powerFrac;

  state.vx += dirx * power;
  state.vy += diry * power;
  state.spin += spin;
  lastUserInteract = performance.now(); // a flick is a deliberate interaction
  audio.thump(powerFrac); // soft kick feedback; louder for a harder strike
  // A strike reads cleanly: drop engagement so the ball flies on its own kick
  // (and its spin-curve) rather than being vacuumed back toward the cursor.
  // Chase re-acquires naturally on the next cursor movement.
  state.engage = 0;
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

// ─────────────────────────────────────────────────────────────────────────
// Roulette gesture — a circle drawn around the ball triggers a spin flourish.
// Detection: keep a short trail of pointer points, sum the signed turning angle
// around their centroid; a near-full loop of a sane size, centred on the ball,
// fires it. The reaction is real physics: a spin burst + tangential boost that
// spirals the ball, plus a visual whirl of its surface.
// ─────────────────────────────────────────────────────────────────────────
let gesturePts = [];
let rouletteCoolUntil = 0;

function feedGesturePoint(x, y, now) {
  gesturePts.push({ x, y, t: now });
  const cutoff = now - CONFIG.rouletteWindowMs;
  while (gesturePts.length && gesturePts[0].t < cutoff) gesturePts.shift();
  detectCircle(now);
}

function detectCircle(now) {
  if (state.phase !== "play" || now < rouletteCoolUntil) return;
  const n = gesturePts.length;
  if (n < 12) return;

  let cx = 0, cy = 0;
  for (const p of gesturePts) { cx += p.x; cy += p.y; }
  cx /= n; cy /= n;
  if (Math.hypot(cx - state.px, cy - state.py) > CONFIG.rouletteNearBall) return;

  let turn = 0, rsum = 0, prev = null;
  for (const p of gesturePts) {
    const a = Math.atan2(p.y - cy, p.x - cx);
    rsum += Math.hypot(p.x - cx, p.y - cy);
    if (prev !== null) {
      let d = a - prev;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      turn += d;
    }
    prev = a;
  }
  const rAvg = rsum / n;
  if (rAvg < CONFIG.rouletteMinR || rAvg > CONFIG.rouletteMaxR) return;
  if (Math.abs(turn) < CONFIG.rouletteMinTurn) return;
  triggerRoulette(Math.sign(turn), now);
}

function triggerRoulette(dir, now) {
  rouletteCoolUntil = now + CONFIG.rouletteCooldownMs;
  gesturePts.length = 0;

  // Tangential boost (perpendicular to current motion) so the ball loops; the
  // spin then bends that motion into a tight, decaying spiral — the roulette.
  const sp = Math.hypot(state.vx, state.vy);
  let dx = state.vx, dy = state.vy;
  if (sp < 40) { dx = 1; dy = 0; } else { dx /= sp; dy /= sp; }
  state.vx += -dir * dy * CONFIG.rouletteSpeed;
  state.vy += dir * dx * CONFIG.rouletteSpeed;

  state.spin += dir * CONFIG.rouletteSpin;
  state.flourish += dir * CONFIG.flourishSpin;
  state.engage = 0; // let it fly the flourish rather than be pulled to the cursor
  audio.whoosh();
  wake();
}

// ─────────────────────────────────────────────────────────────────────────
// Loop.
// ─────────────────────────────────────────────────────────────────────────
let raf = 0;
let last = 0;

function frame(now) {
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.032) dt = 0.032; // clamp jank / tab-switch stalls for stability
  if (dt <= 0) dt = 1 / 60;
  integrate(dt, now);
  render();
  confetti.step(dt);
  for (const h of frameHooks) h(dt, now); // shelf spheres animate in sync
  raf = requestAnimationFrame(frame);
}

// The roam behavior means the loop never sleeps — the ball is always alive.
function wake() {
  if (!raf) {
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Boot.
// ─────────────────────────────────────────────────────────────────────────
// Boot the engine. opts.root scopes DOM lookups (default document); opts.overlay
// switches to overlay behaviour (kick the ball by clicking IT, not the page;
// goal fires from the timer, not a spatial zone). Returns a small control API.
export function startKickoff(opts = {}) {
  if (initialized) return engineApi;
  ROOT = opts.root || document;
  OVERLAY = !!opts.overlay;
  MENTAL = !!opts.mentalCache;
  ballR = opts.radius || CONFIG.radius;

  ball = qId("ball");
  body = qId("ball-body");
  shadowEl = qId("ball-shadow");
  faceEl = qId("ball-face");
  goalEl = qId("goal");
  netEl = qId("net");
  stageEl = qId("stage");
  flashEl = qId("flash");
  if (!ball) return engineApi;
  initialized = true;

  const fx = qId("fx");
  if (fx) confetti.init(fx);
  layoutGoal(vw(), vh());
  initChrome(ROOT); // Liquid Glass UI interactivity (cosmetic; no physics coupling)

  if (MENTAL) {
    // No ball until the first thought is created (activate()); it sits at rest,
    // hidden, so the page is empty until you offload something.
    state.visible = false;
    state.px = vw() / 2;
    state.py = vh() / 2;
    state.vx = 0;
    state.vy = 0;
  } else {
    // Start at center, already drifting — alive the instant it mounts.
    state.px = vw() / 2;
    state.py = vh() / 2;
    const a = Math.random() * Math.PI * 2;
    state.vx = Math.cos(a) * CONFIG.roamSpeed;
    state.vy = Math.sin(a) * CONFIG.roamSpeed;
  }

  initProps();

  // Cursor tracking (chase + gesture) is global on both surfaces. The KICK
  // trigger differs: on the page a click anywhere kicks toward it; in the
  // overlay only the ball's own hit-area starts a kick, so page clicks stay
  // untouched. Release + move stay on window so a flick that leaves the ball
  // still resolves.
  window.addEventListener("pointermove", onPointerMove, { passive: true });
  (OVERLAY ? ball : window).addEventListener("pointerdown", onPointerDown, { passive: true });
  window.addEventListener("pointerup", onPointerUp, { passive: true });
  window.addEventListener("pointerleave", () => { state.hasCursor = false; });
  window.addEventListener("blur", () => { state.hasCursor = false; });

  render();
  wake();
  installDebugHooks();
  return engineApi;
}

// Fire the full goal celebration on demand (the overlay's session timer calls
// this on completion). No-op unless the ball is in normal play.
function triggerGoal() {
  if (state.phase !== "play") return;
  const now = performance.now();
  state.phase = "scored";
  state.scoredAt = now;
  state.goals++;
  celebrate(vw(), vh(), now);
  wake();
}

// Storing — the active ball sinks into the dish and its thought is handed to
// the shelf (via the onStore callback). Begin/finish bracket the animation.
function beginStore(now) {
  if (state.phase === "storing") return;
  state.phase = "storing";
  state.storeAt = now;
  state.storeScale = 1;
  // Kick off the strike with a burst of spin — the ball visibly rips toward the
  // goal rather than sliding there.
  state.spin += (state.px < (dish ? dish.x : vw()) ? 1 : -1) * 14;
}
function finishStore() {
  const thought = {
    id: state.thoughtId,
    text: state.text,
    url: state.url || "",
    mode: storeMode, // "keep" | "done" | "snooze"
    snoozeUntil: storeMode === "snooze" ? snoozeUntil : 0,
  };
  const gx = dish ? dish.x : state.px;
  const gy = dish ? dish.y : state.py;
  state.visible = false;
  state.phase = "play";
  state.storeScale = 1;
  audio.chime();
  // Every ball that reaches the goal is a goal — keep, done and snooze all get
  // the full payoff. (Only the bin dissolves instead.)
  celebrateAt(gx, gy, performance.now());
  if (onStore) onStore(thought);
  storeMode = "keep";
  snoozeUntil = 0;
}

// A celebration anchored at (x,y) — reuses the football goal payoff (net billow,
// warm flash, confetti, crowd cheer, camera shake) for "keeping" a thought.
function celebrateAt(x, y, now) {
  if (netEl) restartAnim(netEl, "is-billow");
  if (flashEl) restartAnim(flashEl, "is-flash");
  // Confetti erupts AROUND the goal — up from the mouth and out from both posts
  // — so the goal itself is the source of the celebration, not a single point.
  const goalH = netEl ? netEl.getBoundingClientRect().height || 240 : 240;
  const halfH = Math.min(150, goalH / 2);
  confetti.burst(x, y, -Math.PI / 2); // straight up out of the net
  confetti.burst(x, y - halfH, -Math.PI * 0.62); // off the top post, up-left
  confetti.burst(x, y + halfH, -Math.PI * 0.38); // off the bottom post, down-left
  confetti.burst(x - 40, y, Math.PI); // spraying back into the pitch
  audio.cheer();
  shakeUntil = now + CONFIG.shakeMs;
}

// "Let it go" — a quick scripted flick away, then a mid-air dissolve. A
// deliberate, delightful discard (no more accidental corner-crashes).
function beginLetGo() {
  if (!state.visible || state.phase !== "play") return;
  // A real strike: it should leave fast and travel, not lob a few feet. Aimed at
  // the nearer side so the flight stays on screen and the burst is visible.
  // Aimed at the FARTHER side, so a thought you're finished with crosses the
  // whole screen instead of nipping off the near edge — the distance is the
  // feeling. Fast enough that it reads as force, not a toss.
  const toEdge = state.px < vw() / 2 ? 1 : -1;
  state.vx = toEdge * 3400;
  state.vy = -340 + Math.random() * 110;
  state.spin = toEdge * 19;
  state.phase = "lettinggo";
  state.letGoAt = engineNow || performance.now();
  state.trailAt = 0;
  wake();
}

// The Break — a hard flick into an edge dissolves the active thought into a
// graphite smudge (a catharsis, not a save). The thought is discarded, never
// stored. Clamp the burst origin to just inside the edge that was struck.
function breakThought(now, W, H) {
  const r = ballR;
  const thought = { id: state.thoughtId, text: state.text };
  const ox = clamp(state.px, r, W - r);
  const oy = clamp(state.py, r, H - r);
  const speed = Math.hypot(state.vx, state.vy);
  const dir = Math.atan2(state.vy, state.vx); // fan along the flick
  confetti.smudge(ox, oy, dir, r, Math.min(1, speed / 1500)); // crumble across the ball, scaled by force
  audio.puff();
  state.visible = false;
  state.phase = "play";
  state.vx = 0;
  state.vy = 0;
  if (onBreak) onBreak(thought);
}

// Bring a thought's ball to life (mental-cache mode). Sets its text label,
// reveals it, and spawns it already alive — a gentle drift from center, so the
// existing chase/roam physics take over immediately (never a static spawn).
function activate({ text = "", id = null, url = "", x, y } = {}) {
  // A thought can still be sinking into the goal when the next one arrives —
  // hit Keep, then immediately dump another thought before the ~0.6s store
  // animation lands. Without this, activate() would overwrite the in-flight
  // thought's text/id and reset the phase, so finishStore() never ran and the
  // thought was silently lost. Commit it first; losing a captured thought is
  // the one failure this tool must never have.
  if (state.phase === "storing" && state.visible) finishStore();
  state.text = text;
  state.thoughtId = id;
  state.url = url; // set when the thought was captured from a page
  state.visible = true;
  state.phase = "play";
  state.px = x ?? vw() / 2;
  state.py = y ?? vh() / 2;
  const a = Math.random() * Math.PI * 2;
  state.vx = Math.cos(a) * CONFIG.roamSpeed;
  state.vy = Math.sin(a) * CONFIG.roamSpeed;
  state.angle = 0;
  state.spin = 0;
  setFaceText(text);
  render();
  wake();
}

// Render the thought text onto the ball's upright label plate — word-wrapped,
// auto-shrunk, capped — via a 2D canvas so it stays crisp at any DPR. Kept
// upright (not rolling) for legibility; the seams still roll to show motion.
function setFaceText(text) {
  if (!faceEl) return;
  // The ball shows a HEADLINE; storage holds the whole thought (the input cap
  // was raised — a legibility limit on a 92px ball is not a licence to truncate
  // someone's thinking). The ellipsis says "there's more on the card".
  const whole = (text || "").trim();
  const t = whole.length > CONFIG.thoughtCap
    ? whole.slice(0, CONFIG.thoughtCap - 1).trimEnd() + "…"
    : whole;
  faceEl.setAttribute("data-text", t);
  // Short thoughts get the 3D revolving wrap; longer ones keep the flat upright
  // band, which is the only way they stay readable. Two presentations, chosen by
  // what actually reads at 92px.
  if (t.length <= CONFIG.ringCap) buildFaceRing(t);
  else {
    faceEl.className = "";
    faceEl.textContent = t;
    faceEl.style.fontSize = labelFontSize(t) + "px";
  }
}

// Wrap the text around a cylinder that revolves left→right, like lettering on a
// spinning ball. The thought repeats around the full ring so the front is always
// populated (and readable); backface-visibility hides the far side for free, so
// there's no mirrored clutter — only the near hemisphere ever shows.
function buildFaceRing(t) {
  const fs = Math.min(15, labelFontSize(t) + 1);
  const ring = (t + "   ·   ");
  const charW = fs * 0.62;
  // Enough slots to seat the repeated text with a clean circumference.
  let s = ring;
  const target = Math.max(ring.length, 22);
  while (s.length < target) s += ring;
  const slots = s.length;
  const chars = s.split("");
  const step = 360 / slots;
  const radius = (charW / 2) / Math.tan(Math.PI / slots);

  faceEl.className = "is-ring";
  faceEl.textContent = "";
  faceEl.style.fontSize = fs + "px";
  const spin = document.createElement("div");
  spin.className = "face-ring";
  // Revolution time scales with size so bigger rings don't feel frantic.
  spin.style.animationDuration = (slots * 0.34).toFixed(1) + "s";
  chars.forEach((ch, i) => {
    const sp = document.createElement("span");
    sp.textContent = ch === " " ? " " : ch;
    sp.style.transform = `translate(-50%,-50%) rotateY(${i * step}deg) translateZ(${radius.toFixed(1)}px)`;
    spin.appendChild(sp);
  });
  faceEl.appendChild(spin);
}

// Font size for the ball's label band, by text length.
export function labelFontSize(t) {
  const n = (t || "").length;
  if (n <= 10) return 14;
  if (n <= 18) return 12.5;
  if (n <= 30) return 11;
  if (n <= 48) return 9.5;
  return 8.5;
}

export function drawThoughtLabel(text) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const size = 220; // logical px; the plate scales it down via CSS
  const cv = document.createElement("canvas");
  cv.width = cv.height = size * dpr;
  const c = cv.getContext("2d");
  c.scale(dpr, dpr);
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillStyle = "#2e2a25";
  // The sphere shows a LEGIBLE HINT, not the whole thought — a short thought
  // reads in full; a long one is truncated with an ellipsis (the full text is
  // read on the unwrap card). Bias toward a large, readable font over cramming.
  const maxW = size * 0.78;
  const maxLines = 3;
  const minFont = 22; // never shrink below this — legibility floor
  let font = 46;
  let lines = [];
  for (; font >= minFont; font -= 2) {
    c.font = `600 ${font}px system-ui, -apple-system, "Segoe UI", sans-serif`;
    lines = wrapText(c, text, maxW);
    if (lines.length <= maxLines) break;
  }
  // Still too long at the floor font → keep the first lines and ellipsize.
  if (lines.length > maxLines) {
    lines = lines.slice(0, maxLines);
    let last = lines[maxLines - 1];
    while (last.length > 1 && c.measureText(last + "…").width > maxW) last = last.slice(0, -1);
    lines[maxLines - 1] = last + "…";
  }
  const lh = font * 1.22;
  const y0 = size / 2 - ((lines.length - 1) * lh) / 2;
  lines.forEach((ln, i) => c.fillText(ln, size / 2, y0 + i * lh));
  return cv;
}

function wrapText(c, text, maxW) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = "";
  for (const w of words) {
    const test = line ? line + " " + w : w;
    if (c.measureText(test).width > maxW && line) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

const engineApi = {
  triggerGoal,
  unlockAudio: () => audio.unlock(),
  activate,
  setText: (t) => { state.text = t; setFaceText(t); },
  isActive: () => state.visible,
  currentThought: () => ({ id: state.thoughtId, text: state.text }),
  deactivate: () => { state.visible = false; state.phase = "play"; },
  // The two deliberate actions the buttons drive. KEEP flies the ball into the
  // goal and celebrates (cheer + confetti + net); LET GO flicks it away to dissolve.
  // Three distinct outcomes, no more: Keep = park it in the goal (celebration),
  // Snooze = park it with a wake time, letGo = it's out of your head and
  // dissolves. "Finishing" and "discarding" are the same act, so they share one
  // action rather than two that end identically.
  keep: () => { if (state.visible && state.phase === "play") { storeMode = "keep"; beginStore(engineNow || performance.now()); } },
  snooze: (untilMs) => {
    if (!state.visible || state.phase !== "play") return;
    storeMode = "snooze";
    snoozeUntil = untilMs;
    beginStore(engineNow || performance.now());
  },
  letGo: () => beginLetGo(),
  canAct: () => state.visible && state.phase === "play",
  setDish: (d) => { dish = d; }, // { x, y } viewport center of the dish
  // Rotating a tablet changes which size the ball should be. Physics reads
  // ballR every frame, so updating it here is enough — but clamp the ball back
  // inside the new viewport, or a resize can strand it off-screen.
  setRadius: (r) => {
    ballR = r;
    state.px = clamp(state.px, r, Math.max(r, vw() - r));
    state.py = clamp(state.py, r, Math.max(r, vh() - r));
  },
  setStoreHandler: (fn) => { onStore = fn; },
  setBreakHandler: (fn) => { onBreak = fn; },
  onFrame: (fn) => { frameHooks.push(fn); },
  // Read a snapshot for the shelf (thought identity + where it sank).
  activeThought: () => ({ id: state.thoughtId, text: state.text, visible: state.visible }),
  // Unwrap (read as a card). Freezes the ball; endRead resumes it, re-seeding a
  // gentle roam so it comes back alive rather than sitting dead-still.
  beginRead: () => {
    if (!state.visible || state.phase !== "play") return;
    state.reading = true;
    state.vx = 0;
    state.vy = 0;
  },
  endRead: () => {
    if (!state.reading) return;
    state.reading = false;
    const a = Math.random() * Math.PI * 2;
    state.vx = Math.cos(a) * CONFIG.roamSpeed;
    state.vy = Math.sin(a) * CONFIG.roamSpeed;
  },
  isReading: () => state.reading,
  readAlpha: () => state.readAlpha,
  ballPos: () => ({ x: state.px, y: state.py }),
};

// ─────────────────────────────────────────────────────────────────────────
// Debug hooks — synchronous, deterministic verification that survives the
// preview pane's rAF throttling. Temporary: removed before the visual pass.
// ─────────────────────────────────────────────────────────────────────────
let simClock = 0; // persistent, monotonic — so time-based logic (cooldown,
// celebrate, return, engage decay) advances faithfully across step() calls.
function installDebugHooks() {
  const clock = () => (simClock ||= performance.now());
  window.__k = {
    state: () => ({ ...state, W: vw(), H: vh(), now: simClock }),
    // Step the sim synchronously n frames at fixed dt (immune to throttling).
    step: (n = 60, dt = 1 / 60) => {
      clock();
      for (let i = 0; i < n; i++) {
        simClock += dt * 1000;
        integrate(dt, simClock);
        confetti.step(dt); // advance particles synchronously too (throttle-proof)
        for (const h of frameHooks) h(dt, simClock); // shelf spheres in sync
      }
      render();
      return { ...state };
    },
    setPointer: (x, y) => {
      state.mx = x;
      state.my = y;
      state.hasCursor = true;
      state.lastMoveAt = clock();
    },
    clearPointer: () => { state.hasCursor = false; },
    place: (x, y, vx = 0, vy = 0) => {
      state.px = x; state.py = y; state.vx = vx; state.vy = vy; state.spin = 0;
    },
    // Reset to a clean, fully-disengaged idle-play state for test isolation.
    resetPlay: () => {
      state.phase = "play"; state.goals = 0; state.spin = 0; state.flourish = 0;
      state.px = vw() / 2; state.py = vh() / 2; state.vx = 0; state.vy = 0;
      state.hasCursor = false; state.engage = 0; state.lastMoveAt = -1e9;
      gesturePts = []; rouletteCoolUntil = 0;
    },
    // Poke toward (cx,cy) — drives the real kick path (poke branch).
    kick: (cx, cy) => kick(cx, cy, 0, 0, 0, 0),
    // Goal geometry (for score-detection tests).
    goal: () => getGoal(vw(), vh()),
    // Feed a synthetic circle of pointer points through the REAL detector.
    drawCircle: (cx, cy, r = 90, cw = true, n = 26) => {
      clock();
      rouletteCoolUntil = 0;
      gesturePts = [];
      const span = CONFIG.rouletteWindowMs * 0.7;
      for (let i = 0; i < n; i++) {
        const a = (cw ? 1 : -1) * (i / n) * 2 * Math.PI;
        simClock += span / n;
        feedGesturePoint(cx + Math.cos(a) * r, cy + Math.sin(a) * r, simClock);
      }
      return { flourish: Math.round(state.flourish), spin: +state.spin.toFixed(2), cool: rouletteCoolUntil };
    },
    // Reset all props to rest AND clear cooldowns — needed between synchronous
    // test shots, since the real-time cooldown clock doesn't advance under __step.
    resetProps: () => {
      for (const p of props) { p.ox = p.oy = p.ovx = p.ovy = 0; p.cool = 0; }
    },
    // Reactive props: rest boxes + current recoil offset/velocity.
    props: () =>
      props.map((p) => ({
        box: p.box,
        ox: +p.ox.toFixed(1),
        oy: +p.oy.toFixed(1),
        speed: +Math.hypot(p.ovx, p.ovy).toFixed(0),
      })),
    config: CONFIG,
  };
}
