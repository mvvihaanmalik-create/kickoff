// The Dish + The Shelf. Stored thoughts live here. The dish is the store target
// and the shelf's handle; clicking it expands a frosted tray IN PLACE (no camera
// move) where each stored thought rests as a sphere. Sphere slot-seeking reuses
// the engine's chase spring (retargeted from cursor → slot) so arrivals have the
// same overshoot/settle character; a small per-sphere wobble makes them read as
// "objects resting near each other" without any real collision (§7).
import { CONFIG, labelFontSize } from "../../src/main.js";
import * as audio from "../../src/audio.js";
import { loadThoughts, saveThoughts, usingChromeStorage, isOnboarded, setOnboarded, loadGoalPos, saveGoalPos, loadLastReview, saveLastReview, loadFinished, saveFinished, loadRattleDay, saveRattleDay } from "./storage.js";

let api = null;
let shadow = null;
let els = null;
let thoughts = []; // {id, text, createdAt} — in-memory for Phase 3 (Phase 6 = chrome.storage)
let open = false;
let spheres = []; // active render objects while the tray is open
let lastW = 0, lastH = 0;
let query = ""; // live search filter (available from the very first thought)
let finishedLog = []; // timestamps of dissolved thoughts — powers streak + weekly count
let selIndex = -1; // keyboard-selected sphere; -1 = nothing selected (mouse mode)

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
    tcLater: root.querySelector("#kc-tc-later"),
    tcLaterMenu: root.querySelector("#kc-tc-later-menu"),
    tcResurface: root.querySelector("#kc-tc-resurface"),
    undo: root.querySelector("#kc-undo"),
    undoText: root.querySelector("#kc-undo-text"),
    undoBtn: root.querySelector("#kc-undo-btn"),
    kickoff: root.querySelector("#kc-kickoff"),
    kickoffText: root.querySelector("#kc-kickoff-text"),
    kickoffGo: root.querySelector("#kc-kickoff-go"),
    kickoffSkip: root.querySelector("#kc-kickoff-skip"),
    tags: root.querySelector("#kc-tags"),
    backupBtn: root.querySelector("#kc-backup"),
    restoreBtn: root.querySelector("#kc-restore"),
    restoreFile: root.querySelector("#kc-restore-file"),
    recapBtn: root.querySelector("#kc-recap"),
    stats: root.querySelector("#kc-stats"),
    statsGrid: root.querySelector("#kc-stats-grid"),
    statsOldest: root.querySelector("#kc-stats-oldest"),
    statsReview: root.querySelector("#kc-stats-review"),
    statsClose: root.querySelector("#kc-stats-close"),
  };
  if (!els.dish) return;

  // Recap — reachable on demand, which the automatic daily prompt never was.
  els.recapBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    els.menu.classList.remove("is-open");
    api.unlockAudio();
    openStats();
  });
  els.statsClose.addEventListener("click", (e) => { e.stopPropagation(); audio.tick(0.8); closeStats(); });
  els.statsReview.addEventListener("click", (e) => { e.stopPropagation(); startRecapReview(); });

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

  // Edit in place. A typo used to mean delete-and-retype; now the card's text is
  // directly editable. Persist on blur or Enter — not on every keystroke, which
  // would thrash storage and re-render the tags mid-word.
  els.tcText.addEventListener("keydown", (e) => {
    e.stopPropagation(); // typing must never reach the page or the shortcuts
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); els.tcText.blur(); }
    if (e.key === "Escape") { els.tcText.textContent = cardThought ? cardThought.text : ""; els.tcText.blur(); }
  });
  els.tcText.addEventListener("blur", () => commitEdit());

  // "Later" — park the thought and schedule it to resurface. Distinct from Keep
  // (which just stores it) because the return date is the whole point.
  els.tcLater.addEventListener("click", (e) => {
    e.stopPropagation();
    els.tcLaterMenu.classList.toggle("is-open");
  });
  els.tcLaterMenu.querySelectorAll("button").forEach((b) => {
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      resurfaceIn(+b.dataset.days);
    });
  });

  // Clicking empty tray space closes the card / menu.
  els.tray.addEventListener("pointerdown", (ev) => {
    if (!els.card.contains(ev.target)) closeThoughtCard();
    if (!els.menu.contains(ev.target) && ev.target !== els.more) els.menu.classList.remove("is-open");
    if (!els.tcLaterMenu.contains(ev.target) && ev.target !== els.tcLater) els.tcLaterMenu.classList.remove("is-open");
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
      audio.tick();
      els.exportBtn.classList.add("is-copied");
      setTimeout(() => els.exportBtn.classList.remove("is-copied"), 1400);
    });
  }

  // Backup — a dated JSON file, downloaded. Restore — additive merge from one.
  if (els.backupBtn) {
    els.backupBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      els.menu.classList.remove("is-open");
      const blob = new Blob([serializeBackup(thoughts, finishedLog)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `kickoff-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      audio.tick();
    });
    els.restoreBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      els.restoreFile.click();
    });
    els.restoreFile.addEventListener("change", () => {
      const file = els.restoreFile.files && els.restoreFile.files[0];
      els.restoreFile.value = ""; // same file can be picked again later
      if (!file) return;
      file.text().then((raw) => {
        const merged = mergeBackup(thoughts, finishedLog, raw);
        thoughts = merged.thoughts;
        finishedLog = merged.finished;
        saveThoughts(thoughts);
        saveFinished(finishedLog);
        updateDishCount();
        renderTags();
        if (open) refreshSpheres();
        updateEmptyState();
        audio.tick(0.62);
        flashMenuLabel(els.restoreBtn, merged.added === 0 ? "Nothing new" : `Restored ${merged.added}`);
      }).catch(() => {
        flashMenuLabel(els.restoreBtn, "Not a KICKOFF backup");
      });
    });
  }

  api.setStoreHandler(onStore);
  // A thought dissolved ("Done") — log the finish for the streak, then advance
  // the review. This is the only trace a finished thought leaves behind.
  api.setBreakHandler(() => {
    const before = finishedLog.slice();
    finishedLog.push(Date.now());
    saveFinished(finishedLog);
    // Milestone? Fire the FULL goal celebration (cheer, confetti, net billow)
    // plus a banner — the moment should be unmistakably bigger than a normal
    // finish. Delayed a beat so the dissolve finishes reading first.
    const m = milestoneFor(before, finishedLog);
    if (m) setTimeout(() => { setCollapsed(false); api.triggerGoal(); showMilestone(m.label); }, 650);
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
  // Keyboard navigation of the open tray — a capture tool people reach by
  // shortcut shouldn't force a switch to the mouse to act on what they stored.
  document.addEventListener("keydown", onTrayKey, true);

  // Restore where the goal was dragged to (falls back to its CSS default).
  loadGoalPos().then((p) => {
    if (p && typeof p.x === "number") goalPos = p;
    refreshDishPos();
  });

  // The goal starts as a puck — it takes real space only when something needs
  // it (a live thought, the tray, a review). This was the top complaint about
  // the always-on goalpost.
  setCollapsed(true);

  // Restore persisted thoughts (survives browser restart via chrome.storage.local).
  loadThoughts().then((saved) => {
    thoughts = saved;
    updateDishCount();
    renderTags();
    if (saved.length === 0) maybeOnboard();
    else maybeDailyKickoff();
    maybeRattle();
  });
  loadFinished().then((log) => { finishedLog = log; });

  // Live refresh: captures can now arrive from OUTSIDE this page — the omnibox
  // (`kick …`), the right-click menu, or another tab. storage.onChanged is the
  // one channel they all share, so the count and tray stay honest everywhere.
  // (Also fires for our own writes; adopting identical data is a no-op.)
  if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local" || !changes.kc_thoughts) return;
      thoughts = changes.kc_thoughts.newValue || [];
      updateDishCount();
      renderTags();
      if (open) refreshSpheres();
    });
  }
  // The background worker asks the nearest overlay to acknowledge an
  // out-of-page capture — the puck pops, so the kick visibly landed somewhere.
  if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg && msg.type === "kc:captured") restart(els.puck, "is-pop");
    });
  }
}

// ── Daily Kickoff ────────────────────────────────────────────────────────────
// Once a day, thoughts you parked earlier come back out for a decision. This is
// the loop that makes the cache worth returning to instead of a write-only bin.
let reviewQueue = [];

const todayKey = () => new Date().toISOString().slice(0, 10);

// Thoughts old enough to be worth re-deciding. `sinceMidnight` is the automatic
// daily rule (only yesterday's thoughts, so the prompt never nags about what you
// just wrote); passing false takes anything, which is what the manual Recap uses.
function dueThoughts(sinceMidnight = true) {
  const now = Date.now();
  const cutoff = new Date(); cutoff.setHours(0, 0, 0, 0);
  return thoughts
    .filter((t) => !t.snoozeUntil || t.snoozeUntil <= now)
    .filter((t) => !sinceMidnight || (t.createdAt || 0) < cutoff.getTime())
    .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)); // oldest first
}

function maybeDailyKickoff() {
  loadLastReview().then((last) => {
    if (last === todayKey()) return;
    const due = dueThoughts(true);
    if (!due.length) return;
    reviewQueue = due.slice(0, 3); // a short, finishable review — never a chore
    showKickoffPrompt(reviewQueue.length);
  });
}

// ── Recap ────────────────────────────────────────────────────────────────────
// The automatic Daily Kickoff only fires on a later calendar day, once, on page
// load — which made it effectively invisible. Recap is the same review, reachable
// on demand, plus the numbers that give it context.
const DAY = 86400000;

function statsSnapshot() {
  const now = Date.now();
  const weekAgo = now - 7 * DAY;
  const kept = thoughts.length;
  const finishedWeek = finishedLog.filter((ts) => ts >= weekAgo).length;
  const oldest = dueThoughts(false)[0] || null;
  const oldestDays = oldest ? Math.floor((now - (oldest.createdAt || now)) / DAY) : 0;
  // Streak: consecutive days back from today on which you finished something.
  let streak = 0;
  const days = new Set(finishedLog.map((ts) => new Date(ts).toISOString().slice(0, 10)));
  for (let i = 0; ; i++) {
    const key = new Date(now - i * DAY).toISOString().slice(0, 10);
    if (days.has(key)) streak++;
    else if (i > 0) break;       // today being empty doesn't end a live streak
    else if (!days.has(key)) continue;
  }
  // Best run ever, walked over the same day-set in date order.
  let bestStreak = 0, run = 0, prev = "";
  for (const d of [...days].sort()) {
    run = prev && (new Date(d) - new Date(prev)) === DAY ? run + 1 : 1;
    bestStreak = Math.max(bestStreak, run);
    prev = d;
  }
  return {
    kept, finishedWeek, finishedAll: finishedLog.length,
    oldest, oldestDays, streak, bestStreak, tags: allTags().length,
  };
}

function openStats() {
  if (!els.stats) return;
  const s = statsSnapshot();
  els.statsGrid.textContent = "";
  // Match-report framing: the numbers are the same, but "booted into oblivion"
  // earns a smile where "deleted count" reads like a database column.
  const streakLabel = s.streak >= 3 ? `day streak 🔥` : `day streak`;
  const cards = [
    [s.kept, s.kept === 1 ? "ball in the net" : "balls in the net"],
    [s.finishedWeek, "booted this week"],
    [s.finishedAll, "gone for good"],
    [s.streak, streakLabel],
    [s.bestStreak, "best run"],
    [allTags().length, s.tags === 1 ? "tag in play" : "tags in play"],
  ];
  for (const [n, label] of cards) {
    const d = document.createElement("div");
    d.className = "kc-stat";
    const b = document.createElement("b"); b.textContent = String(n);
    const sp = document.createElement("span"); sp.textContent = label;
    d.append(b, sp);
    els.statsGrid.appendChild(d);
  }
  // The line that actually prompts action.
  els.statsOldest.textContent = s.oldest
    ? `Longest on the bench: “${(s.oldest.text || "").slice(0, 56)}” — ${s.oldestDays === 0 ? "fresh today" : `${s.oldestDays} day${s.oldestDays === 1 ? "" : "s"} waiting`}.`
    : "Nothing on the bench. Clean sheet.";
  els.statsReview.disabled = !s.oldest;
  const nextEl = shadow.querySelector("#kc-stats-next");
  if (nextEl) nextEl.textContent = `Coming up: ${nextMilestone(finishedLog)}.`;
  // The spheres are position:fixed siblings, so they'd float straight over the
  // panel (and did). Recap owns the tray while it's open.
  els.slots.style.display = "none";
  if (els.tags) els.tags.style.display = "none";
  els.stats.classList.add("is-open");
  audio.chime();
}

function closeStats() {
  if (!els.stats) return;
  els.stats.classList.remove("is-open");
  els.slots.style.display = "";
  if (els.tags) els.tags.style.display = "";
  renderTags();
}

// Review from Recap: take the oldest few, regardless of which day they landed.
function startRecapReview() {
  closeStats();
  const due = dueThoughts(false);
  if (!due.length) return;
  reviewQueue = due.slice(0, 3);
  saveLastReview(todayKey());
  nextReviewThought();
}

function showKickoffPrompt(n) {
  if (!els.kickoff) return;
  setCollapsed(false); // the prompt is about the goal's contents — show the goal
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
  setCollapsed(!collapsed);
}

// For the Brain Dump: opening the capture pill also presents the goal, so the
// target you're about to aim at is on screen before the thought exists.
export function showGoal() {
  clearTimeout(tuckT); // a pending tuck must not fire under an open pill
  setCollapsed(false);
}
// …and cancelling the pill lets it tuck away again, unless something needs it.
export function relaxGoal() { tuckIfIdle(500); }

// ONE definition of "the goal has a job right now". Three timers used to carry
// three slightly different copies of this list, and the weakest one clobbered a
// milestone celebration mid-fireworks. Every deferred tuck-away goes through
// here, and re-checks at fire time — never at schedule time.
function goalBusy() {
  const banner = shadow && shadow.querySelector("#kc-milestone");
  return open ||
    (api.isActive && api.isActive()) ||
    (els.stats && els.stats.classList.contains("is-open")) ||
    (els.kickoff && els.kickoff.classList.contains("is-open")) ||
    (banner && banner.classList.contains("is-shown")) ||
    reviewQueue.length > 0;
}

let tuckT = 0;
function tuckIfIdle(delay) {
  clearTimeout(tuckT);
  tuckT = setTimeout(() => {
    if (goalBusy()) tuckIfIdle(900); // something's playing — try again after
    else setCollapsed(true);
  }, delay);
}

function setCollapsed(v) {
  if (collapsed === v) return;
  collapsed = v;
  els.dish.classList.toggle("is-collapsed", collapsed);
  if (collapsed) close(); // a collapsed goal shouldn't leave its shelf hanging open
  updateDishCount();
}

// ── The goal appears when it's needed, and is a small puck otherwise. ─────────
// "Needed" is concrete: a live thought exists (you need somewhere to put it),
// the tray or Recap is open, or a review is prompting. The full goalpost taking
// permanent screen space was the #1 complaint about it. Manual control always
// wins: the puck and Ctrl+Shift+G still toggle it, and auto only acts on the
// TRANSITIONS (thought appears / thought resolved), so it never fights you.
let wasActive = false;

function updateAutoPresence() {
  const active = api.isActive && api.isActive();
  if (active === wasActive) return;
  wasActive = active;
  if (active) {
    clearTimeout(tuckT);
    setCollapsed(false); // a thought is live — show it the target
  } else {
    // Resolved. Give the store/celebration a beat, then get out of the way —
    // tuckIfIdle re-checks goalBusy at fire time (Recap, a review, a milestone
    // celebration all hold it open) and retries until the goal is truly idle.
    tuckIfIdle(1800);
  }
}

// NOTE: proximity dimming was removed deliberately. If your cursor moves
// constantly (which it does while working), a goal that keeps waking up and
// fading is a flicker in your peripheral vision — worse than either state.
// Visibility is now purely deliberate: Ctrl/Cmd+Shift+G, or click the puck.

// Drag the goal; a press without movement is still a click (opens the shelf).
function onGoalPointerDown(e) {
  if (collapsed) {
    // The puck is movable like everything else — it drags the goal's anchor,
    // so wherever you park the ball icon is where the goal expands. A press
    // without movement is still a click: expand AND open the tray in one motion.
    e.stopPropagation();
    const sx = e.clientX, sy = e.clientY;
    const c = goalPos || refreshDishPos();
    const offX = e.clientX - c.x, offY = e.clientY - c.y;
    let moved = false;
    const mv = (ev) => {
      if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) > 5) {
        moved = true;
        els.dish.classList.add("is-dragging");
      }
      if (!moved) return;
      goalPos = { x: ev.clientX - offX, y: ev.clientY - offY };
      refreshDishPos();
    };
    const up2 = () => {
      window.removeEventListener("pointermove", mv);
      window.removeEventListener("pointerup", up2);
      els.dish.classList.remove("is-dragging");
      if (moved) saveGoalPos(goalPos);
      else { setCollapsed(false); openShelf(); }
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

// ── The impatient puck ───────────────────────────────────────────────────────
// If something has sat on the bench for over a week, the puck gives ONE small
// rattle — the product nagging in its own physical language instead of a
// notification. Hard limits, learned from the idle-dim mistake: once per day
// across all tabs (storage marker), only in puck form, a few seconds after
// load so it happens in your peripheral vision rather than during page-load
// chaos, and silent (audio isn't unlocked pre-gesture anyway).
const STALE_MS = 7 * 86400000;

function maybeRattle() {
  const now = Date.now();
  const hasStale = thoughts.some(
    (t) => (!t.snoozeUntil || t.snoozeUntil <= now) && now - (t.createdAt || now) > STALE_MS
  );
  if (!hasStale) return;
  loadRattleDay().then((day) => {
    if (day === todayKey()) return;
    setTimeout(() => {
      // Only in puck form: if the goal is already up (a review prompt, a live
      // thought), the person is being nudged enough — and in that case the
      // day's rattle is NOT spent, so it can still happen later when idle.
      if (!collapsed || !els.puck) return;
      saveRattleDay(todayKey()); // claimed only when it actually plays
      restart(els.puck, "is-rattle");
    }, 4000);
  });
}

// The milestone banner — appears once, says its line, gets out of the way.
let milestoneT = 0;
function showMilestone(label) {
  const b = shadow.querySelector("#kc-milestone");
  if (!b) return;
  b.textContent = label;
  b.classList.add("is-shown");
  clearTimeout(milestoneT);
  milestoneT = setTimeout(() => b.classList.remove("is-shown"), 3400);
}

// Report an outcome on the menu item itself, where the click just happened —
// no toast needed for something this local.
function flashMenuLabel(btn, text) {
  const orig = btn.dataset.label || (btn.dataset.label = btn.textContent);
  btn.textContent = text;
  els.menu.classList.add("is-open");
  setTimeout(() => { btn.textContent = orig; els.menu.classList.remove("is-open"); }, 1600);
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
  renderTags();
  if (open) refreshSpheres();
  if (reviewQueue.length) setTimeout(nextReviewThought, 700); // continue the review
}

// ── Backup / Restore (step 9, the shape that can't lose data) ────────────────
// Live chrome.storage.sync was considered and rejected: 8KB per-item caps the
// cache at ~30 thoughts, and whole-array last-write-wins silently drops one
// device's edits. A file you export and import has neither failure mode, works
// across browsers/machines, and doubles as an archive you actually own.

export function serializeBackup(thoughts, finished) {
  return JSON.stringify({
    app: "kickoff-mental-cache",
    version: 1,
    exportedAt: new Date().toISOString(),
    thoughts,
    finished,
  }, null, 2);
}

// Additive merge, deduped by id — restoring can only ever ADD thoughts, never
// clobber or delete what's here. Returns what to save plus the count added,
// so the UI can report honestly. Throws on files we don't recognise.
export function mergeBackup(current, currentFinished, raw) {
  const data = JSON.parse(raw);
  if (!data || data.app !== "kickoff-mental-cache" || !Array.isArray(data.thoughts)) {
    throw new Error("not a KICKOFF backup");
  }
  const have = new Set(current.map((t) => t.id));
  const incoming = data.thoughts.filter(
    (t) => t && typeof t.id === "string" && typeof t.text === "string" && t.text.trim() && !have.has(t.id)
  );
  const finished = [...new Set([...(currentFinished || []), ...(Array.isArray(data.finished) ? data.finished : [])])]
    .filter((ts) => typeof ts === "number")
    .sort((a, b) => a - b)
    .slice(-400);
  return { thoughts: current.concat(incoming), finished, added: incoming.length };
}

// ── Milestones ───────────────────────────────────────────────────────────────
// The game's own currency, spent deliberately: the 1st finish and the 100th
// shouldn't feel identical. Two kinds — every 10th thought gone for good, and
// the day a streak reaches 7. Pure function of (log before, log after) so it's
// testable and can never double-fire.

function streakOf(log, now = Date.now()) {
  const DAY_ = 86400000;
  const days = new Set(log.map((ts) => new Date(ts).toISOString().slice(0, 10)));
  let s = 0;
  for (let i = 0; ; i++) {
    const key = new Date(now - i * DAY_).toISOString().slice(0, 10);
    if (days.has(key)) s++;
    else if (i > 0) break;
  }
  return s;
}

export function milestoneFor(logBefore, logAfter, now = Date.now()) {
  // Streak first — rarer, so it wins the moment if both land at once.
  const before = streakOf(logBefore, now);
  const after = streakOf(logAfter, now);
  if (before < 7 && after >= 7) {
    return { kind: "streak", label: `${after}-day streak 🔥 — proper form.` };
  }
  const n = logAfter.length;
  if (n > 0 && n % 10 === 0 && logBefore.length < n) {
    return { kind: "count", label: `${n} gone for good — the bench fears you.` };
  }
  return null;
}

// What Recap shows as "coming up" — always something approaching.
export function nextMilestone(log, now = Date.now()) {
  const s = streakOf(log, now);
  if (s > 0 && s < 7) return `${7 - s} more day${7 - s === 1 ? "" : "s"} to a 7-day streak`;
  const n = log.length;
  const gap = 10 - (n % 10);
  return `${gap} more to ${n + gap} gone for good`;
}

// ── Tags ─────────────────────────────────────────────────────────────────────
// Tags are parsed out of the text itself rather than entered separately: typing
// "#work call the bank" is one motion, and a separate tag field would be one
// more thing to fill in at exactly the moment you're trying to offload fast.
const TAG_RE = /#([a-z0-9][a-z0-9_-]{0,23})/gi;

export function parseTags(text) {
  const out = [];
  for (const m of String(text || "").matchAll(TAG_RE)) {
    const tag = m[1].toLowerCase();
    if (!out.includes(tag)) out.push(tag);
  }
  return out;
}

// Every distinct tag in the cache, most-used first — that ordering keeps the
// chips you actually reach for from drifting around as the list grows.
function allTags() {
  const counts = new Map();
  for (const t of thoughts) {
    for (const tag of parseTags(t.text)) counts.set(tag, (counts.get(tag) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

let activeTag = "";

function renderTags() {
  if (!els.tags) return;
  const tags = allTags();
  els.tags.textContent = "";
  els.tags.classList.toggle("is-shown", tags.length > 0);
  if (!tags.length) { activeTag = ""; return; }
  for (const [tag, n] of tags) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "kc-tag" + (activeTag === tag ? " is-on" : "");
    b.textContent = `#${tag} ${n}`;
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      activeTag = activeTag === tag ? "" : tag; // second click clears the filter
      audio.tick();
      renderTags();
      refreshSpheres();
    });
    els.tags.appendChild(b);
  }
}

// Thoughts currently on the shelf: snoozed ones stay out of sight until they're
// due, and the search query + active tag filter the rest.
function visibleThoughts() {
  const now = Date.now();
  const q = query.trim().toLowerCase();
  return thoughts
    .filter((t) => !t.snoozeUntil || t.snoozeUntil <= now)
    .filter((t) => !q || (t.text || "").toLowerCase().includes(q))
    .filter((t) => !activeTag || parseTags(t.text).includes(activeTag));
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
  // Indices just changed under us; re-apply the ring or drop it if out of range.
  if (selIndex >= spheres.length) selIndex = spheres.length - 1;
  if (selIndex >= 0) spheres[selIndex].el.classList.add("is-selected");
}

function toggle() { open ? close() : openShelf(); }

function openShelf() {
  open = true;
  audio.swish(1);
  els.tray.classList.add("is-open");
  renderTags();
  refreshSpheres();
  if (els.search) { els.search.value = query; setTimeout(() => els.search.focus({ preventScroll: true }), 80); }
  // Re-measure slots after layout settles (guards against a 0-size first read).
  requestAnimationFrame(layoutSlots);
  setTimeout(layoutSlots, 60);
}

function close() {
  open = false;
  audio.swish(-1);
  closeStats();
  clearSelection();
  els.tray.classList.remove("is-open");
  spheres.forEach((s) => s.el.remove());
  spheres = [];
  // Done browsing — tuck once the goal is truly idle (retrieving a sphere
  // closes the tray but ACTIVATES a thought; goalBusy sees that at fire time).
  tuckIfIdle(600);
}

// Keyboard control of the tray. Only active while the tray is open and you're
// not typing into the search box or editing a card — those own their own keys.
// Grid-aware: Up/Down move by a row so navigation matches what you see.
function onTrayKey(e) {
  if (!open) return;
  const ae = shadow.activeElement;
  if (ae === els.search || ae === els.tcText) return; // typing takes precedence
  if (els.card.classList.contains("is-open")) return; // card has focus of its own
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const n = spheres.length;
  if (!n) return;
  const cols = trayCols();
  let handled = true;
  switch (e.key) {
    case "ArrowRight": selectSphere(selIndex < 0 ? 0 : Math.min(n - 1, selIndex + 1)); break;
    case "ArrowLeft":  selectSphere(selIndex < 0 ? 0 : Math.max(0, selIndex - 1)); break;
    case "ArrowDown":  selectSphere(selIndex < 0 ? 0 : Math.min(n - 1, selIndex + cols)); break;
    case "ArrowUp":    selectSphere(selIndex < 0 ? 0 : Math.max(0, selIndex - cols)); break;
    case "Home":       selectSphere(0); break;
    case "End":        selectSphere(n - 1); break;
    case "Enter":      if (selIndex >= 0) openThoughtCard(spheres[selIndex].thought); break;
    case "Backspace":
    case "Delete":     if (selIndex >= 0) deleteSelected(); break;
    default: handled = false;
  }
  if (handled) { e.preventDefault(); e.stopPropagation(); }
}

// Columns actually used in the current layout, so Up/Down move a real row.
function trayCols() {
  const tr = trayRestRect();
  return Math.max(1, Math.floor((tr.width - 60) / 78)); // matches layoutSlots' cell math
}

function selectSphere(i) {
  selIndex = i;
  spheres.forEach((s, k) => s.el.classList.toggle("is-selected", k === i));
  if (spheres[i]) audio.tick(1.3);
}

function clearSelection() {
  selIndex = -1;
  spheres.forEach((s) => s.el.classList.remove("is-selected"));
}

function deleteSelected() {
  const sphere = spheres[selIndex];
  if (!sphere) return;
  const removed = sphere.thought;
  thoughts = thoughts.filter((t) => t.id !== removed.id);
  saveThoughts(thoughts);
  updateDishCount();
  renderTags();
  refreshSpheres();
  updateEmptyState();
  // Keep a selection where the deleted one was, so you can clear a run of them.
  selIndex = Math.min(selIndex, spheres.length - 1);
  if (selIndex >= 0) selectSphere(selIndex);
  offerUndo(`Deleted “${(removed.text || "").slice(0, 24)}”`, [removed]);
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
  const whole = thought.text || "";
  const txt = whole.length > CONFIG.thoughtCap
    ? whole.slice(0, CONFIG.thoughtCap - 1).trimEnd() + "…"
    : whole;
  face.textContent = txt;
  face.style.fontSize = labelFontSize(txt) * 0.72 + "px";
  el.title = whole.slice(0, 400); // hover to read (tooltips cap themselves anyway)
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
  if (els) updateAutoPresence();
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
  els.tcText.classList.remove("is-saved");
  const hasUrl = !!thought.url;
  els.tcLink.textContent = hasUrl ? thought.url : "";
  els.tcLink.href = hasUrl ? thought.url : "#";
  els.tcLink.classList.toggle("is-shown", hasUrl);
  els.tcOpen.classList.toggle("is-shown", hasUrl);
  els.tcLaterMenu.classList.remove("is-open");
  renderResurfaceLine(thought);
  els.card.classList.add("is-open");
}

// Save an edit. Guards the two cases that would otherwise corrupt data: an empty
// edit (which would leave a blank sphere) reverts, and re-tagging is re-run so
// editing "buy milk" to "#home buy milk" updates the chips.
function commitEdit() {
  if (!cardThought) return;
  const next = (els.tcText.textContent || "").trim().slice(0, 2000);
  if (!next) { els.tcText.textContent = cardThought.text || ""; return; }
  if (next === cardThought.text) return;
  cardThought.text = next;
  saveThoughts(thoughts);
  renderTags();
  if (open) refreshSpheres();          // the sphere's face reflects the new text
  audio.tick();
  els.tcText.classList.add("is-saved");
  setTimeout(() => els.tcText.classList.remove("is-saved"), 900);
}

// Park a thought to come back in N days. Snoozed thoughts are hidden from the
// tray and the count until due (visibleThoughts already enforces this), and
// dueThoughts brings them into Recap once the time passes.
function resurfaceIn(days) {
  if (!cardThought) return;
  cardThought.snoozeUntil = Date.now() + days * 86400000;
  saveThoughts(thoughts);
  els.tcLaterMenu.classList.remove("is-open");
  audio.swish(-1); // it slips away, to return later
  updateDishCount();
  closeThoughtCard();
  if (open) refreshSpheres();
}

function renderResurfaceLine(thought) {
  const due = thought.snoozeUntil && thought.snoozeUntil > Date.now();
  els.tcResurface.classList.toggle("is-shown", !!due);
  if (due) {
    const days = Math.max(1, Math.ceil((thought.snoozeUntil - Date.now()) / 86400000));
    els.tcResurface.textContent = `Resurfaces in ${days} day${days === 1 ? "" : "s"}.`;
  }
}

function closeThoughtCard() {
  if (cardThought) commitEdit(); // don't lose an edit left unblurred
  cardThought = null;
  els.tcLaterMenu.classList.remove("is-open");
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
  audio.tick(0.62); // the confirm tick, pitched down — a reversal should sound reversed
  renderTags();
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
