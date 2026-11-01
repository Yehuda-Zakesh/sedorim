// Two windows (the full app and the quick one) over ONE data file, with the
// real store-bridge (browser/dev transport, which merges exactly as the Rust
// side does) and the real kollel-store. Each window is its own module
// instance, so each has its own in-memory lists and its own merge base.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { LearningEntry, SederEntry } from "./kollel-store";

vi.mock("react", async (orig) => ({
  ...(await orig<typeof import("react")>()),
  useState: (v: unknown) => [v, () => {}],
  useEffect: () => {},
}));

const DEV_STORE_KEY = "sedorim.devStore.v1";

class MemoryStorage {
  private map = new Map<string, string>();
  getItem(key: string) {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  setItem(key: string, value: string) {
    this.map.set(key, String(value));
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
}

let storage: MemoryStorage;

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

function fileOf(key: "learning" | "seder"): { id: string; minutes?: number }[] {
  const raw = JSON.parse(storage.getItem(DEV_STORE_KEY)!);
  return raw[key];
}

/** A fresh "window": its own copy of every module, reading the shared file. */
async function openWindowWithConflicts() {
  vi.resetModules();
  const gate = await import("./store-gate");
  gate.setStoreGate("ready");
  const store = await import("./kollel-store");
  const conflicts = await import("./save-conflicts");
  await store.refreshFromStore();
  return { store, conflicts };
}

async function openWindow() {
  return (await openWindowWithConflicts()).store;
}

beforeEach(() => {
  storage = new MemoryStorage();
  vi.stubGlobal("localStorage", storage);
  storage.setItem(
    DEV_STORE_KEY,
    JSON.stringify({
      learning: [lrn({ id: "L1", minutes: 30 }), lrn({ id: "L2", minutes: 40 })],
      seder: [sed({ id: "S1" })],
      updatedAt: 1,
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("two windows writing the same kind of data from stale lists", () => {
  it("an add in one and an edit in the other both survive, and both windows converge", async () => {
    const full = await openWindow();
    const quick = await openWindow();

    await full.useLearning().addChecked(lrn({ id: "N1", minutes: 15 }));
    // The quick window has not polled yet: its list lacks N1.
    expect(quick.getLearningSnapshot().map((i) => i.id)).toEqual(["L1", "L2"]);
    await quick.useLearning().replace(lrn({ id: "L1", minutes: 99 }));

    const ids = fileOf("learning").map((i) => i.id);
    expect(ids.sort()).toEqual(["L1", "L2", "N1"]);
    expect(fileOf("learning").find((i) => i.id === "L1")!.minutes).toBe(99);
    // The window that wrote last adopted the other one's record straight away.
    expect(
      quick
        .getLearningSnapshot()
        .map((i) => i.id)
        .sort(),
    ).toEqual(["L1", "L2", "N1"]);
  });

  it("a delete in one window and an add in the other both apply", async () => {
    const full = await openWindow();
    const quick = await openWindow();

    await full.useLearning().removeChecked("L2");
    await quick.useLearning().addChecked(lrn({ id: "N2", minutes: 5 }));

    expect(
      fileOf("learning")
        .map((i) => i.id)
        .sort(),
    ).toEqual(["L1", "N2"]);
  });

  it("an attendance add and an edit from the two windows both survive", async () => {
    const full = await openWindow();
    const quick = await openWindow();

    await full.useSeder().upsertChecked(sed({ id: "S2", date: "2026-07-09" }));
    await quick.useSeder().upsertChecked(sed({ id: "S1", manualAdjustMin: 5 }));

    const list = fileOf("seder") as unknown as SederEntry[];
    expect(list.map((i) => i.id).sort()).toEqual(["S1", "S2"]);
    expect(list.find((i) => i.id === "S1")!.manualAdjustMin).toBe(5);
  });

  it("different records edited in the two windows both survive, with no conflict", async () => {
    const full = await openWindow();
    const { store: quick, conflicts } = await openWindowWithConflicts();

    await full.useLearning().replace(lrn({ id: "L1", minutes: 11 }));
    const outcome = await quick.useLearning().replace(lrn({ id: "L2", minutes: 22 }));

    expect(outcome.complete).toBe(true);
    expect(conflicts.getPendingConflicts()).toEqual([]);
    const list = fileOf("learning");
    expect(list.find((i) => i.id === "L1")!.minutes).toBe(11);
    expect(list.find((i) => i.id === "L2")!.minutes).toBe(22);
  });

  it("restore / delete-all still replaces everything, as the user asked", async () => {
    const full = await openWindow();
    const quick = await openWindow();

    await full.useLearning().addChecked(lrn({ id: "N3" }));
    await quick.replaceAllDataChecked([], [lrn({ id: "R1" })], { safetySnapshot: false });

    expect(fileOf("learning").map((i) => i.id)).toEqual(["R1"]);
    expect(fileOf("seder")).toEqual([]);
  });

  it("keys the file has that this build does not know are left alone", async () => {
    const raw = JSON.parse(storage.getItem(DEV_STORE_KEY)!);
    storage.setItem(DEV_STORE_KEY, JSON.stringify({ ...raw, futureThing: { x: [1] } }));
    const full = await openWindow();
    await full.useLearning().addChecked(lrn({ id: "N4" }));
    expect(JSON.parse(storage.getItem(DEV_STORE_KEY)!).futureThing).toEqual({ x: [1] });
  });
});

describe("two windows editing the same record", () => {
  // Window A saves L1 first; window B, still on the old list, then edits L1 too.
  async function bothEditL1() {
    const a = await openWindowWithConflicts();
    const b = await openWindowWithConflicts();
    await a.store.useLearning().replace(lrn({ id: "L1", minutes: 11 }));
    const outcome = await b.store.useLearning().replace(lrn({ id: "L1", minutes: 77 }));
    return { a, b, outcome };
  }

  it("does not overwrite: the file keeps the first version and the save says so", async () => {
    const { b, outcome } = await bothEditL1();
    expect(outcome.complete).toBe(false);
    expect(outcome.conflicts).toHaveLength(1);
    expect(outcome.conflicts[0]).toMatchObject({ key: "learning", id: "L1", kind: "edit-edit" });
    expect(fileOf("learning").find((i) => i.id === "L1")!.minutes).toBe(11);
    // The window adopts the file's state and parks its own version.
    expect(b.store.getLearningSnapshot().find((i) => i.id === "L1")!.minutes).toBe(11);
    const pending = b.conflicts.getPendingConflicts();
    expect(pending).toHaveLength(1);
    expect((pending[0].mine as LearningEntry).minutes).toBe(77);
    expect(b.conflicts.conflictMessage(pending[0])).toMatch(/נערך גם בחלון אחר/);
  });

  it("the other changes of the same save still apply", async () => {
    const a = await openWindowWithConflicts();
    const b = await openWindowWithConflicts();
    await a.store.useLearning().replace(lrn({ id: "L1", minutes: 11 }));
    await b.store.useLearning().replace(lrn({ id: "L1", minutes: 77 }));
    const outcome = await b.store.useLearning().addChecked(lrn({ id: "N9", minutes: 3 }));
    expect(outcome.complete).toBe(true);
    expect(fileOf("learning").map((i) => i.id)).toContain("N9");
    expect(fileOf("learning").find((i) => i.id === "L1")!.minutes).toBe(11);
  });

  it("refresh: my edit is dropped and the file's version stays", async () => {
    const { b } = await bothEditL1();
    const [c] = b.conflicts.getPendingConflicts();
    b.conflicts.refreshConflict(c.uid);
    expect(b.conflicts.getPendingConflicts()).toEqual([]);
    expect(fileOf("learning").find((i) => i.id === "L1")!.minutes).toBe(11);
    expect(b.store.getLearningSnapshot().find((i) => i.id === "L1")!.minutes).toBe(11);
  });

  it("replace: my edit is written over the file's version, explicitly", async () => {
    const { a, b } = await bothEditL1();
    const [c] = b.conflicts.getPendingConflicts();
    await b.conflicts.replaceConflict(c.uid);
    expect(b.conflicts.getPendingConflicts()).toEqual([]);
    expect(fileOf("learning").find((i) => i.id === "L1")!.minutes).toBe(77);
    expect(
      fileOf("learning")
        .map((i) => i.id)
        .sort(),
    ).toEqual(["L1", "L2"]);
    // The first window sees it on its next read, with no conflict of its own.
    await a.store.refreshFromStore();
    expect(a.store.getLearningSnapshot().find((i) => i.id === "L1")!.minutes).toBe(77);
    expect(a.conflicts.getPendingConflicts()).toEqual([]);
  });

  it("replace starts from the file as it is now, even after a third change", async () => {
    const { a, b } = await bothEditL1();
    await a.store.useLearning().replace(lrn({ id: "L1", minutes: 12 }));
    const [c] = b.conflicts.getPendingConflicts();
    await b.conflicts.replaceConflict(c.uid);
    expect(fileOf("learning").find((i) => i.id === "L1")!.minutes).toBe(77);
  });

  describe("same id added in both windows", () => {
    async function bothAddN() {
      const a = await openWindowWithConflicts();
      const b = await openWindowWithConflicts();
      await a.store.useLearning().addChecked(lrn({ id: "N", minutes: 11 }));
      return { a, b };
    }

    it("different content is a conflict, not an overwrite", async () => {
      const { b } = await bothAddN();
      const outcome = await b.store.useLearning().addChecked(lrn({ id: "N", minutes: 77 }));
      expect(outcome.complete).toBe(false);
      expect(outcome.conflicts[0]).toMatchObject({ key: "learning", id: "N", kind: "add-add" });
      expect(fileOf("learning").find((i) => i.id === "N")!.minutes).toBe(11);
      const pending = b.conflicts.getPendingConflicts();
      expect(pending).toHaveLength(1);
      expect(b.conflicts.conflictMessage(pending[0])).toMatch(/נוסף גם בחלון אחר/);
    });

    it("identical content is not a conflict", async () => {
      const { b } = await bothAddN();
      const outcome = await b.store.useLearning().addChecked(lrn({ id: "N", minutes: 11 }));
      expect(outcome.complete).toBe(true);
      expect(b.conflicts.getPendingConflicts()).toEqual([]);
      expect(fileOf("learning").filter((i) => i.id === "N")).toHaveLength(1);
    });

    it("refresh keeps the file's version", async () => {
      const { b } = await bothAddN();
      await b.store.useLearning().addChecked(lrn({ id: "N", minutes: 77 }));
      const [c] = b.conflicts.getPendingConflicts();
      b.conflicts.refreshConflict(c.uid);
      expect(b.conflicts.getPendingConflicts()).toEqual([]);
      expect(fileOf("learning").find((i) => i.id === "N")!.minutes).toBe(11);
    });

    it("replace explicitly keeps mine", async () => {
      const { b } = await bothAddN();
      await b.store.useLearning().addChecked(lrn({ id: "N", minutes: 88 }));
      const [c] = b.conflicts.getPendingConflicts();
      await b.conflicts.replaceConflict(c.uid);
      expect(b.conflicts.getPendingConflicts()).toEqual([]);
      expect(fileOf("learning").find((i) => i.id === "N")!.minutes).toBe(88);
    });
  });

  it("edit against delete: the record stays deleted and my edit waits", async () => {
    const a = await openWindowWithConflicts();
    const b = await openWindowWithConflicts();
    await a.store.useLearning().removeChecked("L1");
    const outcome = await b.store.useLearning().replace(lrn({ id: "L1", minutes: 77 }));
    expect(outcome.complete).toBe(false);
    expect(outcome.conflicts[0]).toMatchObject({ kind: "edit-deleted", theirs: null });
    expect(fileOf("learning").map((i) => i.id)).toEqual(["L2"]);
    expect(b.store.getLearningSnapshot().map((i) => i.id)).toEqual(["L2"]);
    // Replace brings my version back.
    await b.conflicts.replaceConflict(b.conflicts.getPendingConflicts()[0].uid);
    expect(fileOf("learning").find((i) => i.id === "L1")!.minutes).toBe(77);
  });

  it("delete against edit: the other window's edit stays and my delete waits", async () => {
    const a = await openWindowWithConflicts();
    const b = await openWindowWithConflicts();
    await a.store.useLearning().replace(lrn({ id: "L1", minutes: 11 }));
    const outcome = await b.store.useLearning().removeChecked("L1");
    expect(outcome.complete).toBe(false);
    expect(outcome.conflicts[0]).toMatchObject({ kind: "deleted-edited", mine: null });
    expect(fileOf("learning").find((i) => i.id === "L1")!.minutes).toBe(11);
    expect(b.store.getLearningSnapshot().some((i) => i.id === "L1")).toBe(true);
    // Replace carries out my delete.
    await b.conflicts.replaceConflict(b.conflicts.getPendingConflicts()[0].uid);
    expect(fileOf("learning").map((i) => i.id)).toEqual(["L2"]);
  });

  it("attendance conflicts are reported the same way, and runSave does not call them saved", async () => {
    const a = await openWindowWithConflicts();
    const b = await openWindowWithConflicts();
    await a.store.useSeder().upsertChecked(sed({ id: "S1", manualAdjustMin: 5 }));
    const { runSave } = await import("./journal-save");
    const { CONFLICT_SAVE_TEXT } = await import("./save-conflicts");
    const result = await runSave(() =>
      b.store.useSeder().upsertChecked(sed({ id: "S1", manualAdjustMin: 9 })),
    );
    expect(result).toBe(CONFLICT_SAVE_TEXT);
    expect((fileOf("seder") as unknown as SederEntry[])[0].manualAdjustMin).toBe(5);
  });
});
