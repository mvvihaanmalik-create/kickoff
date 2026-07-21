// The Brain Dump — summons a minimal glass input pill (keyboard shortcut or the
// frosted trigger icon), and on Enter hands the text to the engine, which brings
// a live thought-sphere into being. Input length is capped so canvas-drawn text
// stays legible when wrapped onto the sphere (§7).

import * as audio from "../../src/audio.js";

const THOUGHT_CAP = 120;

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
  els.trigger.addEventListener("click", () => (open ? close() : summon()));
  els.input.addEventListener("keydown", onKey);

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
