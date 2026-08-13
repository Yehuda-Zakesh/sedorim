import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  logAudit,
  getAuditEntries,
  clearAudit,
  ACTION_LABELS,
  type AuditAction,
} from "./audit-store";

/** Every action the union allows — kept here so a new one has to be labelled. */
const ALL_ACTIONS: AuditAction[] = [
  "seder.create",
  "seder.update",
  "seder.delete",
  "learning.create",
  "learning.delete",
  "learning.timer_start",
  "learning.timer_stop",
  "settings.update",
  "backup.export",
  "backup.import",
  "backup.auto",
  "backup.restore",
  "backup.delete_db",
  "backup.reset_settings",
  "backup.download_source",
  "report.export",
  "data.validation_failed",
];

const MAX = 1000;

beforeEach(() => {
  clearAudit();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("logAudit", () => {
  it("starts from an empty log", () => {
    expect(getAuditEntries()).toEqual([]);
  });

  it("records the action", () => {
    logAudit("seder.create");
    expect(getAuditEntries()).toHaveLength(1);
    expect(getAuditEntries()[0].action).toBe("seder.create");
  });

  it("puts the newest entry first", () => {
    logAudit("seder.create");
    logAudit("seder.update");
    logAudit("seder.delete");
    expect(getAuditEntries().map((e) => e.action)).toEqual([
      "seder.delete",
      "seder.update",
      "seder.create",
    ]);
  });

  it("stamps each entry with an id and a timestamp", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 8, 12, 0));
    logAudit("settings.update");
    const [entry] = getAuditEntries();
    expect(entry.ts).toBe(Date.now());
    expect(entry.id).toMatch(/^\d+-[a-z0-9]{1,6}$/);
  });

  it("gives every entry a distinct id", () => {
    for (let i = 0; i < 500; i++) logAudit("seder.create");
    expect(new Set(getAuditEntries().map((e) => e.id)).size).toBe(500);
  });

  it("carries the payload through unchanged", () => {
    const oldValue = { id: "x", arrival: "09:00" };
    const newValue = { id: "x", arrival: "09:30" };
    logAudit("seder.update", { recordId: "x", oldValue, newValue, detail: "שינוי שעת הגעה" });

    const [entry] = getAuditEntries();
    expect(entry.recordId).toBe("x");
    expect(entry.oldValue).toEqual(oldValue);
    expect(entry.newValue).toEqual(newValue);
    expect(entry.detail).toBe("שינוי שעת הגעה");
  });

  it("works with no payload at all", () => {
    logAudit("backup.export");
    const [entry] = getAuditEntries();
    expect(entry.recordId).toBeUndefined();
    expect(entry.oldValue).toBeUndefined();
    expect(entry.newValue).toBeUndefined();
    expect(entry.detail).toBeUndefined();
  });

  it("accepts every action in the union", () => {
    for (const action of ALL_ACTIONS) logAudit(action);
    expect(getAuditEntries()).toHaveLength(ALL_ACTIONS.length);
    expect(new Set(getAuditEntries().map((e) => e.action)).size).toBe(ALL_ACTIONS.length);
  });

  it("keeps Hebrew detail text intact", () => {
    logAudit("data.validation_failed", { detail: "שעת יציאה לפני שעת הגעה" });
    expect(getAuditEntries()[0].detail).toBe("שעת יציאה לפני שעת הגעה");
  });

  it("relies on its type, not on runtime checks, to own id and ts", () => {
    // The payload is spread last, so a caller who casts past
    // Omit<AuditEntry, "id" | "ts" | "action"> can overwrite both. Recorded
    // here so the behaviour is not mistaken for a runtime guarantee — every
    // real caller passes only recordId/oldValue/newValue/detail.
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 8, 12, 0));
    logAudit("seder.create", { id: "forged", ts: 1 } as never);
    const [entry] = getAuditEntries();
    expect(entry.id).toBe("forged");
    expect(entry.ts).toBe(1);
  });

  it("stamps id and ts itself for every real caller", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 8, 12, 0));
    logAudit("seder.update", { recordId: "x", detail: "d", oldValue: 1, newValue: 2 });
    const [entry] = getAuditEntries();
    expect(entry.ts).toBe(Date.now());
    expect(entry.id).toMatch(/^\d+-[a-z0-9]{1,6}$/);
  });
});

describe("the log's cap", () => {
  it(`keeps at most ${MAX} entries`, () => {
    for (let i = 0; i < MAX + 5; i++) logAudit("seder.create", { recordId: String(i) });
    expect(getAuditEntries()).toHaveLength(MAX);
  });

  it("drops the oldest entries, not the newest", () => {
    for (let i = 0; i < MAX + 5; i++) logAudit("seder.create", { recordId: String(i) });
    const ids = getAuditEntries().map((e) => e.recordId);
    expect(ids[0]).toBe(String(MAX + 4)); // the newest survives
    expect(ids.at(-1)).toBe(String(5)); // the first five are gone
    expect(ids).not.toContain("0");
  });

  it("stays capped however many more arrive", () => {
    for (let i = 0; i < MAX * 2; i++) logAudit("seder.update");
    expect(getAuditEntries()).toHaveLength(MAX);
  });
});

describe("clearAudit", () => {
  it("empties the log", () => {
    logAudit("seder.create");
    logAudit("seder.update");
    clearAudit();
    expect(getAuditEntries()).toEqual([]);
  });

  it("is safe on an already-empty log", () => {
    clearAudit();
    expect(() => clearAudit()).not.toThrow();
    expect(getAuditEntries()).toEqual([]);
  });

  it("does not stop later entries being recorded", () => {
    logAudit("seder.create");
    clearAudit();
    logAudit("seder.delete");
    expect(getAuditEntries().map((e) => e.action)).toEqual(["seder.delete"]);
  });
});

describe("ACTION_LABELS", () => {
  it("labels every action, and nothing else", () => {
    expect(Object.keys(ACTION_LABELS).sort()).toEqual([...ALL_ACTIONS].sort());
  });

  it("gives each action a non-empty Hebrew label", () => {
    for (const action of ALL_ACTIONS) {
      expect(ACTION_LABELS[action], action).toBeTruthy();
      expect(ACTION_LABELS[action].length, action).toBeGreaterThan(2);
    }
  });

  it("does not reuse one label for two actions", () => {
    const labels = Object.values(ACTION_LABELS);
    expect(new Set(labels).size).toBe(labels.length);
  });
});
