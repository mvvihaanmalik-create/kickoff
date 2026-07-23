// Packages the extension into a zip people can download and load directly.
//
// The point is that a non-technical visitor should never need Node, npm, or a
// build step: they download one file, unzip it, and load the folder. So the zip
// contains only what Chrome actually needs — the manifest and the built bundle,
// not src/ or the toolchain.
//
// Uses PowerShell's Compress-Archive on Windows and `zip` elsewhere, so there's
// no archiver dependency for a job the OS already does.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const staging = path.join(root, "dist-extension");
const out = path.join(root, "kickoff-extension.zip");

const bundle = path.join(root, "extension", "content.js");
if (!fs.existsSync(bundle)) {
  console.error("extension/content.js is missing — run `npm run build:ext` first.");
  process.exit(1);
}

fs.rmSync(staging, { recursive: true, force: true });
fs.rmSync(out, { force: true });
fs.mkdirSync(staging, { recursive: true });

for (const file of ["manifest.json", "content.js", "background.js"]) {
  fs.copyFileSync(path.join(root, "extension", file), path.join(staging, file));
}
fs.mkdirSync(path.join(staging, "icons"));
for (const icon of fs.readdirSync(path.join(root, "extension", "icons"))) {
  fs.copyFileSync(path.join(root, "extension", "icons", icon), path.join(staging, "icons", icon));
}

if (process.platform === "win32") {
  execFileSync("powershell", [
    "-NoProfile", "-Command",
    `Compress-Archive -Path '${staging}\\*' -DestinationPath '${out}' -Force`,
  ], { stdio: "inherit" });
} else {
  execFileSync("zip", ["-r", "-q", out, "."], { cwd: staging, stdio: "inherit" });
}

fs.rmSync(staging, { recursive: true, force: true });

const kb = (fs.statSync(out).size / 1024).toFixed(0);
console.log(`kickoff-extension.zip  ${kb} kB  — attach this to a GitHub Release.`);
