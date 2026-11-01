// Identifies the exact source a build was made from.
//
//   node scripts/source-fingerprint.mjs        prints JSON
//
// The base commit alone does not say which code was built when there are
// changes that are not committed. This adds: whether the tree is clean, and a
// SHA-256 over every tracked or untracked-but-not-ignored file (path + content),
// so two builds from the same fingerprint come from byte-identical sources.
// Generated or output files (the build info stamp itself, release output,
// delivery packages) are left out so building does not change the fingerprint.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const EXCLUDED = [
  /^src\/lib\/build-info\.ts$/,
  /^release-win\//,
  /^delivery[^/]*\//,
  /^dist\//,
  /^src-tauri\/target\//,
  // Cargo rewrites the version lines of our own crates here during the build
  // (after set-version), so hashing it would make the fingerprint move while
  // building. Dependency pins are unaffected and come from Cargo.toml files.
  /^src-tauri\/Cargo\.lock$/,
];

function git(args) {
  return execFileSync("git", args, { cwd: root, maxBuffer: 64 * 1024 * 1024 }).toString("utf8");
}

export function sourceFingerprint() {
  const commit = git(["rev-parse", "HEAD"]).trim();
  const files = git(["ls-files", "-z", "--cached", "--others", "--exclude-standard"])
    .split("\0")
    .filter(Boolean)
    .filter((f) => !EXCLUDED.some((re) => re.test(f)))
    .sort();
  const hash = createHash("sha256");
  let counted = 0;
  for (const f of files) {
    let bytes;
    try {
      bytes = readFileSync(path.join(root, f));
    } catch {
      continue; // deleted in the working tree
    }
    hash.update(f).update("\0").update(createHash("sha256").update(bytes).digest()).update("\n");
    counted++;
  }
  const changed = git(["status", "--porcelain", "--untracked-files=all"])
    .split("\n")
    .filter(Boolean)
    .filter((l) => !EXCLUDED.some((re) => re.test(l.slice(3).replace(/^"|"$/g, ""))));
  return {
    baseCommit: commit,
    baseCommitShort: commit.slice(0, 7),
    uncommittedChanges: changed.length > 0,
    changedPaths: changed.length,
    sourceSha256: hash.digest("hex"),
    filesHashed: counted,
  };
}

/** The label shown in About: the short commit, plus a marker when it is not the whole story. */
export function sourceLabel(fp = sourceFingerprint()) {
  return fp.uncommittedChanges
    ? `${fp.baseCommitShort}+dirty.${fp.sourceSha256.slice(0, 8)}`
    : fp.baseCommitShort;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(sourceFingerprint(), null, 2));
}
