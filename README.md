# KICKOFF — Mental Cache

A Chrome extension that turns a stray thought into a football you can kick.

Type a thought and it becomes a physical sphere that roams your screen, chases
your cursor, and takes a real kick. Boot it into the goal to keep it. Flick it
away when you're done and it dissolves into vapour. It's a scratchpad that
behaves like an object instead of a list.

> _Add a screen recording here — the ball chasing the cursor, a keep, and a
> dissolve. This project is motion; a still image undersells it badly._

---

## Why it exists

Note apps are where thoughts go to be forgotten. The friction isn't capture —
it's that a captured thought becomes a grey row in a list you never reopen.

KICKOFF makes the thought a physical presence you have to deal with. It's on
screen, it moves, it's mildly in the way. You either put it somewhere (the goal)
or you finish with it (and watch it come apart). Both are satisfying enough that
you actually do them, which is the entire design bet.

## Try it without installing anything

**[Open the live demo →](https://VIHAAN.github.io/kickoff/demo.html)**

That's the real thing running in a normal web page — capture a thought, kick it
around, boot it into the goal. Nothing is installed and nothing leaves your
browser. (Replace the URL above with your Pages URL once it's deployed.)

## Install the Chrome extension

Chrome only allows one-click installs from the Web Store, so until this is
listed there, installing takes four steps. No Node, npm, or build required.

1. Download **`kickoff-extension.zip`** from the
   [latest release](../../releases/latest) and unzip it
2. Open `chrome://extensions`
3. Turn on **Developer mode** (toggle, top right)
4. Click **Load unpacked** and select the unzipped folder

Then refresh any open tabs. Press `Ctrl/Cmd + Shift + K` and start typing.

<details>
<summary>Notes and troubleshooting</summary>

- It runs on ordinary `http(s)` pages only. Chrome blocks all extensions from
  `chrome://` pages, the New Tab page, and the Web Store — that's Chrome, not a
  bug here.
- Chrome shows a "Disable developer mode extensions" warning on startup. That's
  expected for any unpacked extension and safe to dismiss.
- Nothing is uploaded. Thoughts live in `chrome.storage.local` on your machine;
  the extension makes no network requests of any kind.
- After updating, hit the ↻ icon on the extension's card in `chrome://extensions`,
  then refresh your tabs.

</details>

## Build from source

```bash
npm install
npm run build:ext     # bundles to extension/content.js
npm run pack:ext      # …and zips it for distribution
```

Then Load unpacked the `extension/` folder as above.

## Use it

The goal stays out of the way as a small round **puck** showing how many
thoughts it holds. It expands on its own when a thought is live, and tucks
itself away again once you've dealt with it.

| Shortcut / action | What happens |
|---|---|
| `Ctrl/Cmd + Shift + K` | Open the input pill (pre-fills with any selected text) |
| `Ctrl/Cmd + Shift + S` | Capture the current page — title and URL, no typing |
| `kick …` in the address bar | Capture without touching the page at all |
| Right-click a selection | **Kick this into KICKOFF** — selection + source link |
| Open a new tab | The pitch: your goal, your ball, and the daily review live there |
| `Ctrl/Cmd + Shift + G` | Show / hide the goal manually |
| Type `#work buy milk` | Tags parse straight out of the text — chips appear in the tray |
| Drag the ball | Kick it — swipe for power and curl, poke to nudge |
| **Keep** | Boots it into the goal, with a cheer and confetti |
| **Done** | Flicks it across the screen at speed; it bursts into vapour |
| Click the puck | Opens the tray of everything you've kept |
| `↑↓←→` / `⏎` in the tray | Move between spheres, Enter to read, Backspace to delete |
| Click a sphere | Unwraps it into a card — the text is **editable in place** |
| **Later…** on a card | Park it to resurface in 1 / 3 / 7 / 30 days |
| **Recap** (tray bar) | Stats: kept, finished this week, streak, oldest waiting |
| Tray `⋯` | Copy all as markdown, or Clear all (with undo) |

Drag the goal to any edge — it always turns its back to the screen edge. The
first page you open each day offers a **Daily Kickoff**: up to three parked
thoughts, brought back for a decision.

**A thought parked with "Later…" notifies you when it's due** — *"⚽ back on
the pitch"* — and clicking the notification opens a new tab, where it's waiting
in the goal. Nothing is sent anywhere; the alarm and the notification are both
local.

**Heads up:** the extension replaces your New Tab page with the pitch. That's
deliberate — the review loop meets you at the moment you're already switching
context — but if you'd rather keep your usual new tab, delete the
`chrome_url_overrides` block from `manifest.json` and reload the extension.

## Development

```bash
npm run dev        # standalone page at localhost:5173
npm test           # run the suite
npm run test:watch # watch mode
npm run build:ext  # bundle the extension (also refreshes the demo copy)
npm run build      # build the standalone site to dist/
```

`demo.html` runs the full overlay in an ordinary page with `chrome.storage`
mocked, which is far faster to iterate on than reloading the extension every
time. It loads the built bundle, so run `npm run build:ext` first.

## How it's built

Vanilla JS and Vite. No framework, no runtime dependencies — the shipped bundle
is one self-contained file.

```
src/main.js              the engine: physics, phases, input, rendering
src/confetti.js          particle system (celebration + dissolve)
extension/src/
  overlay-entry.js       content script — Shadow DOM host, styles, mounting
  brain-dump.js          input pill, shortcuts, page/selection capture
  shelf.js               the goal, tray, search, export, Daily Kickoff
  unwrap.js              sphere ↔ card cross-transition
  storage.js             chrome.storage.local wrapper
test/                    vitest, jsdom
```

**One engine, two surfaces.** `startKickoff({ root, overlay, mentalCache })`
runs both the standalone page and the extension. All DOM lookups are scoped to
`root`, so the same code mounts into `document` or into a shadow root without
knowing which.

**Shadow DOM.** The overlay runs on `<all_urls>`, so isolation has to work both
ways: the host page's CSS can't reach our ball, and ours can't leak into their
layout.

**Real physics, not tweens.** The ball is an under-damped spring
(`ω = 5.6, ζ = 0.34`) with drag, spin and Magnus curl. The same spring drives
the stored spheres seeking their slots in the tray, which is why the tray feels
related to the ball rather than like a different app.

**`window.__k`** exposes a synchronous step hook and a monotonic sim clock.
Background tabs throttle `requestAnimationFrame` to roughly 1.5fps, which makes
wall-clock verification of a real-time sim useless — the tests drive the
simulation by hand instead.

## Testing

```bash
npm test
```

Covers the store handoff (the moment a thought stops being physics and becomes
data), the persistence contract, and activation state.

The interesting cases are regressions for two real bugs, both silent data loss:

- **Interrupted store.** Hitting Keep and then dumping another thought inside
  the ~0.6s store animation destroyed the first one — `activate()` reset the
  phase and overwrote the text, so the handoff never ran. No error, no trace.
- **Dropped URL.** `saveThoughts` persisted only `{id, text, createdAt}`, so a
  page captured with `Ctrl+Shift+S` came back after a reload with its title
  intact and its link gone.

## Deliberately not built

**`chrome.storage.sync`.** It caps at 8KB per item — roughly 25–40 thoughts —
and syncing the array as one blob makes every write last-write-wins, so two
devices editing between syncs silently lose one side's thoughts. A tool for not
losing your thoughts shouldn't ship that. `storage.js` is a single swappable
abstraction, so a per-item sync with proper merging can be added later without
touching anything else.

**Mobile.** Chrome on iOS, iPadOS and Android has no extension runtime at all,
so this cannot run there. The layout and input are responsive and touch-capable
anyway (the ball tracks a finger and returns to roam on lift, controls get 44px
targets), which pays off in narrow and split-screen windows — and would carry
over if the engine were ever shipped as a standalone web app.

## License

MIT
