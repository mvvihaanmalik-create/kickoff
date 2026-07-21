// Audio — a synthesized crowd cheer for the goal moment. No asset files: the
// roar is filtered noise with a swelling envelope, topped with a short whistle.
// Must be unlocked by a user gesture first (autoplay policy).

let ctx = null;
let noiseBuffer = null;
let muted = false;

// Shared mute gate — used by the overlay's mute widget and the standalone's
// own toggle, so both surfaces silence through one primitive.
export function setMuted(v) {
  muted = !!v;
  setAmbientLevel();
}
export function isMuted() { return muted; }

export function unlock() {
  if (ctx) {
    if (ctx.state === "suspended") ctx.resume();
    return;
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  // ~2s of white noise, reused for every cheer.
  const n = ctx.sampleRate * 2;
  noiseBuffer = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = noiseBuffer.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
}

// ── Ambient crowd murmur (standalone page only — the overlay stays quiet
// except for one-shot kick/goal cues, per the addendum). Two noise beds at
// different registers, each breathing on its own slow LFO so it never reads
// as a flat hiss, summed into a MASTER gain. Mute/unmute only ever moves the
// master — never the per-layer LFOs — so muted is genuinely silent, not just
// quiet (an LFO connected directly to a zeroed gain would still leak a small
// oscillating signal around zero; routing it through an always-positive
// texture gain upstream of a hard master avoids that).
const AMBIENT_LEVEL = 0.05; // quiet, tasteful — never calls attention to itself
let ambientMaster = null;
let ambientStarted = false;

export function startAmbient() {
  if (!ctx || ambientStarted) return;
  ambientStarted = true;

  ambientMaster = ctx.createGain();
  ambientMaster.gain.value = 0; // silent until setAmbientLevel() ramps it up
  ambientMaster.connect(ctx.destination);

  [
    { freq: 420, q: 0.5, level: 1 },
    { freq: 760, q: 0.8, level: 0.55 },
  ].forEach(({ freq, q, level }) => {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = freq;
    bp.Q.value = q;
    const texGain = ctx.createGain();
    texGain.gain.value = level;
    src.connect(bp);
    bp.connect(texGain);
    texGain.connect(ambientMaster);
    src.start();

    // Slow, gentle breathing on this layer's own texture gain only.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.08 + Math.random() * 0.05;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = level * 0.25;
    lfo.connect(lfoGain);
    lfoGain.connect(texGain.gain);
    lfo.start();
  });

  setAmbientLevel();
}

function setAmbientLevel() {
  if (!ambientMaster) return;
  const target = muted ? 0 : AMBIENT_LEVEL;
  const t = ctx.currentTime;
  ambientMaster.gain.cancelScheduledValues(t);
  ambientMaster.gain.setValueAtTime(ambientMaster.gain.value, t);
  ambientMaster.gain.linearRampToValueAtTime(target, t + 0.8);
}

// Temporary debug accessor — verification only, mirrors the engine's __k hooks.
export function debugState() {
  return {
    hasCtx: !!ctx,
    ambientStarted,
    ambientMasterGainNow: ambientMaster ? ambientMaster.gain.value : null,
    ambientMasterGainTarget: ambientMaster ? (muted ? 0 : AMBIENT_LEVEL) : null,
    muted,
  };
}

// A crowd roar that swells and settles, plus a quick ref whistle.
export function cheer() {
  if (!ctx || muted) return;
  if (ctx.state === "suspended") ctx.resume();
  const t = ctx.currentTime;

  // ── Roar: noise → bandpass that opens up, with a swell-and-fade envelope.
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
  lp.frequency.value = 3000;

  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.5, t + 0.18); // fast swell
  g.gain.exponentialRampToValueAtTime(0.28, t + 0.9); // settle to a sustained hum
  g.gain.exponentialRampToValueAtTime(0.0001, t + 2.1); // fade out

  src.connect(bp);
  bp.connect(lp);
  lp.connect(g);
  g.connect(ctx.destination);
  src.start(t);
  src.stop(t + 2.2);

  // ── Whistle: two quick descending chirps to kick it off.
  whistle(t + 0.02, 2100);
  whistle(t + 0.16, 1950);
}

// A soft kick thump — a quick pitch-dropping body hit. Volume scales with the
// kick strength (0..1) so a light tap and a hard strike sound different.
export function thump(strength = 1) {
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
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
  o.connect(g);
  g.connect(ctx.destination);
  o.start(t);
  o.stop(t + 0.18);
}

// A quick whoosh for the roulette flourish — a bandpass sweep up then down.
export function whoosh() {
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
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.2, t + 0.12);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
  src.connect(bp);
  bp.connect(g);
  g.connect(ctx.destination);
  src.start(t);
  src.stop(t + 0.55);
}

// A soft, breathy dissolve for The Break — a downward-filtered noise puff, like
// something smudging away. Quiet, not a game "explosion".
export function puff() {
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
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.11, t + 0.03);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
  src.connect(lp);
  lp.connect(g);
  g.connect(ctx.destination);
  src.start(t);
  src.stop(t + 0.5);
}

// A soft two-tone bell for storing a thought into the dish — a small, tactile
// "put away" acknowledgement, not a game jingle.
export function chime() {
  if (!ctx || muted) return;
  if (ctx.state === "suspended") ctx.resume();
  const t = ctx.currentTime;
  [[880, 0.13], [1320, 0.07]].forEach(([f, vol]) => {
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.value = f;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    o.connect(g);
    g.connect(ctx.destination);
    o.start(t);
    o.stop(t + 0.55);
  });
}

// ── UI cues ──────────────────────────────────────────────────────────────────
// These fire on ordinary interactions, so they follow different rules from the
// celebration sounds: very short (under ~90ms), quiet, and pitched high enough
// to sit above page audio without competing with it. A UI sound you notice on
// the second hearing is a UI sound you'll mute by the tenth.

// A crisp tick. `pitch` scales the fundamental — 1.0 confirms, lower reverses,
// which is how undo can be the same gesture read backwards.
export function tick(pitch = 1) {
  if (!ctx || muted) return;
  if (ctx.state === "suspended") ctx.resume();
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  o.type = "triangle";
  o.frequency.setValueAtTime(2100 * pitch, t);
  o.frequency.exponentialRampToValueAtTime(1500 * pitch, t + 0.05);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.075, t + 0.005); // near-instant attack
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
  // A gentle top-end roll-off so the tick reads as "wooden", not "beep".
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 5200;
  o.connect(g); g.connect(lp); lp.connect(ctx.destination);
  o.start(t); o.stop(t + 0.09);
}

// A soft rounded pop — a thought coming into being. Lower and fuller than tick.
export function pop() {
  if (!ctx || muted) return;
  if (ctx.state === "suspended") ctx.resume();
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  o.type = "sine";
  o.frequency.setValueAtTime(420, t);
  o.frequency.exponentialRampToValueAtTime(760, t + 0.06); // rising = appearing
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.11, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
  o.connect(g); g.connect(ctx.destination);
  o.start(t); o.stop(t + 0.18);
}

// Air moving — panels opening or closing. `dir` 1 opens (rising), -1 closes.
export function swish(dir = 1) {
  if (!ctx || muted) return;
  if (ctx.state === "suspended") ctx.resume();
  const t = ctx.currentTime;
  const dur = 0.19;
  const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  // A bandpass sweep is what turns flat noise into a sense of movement.
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.Q.value = 1.1;
  bp.frequency.setValueAtTime(dir > 0 ? 700 : 1800, t);
  bp.frequency.exponentialRampToValueAtTime(dir > 0 ? 1900 : 650, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.055, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(bp); bp.connect(g); g.connect(ctx.destination);
  src.start(t); src.stop(t + dur);
}

function whistle(start, freq) {
  const o = ctx.createOscillator();
  o.type = "sine";
  o.frequency.setValueAtTime(freq, start);
  o.frequency.linearRampToValueAtTime(freq * 0.9, start + 0.12);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(0.12, start + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, start + 0.14);
  o.connect(g);
  g.connect(ctx.destination);
  o.start(start);
  o.stop(start + 0.16);
}
