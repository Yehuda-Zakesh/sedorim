// Stamps a release number across every manifest that carries one.
//
//   node scripts/set-version.mjs 3
//
// Versions are whole numbers — this is "גרסה 3" — but npm, Tauri and Cargo all
// insist on semver, so the number becomes the major and the rest stays at
// zero: 3.0.0. The app displays only the major (see APP_VERSION in
// src/components/app-shell.tsx), which is why the other two digits never have
// to mean anything.
//
// The release workflow computes the number from the newest `vN` tag and calls
// this before building; nothing is committed back, so a release never pushes
// to main and never re-triggers itself.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const raw = process.argv[2];
if (!/^\d+$/.test(raw ?? "")) {
  console.error(
    "usage: node scripts/set-version.mjs <whole number>\n  e.g. node scripts/set-version.mjs 3",
  );
  process.exit(1);
}
const major = Number(raw);
if (major < 1) {
  console.error("The first version is 1; there is no version 0.");
  process.exit(1);
}
const semver = `${major}.0.0`;

/** package.json / tauri.conf.json — a JSON "version" field. */
function stampJson(relative) {
  const file = path.join(root, relative);
  const json = JSON.parse(readFileSync(file, "utf8"));
  json.version = semver;
  writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`, "utf8");
  console.log(`  ${relative} → ${semver}`);
}

/** Cargo.toml — the first `version = "..."` under [package]. */
function stampCargo(relative) {
  const file = path.join(root, relative);
  const text = readFileSync(file, "utf8");
  let replaced = false;
  const out = text.replace(/^version = "[^"]*"$/m, () => {
    replaced = true;
    return `version = "${semver}"`;
  });
  if (!replaced) throw new Error(`no version line found in ${relative}`);
  writeFileSync(file, out, "utf8");
  console.log(`  ${relative} → ${semver}`);
}

console.log(`Stamping version ${major} (${semver}):`);
stampJson("package.json");
stampJson("src-tauri/full/tauri.conf.json");
stampJson("src-tauri/quick/tauri.conf.json");
stampCargo("src-tauri/core/Cargo.toml");
stampCargo("src-tauri/full/Cargo.toml");
stampCargo("src-tauri/quick/Cargo.toml");
console.log(`Done — this build is גרסה ${major}.`);
