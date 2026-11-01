// The "checked" save contract: a promise that settles only once the write
// reached storage, with rollback by record id — plus the delete-everything
// path and the atomic timer stop.
import { describe, it, expect, vi, beforeEach } from "vitest";

const save = vi.hoisted(() => vi.fn());
// What the "file" holds for the fresh read replaceAllDataChecked does first.
const fileNow = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock("./store-bridge", () => ({
  loadStore: vi.fn(async () => JSON.parse(JSON.stringify(fileNow.value))),
  storeStamp: vi.fn(async () => "0"),
  saveStoreKey: save,
  saveStoreKeys: save,
  // The startup read: a fresh install, so the gate opens and nothing migrates.
  loadStoreChecked: vi.fn(async () => ({
    status: "missing" as const,
    meta: { upgradedFrom: null, upgradeCopy: null },
  })),
  onStoreCorruptDetected: () => {},
  saveStoreKeysDuringStartup: vi.fn(async () => ({ ok: true, updatedAt: 1 })),
  createUpgradeCopy: vi.fn(async () => ({ files: ["copy"] })),
}));
vi.mock("react", async (orig) => ({
  ...(await orig<typeof import("react")>()),
  useState: (v: unknown) => [v, () => {}],
  useEffect: () => {},
}));

import {
  useLearning,
  useSeder,
  ValidationError,
  clearAllData,
  replaceAllData,
  startTimer,
  cancelTimer,
  getTimer,
  getTimerGeneration,
  saveLearningAndEndTimer,
  getLearningSnapshot,
  getSederSnapshot,
  type LearningEntry,
  type SederEntry,
} from "./kollel-store";
import { createSnapshot, listSnapshots, verifySnapshot, clearAllSnapshots } from "./auto-backup";
import { updateSettings, getSettings } from "./settings-store";
import { setStoreGate } from "@/lib/store-gate";

// These tests exercise the stores as if the data file had been read: writes are
// refused until the gate is "ready" (see store-gate.ts). In this environment the
// real startup read finds no storage, so the gate is opened before every test.
beforeEach(() => {
  setStoreGate("ready");
  fileNow.value = {};
});

const lrn = (o: Partial<LearningEntry> = {}): LearningEntry => ({
  id: "a",
  framework: "kollel-erev",
  date: "2026-07-08",
  minutes: 60,
  source: "manual",
  ...o,
});
const sed = (o: Partial<SederEntry> = {}): SederEntry => ({
  id: "s1",
  date: "2026-07-08",
  seder: 1,
  absent: false,
  ohevei: false,
  excusedAll: false,
  excusedMinutes: 0,
  manualAdjustMin: 0,
  tags: [],
  ...o,
});

/** A save the test settles by hand. */
function deferred() {
  let resolve!: (v: { ok: true; updatedAt: number }) => void;
  let reject!: (e: Error) => void;
  const promise = new Promise<{ ok: true; updatedAt: number }>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  save.mockReset();
  save.mockResolvedValue({ ok: true, updatedAt: 1 });
  cancelTimer();
  replaceAllData([], []);
  save.mockClear();
});

describe("useLearning().addChecked", () => {
  it("resolves only after the write, and keeps the record", async () => {
    const d = deferred();
    save.mockReturnValueOnce(d.promise);
    let done = false;
    const p = useLearning()
      .addChecked(lrn())
      .then(() => (done = true));
    await Promise.resolve();
    expect(done).toBe(false);
    d.resolve({ ok: true, updatedAt: 2 });
    await p;
    expect(getLearningSnapshot().map((i) => i.id)).toEqual(["a"]);
  });

  it("is idempotent on id, so a double-clicked undo cannot count a lesson twice", async () => {
    await useLearning().addChecked(lrn({ id: "dup" }));
    save.mockClear();
    await useLearning().addChecked(lrn({ id: "dup" }));
    expect(getLearningSnapshot().filter((i) => i.id === "dup")).toHaveLength(1);
    expect(save).not.toHaveBeenCalled();
  });

  it("rejects on a validation error without saving", async () => {
    await expect(useLearning().addChecked(lrn({ minutes: 5000 }))).rejects.toThrow(ValidationError);
    expect(save).not.toHaveBeenCalled();
  });

  it("on a failed write removes only its own record", async () => {
    const l = useLearning();
    await l.addChecked(lrn({ id: "x" }));
    save.mockRejectedValueOnce(new Error("disk"));
    await expect(l.addChecked(lrn({ id: "y" }))).rejects.toThrow("disk");
    expect(getLearningSnapshot().map((i) => i.id)).toEqual(["x"]);
  });
});

describe("useLearning().replace — rollback by record id", () => {
  it("does not clobber a parallel write to another record when its own save fails", async () => {
    const l = useLearning();
    await l.addChecked(lrn({ id: "a", minutes: 60 }));
    const slow = deferred();
    save.mockReturnValueOnce(slow.promise);
    const p = l.replace(lrn({ id: "a", minutes: 90 })); // write held back
    l.add(lrn({ id: "b", minutes: 30 })); // parallel change to a different record
    slow.reject(new Error("disk"));
    await expect(p).rejects.toThrow("disk");
    const items = getLearningSnapshot();
    expect(items.find((i) => i.id === "a")?.minutes).toBe(60); // rolled back
    expect(items.find((i) => i.id === "b")?.minutes).toBe(30); // kept
  });

  it("does not roll back a record someone else changed since", async () => {
    const l = useLearning();
    await l.addChecked(lrn({ id: "a", minutes: 60 }));
    const slow = deferred();
    save.mockReturnValueOnce(slow.promise);
    const p = l.replace(lrn({ id: "a", minutes: 90 }));
    await l.replace(lrn({ id: "a", minutes: 120 })); // a later edit that succeeded
    slow.reject(new Error("disk"));
    await expect(p).rejects.toThrow("disk");
    expect(getLearningSnapshot()[0].minutes).toBe(120);
  });

  it("runs the auto-backup hook like add does", async () => {
    updateSettings({ data: { ...getSettings().data, autoBackup: "daily" } });
    clearAllSnapshots();
    const l = useLearning();
    await l.addChecked(lrn({ id: "a" }));
    clearAllSnapshots();
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 2 * 86_400_000); // a daily backup is due again
    try {
      await l.replace(lrn({ id: "a", minutes: 75 }));
      const snaps = listSnapshots();
      expect(snaps).toHaveLength(1);
      expect(snaps[0].trigger).toBe("auto");
      expect(
        (snaps[0].payload.learning as LearningEntry[]).find((i) => i.id === "a")?.minutes,
      ).toBe(75);
    } finally {
      vi.useRealTimers();
      updateSettings({ data: { ...getSettings().data, autoBackup: "off" } });
    }
  });
});

describe("useSeder().upsertChecked", () => {
  it("saves, and resolves after the write", async () => {
    await useSeder().upsertChecked(sed());
    expect(getSederSnapshot()).toHaveLength(1);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("applies the weekend block, but lets restore through", async () => {
    // 2026-07-11 is a Saturday.
    await expect(useSeder().upsertChecked(sed({ date: "2026-07-11" }))).rejects.toThrow(
      ValidationError,
    );
    expect(save).not.toHaveBeenCalled();
    await useSeder().upsertChecked(sed({ date: "2026-07-11" }), { restore: true });
    expect(getSederSnapshot()).toHaveLength(1);
  });

  it("restores the previous version of an edited record when the write fails", async () => {
    const s = useSeder();
    await s.upsertChecked(sed({ arrival: "09:00" }));
    save.mockRejectedValueOnce(new Error("disk"));
    await expect(s.upsertChecked(sed({ arrival: "09:30" }))).rejects.toThrow("disk");
    expect(getSederSnapshot()[0].arrival).toBe("09:00");
  });

  it("removes a new record when its write fails, leaving others alone", async () => {
    const s = useSeder();
    await s.upsertChecked(sed({ id: "s1" }));
    save.mockRejectedValueOnce(new Error("disk"));
    await expect(s.upsertChecked(sed({ id: "s2", seder: 2 }))).rejects.toThrow("disk");
    expect(getSederSnapshot().map((e) => e.id)).toEqual(["s1"]);
  });
});

describe("clearAllData and the safety snapshot", () => {
  it("with retention 1 the only snapshot holds ALL data, and restoring from it works", async () => {
    updateSettings({
      data: { ...getSettings().data, backupRetention: 1, autoBackupBeforeOps: true },
    });
    clearAllSnapshots();
    replaceAllData([sed({ id: "s1" }), sed({ id: "s2", seder: 2 })], [lrn({ id: "l1" })]);
    // What backup.tsx does: one full snapshot, then one joint delete.
    createSnapshot(
      { attendance: getSederSnapshot(), learning: getLearningSnapshot() },
      "before-op",
    );
    await clearAllData();
    expect(getSederSnapshot()).toHaveLength(0);
    expect(getLearningSnapshot()).toHaveLength(0);
    const snaps = listSnapshots();
    expect(snaps).toHaveLength(1);
    expect(verifySnapshot(snaps[0])).toBe(true);
    expect((snaps[0].payload.attendance as unknown[]).length).toBe(2);
    expect((snaps[0].payload.learning as unknown[]).length).toBe(1);
    replaceAllData(
      snaps[0].payload.attendance as SederEntry[],
      snaps[0].payload.learning as LearningEntry[],
    );
    expect(getSederSnapshot()).toHaveLength(2);
    expect(getLearningSnapshot()).toHaveLength(1);
  });

  it("writes both lists in a single save", async () => {
    replaceAllData([sed()], [lrn()]);
    fileNow.value = { seder: [sed()], learning: [lrn()] }; // the fresh read before the replace
    save.mockClear();
    await clearAllData();
    // The first save carries everything; a later one only re-writes the same snapshot list
    // from the in-memory adoption (same value).
    expect(save.mock.calls[0][0]).toMatchObject({ seder: [], learning: [] });
    expect(save.mock.calls[0][0].snapshots).toHaveLength(1); // the safety copy, same write
  });

  it("puts the data back when the delete cannot be saved", async () => {
    replaceAllData([sed()], [lrn()]);
    fileNow.value = { seder: [sed()], learning: [lrn()] };
    save.mockRejectedValueOnce(new Error("disk"));
    await expect(clearAllData()).rejects.toThrow("disk");
    expect(getSederSnapshot()).toHaveLength(1);
    expect(getLearningSnapshot()).toHaveLength(1);
  });
});

describe("saveLearningAndEndTimer", () => {
  it("writes the entry and the cleared timer in one save", async () => {
    startTimer("kollel-erev");
    save.mockClear();
    await saveLearningAndEndTimer(lrn({ id: "t1", source: "timer" }), getTimerGeneration());
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][0]).toMatchObject({ timer: null });
    expect(save.mock.calls[0][0].learning).toHaveLength(1);
    expect(getTimer()).toBe(null);
  });

  it("keeps the session and drops the entry when the write fails", async () => {
    const t = startTimer("kollel-erev");
    save.mockRejectedValueOnce(new Error("disk"));
    await expect(
      saveLearningAndEndTimer(lrn({ id: "t1", source: "timer" }), getTimerGeneration()),
    ).rejects.toThrow("disk");
    expect(getTimer()).toBe(t);
    expect(getLearningSnapshot()).toHaveLength(0);
  });

  it("refuses when the session was replaced", async () => {
    startTimer("kollel-erev");
    const stale = getTimerGeneration();
    startTimer("kollel-erev");
    save.mockClear();
    await expect(saveLearningAndEndTimer(lrn(), stale)).rejects.toThrow(ValidationError);
    expect(save).not.toHaveBeenCalled();
    expect(getTimer()).not.toBe(null);
  });
});
