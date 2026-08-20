// Builds release-win\SederPlusSetup.exe from the two EXEs already in
// release-win.
//
//   npm run installer      (after npm run exe)
//   npm run dist           (both, in order)
//
// Needs Inno Setup 6. It is pre-installed on GitHub's windows runners; locally,
// `winget install JRSoftware.InnoSetup` puts it where this looks.

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const require = createRequire(import.meta.url);
const { version } = require(path.join(root, "package.json"));
const versionLabel = version.split(".")[0];

const outDir = path.join(root, "release-win");
const script = path.join(root, "installer", "SederPlus.iss");
const REQUIRED = ["SederPlus.exe", "SederPlusQuick.exe"];

/** Where ISCC.exe lives, in the order worth trying. */
const CANDIDATES = [
  process.env.ISCC,
  "C:\\Program Files (x86)\\Inno Setup 6\\ISCC.exe",
  "C:\\Program Files\\Inno Setup 6\\ISCC.exe",
].filter(Boolean);

function findIscc() {
  for (const candidate of CANDIDATES) {
    if (existsSync(candidate)) return candidate;
  }
  // On PATH is fine too; let the spawn fail with its own message if not.
  return "ISCC.exe";
}

function main() {
  for (const exe of REQUIRED) {
    if (!existsSync(path.join(outDir, exe))) {
      throw new Error(
        `${exe} is missing from ${outDir}. Run \`npm run exe\` first — the installer only packages what is already built.`,
      );
    }
  }

  const iscc = findIscc();
  console.log(`\n> ${iscc} ${path.relative(root, script)}  (version ${versionLabel})`);
  execFileSync(
    iscc,
    [
      `/DAppVersion=${version}`,
      `/DVersionLabel=${versionLabel}`,
      `/DSourceDir=${outDir}`,
      `/DOutputDir=${outDir}`,
      script,
    ],
    { cwd: root, stdio: "inherit" },
  );

  const setup = path.join(outDir, "SederPlusSetup.exe");
  if (!existsSync(setup)) throw new Error(`Inno Setup reported success but ${setup} is not there.`);

  console.log(
    `\n✔ ${path.relative(root, setup)} — גרסה ${versionLabel}\n\n` +
      `One file, both programs. It installs to %LOCALAPPDATA%\\SederPlus with no\n` +
      `administrator prompt, puts a shortcut to each program on the desktop, and\n` +
      `accepts /SILENT — which is how the app updates itself.`,
  );
}

main();
