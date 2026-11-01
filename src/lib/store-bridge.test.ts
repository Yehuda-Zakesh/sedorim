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
let gate: typeof import("./store-gate");

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
  gate = await import("./store-gate");
  // Most of these tests are about the transport, so they run with the file
  // already trusted; the gate itself has its own describe block below.
  gate.setStoreGate("ready");
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

  it("refuses to hand out unparseable contents as an empty store", async () => {
    storage.setItem(DEV_STORE_KEY, "{not json at all");
    await expect(bridge.loadStore()).rejects.toBeInstanceOf(bridge.StoreBlockedError);
  });

  it("refuses a non-object payload", async () => {
    for (const junk of ["null", "5", '"a string"', "true", "[]"]) {
      storage.setItem(DEV_STORE_KEY, junk);
      await expect(bridge.loadStore(), junk).rejects.toBeInstanceOf(bridge.StoreBlockedError);
    }
  });

  it("refuses when localStorage itself throws on read", async () => {
    vi.spyOn(storage, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    await expect(bridge.loadStore()).rejects.toBeInstanceOf(bridge.StoreBlockedError);
  });

  it("returns nothing while the gate is not ready, even if the file is fine", async () => {
    await bridge.saveStoreKey("seder", ["a"]);
    gate.setStoreGate("loading");
    await expect(bridge.loadStore()).rejects.toBeInstanceOf(bridge.StoreBlockedError);
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

describe("loadStoreChecked: missing versus corrupt", () => {
  it("reports a file that does not exist as missing — a real fresh install", async () => {
    expect((await bridge.loadStoreChecked()).status).toBe("missing");
  });

  it("reports a readable file as ok with its contents", async () => {
    await bridge.saveStoreKey("seder", [{ id: "a" }]);
    const res = await bridge.loadStoreChecked();
    expect(res.status).toBe("ok");
    if (res.status === "ok") expect(res.store.seder).toEqual([{ id: "a" }]);
  });

  it("reports unparseable text as corrupt and keeps the raw text", async () => {
    storage.setItem(DEV_STORE_KEY, "{broken");
    const res = await bridge.loadStoreChecked();
    expect(res.status).toBe("corrupt");
    if (res.status === "corrupt") {
      expect(res.reason).toBe("unparseable");
      expect(res.preservedAs).not.toBeNull();
      expect(storage.getItem(res.preservedAs!)).toBe("{broken");
    }
    // The original is never touched.
    expect(storage.getItem(DEV_STORE_KEY)).toBe("{broken");
  });

  it("reports valid JSON that is not an object as not-an-object", async () => {
    storage.setItem(DEV_STORE_KEY, "[1,2]");
    const res = await bridge.loadStoreChecked();
    expect(res.status === "corrupt" && res.reason).toBe("not-an-object");
  });
});

describe("the write gate", () => {
  it("rejects every write with StoreBlockedError while loading, writing nothing", async () => {
    gate.setStoreGate("loading");
    await expect(bridge.saveStoreKey("seder", [])).rejects.toBeInstanceOf(bridge.StoreBlockedError);
    await expect(bridge.saveStoreKeys({ theme: "dark" })).rejects.toBeInstanceOf(
      bridge.StoreBlockedError,
    );
    expect(storage.getItem(DEV_STORE_KEY)).toBeNull();
  });

  it("blocks writes on a corrupt file and never replaces it with defaults", async () => {
    storage.setItem(DEV_STORE_KEY, "{broken");
    gate.setStoreGate("corrupt", {
      reason: "unparseable",
      message: "x",
      preservedAs: null,
      backups: [],
    });
    await expect(bridge.saveStoreKey("seder", [])).rejects.toBeInstanceOf(bridge.StoreBlockedError);
    expect(storage.getItem(DEV_STORE_KEY)).toBe("{broken");
  });

  it("even a write that slipped past the gate refuses to build on a corrupt file", async () => {
    storage.setItem(DEV_STORE_KEY, "{broken");
    await expect(bridge.saveStoreKey("seder", [])).rejects.toThrow(/STORE_CORRUPT/);
    expect(storage.getItem(DEV_STORE_KEY)).toBe("{broken");
  });

  it("the recovery command start-empty is the way out of a corrupt file", async () => {
    storage.setItem(DEV_STORE_KEY, "{broken");
    await bridge.loadStoreChecked(); // detecting it preserves the raw text
    await bridge.startEmptyStore();
    expect((await bridge.loadStoreChecked()).status).toBe("ok");
    expect(storage.getItem("sedorim.devStore.corrupt.v1")).toBe("{broken");
  });
});

describe("edit conflicts (record-level merge in the browser transport)", () => {
  const rec = (id: string, note: string) => ({ id, note });

  it("reports a record both windows changed and keeps the file's version", async () => {
    const base = [rec("a", "0"), rec("b", "0")];
    await bridge.saveStoreKey("seder", base);
    await bridge.saveStoreKey("seder", [rec("a", "first"), rec("b", "0")], {
      bases: { seder: base },
    });
    const res = await bridge.saveStoreKey("seder", [rec("a", "second"), rec("b", "new-b")], {
      bases: { seder: base },
    });
    expect(res.conflicts).toEqual([
      {
        key: "seder",
        id: "a",
        kind: "edit-edit",
        mine: rec("a", "second"),
        theirs: rec("a", "first"),
      },
    ]);
    expect(raw()!.seder).toEqual([rec("a", "first"), rec("b", "new-b")]);
    expect(res.merged?.seder).toEqual(raw()!.seder);
  });

  it("has no conflicts field on a clean save", async () => {
    const base = [rec("a", "0")];
    await bridge.saveStoreKey("seder", base);
    const res = await bridge.saveStoreKey("seder", [rec("a", "x")], { bases: { seder: base } });
    expect(res.conflicts).toBeUndefined();
  });

  it("previewing a backup is not available outside the desktop app", async () => {
    await expect(bridge.previewBackup("sedorim-data.1.json")).rejects.toThrow();
  });
});
