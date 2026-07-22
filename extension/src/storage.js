// Persistence — chrome.storage.local (the correct API for extension state; NOT
// window.localStorage, which has isolation quirks in a content-script context).
// Stores a flat array of { id, text, createdAt } (no folders/tags/search in v1).
// Falls back to an in-memory store outside the extension (e.g. a test harness)
// so the same code runs everywhere; real cross-restart persistence needs Chrome.

const KEY = "kc_thoughts";
const ONBOARD_KEY = "kc_onboarded";
let mem = [];
let memOnboard = false;

function hasChromeStorage() {
  return typeof chrome !== "undefined" && chrome.storage && chrome.storage.local;
}

export function usingChromeStorage() {
  return !!hasChromeStorage();
}

export function loadThoughts() {
  return new Promise((resolve) => {
    if (hasChromeStorage()) {
      try {
        chrome.storage.local.get(KEY, (r) => resolve((r && r[KEY]) || []));
      } catch {
        resolve([]);
      }
    } else {
      resolve(mem.slice());
    }
  });
}

export function saveThoughts(thoughts) {
  // This is the persistence contract — every field a thought carries must be
  // listed here, or it silently vanishes on reload while looking fine in memory.
  // `url` (a captured page's link) and `snoozeUntil` (a "resurface later"
  // schedule) were both lost this way; the tests in test/storage.test.js exist
  // to catch the next field that gets added to a thought but forgotten here.
  const data = thoughts.map((t) => ({
    id: t.id,
    text: t.text,
    url: t.url || "",
    createdAt: t.createdAt || Date.now(),
    snoozeUntil: t.snoozeUntil || 0,
  }));
  if (hasChromeStorage()) {
    try { chrome.storage.local.set({ [KEY]: data }); } catch { /* ignore */ }
  } else {
    mem = data;
  }
}

// First-run flag — so the onboarding welcome-ball appears exactly once, ever.
export function isOnboarded() {
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

// The last day a Daily Kickoff review was offered (YYYY-MM-DD), so it surfaces
// once a day rather than on every page load.
const REVIEW_KEY = "kc_lastreview";
let memReview = "";

export function loadLastReview() {
  return new Promise((resolve) => {
    if (hasChromeStorage()) {
      try { chrome.storage.local.get(REVIEW_KEY, (r) => resolve((r && r[REVIEW_KEY]) || "")); }
      catch { resolve(""); }
    } else {
      resolve(memReview);
    }
  });
}

export function saveLastReview(day) {
  if (hasChromeStorage()) {
    try { chrome.storage.local.set({ [REVIEW_KEY]: day }); } catch { /* ignore */ }
  } else {
    memReview = day;
  }
}

// Where the person dragged the + trigger to — remembered per browser.
const TRIG_KEY = "kc_trigpos";
let memTrig = null;

export function loadTrigPos() {
  return new Promise((resolve) => {
    if (hasChromeStorage()) {
      try { chrome.storage.local.get(TRIG_KEY, (r) => resolve((r && r[TRIG_KEY]) || null)); }
      catch { resolve(null); }
    } else {
      resolve(memTrig);
    }
  });
}

export function saveTrigPos(p) {
  if (hasChromeStorage()) {
    try { chrome.storage.local.set({ [TRIG_KEY]: p }); } catch { /* ignore */ }
  } else {
    memTrig = p;
  }
}

// Where the person dragged the goal to — remembered per browser.
const POS_KEY = "kc_goalpos";

export function loadGoalPos() {
  return new Promise((resolve) => {
    if (hasChromeStorage()) {
      try { chrome.storage.local.get(POS_KEY, (r) => resolve((r && r[POS_KEY]) || null)); }
      catch { resolve(null); }
    } else {
      resolve(memPos);
    }
  });
}

let memPos = null;
export function saveGoalPos(p) {
  if (hasChromeStorage()) {
    try { chrome.storage.local.set({ [POS_KEY]: p }); } catch { /* ignore */ }
  } else {
    memPos = p;
  }
}

// Timestamps of finished thoughts — the only record left after one dissolves,
// and what makes "finished this week" and the streak real rather than guessed.
// Capped at 400: enough for months of streaks, small enough to never approach
// the per-item storage quota.
const FINISHED_KEY = "kc_finished";
let memFinished = [];

export function loadFinished() {
  return new Promise((resolve) => {
    if (hasChromeStorage()) {
      try { chrome.storage.local.get(FINISHED_KEY, (r) => resolve((r && r[FINISHED_KEY]) || [])); }
      catch { resolve([]); }
    } else {
      resolve(memFinished.slice());
    }
  });
}

export function saveFinished(list) {
  const data = list.slice(-400);
  if (hasChromeStorage()) {
    try { chrome.storage.local.set({ [FINISHED_KEY]: data }); } catch { /* ignore */ }
  } else {
    memFinished = data;
  }
}

export function setOnboarded() {
  if (hasChromeStorage()) {
    try { chrome.storage.local.set({ [ONBOARD_KEY]: true }); } catch { /* ignore */ }
  } else {
    memOnboard = true;
  }
}
