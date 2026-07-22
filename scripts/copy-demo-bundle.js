// Refresh the demo's copy of the extension bundle after a build.
//
// A real script instead of an inline `node -e`: the inline version broke CI in
// a way that couldn't happen locally — public/ holds only the gitignored
// bundle, so the DIRECTORY is empty in git, git doesn't track empty
// directories, and on a fresh checkout the copy threw ENOENT. mkdir first.

import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
fs.mkdirSync(path.join(root, "public"), { recursive: true });
fs.copyFileSync(
  path.join(root, "extension", "content.js"),
  path.join(root, "public", "kickoff-overlay.js")
);
