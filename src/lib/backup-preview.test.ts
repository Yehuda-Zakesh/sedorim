import { describe, it, expect } from "vitest";

import { describePreview } from "./backup-preview";
import type { BackupPreview, StoreSummary } from "./store-bridge";

const summary = (o: Partial<StoreSummary> = {}): StoreSummary => ({
  sederCount: 0,
  learningCount: 0,
  attendanceFirst: null,
  attendanceLast: null,
  learningFirst: null,
  learningLast: null,
  hasSettings: false,
  hasOnboarded: false,
  onboarded: false,
  hasTimer: false,
  hasSnapshots: false,
  snapshotsCount: 0,
  unknownKeys: [],
  updatedAt: null,
  ...o,
});

const preview = (o: Partial<BackupPreview> = {}): BackupPreview => ({
  name: "sedorim-data.1700000000000.json",
  ts: 1_700_000_000_000,
  size: 100,
  backup: summary(),
  currentStatus: "ok",
  current: summary(),
  currentError: null,
  ...o,
});

describe("describePreview", () => {
  it("says what the backup holds: counts, period, settings, snapshots, unknown keys", () => {
    const t = describePreview(
      preview({
        backup: summary({
          sederCount: 12,
          attendanceFirst: "2024-01-02",
          attendanceLast: "2024-03-05",
          learningCount: 3,
          learningFirst: "2024-02-10",
          learningLast: "2024-02-10",
          hasSettings: true,
          hasOnboarded: true,
          onboarded: true,
          hasSnapshots: true,
          snapshotsCount: 4,
          unknownKeys: ["futureThing"],
        }),
      }),
    );
    const all = t.backup.join("\n");
    expect(all).toContain("12 רשומות נוכחות (מ-2024-01-02 עד 2024-03-05)");
    expect(all).toContain("3 רשומות לימוד (2024-02-10)");
    expect(all).toContain("הגדרות: כלולות");
    expect(all).toContain("מצב היכרות: כלול (הושלם)");
    expect(all).toContain("טיימר פעיל: אין");
    expect(all).toContain("גיבויים פנימיים (תמונות מצב): 4");
    expect(all).toContain("futureThing");
  });

  it("names what the restore would leave out of the current file", () => {
    const t = describePreview(
      preview({
        backup: summary({ sederCount: 2, learningCount: 1 }),
        current: summary({
          sederCount: 5,
          learningCount: 1,
          hasSettings: true,
          hasOnboarded: true,
          hasTimer: true,
          hasSnapshots: true,
          snapshotsCount: 2,
          unknownKeys: ["x"],
        }),
      }),
    );
    const missing = t.missing.join("\n");
    expect(t.current).toContain("5 רשומות נוכחות");
    expect(missing).toContain("3 לפחות לא יהיו");
    expect(missing).toContain("ההגדרות הנוכחיות");
    expect(missing).toContain("מצב ההיכרות");
    expect(missing).toContain("טיימר");
    expect(missing).toContain("גיבויים פנימיים");
    expect(missing).toContain("x");
    expect(t.replaced.length).toBeGreaterThan(0);
  });

  it("warns about an empty backup", () => {
    expect(describePreview(preview()).missing[0]).toContain("הגיבוי ריק");
  });

  it("explains a missing or damaged current file", () => {
    expect(describePreview(preview({ currentStatus: "missing", current: null })).current).toContain(
      "אין כרגע קובץ",
    );
    const t = describePreview(
      preview({ currentStatus: "unreadable", current: null, currentError: "bad json" }),
    );
    expect(t.current).toContain("פגום");
    expect(t.current).toContain("bad json");
    expect(t.replaced).toEqual([]);
  });
});
