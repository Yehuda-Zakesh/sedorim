// The half of sharedValue that needs a window: the one-off hydration from the
// shared data file, the pre-1.1 legacy migration, and the mtime-gated poll
// that carries the *other* EXE's writes over.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { StoreShape } from "./store-bridge";

const MIRROR_PREFIX = "sedorim.mirror.";
const POLL_MS = 4000;

/** The fake data file the mocked bridge reads and writes. */
const file = {
  store: {} as StoreShape,
  stamp: "0",
  loadFails: false,
  saveFails: false,
  loads: 0,
  stamps: 0,
  saves: [] as Array<{ key: string; value: unknown }>,
};

vi.mock("./store-bridge", () => ({
  loadStore: () => {
    file.loads++;
    return file.loadFails ? Promise.reject(new Error("unreadable")) : Promise.resolve(file.store);
  },
  storeStamp: () => {
    file.stamps++;
    return Promise.resolve(file.stamp);
  },
  saveStoreKey: (key: string, value: unknown) => {
    file.saves.push({ key, value });
    if (file.saveFails) return Promise.reject(new Error("could not write"));
    file.stamp = String(Number(file.stamp) + 1);
    file.store = { ...file.store, [key]: value };
    return Promise.resolve({ ok: true as const, updatedAt: Number(file.stamp) });
  },
  saveStoreKeys: (patch: Record<string, unknown>) => {
    file.store = { ...file.store, ...patch };
    file.stamp = String(Number(file.stamp) + 1);
    return Promise.resolve({ ok: true as const, updatedAt: Number(file.stamp) });
  },
}));

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
let sharedState: typeof import("./shared-state");

/** Lets the hydration promise chain settle without advancing wall-clock time. */
const flush = () => vi.advanceTimersByTimeAsync(0);

async function reload() {
  vi.resetModules();
  sharedState = await import("./shared-state");
}

beforeEach(async () => {
  file.store = {};
  file.stamp = "0";
  file.loadFails = false;
  file.saveFails = false;
  file.loads = 0;
  file.stamps = 0;
  file.saves = [];

  storage = new MemoryStorage();
  vi.stubGlobal("localStorage", storage);
  // Nothing in shared-state touches `window` beyond checking it exists — it is
  // the "are we in a real app?" gate for starting the sync.
  vi.stubGlobal("window", {} as Window & typeof globalThis);
  vi.useFakeTimers();
  await reload();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const themeValue = (over: Partial<Parameters<typeof sharedState.sharedValue<string>>[0]> = {}) =>
  sharedState.sharedValue<string>({
    key: "theme",
    fallback: "system",
    parse: (raw) => (typeof raw === "string" ? raw : "system"),
    ...over,
  });

// ============================================================================
// Hydration
// ============================================================================

describe("hydration", () => {
  it("adopts the value from the shared file", async () => {
    file.store = { theme: "dark" };
    const value = themeValue();
    expect(value.get()).toBe("system"); // seeded, not yet hydrated
    await flush();
    expect(value.get()).toBe("dark");
  });

  it("flips isHydrated once the file has been read", async () => {
    themeValue();
    expect(sharedState.isHydrated()).toBe(false);
    await flush();
    expect(sharedState.isHydrated()).toBe(true);
  });

  it("mirrors what it hydrated, for the next launch's first paint", async () => {
    file.store = { theme: "dark" };
    themeValue();
    await flush();
    expect(storage.getItem(`${MIRROR_PREFIX}theme`)).toBe(JSON.stringify("dark"));
  });

  it("runs onChange with the hydrated value", async () => {
    file.store = { theme: "dark" };
    const onChange = vi.fn();
    themeValue({ onChange });
    await flush();
    expect(onChange).toHaveBeenCalledWith("dark");
  });

  it("leaves the seeded value alone when the file has no value for the key", async () => {
    storage.setItem(`${MIRROR_PREFIX}theme`, JSON.stringify("light"));
    const value = themeValue();
    await flush();
    expect(value.get()).toBe("light");
  });

  it("keeps the seeded value and still finishes when the file cannot be read", async () => {
    file.loadFails = true;
    storage.setItem(`${MIRROR_PREFIX}theme`, JSON.stringify("light"));
    const value = themeValue();
    await flush();
    expect(value.get()).toBe("light");
    // Crucially it does not get stuck un-hydrated, or useNeedsOnboarding would
    // never render anything.
    expect(sharedState.isHydrated()).toBe(true);
  });

  it("reads the file once for all the values registered up front", async () => {
    themeValue();
    sharedState.sharedValue<boolean>({
      key: "onboarded",
      fallback: false,
      parse: (r) => r === true,
    });
    sharedState.sharedValue<number>({
      key: "lastAutoBackupAt",
      fallback: 0,
      parse: (r) => Number(r) || 0,
    });
    await flush();
    expect(file.loads).toBe(1);
  });

  it("hydrates a value registered after the first read on its own", async () => {
    file.store = { theme: "dark", onboarded: true };
    themeValue();
    await flush();
    expect(file.loads).toBe(1);

    // A lazily loaded module registering later — it would otherwise never see
    // the file's value.
    const onboarded = sharedState.sharedValue<boolean>({
      key: "onboarded",
      fallback: false,
      parse: (r) => r === true,
    });
    await flush();
    expect(onboarded.get()).toBe(true);
    expect(file.loads).toBe(2);
  });
});

describe("legacy migration on hydration", () => {
  it("adopts a pre-1.1 localStorage value when the file has nothing yet", async () => {
    storage.setItem("tracker.theme", JSON.stringify("dark"));
    const value = themeValue({ legacyKey: "tracker.theme" });
    await flush();
    expect(value.get()).toBe("dark");
  });

  it("writes the migrated value through to the file", async () => {
    storage.setItem("tracker.theme", JSON.stringify("dark"));
    themeValue({ legacyKey: "tracker.theme" });
    await flush();
    expect(file.saves).toEqual([{ key: "theme", value: "dark" }]);
  });

  it("does not migrate once the file has a value of its own", async () => {
    file.store = { theme: "light" };
    storage.setItem("tracker.theme", JSON.stringify("dark"));
    const value = themeValue({ legacyKey: "tracker.theme" });
    await flush();
    expect(value.get()).toBe("light");
    expect(file.saves).toEqual([]);
  });

  it("does nothing when there is neither a file value nor a legacy key", async () => {
    const value = themeValue({ legacyKey: "tracker.theme" });
    await flush();
    expect(value.get()).toBe("system");
    expect(file.saves).toEqual([]);
  });

  it("leaves the old localStorage key in place as a safety net", async () => {
    storage.setItem("tracker.theme", JSON.stringify("dark"));
    themeValue({ legacyKey: "tracker.theme" });
    await flush();
    expect(storage.getItem("tracker.theme")).toBe(JSON.stringify("dark"));
  });

  it("survives the write-through failing", async () => {
    file.saveFails = true;
    storage.setItem("tracker.theme", JSON.stringify("dark"));
    const value = themeValue({ legacyKey: "tracker.theme" });
    await flush();
    expect(value.get()).toBe("dark");
  });
});

// ============================================================================
// Cross-window poll
// ============================================================================

describe("the cross-window poll", () => {
  it("picks up a change made in the other window", async () => {
    const value = themeValue();
    await flush();

    file.store = { theme: "dark" };
    file.stamp = "99";
    await vi.advanceTimersByTimeAsync(POLL_MS);
    expect(value.get()).toBe("dark");
  });

  it("does not read the file while the stamp is unchanged", async () => {
    themeValue();
    await flush();
    const loadsAfterHydration = file.loads;

    await vi.advanceTimersByTimeAsync(POLL_MS * 3);
    expect(file.stamps).toBeGreaterThan(loadsAfterHydration);
    expect(file.loads).toBe(loadsAfterHydration);
  });

  it("re-reads only when the stamp moves", async () => {
    themeValue();
    await flush();
    const before = file.loads;

    file.stamp = "1";
    await vi.advanceTimersByTimeAsync(POLL_MS);
    expect(file.loads).toBe(before + 1);

    await vi.advanceTimersByTimeAsync(POLL_MS);
    expect(file.loads).toBe(before + 1);
  });

  it("notifies onChange only when the value really changed", async () => {
    file.store = { theme: "dark" };
    const onChange = vi.fn();
    themeValue({ onChange });
    await flush();
    expect(onChange).toHaveBeenCalledTimes(1);

    // A new stamp but identical contents — the file round-trips through
    // serde_json, which reorders keys, so the raw text differs constantly.
    file.stamp = "7";
    await vi.advanceTimersByTimeAsync(POLL_MS);
    expect(onChange).toHaveBeenCalledTimes(1);

    file.store = { theme: "light" };
    file.stamp = "8";
    await vi.advanceTimersByTimeAsync(POLL_MS);
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("leaves a value alone when the file drops its key", async () => {
    file.store = { theme: "dark" };
    const value = themeValue();
    await flush();

    file.store = {};
    file.stamp = "5";
    await vi.advanceTimersByTimeAsync(POLL_MS);
    expect(value.get()).toBe("dark");
  });

  it("keeps polling after a transient read failure", async () => {
    const value = themeValue();
    await flush();

    file.loadFails = true;
    file.stamp = "1";
    await vi.advanceTimersByTimeAsync(POLL_MS);
    expect(value.get()).toBe("system");

    file.loadFails = false;
    file.store = { theme: "dark" };
    file.stamp = "2";
    await vi.advanceTimersByTimeAsync(POLL_MS);
    expect(value.get()).toBe("dark");
  });

  it("runs one poll covering every registered value", async () => {
    themeValue();
    const onboarded = sharedState.sharedValue<boolean>({
      key: "onboarded",
      fallback: false,
      parse: (r) => r === true,
    });
    await flush();
    const stampsAfterHydration = file.stamps;

    file.store = { theme: "dark", onboarded: true };
    file.stamp = "42";
    await vi.advanceTimersByTimeAsync(POLL_MS);

    expect(onboarded.get()).toBe(true);
    // One stat call for the whole window, not one per value.
    expect(file.stamps).toBe(stampsAfterHydration + 1);
  });

  it("does not re-run the legacy migration on a later poll", async () => {
    file.store = { theme: "dark" };
    storage.setItem("tracker.theme", JSON.stringify("light"));
    themeValue({ legacyKey: "tracker.theme" });
    await flush();

    file.store = {};
    file.stamp = "3";
    await vi.advanceTimersByTimeAsync(POLL_MS);
    expect(file.saves).toEqual([]);
  });
});

describe("set alongside the poll", () => {
  it("writes through and keeps the local value", async () => {
    const value = themeValue();
    await flush();

    value.set("dark");
    expect(value.get()).toBe("dark");
    expect(file.saves).toEqual([{ key: "theme", value: "dark" }]);
  });

  it("is not undone by the next poll seeing its own write", async () => {
    const value = themeValue();
    await flush();

    value.set("dark");
    await vi.advanceTimersByTimeAsync(POLL_MS);
    expect(value.get()).toBe("dark");
  });

  it("keeps the local value when the write-through fails", async () => {
    file.saveFails = true;
    const value = themeValue();
    await flush();

    expect(() => value.set("dark")).not.toThrow();
    expect(value.get()).toBe("dark");
  });
});
