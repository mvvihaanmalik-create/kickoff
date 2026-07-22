// Persistence contract. These guard the one failure this tool must never have:
// a thought that was captured but comes back wrong (or not at all) after a
// reload. The url case is a real regression that shipped — a page captured with
// Ctrl+Shift+S kept its title but lost its link, so the card's Open button died
// the moment you reloaded the page.

import { beforeEach, describe, expect, it, vi } from "vitest";

// A minimal in-memory stand-in for chrome.storage.local, so these tests exercise
// the same branch the extension actually runs (not the memory fallback).
function installChromeStorage() {
  const store = {};
  globalThis.chrome = {
    storage: {
      local: {
        get: (key, cb) => cb({ [key]: store[key] }),
        set: (obj) => Object.assign(store, obj),
      },
    },
  };
  return store;
}

let storage;

beforeEach(async () => {
  installChromeStorage();
  vi.resetModules();
  storage = await import("../extension/src/storage.js");
});

describe("saveThoughts / loadThoughts", () => {
  it("round-trips id and text", async () => {
    storage.saveThoughts([{ id: "a1", text: "buy milk" }]);
    const back = await storage.loadThoughts();
    expect(back).toHaveLength(1);
    expect(back[0]).toMatchObject({ id: "a1", text: "buy milk" });
  });

  it("preserves the source url of a captured page", async () => {
    storage.saveThoughts([
      { id: "a2", text: "Vitest docs", url: "https://vitest.dev/guide/" },
    ]);
    const back = await storage.loadThoughts();
    // Without this, Ctrl+Shift+S captures the title but the link is gone after
    // a reload, and the thought card's Open button silently does nothing.
    expect(back[0].url).toBe("https://vitest.dev/guide/");
  });

  it("defaults a missing url to empty rather than undefined", async () => {
    storage.saveThoughts([{ id: "a3", text: "typed by hand" }]);
    const back = await storage.loadThoughts();
    expect(back[0].url).toBe("");
  });

  it("preserves a resurface schedule (snoozeUntil)", async () => {
    const when = Date.now() + 7 * 86400000;
    storage.saveThoughts([{ id: "a6", text: "call back next week", snoozeUntil: when }]);
    const back = await storage.loadThoughts();
    // Without this, "Later → in a week" appears to work (the sphere hides) but
    // the schedule is gone after a reload, so the thought never comes back.
    expect(back[0].snoozeUntil).toBe(when);
  });

  it("defaults a missing snoozeUntil to 0", async () => {
    storage.saveThoughts([{ id: "a7", text: "not parked" }]);
    const back = await storage.loadThoughts();
    expect(back[0].snoozeUntil).toBe(0);
  });

  it("stamps createdAt when absent and keeps it when given", async () => {
    storage.saveThoughts([{ id: "a4", text: "x" }, { id: "a5", text: "y", createdAt: 123 }]);
    const back = await storage.loadThoughts();
    expect(back[0].createdAt).toBeTypeOf("number");
    expect(back[1].createdAt).toBe(123);
  });

  it("returns an empty list before anything is stored", async () => {
    expect(await storage.loadThoughts()).toEqual([]);
  });
});

describe("fallback outside the extension", () => {
  it("still round-trips when chrome.storage is absent", async () => {
    delete globalThis.chrome;
    vi.resetModules();
    const mem = await import("../extension/src/storage.js");
    expect(mem.usingChromeStorage()).toBe(false);
    mem.saveThoughts([{ id: "m1", text: "in memory", url: "https://example.com" }]);
    const back = await mem.loadThoughts();
    expect(back[0]).toMatchObject({ text: "in memory", url: "https://example.com" });
  });
});
