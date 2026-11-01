import { getSettings } from "./settings-store";
import { sharedValue } from "./shared-state";
import { isStoreWritable } from "./store-gate";

export type BackupSnapshot = {
  id: string;
  ts: number;
  trigger: "auto" | "manual" | "before-op";
  size: number;
  checksum: string;
  payload: { attendance: unknown; learning: unknown };
};

// Both in the shared data file, so the snapshot list and the auto-backup
// clock are the same whichever EXE you look from. See shared-state.ts.
const store = sharedValue<BackupSnapshot[]>({
  key: "snapshots",
  legacyKey: "tracker.backups.v1",
  fallback: [],
  parse: (raw) => (Array.isArray(raw) ? (raw as BackupSnapshot[]) : []),
});

const lastAutoBackup = sharedValue<number>({
  key: "lastAutoBackupAt",
  legacyKey: "tracker.backups.meta.v1",
  fallback: 0,
  parse: (raw) => {
    const ts = typeof raw === "string" ? parseInt(raw, 10) : raw;
    return typeof ts === "number" && Number.isFinite(ts) ? ts : 0;
  },
});

function checksum(text: string): string {
  let h = 0;
  for (let i = 0; i < text.length; i++) {
    h = (h << 5) - h + text.charCodeAt(i);
    h |= 0;
  }
  return (h >>> 0).toString(16);
}

type SnapshotData = { attendance: unknown; learning: unknown };

/** True when there is no attendance and no learning at all. */
export function isEmptyData(data: SnapshotData): boolean {
  const len = (v: unknown) => (Array.isArray(v) ? v.length : 0);
  return len(data.attendance) + len(data.learning) === 0;
}

function buildSnapshot(data: SnapshotData, trigger: BackupSnapshot["trigger"]): BackupSnapshot {
  const payloadStr = JSON.stringify(data);
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    ts: Date.now(),
    trigger,
    size: payloadStr.length,
    checksum: checksum(payloadStr),
    payload: data,
  };
}

/** The list as it should be once `snap` is added. The newest comes first, but a
 *  "before-op" copy (the one taken before a delete or restore) is the user's way
 *  back: when the retention is small, an automatic snapshot gives way before it. */
function listWith(snap: BackupSnapshot): BackupSnapshot[] {
  const retention = Math.max(1, getSettings().data.backupRetention);
  const list = [snap, ...store.get()];
  while (list.length > retention) {
    let drop = -1;
    for (let i = list.length - 1; i >= 0; i--) {
      if (list[i].trigger !== "before-op") {
        drop = i;
        break;
      }
    }
    list.splice(drop === -1 ? list.length - 1 : drop, 1);
  }
  return list;
}

export type SnapshotPlan = { snap: BackupSnapshot; list: BackupSnapshot[] };

/**
 * Works out a snapshot and the resulting list WITHOUT storing anything, so a
 * destructive operation can write the list together with its own change in
 * one atomic save (saveStoreKeys({ snapshots: plan.list, ... })). Returns null
 * when there is no data: a snapshot of nothing is no safety copy, and with a
 * retention of 1 it would push a real one out.
 */
export function planSnapshot(
  data: SnapshotData,
  trigger: BackupSnapshot["trigger"] = "before-op",
): SnapshotPlan | null {
  if (isEmptyData(data)) return null;
  const snap = buildSnapshot(data, trigger);
  return { snap, list: listWith(snap) };
}

/** Adopts a plan in memory once its atomic write has succeeded. */
export function commitSnapshotPlan(plan: SnapshotPlan) {
  store.set(plan.list);
}

/**
 * Stores a snapshot and resolves only when the file has it (the in-memory list
 * is put back and this rejects otherwise). Resolves null, storing nothing,
 * when there is no data.
 */
export async function createSnapshotChecked(
  data: SnapshotData,
  trigger: BackupSnapshot["trigger"] = "manual",
): Promise<BackupSnapshot | null> {
  const plan = planSnapshot(data, trigger);
  if (!plan) return null;
  await store.setChecked(plan.list);
  return plan.snap;
}

export function createSnapshot(
  data: SnapshotData,
  trigger: BackupSnapshot["trigger"] = "auto",
): BackupSnapshot {
  const snap = buildSnapshot(data, trigger);
  store.set(listWith(snap));
  return snap;
}

export function verifySnapshot(snap: BackupSnapshot): boolean {
  return checksum(JSON.stringify(snap.payload)) === snap.checksum;
}

export function listSnapshots(): readonly BackupSnapshot[] {
  return store.get();
}

export function deleteSnapshot(id: string) {
  store.set(store.get().filter((s) => s.id !== id));
}

export function clearAllSnapshots() {
  store.set([]);
}

export function useSnapshots(): readonly BackupSnapshot[] {
  return store.use();
}

export function getLastAutoBackupTs(): number {
  return lastAutoBackup.get();
}

export function maybeAutoBackup(data: { attendance: unknown; learning: unknown }) {
  // Nothing is written until the data file has been read successfully: a
  // backup made now would be built from an empty, not-yet-loaded store.
  if (!isStoreWritable()) return;
  const s = getSettings();
  if (s.data.autoBackup === "off") return;
  // An empty store has nothing to back up, and its snapshot would push a real
  // one out when only one is kept.
  if (isEmptyData(data)) return;
  const intervalMs = s.data.autoBackup === "daily" ? 86_400_000 : 7 * 86_400_000;
  if (Date.now() - lastAutoBackup.get() < intervalMs) return;
  // Stamped before the snapshot so a failure mid-write can't leave the clock
  // unset and re-trigger a backup on every single mutation.
  lastAutoBackup.set(Date.now());
  createSnapshot(data, "auto");
}
