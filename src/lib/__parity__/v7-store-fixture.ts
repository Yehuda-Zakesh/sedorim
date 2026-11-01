// A realistic data file as the previous release (v7) writes it: every key the
// app stores, a running timer, custom settings, schedule and overrides, a
// snapshot, notification bookkeeping — and a key this version has never heard
// of, which an upgrade has to carry through untouched. Synthetic; no personal
// data. Used by the preservation tests and, with SEDORIM_FIXTURE_OUT set, to lay
// the file down for a test of the real EXE (see v7-store-fixture.test.ts).
import { planSnapshot } from "../auto-backup";
import { DEFAULT_SETTINGS } from "../settings-store";
import { buildFixtures } from "./fixtures";

/** Fixed, so the file is byte-for-byte reproducible. */
export const FIXTURE_NOW = Date.UTC(2026, 9, 31, 9, 0, 0);

export function buildV7StoreFile(): Record<string, unknown> {
  const { entries, lessons } = buildFixtures();
  const settings = {
    ...DEFAULT_SETTINGS,
    profile: { name: "תלמיד לדוגמה", classroom: "שיעור ב׳" },
    seder: { ...DEFAULT_SETTINGS.seder, shasChavura: true },
    sederSchedule: [
      {
        id: "base-1",
        effectiveFrom: "0001-01-01",
        times: { s1Start: "09:00", s1End: "13:00", s2Start: "15:45", s2End: "19:30" },
      },
      {
        id: "sched-2",
        effectiveFrom: "2026-09-01",
        times: { s1Start: "09:15", s1End: "13:00", s2Start: "15:45", s2End: "19:30" },
      },
    ],
    sederOverrides: [
      {
        id: "ov-1",
        from: "2026-08-10",
        to: "2026-08-14",
        label: "שבוע מיוחד",
        times: { s1Start: "09:30", s1End: "12:30", s2Start: "16:00", s2End: "19:00" },
      },
    ],
    stipend: { approvedMonths: ["2026-04", "2026-07"] },
    appearance: {
      ...DEFAULT_SETTINGS.appearance,
      colorTheme: "teal",
      fontSize: "large",
      background: "cream",
      compactMode: true,
    },
  };
  // The id and time of a snapshot come from the clock; fixed here so the file is reproducible.
  const built = planSnapshot(
    { attendance: entries.slice(0, 40), learning: lessons.slice(0, 10) },
    "auto",
  )!.snap;
  const snapshot = { ...built, id: "snap-fixture-1", ts: FIXTURE_NOW - 3_600_000 };
  return {
    seder: entries,
    learning: lessons,
    // Running, with time already accumulated: the case an upgrade must not reset.
    timer: {
      framework: "kollel-erev",
      startedAt: FIXTURE_NOW - 25 * 60_000,
      accumulatedMs: 12 * 60_000,
      limitMinutes: 90,
      tanitDibur: true,
    },
    settings,
    theme: "dark",
    onboarded: true,
    snapshots: [snapshot],
    lastAutoBackupAt: FIXTURE_NOW - 3 * 3_600_000,
    notificationsSent: { "2026-10-30:daily": FIXTURE_NOW - 86_400_000 },
    notificationLearning: { daily: { shown: 4, answered: 3 } },
    backgroundPlan: { generatedAt: FIXTURE_NOW - 3_600_000, items: [] },
    phoneReport: { reportedMonths: ["2026-09"] },
    // Not a key this version knows. Upgrading must keep it exactly.
    someFutureKey: { nested: [1, 2, { three: "שלוש" }], flag: true },
    updatedAt: FIXTURE_NOW - 60_000,
  };
}
