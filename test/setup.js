// jsdom gaps the engine touches. These are environment shims, not behaviour —
// the engine uses matchMedia for prefers-reduced-motion and rAF for its loop
// (tests drive the sim synchronously instead, via the step hook).

if (!window.matchMedia) {
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  });
}

if (!window.requestAnimationFrame) {
  window.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 0);
  window.cancelAnimationFrame = (id) => clearTimeout(id);
}
