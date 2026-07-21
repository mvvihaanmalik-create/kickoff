import { defineConfig } from "vite";

// Builds the content script as a single self-contained IIFE (no ES imports),
// bundling the shared engine + overlay entry. Output overwrites extension/
// content.js, which the MV3 manifest loads. manifest.json/src are preserved.
export default defineConfig({
  // No public/ copy: outDir is extension/, so Vite would mirror public/ into the
  // shipped extension — which put a stale duplicate of the bundle next to the
  // real one and silently regenerated it every build.
  publicDir: false,
  build: {
    outDir: "extension",
    emptyOutDir: false,
    minify: false, // keep readable while iterating; can minify for release
    lib: {
      entry: "extension/src/overlay-entry.js",
      formats: ["iife"],
      name: "KickoffOverlay",
      fileName: () => "content.js",
    },
  },
});
