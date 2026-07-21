import { defineConfig } from "vite";

// Builds the content script as a single self-contained IIFE (no ES imports),
// bundling the shared engine + overlay entry. Output overwrites extension/
// content.js, which the MV3 manifest loads. manifest.json/src are preserved.
export default defineConfig({
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
