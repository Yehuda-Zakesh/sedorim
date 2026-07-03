// Builds the app and packages it into two Windows installers that support
// FULLY AUTOMATIC background updates (electron-updater + GitHub Releases):
//   - KollelTracker  (full app,  electron/main.cjs,  channel "tracker")
//   - KollelQuick    (quick entry, electron/quick.cjs, channel "quick")
//
// Local usage (just builds installers, does not publish anywhere):
//   npm install
//   npm run package:win
//
// CI usage (builds AND publishes a GitHub Release so installed apps can
// auto-update) — set these env vars before running:
//   GH_TOKEN               a token with permission to create releases
//   CI_RELEASE_VERSION     the version to publish, e.g. 1.0.42
// See .github/workflows/build-windows.yml — it sets both automatically.

import { execSync } from "node:child_process";
import { existsSync, rmSync, mkdirSync, cpSync, writeFileSync, renameSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import builder, { Platform } from "electron-builder";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const outDir = path.join(root, "release-win");
const stagingDir = path.join(root, ".package-staging");

const rootPkg = JSON.parse(
  execSync("node -p \"JSON.stringify(require('./package.json'))\"", { cwd: root }).toString()
);
const electronVersion = execSync("node -p \"require('electron/package.json').version\"", {
  cwd: root,
}).toString().trim();

const REPO_OWNER = "Yehuda-Zakesh";
const REPO_NAME = "sedorim";

const isPublishing = Boolean(process.env.GH_TOKEN);
const version = process.env.CI_RELEASE_VERSION || rootPkg.version || "1.0.0";

function run(cmd) {
  console.log(`\n> ${cmd}`);
  execSync(cmd, { cwd: root, stdio: "inherit" });
}

function buildServer() {
  console.log("== Building server bundle (Nitro node-server preset) ==");
  run("npx vite build --config vite.electron.config.ts");

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

  writeFileSync(
    path.join(appStagingDir, "package.json"),
    JSON.stringify(
      {
        name: name.toLowerCase(),
        version,
        private: true,
        description: "KollelTracker — kollel attendance & learning tracker",
        author: "Yehuda Zakesh",
        main: `electron/${mainEntry}`,
        dependencies: {
          "electron-updater": rootPkg.dependencies["electron-updater"],
        },
      },
      null,
      2
    )
  );

  cpSync(path.join(root, "electron"), path.join(appStagingDir, "electron"), { recursive: true });
  cpSync(path.join(root, "dist-node"), path.join(appStagingDir, "dist-node"), { recursive: true });

  cpSync(
    path.join(root, "node_modules", "electron-updater"),
    path.join(appStagingDir, "node_modules", "electron-updater"),
    { recursive: true }
  );
  for (const dep of [
    "builder-util-runtime",
    "lazy-val",
    "fs-extra",
    "js-yaml",
    "semver",
    "lodash.escaperegexp",
    "lodash.isequal",
  ]) {
    const src = path.join(root, "node_modules", dep);
    if (existsSync(src)) {
      cpSync(src, path.join(appStagingDir, "node_modules", dep), { recursive: true });
    }
  }

  return appStagingDir;
}

async function packageApp({ name, appStagingDir, channel, appId }) {
  console.log(`\n== Packaging ${name} (channel: ${channel}) ==`);
  await builder.build({
    projectDir: appStagingDir,
    targets: Platform.WINDOWS.createTarget(),
    // We publish ourselves afterward (see publishRelease) so both apps land
    // on ONE shared GitHub release instead of electron-builder creating a
    // separate draft release per app.
    publish: "never",
    config: {
      appId,
      productName: name,
      electronVersion,
      copyright: `Copyright © ${new Date().getFullYear()} Yehuda Zakesh`,
      directories: {
        output: path.join(outDir, name),
        buildResources: path.join(root, "build"),
      },
      files: ["electron/**/*", "dist-node/**/*", "node_modules/**/*", "package.json"],
      win: {
        target: "nsis",
        icon: path.join(root, "build", "icon.ico"),
      },
      nsis: {
        oneClick: true,
        perMachine: false,
        allowToChangeInstallationDirectory: false,
        artifactName: `${name}-Setup-\${version}.\${ext}`,
      },
      // Still declared so electron-builder embeds app-update.yml into the
      // packaged app — that's what electron-updater reads at runtime to
      // know which repo/channel to check.
      publish: [{ provider: "github", owner: REPO_OWNER, repo: REPO_NAME, channel }],
    },
  });
}

function writeRunBothLauncher() {
  const bat = `@echo off
REM Launches KollelTracker and KollelQuick together.
REM They share data (%APPDATA%\\KollelTracker) and a local port automatically.
start "" "%LOCALAPPDATA%\\Programs\\KollelTracker\\KollelTracker.exe"
timeout /t 1 /nobreak >nul
start "" "%LOCALAPPDATA%\\Programs\\KollelQuick\\KollelQuick.exe"
`;
  writeFileSync(path.join(outDir, "RunBoth.bat"), bat, "utf8");
}

async function ghApi(method, urlPath, body, isUpload = false) {
  const base = isUpload ? "https://uploads.github.com" : "https://api.github.com";
  const res = await fetch(`${base}${urlPath}`, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.GH_TOKEN}`,
      Accept: "application/vnd.github+json",
      ...(isUpload ? { "Content-Type": "application/octet-stream" } : {}),
    },
    body: body ? (isUpload ? body : JSON.stringify(body)) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`GitHub API ${method} ${urlPath} -> ${res.status}: ${text}`);
  }
  return res.status === 204 ? null : res.json();
}

// Publishes both apps' installers + update-feed yml files to ONE shared
// GitHub Release (electron-builder, run per-app, would otherwise create two
// separate draft releases for the same tag — bad, since electron-updater's
// GitHub provider resolves a single repo-wide "latest release").
async function publishRelease() {
  const tag = `v${version}`;
  console.log(`\n== Publishing release ${tag} to github.com/${REPO_OWNER}/${REPO_NAME} ==`);

  const releases = await ghApi("GET", `/repos/${REPO_OWNER}/${REPO_NAME}/releases`);
  let release = releases.find((r) => r.tag_name === tag);
  if (release) {
    console.log(`Reusing existing release id=${release.id}`);
  } else {
    release = await ghApi("POST", `/repos/${REPO_OWNER}/${REPO_NAME}/releases`, {
      tag_name: tag,
      name: version,
      draft: false,
      prerelease: false,
      generate_release_notes: false,
    });
    console.log(`Created release id=${release.id}`);
  }

  if (release.draft) {
    await ghApi("PATCH", `/repos/${REPO_OWNER}/${REPO_NAME}/releases/${release.id}`, {
      draft: false,
    });
  }

  const uploadPatterns = [/\.exe$/i, /\.exe\.blockmap$/i, /^(tracker|quick)\.yml$/i];
  const fsMod = await import("node:fs");
  for (const appName of ["KollelTracker", "KollelQuick"]) {
    const appOutDir = path.join(outDir, appName);
    if (!existsSync(appOutDir)) continue;
    const files = fsMod
      .readdirSync(appOutDir, { withFileTypes: true })
      .filter((e) => e.isFile())
      .map((e) => path.join(appOutDir, e.name));
    for (const filePath of files) {
      const fileName = path.basename(filePath);
      if (!uploadPatterns.some((re) => re.test(fileName))) continue;

      // Remove any pre-existing asset with the same name (re-running a
      // build for the same version should replace, not duplicate/fail).
      const existing = (release.assets || []).find((a) => a.name === fileName);
      if (existing) {
        await ghApi("DELETE", `/repos/${REPO_OWNER}/${REPO_NAME}/releases/assets/${existing.id}`);
      }

      const data = fsMod.readFileSync(filePath);
      console.log(`Uploading ${fileName} (${(data.length / 1e6).toFixed(1)} MB)...`);
      await ghApi(
        "POST",
        `/repos/${REPO_OWNER}/${REPO_NAME}/releases/${release.id}/assets?name=${encodeURIComponent(fileName)}`,
        data,
        true
      );
    }
  }

  console.log(`\n✔ Release ${tag} published: https://github.com/${REPO_OWNER}/${REPO_NAME}/releases/tag/${tag}`);
}

async function main() {
  console.log(
    isPublishing
      ? `Publishing mode: version ${version} will be released to github.com/${REPO_OWNER}/${REPO_NAME}`
      : `Local build mode (no GH_TOKEN set): building installers only, not publishing.`
  );

  if (isPublishing) {
    // Bake the real release version into the built UI (About page, update
    // comparisons) — src/components/app-shell.tsx reads it from package.json.
    run(`npm version --no-git-tag-version --allow-same-version ${version}`);
  }

  buildServer();

  rmSync(outDir, { recursive: true, force: true });
  rmSync(stagingDir, { recursive: true, force: true });

  const tracker = stageApp({ name: "KollelTracker", mainEntry: "main.cjs" });
  await packageApp({
    name: "KollelTracker",
    appStagingDir: tracker,
    channel: "tracker",
    appId: "com.yehudazakesh.kolleltracker",
  });

  const quick = stageApp({ name: "KollelQuick", mainEntry: "quick.cjs" });
  await packageApp({
    name: "KollelQuick",
    appStagingDir: quick,
    channel: "quick",
    appId: "com.yehudazakesh.kollelquick",
  });

  writeRunBothLauncher();

  rmSync(stagingDir, { recursive: true, force: true });

  if (isPublishing) {
    await publishRelease();
  }

  console.log(
    `\n✔ Done. Find the installers under: ${outDir}\n` +
      `  KollelTracker\\KollelTracker-Setup-${version}.exe\n` +
      `  KollelQuick\\KollelQuick-Setup-${version}.exe\n\n` +
      (isPublishing
        ? `Published to GitHub Releases as version ${version}. Installed apps will\n` +
          `find and install this update automatically in the background.\n`
        : `Not published (no GH_TOKEN). Run the installers once each — after that,\n` +
          `future versions built with GH_TOKEN set will update them automatically.\n`)
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
