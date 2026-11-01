import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./store-bridge", () => ({
  loadStore: vi.fn(async () => ({})),
  storeStamp: vi.fn(async () => "0"),
  saveStoreKey: vi.fn(async () => ({ ok: true, updatedAt: 1 })),
  saveStoreKeys: vi.fn(async () => ({ ok: true, updatedAt: 1 })),
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

import { attendanceBlockedMessage, attendanceBlockedReason } from "./attendance-day";
import { isErevYomTov, isYomTov } from "./hebrew-calendar";
import { toISO } from "./quick-day";
import { useSeder, ValidationError, type SederEntry } from "./kollel-store";

/** The first date from `from` onward (noon local) for which `pred` holds. */
function firstDate(from: string, pred: (d: Date) => boolean): string {
  const d = new Date(`${from}T12:00:00`);
  for (let i = 0; i < 400; i++, d.setDate(d.getDate() + 1)) if (pred(d)) return toISO(d);
  throw new Error("no such date");
}

const SUN = firstDate("2026-06-01", (d) => d.getDay() === 0);
const FRI = firstDate("2026-06-01", (d) => d.getDay() === 5);
const SAT = firstDate("2026-06-01", (d) => d.getDay() === 6);
const YOM_TOV = firstDate("2026-09-01", (d) => isYomTov(d) && d.getDay() >= 0 && d.getDay() <= 4);
const EREV = firstDate("2026-09-01", (d) => isErevYomTov(d) && d.getDay() <= 4);
// An ordinary Tuesday in a month with no festival.
const TUE = firstDate("2026-06-02", (d) => d.getDay() === 2);

const mk = (o: Partial<SederEntry> = {}): SederEntry => ({
  id: "x",
  date: TUE,
  seder: 1,
  absent: false,
  ohevei: false,
  excusedAll: false,
  excusedMinutes: 0,
  manualAdjustMin: 0,
  tags: [],
  ...o,
});

describe("attendanceBlockedReason", () => {
  it("blocks Friday, Saturday, Yom Tov and the eve of Yom Tov, with a reason", () => {
    expect(attendanceBlockedReason(FRI)).toBe("ביום שישי");
    expect(attendanceBlockedReason(SAT)).toBe("בשבת");
    expect(attendanceBlockedReason(YOM_TOV)).toBe("ביום טוב");
    expect(attendanceBlockedReason(EREV)).toBe("בערב יום טוב");
  });
  it("allows an ordinary day, and does not judge a date that does not parse", () => {
    expect(attendanceBlockedReason(SUN)).toBeNull();
    expect(attendanceBlockedReason(TUE)).toBeNull();
    expect(attendanceBlockedReason("not-a-date")).toBeNull();
    expect(attendanceBlockedMessage(TUE)).toBeNull();
    expect(attendanceBlockedMessage(SAT)).toMatch(/בשבת לא רושמים נוכחות/);
  });
});

describe("useSeder().upsert", () => {
  beforeEach(() => useSeder().clearAll());

  it("refuses a new record on a weekend or Yom Tov, and stores nothing", () => {
    for (const date of [FRI, SAT, YOM_TOV, EREV]) {
      expect(() => useSeder().upsert(mk({ id: `n-${date}`, date }))).toThrow(ValidationError);
    }
    expect(useSeder().entries).toHaveLength(0);
  });

  it("refuses moving an existing record onto such a day", () => {
    useSeder().upsert(mk({ id: "a" }));
    expect(() => useSeder().upsert(mk({ id: "a", date: SAT }))).toThrow(ValidationError);
    expect(useSeder().entries[0].date).toBe(TUE);
  });

  it("still saves ordinary days, and lets a record that is already on such a day be edited in place", () => {
    useSeder().upsert(mk({ id: "ok" }));
    expect(useSeder().entries).toHaveLength(1);
    // Legacy / imported record that predates the rule: reachable through replaceAll.
    useSeder().replaceAll([mk({ id: "old", date: SAT })]);
    expect(useSeder().entries).toHaveLength(1);
    expect(() => useSeder().upsert(mk({ id: "old", date: SAT, note: "edited" }))).not.toThrow();
    expect(useSeder().entries[0].note).toBe("edited");
  });
});

describe("undoing a deletion", () => {
  beforeEach(() => useSeder().clearAll());

  it("puts back a record that sits on a weekend, as it was", () => {
    useSeder().replaceAll([mk({ id: "old", date: SAT })]);
    const old = useSeder().entries[0];
    useSeder().remove("old");
    expect(() => useSeder().upsert(old)).toThrow(ValidationError);
    useSeder().upsert(old, { restore: true });
    expect(useSeder().entries.map((e) => e.id)).toEqual(["old"]);
  });
});

describe("undo after the day was filled in again", () => {
  beforeEach(() => useSeder().clearAll());

  it("does not put a second record on the same day and seder", () => {
    useSeder().upsert(mk({ id: "first" }));
    const first = useSeder().entries.find((e) => e.id === "first")!;
    useSeder().remove("first");
    useSeder().upsert(mk({ id: "second" }));
    expect(() => useSeder().upsert(first, { restore: true })).toThrow(ValidationError);
    expect(useSeder().entries.map((e) => e.id)).toEqual(["second"]);
  });
});
