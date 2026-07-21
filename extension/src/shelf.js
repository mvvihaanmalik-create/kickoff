// The Dish + The Shelf. Stored thoughts live here. The dish is the store target
// and the shelf's handle; clicking it expands a frosted tray IN PLACE (no camera
// move) where each stored thought rests as a sphere. Sphere slot-seeking reuses
// the engine's chase spring (retargeted from cursor → slot) so arrivals have the
// same overshoot/settle character; a small per-sphere wobble makes them read as
// "objects resting near each other" without any real collision (§7).
import { CONFIG, labelFontSize } from "../../src/main.js";
import { loadThoughts, saveThoughts, usingChromeStorage, isOnboarded, setOnboarded, loadGoalPos, saveGoalPos, loadLastReview, saveLastReview } from "./storage.js";

let api = null;
let shadow = null;
let els = null;
let thoughts = []; // {id, text, createdAt} — in-memory for Phase 3 (Phase 6 = chrome.storage)
let open = false;
let spheres = []; // active render objects while the tray is open
let lastW = 0, lastH = 0;
let query = ""; // live search filter (available from the very first thought)

const SPRING = () => ({
  k: CONFIG.chaseOmega * CONFIG.chaseOmega,
  c: 2 * CONFIG.chaseZeta * CONFIG.chaseOmega,
});

export function initShelf(root, engineApi) {
  api = engineApi;
  shadow = root;
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
    kickoffSkip: root.querySelector("#kc-kickoff-skip"),
  };
  if (!els.dish) return;

  els.kickoffGo.addEventListener("click", (e) => { e.stopPropagation(); api.unlockAudio(); startKickoffReview(); });
  els.kickoffSkip.addEventListener("click", (e) => { e.stopPropagation(); dismissKickoff(); });

  // ⋯ menu
  els.more.addEventListener("click", (e) => { e.stopPropagation(); els.menu.classList.toggle("is-open"); });
  els.clearBtn.addEventListener("click", (e) => { e.stopPropagation(); els.menu.classList.remove("is-open"); clearAll(); });
  els.undoBtn.addEventListener("click", (e) => { e.stopPropagation(); undoClear(); });

  // Per-thought actions
  els.tcCopy.addEventListener("click", async (e) => {
    e.stopPropagation();
    if (!cardThought) return;
    try { await navigator.clipboard.writeText(cardThought.text || ""); } catch { /* blocked */ }
    els.tcCopy.textContent = "Copied";
    setTimeout(() => (els.tcCopy.textContent = "Copy"), 1200);
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
  // Clicking empty tray space closes the card / menu.
  els.tray.addEventListener("pointerdown", (ev) => {
    if (!els.card.contains(ev.target)) closeThoughtCard();
    if (!els.menu.contains(ev.target) && ev.target !== els.more) els.menu.classList.remove("is-open");
  });

  // Search — live filter, available from the very first thought.
  if (els.search) {
    els.search.addEventListener("input", (e) => {
      query = e.target.value || "";
      if (open) refreshSpheres();
      updateEmptyState();
    });
    els.search.addEventListener("keydown", (e) => {
      e.stopPropagation(); // typing must not leak to the page or shortcuts
      if (e.key === "Escape") { query = ""; els.search.value = ""; if (open) refreshSpheres(); }
    });
  }
  // Export — copy every kept thought to the clipboard as markdown.
  if (els.exportBtn) {
    els.exportBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const md = thoughts.map((t) => `- ${t.text}${t.url ? ` — ${t.url}` : ""}`).join("\n");
      try { await navigator.clipboard.writeText(md); } catch { /* clipboard blocked */ }
      els.exportBtn.classList.add("is-copied");
      setTimeout(() => els.exportBtn.classList.remove("is-copied"), 1400);
    });
  }

  api.setStoreHandler(onStore);
  // A thought dissolved ("Done") also advances the review.
  api.setBreakHandler(() => {
    if (reviewQueue.length) setTimeout(nextReviewThought, 700);
  });
  api.onFrame(update);
  els.dish.addEventListener("pointerdown", onGoalPointerDown);
  // Ctrl/Cmd+Shift+G — get the goal out of the way (and bring it back).
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key || "").toLowerCase() === "g") {
      e.preventDefault();
      e.stopPropagation();
      toggleCollapse();
    }
  }, true);

  // Restore where the goal was dragged to (falls back to its CSS default).
  loadGoalPos().then((p) => {
    if (p && typeof p.x === "number") goalPos = p;
    refreshDishPos();
  });

  // Restore persisted thoughts (survives browser restart via chrome.storage.local).
  loadThoughts().then((saved) => {
    thoughts = saved;
    updateDishCount();
    if (saved.length === 0) maybeOnboard();
    else maybeDailyKickoff();
  });
}

// ── Daily Kickoff ────────────────────────────────────────────────────────────
// Once a day, thoughts you parked earlier come back out for a decision. This is
// the loop that makes the cache worth returning to instead of a write-only bin.
let reviewQueue = [];

const todayKey = () => new Date().toISOString().slice(0, 10);

function maybeDailyKickoff() {
  loadLastReview().then((last) => {
    if (last === todayKey()) return;
    // Anything kept before today and not snoozed into the future is due.
    const now = Date.now();
    const cutoff = new Date(); cutoff.setHours(0, 0, 0, 0);
    const due = thoughts.filter(
      (t) => (!t.snoozeUntil || t.snoozeUntil <= now) && (t.createdAt || 0) < cutoff.getTime()
    );
    if (!due.length) return;
    reviewQueue = due.slice(0, 3); // a short, finishable review — never a chore
    showKickoffPrompt(reviewQueue.length);
  });
}

function showKickoffPrompt(n) {
  if (!els.kickoff) return;
  els.kickoffText.textContent =
    `${n} thought${n === 1 ? "" : "s"} from before — still worth keeping?`;
  els.kickoff.classList.add("is-open");
}

function startKickoffReview() {
  els.kickoff.classList.remove("is-open");
  saveLastReview(todayKey());
  nextReviewThought();
}

// Pull the next parked thought out as a live ball; acting on it (Keep / Tomorrow
// / Done) naturally advances to the next one.
function nextReviewThought() {
  const t = reviewQueue.shift();
  if (!t) return;
  if (!thoughts.some((x) => x.id === t.id)) return nextReviewThought(); // already dealt with
  retrieveThought(t, window.innerWidth / 2, window.innerHeight / 2);
}

function dismissKickoff() {
  els.kickoff.classList.remove("is-open");
  reviewQueue = [];
  saveLastReview(todayKey());
}

// First install, empty store → spawn one live welcome thought so the physics are
// immediately discoverable without needing a real thought first. Once, ever.
function maybeOnboard() {
  isOnboarded().then((done) => {
    if (done) return;
    setOnboarded();
    api.activate({ text: "flick me!", id: "welcome" });
  });
}

// ── The goal is draggable. `goalPos` is its CENTRE in viewport coords; laying it
// out also re-points the engine's keep-target and re-places the tray, so the
// controls stay accurate wherever you put it. ──────────────────────────────────
let goalPos = null;
let goalRot = 0; // 0 = backing onto the right edge; 90/180/270 as it's dragged
let trayRect = null;

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

// Which way the goal faces. Its back (the net) always turns toward the NEAREST
// screen edge, so the mouth always opens into the pitch — on all four sides.
// Default art has the net on the element's right, so 0° = backing onto the right.
function goalRotation(cx, cy) {
  const dL = cx, dR = window.innerWidth - cx, dT = cy, dB = window.innerHeight - cy;
  const m = Math.min(dL, dR, dT, dB);
  if (m === dR) return 0;   // back to the right edge
  if (m === dB) return 90;  // back to the bottom
  if (m === dL) return 180; // back to the left
  return 270;               // back to the top
}

function applyGoalPos() {
  const gw = els.dish.offsetWidth || 136;
  const gh = els.dish.offsetHeight || 264;
  // Rotation is decided from the *clamped* centre, so the goal can't flip while
  // it's being pushed against an edge.
  let rot = goalRotation(
    clamp(goalPos.x, 0, window.innerWidth),
    clamp(goalPos.y, 0, window.innerHeight)
  );
  const sideways = rot === 90 || rot === 270;
  const ew = sideways ? gh : gw; // effective footprint once rotated
  const eh = sideways ? gw : gh;
  const cx = clamp(goalPos.x, ew / 2, Math.max(ew / 2, window.innerWidth - ew / 2));
  const cy = clamp(goalPos.y, eh / 2, Math.max(eh / 2, window.innerHeight - eh / 2));
  goalPos = { x: cx, y: cy };
  goalRot = rot;

  // Position by the element's own box, then rotate about its centre.
  els.dish.style.left = cx - gw / 2 + "px";
  els.dish.style.top = cy - gh / 2 + "px";
  els.dish.style.transform = `rotate(${rot}deg)`;
  // Keep the count readable no matter how the goal is turned.
  if (els.count) els.count.style.transform = `translateY(-50%) rotate(${-rot}deg)`;

  api.setDish({ x: cx, y: cy }); // the ball's keep-target follows the goal live
  layoutTray(cx, cy, ew, eh, rot);
  if (open) layoutSlots();
  return goalPos;
}

// Park the tray beside the goal — to its left, flipping to the right if there
// isn't room, and clamped on screen. Origin points back at the goal so it still
// reads as opening out of the net.
// The shelf opens out of the goal's MOUTH, so it follows the goal's facing:
// mouth left → tray to the left, mouth up → tray above, and so on.
function layoutTray(cx, cy, ew, eh, rot) {
  const tw = els.tray.offsetWidth || 340;
  const th = els.tray.offsetHeight || 320;
  const gap = 16;
  let left, top, origin;
  if (rot === 0) {          // mouth faces left
    left = cx - ew / 2 - gap - tw; top = cy - th / 2; origin = "right center";
  } else if (rot === 180) { // mouth faces right
    left = cx + ew / 2 + gap; top = cy - th / 2; origin = "left center";
  } else if (rot === 90) {  // mouth faces up
    left = cx - tw / 2; top = cy - eh / 2 - gap - th; origin = "center bottom";
  } else {                  // mouth faces down
    left = cx - tw / 2; top = cy + eh / 2 + gap; origin = "center top";
  }
  left = clamp(left, 12, Math.max(12, window.innerWidth - tw - 12));
  top = clamp(top, 12, Math.max(12, window.innerHeight - th - 12));
  els.tray.style.left = left + "px";
  els.tray.style.top = top + "px";
  els.tray.style.transformOrigin = origin;
  trayRect = { left, top, width: tw, height: th };
}

// The goal centre in viewport coords — the engine's capture check needs it, and
// spheres animate from it.
function refreshDishPos() {
  if (!goalPos) {
    const r = els.dish.getBoundingClientRect();
    goalPos = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
  return applyGoalPos();
}

// ── Getting out of the way ───────────────────────────────────────────────────
// Two independent behaviours: it DIMS on its own when nothing's happening, and
// it can be COLLAPSED to a puck deliberately. Collapsed it still works as a
// keep-target — only its footprint shrinks.
let collapsed = false;

export function toggleCollapse() {
  collapsed = !collapsed;
  els.dish.classList.toggle("is-collapsed", collapsed);
  if (collapsed) close(); // a collapsed goal shouldn't leave its shelf hanging open
  updateDishCount();
}

// NOTE: proximity dimming was removed deliberately. If your cursor moves
// constantly (which it does while working), a goal that keeps waking up and
// fading is a flicker in your peripheral vision — worse than either state.
// Visibility is now purely deliberate: Ctrl/Cmd+Shift+G, or click the puck.

// Drag the goal; a press without movement is still a click (opens the shelf).
function onGoalPointerDown(e) {
  if (collapsed) {
    // While collapsed, a click just brings it back rather than opening the shelf.
    e.stopPropagation();
    const sx = e.clientX, sy = e.clientY;
    let moved = false;
    const mv = (ev) => { if (Math.hypot(ev.clientX - sx, ev.clientY - sy) > 4) moved = true; };
    const up2 = () => {
      window.removeEventListener("pointermove", mv);
      window.removeEventListener("pointerup", up2);
      if (!moved) toggleCollapse();
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
    if (moved) saveGoalPos(goalPos); // remember where they put it
    else toggle(); // a clean click still opens/closes the shelf
  };
  window.addEventListener("pointermove", move, { passive: true });
  window.addEventListener("pointerup", up, { passive: true });
}

function onStore(thought) {
  restart(els.glow, "is-pulse"); // the goal acknowledges with a glow-pulse
  thoughts.push({
    ...thought,
    createdAt: thought.createdAt || Date.now(),
    snoozeUntil: thought.snoozeUntil || 0,
  });
  saveThoughts(thoughts);
  updateDishCount();
  if (open) refreshSpheres();
  if (reviewQueue.length) setTimeout(nextReviewThought, 700); // continue the review
}

// Thoughts currently on the shelf: snoozed ones stay out of sight until they're
// due, and the search query filters the rest.
function visibleThoughts() {
  const now = Date.now();
  const q = query.trim().toLowerCase();
  return thoughts
    .filter((t) => !t.snoozeUntil || t.snoozeUntil <= now)
    .filter((t) => !q || (t.text || "").toLowerCase().includes(q));
}

function updateDishCount() {
  const n = thoughts.filter((t) => !t.snoozeUntil || t.snoozeUntil <= Date.now()).length;
  if (els.count) els.count.textContent = n ? String(n) : "";
  if (els.puck) els.puck.textContent = n ? String(n) : "⚽";
  els.dish.classList.toggle("has-thoughts", n > 0);
}

// Rebuild the spheres to match the current filter/snooze state.
function refreshSpheres() {
  spheres.forEach((s) => s.el.remove());
  spheres = [];
  els.slots.textContent = "";
  const start = refreshDishPos();
  visibleThoughts().forEach((t) => addSphere(t, start));
  layoutSlots();
}

function toggle() { open ? close() : openShelf(); }

function openShelf() {
  open = true;
  els.tray.classList.add("is-open");
  refreshSpheres();
  if (els.search) { els.search.value = query; setTimeout(() => els.search.focus({ preventScroll: true }), 80); }
  // Re-measure slots after layout settles (guards against a 0-size first read).
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
  // Staleness 0→1 over a week: older thoughts darken and settle.
  const ageDays = (Date.now() - (thought.createdAt || Date.now())) / 86400000;
  const stale = Math.max(0, Math.min(1, ageDays / 7));

  const el = document.createElement("div");
  el.className = "kc-sphere";
  el.style.filter = `saturate(${(1 - 0.45 * stale).toFixed(2)}) brightness(${(1 - 0.18 * stale).toFixed(2)})`;
  const face = document.createElement("div");
  face.className = "kc-sphere-face";
  const txt = (thought.text || "").slice(0, CONFIG.thoughtCap);
  face.textContent = txt;
  face.style.fontSize = labelFontSize(txt) * 0.72 + "px";
  el.title = txt; // hover to read the full thought
  el.appendChild(face);
  els.slots.appendChild(el);
  const sphere = {
    id: thought.id, thought, el, face,
    px: from.x, py: from.y, vx: 0, vy: 0,
    slotX: from.x, slotY: from.y,
    wob: Math.random() * Math.PI * 2, wobF: 0.5 + Math.random() * 0.4,
    stale,
    dragging: false,
  };
  el.addEventListener("pointerdown", (e) => beginRetrieve(e, sphere));
  spheres.push(sphere);
  layoutSlots();
  return sphere;
}

// Grid slots inside the tray panel (viewport coords). Computed from the tray's
// UNSCALED rest box (offsetWidth/offsetHeight ignore its open/close scale
// transform + are immune to the frozen-CSS-transition case) plus its fixed
// bottom-right anchor — NOT getBoundingClientRect, which reflects the live
// animating scale and would strand spheres in the collapsed corner.
// The tray's resting box — set by layoutTray as the goal moves. Never read from
// getBoundingClientRect, which reflects the open/close scale animation.
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

// Per-frame: spring each sphere toward its slot (same math as cursor-chase) plus
// an independent idle wobble. Driven by the engine's frame hook so it's in sync.
function update(dt, now) {
  if ((els && (window.innerWidth !== lastW || window.innerHeight !== lastH))) {
    lastW = window.innerWidth; lastH = window.innerHeight;
    refreshDishPos();
    if (open) layoutSlots();
  }
  if (!open) return;
  const { k, c } = SPRING();
  const t = (now || performance.now()) / 1000;
  for (const s of spheres) {
    if (!s.dragging) {
      s.vx += (k * (s.slotX - s.px) - c * s.vx) * dt;
      s.vy += (k * (s.slotY - s.py) - c * s.vy) * dt;
      s.px += s.vx * dt;
      s.py += s.vy * dt;
    }
    s.wob += s.wobF * dt;
    // Staleness: an older thought breathes slower, wobbles less and sits a
    // little lower — it reads as heavier without adding any UI.
    const calm = 1 - 0.75 * s.stale;
    const wx = Math.sin(s.wob) * CONFIG.wobbleAmp * calm;
    const wy = Math.cos(s.wob * 0.8) * CONFIG.wobbleAmp * calm;
    const sag = s.stale * 7; // heavier thoughts settle lower in their slot
    const breathe = 1 + CONFIG.breatheAmp * 0.5 * calm * (1 - Math.cos((t / CONFIG.breathePeriod) * 2 * Math.PI));
    s.el.style.transform =
      `translate(${(s.px + wx).toFixed(2)}px, ${(s.py + wy + sag).toFixed(2)}px) translate(-50%,-50%) rotate(${(Math.sin(s.wob) * 4 * calm).toFixed(2)}deg) scale(${breathe.toFixed(3)})`;
  }
}

// Retrieval — drag a sphere out; on release it becomes the active free-roaming
// thought again and the tray shrinks back into the dish.
// Press a stored sphere: DRAG it out to revive it, or CLICK it to unwrap the
// thought in place with its own actions.
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
    if (!moved) { openThoughtCard(sphere.thought); return; } // a click = read it
    retrieveThought(sphere.thought, ev.clientX, ev.clientY);
  };
  window.addEventListener("pointermove", move, { passive: true });
  window.addEventListener("pointerup", up, { passive: true });
}

// Pull a thought back out as the live roaming ball.
function retrieveThought(thought, x, y) {
  thoughts = thoughts.filter((t) => t.id !== thought.id);
  saveThoughts(thoughts);
  updateDishCount();
  api.unlockAudio();
  api.activate({ text: thought.text, id: thought.id, url: thought.url || "", x, y });
  close();
}

// ── A single stored thought, unwrapped in place with its own actions. ─────────
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

// ── Clear all, made safe by being reversible rather than by a confirm dialog:
// no interruption, and the thoughts are genuinely recoverable for a few seconds.
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
  }, 6000);
}

function undoClear() {
  if (!undoBuffer) return;
  // Restore without duplicating anything created since.
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
  els.empty.textContent = thoughts.length === 0
    ? "Nothing kept yet — flick a thought into the goal."
    : (n === 0 ? "No thoughts match that." : "");
  els.empty.style.display = n === 0 ? "flex" : "none";
}

function restart(el, cls) {
  if (!el) return;
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

// Debug/test surface — synchronous control, mirrors the engine's __k hooks.
export function installShelfDebug() {
  return {
    thoughts: () => thoughts.map((t) => ({ id: t.id, text: t.text })),
    isOpen: () => open,
    open: openShelf,
    close,
    sphereCount: () => spheres.length,
    sphereState: () => spheres.map((s) => ({
      id: s.id, px: Math.round(s.px), py: Math.round(s.py),
      slotX: Math.round(s.slotX), slotY: Math.round(s.slotY),
      atSlot: Math.hypot(s.px - s.slotX, s.py - s.slotY) < 3,
    })),
    retrieveFirst: () => {
      if (!spheres.length) return false;
      const s = spheres[0];
      thoughts = thoughts.filter((t) => t.id !== s.id);
      saveThoughts(thoughts);
      updateDishCount();
      api.activate({ text: s.thought.text, id: s.id, x: s.px, y: s.py });
      close();
      return true;
    },
    storageBacking: () => (usingChromeStorage() ? "chrome.storage.local" : "memory-fallback"),
    reload: () => loadThoughts(), // returns a Promise of the persisted array
  };
}
