// Builds the app and packages it into two Windows EXEs designed to run
// AT THE SAME TIME, sharing the same local data and local server
// (see electron/main.cjs and electron/quick.cjs):
//   - KollelTracker.exe  (full app)
//   - KollelQuick.exe    (quick entry window)
//
// Usage (on Windows, in the project root):
//   npm install
//   npm run package:win
//
// Output lands in release-win\. A RunBoth.bat launcher is placed next to
// both app folders — double-click it to open both windows together.

import { execSync } from "node:child_process";
import { existsSync, rmSync, mkdirSync, cpSync, writeFileSync, renameSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const outDir = path.join(root, "release-win");
const stagingDir = path.join(root, ".package-staging");

const pkg = JSON.parse(
  execSync("node -p \"JSON.stringify(require('./package.json'))\"", { cwd: root }).toString()
);

function run(cmd) {
  console.log(`\n> ${cmd}`);
  execSync(cmd, { cwd: root, stdio: "inherit" });
}

function buildServer() {
  console.log("== Building server bundle (Nitro node-server preset) ==");
  run("npx vite build --config vite.electron.config.ts");

  // Nitro's node-server preset writes to .output/{server,public}. The
  // electron main processes (electron/main.cjs, electron/quick.cjs) look
  // for dist-node/server/index.mjs, so normalize the folder name here.
  const nitroOutput = path.join(root, ".output");
  const distNode = path.join(root, "dist-node");
  if (!existsSync(nitroOutput)) {
    throw new Error(".output not found after build — check the vite build logs above.");
  }
  rmSync(distNode, { recursive: true, force: true });
  renameSync(nitroOutput, distNode);
  console.log(`Server bundle ready at ${distNode}`);
}

function stageApp({ name, mainEntry }) {
  const appStagingDir = path.join(stagingDir, name);
  rmSync(appStagingDir, { recursive: true, force: true });
  mkdirSync(appStagingDir, { recursive: true });

  // Minimal package.json — no runtime npm deps are needed inside the
  // packaged app; Nitro already bundled everything into dist-node.
  writeFileSync(
    path.join(appStagingDir, "package.json"),
    JSON.stringify(
      {
        name: name.toLowerCase(),
        version: pkg.version || "1.0.0",
        private: true,
        main: `electron/${mainEntry}`,
      },
      null,
      2
    )
  );

  cpSync(path.join(root, "electron"), path.join(appStagingDir, "electron"), { recursive: true });
  cpSync(path.join(root, "dist-node"), path.join(appStagingDir, "dist-node"), { recursive: true });

  return appStagingDir;
}

function packageApp({ name, appStagingDir, icon }) {
  console.log(`\n== Packaging ${name}.exe ==`);
  const iconArg = existsSync(icon) ? ` --icon="${icon}"` : "";
  run(
    `npx electron-packager "${appStagingDir}" "${name}" ` +
      `--platform=win32 --arch=x64 --out="${outDir}" --overwrite` +
      iconArg
  );
}

function writeRunBothLauncher() {
  // Launches both EXEs together. main.cjs / quick.cjs already handle the
  // race of both starting near-simultaneously (whichever binds the shared
  // port first "wins"; the other just attaches to it), so a plain
  // double-start here is safe.
  const bat = `@echo off
REM Launches KollelTracker and KollelQuick together.
REM They share data (%APPDATA%\\KollelTracker) and a local port automatically.
cd /d "%~dp0"
start "" "KollelTracker-win32-x64\\KollelTracker.exe"
timeout /t 1 /nobreak >nul
start "" "KollelQuick-win32-x64\\KollelQuick.exe"
`;
  writeFileSync(path.join(outDir, "RunBoth.bat"), bat, "utf8");
}

function main() {
  if (process.platform !== "win32") {
    console.warn(
      "\n⚠  You're not running this on Windows. electron-packager can still " +
        "produce a win32 build from another OS, but the Electron binary " +
        "download requires unrestricted internet access to " +
        "github.com/electron/electron release assets. If that download " +
        "fails, run this script on Windows instead.\n"
    );
  }

  buildServer();

  rmSync(outDir, { recursive: true, force: true });
  rmSync(stagingDir, { recursive: true, force: true });

  const trackerIcon = path.join(root, "build", "tracker-icon.ico");
  const quickIcon = path.join(root, "build", "quick-icon.ico");

  const tracker = stageApp({ name: "KollelTracker", mainEntry: "main.cjs" });
  packageApp({ name: "KollelTracker", appStagingDir: tracker, icon: trackerIcon });

  const quick = stageApp({ name: "KollelQuick", mainEntry: "quick.cjs" });
  packageApp({ name: "KollelQuick", appStagingDir: quick, icon: quickIcon });

  writeRunBothLauncher();

  rmSync(stagingDir, { recursive: true, force: true });

  console.log(
    `\n✔ Done. Find everything under: ${outDir}\n` +
      `  KollelTracker-win32-x64\\KollelTracker.exe\n` +
      `  KollelQuick-win32-x64\\KollelQuick.exe\n` +
      `  RunBoth.bat   <- double-click this to launch both together\n\n` +
      `They share data via %APPDATA%\\KollelTracker and a fixed local port ` +
      `(127.0.0.1:47821). Whichever opens first starts the shared local ` +
      `server; the second one just connects to it. Both can be open at the ` +
      `same time, on the same machine, safely.`
  );
}

main();
