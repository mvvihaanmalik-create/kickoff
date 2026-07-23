// KICKOFF — background service worker.
//
// Three jobs, all of them "the extension works even when no page is looking":
//   1. Due notifications — a thought parked with "Later…" actually comes back,
//      via chrome.alarms, instead of only if you happen to load a page.
//   2. Omnibox capture — type `kick buy milk` in the address bar.
//   3. Context-menu capture — right-click a selection, kick it into the cache.
//
// Deliberately dependency-free and buildless: MV3 workers are ephemeral, and a
// plain file with no imports has nothing that can break between wake-ups.
// Storage keys mirror extension/src/storage.js — that file is the contract.

const KEY = "kc_thoughts";
const NOTIFIED_KEY = "kc_notified_at";
const CAP = 2000; // capture sanity bound — the ball shows a headline, the card shows it all

// ── Storage helpers (promise-wrapped, minimal) ───────────────────────────────

function get(key) {
  return new Promise((resolve) => {
    chrome.storage.local.get(key, (r) => resolve(r ? r[key] : undefined));
  });
}

function set(obj) {
  return new Promise((resolve) => chrome.storage.local.set(obj, resolve));
}

async function addThought(text, url = "") {
  const t = (text || "").trim().slice(0, CAP);
  if (!t) return null;
  const thoughts = (await get(KEY)) || [];
  const thought = {
    id: "t" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    text: t,
    url: url || "",
    createdAt: Date.now(),
    snoozeUntil: 0,
  };
  thoughts.push(thought);
  await set({ [KEY]: thoughts });
  return thought;
}

// ── 1. Due notifications ─────────────────────────────────────────────────────
// One alarm, always aimed at the EARLIEST future resurface time. When it fires,
// everything that has come due since the last notification is announced once
// (the marker prevents re-announcing the same thoughts on every worker wake).

async function scheduleDueAlarm() {
  const thoughts = (await get(KEY)) || [];
  const now = Date.now();
  const future = thoughts
    .map((t) => t.snoozeUntil || 0)
    .filter((ts) => ts > now);
  await chrome.alarms.clear("kc-due");
  if (future.length) {
    chrome.alarms.create("kc-due", { when: Math.min(...future) + 500 });
  }
}

async function notifyDue() {
  const thoughts = (await get(KEY)) || [];
  const lastMark = (await get(NOTIFIED_KEY)) || 0;
  const now = Date.now();
  const due = thoughts.filter(
    (t) => t.snoozeUntil > 0 && t.snoozeUntil <= now && t.snoozeUntil > lastMark
  );
  if (due.length) {
    const first = (due[0].text || "").slice(0, 60);
    chrome.notifications.create("kc-due-note", {
      type: "basic",
      iconUrl: "icons/icon128.png",
      title: due.length === 1 ? "⚽ Back on the pitch" : `⚽ ${due.length} back on the pitch`,
      message: due.length === 1 ? `“${first}”` : `“${first}” and ${due.length - 1} more`,
    });
    await set({ [NOTIFIED_KEY]: now });
  }
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== "kc-due") return;
  notifyDue().then(scheduleDueAlarm);
});

// A clicked notification opens a new tab — which IS the pitch, so the due
// thoughts are right there in the goal.
chrome.notifications.onClicked.addListener((id) => {
  if (id !== "kc-due-note") return;
  chrome.notifications.clear(id);
  chrome.tabs.create({});
});

// Re-aim the alarm whenever the thoughts change (a new "Later…" was scheduled,
// or a due one was dealt with) and on every worker start.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes[KEY]) scheduleDueAlarm();
});
chrome.runtime.onStartup.addListener(scheduleDueAlarm);

// ── Capture feedback ─────────────────────────────────────────────────────────
// After an out-of-page capture, ask the active tab's overlay to acknowledge
// (the puck pops). Pages without the content script get a notification instead.

function acknowledgeCapture(text) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs && tabs[0];
    if (!tab || !tab.id) return;
    chrome.tabs.sendMessage(tab.id, { type: "kc:captured" }, () => {
      if (chrome.runtime.lastError) {
        // No overlay there (chrome:// page, Web Store, …) — notify instead.
        chrome.notifications.create({
          type: "basic",
          iconUrl: "icons/icon128.png",
          title: "⚽ In the net",
          message: `“${(text || "").slice(0, 60)}”`,
        });
      }
    });
  });
}

// ── Toolbar button ───────────────────────────────────────────────────────────
// Clicking the football opens the capture pill on the current page. On a page
// the overlay can't reach (chrome://, the Web Store, a fresh tab), open a new
// tab instead — which IS the pitch, so capture is one keystroke away there.

chrome.action.onClicked.addListener((tab) => {
  if (!tab || !tab.id) { chrome.tabs.create({}); return; }
  chrome.tabs.sendMessage(tab.id, { type: "kc:summon" }, () => {
    if (chrome.runtime.lastError) chrome.tabs.create({});
  });
});

// ── 2. Omnibox: `kick <thought>` from the address bar ────────────────────────

if (chrome.omnibox) {
  // Plain text, no markup: the default suggestion is shown before an argument
  // exists, so %s has nothing to fill and the <match> markup only risks a
  // "parsing suggestion" error. Keep it simple and safe.
  chrome.omnibox.setDefaultSuggestion({
    description: "Type a thought, then Enter to kick it into your cache",
  });
  chrome.omnibox.onInputEntered.addListener((text) => {
    addThought(text).then((t) => { if (t) acknowledgeCapture(t.text); });
  });
}

// ── 3. Context menu: right-click a selection ─────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  // removeAll first: reloading an unpacked extension fires onInstalled again
  // while the menu still exists, and create() with a duplicate id throws
  // "Cannot create item with duplicate id" — the error behind the red button.
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "kc-kick-selection",
      title: "Kick this into KICKOFF",
      contexts: ["selection"],
    });
  });
  scheduleDueAlarm();
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== "kc-kick-selection" || !info.selectionText) return;
  addThought(info.selectionText, (tab && tab.url) || "").then((t) => {
    if (t) acknowledgeCapture(t.text);
  });
});
