import { defineConfig } from "vite";

// Single static page. Fixed dev port so the preview launch config is stable.
export default defineConfig({
  server: { port: 5180, strictPort: true },
  build: { target: "es2020" },
});
