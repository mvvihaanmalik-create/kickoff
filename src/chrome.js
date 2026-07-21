// Chrome — the Liquid Glass UI layer's interactivity. Strictly cosmetic: it
// never touches ball physics or game state. It drives, per glass button:
//   • a pointer-tracked specular highlight (--mx/--my/--spec), and
//   • hover / press morph classes.
//
// The buttons are pointer-events:none (so clicks pass through to kick the ball),
// which means CSS :hover / :active can't fire — we detect hover/press from the
// window-level pointer position against each button's measured rest box instead.

const HOVER_MARGIN = 26; // px of slack around a button that still counts as hover
let items = [];
let reduce = false;

export function initChrome(root = document) {
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

// Rest boxes, measured with the tackle transform zeroed so hover maps to the
// button's true footprint (not its recoiled position). Re-called on resize.
export function measureChrome() {
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
    const inside =
      x >= b.l - HOVER_MARGIN && x <= b.r + HOVER_MARGIN &&
      y >= b.t - HOVER_MARGIN && y <= b.b + HOVER_MARGIN;
    if (inside) {
      if (!it.hover) {
        it.hover = true;
        it.glass.classList.add("is-hover");
      }
      if (!reduce) {
        // Specular position as a % within the glass, clamped to its bounds.
        const mx = Math.max(0, Math.min(100, ((x - b.l) / b.w) * 100));
        const my = Math.max(0, Math.min(100, ((y - b.t) / b.h) * 100));
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
