// The Unwrap — double-click (or Space while hovering) the active sphere to
// transform it into a flat, readable glass card at the same screen position;
// click away to reverse. A coordinated scale/fade cross-transition (§7): the
// sphere shrinks/fades (engine, via readAlpha) while the card grows/fades in
// (here). The thought's text is real and consistent across the transition;
// only the transition's mechanism is approximated.

let api = null;
let shadow = null;
let card = null;
let cardText = null;
let hoveringBall = false;

const CARD_W = 300;

export function initUnwrap(root, engineApi) {
  api = engineApi;
  shadow = root;
  card = root.querySelector("#kc-card");
  cardText = root.querySelector("#kc-card-text");
  const ball = root.querySelector("#ball");
  if (!card || !ball) return;

  // Double-click the sphere → unwrap. (Space handled globally while hovering.)
  ball.addEventListener("dblclick", (e) => { e.preventDefault(); e.stopPropagation(); begin(); });
  ball.addEventListener("pointerenter", () => (hoveringBall = true));
  ball.addEventListener("pointerleave", () => (hoveringBall = false));

  document.addEventListener("keydown", (e) => {
    if (e.code === "Space" && hoveringBall && !api.isReading()) {
      e.preventDefault();
      begin();
    } else if (e.key === "Escape" && api.isReading()) {
      end();
    }
  }, true);

  // Click anywhere that isn't the card, while reading, reverses it.
  window.addEventListener("pointerdown", (e) => {
    if (api.isReading() && !e.composedPath().includes(card)) end();
  }, true);

  // Drive the card's half of the cross-transition each frame off readAlpha.
  api.onFrame(updateCard);
}

function begin() {
  if (api.isReading()) { end(); return; }
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
  if (a < 0.003 && !api.isReading()) {
    card.style.opacity = "0";
    card.style.visibility = "hidden";
    return;
  }
  card.style.visibility = "visible";
  // Position centered on the ball, clamped to stay fully on screen.
  const p = api.ballPos();
  const h = card.offsetHeight || 120;
  const x = clamp(p.x, CARD_W / 2 + 12, window.innerWidth - CARD_W / 2 - 12);
  const y = clamp(p.y, h / 2 + 12, window.innerHeight - h / 2 - 12);
  // Grow + settle from the sphere; a touch of counter-rotation reads as "unfolding".
  const scale = 0.55 + 0.45 * a;
  const rot = (1 - a) * -6;
  card.style.opacity = a.toFixed(3);
  card.style.transform =
    `translate(${x}px, ${y}px) translate(-50%,-50%) scale(${scale.toFixed(3)}) rotate(${rot.toFixed(2)}deg)`;
}

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

// Debug/test surface.
export function installUnwrapDebug() {
  return {
    isReading: () => api.isReading(),
    readAlpha: () => +api.readAlpha().toFixed(3),
    begin,
    end,
    cardVisible: () => card && getComputedStyle(card).visibility !== "hidden" && +card.style.opacity > 0.01,
    cardText: () => cardText && cardText.textContent,
  };
}
