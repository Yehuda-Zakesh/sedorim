// The localStorage -> data-file migration and the single startup read that
// runs it. The bridge is replaced by an in-memory "file", so nothing here can
// touch the real %APPDATA%\SederPlus.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import type { StoreShape } from "./store-bridge";

const file = {
  exists: false,
  corrupt: false,
  store: {} as StoreShape,
  saveFails: false,
  /** Drops the first record of every array written, to simulate a lossy write. */
  lossy: false,
  copyFails: false,
  /** Everything that happened, in order. */
  log: [] as string[],
  saves: [] as Array<Record<string, unknown>>,
  copies: [] as Array<Record<string, string> | undefined>,
};

vi.mock("./store-bridge", () => {
  const write = (patch: Record<string, unknown>) => {
    file.log.push("save");
    if (file.saveFails) return Promise.reject(new Error("disk full"));
    const applied: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(patch)) {
      applied[k] = file.lossy && Array.isArray(v) ? v.slice(1) : v;
    }
    file.saves.push(patch);
    file.store = { ...file.store, ...applied, updatedAt: file.saves.length };
    file.exists = true;
    return Promise.resolve({ ok: true as const, updatedAt: file.saves.length });
  };
  return {
    loadStoreChecked: () => {
      if (file.corrupt) {
        return Promise.resolve({
          status: "corrupt" as const,
          reason: "unparseable" as const,
          message: "bad json",
          preservedAs: "sedorim-data.corrupt.json",
          backups: [],
          meta: { upgradedFrom: null, upgradeCopy: null },
        });
      }
      const meta = { upgradedFrom: null, upgradeCopy: null };
      return Promise.resolve(
        file.exists
          ? { status: "ok" as const, store: structuredClone(file.store), meta }
          : { status: "missing" as const, meta },
      );
    },
    storeStamp: () => Promise.resolve("0"),
    saveStoreKeys: write,
    saveStoreKey: (k: string, v: unknown) => write({ [k]: v }),
    saveStoreKeysDuringStartup: write,
    onStoreCorruptDetected: () => {},
    createUpgradeCopy: (_label: string, legacy?: Record<string, string>) => {
      file.log.push("copy");
      if (file.copyFails) return Promise.reject(new Error("no space"));
      file.copies.push(legacy);
      return Promise.resolve({ files: ["upgrade-copy.json"] });
    },
  };
});

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
  snapshot() {
    return Object.fromEntries(this.map);
  }
}

let storage: MemoryStorage;
let mig: typeof import("./legacy-migration");

const sed = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  date: "2026-07-08",
  seder: 1,
  arrival: "09:00",
  absent: false,
  ohevei: false,
  excusedAll: false,
  excusedMinutes: 0,
  manualAdjustMin: 0,
  tags: ["x"],
  note: "הערה " + id,
  ...extra,
});
const lrn = (id: string, minutes = 30) => ({
  id,
  framework: "kollel-erev",
  date: "2026-07-08",
  minutes,
  source: "manual",
});
const timer = { framework: "torato-beyado", startedAt: 1000, accumulatedMs: 5000, pausedAt: 2000 };

const LEGACY_SEDER = [sed("s1"), sed("s2", { seder: 2, absent: true })];
const LEGACY_LEARNING = [lrn("l1"), lrn("l2", 45)];

function putLegacy(
  opts: { seder?: unknown; learning?: unknown; timer?: unknown; raw?: Record<string, string> } = {},
) {
  const all = {
    seder: LEGACY_SEDER,
    learning: LEGACY_LEARNING,
    timer,
    ...opts,
  };
  if (all.seder !== undefined) storage.setItem(mig.LEGACY_SEDER_KEY, JSON.stringify(all.seder));
  if (all.learning !== undefined) {
    storage.setItem(mig.LEGACY_LEARNING_KEY, JSON.stringify(all.learning));
  }
  if (all.timer !== undefined) storage.setItem(mig.LEGACY_TIMER_KEY, JSON.stringify(all.timer));
  for (const [k, v] of Object.entries(opts.raw ?? {})) storage.setItem(k, v);
}

beforeEach(async () => {
  Object.assign(file, {
    exists: false,
    corrupt: false,
    store: {},
    saveFails: false,
    lossy: false,
    copyFails: false,
    log: [],
    saves: [],
    copies: [],
  });
  storage = new MemoryStorage();
  vi.stubGlobal("localStorage", storage);
  vi.resetModules();
  mig = await import("./legacy-migration");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("a missing file with the full legacy data", () => {
  it("writes seder, learning and timer in ONE save, after the upgrade copy", async () => {
    putLegacy({
      raw: { "tracker.settings.v1": '{"x":1}', "tracker.onboarded.v1": "1" },
    });
    const res = await mig.runLegacyMigration();

    expect(res.status).toBe("done");
    expect(file.log).toEqual(["copy", "save"]);
    expect(file.saves).toHaveLength(1);
    expect(Object.keys(file.saves[0]).sort()).toEqual(["learning", "seder", "timer"]);
    expect(file.store.seder).toEqual(LEGACY_SEDER);
    expect(file.store.learning).toEqual(LEGACY_LEARNING);
    expect(file.store.timer).toEqual(timer);
    // The copy carries the raw legacy keys, including the settings ones.
    expect(file.copies[0]).toMatchObject({
      [mig.LEGACY_SEDER_KEY]: JSON.stringify(LEGACY_SEDER),
      "tracker.settings.v1": '{"x":1}',
      "tracker.onboarded.v1": "1",
    });
    expect(storage.getItem(mig.MIGRATION_DONE_FLAG)).not.toBeNull();
  });

  it("never deletes a legacy key", async () => {
    putLegacy({ raw: { "tracker.theme": "dark", [mig.OLD_MIGRATED_FLAG]: "1" } });
    const before = storage.snapshot();
    await mig.runLegacyMigration();
    const after = storage.snapshot();
    for (const [k, v] of Object.entries(before)) expect(after[k], k).toBe(v);
  });

  it("carries the timer as it is, running or paused", async () => {
    const running = { framework: "kollel-erev", startedAt: 42, limitMinutes: 90 };
    putLegacy({ timer: running });
    await mig.runLegacyMigration();
    expect(file.store.timer).toEqual(running);
  });

  it("does nothing, and marks done, when there is no legacy data at all", async () => {
    const res = await mig.runLegacyMigration();
    expect(res).toMatchObject({ status: "done", wrote: [] });
    expect(file.log).toEqual([]);
  });
});

describe("running again", () => {
  it("changes nothing on the second and third run", async () => {
    putLegacy();
    await mig.runLegacyMigration();
    const savesAfterFirst = file.saves.length;
    const copiesAfterFirst = file.copies.length;
    const storeAfterFirst = structuredClone(file.store);

    for (let i = 0; i < 2; i++) {
      const res = await mig.runLegacyMigration();
      expect(res).toMatchObject({ status: "done", alreadyDone: true });
    }
    expect(file.saves).toHaveLength(savesAfterFirst);
    expect(file.copies).toHaveLength(copiesAfterFirst);
    expect(file.store).toEqual(storeAfterFirst);
  });

  it("is also safe when only the flag was lost: finds nothing to do and duplicates nothing", async () => {
    putLegacy();
    await mig.runLegacyMigration();
    storage.removeItem(mig.MIGRATION_DONE_FLAG);
    const before = structuredClone(file.store);
    const savesBefore = file.saves.length;
    const res = await mig.runLegacyMigration();
    expect(res.status).toBe("done");
    expect(file.saves).toHaveLength(savesBefore);
    expect(file.store).toEqual(before);
    expect((file.store.seder as unknown[]).length).toBe(LEGACY_SEDER.length);
  });
});

describe("a partial state left by the old code", () => {
  it("completes it: attendance already moved, learning missing, old flag set", async () => {
    putLegacy({ raw: { [mig.OLD_MIGRATED_FLAG]: "1700000000000" } });
    // What the old code left behind: seder copied, the learning copy failed,
    // the flag was written anyway.
    file.exists = true;
    file.store = { seder: structuredClone(LEGACY_SEDER), updatedAt: 1 };

    const res = await mig.runLegacyMigration();

    expect(res.status).toBe("done");
    expect(file.store.learning).toEqual(LEGACY_LEARNING);
    expect(file.store.timer).toEqual(timer);
    // The attendance already there is not rewritten and not doubled.
    expect(file.saves).toHaveLength(1);
    expect(Object.keys(file.saves[0]).sort()).toEqual(["learning", "timer"]);
    expect(file.store.seder).toEqual(LEGACY_SEDER);
  });

  it("an interrupted run resumes without duplicating what already landed", async () => {
    putLegacy();
    // Run 1 dies right after the write but before the flag: simulate by making
    // the verification read see a corrupt file once is overkill — instead,
    // pre-seed the file as the write left it and leave the flag unset.
    file.exists = true;
    file.store = {
      seder: structuredClone(LEGACY_SEDER),
      learning: structuredClone(LEGACY_LEARNING),
      timer,
      updatedAt: 1,
    };
    const res = await mig.runLegacyMigration();
    expect(res.status).toBe("done");
    expect(file.saves).toHaveLength(0);
    expect((file.store.seder as unknown[]).length).toBe(2);
    expect((file.store.learning as unknown[]).length).toBe(2);
  });
});

describe("a target that already has data", () => {
  it("does not overwrite an existing key; the other missing segments are still carried", async () => {
    putLegacy();
    const mine = [sed("mine", { date: "2026-08-01" })];
    file.exists = true;
    file.store = { seder: structuredClone(mine), updatedAt: 1 };

    const res = await mig.runLegacyMigration();

    expect(res.status).toBe("conflict");
    expect(file.store.seder).toEqual(mine);
    expect(file.store.learning).toEqual(LEGACY_LEARNING);
    expect(file.saves.every((s) => !("seder" in s))).toBe(true);
    // Not marked done: it is unresolved.
    expect(storage.getItem(mig.MIGRATION_DONE_FLAG)).toBeNull();
  });

  it("shows the conflict, keeps both sources, and the copy is made", async () => {
    putLegacy({ learning: [] });
    file.exists = true;
    file.store = { seder: [sed("mine")], updatedAt: 1 };
    await mig.runLegacyMigration();

    expect(mig.getLegacyConflict()).toEqual({ seder: 2, learning: 0, total: 2 });
    expect(file.copies.length).toBeGreaterThan(0);
    expect(storage.getItem(mig.LEGACY_SEDER_KEY)).toBe(JSON.stringify(LEGACY_SEDER));
  });

  it("the explicit action adds only the ids that are missing, and is idempotent", async () => {
    putLegacy({ learning: [] });
    const mine = [sed("s1", { arrival: "09:15", note: "edited here" }), sed("mine")];
    file.exists = true;
    file.store = { seder: structuredClone(mine), updatedAt: 1 };
    await mig.runLegacyMigration();
    // s1 is in both (the edited copy in the file wins); only s2 is missing.
    expect(mig.getLegacyConflict()).toEqual({ seder: 1, learning: 0, total: 1 });

    const added = await mig.applyLegacyMissingRecords();
    expect(added).toEqual({ seder: 1, learning: 0 });
    const ids = (file.store.seder as Array<{ id: string }>).map((e) => e.id);
    expect(ids).toEqual(["s1", "mine", "s2"]);
    expect((file.store.seder as Array<{ id: string; note?: string }>)[0].note).toBe("edited here");
    expect(mig.getLegacyConflict()).toBeNull();
    expect(storage.getItem(mig.MIGRATION_DONE_FLAG)).not.toBeNull();

    const again = await mig.applyLegacyMissingRecords();
    expect(again).toEqual({ seder: 0, learning: 0 });
    expect((file.store.seder as unknown[]).length).toBe(3);
  });

  it("a conflict alone writes nothing automatically", async () => {
    putLegacy({ learning: [], timer: undefined });
    storage.removeItem(mig.LEGACY_TIMER_KEY);
    file.exists = true;
    file.store = { seder: [sed("mine")], learning: [], timer: null, updatedAt: 1 };
    await mig.runLegacyMigration();
    expect(file.saves).toHaveLength(0);
  });
});

describe("records the user deleted are not brought back", () => {
  it("an existing but empty key is left empty — only flagged as a conflict", async () => {
    putLegacy();
    file.exists = true;
    file.store = { seder: [], learning: [], timer: null, updatedAt: 1 };

    const res = await mig.runLegacyMigration();

    expect(res.status).toBe("conflict");
    expect(file.saves).toHaveLength(0);
    expect(file.store.seder).toEqual([]);
    expect(file.store.learning).toEqual([]);
    // A timer that was stopped (null) is not revived either.
    expect(file.store.timer).toBeNull();
    expect(mig.getLegacyConflict()).toEqual({ seder: 2, learning: 2, total: 4 });
  });
});

describe("failures are visible, never half-successes", () => {
  it("no write at all when the upgrade copy cannot be made", async () => {
    putLegacy();
    file.copyFails = true;
    const res = await mig.runLegacyMigration();
    expect(res.status).toBe("failed");
    expect(file.saves).toHaveLength(0);
    expect(file.log).not.toContain("save");
    expect(storage.getItem(mig.MIGRATION_DONE_FLAG)).toBeNull();
    expect(mig.getLegacyMigrationFailure()).toMatch(/עותק|no space/);
  });

  it("an empty list of copied files counts as a failed copy", async () => {
    putLegacy();
    const bridge = await import("./store-bridge");
    vi.spyOn(bridge, "createUpgradeCopy").mockResolvedValueOnce({ files: [] });
    const res = await mig.runLegacyMigration();
    expect(res.status).toBe("failed");
    expect(file.saves).toHaveLength(0);
  });

  it("the flag is not written when the save fails, and the next launch retries and succeeds", async () => {
    putLegacy();
    file.saveFails = true;
    const res = await mig.runLegacyMigration();
    expect(res.status).toBe("failed");
    expect(storage.getItem(mig.MIGRATION_DONE_FLAG)).toBeNull();
    expect(file.exists).toBe(false);

    file.saveFails = false;
    const retry = await mig.runLegacyMigration();
    expect(retry.status).toBe("done");
    expect(file.store.seder).toEqual(LEGACY_SEDER);
    expect(file.store.learning).toEqual(LEGACY_LEARNING);
  });

  it("the flag is not written when the read-back does not match the legacy content", async () => {
    putLegacy();
    file.lossy = true;
    const res = await mig.runLegacyMigration();
    expect(res.status).toBe("failed");
    expect(storage.getItem(mig.MIGRATION_DONE_FLAG)).toBeNull();
  });

  it("verification compares content, not just counts", async () => {
    putLegacy({ learning: [lrn("l1", 30)], timer: undefined });
    storage.removeItem(mig.LEGACY_TIMER_KEY);
    // A write that keeps the ids and the count but changes a value.
    const bridge = await import("./store-bridge");
    vi.spyOn(bridge, "saveStoreKeys").mockImplementation(async (patch) => {
      file.store = { ...file.store, learning: [lrn("l1", 31)], seder: patch.seder, updatedAt: 9 };
      file.exists = true;
      return { ok: true as const, updatedAt: 9 };
    });
    const res = await mig.runLegacyMigration();
    expect(res.status).toBe("failed");
    expect(storage.getItem(mig.MIGRATION_DONE_FLAG)).toBeNull();
  });

  it("one unreadable legacy segment is a visible failure; the readable ones still move", async () => {
    putLegacy();
    storage.setItem(mig.LEGACY_LEARNING_KEY, "{not json");
    const res = await mig.runLegacyMigration();
    expect(res.status).toBe("failed");
    expect(file.store.seder).toEqual(LEGACY_SEDER);
    expect(file.store.learning).toBeUndefined();
    expect(storage.getItem(mig.MIGRATION_DONE_FLAG)).toBeNull();
    expect(mig.getLegacyMigrationFailure()).toContain(mig.LEGACY_LEARNING_KEY);
    // The broken source is untouched.
    expect(storage.getItem(mig.LEGACY_LEARNING_KEY)).toBe("{not json");
  });

  it("never writes onto a corrupt file", async () => {
    putLegacy();
    file.exists = true;
    file.corrupt = true;
    const res = await mig.runLegacyMigration();
    expect(res.status).toBe("failed");
    expect(file.saves).toHaveLength(0);
    expect(file.log).toEqual([]);
  });
});

describe("the startup read: missing versus corrupt, and the write gate", () => {
  let startup: typeof import("./store-startup");
  let gate: typeof import("./store-gate");
  let bridgeReal: typeof import("./store-bridge");

  beforeEach(async () => {
    startup = await import("./store-startup");
    gate = await import("./store-gate");
    bridgeReal = await import("./store-bridge");
  });

  it("a missing file is a real fresh install: the gate opens and nothing is invented", async () => {
    const store = await startup.ensureStoreReady();
    expect(store).toEqual({});
    expect(gate.getStoreGate()).toBe("ready");
    expect(file.saves).toHaveLength(0);
  });

  it("a corrupt file closes the gate, runs no migration, and creates no defaults", async () => {
    putLegacy();
    file.exists = true;
    file.corrupt = true;
    const store = await startup.ensureStoreReady();
    expect(store).toBeNull();
    expect(gate.getStoreGate()).toBe("corrupt");
    expect(gate.getCorruptInfo()).toMatchObject({
      reason: "unparseable",
      preservedAs: "sedorim-data.corrupt.json",
    });
    expect(file.log).toEqual([]);
    expect(storage.getItem(mig.MIGRATION_DONE_FLAG)).toBeNull();
  });

  it("an unreadable file (the read itself throws) is also corrupt, never empty", async () => {
    vi.spyOn(bridgeReal, "loadStoreChecked").mockRejectedValueOnce(new Error("locked"));
    expect(await startup.ensureStoreReady()).toBeNull();
    expect(gate.getStoreGate()).toBe("corrupt");
    expect(gate.getCorruptInfo()?.reason).toBe("unreadable");
  });

  it("hydration hooks never fire while corrupt, and fire after a successful retry", async () => {
    file.exists = true;
    file.corrupt = true;
    const seen: StoreShape[] = [];
    startup.onStoreReady((s) => seen.push(s));
    await startup.ensureStoreReady();
    await Promise.resolve();
    expect(seen).toEqual([]);

    file.corrupt = false;
    file.store = { seder: [sed("a")], updatedAt: 1 };
    expect(await startup.retryStoreLoad()).toBe(true);
    expect(seen).toHaveLength(1);
    expect(seen[0].seder).toEqual([sed("a")]);
    expect(gate.getStoreGate()).toBe("ready");
  });

  it("runs the migration before the gate opens, and hydrates from the migrated file", async () => {
    putLegacy();
    const seen: StoreShape[] = [];
    startup.onStoreReady((s) => seen.push(s));
    await startup.ensureStoreReady();
    expect(file.store.seder).toEqual(LEGACY_SEDER);
    expect(seen[0].seder).toEqual(LEGACY_SEDER);
    expect(seen[0].learning).toEqual(LEGACY_LEARNING);
  });

  it("an app write is refused until the gate is ready", async () => {
    // Use the real gate with the mocked bridge's write: the bridge module is a
    // mock here, so assert the gate primitive that the real bridge calls.
    expect(() => gate.assertStoreWritable()).toThrow(gate.StoreBlockedError);
    await startup.ensureStoreReady();
    expect(() => gate.assertStoreWritable()).not.toThrow();
  });

  it("a migration that fails still lets the app open on the data that is there", async () => {
    putLegacy();
    file.copyFails = true;
    await startup.ensureStoreReady();
    expect(gate.getStoreGate()).toBe("ready");
    expect(file.saves).toHaveLength(0);
    expect(mig.getLegacyMigrationFailure()).not.toBeNull();
  });
});
