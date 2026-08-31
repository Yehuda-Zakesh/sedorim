// Version checks and in-app installation.
//
// Versions are whole numbers: this build is "גרסה 1", the next release is 2.
// package.json still carries a semver string because npm insists on one, but
// the major is the only part that means anything — see APP_VERSION in
// src/components/app-shell.tsx and scripts/set-version.mjs, which stamps the
// number into package.json, both tauri.conf.json files and the three
// Cargo.toml files at release time.
//
// The whole mechanism is invisible: there is nothing to configure and nothing
// to press. Every time the app starts it asks GitHub once whether a newer
// release exists, and the only time the user hears about it is the one moment
// it matters — there is a new version, so a dialog asks whether to install it.
// Everything else (the check itself, a failed check, "you are up to date") is
// silent by design.
//
// "Update" used to mean "open the download page in a browser and good luck".
// It now downloads the installer and runs it (Rust: install_update, see
// src-tauri/core/src/updater.rs); the installer closes the app, replaces it and
// starts it again.
import { useEffect, useState } from "react";
import { APP_VERSION } from "@/components/app-shell";
import { invoke, isDesktop } from "./tauri";
import { logProblem } from "./diagnostics";

/**
 * The app's own repository. Fixed on purpose: an update source is not a
 * preference, and a settings field for it only invited someone to break
 * updates by clearing it.
 */
export const UPDATE_REPO = "Yehuda-Zakesh/sedorim";

export type GithubRelease = {
  tag_name: string;
  name: string | null;
  html_url: string;
  body: string | null;
  published_at: string;
  prerelease: boolean;
  assets: Array<{ name: string; browser_download_url: string; size: number }>;
};

export type UpdateInfo = {
  current: string;
  latest: string;
  isNewer: boolean;
  release: GithubRelease;
  /** The installer, when the release carries one. */
  downloadUrl: string | null;
  /** Whether that URL is something install() can actually run. */
  canInstall: boolean;
};

function normalize(v: string): number[] {
  return v
    .replace(/^v/i, "")
    .split(/[.\-+]/)
    .map((p) => {
      const n = parseInt(p, 10);
      return isNaN(n) ? 0 : n;
    });
}
export function isVersionNewer(latest: string, current: string): boolean {
  const a = normalize(latest),
    b = normalize(current);
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const x = a[i] ?? 0,
      y = b[i] ?? 0;
    if (x > y) return true;
    if (x < y) return false;
  }
  return false;
}

/** The installer asset, which is the only thing worth downloading. */
export function pickInstaller(release: GithubRelease): string | null {
  const assets = release.assets ?? [];
  const setup =
    assets.find((a) => /setup.*\.exe$/i.test(a.name)) ?? assets.find((a) => /\.exe$/i.test(a.name));
  return setup ? setup.browser_download_url : null;
}

export async function checkForUpdate(): Promise<UpdateInfo> {
  const url = `https://api.github.com/repos/${UPDATE_REPO}/releases/latest`;
  const res = await fetch(url, { headers: { Accept: "application/vnd.github+json" } });
  if (!res.ok) throw new Error(`GitHub API ${res.status}`);
  const release = (await res.json()) as GithubRelease;
  const installer = pickInstaller(release);
  return {
    current: APP_VERSION,
    latest: release.tag_name,
    isNewer: isVersionNewer(release.tag_name, APP_VERSION),
    release,
    downloadUrl: installer ?? release.html_url,
    // A browser has nothing to install into, and a release with no installer
    // attached leaves nothing to run.
    canInstall: isDesktop && installer !== null,
  };
}

/**
 * Downloads the installer and starts it. The app quits a moment later — the
 * installer is waiting to replace the EXE that is running — so this resolving
 * means "the update is under way", not "the update finished".
 */
export async function installUpdate(url: string): Promise<void> {
  try {
    await invoke<void>("install_update", { url });
  } catch (err) {
    logProblem("התקנת עדכון", err);
    throw err;
  }
}

// Once per launch means once per window, not once per screen: AppShell mounts
// again on every navigation, so what decides whether to check has to outlive
// the component. These two live as long as the window does, which is exactly
// what "every time the program opens" means — closing it and opening it again
// is what asks GitHub again.
let launchCheck: Promise<UpdateInfo | null> | null = null;
let dismissedThisLaunch = false;

function checkOncePerLaunch(): Promise<UpdateInfo | null> {
  // Being offline is not worth a message, so a failed check simply produces
  // nothing — and is not retried until the next launch.
  launchCheck ??= checkForUpdate().catch(() => null);
  return launchCheck;
}

/**
 * The silent check on startup. Says nothing when there is nothing to say, and
 * returns an update only so the caller can put the one question worth asking
 * on screen. Dismissing it is final for this run of the app.
 */
export function useAutoUpdateCheck() {
  const [update, setUpdate] = useState<UpdateInfo | null>(null);

  useEffect(() => {
    if (dismissedThisLaunch) return;
    let alive = true;
    // A few seconds of grace, so the check never competes with the first paint.
    const t = setTimeout(() => {
      void checkOncePerLaunch().then((info) => {
        if (alive && !dismissedThisLaunch && info?.isNewer) setUpdate(info);
      });
    }, 3000);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, []);

  return {
    update,
    dismiss: () => {
      dismissedThisLaunch = true;
      setUpdate(null);
    },
  };
}
