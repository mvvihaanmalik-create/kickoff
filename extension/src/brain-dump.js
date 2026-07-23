// The Brain Dump — summons a minimal glass input pill (keyboard shortcut or the
// frosted trigger icon), and on Enter hands the text to the engine, which brings
// a live thought-sphere into being. Input length is capped so canvas-drawn text
// stays legible when wrapped onto the sphere (§7).

import * as audio from "../../src/audio.js";
import { showGoal, relaxGoal } from "./shelf.js";
import { loadTrigPos, saveTrigPos } from "./storage.js";

// The CAPTURE limit, not the ball's. The ball face shows a ~120-char headline
// (its legibility cap, CONFIG.thoughtCap); the full text lives on the unwrap
// card. 2000 is a sanity bound, not a product decision.
const THOUGHT_CAP = 2000;

let els = null;
let api = null;
let open = false;

export function initBrainDump(root, engineApi) {
  api = engineApi;
  els = {
    pill: root.querySelector("#kc-dump"),
    input: root.querySelector("#kc-dump-input"),
    trigger: root.querySelector("#kc-trigger"),
  };
  if (!els.pill) return;

  els.input.maxLength = THOUGHT_CAP;
  // Drag-aware: a clean click toggles the pill, a drag moves the + itself.
  els.trigger.addEventListener("pointerdown", onTriggerPress);
  els.input.addEventListener("keydown", onKey);

  // The + is movable like everything else, and remembers where you put it.
  // Default stays bottom-left (the CSS position) until it's ever dragged.
  loadTrigPos().then((p) => {
    if (p && typeof p.x === "number") placeTrigger(p.x, p.y);
  });

  // The pill can be dragged out of the way, but always reopens centred — so it
  // never "hides" somewhere you forgot you left it.
  const grip = root.querySelector("#kc-dump-grip");
  if (grip) grip.addEventListener("pointerdown", onPillDrag);
  els.pill.addEventListener("pointerdown", (e) => {
    if (e.target === els.input || e.target === grip) return; // let typing/grip work
    onPillDrag(e);
  });

  // Global shortcut: Cmd/Ctrl+Shift+K. Captured on the document so it works
  // regardless of page focus; we only preventDefault when we actually act.
  document.addEventListener("keydown", onGlobalKey, true);
}

// The + button: click toggles capture, drag relocates it. Same movement
// threshold as the goal and the pill, so all three feel like one system.
function onTriggerPress(e) {
  const sx = e.clientX, sy = e.clientY;
  const r = els.trigger.getBoundingClientRect();
  const offX = sx - r.left, offY = sy - r.top;
  let moved = false;
  const move = (ev) => {
    if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) > 5) moved = true;
    if (!moved) return;
    placeTrigger(ev.clientX - offX, ev.clientY - offY);
  };
  const up = (ev) => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    if (moved) {
      const rr = els.trigger.getBoundingClientRect();
      saveTrigPos({ x: rr.left, y: rr.top });
    } else {
      open ? close() : summon();
    }
  };
  window.addEventListener("pointermove", move, { passive: true });
  window.addEventListener("pointerup", up, { passive: true });
}

// Clamp on-screen and switch from the CSS bottom-left default to explicit
// coordinates the first time it moves.
function placeTrigger(x, y) {
  const w = els.trigger.offsetWidth || 44, h = els.trigger.offsetHeight || 40;
  const cx = Math.max(6, Math.min(window.innerWidth - w - 6, x));
  const cy = Math.max(6, Math.min(window.innerHeight - h - 6, y));
  els.trigger.style.left = cx + "px";
  els.trigger.style.top = cy + "px";
  els.trigger.style.bottom = "auto";
}

function onGlobalKey(e) {
  const mod = (e.ctrlKey || e.metaKey) && e.shiftKey;
  if (!mod) return;
  const k = (e.key || "").toLowerCase();
  // Ctrl/Cmd+Shift+S — capture the page you're on as a thought, no typing.
  if (k === "s") {
    e.preventDefault();
    e.stopPropagation();
    capturePage();
    return;
  }
  // Ctrl/Cmd+Shift+K — the input pill (pre-filled with any selected text).
  if (k === "k") {
    e.preventDefault();
    e.stopPropagation();
    open ? close() : summon();
  }
}

// Feature: capture the current page (title + URL) straight into a thought-ball.
function capturePage() {
  api && api.unlockAudio();
  const title = (document.title || location.hostname).trim().slice(0, THOUGHT_CAP);
  api.activate({
    text: title,
    id: newId(),
    url: location.href,
    x: window.innerWidth / 2,
    y: window.innerHeight / 2,
  });
}

const clampN = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

// Always reopen centred, wherever it was last dragged to.
function centrePill() {
  const w = els.pill.offsetWidth || 480;
  const h = els.pill.offsetHeight || 62;
  els.pill.style.left = Math.round((window.innerWidth - w) / 2) + "px";
  els.pill.style.top = Math.round(window.innerHeight * 0.34 - h / 2) + "px";
}

function onPillDrag(e) {
  e.preventDefault();
  e.stopPropagation();
  const r = els.pill.getBoundingClientRect();
  const offX = e.clientX - r.left;
  const offY = e.clientY - r.top;
  const move = (ev) => {
    const w = els.pill.offsetWidth, h = els.pill.offsetHeight;
    els.pill.style.left = clampN(ev.clientX - offX, 8, window.innerWidth - w - 8) + "px";
    els.pill.style.top = clampN(ev.clientY - offY, 8, window.innerHeight - h - 8) + "px";
  };
  const up = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
  };
  window.addEventListener("pointermove", move, { passive: true });
  window.addEventListener("pointerup", up, { passive: true });
}

function summon() {
  if (!els) return;
  api && api.unlockAudio(); // first deliberate gesture unlocks sound
  open = true;
  audio.tick(1.18); // a high, quiet cue: capture is armed
  showGoal(); // the target appears with the input — aim and thought together
  els.pill.classList.add("is-open");
  centrePill();
  // Pre-fill with whatever you've selected on the page — highlight, hit the
  // shortcut, and it's already a thought you can edit or just accept.
  const sel = (window.getSelection && String(window.getSelection() || "").trim()) || "";
  els.input.value = sel ? sel.slice(0, THOUGHT_CAP) : "";
  // Focus now, and again on a short delay as a backup — rAF can be throttled and
  // some pages briefly re-grab focus after our click. preventScroll so the host
  // page doesn't jump.
  const grab = () => { try { els.input.focus({ preventScroll: true }); } catch { els.input.focus(); } };
  grab();
  setTimeout(grab, 40);
  setTimeout(grab, 140);
}

function close() {
  open = false;
  els.pill.classList.remove("is-open");
  els.input.blur();
  relaxGoal(); // no capture happened → the goal may tuck away again
}

function onKey(e) {
  e.stopPropagation(); // typing must never leak to the page or the shortcut
  if (e.key === "Enter") {
    const text = els.input.value.trim();
    if (text) {
      api.activate({ text, id: newId(), x: window.innerWidth / 2, y: window.innerHeight / 2 });
      audio.pop(); // the thought comes into being
    }
    close();
  } else if (e.key === "Escape") {
    close();
  }
}

function newId() {
  return "t_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}
