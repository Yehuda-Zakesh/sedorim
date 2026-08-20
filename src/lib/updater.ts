// Version checks and in-app installation.
//
// Versions are whole numbers: this build is "גרסה 1", the next release is 2.
// package.json still carries a semver string because npm insists on one, but
// the major is the only part that means anything — see APP_VERSION in
// src/components/app-shell.tsx and scripts/set-version.mjs, which stamps the
// number into package.json, both tauri.conf.json files and the three
// Cargo.toml files at release time.
//
// "Update" used to mean "open the download page in a browser and good luck".
// It now downloads the installer and runs it (Rust: install_update, see
// src-tauri/core/src/updater.rs); the installer closes the app, replaces it and
// starts it again.
import { useEffect, useState } from "react";
import { APP_VERSION } from "@/components/app-shell";
import { invoke, isDesktop } from "./tauri";
import { logProblem } from "./diagnostics";

const REPO_KEY = "tracker.updater.repo.v1";
const SKIP_KEY = "tracker.updater.skipVersion.v1";
const LAST_CHECK_KEY = "tracker.updater.lastCheck.v1";

/**
 * The app's own repository, so update checks work out of the box.
 *
 * Clearing the field in Settings stores an empty string, which is an explicit
 * "off" and stops every network request — that is the only state in which the
 * app talks to nothing at all.
 */
export const DEFAULT_REPO = "Yehuda-Zakesh/sedorim";

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

export function getUpdateRepo(): string {
  if (typeof window === "undefined") return "";
  // A stored empty string is an explicit "off" and must not fall back to the
  // default, so only an entirely unset key uses DEFAULT_REPO.
  const stored = localStorage.getItem(REPO_KEY);
  return stored === null ? DEFAULT_REPO : stored;
}
export function setUpdateRepo(repo: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(REPO_KEY, repo.trim());
}
export function getSkippedVersion(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(SKIP_KEY) || "";
}
export function skipVersion(v: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(SKIP_KEY, v);
}
export function clearSkip() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(SKIP_KEY);
}

function normalize(v: string): number[] {
  return v.replace(/^v/i, "").split(/[.\-+]/).map((p) => {
    const n = parseInt(p, 10);
    return isNaN(n) ? 0 : n;
  });
}
export function isVersionNewer(latest: string, current: string): boolean {
  const a = normalize(latest), b = normalize(current);
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const x = a[i] ?? 0, y = b[i] ?? 0;
    if (x > y) return true;
    if (x < y) return false;
  }
  return false;
}

/** The installer asset, which is the only thing worth downloading. */
export function pickInstaller(release: GithubRelease): string | null {
  const assets = release.assets ?? [];
  const setup = assets.find((a) => /setup.*\.exe$/i.test(a.name)) ?? assets.find((a) => /\.exe$/i.test(a.name));
  return setup ? setup.browser_download_url : null;
}

export async function checkForUpdate(repoOverride?: string): Promise<UpdateInfo | null> {
  const repo = (repoOverride ?? getUpdateRepo()).trim();
  if (!repo || !repo.includes("/")) return null;
  const url = `https://api.github.com/repos/${repo}/releases/latest`;
  const res = await fetch(url, { headers: { Accept: "application/vnd.github+json" } });
  if (!res.ok) throw new Error(`GitHub API ${res.status}`);
  const release = (await res.json()) as GithubRelease;
  if (typeof window !== "undefined") {
    localStorage.setItem(LAST_CHECK_KEY, new Date().toISOString());
  }
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

export function getLastCheck(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(LAST_CHECK_KEY) || "";
}

/** Background auto-check hook — runs once per day, prompts via state. */
export function useAutoUpdateCheck() {
  const [update, setUpdate] = useState<UpdateInfo | null>(null);

  useEffect(() => {
    const repo = getUpdateRepo();
    if (!repo) return;
    const last = getLastCheck();
    if (last) {
      const age = Date.now() - new Date(last).getTime();
      if (age < 12 * 60 * 60 * 1000) return; // check at most twice a day
    }
    const t = setTimeout(() => {
      checkForUpdate().then((info) => {
        if (info?.isNewer && info.latest !== getSkippedVersion()) setUpdate(info);
      }).catch(() => {/* offline is not worth a message */});
    }, 3000);
    return () => clearTimeout(t);
  }, []);

  return { update, dismiss: () => setUpdate(null) };
}
