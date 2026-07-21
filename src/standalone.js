// Standalone page entry — boots the shared engine against the page DOM.
// (The extension overlay has its own entry that mounts the same engine into an
// injected container; see extension/src/overlay-entry.js.)
import { startKickoff } from "./main.js";
import * as audio from "./audio.js";

function boot() {
  startKickoff();
  window.__audio = audio; // debug accessor — synchronous verification, mirrors window.__k

  // Ambient crowd murmur is a standalone-only touch (the overlay stays quiet
  // except for one-shot kick/goal cues) — started on the first real gesture,
  // the same unlock() the engine's own kicks already require.
  const startAmbienceOnce = () => {
    audio.unlock();
    audio.startAmbient();
    window.removeEventListener("pointerdown", startAmbienceOnce);
  };
  window.addEventListener("pointerdown", startAmbienceOnce, { once: true, passive: true });

  // The one functional (non-decorative) chrome element: a mute toggle. Marked
  // .no-kick in the engine so clicking it doesn't also kick the ball.
  const muteBtn = document.getElementById("mute-btn");
  const muteLabel = document.getElementById("mute-label");
  if (muteBtn) {
    muteBtn.addEventListener("click", () => {
      audio.setMuted(!audio.isMuted());
      const muted = audio.isMuted();
      muteBtn.classList.toggle("is-muted", muted);
      if (muteLabel) muteLabel.textContent = muted ? "muted" : "sound";
    });
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
