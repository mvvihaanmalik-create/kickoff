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
  #net {
    position:absolute; left:15px; right:0; top:0; bottom:0;
    border-radius:0 22px 22px 0;
    border:0.5px solid rgba(255,255,255,0.62); border-left:none;
    background:
      /* hairline weave — barely-there, reads as fabric not graph paper */
      repeating-linear-gradient(45deg, transparent 0 7px, rgba(255,255,255,0.13) 7px 7.6px),
      repeating-linear-gradient(-45deg, transparent 0 7px, rgba(255,255,255,0.13) 7px 7.6px),
      /* the surface itself: a smooth, even falloff toward the back */
      linear-gradient(90deg, rgba(255,255,255,0.30) 0%, rgba(255,255,255,0.14) 38%, rgba(255,255,255,0.06) 72%, rgba(58,50,42,0.10) 100%);
    -webkit-backdrop-filter: blur(22px) saturate(1.7) brightness(1.06);
    backdrop-filter: blur(22px) saturate(1.7) brightness(1.06);
    box-shadow:
      inset 20px 0 40px rgba(72,62,50,0.16),        /* depth, softened */
      inset 0 0.5px 0 rgba(255,255,255,0.9),        /* crisp lit top edge */
      inset 0 -0.5px 0 rgba(255,255,255,0.45),
      0 24px 60px rgba(40,32,24,0.20),              /* wide ambient shadow */
      0 2px 8px rgba(40,32,24,0.10);
    transform-origin:right center; will-change:transform;
    transition: box-shadow 320ms ease;
  }
  /* A whisper of depth pooling at the back — volume without dirt. */
  #net::after {
    content:""; position:absolute; inset:0; border-radius:inherit; pointer-events:none;
    background: radial-gradient(130% 100% at 100% 50%, rgba(44,38,30,0.16), rgba(44,38,30,0) 66%);
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

// Mount now that the CSS/DOM constants are initialized. Idempotent — never
// stack overlays across SPA navigations / re-injection.
if (!document.getElementById(ROOT_ID)) {
  mountOverlay();
}
