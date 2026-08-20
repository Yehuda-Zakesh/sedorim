// The `npm run dev` / browser half of the store transport. Outside the EXE
// there is no Rust side, so every call falls back to one localStorage key —
// which is what these tests drive, via an in-memory stand-in installed before
// the module is imported.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { StoreKey, StoreShape } from "./store-bridge";

const DEV_STORE_KEY = "sedorim.devStore.v1";

class MemoryStorage {
  private map = new Map<string, string>();
  /** Flip on to make every write fail the way a full quota does. */
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
let bridge: typeof import("./store-bridge");

/** Whatever is sitting in the single dev key, straight off the fake storage. */
function raw(): StoreShape | null {
  const text = storage.getItem(DEV_STORE_KEY);
  return text === null ? null : JSON.parse(text);
}

beforeEach(async () => {
  storage = new MemoryStorage();
  vi.stubGlobal("localStorage", storage);
  vi.resetModules();
  bridge = await import("./store-bridge");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("loadStore", () => {
  it("returns an empty store when nothing has been written", async () => {
    expect(await bridge.loadStore()).toEqual({});
  });

  it("returns whatever was saved", async () => {
    await bridge.saveStoreKey("seder", [{ id: "a" }]);
    expect((await bridge.loadStore()).seder).toEqual([{ id: "a" }]);
  });

  it("treats unparseable contents as an empty store rather than throwing", async () => {
    storage.setItem(DEV_STORE_KEY, "{not json at all");
    expect(await bridge.loadStore()).toEqual({});
  });

  it("treats a non-object payload as an empty store", async () => {
    for (const junk of ["null", "5", '"a string"', "true"]) {
      storage.setItem(DEV_STORE_KEY, junk);
      expect(await bridge.loadStore(), junk).toEqual({});
    }
  });

  it("survives localStorage itself throwing on read", async () => {
    vi.spyOn(storage, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    expect(await bridge.loadStore()).toEqual({});
  });
});

describe("saveStoreKey", () => {
  it("reports success and the new timestamp", async () => {
    const result = await bridge.saveStoreKey("seder", []);
    expect(result.ok).toBe(true);
    expect(typeof result.updatedAt).toBe("number");
    expect(result.updatedAt).toBeGreaterThan(0);
  });

  it("stamps updatedAt into the stored object", async () => {
    const result = await bridge.saveStoreKey("seder", []);
    expect(raw()!.updatedAt).toBe(result.updatedAt);
  });

  it("leaves the other keys untouched", async () => {
    await bridge.saveStoreKey("seder", ["s"]);
    await bridge.saveStoreKey("learning", ["l"]);
    await bridge.saveStoreKey("seder", ["s2"]);

    const store = await bridge.loadStore();
    expect(store.seder).toEqual(["s2"]);
    expect(store.learning).toEqual(["l"]);
  });

  it("round-trips every key the store knows about", async () => {
    const keys: StoreKey[] = [
      "seder",
      "learning",
      "timer",
      "settings",
      "theme",
      "onboarded",
      "snapshots",
      "lastAutoBackupAt",
    ];
    for (const key of keys) await bridge.saveStoreKey(key, `value-of-${key}`);

    const store = await bridge.loadStore();
    for (const key of keys) expect(store[key], key).toBe(`value-of-${key}`);
  });

  it("stores null without dropping the key", async () => {
    await bridge.saveStoreKey("timer", null);
    const store = await bridge.loadStore();
    expect("timer" in store).toBe(true);
    expect(store.timer).toBe(null);
  });

  it("preserves Hebrew text through the round trip", async () => {
    await bridge.saveStoreKey("settings", { profile: { name: "תלמיד הכולל" } });
    expect(await bridge.loadStore()).toMatchObject({
      settings: { profile: { name: "תלמיד הכולל" } },
    });
  });

  it("preserves nested structures and numbers exactly", async () => {
    const value = { a: [1, 2, { b: -3.5 }], c: { d: [[]] }, e: true };
    await bridge.saveStoreKey("snapshots", value);
    expect((await bridge.loadStore()).snapshots).toEqual(value);
  });

  it("rejects rather than throwing synchronously when the write fails", async () => {
    storage.failWrites = true;
    // The React handlers that trigger saves only ever .catch() — a synchronous
    // throw from localStorage would escape them entirely.
    const promise = bridge.saveStoreKey("seder", []);
    expect(promise).toBeInstanceOf(Promise);
    await expect(promise).rejects.toThrow(/Quota/);
  });
});

describe("saveStoreKeys", () => {
  it("applies several keys in one write with one timestamp", async () => {
    const result = await bridge.saveStoreKeys({ seder: ["s"], learning: ["l"] });
    const store = await bridge.loadStore();
    expect(store.seder).toEqual(["s"]);
    expect(store.learning).toEqual(["l"]);
    expect(store.updatedAt).toBe(result.updatedAt);
  });

  it("never leaves a reader seeing only one of the two keys", async () => {
    // The whole point of the multi-key call: one localStorage.setItem, so
    // there is no moment where seder has landed and learning has not.
    const writes: string[] = [];
    vi.spyOn(storage, "setItem").mockImplementation((key, value) => {
      writes.push(String(value));
    });
    await bridge.saveStoreKeys({ seder: ["s"], learning: ["l"] });
    expect(writes).toHaveLength(1);
    const written = JSON.parse(writes[0]);
    expect(written.seder).toEqual(["s"]);
    expect(written.learning).toEqual(["l"]);
  });

  it("merges over the existing contents", async () => {
    await bridge.saveStoreKeys({ seder: ["s"], theme: "dark" });
    await bridge.saveStoreKeys({ learning: ["l"] });
    expect(await bridge.loadStore()).toMatchObject({
      seder: ["s"],
      theme: "dark",
      learning: ["l"],
    });
  });

  it("accepts an empty patch and still moves the timestamp", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 8, 10, 0));
    await bridge.saveStoreKeys({ seder: [] });
    const first = (await bridge.loadStore()).updatedAt;

    vi.setSystemTime(new Date(2026, 6, 8, 10, 5));
    await bridge.saveStoreKeys({});
    expect((await bridge.loadStore()).updatedAt).toBeGreaterThan(first!);
  });

  it("rejects rather than throwing synchronously when the write fails", async () => {
    storage.failWrites = true;
    await expect(bridge.saveStoreKeys({ seder: [] })).rejects.toThrow(/Quota/);
  });
});

describe("storeStamp", () => {
  it('is "0" before anything is written', async () => {
    expect(await bridge.storeStamp()).toBe("0");
  });

  it("reports the store's updatedAt as a string", async () => {
    const result = await bridge.saveStoreKey("seder", []);
    expect(await bridge.storeStamp()).toBe(String(result.updatedAt));
  });

  it("changes when the store is written again", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 8, 10, 0));
    await bridge.saveStoreKey("seder", ["a"]);
    const first = await bridge.storeStamp();

    vi.setSystemTime(new Date(2026, 6, 8, 10, 0, 1));
    await bridge.saveStoreKey("seder", ["b"]);
    // The pollers skip reading the file entirely while this is unchanged, so a
    // write that left it alone would go unnoticed.
    expect(await bridge.storeStamp()).not.toBe(first);
  });

  it("stays put when nothing is written", async () => {
    await bridge.saveStoreKey("seder", []);
    const stamp = await bridge.storeStamp();
    expect(await bridge.storeStamp()).toBe(stamp);
    expect(await bridge.storeStamp()).toBe(stamp);
  });

  it('is "0" for a store with no updatedAt at all', async () => {
    storage.setItem(DEV_STORE_KEY, JSON.stringify({ seder: [] }));
    expect(await bridge.storeStamp()).toBe("0");
  });
});

describe("everything lives under one key", () => {
  it("writes nothing else to localStorage", async () => {
    await bridge.saveStoreKeys({ seder: ["s"], learning: ["l"], theme: "dark" });
    const keys = Array.from({ length: storage.length }, (_, i) => storage.key(i));
    expect(keys).toEqual([DEV_STORE_KEY]);
  });
});
