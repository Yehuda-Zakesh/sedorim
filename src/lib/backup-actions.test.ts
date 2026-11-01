// The destructive backup operations against a fake data file: the safety
// snapshot and the change are one atomic write, a failed write changes
// nothing (memory or file), and success needs a matching read-back.
import { describe, it, expect, vi, beforeEach } from "vitest";

type FakeFile = Record<string, unknown>;
const fake = vi.hoisted(() => ({
  file: {} as FakeFile,
  failWrites: false,
  /** Applied to what loadStore returns, to simulate a file that reads back wrong. */
  tamper: null as null | ((f: FakeFile) => FakeFile),
  loadThrows: false,
  /** Reads fail only once something has been written (the verifying read-back). */
  loadThrowsAfterWrite: false,
  writes: [] as FakeFile[],
}));

vi.mock("./store-bridge", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./store-bridge")>();
  const apply = async (patch: FakeFile) => {
    if (fake.failWrites) throw new Error("disk");
    const copy = JSON.parse(JSON.stringify(patch)) as FakeFile; // like the real file: JSON
    fake.writes.push(copy);
    fake.file = { ...fake.file, ...copy };
    return { ok: true as const, updatedAt: Date.now() };
  };
  return {
    ...actual,
    loadStore: vi.fn(async () => {
      if (fake.loadThrows || (fake.loadThrowsAfterWrite && fake.writes.length > 0))
        throw new Error("unreadable");
      const f = JSON.parse(JSON.stringify(fake.file)) as FakeFile;
      return fake.tamper ? fake.tamper(f) : f;
    }),
    storeStamp: vi.fn(async () => "0"),
    // The startup read (also used by the restart test): what the fake file holds.
    loadStoreChecked: vi.fn(async () => ({
      status: "ok" as const,
      store: JSON.parse(JSON.stringify(fake.file)) as FakeFile,
      meta: { upgradedFrom: null, upgradeCopy: null },
    })),
    saveStoreKey: (k: string, v: unknown) => apply({ [k]: v }),
    saveStoreKeys: apply,
  };
});
vi.mock("react", async (orig) => ({
  ...(await orig<typeof import("react")>()),
  useState: (v: unknown) => [v, () => {}],
  useEffect: () => {},
}));

import {
  replaceAllData,
  getSederSnapshot,
  getLearningSnapshot,
  type LearningEntry,
  type SederEntry,
} from "./kollel-store";
import { clearAllSnapshots, listSnapshots, maybeAutoBackup, verifySnapshot } from "./auto-backup";
import {
  updateSettings,
  getSettings,
  isOnboarded,
  markOnboarded,
  keepOnboardedAfterRecovery,
} from "./settings-store";
import {
  deleteEverything,
  replaceEverything,
  takeSnapshot,
  BackupActionError,
} from "./backup-actions";
import { analyzeBackup, analyzeBackupText, outcomeMessage } from "./backup-analysis";
import { canonical } from "./backup-verify";
import { replaceAllDataChecked } from "./kollel-store";
import { setStoreGate } from "@/lib/store-gate";

// These tests exercise the stores as if the data file had been read: writes are
// refused until the gate is "ready" (see store-gate.ts). In this environment the
// real startup read finds no storage, so the gate is opened before every test.
beforeEach(() => setStoreGate("ready"));

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
  arrival: "09:05",
  note: "הערה",
  ...o,
});
const lrn = (o: Partial<LearningEntry> = {}): LearningEntry => ({
  id: "l1",
  framework: "kollel-erev",
  date: "2026-07-08",
  minutes: 60,
  source: "manual",
  tanitDibur: true,
  ...o,
});

const seedSeder = () => [sed({ id: "s1" }), sed({ id: "s2", seder: 2, date: "2026-07-09" })];
const seedLearning = () => [lrn({ id: "l1" })];
const sorted = (xs: unknown[]) => xs.map(canonical).sort();

async function setRetention(n: number) {
  updateSettings({ data: { ...getSettings().data, backupRetention: n } });
}

beforeEach(async () => {
  fake.file = {};
  fake.failWrites = false;
  fake.tamper = null;
  fake.loadThrows = false;
  fake.loadThrowsAfterWrite = false;
  replaceAllData([], []);
  clearAllSnapshots();
  await setRetention(5);
  await new Promise((r) => setTimeout(r, 0)); // let the fire-and-forget seeding writes land
  fake.file = {};
  fake.writes = [];
});

/** Puts data in memory AND in the fake file, as a real session would have. */
async function seed() {
  replaceAllData(seedSeder(), seedLearning());
  await new Promise((r) => setTimeout(r, 0));
}

describe("deleteEverything", () => {
  it("writes the safety snapshot and the delete in ONE save", async () => {
    await seed();
    fake.writes = [];
    await deleteEverything();
    expect(fake.writes[0]).toHaveProperty("snapshots");
    expect(fake.writes[0]).toHaveProperty("seder", []);
    expect(fake.writes[0]).toHaveProperty("learning", []);
    expect(fake.file.snapshots).toHaveLength(1);
  });

  it("deletes nothing when the write fails: memory and file keep the data, no snapshot appears", async () => {
    await seed();
    const fileBefore = JSON.parse(JSON.stringify(fake.file));
    fake.failWrites = true;
    const err = await deleteEverything().catch((e) => e);
    expect(err).toBeInstanceOf(BackupActionError);
    expect(err.stage).toBe("write");
    expect(getSederSnapshot()).toHaveLength(2);
    expect(getLearningSnapshot()).toHaveLength(1);
    expect(listSnapshots()).toHaveLength(0);
    expect(fake.file).toEqual(fileBefore);
  });

  it("with at most 1 snapshot kept: delete, then a real restore gives back identical data", async () => {
    await setRetention(1);
    await seed();
    const beforeSeder = sorted(getSederSnapshot());
    const beforeLearning = sorted(getLearningSnapshot());

    await deleteEverything();
    expect(getSederSnapshot()).toHaveLength(0);
    expect(fake.file.seder).toEqual([]);
    const snaps = listSnapshots();
    expect(snaps).toHaveLength(1);
    expect(verifySnapshot(snaps[0])).toBe(true);

    // The restore the UI does: analyse the snapshot's payload, replace.
    const a = analyzeBackup(snaps[0].payload);
    expect(a.issues).toEqual([]);
    const out = await replaceEverything(a.seder, a.learning);
    expect(out.snapshot).toBeNull(); // nothing to protect, so the only copy stays
    expect(listSnapshots()).toHaveLength(1);
    expect(sorted(getSederSnapshot())).toEqual(beforeSeder);
    expect(sorted(getLearningSnapshot())).toEqual(beforeLearning);
    expect(sorted(fake.file.seder as unknown[])).toEqual(beforeSeder);
    expect(sorted(fake.file.learning as unknown[])).toEqual(beforeLearning);
  });

  it("reports a failed read-back instead of success", async () => {
    await seed();
    fake.tamper = (f) => ({ ...f, snapshots: [] }); // the snapshot is not in the file
    const err = await deleteEverything().catch((e) => e);
    expect(err).toBeInstanceOf(BackupActionError);
    expect(err.stage).toBe("verify");
  });

  it("reports an unreadable file after the write as a verify failure", async () => {
    await seed();
    fake.writes = [];
    fake.loadThrowsAfterWrite = true; // the fresh read before the write works; the read-back fails
    const err = await deleteEverything().catch((e) => e);
    expect(err.stage).toBe("verify");
  });
});

describe("replaceEverything", () => {
  it("saves snapshot + seder + learning together; the full previous data is the one kept at retention 1", async () => {
    await setRetention(1);
    await seed();
    const before = { s: sorted(getSederSnapshot()), l: sorted(getLearningSnapshot()) };
    fake.writes = [];
    const out = await replaceEverything([sed({ id: "n1", date: "2026-06-01" })], []);
    expect(fake.writes.length).toBeGreaterThan(0);
    expect(Object.keys(fake.writes[0]).sort()).toEqual(["learning", "seder", "snapshots"]);
    expect(out.accepted).toEqual({ seder: 1, learning: 0 });
    const snaps = listSnapshots();
    expect(snaps).toHaveLength(1);
    expect(sorted(snaps[0].payload.attendance as unknown[])).toEqual(before.s);
    expect(sorted(snaps[0].payload.learning as unknown[])).toEqual(before.l);
    expect(getSederSnapshot().map((e) => e.id)).toEqual(["n1"]);
  });

  it("changes nothing when the write fails", async () => {
    await seed();
    const memBefore = sorted(getSederSnapshot());
    fake.failWrites = true;
    const err = await replaceEverything([sed({ id: "n1" })], []).catch((e) => e);
    expect(err.stage).toBe("write");
    expect(sorted(getSederSnapshot())).toEqual(memBefore);
    expect(getLearningSnapshot()).toHaveLength(1);
    expect(listSnapshots()).toHaveLength(0);
  });

  it("fails the read-back when the file holds different content", async () => {
    await seed();
    fake.tamper = (f) => ({
      ...f,
      seder: (f.seder as SederEntry[]).map((e) => ({ ...e, arrival: "10:00" })),
    });
    const err = await replaceEverything([sed({ id: "n1" })], []).catch((e) => e);
    expect(err.stage).toBe("verify");
  });

  it("does not drop records silently: an invalid one rejects the call and writes nothing", async () => {
    await seed();
    fake.writes = [];
    await expect(replaceAllDataChecked([sed({ id: "bad", seder: 3 as 1 })], [])).rejects.toThrow();
    expect(fake.writes).toHaveLength(0);
    expect(getSederSnapshot()).toHaveLength(2);
  });
});

describe("snapshots of an empty store", () => {
  it("never push a full snapshot out at retention 1", async () => {
    await setRetention(1);
    await seed();
    const snap = await takeSnapshot();
    expect(snap).not.toBeNull();
    replaceAllData([], []);
    expect(await takeSnapshot()).toBeNull();
    updateSettings({ data: { ...getSettings().data, autoBackup: "daily" } });
    maybeAutoBackup({ attendance: [], learning: [] });
    expect(listSnapshots().map((s) => s.id)).toEqual([snap!.id]);
  });

  it("takeSnapshot stores a verified snapshot, and reports a write failure", async () => {
    await seed();
    const snap = await takeSnapshot();
    expect((fake.file.snapshots as { id: string }[])[0].id).toBe(snap!.id);
    fake.failWrites = true;
    const err = await takeSnapshot().catch((e) => e);
    expect(err.stage).toBe("write");
    expect(listSnapshots()).toHaveLength(1);
  });
});

describe("analyzeBackup and the formats found in practice", () => {
  const stored = { seder: seedSeder(), learning: seedLearning() };

  it("reads the current export format and reports counts and period", () => {
    const a = analyzeBackupText(
      JSON.stringify({ version: 3, exportedAt: "x", kind: "kollel", ...stored }),
    );
    expect(a.sederKey).toBe("seder");
    expect(a.version).toBe(3);
    expect(a.seder).toHaveLength(2);
    expect(a.learning).toHaveLength(1);
    expect(a.issues).toEqual([]);
    expect(a.period).toEqual({ first: "2026-07-08", last: "2026-07-09" });
    expect(a.kinds).toEqual(["רישומי סדרים", "רישומי לימוד"]);
  });

  it("reads the old format: attendance key, no version, no learning, records missing fields", () => {
    const old = [
      { id: "a1", date: "2026-05-03", seder: 1, absent: false, arrival: "09:00" },
      { date: "2026-05-04", seder: 2, absent: true }, // no id either
    ];
    const a = analyzeBackupText(JSON.stringify({ attendance: old }));
    expect(a.formatError).toBeUndefined();
    expect(a.sederKey).toBe("attendance");
    expect(a.seder).toHaveLength(2);
    expect(a.learning).toHaveLength(0);
    expect(a.repairedIds).toBe(1);
    expect(a.seder[1].id).toBeTruthy();
    expect(a.issues).toEqual([]);
  });

  it("reads a snapshot payload ({attendance, learning})", () => {
    const a = analyzeBackup({ attendance: stored.seder, learning: stored.learning });
    expect(a.seder).toHaveLength(2);
    expect(a.learning).toHaveLength(1);
  });

  it("an old-format import with bad records is not 'complete': counts them and says so", () => {
    const a = analyzeBackup({
      attendance: [sed({ id: "ok" }), sed({ id: "bad", seder: 5 as 1 }), null, sed({ id: "ok" })],
      learning: [lrn({ id: "x", minutes: 0 })],
    });
    expect(a.seder).toHaveLength(1);
    expect(a.issues.map((i) => `${i.kind}${i.index}`)).toEqual([
      "seder2",
      "seder3",
      "seder4",
      "learning1",
    ]);
    expect(a.totalSeder + a.totalLearning).toBe(5);
    expect(outcomeMessage({ seder: 1, learning: 0 }, 4)).toBe(
      "נקלטו 1 רישומי סדרים ו־0 רישומי לימוד. דולגו 4 רשומות לא תקינות.",
    );
  });

  it("refuses something that is not a backup instead of reading it as empty", () => {
    expect(analyzeBackupText("{}").formatError).toBeTruthy();
    expect(analyzeBackupText("[]").formatError).toBeTruthy();
    expect(analyzeBackupText("not json").formatError).toBeTruthy();
    expect(analyzeBackup({ seder: "x" }).formatError).toBeTruthy();
    expect(analyzeBackup({ seder: [], learning: 5 }).formatError).toBeTruthy();
  });
});

// ============================================================================
// Records backup vs full copy
// ============================================================================

describe("records backup vs full copy (analysis)", () => {
  it("an export / snapshot payload / old seder format is a records backup: nothing else to carry", () => {
    const exp = analyzeBackup({
      version: 3,
      exportedAt: "x",
      kind: "kollel",
      seder: [sed()],
      learning: [],
    });
    expect(exp.copyKind).toBe("records");
    expect(exp.carry).toEqual({});
    expect(exp.hasSettings).toBe(false);
    expect(analyzeBackup({ attendance: [sed()], learning: [] }).copyKind).toBe("records");
  });

  it("a copy of the data file is a full copy: settings, onboarded and unknown keys are listed", () => {
    const a = analyzeBackup({
      seder: [sed()],
      learning: [],
      settings: { data: { backupRetention: 9 } },
      onboarded: true,
      timer: { framework: "kollel-erev", startedAt: 1 },
      snapshots: [{ id: "x" }],
      updatedAt: 5,
      futureThing: { a: 1 },
    });
    expect(a.copyKind).toBe("full");
    expect(Object.keys(a.carry).sort()).toEqual(["futureThing", "onboarded", "settings"]);
    expect(a.hasSettings).toBe(true);
    expect(a.unknownKeys).toEqual(["futureThing"]);
    expect(a.carryLabels.join(" ")).toMatch(/הגדרות/);
  });

  it("a settings value that is not an object is not carried (it would blank the settings)", () => {
    const a = analyzeBackup({ seder: [], learning: [], settings: "garbage", onboarded: true });
    expect(a.hasSettings).toBe(false);
    expect(a.carry).toEqual({ onboarded: true });
  });
});

describe("restoring records leaves everything else alone", () => {
  beforeEach(async () => {
    await seed();
    markOnboarded();
    updateSettings({ data: { ...getSettings().data, backupRetention: 4 } });
    await new Promise((r) => setTimeout(r, 0));
    fake.file = { ...fake.file, mystery: { keep: "me" } };
    fake.writes = [];
  });

  it("a backup without settings neither invents nor resets them: only the records and the safety copy are written", async () => {
    const a = analyzeBackup({
      version: 3,
      kind: "kollel",
      seder: [sed({ id: "n1" })],
      learning: [],
    });
    const out = await replaceEverything(a.seder, a.learning);
    expect(out.restoredKeys).toEqual([]);
    expect(Object.keys(fake.writes[0]).sort()).toEqual(["learning", "seder", "snapshots"]);
    expect(getSettings().data.backupRetention).toBe(4);
    expect((fake.file.settings as { data: { backupRetention: number } }).data.backupRetention).toBe(
      4,
    );
    expect(fake.file.mystery).toEqual({ keep: "me" });
  });

  it("an empty backup, or one with no onboarded flag, does not reset the onboarding state", async () => {
    expect(isOnboarded()).toBe(true);
    const a = analyzeBackup({ seder: [], learning: [] });
    expect(a.totalSeder + a.totalLearning).toBe(0);
    await replaceEverything(a.seder, a.learning);
    expect(isOnboarded()).toBe(true);
    expect(fake.file.onboarded).toBe(true);
    expect(getSederSnapshot()).toHaveLength(0);
  });

  it("a full copy restored WITH its extras writes them in the same save, keeps unknown keys, and adopts settings", async () => {
    const a = analyzeBackup({
      seder: [sed({ id: "n1" })],
      learning: [],
      settings: { data: { backupRetention: 8 } },
      futureThing: { a: 1 },
    });
    expect(a.copyKind).toBe("full");
    const out = await replaceEverything(a.seder, a.learning, { extra: a.carry });
    expect(out.restoredKeys.sort()).toEqual(["futureThing", "settings"]);
    // One atomic save carries the records, the safety copy and the extras together.
    expect(Object.keys(fake.writes[0]).sort()).toEqual([
      "futureThing",
      "learning",
      "seder",
      "settings",
      "snapshots",
    ]);
    expect(fake.file.futureThing).toEqual({ a: 1 });
    expect(fake.file.mystery).toEqual({ keep: "me" }); // the file's own unknown key stays
    expect(getSettings().data.backupRetention).toBe(8);
    expect(isOnboarded()).toBe(true); // not in the copy: untouched
  });

  it("a failed write after confirmation says so exactly, and changes neither records nor settings", async () => {
    const a = analyzeBackup({
      seder: [sed({ id: "n1" })],
      learning: [],
      settings: { data: { backupRetention: 8 } },
    });
    const memBefore = sorted(getSederSnapshot());
    fake.failWrites = true;
    const err = await replaceEverything(a.seder, a.learning, { extra: a.carry }).catch((e) => e);
    expect(err).toBeInstanceOf(BackupActionError);
    expect(err.stage).toBe("write");
    expect(err.message).toBe(
      "השמירה לקובץ הנתונים נכשלה (disk), ולכן לא בוצעה פעולה והנתונים נשארו כפי שהיו.",
    );
    expect(sorted(getSederSnapshot())).toEqual(memBefore);
    expect(getSettings().data.backupRetention).toBe(4);
    expect(fake.file.futureThing).toBeUndefined();
  });

  it("after a failed write, a restart reads the original data back from the file", async () => {
    const originalIds = getSederSnapshot()
      .map((e) => e.id)
      .sort();
    fake.failWrites = true;
    await replaceEverything([sed({ id: "n1" })], []).catch(() => {});
    fake.failWrites = false;
    vi.resetModules();
    const fresh = await import("./kollel-store");
    const startup = await import("./store-startup");
    await startup.ensureStoreReady();
    await fresh.refreshFromStore(); // what the startup hydration does
    expect(
      fresh
        .getSederSnapshot()
        .map((e) => e.id)
        .sort(),
    ).toEqual(originalIds);
    expect(fresh.getLearningSnapshot().map((e) => e.id)).toEqual(["l1"]);
  });

  it("a real restore from the safety copy of a replace brings back the original records, ids included", async () => {
    await setRetention(5);
    const before = { s: sorted(getSederSnapshot()), l: sorted(getLearningSnapshot()) };
    const beforeIds = getSederSnapshot()
      .map((e) => e.id)
      .sort();
    const out = await replaceEverything(
      [sed({ id: "other", date: "2026-05-01" })],
      [lrn({ id: "lx" })],
    );
    expect(out.snapshot).not.toBeNull();
    expect(getSederSnapshot().map((e) => e.id)).toEqual(["other"]);

    const snap = listSnapshots().find((s) => s.id === out.snapshot!.id)!;
    expect(verifySnapshot(snap)).toBe(true);
    const a = analyzeBackup(snap.payload);
    expect(a.issues).toEqual([]);
    expect(a.copyKind).toBe("records");
    await replaceEverything(a.seder, a.learning);
    expect(sorted(getSederSnapshot())).toEqual(before.s);
    expect(sorted(getLearningSnapshot())).toEqual(before.l);
    expect(
      getSederSnapshot()
        .map((e) => e.id)
        .sort(),
    ).toEqual(beforeIds);
    expect(sorted(fake.file.seder as unknown[])).toEqual(before.s);
    expect(getSettings().data.backupRetention).toBe(5);
  });
});

describe("keepOnboardedAfterRecovery (recovering the whole file from a copy)", () => {
  it("writes the flag back when the copy lacks it and this window knows the person finished onboarding", async () => {
    markOnboarded();
    await new Promise((r) => setTimeout(r, 0));
    fake.file = { seder: [], learning: [] }; // the recovered copy: no onboarded key
    expect(await keepOnboardedAfterRecovery()).toBe(true);
    expect(fake.file.onboarded).toBe(true);
  });

  it("does not override a value the copy holds, nor invent one", async () => {
    markOnboarded();
    await new Promise((r) => setTimeout(r, 0));
    fake.file = { onboarded: false };
    expect(await keepOnboardedAfterRecovery()).toBe(false);
    expect(fake.file.onboarded).toBe(false);
  });
});

describe("restore: preview, safety copy and verification", () => {
  it("the preview counts are right before anything is confirmed (nothing is written)", async () => {
    await seed();
    fake.writes = [];
    const { describeRestoreDiff } = await import("./restore-diff");
    const a = analyzeBackup({
      seder: [sed({ id: "s1" }), sed({ id: "s9", date: "2026-06-01" })],
      learning: [],
    });
    const lines = describeRestoreDiff(
      { seder: getSederSnapshot(), learning: getLearningSnapshot() },
      { seder: a.seder, learning: a.learning },
    );
    expect(lines[0]).toContain("1 יתווספו");
    expect(lines[0]).toContain("1 יימחקו");
    expect(lines[0]).toContain("1 יישארו זהים");
    expect(lines[1]).toContain("1 יימחקו");
    expect(fake.writes).toHaveLength(0);
  });

  it("the safety copy is read back from the file with the original ids, and restoring it returns the original", async () => {
    await seed();
    const beforeIds = getSederSnapshot()
      .map((e) => e.id)
      .sort();
    const out = await replaceEverything([sed({ id: "x1", date: "2026-05-01" })], []);
    const onDisk = (
      fake.file.snapshots as { id: string; checksum: string; payload: unknown }[]
    ).find((s) => s.id === out.snapshot!.id)!;
    expect(onDisk.checksum).toBe(out.snapshot!.checksum);
    expect(canonical(onDisk.payload)).toBe(canonical(out.snapshot!.payload));
    const a = analyzeBackup(onDisk.payload);
    await replaceEverything(a.seder, a.learning);
    expect(
      getSederSnapshot()
        .map((e) => e.id)
        .sort(),
    ).toEqual(beforeIds);
    expect(getLearningSnapshot().map((e) => e.id)).toEqual(["l1"]);
  });

  it("when the safety copy cannot be made, nothing changes and no success is returned", async () => {
    await seed();
    const fileBefore = JSON.parse(JSON.stringify(fake.file));
    const memBefore = sorted(getSederSnapshot());
    fake.writes = [];
    const real = JSON.stringify;
    const spy = vi.spyOn(JSON, "stringify").mockImplementation(((v: unknown, ...r: unknown[]) => {
      if (v && typeof v === "object" && "attendance" in v && "learning" in v)
        throw new Error("no copy");
      return (real as (...a: unknown[]) => string)(v, ...r);
    }) as typeof JSON.stringify);
    let err: unknown;
    try {
      err = await replaceEverything([sed({ id: "x1" })], []).catch((e) => e);
    } finally {
      spy.mockRestore();
    }
    expect(err).toBeInstanceOf(BackupActionError);
    expect((err as BackupActionError).stage).toBe("write");
    expect(fake.writes).toHaveLength(0);
    expect(fake.file).toEqual(fileBefore);
    expect(sorted(getSederSnapshot())).toEqual(memBefore);
    expect(listSnapshots()).toHaveLength(0);
  });

  it("an empty store needs no safety copy and still restores", async () => {
    const out = await replaceEverything([sed({ id: "x1" })], []);
    expect(out.snapshot).toBeNull();
    expect(getSederSnapshot().map((e) => e.id)).toEqual(["x1"]);
  });

  it("an unreadable file after the write is 'saved but not verified', not success", async () => {
    await seed();
    fake.writes = [];
    fake.loadThrowsAfterWrite = true;
    const err = await replaceEverything([sed({ id: "x1" })], []).catch((e) => e);
    expect(err).toBeInstanceOf(BackupActionError);
    expect(err.stage).toBe("verify");
    expect(err.message).toContain("נשמרה אך");
  });

  it("a missing safety copy in the read-back is a verify failure", async () => {
    await seed();
    fake.tamper = (f) => ({ ...f, snapshots: [] });
    const err = await replaceEverything([sed({ id: "x1" })], []).catch((e) => e);
    expect(err.stage).toBe("verify");
  });
});

describe("fresh read before a replace", () => {
  it("a record another window wrote after this window's last load is in the safety copy, and restoring brings it back", async () => {
    await seed();
    const theirs = sed({ id: "other-window", date: "2026-07-10", seder: 2 });
    fake.file = { ...fake.file, seder: [...(fake.file.seder as SederEntry[]), theirs] };
    expect(getSederSnapshot().map((e) => e.id)).not.toContain("other-window");
    const out = await replaceEverything([sed({ id: "n1", date: "2026-05-01" })], []);
    const copy = (fake.file.snapshots as { id: string; payload: unknown }[]).find(
      (s) => s.id === out.snapshot!.id,
    )!;
    const ids = (copy.payload as { attendance: { id: string }[] }).attendance.map((e) => e.id);
    expect(ids).toContain("other-window");
    const a = analyzeBackup(copy.payload);
    await replaceEverything(a.seder, a.learning);
    expect(getSederSnapshot().map((e) => e.id)).toContain("other-window");
    expect((fake.file.seder as SederEntry[]).map((e) => e.id)).toContain("other-window");
  });

  it("a failed fresh read rejects before anything is written: no write, no memory change, no success (replace and clearAllData)", async () => {
    await seed();
    const memBefore = sorted(getSederSnapshot());
    fake.writes = [];
    fake.loadThrows = true;
    const err = await replaceEverything([sed({ id: "n1" })], []).catch((e) => e);
    expect(err).toBeInstanceOf(BackupActionError);
    expect(err.stage).toBe("write");
    const err2 = await deleteEverything().catch((e) => e);
    expect(err2).toBeInstanceOf(BackupActionError);
    expect(err2.stage).toBe("write");
    expect(fake.writes).toHaveLength(0);
    expect(sorted(getSederSnapshot())).toEqual(memBefore);
    expect(getLearningSnapshot()).toHaveLength(1);
    expect(listSnapshots()).toHaveLength(0);
  });
});
