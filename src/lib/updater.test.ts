import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// APP_VERSION lives in a .tsx component module; stubbed so this test does not
// drag the whole app shell (and React) in behind it.
vi.mock("@/components/app-shell", () => ({ APP_VERSION: "1.0.3" }));

import {
  isVersionNewer,
  DEFAULT_REPO,
  getUpdateRepo,
  setUpdateRepo,
  getSkippedVersion,
  skipVersion,
  clearSkip,
  checkForUpdate,
  getLastCheck,
  type GithubRelease,
} from "./updater";

class MemoryStorage {
  private map = new Map<string, string>();
  get length() {
    return this.map.size;
  }
  getItem(key: string) {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  setItem(key: string, value: string) {
    this.map.set(key, String(value));
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
  clear() {
    this.map.clear();
  }
  key(i: number) {
    return [...this.map.keys()][i] ?? null;
  }
}

let storage: MemoryStorage;

function release(over: Partial<GithubRelease> = {}): GithubRelease {
  return {
    tag_name: "v1.1.0",
    name: "1.1.0",
    html_url: "https://github.com/acme/sedorim/releases/tag/v1.1.0",
    body: "מה חדש",
    published_at: "2026-07-08T00:00:00Z",
    prerelease: false,
    assets: [],
    ...over,
  };
}

function mockFetch(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  // Typed with fetch's parameters so the assertions below can read back the
  // URL and headers it was called with.
  const fn = vi.fn<(url: string, opts?: { headers?: Record<string, string> }) => Promise<unknown>>(
    async () => ({
      ok: init.ok ?? true,
      status: init.status ?? 200,
      json: async () => body,
    }),
  );
  vi.stubGlobal("fetch", fn);
  return fn;
}

beforeEach(() => {
  storage = new MemoryStorage();
  vi.stubGlobal("localStorage", storage);
  // The module's getters short-circuit to "" without a window.
  vi.stubGlobal("window", {} as Window & typeof globalThis);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

// ============================================================================
// isVersionNewer
// ============================================================================

describe("isVersionNewer", () => {
  it("spots a newer patch, minor or major", () => {
    expect(isVersionNewer("1.0.4", "1.0.3")).toBe(true);
    expect(isVersionNewer("1.1.0", "1.0.3")).toBe(true);
    expect(isVersionNewer("2.0.0", "1.9.9")).toBe(true);
  });

  it("rejects the same version", () => {
    expect(isVersionNewer("1.0.3", "1.0.3")).toBe(false);
  });

  it("rejects an older version", () => {
    expect(isVersionNewer("1.0.2", "1.0.3")).toBe(false);
    expect(isVersionNewer("0.9.9", "1.0.0")).toBe(false);
    expect(isVersionNewer("1.9.9", "2.0.0")).toBe(false);
  });

  it("ignores a leading v, in either case", () => {
    expect(isVersionNewer("v1.0.4", "1.0.3")).toBe(true);
    expect(isVersionNewer("V1.0.4", "1.0.3")).toBe(true);
    expect(isVersionNewer("v1.0.3", "1.0.3")).toBe(false);
    expect(isVersionNewer("1.0.3", "v1.0.3")).toBe(false);
  });

  it("compares numerically, not as text", () => {
    expect(isVersionNewer("1.0.10", "1.0.9")).toBe(true);
    expect(isVersionNewer("1.10.0", "1.9.0")).toBe(true);
    expect(isVersionNewer("1.0.9", "1.0.10")).toBe(false);
  });

  it("treats a missing segment as zero", () => {
    expect(isVersionNewer("1.1", "1.0.3")).toBe(true);
    expect(isVersionNewer("1.0", "1.0.0")).toBe(false);
    expect(isVersionNewer("1.0.0", "1.0")).toBe(false);
    expect(isVersionNewer("2", "1.9.9")).toBe(true);
  });

  it("splits on dashes and pluses too", () => {
    expect(isVersionNewer("1.0.4-beta.1", "1.0.3")).toBe(true);
    expect(isVersionNewer("1.0.3-2", "1.0.3")).toBe(true);
    expect(isVersionNewer("1.0.3+build.5", "1.0.3")).toBe(true);
  });

  it("treats an unparseable segment as zero", () => {
    expect(isVersionNewer("1.0.x", "1.0.0")).toBe(false);
    expect(isVersionNewer("nonsense", "1.0.0")).toBe(false);
    expect(isVersionNewer("1.0.0", "nonsense")).toBe(true);
  });

  it("is never true in both directions", () => {
    const versions = ["1.0.0", "1.0.3", "1.0.10", "1.1", "2", "v1.0.3", "0.9"];
    for (const a of versions) {
      for (const b of versions) {
        expect(isVersionNewer(a, b) && isVersionNewer(b, a), `${a} vs ${b}`).toBe(false);
      }
    }
  });
});

// ============================================================================
// Stored preferences
// ============================================================================

describe("getUpdateRepo / setUpdateRepo", () => {
  it("defaults to the app's own repository, so update checks work out of the box", () => {
    expect(getUpdateRepo()).toBe(DEFAULT_REPO);
    expect(DEFAULT_REPO).toContain("/");
  });

  it("treats a stored empty string as an explicit off, not as unset", () => {
    setUpdateRepo("");
    expect(getUpdateRepo()).toBe("");
  });

  it("returns a stored repo", () => {
    setUpdateRepo("acme/sedorim");
    expect(getUpdateRepo()).toBe("acme/sedorim");
  });

  it("trims what it stores", () => {
    setUpdateRepo("  acme/sedorim \n");
    expect(getUpdateRepo()).toBe("acme/sedorim");
  });

  it("treats a stored empty string as an explicit off", () => {
    setUpdateRepo("acme/sedorim");
    setUpdateRepo("");
    expect(getUpdateRepo()).toBe("");
  });

  it("keeps the setting across a fresh read", () => {
    setUpdateRepo("acme/sedorim");
    expect(getUpdateRepo()).toBe(getUpdateRepo());
  });
});

describe("skipVersion / getSkippedVersion / clearSkip", () => {
  it("starts with nothing skipped", () => {
    expect(getSkippedVersion()).toBe("");
  });

  it("remembers a skipped version", () => {
    skipVersion("v1.1.0");
    expect(getSkippedVersion()).toBe("v1.1.0");
  });

  it("replaces the previous one", () => {
    skipVersion("v1.1.0");
    skipVersion("v1.2.0");
    expect(getSkippedVersion()).toBe("v1.2.0");
  });

  it("clears back to nothing", () => {
    skipVersion("v1.1.0");
    clearSkip();
    expect(getSkippedVersion()).toBe("");
  });

  it("is safe to clear when nothing was skipped", () => {
    expect(() => clearSkip()).not.toThrow();
    expect(getSkippedVersion()).toBe("");
  });
});

// ============================================================================
// checkForUpdate
// ============================================================================

describe("checkForUpdate", () => {
  it("makes no request and returns null once the repo is cleared", async () => {
    setUpdateRepo("");
    const fetchMock = mockFetch(release());
    expect(await checkForUpdate()).toBe(null);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns null for a repo that is not owner/name", async () => {
    const fetchMock = mockFetch(release());
    expect(await checkForUpdate("just-a-name")).toBe(null);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("queries the latest-release endpoint for the configured repo", async () => {
    const fetchMock = mockFetch(release());
    setUpdateRepo("acme/sedorim");
    await checkForUpdate();
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.github.com/repos/acme/sedorim/releases/latest",
      { headers: { Accept: "application/vnd.github+json" } },
    );
  });

  it("lets an explicit repo override the stored one", async () => {
    const fetchMock = mockFetch(release());
    setUpdateRepo("acme/stored");
    await checkForUpdate("other/explicit");
    expect(String(fetchMock.mock.calls[0][0])).toContain("other/explicit");
  });

  it("trims the repo it was handed", async () => {
    const fetchMock = mockFetch(release());
    await checkForUpdate("  acme/sedorim  ");
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      "https://api.github.com/repos/acme/sedorim/releases/latest",
    );
  });

  it("reports a newer release against the app's own version", async () => {
    mockFetch(release({ tag_name: "v1.1.0" }));
    const info = await checkForUpdate("acme/sedorim");
    expect(info).not.toBe(null);
    expect(info!.current).toBe("1.0.3");
    expect(info!.latest).toBe("v1.1.0");
    expect(info!.isNewer).toBe(true);
  });

  it("reports the current release as not newer", async () => {
    mockFetch(release({ tag_name: "v1.0.3" }));
    expect((await checkForUpdate("acme/sedorim"))!.isNewer).toBe(false);
  });

  it("hands back the release itself", async () => {
    const body = release({ body: "תיקוני באגים" });
    mockFetch(body);
    expect((await checkForUpdate("acme/sedorim"))!.release).toEqual(body);
  });

  it("throws with the status when GitHub refuses", async () => {
    mockFetch({}, { ok: false, status: 403 });
    await expect(checkForUpdate("acme/sedorim")).rejects.toThrow("GitHub API 403");
  });

  it("records when it last checked", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 8, 12, 0));
    mockFetch(release());
    expect(getLastCheck()).toBe("");
    await checkForUpdate("acme/sedorim");
    expect(getLastCheck()).toBe(new Date().toISOString());
  });

  it("does not record a check that failed", async () => {
    mockFetch({}, { ok: false, status: 500 });
    await expect(checkForUpdate("acme/sedorim")).rejects.toThrow();
    expect(getLastCheck()).toBe("");
  });

  describe("picking a download", () => {
    it("prefers a .exe asset", async () => {
      mockFetch(
        release({
          assets: [
            { name: "notes.txt", browser_download_url: "https://x/notes.txt", size: 1 },
            { name: "SederPlus.exe", browser_download_url: "https://x/SederPlus.exe", size: 2 },
            { name: "bundle.zip", browser_download_url: "https://x/bundle.zip", size: 3 },
          ],
        }),
      );
      expect((await checkForUpdate("acme/sedorim"))!.downloadUrl).toBe("https://x/SederPlus.exe");
    });

    // Anything that is not an installer is not worth downloading, so a
    // release without one sends the user to the release page instead — and
    // says so, by refusing to offer an in-app install.
    it("offers the release page, not a .zip, when there is no installer", async () => {
      const body = release({
        assets: [
          { name: "notes.txt", browser_download_url: "https://x/notes.txt", size: 1 },
          { name: "bundle.zip", browser_download_url: "https://x/bundle.zip", size: 3 },
        ],
      });
      mockFetch(body);
      const info = (await checkForUpdate("acme/sedorim"))!;
      expect(info.downloadUrl).toBe(body.html_url);
      expect(info.canInstall).toBe(false);
    });

    it("prefers an asset named like a setup over any other exe", async () => {
      mockFetch(
        release({
          assets: [
            { name: "SederPlus.exe", browser_download_url: "https://x/app.exe", size: 2 },
            { name: "SederPlusSetup.exe", browser_download_url: "https://x/setup.exe", size: 3 },
          ],
        }),
      );
      expect((await checkForUpdate("acme/sedorim"))!.downloadUrl).toBe("https://x/setup.exe");
    });

    it("falls back to the release page when there are no assets", async () => {
      const body = release({ assets: [] });
      mockFetch(body);
      expect((await checkForUpdate("acme/sedorim"))!.downloadUrl).toBe(body.html_url);
    });

    it("matches the extension case-insensitively", async () => {
      mockFetch(
        release({
          assets: [{ name: "SederPlus.EXE", browser_download_url: "https://x/up.EXE", size: 2 }],
        }),
      );
      expect((await checkForUpdate("acme/sedorim"))!.downloadUrl).toBe("https://x/up.EXE");
    });

    it("is not fooled by .exe inside the middle of a name", async () => {
      const body = release({
        assets: [
          { name: "readme.exe.txt", browser_download_url: "https://x/readme.exe.txt", size: 1 },
          { name: "real.zip", browser_download_url: "https://x/real.zip", size: 2 },
        ],
      });
      mockFetch(body);
      expect((await checkForUpdate("acme/sedorim"))!.downloadUrl).toBe(body.html_url);
    });
  });
});
