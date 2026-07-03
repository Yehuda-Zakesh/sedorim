import { useEffect, useState } from "react";
import { APP_VERSION } from "@/components/app-shell";

const REPO_KEY = "tracker.updater.repo.v1";
const SKIP_KEY = "tracker.updater.skipVersion.v1";
const LAST_CHECK_KEY = "tracker.updater.lastCheck.v1";

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
  downloadUrl: string | null;
};

export function getUpdateRepo(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(REPO_KEY) || "";
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

function pickAsset(release: GithubRelease): string | null {
  if (!release.assets?.length) return release.html_url;
  const exe = release.assets.find((a) => /\.exe$/i.test(a.name));
  if (exe) return exe.browser_download_url;
  const zip = release.assets.find((a) => /\.zip$/i.test(a.name));
  if (zip) return zip.browser_download_url;
  return release.assets[0].browser_download_url;
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
  return {
    current: APP_VERSION,
    latest: release.tag_name,
    isNewer: isVersionNewer(release.tag_name, APP_VERSION),
    release,
    downloadUrl: pickAsset(release),
  };
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
      }).catch(() => {/* silent */});
    }, 3000);
    return () => clearTimeout(t);
  }, []);

  return { update, dismiss: () => setUpdate(null) };
}