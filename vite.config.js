import { defineConfig } from "vite";

// Single static page. Fixed dev port so the preview launch config is stable.
//
// `base` matters for GitHub Pages: the site is served from
// https://<user>.github.io/<repo>/, so asset URLs must be prefixed with the repo
// name or every script 404s. The deploy workflow sets KICKOFF_BASE; locally it
// stays "/" so dev and `vite preview` behave normally.
export default defineConfig({
  base: process.env.KICKOFF_BASE || "/",
  server: { port: 5180, strictPort: true },
  build: {
    target: "es2020",
    // Ship both pages: index.html is the standalone football toy, demo.html is
    // the mental cache running for real (with chrome.storage mocked), so people
    // can try the actual product without installing anything.
    rollupOptions: {
      input: {
        index: "index.html",
        demo: "demo.html",
      },
    },
  },
});
