(function() {
  "use strict";
  const CFG = {
    count: 130,
    // particles per burst (capped)
    life: 1.7,
    // s: max lifetime
    gravity: 1400,
    // px/s²
    drag: 0.86,
    // per frame-ish velocity retention
    spread: 2.2,
    // rad: cone width of the initial fan
    speedMin: 520,
    speedMax: 1500,
    // Warm, celebratory palette with one cool pop (kept mostly warm per the brief).
    colors: ["#f4c15a", "#fff6e6", "#e8963b", "#e2564d", "#8fb8ff", "#f7d9a0"]
  };
  let canvas = null;
  let ctx$1 = null;
  let dpr = 1;
  const parts = [];
  const SMOKE_HUES = [
    [176, 206, 255],
    // pale ice — the highlights
    [138, 170, 246],
    // soft periwinkle
    [110, 140, 232],
    // the body of the cloud
    [206, 220, 255]
    // near-white lift
  ];
  let smokeSprites = null;
  function makeSmokeSprite([r, g, b]) {
    const s = 256;
    const c = document.createElement("canvas");
    c.width = c.height = s;
    const x = c.getContext("2d");
    const grad = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grad.addColorStop(0, `rgba(${r},${g},${b},0.28)`);
    grad.addColorStop(0.22, `rgba(${r},${g},${b},0.20)`);
    grad.addColorStop(0.46, `rgba(${r},${g},${b},0.10)`);
    grad.addColorStop(0.7, `rgba(${r},${g},${b},0.035)`);
    grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
    x.fillStyle = grad;
    x.beginPath();
    x.arc(s / 2, s / 2, s / 2, 0, Math.PI * 2);
    x.fill();
    return c;
  }
  function makeSmokeSprites() {
    return SMOKE_HUES.map(makeSmokeSprite);
  }
  function init(cv) {
    canvas = cv;
    ctx$1 = cv.getContext("2d");
    if (!smokeSprites) smokeSprites = makeSmokeSprites();
    resize();
  }
  function resize() {
    if (!canvas) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor((window.innerWidth || 1280) * dpr);
    canvas.height = Math.floor((window.innerHeight || 800) * dpr);
    canvas.style.width = "100%";
    canvas.style.height = "100%";
  }
  function burst(x, y, dir = -Math.PI / 2) {
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
        round: Math.random() < 0.25,
        // a few circles among the ribbons
        color: CFG.colors[Math.random() * CFG.colors.length | 0],
        t: 0,
        life: CFG.life * (0.6 + Math.random() * 0.4)
      });
    }
    if (parts.length > CFG.count * 2) parts.splice(0, parts.length - CFG.count * 2);
  }
  function smudge(x, y, dir = 0, ballR2 = 40, power = 1, density = 1) {
    if (!smokeSprites) smokeSprites = makeSmokeSprites();
    const heavy = 0.5 + 0.5 * Math.min(1, power);
    const N = Math.max(1, Math.round((120 + 100 * heavy) * density));
    for (let i = 0; i < N; i++) {
      const oa = Math.random() * Math.PI * 2;
      const orr = Math.sqrt(Math.random()) * ballR2;
      const ox = x + Math.cos(oa) * orr;
      const oy = y + Math.sin(oa) * orr;
      const a = dir + (Math.random() - 0.5) * 2.4;
      const sp = (50 + Math.random() * 520) * heavy;
      const ra = Math.atan2(oy - y, ox - x) || a;
      const rad = 0.35 + Math.random() * 0.3;
      parts.push({
        x: ox,
        y: oy,
        vx: Math.cos(a) * sp * (1 - rad) + Math.cos(ra) * sp * 0.6 * rad,
        vy: Math.sin(a) * sp * (1 - rad) + Math.sin(ra) * sp * 0.6 * rad,
        smudge: true,
        g: -0.05,
        // buoyant: smoke rises rather than falling
        sprite: Math.random() * SMOKE_HUES.length | 0,
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
        life: 1.1 + Math.random() * 1.5
      });
    }
    if (parts.length > 420) parts.splice(0, parts.length - 420);
  }
  function step(dt) {
    if (!ctx$1) return;
    ctx$1.clearRect(0, 0, canvas.width, canvas.height);
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
      if (p.smudge) {
        p.vx += Math.sin(p.y * 0.012 + p.seed + p.t * 1.6) * p.swirl * 34 * dt;
        p.vy += Math.cos(p.x * 0.012 + p.seed * 1.7 + p.t * 1.6) * p.swirl * 34 * dt;
        p.vy += CFG.gravity * p.g * dt;
        const sd = Math.pow(0.9, dt * 60);
        p.vx *= sd;
        p.vy *= sd;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        const sz = (p.size + p.t * p.grow) * 2 * dpr;
        const inn = Math.min(1, p.t / 0.09);
        const a = inn * p.alpha * fade * fade * (0.55 + 0.45 * fade);
        ctx$1.globalAlpha = Math.max(0, a);
        ctx$1.drawImage(smokeSprites[p.sprite || 0], p.x * dpr - sz / 2, p.y * dpr - sz / 2, sz, sz);
        continue;
      }
      p.vy += CFG.gravity * (p.g ?? 1) * dt;
      p.vx *= damp;
      p.vy *= damp;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      ctx$1.save();
      ctx$1.globalAlpha = Math.min(1, fade * 1.6);
      ctx$1.translate(p.x * dpr, p.y * dpr);
      ctx$1.rotate(p.rot);
      ctx$1.fillStyle = p.color;
      if (p.round) {
        ctx$1.beginPath();
        ctx$1.arc(0, 0, p.w * 0.5 * dpr, 0, Math.PI * 2);
        ctx$1.fill();
      } else {
        const w = p.w * Math.abs(Math.cos(p.rot)) * dpr;
        ctx$1.fillRect(-w / 2, -p.h / 2 * dpr, w, p.h * dpr);
      }
      ctx$1.restore();
    }
  }
  let ctx = null;
  let noiseBuffer = null;
  let muted = false;
  function unlock() {
    if (ctx) {
      if (ctx.state === "suspended") ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    const n = ctx.sampleRate * 2;
    noiseBuffer = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = noiseBuffer.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  }
  function cheer() {
    if (!ctx || muted) return;
    if (ctx.state === "suspended") ctx.resume();
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.setValueAtTime(500, t);
    bp.frequency.linearRampToValueAtTime(1400, t + 0.5);
    bp.Q.value = 0.7;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 3e3;
    const g = ctx.createGain();
    g.gain.setValueAtTime(1e-4, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.18);
    g.gain.exponentialRampToValueAtTime(0.28, t + 0.9);
    g.gain.exponentialRampToValueAtTime(1e-4, t + 2.1);
    src.connect(bp);
    bp.connect(lp);
    lp.connect(g);
    g.connect(ctx.destination);
    src.start(t);
    src.stop(t + 2.2);
    whistle(t + 0.02, 2100);
    whistle(t + 0.16, 1950);
  }
  function thump(strength = 1) {
    if (!ctx || muted) return;
    if (ctx.state === "suspended") ctx.resume();
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(190, t);
    o.frequency.exponentialRampToValueAtTime(70, t + 0.13);
    const g = ctx.createGain();
    const vol = 0.04 + 0.13 * Math.min(1, Math.max(0, strength));
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(1e-4, t + 0.16);
    o.connect(g);
    g.connect(ctx.destination);
    o.start(t);
    o.stop(t + 0.18);
  }
  function whoosh() {
    if (!ctx || muted) return;
    if (ctx.state === "suspended") ctx.resume();
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(320, t);
    bp.frequency.exponentialRampToValueAtTime(2200, t + 0.22);
    bp.frequency.exponentialRampToValueAtTime(520, t + 0.5);
    const g = ctx.createGain();
    g.gain.setValueAtTime(1e-4, t);
    g.gain.exponentialRampToValueAtTime(0.2, t + 0.12);
    g.gain.exponentialRampToValueAtTime(1e-4, t + 0.5);
    src.connect(bp);
    bp.connect(g);
    g.connect(ctx.destination);
    src.start(t);
    src.stop(t + 0.55);
  }
  function puff() {
    if (!ctx || muted) return;
    if (ctx.state === "suspended") ctx.resume();
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(2400, t);
    lp.frequency.exponentialRampToValueAtTime(320, t + 0.4);
    const g = ctx.createGain();
    g.gain.setValueAtTime(1e-4, t);
    g.gain.exponentialRampToValueAtTime(0.11, t + 0.03);
    g.gain.exponentialRampToValueAtTime(1e-4, t + 0.45);
    src.connect(lp);
    lp.connect(g);
    g.connect(ctx.destination);
    src.start(t);
    src.stop(t + 0.5);
  }
  function chime() {
    if (!ctx || muted) return;
    if (ctx.state === "suspended") ctx.resume();
    const t = ctx.currentTime;
    [[880, 0.13], [1320, 0.07]].forEach(([f, vol]) => {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(1e-4, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
      g.gain.exponentialRampToValueAtTime(1e-4, t + 0.5);
      o.connect(g);
      g.connect(ctx.destination);
      o.start(t);
      o.stop(t + 0.55);
    });
  }
  function whistle(start, freq) {
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(freq, start);
    o.frequency.linearRampToValueAtTime(freq * 0.9, start + 0.12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(1e-4, start);
    g.gain.exponentialRampToValueAtTime(0.12, start + 0.02);
    g.gain.exponentialRampToValueAtTime(1e-4, start + 0.14);
    o.connect(g);
    g.connect(ctx.destination);
    o.start(start);
    o.stop(start + 0.16);
  }
  const HOVER_MARGIN = 26;
  let items = [];
  let reduce = false;
  function initChrome(root = document) {
    reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    items = [];
    root.querySelectorAll(".glass-btn").forEach((btn) => {
      const glass = btn.querySelector(".glass");
      if (glass) items.push({ btn, glass, box: null, hover: false });
    });
    measureChrome();
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown, { passive: true });
    window.addEventListener("pointerup", onUp, { passive: true });
    window.addEventListener("pointercancel", onUp, { passive: true });
    window.addEventListener("blur", onUp);
  }
  function measureChrome() {
    for (const it of items) {
      const t = it.btn.style.transform;
      it.btn.style.transform = "";
      const r = it.btn.getBoundingClientRect();
      it.btn.style.transform = t;
      it.box = { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height };
    }
  }
  function onMove(e) {
    const x = e.clientX;
    const y = e.clientY;
    for (const it of items) {
      const b = it.box;
      if (!b) continue;
      const inside = x >= b.l - HOVER_MARGIN && x <= b.r + HOVER_MARGIN && y >= b.t - HOVER_MARGIN && y <= b.b + HOVER_MARGIN;
      if (inside) {
        if (!it.hover) {
          it.hover = true;
          it.glass.classList.add("is-hover");
        }
        if (!reduce) {
          const mx = Math.max(0, Math.min(100, (x - b.l) / b.w * 100));
          const my = Math.max(0, Math.min(100, (y - b.t) / b.h * 100));
          it.glass.style.setProperty("--mx", mx.toFixed(1) + "%");
          it.glass.style.setProperty("--my", my.toFixed(1) + "%");
          it.glass.style.setProperty("--spec", "0.9");
        }
      } else if (it.hover) {
        it.hover = false;
        it.glass.classList.remove("is-hover");
        it.glass.style.setProperty("--spec", "0.28");
      }
    }
  }
  function onDown(e) {
    const x = e.clientX;
    const y = e.clientY;
    for (const it of items) {
      const b = it.box;
      if (!b) continue;
      if (x >= b.l && x <= b.r && y >= b.t && y <= b.b) {
        it.glass.classList.add("is-press");
      }
    }
  }
  function onUp() {
    for (const it of items) it.glass.classList.remove("is-press");
  }
  const CONFIG = {
    // Chase spring (under-damped → overshoot + settle).
    chaseOmega: 5.6,
    // rad/s: how briskly it springs toward the cursor
    chaseZeta: 0.34,
    // <1 = under-damped; lower = more overshoot
    deadzone: 26,
    // px: stop pulling this close to the cursor (circle, don't jitter)
    surge: 0.16,
    // trot-like pulsing of the pull so it reads as a gait, not a glide
    // Engagement cross-fade (chase ↔ roam).
    engageHold: 2,
    // s: cursor idle this long → start drifting into roam
    engageRise: 9,
    // per s: perks into chase quickly when the cursor moves
    engageFall: 1.1,
    // per s: eases down into roam slowly (the cross-fade)
    // Roam (DVD drift).
    roamSpeed: 155,
    // px/s: gentle constant wander speed
    roamSteer: 1.6,
    // per s: how firmly it holds roamSpeed (tops up wall losses)
    // Kick impulse.
    kickFromSpeed: 0.9,
    // flick speed → impulse (a fast drag hits harder)
    kickPokeGain: 3,
    // poke distance → impulse (a far poke hits harder)
    kickMin: 260,
    // px/s: even a soft tap lands a real little pop
    kickMax: 2200,
    // px/s: cap so a hard strike stays controllable
    flickIsDrag: 14,
    // px: drag longer than this reads as a swipe, not a poke
    // Spin / curve (the cheap Magnus approximation).
    spinFromKick: 0.9,
    // how much flick-curl / redirect becomes spin
    spinBase: 0.25,
    // a little spin on every kick so none flies dead-straight
    spinCurve: 0.9,
    // heading turn rate ≈ this·spin (rad/s); bends the path visibly
    spinDecay: 1.4,
    // per s: spin bleeds off
    // Global.
    rollFriction: 0.7,
    // per s: light rolling resistance on a free/kicked ball
    maxSpeed: 2600,
    // px/s safety clamp
    restitution: 0.88,
    // velocity kept on a wall bounce
    radius: 36,
    // px: must match #ball size in the HTML
    // Reactive props (elements the ball "tackles").
    elemRestitution: 0.72,
    // velocity the ball keeps when it caroms off a prop
    tackleGain: 1.3,
    // impact speed → how hard the prop is knocked
    tackleOmega: 15,
    // rad/s: prop spring back to rest
    tackleZeta: 0.4,
    // <1 = a little elastic recovery overshoot
    tackleMax: 60,
    // px: cap on how far a prop is displaced
    tackleRot: 0.13,
    // deg per px of horizontal offset (knocked-askew look)
    tackleCooldown: 0.11,
    // s: min gap between knocks from one prop (anti-buzz)
    // Goal (right edge) + celebration.
    goalDepth: 128,
    // px: how far the goal reaches in from the right edge
    goalMouth: 250,
    // px: vertical height of the goal opening
    goalMinMouth: 180,
    // px: keep the mouth usable on short viewports
    scoreSpeed: 430,
    // px/s: a shot must be at least this fast to count (roam can't)
    celebrateMs: 1900,
    // how long the celebration holds before the ball returns
    returnOmega: 3.6,
    // rad/s: critically-damped glide back to center after a goal
    shakeAmp: 16,
    // px: peak camera-shake amplitude on a goal
    shakeMs: 520,
    // ms: camera-shake duration
    // Roulette gesture — draw a circle around the ball → a spin flourish. ONE
    // gesture only (per the brief). It reuses the real spin mechanism: a big spin
    // burst + a tangential boost makes the ball loop a tight, decaying spiral.
    rouletteWindowMs: 1300,
    // the circle must be drawn within this window
    rouletteMinTurn: 5.4,
    // rad of accumulated turning to count (~0.86 of a full turn)
    rouletteMinR: 42,
    // px: average loop radius floor (ignore tiny jitter loops)
    rouletteMaxR: 430,
    // px: and ceiling (ignore giant sweeps)
    rouletteNearBall: 270,
    // px: the loop's centroid must be near the ball
    rouletteCooldownMs: 1200,
    // min gap between roulettes
    rouletteSpin: 13,
    // spin burst that bends the path into a tight spiral
    rouletteSpeed: 640,
    // px/s tangential boost so the ball actually loops
    flourishSpin: 1500,
    // deg/s extra visual whirl of the ball surface
    flourishDecay: 3,
    // per s: the whirl bleeds off
    // Mental Cache.
    thoughtCap: 120,
    // max characters of a thought (§7 — a brain-dump is short)
    breatheAmp: 0.03,
    // idle breathing: 100% → 103% → 100%
    breathePeriod: 4.2,
    // s per breathing cycle
    storeCaptureR: 96,
    // px: how near the goal the ball must come to be kept
    // (sized to the goal mouth so a manual flick into it registers naturally)
    storeWindowMs: 1800,
    // ms: only capture within this long after a user interaction
    storeMs: 340,
    // ms: the sink-into-dish animation
    wobbleAmp: 5,
    // px: idle wobble of shelf spheres (resting-together, no collision)
    readRate: 6.5,
    // per s: sphere↔card unwrap cross-transition speed
    breakSpeed: 900
    // px/s: impact speed above which hitting an edge dissolves the
    // thought — high enough that a gentle drift/roam (155) never triggers it, only
    // a genuinely committed hard flick.
  };
  const state = {
    px: 0,
    py: 0,
    vx: 0,
    vy: 0,
    angle: 0,
    // accumulated roll (deg)
    spin: 0,
    // signed angular impulse driving the path curve
    flourish: 0,
    // deg/s of extra visual whirl (roulette gesture), decays
    engage: 0,
    // 0 = roam, 1 = chase
    // Cursor tracking.
    mx: 0,
    my: 0,
    hasCursor: false,
    lastMoveAt: -1e9,
    // performance.now() of the last real cursor movement
    phase: "play",
    // "play" | "scored" | "returning"
    scoredAt: 0,
    // performance.now() when the last goal was scored
    goals: 0,
    // how many goals scored this session (for tests / feel)
    // Mental-cache: the active thought carried by the ball.
    visible: true,
    // in mental-cache mode the ball is hidden until a thought exists
    text: "",
    // the active thought's text
    thoughtId: null,
    // the active thought's id
    url: "",
    // source page, when captured from a tab
    storeAt: 0,
    // performance.now() when the sink-into-dish began
    storeScale: 1,
    // 1 → 0 as the ball sinks into the dish
    reading: false,
    // Unwrap: the sphere is frozen and reading as a flat card
    readAlpha: 0,
    // 0 = full sphere, 1 = full card (tweened cross-transition)
    letGoAt: 0,
    // performance.now() when the "let it go" flick started
    trailAt: 0
    // last vapour-trail emission during that flight
  };
  let ball, body, shadowEl, initialized = false;
  let goalEl, netEl, stageEl, flashEl;
  let shakeUntil = 0;
  let ROOT = document;
  let OVERLAY = false;
  let MENTAL = false;
  let faceEl = null;
  let ballR = CONFIG.radius;
  const qId = (id) => ROOT.querySelector("#" + id);
  let dish = null;
  let onStore$1 = null;
  let onBreak = null;
  let frameHooks = [];
  let lastUserInteract = -1e9;
  let engineNow = 0;
  let storeMode = "keep";
  let snoozeUntil = 0;
  function vw() {
    return window.innerWidth || document.documentElement.clientWidth || 1280;
  }
  function vh() {
    return window.innerHeight || document.documentElement.clientHeight || 800;
  }
  const props = [];
  function initProps() {
    ROOT.querySelectorAll(".reactive").forEach((el) => {
      props.push({ el, box: null, ox: 0, oy: 0, ovx: 0, ovy: 0, cool: 0 });
    });
    measureProps();
  }
  function measureProps() {
    for (const p of props) {
      const savedT = p.el.style.transform;
      p.el.style.transform = "";
      const r = p.el.getBoundingClientRect();
      p.el.style.transform = savedT;
      p.box = { l: r.left, t: r.top, R: r.right, B: r.bottom };
    }
  }
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
      if (t1 > t2) {
        const t = t1;
        t1 = t2;
        t2 = t;
        sign = 1;
      }
      if (t1 > tmin) {
        tmin = t1;
        nx = sign;
        ny = 0;
      }
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return null;
    }
    if (Math.abs(dy) < 1e-9) {
      if (y0 < E.t || y0 > E.B) return null;
    } else {
      let t1 = (E.t - y0) / dy;
      let t2 = (E.B - y0) / dy;
      let sign = -1;
      if (t1 > t2) {
        const t = t1;
        t1 = t2;
        t2 = t;
        sign = 1;
      }
      if (t1 > tmin) {
        tmin = t1;
        nx = 0;
        ny = sign;
      }
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return null;
    }
    if (tmin <= 0 || tmin >= 1) return null;
    return { x: x0 + dx * tmin, y: y0 + dy * tmin, nx, ny };
  }
  function resolveProps(prevX, prevY, now) {
    const r = ballR;
    for (const p of props) {
      if (!p.box) continue;
      const E = { l: p.box.l - r, t: p.box.t - r, R: p.box.R + r, B: p.box.B + r };
      let nx = 0;
      let ny = 0;
      let hit = false;
      if (state.px > E.l && state.px < E.R && state.py > E.t && state.py < E.B) {
        const dl = state.px - E.l;
        const dr = E.R - state.px;
        const dt2 = state.py - E.t;
        const db = E.B - state.py;
        const m = Math.min(dl, dr, dt2, db);
        if (m === dl) {
          state.px = E.l;
          nx = -1;
        } else if (m === dr) {
          state.px = E.R;
          nx = 1;
        } else if (m === dt2) {
          state.py = E.t;
          ny = -1;
        } else {
          state.py = E.B;
          ny = 1;
        }
        hit = true;
      } else {
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
      const vn = state.vx * nx + state.vy * ny;
      if (vn >= 0) continue;
      const impact = -vn;
      const spd = Math.hypot(state.vx, state.vy) || 1;
      const dirx = state.vx / spd;
      const diry = state.vy / spd;
      state.vx -= (1 + CONFIG.elemRestitution) * vn * nx;
      state.vy -= (1 + CONFIG.elemRestitution) * vn * ny;
      if (now > p.cool) {
        const knock = Math.min(impact, CONFIG.maxSpeed) * CONFIG.tackleGain;
        p.ovx += dirx * knock;
        p.ovy += diry * knock;
        p.cool = now + CONFIG.tackleCooldown * 1e3;
      }
    }
  }
  function stepProps(dt) {
    const k = CONFIG.tackleOmega * CONFIG.tackleOmega;
    const c = 2 * CONFIG.tackleZeta * CONFIG.tackleOmega;
    for (const p of props) {
      p.ovx += (k * -p.ox - c * p.ovx) * dt;
      p.ovy += (k * -p.oy - c * p.ovy) * dt;
      p.ox += p.ovx * dt;
      p.oy += p.ovy * dt;
      const d = Math.hypot(p.ox, p.oy);
      if (d > CONFIG.tackleMax) {
        const s = CONFIG.tackleMax / d;
        p.ox *= s;
        p.oy *= s;
      }
    }
  }
  function getGoal(W, H) {
    const mouth = Math.min(CONFIG.goalMouth, Math.max(CONFIG.goalMinMouth, H * 0.42));
    const yTop = (H - mouth) / 2;
    return { zx: W - CONFIG.goalDepth, yTop, yBot: yTop + mouth, depth: CONFIG.goalDepth };
  }
  function layoutGoal(W, H) {
    if (!goalEl) return;
    const g = getGoal(W, H);
    goalEl.style.left = `${g.zx}px`;
    goalEl.style.top = `${g.yTop}px`;
    goalEl.style.width = `${g.depth}px`;
    goalEl.style.height = `${g.yBot - g.yTop}px`;
  }
  function restartAnim(el, cls) {
    if (!el) return;
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  }
  function celebrate(W, H, now) {
    const g = getGoal(W, H);
    restartAnim(netEl, "is-billow");
    restartAnim(flashEl, "is-flash");
    const cx = g.zx + g.depth * 0.4;
    const cy = (g.yTop + g.yBot) / 2;
    burst(cx, cy, -Math.PI / 2);
    burst(cx, cy, -Math.PI * 0.5 - 0.9);
    cheer();
    shakeUntil = now + CONFIG.shakeMs;
  }
  let lastW$1 = 0;
  let lastH$1 = 0;
  function integrate(dt, now) {
    engineNow = now;
    const W = vw();
    const H = vh();
    const r = ballR;
    if (W !== lastW$1 || H !== lastH$1) {
      lastW$1 = W;
      lastH$1 = H;
      measureProps();
      layoutGoal(W, H);
      resize();
      measureChrome();
    }
    const readTarget = state.reading ? 1 : 0;
    state.readAlpha += (readTarget - state.readAlpha) * Math.min(1, CONFIG.readRate * dt);
    if (state.reading) return;
    if (state.phase === "lettinggo") {
      state.vy += 300 * dt;
      state.px += state.vx * dt;
      state.py += state.vy * dt;
      state.angle += state.vx * dt / r * (180 / Math.PI);
      if (now - state.trailAt > 28) {
        state.trailAt = now;
        smudge(
          state.px - Math.sign(state.vx) * r * 0.5,
          state.py,
          state.vx < 0 ? 0 : Math.PI,
          r * 0.45,
          0.12,
          0.05
        );
      }
      const atEdge = state.px < r * 0.5 || state.px > W - r * 0.5 || state.py < r * 0.5 || state.py > H - r * 0.5;
      if (atEdge || now - state.letGoAt > 900) breakThought(now, W, H);
      stepProps(dt);
      return;
    }
    if (state.phase === "storing") {
      const p = Math.min(1, (now - state.storeAt) / CONFIG.storeMs);
      if (dish) {
        state.px += (dish.x - state.px) * Math.min(1, 12 * dt);
        state.py += (dish.y - state.py) * Math.min(1, 12 * dt);
      }
      state.storeScale = 1 - p;
      if (p >= 1) finishStore();
      return;
    }
    if (state.phase === "scored") {
      state.vx *= Math.pow(0.05, dt);
      state.vy *= Math.pow(0.05, dt);
      state.px += state.vx * dt;
      state.py += state.vy * dt;
      stepProps(dt);
      if (now - state.scoredAt > CONFIG.celebrateMs) state.phase = "returning";
      return;
    }
    if (state.phase === "returning") {
      const kR = CONFIG.returnOmega * CONFIG.returnOmega;
      const cR = 2 * CONFIG.returnOmega;
      const tx = W / 2;
      const ty = H / 2;
      state.vx += (kR * (tx - state.px) - cR * state.vx) * dt;
      state.vy += (kR * (ty - state.py) - cR * state.vy) * dt;
      state.px += state.vx * dt;
      state.py += state.vy * dt;
      state.angle += state.vx * dt / r * (180 / Math.PI);
      stepProps(dt);
      if (Math.hypot(tx - state.px, ty - state.py) < 6 && Math.hypot(state.vx, state.vy) < 30) {
        state.phase = "play";
      }
      return;
    }
    const idleFor = (now - state.lastMoveAt) / 1e3;
    const target = state.hasCursor && idleFor < CONFIG.engageHold ? 1 : 0;
    const eRate = target > state.engage ? CONFIG.engageRise : CONFIG.engageFall;
    state.engage += (target - state.engage) * Math.min(1, eRate * dt);
    const e = state.engage;
    const k = CONFIG.chaseOmega * CONFIG.chaseOmega;
    const c = 2 * CONFIG.chaseZeta * CONFIG.chaseOmega;
    const dxc = state.mx - state.px;
    const dyc = state.my - state.py;
    const dist = Math.hypot(dxc, dyc) || 1e-4;
    const near = Math.min(1, dist / CONFIG.deadzone);
    const surge = 1 - CONFIG.surge + CONFIG.surge * (0.5 + 0.5 * Math.sin(now * 6e-3));
    const pull = k * near * surge;
    let ax = e * (pull * dxc - c * state.vx);
    let ay = e * (pull * dyc - c * state.vy);
    const sp = Math.hypot(state.vx, state.vy) || 1e-4;
    const rx = state.vx / sp * CONFIG.roamSpeed - state.vx;
    const ry = state.vy / sp * CONFIG.roamSpeed - state.vy;
    ax += (1 - e) * CONFIG.roamSteer * rx;
    ay += (1 - e) * CONFIG.roamSteer * ry;
    ax -= CONFIG.rollFriction * state.vx * e;
    ay -= CONFIG.rollFriction * state.vy * e;
    if (Math.abs(state.spin) > 1e-4) {
      const g2 = CONFIG.spinCurve * state.spin;
      ax += -g2 * state.vy;
      ay += g2 * state.vx;
      state.spin *= Math.exp(-CONFIG.spinDecay * dt);
    }
    state.vx += ax * dt;
    state.vy += ay * dt;
    const speed = Math.hypot(state.vx, state.vy);
    if (speed > CONFIG.maxSpeed) {
      const s = CONFIG.maxSpeed / speed;
      state.vx *= s;
      state.vy *= s;
    }
    const prevX = state.px;
    const prevY = state.py;
    state.px += state.vx * dt;
    state.py += state.vy * dt;
    resolveProps(prevX, prevY, now);
    const g = getGoal(W, H);
    const shotSpeed = Math.hypot(state.vx, state.vy);
    if (!OVERLAY && state.px > g.zx && state.py > g.yTop && state.py < g.yBot && state.vx > 0 && shotSpeed > CONFIG.scoreSpeed) {
      state.phase = "scored";
      state.scoredAt = now;
      state.goals++;
      state.px = Math.min(state.px, W - r);
      state.spin = 0;
      celebrate(W, H, now);
      stepProps(dt);
      return;
    }
    const minX = r, maxX = W - r, minY = r, maxY = H - r;
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
    state.angle += (state.px - prevX) / r * (180 / Math.PI);
    if (state.flourish) {
      state.angle += state.flourish * dt;
      state.flourish *= Math.exp(-CONFIG.flourishDecay * dt);
      if (Math.abs(state.flourish) < 1) state.flourish = 0;
    }
    stepProps(dt);
    if (MENTAL && dish && state.visible) {
      const near2 = Math.hypot(state.px - dish.x, state.py - dish.y) < CONFIG.storeCaptureR + r;
      const deliberate = now - lastUserInteract < CONFIG.storeWindowMs;
      if (near2 && deliberate) beginStore(now);
    }
  }
  function render() {
    if (!ball) return;
    if (MENTAL) {
      ball.style.display = state.visible ? "" : "none";
      if (!state.visible) return;
    }
    let breathe = 1;
    if (MENTAL) {
      const t = performance.now() / 1e3;
      breathe = 1 + CONFIG.breatheAmp * 0.5 * (1 - Math.cos(t / CONFIG.breathePeriod * 2 * Math.PI));
    }
    const readShrink = 1 - 0.55 * state.readAlpha;
    const scale = breathe * (state.phase === "storing" ? state.storeScale : 1) * readShrink;
    ball.style.transform = `translate(${state.px}px, ${state.py}px) scale(${scale.toFixed(4)})`;
    if (MENTAL) ball.style.opacity = (1 - state.readAlpha).toFixed(3);
    body.style.transform = `rotate(${state.angle}deg)`;
    if (shadowEl) {
      const sp = Math.hypot(state.vx, state.vy);
      const lift = Math.min(1, sp / 1400);
      const scale2 = 1 - 0.22 * lift;
      shadowEl.style.transform = `scale(${scale2.toFixed(3)})`;
      shadowEl.style.opacity = (1 - 0.45 * lift).toFixed(3);
    }
    for (const p of props) {
      p.el.style.transform = `translate(${p.ox}px, ${p.oy}px) rotate(${p.ox * CONFIG.tackleRot}deg)`;
    }
    if (netEl) netEl.classList.toggle("is-goal", state.phase === "scored");
    if (stageEl) {
      const now = performance.now();
      if (now < shakeUntil) {
        const rem = (shakeUntil - now) / CONFIG.shakeMs;
        const amp = CONFIG.shakeAmp * rem * rem;
        const sx = (Math.random() * 2 - 1) * amp;
        const sy = (Math.random() * 2 - 1) * amp;
        stageEl.style.transform = `translate(${sx}px, ${sy}px)`;
      } else if (stageEl.style.transform) {
        stageEl.style.transform = "";
      }
    }
  }
  let down = null;
  function onPointerMove(e) {
    if (e.pointerType === "touch" && !down) return;
    const x = e.clientX;
    const y = e.clientY;
    state.mx = x;
    state.my = y;
    state.hasCursor = true;
    const now = performance.now();
    state.lastMoveAt = now;
    feedGesturePoint(x, y, now);
  }
  function onPointerDown(e) {
    unlock();
    if (e.target.closest && e.target.closest(".no-kick")) return;
    down = { x: e.clientX, y: e.clientY, t: performance.now() };
    state.mx = e.clientX;
    state.my = e.clientY;
    state.hasCursor = true;
    state.lastMoveAt = down.t;
    lastUserInteract = down.t;
  }
  function onPointerUp(e) {
    if (!down) return;
    const upx = e.clientX;
    const upy = e.clientY;
    const dragx = upx - down.x;
    const dragy = upy - down.y;
    const dragLen = Math.hypot(dragx, dragy);
    const dts = Math.max(0.016, (performance.now() - down.t) / 1e3);
    kick(upx, upy, dragx, dragy, dragLen, dragLen / dts);
    down = null;
    if (e.pointerType === "touch") state.hasCursor = false;
  }
  function kick(cx, cy, dragx, dragy, dragLen, flickSpeed) {
    let dirx, diry, power;
    let flickCurl = 0;
    if (dragLen > CONFIG.flickIsDrag) {
      dirx = dragx / dragLen;
      diry = dragy / dragLen;
      power = clamp$2(flickSpeed * CONFIG.kickFromSpeed, CONFIG.kickMin, CONFIG.kickMax);
      const toBallx = state.px - down.x;
      const toBally = state.py - down.y;
      const tl = Math.hypot(toBallx, toBally) || 1;
      flickCurl = (dirx * toBally - diry * toBallx) / tl;
    } else {
      let dx = cx - state.px;
      let dy = cy - state.py;
      let d = Math.hypot(dx, dy);
      if (d < 1e-3) {
        const s = Math.hypot(state.vx, state.vy);
        if (s > 12) {
          dx = state.vx;
          dy = state.vy;
          d = s;
        } else {
          dx = 0;
          dy = -1;
          d = 1;
        }
      }
      dirx = dx / d;
      diry = dy / d;
      power = clamp$2(d * CONFIG.kickPokeGain, CONFIG.kickMin, CONFIG.kickMax);
    }
    const powerFrac = power / CONFIG.kickMax;
    const preSpeed = Math.hypot(state.vx, state.vy);
    let redirect = 0;
    if (preSpeed > 20) {
      redirect = (state.vx * diry - state.vy * dirx) / preSpeed;
    }
    const baseSign = Math.random() < 0.5 ? -1 : 1;
    const base = baseSign * (0.6 + 0.4 * Math.random()) * CONFIG.spinBase;
    const spin = (flickCurl * CONFIG.spinFromKick + redirect * CONFIG.spinFromKick * 0.5 + base) * powerFrac;
    state.vx += dirx * power;
    state.vy += diry * power;
    state.spin += spin;
    lastUserInteract = performance.now();
    thump(powerFrac);
    state.engage = 0;
  }
  function clamp$2(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }
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
    for (const p of gesturePts) {
      cx += p.x;
      cy += p.y;
    }
    cx /= n;
    cy /= n;
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
    const sp = Math.hypot(state.vx, state.vy);
    let dx = state.vx, dy = state.vy;
    if (sp < 40) {
      dx = 1;
      dy = 0;
    } else {
      dx /= sp;
      dy /= sp;
    }
    state.vx += -dir * dy * CONFIG.rouletteSpeed;
    state.vy += dir * dx * CONFIG.rouletteSpeed;
    state.spin += dir * CONFIG.rouletteSpin;
    state.flourish += dir * CONFIG.flourishSpin;
    state.engage = 0;
    whoosh();
    wake();
  }
  let raf = 0;
  let last = 0;
  function frame(now) {
    let dt = (now - last) / 1e3;
    last = now;
    if (dt > 0.032) dt = 0.032;
    if (dt <= 0) dt = 1 / 60;
    integrate(dt, now);
    render();
    step(dt);
    for (const h of frameHooks) h(dt, now);
    raf = requestAnimationFrame(frame);
  }
  function wake() {
    if (!raf) {
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }
  }
  function startKickoff(opts = {}) {
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
    if (fx) init(fx);
    layoutGoal(vw(), vh());
    initChrome(ROOT);
    if (MENTAL) {
      state.visible = false;
      state.px = vw() / 2;
      state.py = vh() / 2;
      state.vx = 0;
      state.vy = 0;
    } else {
      state.px = vw() / 2;
      state.py = vh() / 2;
      const a = Math.random() * Math.PI * 2;
      state.vx = Math.cos(a) * CONFIG.roamSpeed;
      state.vy = Math.sin(a) * CONFIG.roamSpeed;
    }
    initProps();
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    (OVERLAY ? ball : window).addEventListener("pointerdown", onPointerDown, { passive: true });
    window.addEventListener("pointerup", onPointerUp, { passive: true });
    window.addEventListener("pointerleave", () => {
      state.hasCursor = false;
    });
    window.addEventListener("blur", () => {
      state.hasCursor = false;
    });
    render();
    wake();
    installDebugHooks();
    return engineApi;
  }
  function triggerGoal() {
    if (state.phase !== "play") return;
    const now = performance.now();
    state.phase = "scored";
    state.scoredAt = now;
    state.goals++;
    celebrate(vw(), vh(), now);
    wake();
  }
  function beginStore(now) {
    if (state.phase === "storing") return;
    state.phase = "storing";
    state.storeAt = now;
    state.storeScale = 1;
  }
  function finishStore() {
    const thought = {
      id: state.thoughtId,
      text: state.text,
      url: state.url || "",
      mode: storeMode,
      // "keep" | "done" | "snooze"
      snoozeUntil: storeMode === "snooze" ? snoozeUntil : 0
    };
    const gx = dish ? dish.x : state.px;
    const gy = dish ? dish.y : state.py;
    state.visible = false;
    state.phase = "play";
    state.storeScale = 1;
    chime();
    celebrateAt(gx, gy, performance.now());
    if (onStore$1) onStore$1(thought);
    storeMode = "keep";
    snoozeUntil = 0;
  }
  function celebrateAt(x, y, now) {
    if (netEl) restartAnim(netEl, "is-billow");
    if (flashEl) restartAnim(flashEl, "is-flash");
    const goalH = netEl ? netEl.getBoundingClientRect().height || 240 : 240;
    const halfH = Math.min(150, goalH / 2);
    burst(x, y, -Math.PI / 2);
    burst(x, y - halfH, -Math.PI * 0.62);
    burst(x, y + halfH, -Math.PI * 0.38);
    burst(x - 40, y, Math.PI);
    cheer();
    shakeUntil = now + CONFIG.shakeMs;
  }
  function beginLetGo() {
    if (!state.visible || state.phase !== "play") return;
    const toEdge = state.px < vw() / 2 ? 1 : -1;
    state.vx = toEdge * 3400;
    state.vy = -340 + Math.random() * 110;
    state.spin = toEdge * 19;
    state.phase = "lettinggo";
    state.letGoAt = engineNow || performance.now();
    state.trailAt = 0;
    wake();
  }
  function breakThought(now, W, H) {
    const r = ballR;
    const thought = { id: state.thoughtId, text: state.text };
    const ox = clamp$2(state.px, r, W - r);
    const oy = clamp$2(state.py, r, H - r);
    const speed = Math.hypot(state.vx, state.vy);
    const dir = Math.atan2(state.vy, state.vx);
    smudge(ox, oy, dir, r, Math.min(1, speed / 1500));
    puff();
    state.visible = false;
    state.phase = "play";
    state.vx = 0;
    state.vy = 0;
    if (onBreak) onBreak(thought);
  }
  function activate({ text = "", id = null, url = "", x, y } = {}) {
    if (state.phase === "storing" && state.visible) finishStore();
    state.text = text;
    state.thoughtId = id;
    state.url = url;
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
  function setFaceText(text) {
    if (!faceEl) return;
    const t = (text || "").trim().slice(0, CONFIG.thoughtCap);
    faceEl.textContent = t;
    faceEl.style.fontSize = labelFontSize(t) + "px";
    faceEl.setAttribute("data-text", t);
  }
  function labelFontSize(t) {
    const n = (t || "").length;
    if (n <= 10) return 14;
    if (n <= 18) return 12.5;
    if (n <= 30) return 11;
    if (n <= 48) return 9.5;
    return 8.5;
  }
  const engineApi = {
    triggerGoal,
    unlockAudio: () => unlock(),
    activate,
    setText: (t) => {
      state.text = t;
      setFaceText(t);
    },
    isActive: () => state.visible,
    currentThought: () => ({ id: state.thoughtId, text: state.text }),
    deactivate: () => {
      state.visible = false;
      state.phase = "play";
    },
    // The two deliberate actions the buttons drive. KEEP flies the ball into the
    // goal and celebrates (cheer + confetti + net); LET GO flicks it away to dissolve.
    // Three distinct outcomes, no more: Keep = park it in the goal (celebration),
    // Snooze = park it with a wake time, letGo = it's out of your head and
    // dissolves. "Finishing" and "discarding" are the same act, so they share one
    // action rather than two that end identically.
    keep: () => {
      if (state.visible && state.phase === "play") {
        storeMode = "keep";
        beginStore(engineNow || performance.now());
      }
    },
    snooze: (untilMs) => {
      if (!state.visible || state.phase !== "play") return;
      storeMode = "snooze";
      snoozeUntil = untilMs;
      beginStore(engineNow || performance.now());
    },
    letGo: () => beginLetGo(),
    canAct: () => state.visible && state.phase === "play",
    setDish: (d) => {
      dish = d;
    },
    // { x, y } viewport center of the dish
    // Rotating a tablet changes which size the ball should be. Physics reads
    // ballR every frame, so updating it here is enough — but clamp the ball back
    // inside the new viewport, or a resize can strand it off-screen.
    setRadius: (r) => {
      ballR = r;
      state.px = clamp$2(state.px, r, Math.max(r, vw() - r));
      state.py = clamp$2(state.py, r, Math.max(r, vh() - r));
    },
    setStoreHandler: (fn) => {
      onStore$1 = fn;
    },
    setBreakHandler: (fn) => {
      onBreak = fn;
    },
    onFrame: (fn) => {
      frameHooks.push(fn);
    },
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
    ballPos: () => ({ x: state.px, y: state.py })
  };
  let simClock = 0;
  function installDebugHooks() {
    const clock = () => simClock || (simClock = performance.now());
    window.__k = {
      state: () => ({ ...state, W: vw(), H: vh(), now: simClock }),
      // Step the sim synchronously n frames at fixed dt (immune to throttling).
      step: (n = 60, dt = 1 / 60) => {
        clock();
        for (let i = 0; i < n; i++) {
          simClock += dt * 1e3;
          integrate(dt, simClock);
          step(dt);
          for (const h of frameHooks) h(dt, simClock);
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
      clearPointer: () => {
        state.hasCursor = false;
      },
      place: (x, y, vx = 0, vy = 0) => {
        state.px = x;
        state.py = y;
        state.vx = vx;
        state.vy = vy;
        state.spin = 0;
      },
      // Reset to a clean, fully-disengaged idle-play state for test isolation.
      resetPlay: () => {
        state.phase = "play";
        state.goals = 0;
        state.spin = 0;
        state.flourish = 0;
        state.px = vw() / 2;
        state.py = vh() / 2;
        state.vx = 0;
        state.vy = 0;
        state.hasCursor = false;
        state.engage = 0;
        state.lastMoveAt = -1e9;
        gesturePts = [];
        rouletteCoolUntil = 0;
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
        for (const p of props) {
          p.ox = p.oy = p.ovx = p.ovy = 0;
          p.cool = 0;
        }
      },
      // Reactive props: rest boxes + current recoil offset/velocity.
      props: () => props.map((p) => ({
        box: p.box,
        ox: +p.ox.toFixed(1),
        oy: +p.oy.toFixed(1),
        speed: +Math.hypot(p.ovx, p.ovy).toFixed(0)
      })),
      config: CONFIG
    };
  }
  const THOUGHT_CAP = 120;
  let els$1 = null;
  let api$2 = null;
  let open$1 = false;
  function initBrainDump(root, engineApi2) {
    api$2 = engineApi2;
    els$1 = {
      pill: root.querySelector("#kc-dump"),
      input: root.querySelector("#kc-dump-input"),
      trigger: root.querySelector("#kc-trigger")
    };
    if (!els$1.pill) return;
    els$1.input.maxLength = THOUGHT_CAP;
    els$1.trigger.addEventListener("click", () => open$1 ? close$1() : summon());
    els$1.input.addEventListener("keydown", onKey);
    const grip = root.querySelector("#kc-dump-grip");
    if (grip) grip.addEventListener("pointerdown", onPillDrag);
    els$1.pill.addEventListener("pointerdown", (e) => {
      if (e.target === els$1.input || e.target === grip) return;
      onPillDrag(e);
    });
    document.addEventListener("keydown", onGlobalKey, true);
  }
  function onGlobalKey(e) {
    const mod = (e.ctrlKey || e.metaKey) && e.shiftKey;
    if (!mod) return;
    const k = (e.key || "").toLowerCase();
    if (k === "s") {
      e.preventDefault();
      e.stopPropagation();
      capturePage();
      return;
    }
    if (k === "k") {
      e.preventDefault();
      e.stopPropagation();
      open$1 ? close$1() : summon();
    }
  }
  function capturePage() {
    api$2 && api$2.unlockAudio();
    const title = (document.title || location.hostname).trim().slice(0, THOUGHT_CAP);
    api$2.activate({
      text: title,
      id: newId(),
      url: location.href,
      x: window.innerWidth / 2,
      y: window.innerHeight / 2
    });
  }
  const clampN = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;
  function centrePill() {
    const w = els$1.pill.offsetWidth || 480;
    const h = els$1.pill.offsetHeight || 62;
    els$1.pill.style.left = Math.round((window.innerWidth - w) / 2) + "px";
    els$1.pill.style.top = Math.round(window.innerHeight * 0.34 - h / 2) + "px";
  }
  function onPillDrag(e) {
    e.preventDefault();
    e.stopPropagation();
    const r = els$1.pill.getBoundingClientRect();
    const offX = e.clientX - r.left;
    const offY = e.clientY - r.top;
    const move = (ev) => {
      const w = els$1.pill.offsetWidth, h = els$1.pill.offsetHeight;
      els$1.pill.style.left = clampN(ev.clientX - offX, 8, window.innerWidth - w - 8) + "px";
      els$1.pill.style.top = clampN(ev.clientY - offY, 8, window.innerHeight - h - 8) + "px";
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("pointerup", up, { passive: true });
  }
  function summon() {
    if (!els$1) return;
    api$2 && api$2.unlockAudio();
    open$1 = true;
    els$1.pill.classList.add("is-open");
    centrePill();
    const sel = window.getSelection && String(window.getSelection() || "").trim() || "";
    els$1.input.value = sel ? sel.slice(0, THOUGHT_CAP) : "";
    const grab = () => {
      try {
        els$1.input.focus({ preventScroll: true });
      } catch {
        els$1.input.focus();
      }
    };
    grab();
    setTimeout(grab, 40);
    setTimeout(grab, 140);
  }
  function close$1() {
    open$1 = false;
    els$1.pill.classList.remove("is-open");
    els$1.input.blur();
  }
  function onKey(e) {
    e.stopPropagation();
    if (e.key === "Enter") {
      const text = els$1.input.value.trim();
      if (text) {
        api$2.activate({ text, id: newId(), x: window.innerWidth / 2, y: window.innerHeight / 2 });
      }
      close$1();
    } else if (e.key === "Escape") {
      close$1();
    }
  }
  function newId() {
    return "t_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }
  const KEY = "kc_thoughts";
  const ONBOARD_KEY = "kc_onboarded";
  let mem = [];
  let memOnboard = false;
  function hasChromeStorage() {
    return typeof chrome !== "undefined" && chrome.storage && chrome.storage.local;
  }
  function usingChromeStorage() {
    return !!hasChromeStorage();
  }
  function loadThoughts() {
    return new Promise((resolve) => {
      if (hasChromeStorage()) {
        try {
          chrome.storage.local.get(KEY, (r) => resolve(r && r[KEY] || []));
        } catch {
          resolve([]);
        }
      } else {
        resolve(mem.slice());
      }
    });
  }
  function saveThoughts(thoughts2) {
    const data = thoughts2.map((t) => ({
      id: t.id,
      text: t.text,
      url: t.url || "",
      createdAt: t.createdAt || Date.now()
    }));
    if (hasChromeStorage()) {
      try {
        chrome.storage.local.set({ [KEY]: data });
      } catch {
      }
    } else {
      mem = data;
    }
  }
  function isOnboarded() {
    return new Promise((resolve) => {
      if (hasChromeStorage()) {
        try {
          chrome.storage.local.get(ONBOARD_KEY, (r) => resolve(!!(r && r[ONBOARD_KEY])));
        } catch {
          resolve(false);
        }
      } else {
        resolve(memOnboard);
      }
    });
  }
  const REVIEW_KEY = "kc_lastreview";
  let memReview = "";
  function loadLastReview() {
    return new Promise((resolve) => {
      if (hasChromeStorage()) {
        try {
          chrome.storage.local.get(REVIEW_KEY, (r) => resolve(r && r[REVIEW_KEY] || ""));
        } catch {
          resolve("");
        }
      } else {
        resolve(memReview);
      }
    });
  }
  function saveLastReview(day) {
    if (hasChromeStorage()) {
      try {
        chrome.storage.local.set({ [REVIEW_KEY]: day });
      } catch {
      }
    } else {
      memReview = day;
    }
  }
  const POS_KEY = "kc_goalpos";
  function loadGoalPos() {
    return new Promise((resolve) => {
      if (hasChromeStorage()) {
        try {
          chrome.storage.local.get(POS_KEY, (r) => resolve(r && r[POS_KEY] || null));
        } catch {
          resolve(null);
        }
      } else {
        resolve(memPos);
      }
    });
  }
  let memPos = null;
  function saveGoalPos(p) {
    if (hasChromeStorage()) {
      try {
        chrome.storage.local.set({ [POS_KEY]: p });
      } catch {
      }
    } else {
      memPos = p;
    }
  }
  function setOnboarded() {
    if (hasChromeStorage()) {
      try {
        chrome.storage.local.set({ [ONBOARD_KEY]: true });
      } catch {
      }
    } else {
      memOnboard = true;
    }
  }
  let api$1 = null;
  let els = null;
  let thoughts = [];
  let open = false;
  let spheres = [];
  let lastW = 0, lastH = 0;
  let query = "";
  const SPRING = () => ({
    k: CONFIG.chaseOmega * CONFIG.chaseOmega,
    c: 2 * CONFIG.chaseZeta * CONFIG.chaseOmega
  });
  function initShelf(root, engineApi2) {
    api$1 = engineApi2;
    els = {
      dish: root.querySelector("#kc-dish"),
      glow: root.querySelector("#kc-dish-glow"),
      count: root.querySelector("#kc-dish-count"),
      puck: root.querySelector("#kc-puck"),
      tray: root.querySelector("#kc-tray"),
      slots: root.querySelector("#kc-tray-slots"),
      search: root.querySelector("#kc-search"),
      exportBtn: root.querySelector("#kc-export"),
      empty: root.querySelector("#kc-tray-empty"),
      more: root.querySelector("#kc-more"),
      menu: root.querySelector("#kc-more-menu"),
      clearBtn: root.querySelector("#kc-clear"),
      card: root.querySelector("#kc-thought-card"),
      tcText: root.querySelector("#kc-tc-text"),
      tcLink: root.querySelector("#kc-tc-link"),
      tcCopy: root.querySelector("#kc-tc-copy"),
      tcOpen: root.querySelector("#kc-tc-open"),
      tcOut: root.querySelector("#kc-tc-out"),
      tcDel: root.querySelector("#kc-tc-del"),
      undo: root.querySelector("#kc-undo"),
      undoText: root.querySelector("#kc-undo-text"),
      undoBtn: root.querySelector("#kc-undo-btn"),
      kickoff: root.querySelector("#kc-kickoff"),
      kickoffText: root.querySelector("#kc-kickoff-text"),
      kickoffGo: root.querySelector("#kc-kickoff-go"),
      kickoffSkip: root.querySelector("#kc-kickoff-skip")
    };
    if (!els.dish) return;
    els.kickoffGo.addEventListener("click", (e) => {
      e.stopPropagation();
      api$1.unlockAudio();
      startKickoffReview();
    });
    els.kickoffSkip.addEventListener("click", (e) => {
      e.stopPropagation();
      dismissKickoff();
    });
    els.more.addEventListener("click", (e) => {
      e.stopPropagation();
      els.menu.classList.toggle("is-open");
    });
    els.clearBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      els.menu.classList.remove("is-open");
      clearAll();
    });
    els.undoBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      undoClear();
    });
    els.tcCopy.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (!cardThought) return;
      try {
        await navigator.clipboard.writeText(cardThought.text || "");
      } catch {
      }
      els.tcCopy.textContent = "Copied";
      setTimeout(() => els.tcCopy.textContent = "Copy", 1200);
    });
    els.tcOpen.addEventListener("click", (e) => {
      e.stopPropagation();
      if (cardThought && cardThought.url) window.open(cardThought.url, "_blank", "noopener");
    });
    els.tcOut.addEventListener("click", (e) => {
      e.stopPropagation();
      if (!cardThought) return;
      const t = cardThought;
      closeThoughtCard();
      retrieveThought(t, window.innerWidth / 2, window.innerHeight / 2);
    });
    els.tcDel.addEventListener("click", (e) => {
      e.stopPropagation();
      if (!cardThought) return;
      const removed = cardThought;
      thoughts = thoughts.filter((t) => t.id !== removed.id);
      saveThoughts(thoughts);
      updateDishCount();
      closeThoughtCard();
      refreshSpheres();
      updateEmptyState();
      offerUndo(`Deleted “${(removed.text || "").slice(0, 24)}”`, [removed]);
    });
    els.tray.addEventListener("pointerdown", (ev) => {
      if (!els.card.contains(ev.target)) closeThoughtCard();
      if (!els.menu.contains(ev.target) && ev.target !== els.more) els.menu.classList.remove("is-open");
    });
    if (els.search) {
      els.search.addEventListener("input", (e) => {
        query = e.target.value || "";
        if (open) refreshSpheres();
        updateEmptyState();
      });
      els.search.addEventListener("keydown", (e) => {
        e.stopPropagation();
        if (e.key === "Escape") {
          query = "";
          els.search.value = "";
          if (open) refreshSpheres();
        }
      });
    }
    if (els.exportBtn) {
      els.exportBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const md = thoughts.map((t) => `- ${t.text}${t.url ? ` — ${t.url}` : ""}`).join("\n");
        try {
          await navigator.clipboard.writeText(md);
        } catch {
        }
        els.exportBtn.classList.add("is-copied");
        setTimeout(() => els.exportBtn.classList.remove("is-copied"), 1400);
      });
    }
    api$1.setStoreHandler(onStore);
    api$1.setBreakHandler(() => {
      if (reviewQueue.length) setTimeout(nextReviewThought, 700);
    });
    api$1.onFrame(update);
    els.dish.addEventListener("pointerdown", onGoalPointerDown);
    document.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key || "").toLowerCase() === "g") {
        e.preventDefault();
        e.stopPropagation();
        toggleCollapse();
      }
    }, true);
    loadGoalPos().then((p) => {
      if (p && typeof p.x === "number") goalPos = p;
      refreshDishPos();
    });
    loadThoughts().then((saved) => {
      thoughts = saved;
      updateDishCount();
      if (saved.length === 0) maybeOnboard();
      else maybeDailyKickoff();
    });
  }
  let reviewQueue = [];
  const todayKey = () => (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  function maybeDailyKickoff() {
    loadLastReview().then((last2) => {
      if (last2 === todayKey()) return;
      const now = Date.now();
      const cutoff = /* @__PURE__ */ new Date();
      cutoff.setHours(0, 0, 0, 0);
      const due = thoughts.filter(
        (t) => (!t.snoozeUntil || t.snoozeUntil <= now) && (t.createdAt || 0) < cutoff.getTime()
      );
      if (!due.length) return;
      reviewQueue = due.slice(0, 3);
      showKickoffPrompt(reviewQueue.length);
    });
  }
  function showKickoffPrompt(n) {
    if (!els.kickoff) return;
    els.kickoffText.textContent = `${n} thought${n === 1 ? "" : "s"} from before — still worth keeping?`;
    els.kickoff.classList.add("is-open");
  }
  function startKickoffReview() {
    els.kickoff.classList.remove("is-open");
    saveLastReview(todayKey());
    nextReviewThought();
  }
  function nextReviewThought() {
    const t = reviewQueue.shift();
    if (!t) return;
    if (!thoughts.some((x) => x.id === t.id)) return nextReviewThought();
    retrieveThought(t, window.innerWidth / 2, window.innerHeight / 2);
  }
  function dismissKickoff() {
    els.kickoff.classList.remove("is-open");
    reviewQueue = [];
    saveLastReview(todayKey());
  }
  function maybeOnboard() {
    isOnboarded().then((done) => {
      if (done) return;
      setOnboarded();
      api$1.activate({ text: "flick me!", id: "welcome" });
    });
  }
  let goalPos = null;
  let trayRect = null;
  const clamp$1 = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;
  function goalRotation(cx, cy) {
    const dL = cx, dR = window.innerWidth - cx, dT = cy, dB = window.innerHeight - cy;
    const m = Math.min(dL, dR, dT, dB);
    if (m === dR) return 0;
    if (m === dB) return 90;
    if (m === dL) return 180;
    return 270;
  }
  function applyGoalPos() {
    const gw = els.dish.offsetWidth || 136;
    const gh = els.dish.offsetHeight || 264;
    let rot = goalRotation(
      clamp$1(goalPos.x, 0, window.innerWidth),
      clamp$1(goalPos.y, 0, window.innerHeight)
    );
    const sideways = rot === 90 || rot === 270;
    const ew = sideways ? gh : gw;
    const eh = sideways ? gw : gh;
    const cx = clamp$1(goalPos.x, ew / 2, Math.max(ew / 2, window.innerWidth - ew / 2));
    const cy = clamp$1(goalPos.y, eh / 2, Math.max(eh / 2, window.innerHeight - eh / 2));
    goalPos = { x: cx, y: cy };
    els.dish.style.left = cx - gw / 2 + "px";
    els.dish.style.top = cy - gh / 2 + "px";
    els.dish.style.transform = `rotate(${rot}deg)`;
    if (els.count) els.count.style.transform = `translateY(-50%) rotate(${-rot}deg)`;
    api$1.setDish({ x: cx, y: cy });
    layoutTray(cx, cy, ew, eh, rot);
    if (open) layoutSlots();
    return goalPos;
  }
  function layoutTray(cx, cy, ew, eh, rot) {
    const tw = els.tray.offsetWidth || 340;
    const th = els.tray.offsetHeight || 320;
    const gap = 16;
    let left, top, origin;
    if (rot === 0) {
      left = cx - ew / 2 - gap - tw;
      top = cy - th / 2;
      origin = "right center";
    } else if (rot === 180) {
      left = cx + ew / 2 + gap;
      top = cy - th / 2;
      origin = "left center";
    } else if (rot === 90) {
      left = cx - tw / 2;
      top = cy - eh / 2 - gap - th;
      origin = "center bottom";
    } else {
      left = cx - tw / 2;
      top = cy + eh / 2 + gap;
      origin = "center top";
    }
    left = clamp$1(left, 12, Math.max(12, window.innerWidth - tw - 12));
    top = clamp$1(top, 12, Math.max(12, window.innerHeight - th - 12));
    els.tray.style.left = left + "px";
    els.tray.style.top = top + "px";
    els.tray.style.transformOrigin = origin;
    trayRect = { left, top, width: tw, height: th };
  }
  function refreshDishPos() {
    if (!goalPos) {
      const r = els.dish.getBoundingClientRect();
      goalPos = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }
    return applyGoalPos();
  }
  let collapsed = false;
  function toggleCollapse() {
    collapsed = !collapsed;
    els.dish.classList.toggle("is-collapsed", collapsed);
    if (collapsed) close();
    updateDishCount();
  }
  function onGoalPointerDown(e) {
    if (collapsed) {
      e.stopPropagation();
      const sx2 = e.clientX, sy2 = e.clientY;
      let moved2 = false;
      const mv = (ev) => {
        if (Math.hypot(ev.clientX - sx2, ev.clientY - sy2) > 4) moved2 = true;
      };
      const up2 = () => {
        window.removeEventListener("pointermove", mv);
        window.removeEventListener("pointerup", up2);
        if (!moved2) toggleCollapse();
      };
      window.addEventListener("pointermove", mv, { passive: true });
      window.addEventListener("pointerup", up2, { passive: true });
      return;
    }
    e.stopPropagation();
    const sx = e.clientX, sy = e.clientY;
    const c = goalPos || refreshDishPos();
    const offX = e.clientX - c.x, offY = e.clientY - c.y;
    let moved = false;
    const move = (ev) => {
      if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) > 4) {
        moved = true;
        els.dish.classList.add("is-dragging");
      }
      if (!moved) return;
      goalPos = { x: ev.clientX - offX, y: ev.clientY - offY };
      applyGoalPos();
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      els.dish.classList.remove("is-dragging");
      if (moved) saveGoalPos(goalPos);
      else toggle();
    };
    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("pointerup", up, { passive: true });
  }
  function onStore(thought) {
    restart(els.glow, "is-pulse");
    thoughts.push({
      ...thought,
      createdAt: thought.createdAt || Date.now(),
      snoozeUntil: thought.snoozeUntil || 0
    });
    saveThoughts(thoughts);
    updateDishCount();
    if (open) refreshSpheres();
    if (reviewQueue.length) setTimeout(nextReviewThought, 700);
  }
  function visibleThoughts() {
    const now = Date.now();
    const q = query.trim().toLowerCase();
    return thoughts.filter((t) => !t.snoozeUntil || t.snoozeUntil <= now).filter((t) => !q || (t.text || "").toLowerCase().includes(q));
  }
  function updateDishCount() {
    const n = thoughts.filter((t) => !t.snoozeUntil || t.snoozeUntil <= Date.now()).length;
    if (els.count) els.count.textContent = n ? String(n) : "";
    if (els.puck) els.puck.textContent = n ? String(n) : "⚽";
    els.dish.classList.toggle("has-thoughts", n > 0);
  }
  function refreshSpheres() {
    spheres.forEach((s) => s.el.remove());
    spheres = [];
    els.slots.textContent = "";
    const start = refreshDishPos();
    visibleThoughts().forEach((t) => addSphere(t, start));
    layoutSlots();
  }
  function toggle() {
    open ? close() : openShelf();
  }
  function openShelf() {
    open = true;
    els.tray.classList.add("is-open");
    refreshSpheres();
    if (els.search) {
      els.search.value = query;
      setTimeout(() => els.search.focus({ preventScroll: true }), 80);
    }
    requestAnimationFrame(layoutSlots);
    setTimeout(layoutSlots, 60);
  }
  function close() {
    open = false;
    els.tray.classList.remove("is-open");
    spheres.forEach((s) => s.el.remove());
    spheres = [];
  }
  function addSphere(thought, start) {
    const from = start || refreshDishPos();
    const ageDays = (Date.now() - (thought.createdAt || Date.now())) / 864e5;
    const stale = Math.max(0, Math.min(1, ageDays / 7));
    const el = document.createElement("div");
    el.className = "kc-sphere";
    el.style.filter = `saturate(${(1 - 0.45 * stale).toFixed(2)}) brightness(${(1 - 0.18 * stale).toFixed(2)})`;
    const face = document.createElement("div");
    face.className = "kc-sphere-face";
    const txt = (thought.text || "").slice(0, CONFIG.thoughtCap);
    face.textContent = txt;
    face.style.fontSize = labelFontSize(txt) * 0.72 + "px";
    el.title = txt;
    el.appendChild(face);
    els.slots.appendChild(el);
    const sphere = {
      id: thought.id,
      thought,
      el,
      face,
      px: from.x,
      py: from.y,
      vx: 0,
      vy: 0,
      slotX: from.x,
      slotY: from.y,
      wob: Math.random() * Math.PI * 2,
      wobF: 0.5 + Math.random() * 0.4,
      stale,
      dragging: false
    };
    el.addEventListener("pointerdown", (e) => beginRetrieve(e, sphere));
    spheres.push(sphere);
    layoutSlots();
    return sphere;
  }
  function trayRestRect() {
    if (trayRect) return trayRect;
    const w = els.tray.offsetWidth || 340;
    const h = els.tray.offsetHeight || 320;
    return { left: window.innerWidth - 152 - w, top: (window.innerHeight - h) / 2, width: w, height: h };
  }
  function layoutSlots() {
    if (!spheres.length) return;
    const tr = trayRestRect();
    const pad = 30, cell = 78;
    const cols = Math.max(1, Math.floor((tr.width - pad) / cell));
    spheres.forEach((s, i) => {
      const col = i % cols, row = Math.floor(i / cols);
      s.slotX = tr.left + pad + cell / 2 + col * cell;
      s.slotY = tr.top + pad + cell / 2 + row * cell;
    });
  }
  function update(dt, now) {
    if (els && (window.innerWidth !== lastW || window.innerHeight !== lastH)) {
      lastW = window.innerWidth;
      lastH = window.innerHeight;
      refreshDishPos();
      if (open) layoutSlots();
    }
    if (!open) return;
    const { k, c } = SPRING();
    const t = (now || performance.now()) / 1e3;
    for (const s of spheres) {
      if (!s.dragging) {
        s.vx += (k * (s.slotX - s.px) - c * s.vx) * dt;
        s.vy += (k * (s.slotY - s.py) - c * s.vy) * dt;
        s.px += s.vx * dt;
        s.py += s.vy * dt;
      }
      s.wob += s.wobF * dt;
      const calm = 1 - 0.75 * s.stale;
      const wx = Math.sin(s.wob) * CONFIG.wobbleAmp * calm;
      const wy = Math.cos(s.wob * 0.8) * CONFIG.wobbleAmp * calm;
      const sag = s.stale * 7;
      const breathe = 1 + CONFIG.breatheAmp * 0.5 * calm * (1 - Math.cos(t / CONFIG.breathePeriod * 2 * Math.PI));
      s.el.style.transform = `translate(${(s.px + wx).toFixed(2)}px, ${(s.py + wy + sag).toFixed(2)}px) translate(-50%,-50%) rotate(${(Math.sin(s.wob) * 4 * calm).toFixed(2)}deg) scale(${breathe.toFixed(3)})`;
    }
  }
  function beginRetrieve(e, sphere) {
    e.stopPropagation();
    const sx = e.clientX, sy = e.clientY;
    let moved = false;
    const move = (ev) => {
      if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) > 5) {
        moved = true;
        sphere.dragging = true;
      }
      if (!moved) return;
      sphere.px = ev.clientX;
      sphere.py = ev.clientY;
    };
    const up = (ev) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      if (!moved) {
        openThoughtCard(sphere.thought);
        return;
      }
      retrieveThought(sphere.thought, ev.clientX, ev.clientY);
    };
    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("pointerup", up, { passive: true });
  }
  function retrieveThought(thought, x, y) {
    thoughts = thoughts.filter((t) => t.id !== thought.id);
    saveThoughts(thoughts);
    updateDishCount();
    api$1.unlockAudio();
    api$1.activate({ text: thought.text, id: thought.id, url: thought.url || "", x, y });
    close();
  }
  let cardThought = null;
  function openThoughtCard(thought) {
    cardThought = thought;
    els.tcText.textContent = thought.text || "";
    const hasUrl = !!thought.url;
    els.tcLink.textContent = hasUrl ? thought.url : "";
    els.tcLink.href = hasUrl ? thought.url : "#";
    els.tcLink.classList.toggle("is-shown", hasUrl);
    els.tcOpen.classList.toggle("is-shown", hasUrl);
    els.card.classList.add("is-open");
  }
  function closeThoughtCard() {
    cardThought = null;
    els.card.classList.remove("is-open");
  }
  let undoBuffer = null;
  let undoTimer = 0;
  function clearAll() {
    if (!thoughts.length) return;
    const removed = thoughts.slice();
    thoughts = [];
    saveThoughts(thoughts);
    updateDishCount();
    closeThoughtCard();
    refreshSpheres();
    updateEmptyState();
    offerUndo(`Cleared ${removed.length} thought${removed.length === 1 ? "" : "s"}`, removed);
  }
  function offerUndo(label, removed) {
    undoBuffer = removed;
    els.undoText.textContent = label;
    els.undo.classList.add("is-open");
    clearTimeout(undoTimer);
    undoTimer = setTimeout(() => {
      els.undo.classList.remove("is-open");
      undoBuffer = null;
    }, 6e3);
  }
  function undoClear() {
    if (!undoBuffer) return;
    const have = new Set(thoughts.map((t) => t.id));
    thoughts = thoughts.concat(undoBuffer.filter((t) => !have.has(t.id)));
    saveThoughts(thoughts);
    undoBuffer = null;
    clearTimeout(undoTimer);
    els.undo.classList.remove("is-open");
    updateDishCount();
    if (open) refreshSpheres();
    updateEmptyState();
  }
  function updateEmptyState() {
    if (!els.empty) return;
    const n = visibleThoughts().length;
    els.empty.textContent = thoughts.length === 0 ? "Nothing kept yet — flick a thought into the goal." : n === 0 ? "No thoughts match that." : "";
    els.empty.style.display = n === 0 ? "flex" : "none";
  }
  function restart(el, cls) {
    if (!el) return;
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  }
  function installShelfDebug() {
    return {
      thoughts: () => thoughts.map((t) => ({ id: t.id, text: t.text })),
      isOpen: () => open,
      open: openShelf,
      close,
      sphereCount: () => spheres.length,
      sphereState: () => spheres.map((s) => ({
        id: s.id,
        px: Math.round(s.px),
        py: Math.round(s.py),
        slotX: Math.round(s.slotX),
        slotY: Math.round(s.slotY),
        atSlot: Math.hypot(s.px - s.slotX, s.py - s.slotY) < 3
      })),
      retrieveFirst: () => {
        if (!spheres.length) return false;
        const s = spheres[0];
        thoughts = thoughts.filter((t) => t.id !== s.id);
        saveThoughts(thoughts);
        updateDishCount();
        api$1.activate({ text: s.thought.text, id: s.id, x: s.px, y: s.py });
        close();
        return true;
      },
      storageBacking: () => usingChromeStorage() ? "chrome.storage.local" : "memory-fallback",
      reload: () => loadThoughts()
      // returns a Promise of the persisted array
    };
  }
  let api = null;
  let card = null;
  let cardText = null;
  let hoveringBall = false;
  const CARD_W = 300;
  function initUnwrap(root, engineApi2) {
    api = engineApi2;
    card = root.querySelector("#kc-card");
    cardText = root.querySelector("#kc-card-text");
    const ball2 = root.querySelector("#ball");
    if (!card || !ball2) return;
    ball2.addEventListener("dblclick", (e) => {
      e.preventDefault();
      e.stopPropagation();
      begin();
    });
    ball2.addEventListener("pointerenter", () => hoveringBall = true);
    ball2.addEventListener("pointerleave", () => hoveringBall = false);
    document.addEventListener("keydown", (e) => {
      if (e.code === "Space" && hoveringBall && !api.isReading()) {
        e.preventDefault();
        begin();
      } else if (e.key === "Escape" && api.isReading()) {
        end();
      }
    }, true);
    window.addEventListener("pointerdown", (e) => {
      if (api.isReading() && !e.composedPath().includes(card)) end();
    }, true);
    api.onFrame(updateCard);
  }
  function begin() {
    if (api.isReading()) {
      end();
      return;
    }
    const th = api.activeThought();
    if (!th.visible) return;
    cardText.textContent = th.text || "";
    api.beginRead();
  }
  function end() {
    api.endRead();
  }
  function updateCard() {
    if (!card) return;
    const a = api.readAlpha();
    if (a < 3e-3 && !api.isReading()) {
      card.style.opacity = "0";
      card.style.visibility = "hidden";
      return;
    }
    card.style.visibility = "visible";
    const p = api.ballPos();
    const h = card.offsetHeight || 120;
    const x = clamp(p.x, CARD_W / 2 + 12, window.innerWidth - CARD_W / 2 - 12);
    const y = clamp(p.y, h / 2 + 12, window.innerHeight - h / 2 - 12);
    const scale = 0.55 + 0.45 * a;
    const rot = (1 - a) * -6;
    card.style.opacity = a.toFixed(3);
    card.style.transform = `translate(${x}px, ${y}px) translate(-50%,-50%) scale(${scale.toFixed(3)}) rotate(${rot.toFixed(2)}deg)`;
  }
  function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }
  function installUnwrapDebug() {
    return {
      isReading: () => api.isReading(),
      readAlpha: () => +api.readAlpha().toFixed(3),
      begin,
      end,
      cardVisible: () => card && getComputedStyle(card).visibility !== "hidden" && +card.style.opacity > 0.01,
      cardText: () => cardText && cardText.textContent
    };
  }
  const ROOT_ID = "kickoff-overlay-root";
  function ballRadiusFor(w) {
    if (w < 480) return 34;
    if (w < 900) return 40;
    return 46;
  }
  function mountOverlay() {
    const host = document.createElement("div");
    host.id = ROOT_ID;
    host.setAttribute("aria-hidden", "true");
    host.style.cssText = [
      "position:fixed",
      "top:0",
      "left:0",
      "width:100vw",
      "height:100vh",
      "display:block",
      "margin:0",
      "padding:0",
      "border:0",
      "z-index:2147483647",
      "pointer-events:none",
      "overflow:hidden",
      "background:transparent",
      "contain:layout style"
    ].join(";");
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = OVERLAY_CSS + OVERLAY_DOM;
    (document.documentElement || document.body).appendChild(host);
    const stage = shadow;
    const ballR2 = ballRadiusFor(window.innerWidth);
    host.style.setProperty("--kc-ball", ballR2 * 2 + "px");
    host.style.setProperty("--kc-ball-half", -ballR2 + "px");
    const api2 = startKickoff({ root: stage, overlay: true, mentalCache: true, radius: ballR2 });
    initBrainDump(shadow, api2);
    initShelf(shadow, api2);
    initUnwrap(shadow, api2);
    let resizeT = 0;
    const refit = () => {
      clearTimeout(resizeT);
      resizeT = setTimeout(() => {
        const r = ballRadiusFor(window.innerWidth);
        host.style.setProperty("--kc-ball", r * 2 + "px");
        host.style.setProperty("--kc-ball-half", -r + "px");
        api2.setRadius(r);
      }, 120);
    };
    window.addEventListener("resize", refit, { passive: true });
    window.addEventListener("orientationchange", refit, { passive: true });
    const actions = shadow.querySelector("#kc-actions");
    const act = (id, fn) => shadow.querySelector(id).addEventListener("click", (e) => {
      e.stopPropagation();
      api2.unlockAudio();
      fn();
    });
    act("#kc-keep", () => api2.keep());
    act("#kc-done", () => api2.letGo());
    api2.onFrame(() => actions.classList.toggle("is-live", api2.canAct()));
    const shelf = installShelfDebug();
    const unwrap = installUnwrapDebug();
    window.__kickoffOverlay = { host, shadow, api: api2, shelf, unwrap, version: "2.0.0-mentalcache" };
  }
  const OVERLAY_DOM = `
<div id="stage">
  <div id="ball">
    <div id="ball-shadow"></div>
    <div id="ball-body">
      <!-- Classic football panels: five dark pentagons around a lighter centre,
           with the hexagon seams between them. Reads as a football, not a
           volleyball, while the centre stays clear for the thought label. -->
      <svg class="seams" viewBox="0 0 100 100">
        <g fill="#3a352f" opacity="0.9">
          <polygon points="50,6 61.4,14.3 57.1,27.7 42.9,27.7 38.6,14.3" />
          <polygon points="79.5,27.4 90.9,35.7 86.6,49.1 72.4,49.1 68.1,35.7" />
          <polygon points="68.2,62.1 79.6,70.4 75.3,83.8 61.1,83.8 56.8,70.4" />
          <polygon points="31.8,62.1 43.2,70.4 38.9,83.8 24.7,83.8 20.4,70.4" />
          <polygon points="20.5,27.4 31.9,35.7 27.6,49.1 13.4,49.1 9.1,35.7" />
        </g>
        <g stroke="rgba(88,80,70,0.42)" stroke-width="1.7" fill="none" stroke-linecap="round">
          <path d="M57.1,27.7 L68.1,35.7" /><path d="M42.9,27.7 L31.9,35.7" />
          <path d="M72.4,49.1 L68.2,62.1" /><path d="M27.6,49.1 L31.8,62.1" />
          <path d="M56.8,70.4 L43.2,70.4" />
        </g>
      </svg>
    </div>
    <div id="ball-light"></div>
    <!-- The thought's text label — upright (not rolling) for legibility, on a
         solid backing per the accessibility rule. Engine draws into it. -->
    <div id="ball-face"></div>
  </div>
</div>
<canvas id="fx"></canvas>
<div id="flash"></div>

<!-- The Brain Dump: a frosted trigger icon (bottom-left; also Cmd/Ctrl+Shift+K)
     and the centered input pill it summons. Both use the glass material. -->
<button id="kc-trigger" class="glass-btn" type="button" aria-label="New thought (Ctrl+Shift+K)">
  <span class="glass"><span class="core">＋</span></span>
</button>
<div id="kc-dump">
  <div class="glass">
    <span id="kc-dump-grip" title="Drag to move" aria-hidden="true"></span>
    <input id="kc-dump-input" type="text" autocomplete="off" autocorrect="off"
           spellcheck="false" placeholder="offload a thought — Enter to release it" />
  </div>
</div>

<!-- The Goal (right edge, top-view): the "keep" target + shelf handle. Two posts
     seen from above, a receding net, and the goal line the ball crosses. -->
<button id="kc-dish" type="button" aria-label="Goal — kept thoughts">
  <div id="kc-dish-glow"></div>
  <div id="net"></div>
  <div class="kc-post kc-back kc-post-c"></div>
  <div class="kc-post kc-back kc-post-d"></div>
  <div class="kc-post kc-post-a"></div>
  <div class="kc-post kc-post-b"></div>
  <div class="kc-goal-line"></div>
  <div id="kc-dish-count"></div>
  <div id="kc-puck"></div>
</button>
<!-- The Shelf tray — expands in place from the dish (no camera move). Spheres
     are positioned in viewport coords by shelf.js (siblings, not scaled). -->
<div id="kc-tray">
  <div id="kc-tray-inner"></div>
  <div id="kc-tray-bar">
    <input id="kc-search" type="text" autocomplete="off" spellcheck="false" placeholder="search thoughts…" />
    <button id="kc-more" type="button" title="More">⋯</button>
    <div id="kc-more-menu">
      <button id="kc-export" type="button">Copy all</button>
      <button id="kc-clear" type="button" class="is-danger">Clear all</button>
    </div>
  </div>
  <div id="kc-tray-empty"></div>
  <!-- A stored thought, unwrapped in place: full text, its source, and the
       actions that belong to that one thought. -->
  <div id="kc-thought-card">
    <div id="kc-tc-text"></div>
    <a id="kc-tc-link" target="_blank" rel="noopener noreferrer"></a>
    <div id="kc-tc-actions">
      <button id="kc-tc-copy" type="button">Copy</button>
      <button id="kc-tc-open" type="button">Open</button>
      <button id="kc-tc-out" type="button">Take it out</button>
      <button id="kc-tc-del" type="button" class="is-danger">Delete</button>
    </div>
  </div>
</div>
<div id="kc-undo"><span id="kc-undo-text"></span><button id="kc-undo-btn" type="button">Undo</button></div>

<!-- Daily Kickoff — once a day, parked thoughts come back for a decision. -->
<div id="kc-kickoff">
  <span id="kc-kickoff-text"></span>
  <button id="kc-kickoff-go" type="button">Review</button>
  <button id="kc-kickoff-skip" type="button">Not now</button>
</div>
<div id="kc-tray-slots"></div>

<!-- The Unwrap card — the active sphere read flat. Positioned/animated by
     unwrap.js off the engine's readAlpha. Text on a solid backing. -->
<div id="kc-card"><div id="kc-card-text"></div></div>

<!-- Deliberate actions on the live thought. The computer does the kick, so you
     never have to fight the physics — and nothing is destroyed by accident. -->
<div id="kc-actions">
  <button id="kc-keep" class="glass-btn" type="button" title="Park it in the goal for later">
    <span class="glass"><span class="core">Keep it ⚽</span></span>
  </button>
  <button id="kc-done" class="glass-btn" type="button" title="Out of your head — it dissolves away">
    <span class="glass"><span class="core">Done ✓</span></span>
  </button>
</div>
`;
  const OVERLAY_CSS = `
<style>
  :host { display:block; --shadow: rgba(60,45,30,0.22); }
  * { margin:0; padding:0; box-sizing:border-box; }

  #stage { position:absolute; inset:0; pointer-events:none; overflow:visible; }

  /* The ball is the ONE interactive hit-area (pointer-events:auto); everything
     else stays click-through. The dual drop-shadow (dark + light halo) is what
     makes it legible against any background. */
  #ball {
    position:absolute; top:0; left:0;
    width:var(--kc-ball,92px); height:var(--kc-ball,92px);
    margin-left:var(--kc-ball-half,-46px); margin-top:var(--kc-ball-half,-46px); z-index:10;
    pointer-events:auto; cursor:grab; will-change:transform;
    filter: drop-shadow(0 5px 9px rgba(0,0,0,0.30)) drop-shadow(0 0 6px rgba(255,255,255,0.5));
  }
  #ball-body {
    position:absolute; inset:0; border-radius:50%; overflow:hidden;
    background: radial-gradient(circle at 50% 45%, #f6f1e7 0%, #ece4d4 78%, #e4dccb 100%);
    will-change:transform;
  }
  #ball-body .seams { position:absolute; inset:0; width:100%; height:100%; }
  /* Sphere lighting, layered like a real studio setup: a tight specular, a broad
     key, a warm bounce coming back off the ground, the core shadow, and a dark
     occlusion rim that rolls the silhouette away from the viewer. */
  #ball-light {
    position:absolute; inset:0; border-radius:50%; pointer-events:none;
    background:
      radial-gradient(circle at 31% 25%, rgba(255,255,255,1) 0 2.5%, rgba(255,255,255,0.7) 5.5%, rgba(255,255,255,0) 16%),
      radial-gradient(circle at 37% 31%, rgba(255,252,246,0.62), rgba(255,252,246,0) 45%),
      radial-gradient(circle at 76% 80%, rgba(255,236,208,0.34) 0 10%, rgba(255,236,208,0) 32%),
      radial-gradient(circle at 69% 73%, rgba(60,42,24,0.52), rgba(60,42,24,0) 56%),
      radial-gradient(circle at 50% 50%, rgba(0,0,0,0) 58%, rgba(42,30,17,0.40) 92%, rgba(28,20,12,0.55) 100%);
  }
  /* A faint sheen arc across the top — the giveaway that a surface is curved. */
  #ball-light::after {
    content:""; position:absolute; inset:0; border-radius:50%;
    background: radial-gradient(60% 42% at 44% 16%, rgba(255,255,255,0.42), rgba(255,255,255,0) 70%);
  }
  #ball-shadow {
    position:absolute; left:50%; top:90%; width:86px; height:18px; margin-left:-43px;
    border-radius:50%;
    background: radial-gradient(closest-side, var(--shadow), rgba(60,45,30,0) 80%);
    filter: blur(2px); z-index:-1; will-change:transform, opacity;
  }
  /* The thought's text label — a legible upright plate on the ball's face, ABOVE
     the lighting so the engine-drawn text stays crisp (its own solid-ish backing
     satisfies the "text never on raw glass" rule). Doesn't rotate with roll. */
  /* The thought label — a band across the ball's middle, so the football panels
     stay visible above and below it. Real DOM text (crisp at any size). */
  #ball-face {
    position:absolute; left:5px; right:5px; top:27%; bottom:27%; z-index:2;
    display:flex; align-items:center; justify-content:center; text-align:center;
    padding:2px 5px; border-radius:11px; overflow:hidden;
    background: rgba(255,253,249,0.90);
    box-shadow: 0 1px 3px rgba(60,48,32,0.18), inset 0 0 0 1px rgba(120,110,95,0.10);
    color:#332f2a; font-family:system-ui,-apple-system,"Segoe UI",sans-serif;
    font-weight:600; line-height:1.14; letter-spacing:0.005em;
    word-break:break-word; pointer-events:none;
  }

  /* ── The Goal, seen from above — the "keep" target. Two posts read as
     cylinders from overhead, a frosted net receding to the right, and the goal
     line between them. Sized to be a real target, not a dot. ──────────────── */
  /* JS owns left/top so the goal can be dragged anywhere; these are just the
     first-run defaults before shelf.js positions it. */
  #kc-dish {
    position:fixed; left:calc(100vw - var(--kc-goal-w,136px)); top:calc(50vh - 132px);
    width:var(--kc-goal-w,136px); height:var(--kc-goal-h,264px); z-index:16;
    padding:0; border:none; background:none;
    -webkit-appearance:none; appearance:none; pointer-events:auto;
    cursor:grab; touch-action:none;
  }
  #kc-dish.is-dragging { cursor:grabbing; }
  #kc-dish { transition: opacity 300ms ease; }
  /* Collapsed: shrinks to a small puck against its edge — still a live target,
     just out of the way. Scale is applied on the inner parts so the element's
     own rotation transform is untouched. */
  #kc-dish.is-collapsed #net,
  #kc-dish.is-collapsed .kc-post,
  #kc-dish.is-collapsed .kc-goal-line,
  #kc-dish.is-collapsed::after { opacity:0; pointer-events:none; }
  #kc-dish #kc-puck {
    position:absolute; right:8px; top:50%; width:44px; height:44px; margin-top:-22px;
    border-radius:50%; display:none; align-items:center; justify-content:center;
    background: rgba(250,250,252,0.16);
    -webkit-backdrop-filter: blur(14px) saturate(1.4); backdrop-filter: blur(14px) saturate(1.4);
    border:1px solid rgba(255,255,255,0.6);
    box-shadow: 0 8px 20px rgba(54,40,24,0.24), inset 0 2px 2px rgba(255,255,255,0.8);
    color:#4b463f; font:600 14px/1 system-ui,-apple-system,sans-serif;
  }
  #kc-dish.is-collapsed #kc-puck { display:flex; }
  #kc-dish.is-collapsed { cursor:pointer; }
  #kc-dish.is-collapsed #kc-dish-count { display:none; }
  #kc-dish.is-collapsed #kc-dish-glow { opacity:0.35; }
  #kc-dish.is-dragging #net { box-shadow: inset 12px 0 26px rgba(92,78,58,0.12), 0 26px 58px rgba(54,40,24,0.30); }
  /* The net — frosted mesh with depth shading so it recedes into the goal. */
  /* A real net: fine DIAMOND mesh (not graph paper), woven from two hairline
     diagonals, fading as it recedes into the goal, over frosted depth. */
  /* Apple-ish restraint: one clean translucent surface, a hairline weave you
     sense more than see, a precise 1px rim, and light that falls off smoothly
     into the goal. Texture is quiet; the material does the work. */
  /* The net is a VOLUME, not a panel. It's clipped to a trapezoid so the far
     edge is shorter than the mouth — that single cue is what makes it read as
     receding into the screen rather than a flat rectangle lying on it. */
  /* The netting is FABRIC hung inside a frame, not a printed panel. Three things
     carry that: the interior is a deep, soft cavity (not a flat wash), the weave
     is fine and low-contrast so strands read as thread rather than ruled lines,
     and light falls off in BOTH axes — a single left-to-right ramp is what made
     the old one look like a texture laid over a rectangle. */
  #net {
    position:absolute; left:14px; right:1px; top:0; bottom:0; overflow:hidden;
    clip-path: polygon(0% 0%, 100% 12%, 100% 88%, 0% 100%);
    background:
      /* the cavity: light spills in at the mouth and dies toward the back corner */
      radial-gradient(150% 120% at -8% 50%, rgba(255,255,255,0.30), rgba(255,255,255,0.10) 34%, rgba(255,255,255,0) 62%),
      linear-gradient(90deg, rgba(72,64,54,0.10) 0%, rgba(46,39,32,0.26) 58%, rgba(28,23,19,0.40) 100%);
    -webkit-backdrop-filter: blur(26px) saturate(1.5) brightness(1.02);
    backdrop-filter: blur(26px) saturate(1.5) brightness(1.02);
    /* Ambient occlusion where the fabric meets the frame — the seam that makes
       the net read as set INTO the goal rather than pasted on front of it. */
    box-shadow:
      inset 0 3px 7px rgba(22,18,14,0.42),
      inset 0 -3px 7px rgba(22,18,14,0.42),
      inset 5px 0 12px rgba(22,18,14,0.30),
      0 30px 70px rgba(30,24,18,0.30);
    transform-origin:right center; will-change:transform;
    transition: box-shadow 320ms ease;
  }
  /* The weave: finer and much softer than before (5px cells at ~0.09 alpha vs
     9px at 0.17). Uniform high-contrast hatching is exactly what reads as graph
     paper; real thread is thin, dim, and only catches light near the opening. */
  #net::before {
    content:""; position:absolute; inset:-16% -2% -16% 0; pointer-events:none;
    background:
      repeating-linear-gradient(45deg, transparent 0 5px, rgba(255,255,255,0.09) 5px 5.6px),
      repeating-linear-gradient(-45deg, transparent 0 5px, rgba(255,255,255,0.09) 5px 5.6px);
    transform: perspective(420px) rotateY(-19deg);
    transform-origin: left center;
    /* Two-axis falloff: the weave is brightest at the mouth's centre-line and
       sinks into the corners, so the strands sit in the light rather than on it. */
    -webkit-mask-image:
      linear-gradient(90deg, rgba(0,0,0,1) 0%, rgba(0,0,0,0.42) 58%, rgba(0,0,0,0.12) 100%),
      radial-gradient(120% 108% at 0% 50%, rgba(0,0,0,1) 30%, rgba(0,0,0,0.35) 100%);
    -webkit-mask-composite: source-in;
    mask-image:
      linear-gradient(90deg, rgba(0,0,0,1) 0%, rgba(0,0,0,0.42) 58%, rgba(0,0,0,0.12) 100%),
      radial-gradient(120% 108% at 0% 50%, rgba(0,0,0,1) 30%, rgba(0,0,0,0.35) 100%);
    mask-composite: intersect;
  }
  /* Depth pooling in the far corner, plus a soft sheen riding the top of the
     cavity — the highlight that tells you the surface is curved, not flat. */
  #net::after {
    content:""; position:absolute; inset:0; pointer-events:none;
    background:
      radial-gradient(85% 42% at 24% 6%, rgba(255,255,255,0.14), rgba(255,255,255,0) 70%),
      radial-gradient(120% 108% at 108% 50%, rgba(20,16,12,0.50), rgba(20,16,12,0) 62%);
  }
  #kc-dish:hover #net { box-shadow: inset 12px 0 26px rgba(92,78,58,0.14), inset 0 1px 0 rgba(255,255,255,0.9), 0 20px 46px rgba(54,40,24,0.26); }
  #net.is-billow { animation: billow 760ms cubic-bezier(0.22,1,0.36,1); }
  @keyframes billow {
    0% { transform: scaleX(1); }
    20% { transform: scaleX(1.30) scaleY(1.04); }
    52% { transform: scaleX(0.95) scaleY(0.99); }
    100% { transform: scaleX(1); }
  }
  /* Posts — bright rounded caps, lit from upper-left so they read as uprights
     viewed from directly above. */
  /* Posts read as uprights seen from directly above: a bright top face, a dark
     occluded underside, and a cast shadow thrown onto the pitch. */
  /* Posts: machined, not chunky — a clean white cap with one precise specular
     and a soft contact shadow. */
  /* Posts are machined aluminium caps seen end-on, not white dots. Pure #fff
     with a soft edge is what reads as a plastic bead; metal needs a tight
     specular near the light, a warm mid-tone body, a dark occluded far side,
     and a reflected bounce coming back up from the pitch. */
  .kc-post {
    position:absolute; left:6px; width:18px; height:18px; border-radius:50%;
    background:
      /* tight specular — small and offset, the single strongest metal cue */
      radial-gradient(circle at 32% 24%, rgba(255,255,255,0.98) 0%, rgba(255,255,255,0) 26%),
      /* bounce light returning from the surface below */
      radial-gradient(circle at 66% 82%, rgba(255,250,240,0.55) 0%, rgba(255,250,240,0) 34%),
      /* the body: warm silver rolling into an occluded far edge */
      linear-gradient(148deg, #fdfcfa 0%, #eae5dc 34%, #cdc6b9 66%, #a79f92 100%);
    box-shadow:
      0 9px 20px rgba(34,27,18,0.34),          /* contact shadow on the pitch */
      0 2px 4px rgba(34,27,18,0.26),
      inset 0 -1.5px 3px rgba(96,86,70,0.40),  /* underside occlusion */
      inset 0 1px 1px rgba(255,255,255,0.95),  /* lit top edge */
      inset 0 0 0 0.5px rgba(120,110,92,0.30); /* machined rim */
  }
  /* Grounding. Neumorphic depth is mostly this: a wide diffuse shadow that says
     "there is a surface below me, and I am sitting on it". Without it the goal
     floats, and floating objects always read as stickers. Two layers — a broad
     ambient pool and a tighter contact darkening near the frame. */
  #kc-dish::after {
    content:""; position:absolute; left:14px; right:-2px; top:4px; bottom:4px;
    z-index:-1; border-radius:0 26px 26px 0; pointer-events:none;
    background:
      radial-gradient(70% 58% at 42% 50%, rgba(26,20,14,0.30), rgba(26,20,14,0) 72%),
      rgba(30,24,17,0.16);
    filter: blur(26px);
  }
  .kc-post-a { top:-4px; }
  .kc-post-b { bottom:-4px; }
  /* Back posts: smaller, dimmer and inset — the far pair of a real goal, which
     is what completes the perspective the net's trapezoid starts. Perspective
     without them looks like a bent rectangle; with them it reads as a box. */
  .kc-post.kc-back {
    left:auto; right:-2px; width:11px; height:11px;
    background:
      radial-gradient(circle at 34% 26%, rgba(255,255,255,0.85) 0%, rgba(255,255,255,0) 30%),
      linear-gradient(148deg, #f3f0e9 0%, #ddd7cb 44%, #b3ab9d 100%);
    box-shadow: 0 2px 6px rgba(30,24,16,0.38), inset 0 -1px 2px rgba(70,60,46,0.30);
    /* Aerial perspective: distant things lose contrast. Dimming the far posts
       is what stops them competing with the mouth for attention. */
    opacity:0.72;
  }
  .kc-post-c { top:22px; }
  .kc-post-d { bottom:22px; }
  /* The crossbar edges linking near post to far post — the two rails that make
     the eye read depth along the sides. */
  /* The crossbar rails running mouth → back. Thickened slightly and given a
     across-the-rail gradient (bright crown, dark underside) so each reads as a
     round bar catching light, not a flat white stripe. They also taper: wider
     at the mouth, thinner at the back, which is the same perspective the net
     and posts are telling. */
  #kc-dish::before {
    content:""; position:absolute; left:12px; right:2px; top:2px; bottom:2px;
    pointer-events:none; z-index:2;
    clip-path: polygon(0% 0%, 100% 12%, 100% 13.1%, 0% 2.4%,
                       0% 97.6%, 100% 86.9%, 100% 88%, 0% 100%);
    background:
      linear-gradient(180deg,
        rgba(255,255,255,0.98) 0%, rgba(246,243,236,0.92) 22%,
        rgba(198,190,178,0.70) 62%, rgba(150,141,127,0.55) 100%);
    filter: drop-shadow(0 2px 3px rgba(34,27,18,0.42));
  }
  /* The goal line — a single hairline, fading at both ends. */
  .kc-goal-line {
    position:absolute; left:15px; top:14px; bottom:14px; width:1.5px; border-radius:2px;
    background:linear-gradient(180deg, rgba(255,255,255,0), rgba(255,255,255,0.72) 26%, rgba(255,255,255,0.72) 74%, rgba(255,255,255,0));
  }

  #fx { position:fixed; inset:0; z-index:30; pointer-events:none; }
  #flash {
    position:fixed; inset:0; z-index:20; pointer-events:none; opacity:0;
    background: radial-gradient(120% 90% at 85% 50%, rgba(255,214,140,0.55), rgba(255,224,170,0.12) 45%, transparent 70%);
  }
  #flash.is-flash { animation: flash 1500ms ease-out; }
  @keyframes flash { 0% { opacity:0; } 12% { opacity:1; } 100% { opacity:0; } }

  @media (prefers-reduced-motion: reduce) { #net { transition:none; } }

  /* ── Liquid Glass material system (shared) — same frosted/floating/concentric
     look as the standalone chrome, with the pointer-tracked specular wired by
     chrome.js. Reused by the Brain Dump trigger + input pill. Scoped locally
     since the shadow DOM can't see the page's stylesheet. */
  .reactive {
    display:inline-flex; padding:0; border:none; background:none;
    -webkit-appearance:none; appearance:none;
    pointer-events:auto; cursor:pointer; will-change:transform;
  }
  .glass {
    position:relative; display:inline-flex; padding:7px 8px; border-radius:22px;
    background: rgba(250,250,252,0.10);
    -webkit-backdrop-filter: blur(20px) saturate(1.9) brightness(1.03) contrast(1.04);
    backdrop-filter: blur(20px) saturate(1.9) brightness(1.03) contrast(1.04);
    border:1px solid rgba(255,255,255,0.7);
    box-shadow:
      0 14px 32px rgba(54,40,24,0.16), 0 4px 9px rgba(54,40,24,0.10),
      inset 0 1.5px 1px rgba(255,255,255,0.95), inset 0 -12px 22px rgba(255,255,255,0.06),
      inset 0 -1.5px 1px rgba(110,98,80,0.16);
    transform:scale(1);
    transition: transform 420ms cubic-bezier(0.34,1.56,0.64,1), box-shadow 300ms ease;
    will-change:transform;
  }
  .glass::before {
    content:""; position:absolute; inset:0; border-radius:inherit;
    background: radial-gradient(58px 42px at var(--mx,28%) var(--my,14%), rgba(255,255,255,0.92), rgba(255,255,255,0) 58%);
    opacity: var(--spec,0.4); transition: opacity 220ms ease; pointer-events:none;
  }
  .core {
    position:relative; z-index:1; display:inline-flex; align-items:center; justify-content:center;
    padding:8px 16px; border-radius:15px; background: rgba(255,255,255,0.55);
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.7), inset 0 -1px 1px rgba(120,110,95,0.06);
    color:#443f39; font:500 13px/1 system-ui,-apple-system,"Segoe UI",sans-serif;
    letter-spacing:0.05em; white-space:nowrap; min-width:5.5em; text-align:center;
  }
  .glass.is-hover {
    transform:scale(1.06);
    box-shadow: 0 16px 34px rgba(54,40,24,0.18), 0 5px 12px rgba(54,40,24,0.12),
      inset 0 1px 1.5px rgba(255,255,255,0.9), inset 0 -10px 18px rgba(255,255,255,0.12);
  }
  .glass.is-press { transform:scale(0.93); }

  /* ── The Brain Dump — trigger icon (bottom-left) + centered input pill. ───── */
  #kc-trigger {
    position:fixed; left:22px; bottom:22px; z-index:16;
    display:inline-flex; padding:0; border:none; background:none;
    -webkit-appearance:none; appearance:none; cursor:pointer;
    pointer-events:auto; will-change:transform;
  }
  #kc-trigger .core {
    min-width:0; padding:6px 13px; font-size:22px; line-height:1; color:#4b463f;
  }

  /* JS sets left/top — centred on every open, then draggable — so the transform
     is purely the open animation and the two never fight. */
  #kc-dump {
    position:fixed; left:0; top:0; z-index:17;
    transform:translateY(-6px); opacity:0; pointer-events:none;
    transition: opacity 200ms ease, transform 260ms cubic-bezier(0.34,1.56,0.64,1);
  }
  #kc-dump.is-open { opacity:1; transform:translateY(0); pointer-events:auto; }
  #kc-dump .glass { padding:8px; border-radius:26px; align-items:center; }
  /* Grab handle — move the pill without disturbing text selection. */
  #kc-dump-grip {
    flex:none; width:18px; height:30px; margin-left:5px; cursor:grab; touch-action:none;
    background-image: radial-gradient(circle, rgba(90,82,72,0.42) 1.2px, transparent 1.4px);
    background-size:6px 7px; background-position:center; border-radius:6px;
  }
  #kc-dump-grip:active { cursor:grabbing; }
  /* The input sits on its own semi-solid plate — text never on raw glass. */
  #kc-dump-input {
    width:min(62vw,440px); border:none; outline:none;
    padding:13px 20px; border-radius:19px; background: rgba(255,255,255,0.62);
    color:#332f2a; font:500 16px/1.2 system-ui,-apple-system,"Segoe UI",sans-serif;
    letter-spacing:0.01em;
  }
  #kc-dump-input::placeholder { color:rgba(70,63,55,0.5); }

  /* ── The Dish (bottom-right) — store target + shelf handle, with a light
     "goal" identity (a faint warm glow), understated. ──────────────────────── */
  /* Warm glow pooling at the goal mouth — the "aim here" hint. Brighter when
     the goal is holding thoughts. */
  #kc-dish-glow {
    position:absolute; left:-70px; right:-10px; top:-14%; bottom:-14%;
    pointer-events:none; border-radius:50%;
    background: radial-gradient(ellipse at 72% 50%, rgba(255,198,132,0.20), rgba(255,198,132,0) 70%);
    opacity:0.55;
  }
  #kc-dish.has-thoughts #kc-dish-glow { opacity:1; }
  #kc-dish-glow.is-pulse { animation: kc-pulse 700ms ease-out; }
  @keyframes kc-pulse {
    0% { transform:scale(0.92); opacity:0.55; }
    28% { transform:scale(1.16); opacity:1; }
    100% { transform:scale(1); opacity:1; }
  }
  /* How many thoughts the goal is holding. */
  #kc-dish-count {
    position:absolute; right:16px; top:50%; transform:translateY(-50%);
    min-width:26px; height:26px; padding:0 7px; border-radius:13px;
    display:flex; align-items:center; justify-content:center;
    background:rgba(255,255,255,0.72); color:#4b463f;
    font:600 14px/1 system-ui,-apple-system,sans-serif;
    box-shadow:0 2px 6px rgba(54,40,24,0.18); pointer-events:none;
  }
  #kc-dish-count:empty { display:none; }

  /* ── The Shelf tray — a frosted panel that scales/fades open FROM the dish
     corner (transform-origin bottom-right), no camera movement. ────────────── */
  /* The shelf slides open FROM the goal (transform-origin right centre), so the
     kept thoughts read as coming out of the net. */
  /* JS positions the tray beside the goal (left/top); the transform is purely
     the open/close scale, so the two never fight. */
  #kc-tray {
    position:fixed; left:0; top:0; z-index:15;
    width:min(64vw, 340px); height:min(56vh, 320px);
    border-radius:24px; transform-origin: right center;
    transform: scale(0.12); opacity:0; pointer-events:none;
    transition: transform 340ms cubic-bezier(0.34,1.4,0.5,1), opacity 260ms ease;
  }
  #kc-tray.is-open { transform: scale(1); opacity:1; pointer-events:auto; }
  #kc-tray-inner {
    position:absolute; inset:0; border-radius:24px;
    background: rgba(250,250,252,0.12);
    -webkit-backdrop-filter: blur(22px) saturate(1.7) brightness(1.02);
    backdrop-filter: blur(22px) saturate(1.7) brightness(1.02);
    border:1px solid rgba(255,255,255,0.6);
    box-shadow: 0 20px 50px rgba(54,40,24,0.2), inset 0 1.5px 1px rgba(255,255,255,0.9);
  }
  /* Sphere layer — fixed, positioned by shelf.js in viewport coords (above the
     tray, but NOT children of it, so the tray's open-scale doesn't distort them). */
  #kc-tray-slots { position:fixed; inset:0; z-index:17; pointer-events:none; }
  .kc-sphere {
    position:fixed; top:0; left:0; width:60px; height:60px; border-radius:50%;
    pointer-events:auto; cursor:grab; will-change:transform;
    background: radial-gradient(circle at 50% 45%, #f6f1e7 0%, #ece4d4 78%, #e4dccb 100%);
    box-shadow: 0 5px 12px rgba(0,0,0,0.22), 0 0 4px rgba(255,255,255,0.5),
      inset 0 -6px 10px rgba(74,54,32,0.18), inset 0 3px 4px rgba(255,255,255,0.6);
  }
  .kc-sphere-face {
    position:absolute; left:3px; right:3px; top:27%; bottom:27%;
    display:flex; align-items:center; justify-content:center; text-align:center;
    padding:1px 3px; border-radius:8px; overflow:hidden;
    background: rgba(255,253,249,0.92);
    color:#332f2a; font-family:system-ui,-apple-system,sans-serif; font-weight:600;
    line-height:1.1; word-break:break-word;
    box-shadow: inset 0 0 0 1px rgba(120,110,95,0.10);
  }

  /* ── The Unwrap card — a flat readable glass panel; text on a solid inner
     plate (never on raw glass). JS positions/scales/fades it via readAlpha. ── */
  #kc-card {
    position:fixed; top:0; left:0; z-index:18; width:300px; max-width:82vw;
    opacity:0; visibility:hidden; pointer-events:auto; will-change:transform, opacity;
    border-radius:22px; padding:7px;
    background: rgba(250,250,252,0.12);
    -webkit-backdrop-filter: blur(22px) saturate(1.8) brightness(1.02);
    backdrop-filter: blur(22px) saturate(1.8) brightness(1.02);
    border:1px solid rgba(255,255,255,0.7);
    box-shadow: 0 22px 54px rgba(54,40,24,0.22), inset 0 1.5px 1px rgba(255,255,255,0.9);
  }
  #kc-card-text {
    border-radius:16px; padding:20px 22px; background: rgba(255,255,255,0.72);
    color:#332f2a; font:500 17px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;
    letter-spacing:0.005em; white-space:pre-wrap; word-break:break-word;
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.7);
  }

  /* ── Keep / Let go — the deliberate actions on the live thought. Bottom
     centre, only shown while a thought is actually out. ───────────────────── */
  #kc-actions {
    position:fixed; left:50%; bottom:26px; z-index:16;
    transform:translateX(-50%) translateY(8px);
    display:flex; gap:12px; opacity:0; pointer-events:none;
    transition: opacity 220ms ease, transform 300ms cubic-bezier(0.34,1.5,0.6,1);
  }
  #kc-actions.is-live { opacity:1; transform:translateX(-50%) translateY(0); pointer-events:auto; }
  #kc-actions button {
    display:inline-flex; padding:0; border:none; background:none;
    -webkit-appearance:none; appearance:none; cursor:pointer; pointer-events:auto;
  }
  #kc-keep .core { color:#2f4a33; background:rgba(233,247,235,0.84); font-weight:600; }
  #kc-done .core { color:#2f4056; background:rgba(232,240,251,0.84); font-weight:600; }
  #kc-letgo .core { color:#6a5f57; }

  /* ── Small viewports ─────────────────────────────────────────────────────
     A goal sized for a 1440px laptop eats a third of a phone screen. These
     scale the fixed-pixel furniture; the pill and tray were already fluid. */
  @media (max-width: 900px) {
    :host { --kc-goal-w:112px; --kc-goal-h:212px; }
  }
  @media (max-width: 480px) {
    :host { --kc-goal-w:88px; --kc-goal-h:168px; }
    #kc-dump-input { width:min(78vw,440px); font-size:16px; }
    #kc-tray { width:min(94vw,420px); }
  }
  /* Coarse pointers (finger, not mouse): every control gets a 44px target —
     below that, taps miss. Hover styling is also suppressed, since on touch a
     :hover state sticks after the tap and reads as a stuck button. */
  @media (pointer: coarse) {
    #kc-actions .core { min-height:44px; padding:12px 18px; font-size:14px; }
    #kc-trigger .core { min-height:44px; min-width:44px; padding:10px 15px; }
    #kc-search { height:44px; }
    #kc-dump-grip { width:26px; height:40px; }
    .glass.is-hover { transform:none; }
  }
  #kc-actions .core { min-width:0; padding:8px 14px; font-size:12.5px; }

  /* Shelf toolbar — search (from the very first thought) + copy-all export. */
  #kc-tray-bar {
    position:absolute; left:16px; right:16px; top:14px; height:34px; z-index:2;
    display:flex; gap:8px; align-items:center;
  }
  #kc-search {
    flex:1; min-width:0; height:34px; border:none; outline:none;
    padding:0 13px; border-radius:17px; background:rgba(255,255,255,0.72);
    color:#3a352f; font:500 13px system-ui,-apple-system,sans-serif;
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.8);
  }
  #kc-search::placeholder { color:rgba(80,72,62,0.45); }
  /* Bulk actions live behind ⋯ — rare, and one of them is destructive, so they
     don't sit next to the field you're constantly clicking into. */
  #kc-more {
    flex:none; width:34px; height:34px; border:none; border-radius:17px; cursor:pointer;
    background:rgba(255,255,255,0.58); color:#4b463f;
    font:600 16px/1 system-ui,-apple-system,sans-serif;
  }
  #kc-more-menu {
    position:absolute; right:0; top:40px; z-index:4; display:none;
    flex-direction:column; min-width:132px; padding:5px; border-radius:14px;
    background:rgba(252,251,249,0.97);
    box-shadow:0 14px 32px rgba(54,40,24,0.24); border:1px solid rgba(255,255,255,0.7);
  }
  #kc-more-menu.is-open { display:flex; }
  #kc-more-menu button {
    border:none; background:none; cursor:pointer; text-align:left;
    padding:9px 11px; border-radius:9px; color:#3f3a34;
    font:500 13px system-ui,-apple-system,sans-serif;
  }
  #kc-more-menu button:hover { background:rgba(0,0,0,0.05); }
  #kc-more-menu button.is-danger { color:#8c3b32; }
  #kc-export.is-copied { color:#2f4a33; }

  /* A stored thought, unwrapped in place. */
  #kc-thought-card {
    position:absolute; left:16px; right:16px; bottom:16px; z-index:5; display:none;
    flex-direction:column; gap:9px; padding:15px 16px; border-radius:18px;
    background:rgba(252,251,249,0.97); border:1px solid rgba(255,255,255,0.75);
    box-shadow:0 18px 42px rgba(54,40,24,0.26);
  }
  #kc-thought-card.is-open { display:flex; }
  #kc-tc-text {
    color:#332f2a; font:500 14px/1.5 system-ui,-apple-system,sans-serif;
    max-height:96px; overflow:auto; word-break:break-word;
  }
  #kc-tc-link {
    color:#2b6cb0; font:500 12px system-ui,sans-serif; text-decoration:none;
    overflow:hidden; text-overflow:ellipsis; white-space:nowrap; display:none;
  }
  #kc-tc-link.is-shown { display:block; }
  #kc-tc-actions { display:flex; flex-wrap:wrap; gap:7px; }
  #kc-tc-actions button {
    border:none; cursor:pointer; padding:7px 12px; border-radius:12px;
    background:rgba(0,0,0,0.055); color:#3f3a34;
    font:600 12px system-ui,-apple-system,sans-serif;
  }
  #kc-tc-actions button:hover { background:rgba(0,0,0,0.09); }
  #kc-tc-actions button.is-danger { color:#8c3b32; background:rgba(140,59,50,0.09); }
  #kc-tc-open { display:none; }
  #kc-tc-open.is-shown { display:inline-block; }

  /* Undo — reversible beats a confirm dialog: no interruption, still safe. */
  #kc-undo {
    position:fixed; left:50%; bottom:92px; z-index:18; transform:translateX(-50%) translateY(10px);
    display:flex; align-items:center; gap:12px; padding:10px 12px 10px 16px;
    border-radius:16px; opacity:0; pointer-events:none;
    background:rgba(40,36,31,0.94); color:#f3efe8;
    box-shadow:0 14px 34px rgba(0,0,0,0.3);
    font:500 13px system-ui,-apple-system,sans-serif;
    transition:opacity 200ms ease, transform 260ms cubic-bezier(0.34,1.5,0.6,1);
  }
  #kc-undo.is-open { opacity:1; transform:translateX(-50%) translateY(0); pointer-events:auto; }
  #kc-undo-btn {
    border:none; cursor:pointer; padding:6px 12px; border-radius:11px;
    background:rgba(255,255,255,0.16); color:#fff;
    font:600 12px system-ui,-apple-system,sans-serif;
  }

  /* Daily Kickoff — a quiet once-a-day invitation, never a modal. */
  #kc-kickoff {
    position:fixed; left:50%; top:26px; z-index:18;
    transform:translateX(-50%) translateY(-10px);
    display:flex; align-items:center; gap:10px; padding:11px 12px 11px 18px;
    border-radius:20px; opacity:0; pointer-events:none;
    background:rgba(252,251,249,0.96); color:#3a352f;
    border:1px solid rgba(255,255,255,0.75);
    box-shadow:0 16px 40px rgba(54,40,24,0.26);
    font:500 13px system-ui,-apple-system,sans-serif;
    transition:opacity 240ms ease, transform 320ms cubic-bezier(0.34,1.5,0.6,1);
  }
  #kc-kickoff.is-open { opacity:1; transform:translateX(-50%) translateY(0); pointer-events:auto; }
  #kc-kickoff button {
    border:none; cursor:pointer; padding:7px 13px; border-radius:13px;
    font:600 12px system-ui,-apple-system,sans-serif;
  }
  #kc-kickoff-go { background:rgba(233,247,235,0.95); color:#2f4a33; }
  #kc-kickoff-skip { background:rgba(0,0,0,0.055); color:#6a5f57; }
  #kc-tray-empty {
    position:absolute; inset:56px 20px 20px; z-index:2; display:none;
    align-items:center; justify-content:center; text-align:center;
    color:rgba(70,63,55,0.6); font:500 13px/1.5 system-ui,-apple-system,sans-serif;
  }

  @media (prefers-reduced-motion: reduce) {
    .glass, .glass::before, #kc-dump, #kc-tray, #kc-dish-bowl, #kc-actions { transition:none; }
    #kc-dish-glow.is-pulse { animation:none; }
  }
</style>
`;
  if (!document.getElementById(ROOT_ID)) {
    mountOverlay();
  }
})();
