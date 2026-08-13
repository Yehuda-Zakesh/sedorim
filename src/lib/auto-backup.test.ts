// In-app snapshots and the auto-backup clock. Both live in module scope and
// the clock has no setter, so each test gets a freshly imported copy of the
// module graph rather than trying to wind it back.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

let backup: typeof import("./auto-backup");
let settings: typeof import("./settings-store");

const DAY = 86_400_000;
const payload = (n = 1) => ({
  attendance: Array.from({ length: n }, (_, i) => ({ id: `s${i}`, date: "2026-07-08" })),
  learning: [{ id: "l1", minutes: 60 }],
});

beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 6, 8, 12, 0));
  // Imported together so both halves see the same fresh module instances.
  backup = await import("./auto-backup");
  settings = await import("./settings-store");
});

afterEach(() => {
  vi.useRealTimers();
});

// ============================================================================
// createSnapshot
// ============================================================================

describe("createSnapshot", () => {
  it("returns a snapshot describing what it stored", () => {
    const snap = backup.createSnapshot(payload(), "manual");
    expect(snap.trigger).toBe("manual");
    expect(snap.ts).toBe(Date.now());
    expect(snap.id).toMatch(/^\d+-[a-z0-9]{1,4}$/);
    expect(snap.payload).toEqual(payload());
  });

  it("records the serialized size", () => {
    const data = payload(3);
    expect(backup.createSnapshot(data).size).toBe(JSON.stringify(data).length);
  });

  it("defaults its trigger to auto", () => {
    expect(backup.createSnapshot(payload()).trigger).toBe("auto");
  });

  it("accepts each trigger the type allows", () => {
    for (const trigger of ["auto", "manual", "before-op"] as const) {
      expect(backup.createSnapshot(payload(), trigger).trigger).toBe(trigger);
    }
  });

  it("adds the snapshot to the list, newest first", () => {
    const first = backup.createSnapshot(payload(1), "manual");
    vi.advanceTimersByTime(1000);
    const second = backup.createSnapshot(payload(2), "manual");
    expect(backup.listSnapshots().map((s) => s.id)).toEqual([second.id, first.id]);
  });

  it("gives every snapshot a distinct id", () => {
    const ids = Array.from({ length: 50 }, () => backup.createSnapshot(payload(), "manual").id);
    expect(new Set(ids).size).toBe(50);
  });

  it("stores an empty payload happily", () => {
    const snap = backup.createSnapshot({ attendance: [], learning: [] }, "manual");
    expect(backup.verifySnapshot(snap)).toBe(true);
  });
});

// ============================================================================
// verifySnapshot
// ============================================================================

describe("verifySnapshot", () => {
  it("accepts a snapshot that has not been touched", () => {
    expect(backup.verifySnapshot(backup.createSnapshot(payload(), "manual"))).toBe(true);
  });

  it("rejects one whose payload was altered", () => {
    const snap = backup.createSnapshot(payload(), "manual");
    const tampered = { ...snap, payload: { attendance: [], learning: [] } };
    expect(backup.verifySnapshot(tampered)).toBe(false);
  });

  it("rejects one whose checksum was altered", () => {
    const snap = backup.createSnapshot(payload(), "manual");
    expect(backup.verifySnapshot({ ...snap, checksum: "deadbeef" })).toBe(false);
  });

  it("notices a single changed character deep in the payload", () => {
    const snap = backup.createSnapshot(payload(4), "manual");
    const attendance = (snap.payload.attendance as Array<{ id: string; date: string }>).map(
      (e) => ({ ...e }),
    );
    attendance[2].date = "2026-07-09";
    expect(backup.verifySnapshot({ ...snap, payload: { ...snap.payload, attendance } })).toBe(
      false,
    );
  });

  it("gives identical payloads the same checksum", () => {
    const a = backup.createSnapshot(payload(2), "manual");
    const b = backup.createSnapshot(payload(2), "manual");
    expect(b.checksum).toBe(a.checksum);
  });

  it("gives different payloads different checksums", () => {
    const a = backup.createSnapshot(payload(2), "manual");
    const b = backup.createSnapshot(payload(3), "manual");
    expect(b.checksum).not.toBe(a.checksum);
  });

  it("survives Hebrew text in the payload", () => {
    const snap = backup.createSnapshot(
      { attendance: [{ note: "נסיעה לרופא" }], learning: [] },
      "manual",
    );
    expect(backup.verifySnapshot(snap)).toBe(true);
  });
});

// ============================================================================
// Retention
// ============================================================================

describe("retention", () => {
  it("keeps at most backupRetention snapshots", () => {
    expect(settings.getSettings().data.backupRetention).toBe(5);
    for (let i = 0; i < 8; i++) {
      vi.advanceTimersByTime(1000);
      backup.createSnapshot(payload(i + 1), "manual");
    }
    expect(backup.listSnapshots()).toHaveLength(5);
  });

  it("drops the oldest ones", () => {
    const ids: string[] = [];
    for (let i = 0; i < 8; i++) {
      vi.advanceTimersByTime(1000);
      ids.push(backup.createSnapshot(payload(i + 1), "manual").id);
    }
    const kept = backup.listSnapshots().map((s) => s.id);
    expect(kept).toEqual(ids.slice(-5).reverse());
    expect(kept).not.toContain(ids[0]);
  });

  it("follows a raised retention setting", () => {
    settings.updateSettings({ data: { ...settings.getSettings().data, backupRetention: 10 } });
    for (let i = 0; i < 12; i++) {
      vi.advanceTimersByTime(1000);
      backup.createSnapshot(payload(), "manual");
    }
    expect(backup.listSnapshots()).toHaveLength(10);
  });

  it("keeps at least one snapshot even if retention is set to zero", () => {
    settings.updateSettings({ data: { ...settings.getSettings().data, backupRetention: 0 } });
    backup.createSnapshot(payload(1), "manual");
    vi.advanceTimersByTime(1000);
    const last = backup.createSnapshot(payload(2), "manual");
    expect(backup.listSnapshots().map((s) => s.id)).toEqual([last.id]);
  });

  it("ignores a negative retention the same way", () => {
    settings.updateSettings({ data: { ...settings.getSettings().data, backupRetention: -3 } });
    backup.createSnapshot(payload(), "manual");
    expect(backup.listSnapshots()).toHaveLength(1);
  });
});

// ============================================================================
// deleteSnapshot / clearAllSnapshots
// ============================================================================

describe("deleteSnapshot", () => {
  it("removes just the one asked for", () => {
    const a = backup.createSnapshot(payload(1), "manual");
    vi.advanceTimersByTime(1000);
    const b = backup.createSnapshot(payload(2), "manual");
    backup.deleteSnapshot(a.id);
    expect(backup.listSnapshots().map((s) => s.id)).toEqual([b.id]);
  });

  it("ignores an unknown id", () => {
    backup.createSnapshot(payload(), "manual");
    backup.deleteSnapshot("no-such-id");
    expect(backup.listSnapshots()).toHaveLength(1);
  });
});

describe("clearAllSnapshots", () => {
  it("empties the list", () => {
    backup.createSnapshot(payload(), "manual");
    vi.advanceTimersByTime(1000);
    backup.createSnapshot(payload(), "manual");
    backup.clearAllSnapshots();
    expect(backup.listSnapshots()).toEqual([]);
  });

  it("is safe on an empty list", () => {
    backup.clearAllSnapshots();
    expect(() => backup.clearAllSnapshots()).not.toThrow();
  });

  it("does not stop new snapshots afterwards", () => {
    backup.clearAllSnapshots();
    expect(backup.listSnapshots()).toHaveLength(0);
    backup.createSnapshot(payload(), "manual");
    expect(backup.listSnapshots()).toHaveLength(1);
  });
});

// ============================================================================
// maybeAutoBackup
// ============================================================================

describe("maybeAutoBackup", () => {
  it("does nothing when auto-backup is off", () => {
    settings.updateSettings({ data: { ...settings.getSettings().data, autoBackup: "off" } });
    backup.maybeAutoBackup(payload());
    expect(backup.listSnapshots()).toEqual([]);
    expect(backup.getLastAutoBackupTs()).toBe(0);
  });

  it("takes the first backup straight away", () => {
    settings.updateSettings({ data: { ...settings.getSettings().data, autoBackup: "daily" } });
    expect(backup.getLastAutoBackupTs()).toBe(0);
    backup.maybeAutoBackup(payload());
    expect(backup.listSnapshots()).toHaveLength(1);
    expect(backup.listSnapshots()[0].trigger).toBe("auto");
  });

  it("stamps the clock when it backs up", () => {
    settings.updateSettings({ data: { ...settings.getSettings().data, autoBackup: "daily" } });
    backup.maybeAutoBackup(payload());
    expect(backup.getLastAutoBackupTs()).toBe(Date.now());
  });

  it("does not back up twice inside the daily interval", () => {
    settings.updateSettings({ data: { ...settings.getSettings().data, autoBackup: "daily" } });
    backup.maybeAutoBackup(payload());
    vi.advanceTimersByTime(DAY - 1000);
    backup.maybeAutoBackup(payload());
    expect(backup.listSnapshots()).toHaveLength(1);
  });

  it("backs up again once a day has passed", () => {
    settings.updateSettings({ data: { ...settings.getSettings().data, autoBackup: "daily" } });
    backup.maybeAutoBackup(payload());
    vi.advanceTimersByTime(DAY + 1000);
    backup.maybeAutoBackup(payload());
    expect(backup.listSnapshots()).toHaveLength(2);
  });

  it("waits a week on the weekly setting", () => {
    settings.updateSettings({ data: { ...settings.getSettings().data, autoBackup: "weekly" } });
    backup.maybeAutoBackup(payload());
    expect(backup.listSnapshots()).toHaveLength(1);

    vi.advanceTimersByTime(6 * DAY);
    backup.maybeAutoBackup(payload());
    expect(backup.listSnapshots()).toHaveLength(1);

    vi.advanceTimersByTime(1 * DAY + 1000);
    backup.maybeAutoBackup(payload());
    expect(backup.listSnapshots()).toHaveLength(2);
  });

  it("is not tripped by a run of mutations", () => {
    // maybeAutoBackup runs on *every* upsert, so the interval gate is what
    // stops a busy afternoon filling the snapshot list.
    settings.updateSettings({ data: { ...settings.getSettings().data, autoBackup: "daily" } });
    for (let i = 0; i < 50; i++) {
      vi.advanceTimersByTime(60_000);
      backup.maybeAutoBackup(payload(i + 1));
    }
    expect(backup.listSnapshots()).toHaveLength(1);
  });

  it("stamps the clock before taking the snapshot", () => {
    // Deliberate ordering: were it the other way round, a failure mid-write
    // would leave the clock unset and re-trigger on every single mutation.
    settings.updateSettings({ data: { ...settings.getSettings().data, autoBackup: "daily" } });
    backup.maybeAutoBackup(payload());
    expect(backup.getLastAutoBackupTs()).toBe(backup.listSnapshots()[0].ts);
  });

  it("still honours the retention cap", () => {
    settings.updateSettings({
      data: { ...settings.getSettings().data, autoBackup: "daily", backupRetention: 3 },
    });
    for (let i = 0; i < 6; i++) {
      backup.maybeAutoBackup(payload(i + 1));
      vi.advanceTimersByTime(DAY + 1000);
    }
    expect(backup.listSnapshots()).toHaveLength(3);
  });

  it("stops as soon as the setting is turned off", () => {
    settings.updateSettings({ data: { ...settings.getSettings().data, autoBackup: "daily" } });
    backup.maybeAutoBackup(payload());
    settings.updateSettings({ data: { ...settings.getSettings().data, autoBackup: "off" } });
    vi.advanceTimersByTime(30 * DAY);
    backup.maybeAutoBackup(payload());
    expect(backup.listSnapshots()).toHaveLength(1);
  });
});

describe("getLastAutoBackupTs", () => {
  it("is 0 before any automatic backup", () => {
    expect(backup.getLastAutoBackupTs()).toBe(0);
  });

  it("is untouched by a manual snapshot", () => {
    backup.createSnapshot(payload(), "manual");
    expect(backup.getLastAutoBackupTs()).toBe(0);
  });

  it("is untouched by a before-op snapshot", () => {
    backup.createSnapshot(payload(), "before-op");
    expect(backup.getLastAutoBackupTs()).toBe(0);
  });
});
