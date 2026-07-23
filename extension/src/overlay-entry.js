// KICKOFF overlay — content-script entry (Phases B+). Injects a transparent,
// non-blocking, style-isolated overlay and mounts the SAME physics engine that
// powers the standalone page (imported, not reimplemented). A Shadow DOM gives
// two-way style isolation: the host site's CSS can't touch our ball, and ours
// can't leak into their page.
import { startKickoff } from "../../src/main.js";
import { initBrainDump } from "./brain-dump.js";
import { initShelf, installShelfDebug } from "./shelf.js";
import { initUnwrap, installUnwrapDebug } from "./unwrap.js";

const ROOT_ID = "kickoff-overlay-root";

// (Snooze/"Tomorrow" was removed: it ended in the same place as Keep — parked
// for later — so it was a second button for one outcome. Daily Kickoff already
// brings parked thoughts back, which is what Tomorrow was really reaching for.)

// The ball's radius for a given viewport width. Stepped, not a smooth ratio:
// the ball carries text on its face, and below ~34px radius that text stops
// being readable no matter how well it's sized. Legibility sets the floor.
function ballRadiusFor(w) {
  if (w < 480) return 34;  // phone
  if (w < 900) return 40;  // tablet / split-screen
  return 46;               // laptop and up
}

function mountOverlay() {
  // The host: fixed to the viewport, above page content, fully click-through.
  // Inline styles so a hostile page stylesheet (e.g. `div{display:flex}`) can't
  // deform it. `contain` isolates layout/paint side-effects.
  const host = document.createElement("div");
  host.id = ROOT_ID;
  host.setAttribute("aria-hidden", "true");
  host.style.cssText = [
    "position:fixed", "top:0", "left:0", "width:100vw", "height:100vh",
    "display:block", "margin:0", "padding:0", "border:0",
    "z-index:2147483647", "pointer-events:none", "overflow:hidden",
    "background:transparent", "contain:layout style",
  ].join(";");

  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = OVERLAY_CSS + OVERLAY_DOM;

  (document.documentElement || document.body).appendChild(host);

  // Mount the shared engine, scoped to the shadow root. Mental-cache mode: no
  // ball until a thought is created, and the spatial goal stays off.
  const stage = shadow; // ROOT for the engine's scoped querying
  // The ball scales with the viewport: 46 (92px) on a laptop, down to ~34 on a
  // phone. Below that the text on its face stops being readable, so 34 is a
  // floor, not a ratio — a proportionally-shrunk ball would just be illegible.
  // The CSS reads the same number via --kc-ball, so geometry and physics can
  // never disagree about how big the ball is.
  const ballR = ballRadiusFor(window.innerWidth);
  host.style.setProperty("--kc-ball", ballR * 2 + "px");
  host.style.setProperty("--kc-ball-half", -ballR + "px");
  const api = startKickoff({ root: stage, overlay: true, mentalCache: true, radius: ballR });

  // Wire the Brain Dump (shortcut + trigger icon → input pill → activate) and
  // the Dish + Shelf (store target + spring-seeking tray of stored thoughts).
  initBrainDump(shadow, api);
  initShelf(shadow, api);
  initUnwrap(shadow, api);

  // Rotate a tablet, or drag a desktop window narrow, and the ball resizes with
  // it. Debounced: orientation changes fire a burst of resize events.
  let resizeT = 0;
  const refit = () => {
    clearTimeout(resizeT);
    resizeT = setTimeout(() => {
      const r = ballRadiusFor(window.innerWidth);
      host.style.setProperty("--kc-ball", r * 2 + "px");
      host.style.setProperty("--kc-ball-half", -r + "px");
      api.setRadius(r);
    }, 120);
  };
  window.addEventListener("resize", refit, { passive: true });
  // Some mobile browsers settle the new viewport only after orientationchange,
  // so resize alone can read the pre-rotation width.
  window.addEventListener("orientationchange", refit, { passive: true });

  // Keep / Let go — the computer performs the kick, so a thought is never lost
  // to a mis-aimed flick. The bar only appears while a thought is actually live.
  const actions = shadow.querySelector("#kc-actions");
  const act = (id, fn) => shadow.querySelector(id).addEventListener("click", (e) => {
    e.stopPropagation(); api.unlockAudio(); fn();
  });
  act("#kc-keep", () => api.keep());
  // "Done" IS the release — finishing and discarding are the same act, so it
  // dissolves rather than scoring. The goal celebration stays exclusive to keeping.
  act("#kc-done", () => api.letGo());
  api.onFrame(() => actions.classList.toggle("is-live", api.canAct()));
  const shelf = installShelfDebug();
  const unwrap = installUnwrapDebug();

  window.__kickoffOverlay = { host, shadow, api, shelf, unwrap, version: "2.0.0-mentalcache" };
}

// ── DOM: the same element ids the engine binds to. #fx/#flash are siblings of
// #stage so the goal camera-shake (applied to #stage) doesn't move them. ──────
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
    <input id="kc-search" type="text" autocomplete="off" spellcheck="false" placeholder="search · ↑↓ browse · ⏎ read" />
    <button id="kc-recap" type="button" title="Your stats — kept, finished, streak">Recap</button>
    <button id="kc-more" type="button" title="More">⋯</button>
    <div id="kc-more-menu">
      <button id="kc-export" type="button">Copy all</button>
      <button id="kc-backup" type="button">Back up…</button>
      <button id="kc-restore" type="button">Restore…</button>
      <button id="kc-clear" type="button" class="is-danger">Clear all</button>
    </div>
    <input id="kc-restore-file" type="file" accept="application/json,.json" hidden />
  </div>
  <!-- Tag chips — only rendered when thoughts actually carry #tags. -->
  <div id="kc-tags"></div>
  <!-- Recap: the state of your cache, on demand. -->
  <div id="kc-stats">
    <button id="kc-stats-close" type="button" aria-label="Close recap">×</button>
    <div id="kc-stats-grid"></div>
    <div id="kc-stats-oldest"></div>
    <div id="kc-stats-next"></div>
    <button id="kc-stats-review" type="button">Review the oldest</button>
  </div>
  <div id="kc-tray-empty"></div>
  <!-- A stored thought, unwrapped in place: full text, its source, and the
       actions that belong to that one thought. -->
  <div id="kc-thought-card">
    <div id="kc-tc-text" contenteditable="true" spellcheck="false" role="textbox" aria-label="Edit thought"></div>
    <a id="kc-tc-link" target="_blank" rel="noopener noreferrer"></a>
    <div id="kc-tc-resurface"></div>
    <div id="kc-tc-actions">
      <button id="kc-tc-copy" type="button">Copy</button>
      <button id="kc-tc-open" type="button">Open</button>
      <button id="kc-tc-later" type="button">Later…</button>
      <button id="kc-tc-out" type="button">Take it out</button>
      <button id="kc-tc-del" type="button" class="is-danger">Delete</button>
    </div>
    <div id="kc-tc-later-menu">
      <button type="button" data-days="1">Tomorrow</button>
      <button type="button" data-days="3">In 3 days</button>
      <button type="button" data-days="7">In a week</button>
      <button type="button" data-days="30">In a month</button>
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

<!-- Milestone banner — every 10th finish / a 7-day streak earns a bigger moment. -->
<div id="kc-milestone" role="status"></div>

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

// ── CSS: ported from the standalone (ball / goal / fx / flash) + an overlay-only
// legibility halo so the ball reads on white, dark, or busy pages. No backdrop,
// nav, or pitch chrome — the person's own page is the backdrop. ───────────────
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
  /* The puck — the goal's resting form, and now a drag handle for it too.
     Slightly larger than the old 44px: it's the one persistent piece of UI, so
     it earns a real presence, and the bigger target makes both finding and
     dragging easier. Grab cursor advertises that it moves. */
  #kc-dish #kc-puck {
    position:absolute; right:8px; top:50%; width:52px; height:52px; margin-top:-26px;
    border-radius:50%; display:none; align-items:center; justify-content:center;
    cursor:grab;
    background: rgba(250,250,252,0.16);
    -webkit-backdrop-filter: blur(14px) saturate(1.4); backdrop-filter: blur(14px) saturate(1.4);
    border:1px solid rgba(255,255,255,0.6);
    box-shadow: 0 10px 24px rgba(54,40,24,0.26), inset 0 2px 2px rgba(255,255,255,0.8);
    color:#4b463f; font:600 16px/1 system-ui,-apple-system,sans-serif;
  }
  #kc-dish.is-dragging #kc-puck { cursor:grabbing; }
  /* Acknowledgement pop — an omnibox / right-click capture landed here. */
  #kc-puck.is-pop { animation: kc-pop 480ms cubic-bezier(0.34,1.56,0.64,1); }
  @keyframes kc-pop {
    0% { transform:scale(1); }
    38% { transform:scale(1.22); }
    100% { transform:scale(1); }
  }
  /* The impatient rattle — a restless ball, once a day, when something's been
     on the bench over a week. Small and quick: a whisper, not an alarm. */
  #kc-puck.is-rattle { animation: kc-rattle 560ms ease-in-out; }
  @keyframes kc-rattle {
    0%, 100% { transform:translateX(0); }
    15% { transform:translateX(-3px) rotate(-3deg); }
    35% { transform:translateX(3px) rotate(3deg); }
    55% { transform:translateX(-2px) rotate(-2deg); }
    75% { transform:translateX(2px) rotate(1deg); }
  }
  #kc-dish.is-collapsed #kc-puck { display:flex; }
  #kc-dish.is-collapsed { cursor:pointer; }
  #kc-dish.is-collapsed #kc-dish-count { display:none; }
  #kc-dish.is-collapsed #kc-dish-glow { display:none; }
  #kc-dish.is-dragging #net { box-shadow: inset 12px 0 26px rgba(92,78,58,0.12), 0 26px 58px rgba(54,40,24,0.30); }
  /* The net — a taut, concave mesh membrane seen from above. Same rounded shape
     as before; the depth is all shading and a genuinely visible weave. The base
     is a bowl: light pools where the surface faces the light (front-left) and
     sinks into shadow toward the back-right corner, so the membrane reads as
     dished rather than flat. */
  #net {
    position:absolute; left:15px; right:0; top:0; bottom:0; overflow:hidden;
    border-radius:0 22px 22px 0;
    border:1px solid rgba(255,255,255,0.72); border-left:none;
    background:
      radial-gradient(150% 128% at 14% 42%,
        rgba(255,255,255,0.40) 0%,
        rgba(255,255,255,0.16) 34%,
        rgba(96,84,68,0.14) 68%,
        rgba(40,33,26,0.30) 100%);
    -webkit-backdrop-filter: blur(20px) saturate(1.7) brightness(1.05);
    backdrop-filter: blur(20px) saturate(1.7) brightness(1.05);
    box-shadow:
      inset 0 1px 0 rgba(255,255,255,0.95),         /* crisp lit crossbar edge */
      inset 0 -1px 0 rgba(255,255,255,0.5),
      inset 22px 0 44px rgba(48,40,30,0.22),         /* the net set into its channel */
      inset -10px 0 30px rgba(24,19,14,0.22),        /* back wall in shadow */
      0 26px 62px rgba(40,32,24,0.24),               /* wide ambient shadow */
      0 2px 8px rgba(40,32,24,0.12);
    transform-origin:right center; will-change:transform;
    transition: box-shadow 320ms ease;
  }
  /* The weave — prominent now. Each strand is a little tube: a dark edge, a lit
     crown, a dark edge, so it catches light like rope rather than reading as a
     ruled pencil line. Two diagonals cross into a diamond mesh. The radial mask
     keeps the mesh crispest across the dished centre and lets it sink into the
     shaded rim, which is the cue that the membrane is curved, not flat. */
  #net::before {
    content:""; position:absolute; inset:0; border-radius:inherit; pointer-events:none;
    background:
      repeating-linear-gradient(45deg,
        transparent 0 6px,
        rgba(58,48,38,0.10) 6px 6.9px,
        rgba(255,255,255,0.44) 6.9px 7.9px,
        rgba(58,48,38,0.10) 7.9px 8.8px,
        transparent 8.8px 13px),
      repeating-linear-gradient(-45deg,
        transparent 0 6px,
        rgba(58,48,38,0.10) 6px 6.9px,
        rgba(255,255,255,0.44) 6.9px 7.9px,
        rgba(58,48,38,0.10) 7.9px 8.8px,
        transparent 8.8px 13px);
    -webkit-mask-image: radial-gradient(140% 124% at 28% 46%, #000 36%, rgba(0,0,0,0.5) 72%, rgba(0,0,0,0.18) 100%);
    mask-image: radial-gradient(140% 124% at 28% 46%, #000 36%, rgba(0,0,0,0.5) 72%, rgba(0,0,0,0.18) 100%);
  }
  /* A curved specular band riding the front of the membrane, plus depth pooling
     in the back corner — the pair of highlights/shadow that sells "taut and
     bowed toward you" rather than "printed rectangle". */
  #net::after {
    content:""; position:absolute; inset:0; border-radius:inherit; pointer-events:none;
    background:
      radial-gradient(70% 46% at 30% 20%, rgba(255,255,255,0.28), rgba(255,255,255,0) 72%),
      radial-gradient(120% 104% at 104% 54%, rgba(28,22,16,0.34), rgba(28,22,16,0) 60%);
  }
  #kc-dish:hover #net { box-shadow: inset 12px 0 26px rgba(92,78,58,0.14), inset 0 1px 0 rgba(255,255,255,0.9), 0 20px 46px rgba(54,40,24,0.26); }
  #net.is-billow { animation: billow 760ms cubic-bezier(0.22,1,0.36,1); }
  @keyframes billow {
    0% { transform: scaleX(1); }
    20% { transform: scaleX(1.30) scaleY(1.04); }
    52% { transform: scaleX(0.95) scaleY(0.99); }
    100% { transform: scaleX(1); }
  }
  /* Posts: machined, not chunky — a clean white cap with one precise specular
     and a soft contact shadow. */
  .kc-post {
    position:absolute; left:6px; width:18px; height:18px; border-radius:50%;
    background:
      radial-gradient(circle at 34% 27%, #ffffff 0%, #fbf9f5 42%, #ece7dd 74%, #d5cec2 100%);
    box-shadow:
      0 6px 14px rgba(40,32,22,0.26),
      0 1px 3px rgba(40,32,22,0.20),
      inset 0 -1px 2px rgba(120,110,92,0.28),
      inset 0 1px 1px rgba(255,255,255,0.9);
  }
  #kc-dish::after {
    content:""; position:absolute; left:20px; right:4px; top:10px; bottom:10px;
    z-index:-1; border-radius:0 24px 24px 0; pointer-events:none;
    background: rgba(40,32,22,0.17); filter: blur(20px);
  }
  .kc-post-a { top:-4px; }
  .kc-post-b { bottom:-4px; }
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
  /* The capture pill is LIQUID GLASS like everything else — the capsule takes
     on the page behind it (that adaptation is the material's whole identity;
     an opaque fill read as a solid white bar). Legibility doesn't depend on the
     capsule: the input sits on its own semi-solid plate, and the grip dots get
     a light halo so they survive dark pages. */
  #kc-dump .glass { padding:8px; border-radius:26px; align-items:center; }
  #kc-dump-grip { filter: drop-shadow(0 0 2px rgba(255,255,255,0.55)); }
  /* Grab handle — move the pill without disturbing text selection. */
  #kc-dump-grip {
    flex:none; width:18px; height:30px; margin-left:5px; cursor:grab; touch-action:none;
    background-image: radial-gradient(circle, rgba(90,82,72,0.42) 1.2px, transparent 1.4px);
    background-size:6px 7px; background-position:center; border-radius:6px;
  }
  #kc-dump-grip:active { cursor:grabbing; }
  /* The input uses the SAME plate material as the buttons' .core (0.55 white
     over the blurred capsule) — at 0.62 it was the one solid-white element in a
     glass system, and since it spans nearly the whole capsule, it made the
     entire pill read as opaque. The capsule's backdrop blur underneath is what
     keeps text legible on busy pages; a heavier fill was never needed. */
  #kc-dump-input {
    width:min(62vw,440px); border:none; outline:none;
    padding:13px 20px; border-radius:19px; background: rgba(255,255,255,0.55);
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.7), inset 0 -1px 1px rgba(120,110,95,0.06);
    color:#2c2823; font:500 16px/1.2 system-ui,-apple-system,"Segoe UI",sans-serif;
    letter-spacing:0.01em;
  }
  /* A touch darker than before: the plate under it is more translucent now,
     and the placeholder is the only text the pill ever shows at rest. */
  #kc-dump-input::placeholder { color:rgba(58,52,45,0.66); }

  /* ── The Dish (bottom-right) — store target + shelf handle, with a light
     "goal" identity (a faint warm glow), understated. ──────────────────────── */
  /* Warm glow pooling at the goal mouth — the "aim here" hint. Brighter when
     the goal is holding thoughts. */
  /* No steady glow. Any always-on light patch gets cropped by its own box
     somewhere, and on a dark page that crop line reads as a pale rectangle
     (which it did, twice). The element stays only for the store pulse — a
     brief, fully-fading flash when a ball lands — and the ellipse dies to
     zero well inside the box on every side, so nothing can ever be clipped. */
  #kc-dish-glow {
    position:absolute; left:15px; right:0; top:2px; bottom:2px;
    pointer-events:none; border-radius:0 22px 22px 0;
    background: radial-gradient(72% 40% at 26% 50%, rgba(255,240,218,0.5), rgba(255,240,218,0.10) 58%, rgba(255,240,218,0) 88%);
    opacity:0;
  }
  #kc-dish-glow.is-pulse { animation: kc-pulse 820ms ease-out; }
  @keyframes kc-pulse {
    0% { transform:scale(0.92); opacity:0; }
    26% { transform:scale(1.10); opacity:0.9; }
    100% { transform:scale(1); opacity:0; }
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
    transition: box-shadow 140ms ease;
  }
  /* Keyboard selection — a ring, so it reads without competing with the ball's
     own material. Only present when the tray is driven by the keyboard. */
  .kc-sphere.is-selected {
    box-shadow: 0 6px 16px rgba(0,0,0,0.26), 0 0 0 3px rgba(58,74,96,0.85),
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
    /* Thoughts can be long now — the card scrolls rather than eating the screen. */
    max-height:52vh; overflow-y:auto; overscroll-behavior:contain;
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
  /* Recap sits in the open, not inside ⋯ — a feature nobody can find is a
     feature that doesn't exist. */
  #kc-recap {
    flex:none; height:34px; padding:0 13px; border:none; border-radius:17px;
    cursor:pointer; background:rgba(255,255,255,0.58); color:#4b463f;
    font:600 12.5px system-ui,-apple-system,sans-serif;
  }
  #kc-recap:hover, #kc-more:hover { background:rgba(255,255,255,0.8); }
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

  /* ── Tag chips. Only appear when thoughts actually carry #tags, so the tray
     stays bare until tagging is something you're really doing. */
  #kc-tags {
    position:absolute; left:16px; right:16px; top:54px; z-index:3;
    display:none; flex-wrap:wrap; gap:6px;
  }
  #kc-tags.is-shown { display:flex; }
  .kc-tag {
    border:none; cursor:pointer; padding:5px 11px; border-radius:13px;
    background:rgba(255,255,255,0.66); color:#514a42;
    font:500 12px system-ui,-apple-system,sans-serif;
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.8), 0 1px 3px rgba(54,40,24,0.10);
    transition: background 160ms ease, color 160ms ease, transform 160ms ease;
  }
  .kc-tag:hover { transform:translateY(-1px); }
  .kc-tag.is-on { background:rgba(58,74,96,0.90); color:#f4f7fb; }

  /* ── Recap. A quiet report on the state of your cache: what's here, what you
     finished, and — the one that actually drives action — how long the oldest
     thing has been waiting. */
  /* The panel must FIT its box: compact cards, and overflow scrolls rather than
     spilling the Review button past the tray edge (which it did). */
  #kc-stats {
    position:absolute; left:14px; right:14px; top:52px; bottom:14px; z-index:5;
    display:none; flex-direction:column; gap:9px; padding:14px;
    overflow-y:auto; overscroll-behavior:contain;
    border-radius:18px; background:rgba(252,251,249,0.98);
    box-shadow:0 18px 44px rgba(54,40,24,0.22); border:1px solid rgba(255,255,255,0.8);
  }
  #kc-stats.is-open { display:flex; }
  #kc-stats-close {
    position:absolute; right:8px; top:6px; z-index:1; border:none; background:none;
    cursor:pointer; font-size:19px; line-height:1; color:#8a8178; padding:4px 8px;
  }
  #kc-stats-grid { display:grid; grid-template-columns:1fr 1fr 1fr; gap:7px; margin-top:6px; }
  .kc-stat {
    padding:8px 10px; border-radius:12px; background:rgba(255,255,255,0.78);
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.9), 0 1px 2px rgba(54,40,24,0.06);
  }
  .kc-stat b {
    display:block; font:650 17px/1.1 system-ui,-apple-system,sans-serif; color:#3a352f;
    font-variant-numeric: tabular-nums;
  }
  .kc-stat span {
    display:block; margin-top:2px; color:#7b736a;
    font:500 10.5px/1.25 system-ui,-apple-system,sans-serif; letter-spacing:0.015em;
  }
  #kc-stats-oldest {
    flex:none; padding:9px 11px; border-radius:12px; background:rgba(246,239,228,0.92);
    color:#5d5348; font:500 11.5px/1.4 system-ui,-apple-system,sans-serif;
  }
  #kc-stats-review {
    flex:none; margin-top:auto; border:none; cursor:pointer; padding:10px; border-radius:12px;
    background:rgba(58,74,96,0.92); color:#f4f7fb;
    font:600 12.5px system-ui,-apple-system,sans-serif;
  }
  #kc-stats-review[disabled] { opacity:0.4; cursor:default; }
  /* "Coming up" — there is always a next milestone approaching. */
  #kc-stats-next {
    flex:none; text-align:center; color:#8a8172;
    font:500 11px system-ui,-apple-system,sans-serif; letter-spacing:0.02em;
  }

  /* ── Milestone banner: a glass pill that drops in top-centre, says its line,
     and leaves. Big type, short life — a moment, not a UI element. */
  #kc-milestone {
    position:fixed; left:50%; top:26px; transform:translate(-50%,-16px) scale(0.94);
    z-index:22; pointer-events:none; opacity:0;
    padding:13px 24px; border-radius:22px;
    background:rgba(252,251,249,0.92);
    -webkit-backdrop-filter: blur(18px) saturate(1.6); backdrop-filter: blur(18px) saturate(1.6);
    border:1px solid rgba(255,255,255,0.85);
    box-shadow: 0 18px 44px rgba(40,32,22,0.26), inset 0 1.5px 1px rgba(255,255,255,0.95);
    color:#3a352f; font:650 15px/1 system-ui,-apple-system,"Segoe UI",sans-serif;
    letter-spacing:0.01em; white-space:nowrap;
    transition: opacity 260ms ease, transform 420ms cubic-bezier(0.34,1.56,0.64,1);
  }
  #kc-milestone.is-shown { opacity:1; transform:translate(-50%,0) scale(1); }

  /* A stored thought, unwrapped in place. */
  #kc-thought-card {
    position:absolute; left:16px; right:16px; bottom:16px; z-index:5; display:none;
    /* anchors #kc-tc-later-menu */
    flex-direction:column; gap:9px; padding:15px 16px; border-radius:18px;
    background:rgba(252,251,249,0.97); border:1px solid rgba(255,255,255,0.75);
    box-shadow:0 18px 42px rgba(54,40,24,0.26);
  }
  #kc-thought-card.is-open { display:flex; }
  #kc-tc-text {
    color:#332f2a; font:500 14px/1.5 system-ui,-apple-system,sans-serif;
    max-height:96px; overflow:auto; word-break:break-word;
    border-radius:10px; padding:7px 9px; margin:-7px -9px 0;
    outline:none; transition: background 160ms ease, box-shadow 160ms ease;
  }
  /* The text is editable, but that shouldn't be loud — it reads as plain text
     until you focus it, then a soft plate confirms you're editing. */
  #kc-tc-text:hover { background:rgba(0,0,0,0.03); }
  #kc-tc-text:focus {
    background:rgba(255,255,255,0.85);
    box-shadow: inset 0 0 0 1.5px rgba(58,74,96,0.45);
  }
  #kc-tc-text.is-saved { box-shadow: inset 0 0 0 1.5px rgba(47,74,51,0.55); }
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

  /* Resurface line — shown only when a thought is scheduled to come back. */
  #kc-tc-resurface {
    display:none; color:#5d5348; font:500 12px system-ui,-apple-system,sans-serif;
    padding:6px 10px; border-radius:10px; background:rgba(246,239,228,0.9);
  }
  #kc-tc-resurface.is-shown { display:block; }

  /* "Later" menu — pick when a parked thought resurfaces. Anchored above the
     button row so it never pushes the card's actions around. */
  #kc-tc-later-menu {
    position:absolute; right:16px; bottom:54px; z-index:6; display:none;
    flex-direction:column; min-width:130px; padding:5px; border-radius:13px;
    background:rgba(252,251,249,0.98);
    box-shadow:0 14px 32px rgba(54,40,24,0.24); border:1px solid rgba(255,255,255,0.75);
  }
  #kc-tc-later-menu.is-open { display:flex; }
  #kc-tc-later-menu button {
    border:none; background:none; cursor:pointer; text-align:left;
    padding:9px 11px; border-radius:9px; color:#3f3a34;
    font:500 13px system-ui,-apple-system,sans-serif;
  }
  #kc-tc-later-menu button:hover { background:rgba(0,0,0,0.05); }

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
    #kc-dish-glow.is-pulse, #kc-puck.is-rattle, #kc-puck.is-pop { animation:none; }
    #kc-milestone { transition:opacity 200ms ease; }
  }
</style>
`;

// Mount now that the CSS/DOM constants are initialized. Idempotent — never
// stack overlays across SPA navigations / re-injection.
if (!document.getElementById(ROOT_ID)) {
  mountOverlay();
}
