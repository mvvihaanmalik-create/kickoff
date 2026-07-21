// Engine behaviour around the store handoff — the moment a thought stops being
// physics and becomes data. Everything here guards against losing a thought
// mid-flight, which is the failure mode that matters most in a tool whose whole
// promise is "get it out of your head and it'll still be there".

import { beforeEach, describe, expect, it, vi } from "vitest";

// The engine only needs these nodes to mount; #fx is deliberately omitted so it
// skips confetti.init (jsdom has no canvas 2d context).
const FIXTURE = `
  <div id="stage">
    <div id="ball">
      <div id="ball-body"></div>
      <div id="ball-shadow"></div>
      <div id="ball-face"></div>
    </div>
  </div>
`;

let engine;

beforeEach(async () => {
  document.body.innerHTML = FIXTURE;
  vi.resetModules(); // the engine holds module-level state (initialized, ROOT)
  engine = await import("../src/main.js");
});

function mount() {
  return engine.startKickoff({
    root: document,
    overlay: true,
    mentalCache: true,
    radius: 46,
  });
}

// Drive the sim forward deterministically rather than waiting on rAF.
function run(api, frames = 120) {
  for (let i = 0; i < frames; i++) api.__step ? api.__step(1 / 60) : window.__k.step(1 / 60);
}

describe("store handoff", () => {
  it("hands the thought to the shelf when the store completes", async () => {
    const api = mount();
    const stored = [];
    api.setStoreHandler((t) => stored.push(t));

    api.activate({ text: "first thought", id: "t1", x: 100, y: 100 });
    api.keep();
    run(api);

    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ id: "t1", text: "first thought" });
  });

  it("carries the captured url through to the shelf", async () => {
    const api = mount();
    const stored = [];
    api.setStoreHandler((t) => stored.push(t));

    api.activate({ text: "Vitest", id: "t2", url: "https://vitest.dev/", x: 50, y: 50 });
    api.keep();
    run(api);

    expect(stored[0].url).toBe("https://vitest.dev/");
  });

  // Regression: activate() used to reset phase and overwrite text/id even while
  // a store was still in flight, so finishStore() never ran for the previous
  // thought and it vanished with no error. Reachable any time you hit Keep and
  // dump another thought inside the ~0.6s store animation.
  it("does not lose a thought that is still sinking into the goal", async () => {
    const api = mount();
    const stored = [];
    api.setStoreHandler((t) => stored.push(t));

    api.activate({ text: "alpha", id: "a", x: 100, y: 100 });
    api.keep();                                   // still animating…
    api.activate({ text: "beta", id: "b", x: 100, y: 100 }); // …interrupted here
    api.keep();
    run(api);

    expect(stored.map((t) => t.text)).toEqual(["alpha", "beta"]);
  });

  it("survives a burst of rapid captures without dropping any", async () => {
    const api = mount();
    const stored = [];
    api.setStoreHandler((t) => stored.push(t));

    for (let i = 0; i < 5; i++) {
      api.activate({ text: `note ${i}`, id: `n${i}`, x: 100, y: 100 });
      api.keep();
    }
    run(api);

    expect(stored).toHaveLength(5);
    expect(stored.map((t) => t.id)).toEqual(["n0", "n1", "n2", "n3", "n4"]);
  });
});

describe("activation state", () => {
  it("is inactive until a thought arrives, in mental-cache mode", () => {
    const api = mount();
    expect(api.isActive()).toBe(false);
    api.activate({ text: "now visible", id: "v1", x: 10, y: 10 });
    expect(api.isActive()).toBe(true);
  });

  it("reports the current thought", () => {
    const api = mount();
    api.activate({ text: "what am I", id: "c1", x: 10, y: 10 });
    expect(api.currentThought()).toMatchObject({ id: "c1", text: "what am I" });
  });

  it("only allows actions while a thought is in play", () => {
    const api = mount();
    expect(api.canAct()).toBe(false);
    api.activate({ text: "actionable", id: "c2", x: 10, y: 10 });
    expect(api.canAct()).toBe(true);
  });
});

describe("label sizing", () => {
  it("shrinks the font as the thought gets longer", () => {
    const short = engine.labelFontSize("hi");
    const long = engine.labelFontSize("x".repeat(90));
    expect(short).toBeGreaterThan(long);
  });

  it("handles empty and missing text without throwing", () => {
    expect(engine.labelFontSize("")).toBeTypeOf("number");
    expect(engine.labelFontSize(undefined)).toBeTypeOf("number");
  });
});
