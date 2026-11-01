import { describe, it, expect, vi, beforeEach } from "vitest";

const save = vi.hoisted(() => vi.fn());
vi.mock("./store-bridge", () => ({
  loadStore: vi.fn(async () => ({})),
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

import { useLearning, ValidationError, type LearningEntry } from "./kollel-store";

const mk = (o: Partial<LearningEntry> = {}): LearningEntry => ({
  id: "a",
  framework: "kollel-erev",
  date: "2026-07-08",
  minutes: 60,
  source: "manual",
  ...o,
});

beforeEach(() => {
  save.mockReset();
  save.mockResolvedValue({ ok: true, updatedAt: 1 });
  useLearning().clearAll();
  save.mockClear();
});

describe("useLearning().replace", () => {
  it("swaps by id with exactly one save and keeps position/id", async () => {
    const l = useLearning();
    l.add(mk({ id: "b" }));
    l.add(mk({ id: "a" }));
    save.mockClear();
    await l.replace(mk({ id: "a", minutes: 90 }));
    expect(save).toHaveBeenCalledTimes(1);
    const items = useLearning().items;
    expect(items.map((i) => i.id)).toEqual(["a", "b"]);
    expect(items[0].minutes).toBe(90);
  });

  it("validates before changing anything", () => {
    const l = useLearning();
    l.add(mk());
    save.mockClear();
    expect(() => l.replace(mk({ minutes: 1441 }))).toThrow(ValidationError);
    expect(save).not.toHaveBeenCalled();
    expect(useLearning().items[0].minutes).toBe(60);
  });

  it("rejects an unknown id", () => {
    expect(() => useLearning().replace(mk({ id: "zzz" }))).toThrow(ValidationError);
  });

  it("reports a failed save and rolls memory back", async () => {
    const l = useLearning();
    l.add(mk());
    save.mockRejectedValue(new Error("disk"));
    await expect(l.replace(mk({ minutes: 90 }))).rejects.toThrow("disk");
    expect(useLearning().items[0].minutes).toBe(60);
  });
});
