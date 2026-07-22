// Backup/restore — step 9's final shape. Live sync was rejected for silent
// data loss; these tests hold restore to the standard that justified that
// choice: restoring can only ever ADD, never clobber, never delete.

import { describe, expect, it } from "vitest";
import { serializeBackup, mergeBackup } from "../extension/src/shelf.js";

const T = (id, text, extra = {}) => ({ id, text, url: "", createdAt: 1000, snoozeUntil: 0, ...extra });

describe("serializeBackup", () => {
  it("round-trips through mergeBackup losslessly", () => {
    const thoughts = [T("a", "alpha", { url: "https://x.dev", snoozeUntil: 99 })];
    const raw = serializeBackup(thoughts, [111, 222]);
    const merged = mergeBackup([], [], raw);
    expect(merged.thoughts).toEqual(thoughts);
    expect(merged.finished).toEqual([111, 222]);
    expect(merged.added).toBe(1);
  });

  it("stamps the file so foreign JSON can be recognised", () => {
    const data = JSON.parse(serializeBackup([], []));
    expect(data.app).toBe("kickoff-mental-cache");
    expect(data.version).toBe(1);
    expect(data.exportedAt).toMatch(/^\d{4}-/);
  });
});

describe("mergeBackup", () => {
  it("adds only thoughts that aren't already present", () => {
    const current = [T("a", "already here")];
    const raw = serializeBackup([T("a", "STALE COPY"), T("b", "new one")], []);
    const merged = mergeBackup(current, [], raw);
    expect(merged.added).toBe(1);
    expect(merged.thoughts.map((t) => t.text)).toEqual(["already here", "new one"]);
  });

  it("never deletes or overwrites the current cache", () => {
    const current = [T("a", "keep me"), T("b", "me too")];
    const merged = mergeBackup(current, [5], serializeBackup([], []));
    expect(merged.thoughts).toEqual(current);
    expect(merged.finished).toContain(5);
    expect(merged.added).toBe(0);
  });

  it("unions finish history without duplicates, oldest first", () => {
    const merged = mergeBackup([], [300, 100], serializeBackup([], [200, 300]));
    expect(merged.finished).toEqual([100, 200, 300]);
  });

  it("rejects files that aren't KICKOFF backups", () => {
    expect(() => mergeBackup([], [], '{"some":"other json"}')).toThrow();
    expect(() => mergeBackup([], [], "not json at all")).toThrow();
  });

  it("skips malformed entries instead of importing garbage", () => {
    const raw = JSON.stringify({
      app: "kickoff-mental-cache", version: 1,
      thoughts: [T("ok", "fine"), { id: 42, text: "bad id" }, { id: "x" }, { id: "y", text: "   " }],
      finished: [123, "not-a-timestamp"],
    });
    const merged = mergeBackup([], [], raw);
    expect(merged.thoughts.map((t) => t.id)).toEqual(["ok"]);
    expect(merged.finished).toEqual([123]);
  });
});
