// Milestones — the game's currency, spent deliberately. These pin the two
// rules (every 10th finish; a streak reaching 7) and, more importantly, that
// a milestone can never double-fire for the same event.

import { describe, expect, it } from "vitest";
import { milestoneFor, nextMilestone } from "../extension/src/shelf.js";

const DAY = 86400000;
const NOW = Date.parse("2026-07-23T15:00:00Z");
// n finishes, one per day, ending today.
const daily = (n) => Array.from({ length: n }, (_, i) => NOW - (n - 1 - i) * DAY);

describe("milestoneFor", () => {
  it("fires on the 10th finish, and every 10th after", () => {
    const nine = daily(9), ten = daily(10);
    expect(milestoneFor(nine, ten, NOW)).toMatchObject({ kind: "count" });
    expect(milestoneFor(nine, ten, NOW).label).toContain("10");
    const nineteen = daily(19), twenty = daily(20);
    expect(milestoneFor(nineteen, twenty, NOW)).toMatchObject({ kind: "count" });
  });

  it("stays quiet on ordinary finishes", () => {
    expect(milestoneFor(daily(7), daily(8), NOW)).toBeNull();
    expect(milestoneFor([], [NOW], NOW)).toBeNull(); // the 1st is not a milestone
  });

  it("fires when a streak reaches 7, once", () => {
    const six = daily(6);
    const seven = [...six, NOW - 6 * DAY - 1000]; // 7th distinct day joins the run
    const before6 = daily(6), after7 = daily(7);
    const m = milestoneFor(before6, after7, NOW);
    expect(m).toMatchObject({ kind: "streak" });
    // …and an 8th day of the same streak does NOT re-fire the streak milestone.
    expect(milestoneFor(daily(7), daily(8), NOW)).toBeNull();
  });

  it("prefers the streak when both land on one finish", () => {
    // 9 finishes over days -6..-1 (three of them on day -6), streak 6. Today's
    // finish is simultaneously the 10th overall AND the 7th consecutive day.
    const d = (n, off = 0) => NOW - n * DAY - off;
    const base = [d(6, 3000), d(6, 2000), d(6, 1000), d(6), d(5), d(4), d(3), d(2), d(1)];
    const after = [...base, NOW];
    expect(after.length).toBe(10);
    const m = milestoneFor(base, after, NOW);
    expect(m.kind).toBe("streak");
  });

  it("never fires when nothing was added", () => {
    expect(milestoneFor(daily(10), daily(10), NOW)).toBeNull();
  });
});

describe("nextMilestone", () => {
  it("counts toward the streak while one is live", () => {
    expect(nextMilestone(daily(4), NOW)).toContain("3 more day");
  });

  it("counts toward the next 10 otherwise", () => {
    expect(nextMilestone([], NOW)).toBe("10 more to 10 gone for good");
    // Once the 7-day streak is ACHIEVED, the next target is the count again.
    expect(nextMilestone(daily(7), NOW)).toBe("3 more to 10 gone for good");
  });
});
