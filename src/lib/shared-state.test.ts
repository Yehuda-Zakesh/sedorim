// sharedValue's synchronous half: how a value is seeded for the first paint,
// what `set` does, and how the localStorage mirror behaves. Hydration and the
// cross-window poll need a `window`, and live in shared-state.sync.test.ts.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const MIRROR_PREFIX = "sedorim.mirror.";
const DEV_STORE_KEY = "sedorim.devStore.v1";

class MemoryStorage {
  private map = new Map<string, string>();
  failWrites = false;
  get length() {
    return this.map.size;
  }
  getItem(key: string) {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  setItem(key: string, value: string) {
    if (this.failWrites) throw new Error("QuotaExceededError");
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

/** Fresh module registry each time, so `slots` and the hydration flag reset. */
async function reload() {
  vi.resetModules();
  sharedState = await import("./shared-state");
}

beforeEach(async () => {
  storage = new MemoryStorage();
  vi.stubGlobal("localStorage", storage);
  await reload();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const stringValue = (over: Partial<Parameters<typeof sharedState.sharedValue<string>>[0]> = {}) =>
  sharedState.sharedValue<string>({
    key: "theme",
    fallback: "system",
    parse: (r) => (typeof r === "string" ? r : "system"),
    ...over,
  });

// ============================================================================
// Seeding
// ============================================================================

describe("seeding the first value", () => {
  it("uses the fallback when there is nothing to seed from", () => {
    expect(stringValue().get()).toBe("system");
  });

  it("seeds from this window's mirror", () => {
    storage.setItem(`${MIRROR_PREFIX}theme`, JSON.stringify("dark"));
    expect(stringValue().get()).toBe("dark");
  });

  it("seeds from a pre-1.1 localStorage key when there is no mirror", () => {
    storage.setItem("tracker.theme", JSON.stringify("light"));
    expect(stringValue({ legacyKey: "tracker.theme" }).get()).toBe("light");
  });

  it("prefers the mirror over the legacy key", () => {
    storage.setItem(`${MIRROR_PREFIX}theme`, JSON.stringify("dark"));
    storage.setItem("tracker.theme", JSON.stringify("light"));
    expect(stringValue({ legacyKey: "tracker.theme" }).get()).toBe("dark");
  });

  it("hands a bare-scalar legacy value over as JSON, not as the raw string", () => {
    // The onboarding flag was written as the bare string "1". That *is* valid
    // JSON, so JSON.parse never throws and the value arrives as the number 1 —
    // which is why settings-store's parse has to accept 1 as well as "1".
    storage.setItem("tracker.onboarded.v1", "1");
    const seen: unknown[] = [];
    sharedState.sharedValue<boolean>({
      key: "onboarded",
      legacyKey: "tracker.onboarded.v1",
      fallback: false,
      parse: (raw) => {
        seen.push(raw);
        return raw === true || raw === "1" || raw === 1;
      },
    });
    expect(seen).toEqual([1]);
  });

  it("falls back to the raw string when the legacy value is not valid JSON", () => {
    storage.setItem("tracker.theme", "dark");
    expect(stringValue({ legacyKey: "tracker.theme" }).get()).toBe("dark");
  });

  it("runs the seed through parse rather than trusting it", () => {
    storage.setItem(`${MIRROR_PREFIX}theme`, JSON.stringify({ nonsense: true }));
    expect(stringValue().get()).toBe("system");
  });

  it("falls back when the mirror holds unparseable text", () => {
    storage.setItem(`${MIRROR_PREFIX}theme`, "{not json");
    expect(stringValue().get()).toBe("system");
  });

  it("treats a mirrored null as absent and reaches for the fallback", () => {
    // The seed is picked with `??`, which counts null as nothing. Harmless as
    // things stand — none of the shared keys (settings, theme, onboarded,
    // audit, snapshots, lastAutoBackupAt) is legitimately null — but it would
    // matter for a key whose null is meaningful.
    storage.setItem(`${MIRROR_PREFIX}theme`, "null");
    const value = sharedState.sharedValue<string | null>({
      key: "theme",
      fallback: "system",
      parse: (raw) => (raw === null ? null : "system"),
    });
    expect(value.get()).toBe("system");
  });

  it("does not call parse at all when there is nothing to seed from", () => {
    const parse = vi.fn(() => "x");
    sharedState.sharedValue<string>({ key: "theme", fallback: "system", parse });
    expect(parse).not.toHaveBeenCalled();
  });

  it("survives localStorage throwing on read", () => {
    vi.spyOn(storage, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    expect(stringValue().get()).toBe("system");
  });
});

// ============================================================================
// set / get
// ============================================================================

describe("set", () => {
  it("makes the new value readable straight away", () => {
    const value = stringValue();
    value.set("dark");
    expect(value.get()).toBe("dark");
  });

  it("writes the mirror so the next launch paints correctly", () => {
    stringValue().set("dark");
    expect(storage.getItem(`${MIRROR_PREFIX}theme`)).toBe(JSON.stringify("dark"));
  });

  it("writes through to the shared store", () => {
    stringValue().set("dark");
    // No Rust side in the test env, so store-bridge takes its dev path — one
    // localStorage key holding the whole store.
    expect(JSON.parse(storage.getItem(DEV_STORE_KEY)!)).toMatchObject({ theme: "dark" });
  });

  it("does not run the value back through parse", () => {
    const parse = vi.fn((raw: unknown) => (typeof raw === "string" ? raw : "system"));
    const value = sharedState.sharedValue<string>({ key: "theme", fallback: "system", parse });
    value.set("dark");
    expect(parse).not.toHaveBeenCalled();
    expect(value.get()).toBe("dark");
  });

  it("notifies onChange with the new value", () => {
    const onChange = vi.fn();
    stringValue({ onChange }).set("dark");
    expect(onChange).toHaveBeenCalledWith("dark");
  });

  it("notifies onChange even when the value has not really changed", () => {
    const onChange = vi.fn();
    const value = stringValue({ onChange });
    value.set("dark");
    value.set("dark");
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("keeps working when the mirror cannot be written", () => {
    const value = stringValue();
    storage.failWrites = true;
    expect(() => value.set("dark")).not.toThrow();
    expect(value.get()).toBe("dark");
  });

  it("survives a failing write-through without throwing at the caller", () => {
    // Both the mirror and the dev store go through the same failing storage;
    // a save failure is meant to be reconciled by the next poll, not surfaced.
    const value = stringValue();
    storage.failWrites = true;
    expect(() => value.set("light")).not.toThrow();
    expect(value.get()).toBe("light");
  });

  it("round-trips objects and arrays", () => {
    const value = sharedState.sharedValue<{ list: number[] }>({
      key: "snapshots",
      fallback: { list: [] },
      parse: (raw) => (raw && typeof raw === "object" ? (raw as { list: number[] }) : { list: [] }),
    });
    value.set({ list: [1, 2, 3] });
    expect(value.get()).toEqual({ list: [1, 2, 3] });
    expect(JSON.parse(storage.getItem(`${MIRROR_PREFIX}snapshots`)!)).toEqual({ list: [1, 2, 3] });
  });

  it("keeps Hebrew text intact", () => {
    const value = stringValue();
    value.set("כולל ערב");
    expect(value.get()).toBe("כולל ערב");
    expect(JSON.parse(storage.getItem(`${MIRROR_PREFIX}theme`)!)).toBe("כולל ערב");
  });
});

describe("independent keys", () => {
  it("do not overwrite each other's mirrors", () => {
    const theme = stringValue();
    const onboarded = sharedState.sharedValue<boolean>({
      key: "onboarded",
      fallback: false,
      parse: (r) => r === true,
    });
    theme.set("dark");
    onboarded.set(true);
    expect(theme.get()).toBe("dark");
    expect(onboarded.get()).toBe(true);
    expect(storage.getItem(`${MIRROR_PREFIX}theme`)).toBe(JSON.stringify("dark"));
    expect(storage.getItem(`${MIRROR_PREFIX}onboarded`)).toBe(JSON.stringify(true));
  });

  it("land in the same shared store object", () => {
    stringValue().set("dark");
    sharedState
      .sharedValue<boolean>({ key: "onboarded", fallback: false, parse: (r) => r === true })
      .set(true);
    expect(JSON.parse(storage.getItem(DEV_STORE_KEY)!)).toMatchObject({
      theme: "dark",
      onboarded: true,
    });
  });
});

describe("the mirror across restarts", () => {
  it("lets a fresh module load paint the last known value", async () => {
    stringValue().set("dark");
    await reload();
    // A brand-new registry, as if the window had just opened — the mirror is
    // the only thing available synchronously.
    expect(stringValue().get()).toBe("dark");
  });
});

// ============================================================================
// isHydrated without a window
// ============================================================================

describe("isHydrated", () => {
  it("stays false when there is no window to sync from", () => {
    stringValue();
    expect(sharedState.isHydrated()).toBe(false);
  });
});
