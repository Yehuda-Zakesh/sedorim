import { getSettings } from "./settings-store";
import { sharedValue } from "./shared-state";

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

export function createSnapshot(
  data: { attendance: unknown; learning: unknown },
  trigger: BackupSnapshot["trigger"] = "auto",
): BackupSnapshot {
  const payloadStr = JSON.stringify(data);
  const snap: BackupSnapshot = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    ts: Date.now(),
    trigger,
    size: payloadStr.length,
    checksum: checksum(payloadStr),
    payload: data,
  };
  const retention = Math.max(1, getSettings().data.backupRetention);
  store.set([snap, ...store.get()].slice(0, retention));
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
  const s = getSettings();
  if (s.data.autoBackup === "off") return;
  const intervalMs = s.data.autoBackup === "daily" ? 86_400_000 : 7 * 86_400_000;
  if (Date.now() - lastAutoBackup.get() < intervalMs) return;
  // Stamped before the snapshot so a failure mid-write can't leave the clock
  // unset and re-trigger a backup on every single mutation.
  lastAutoBackup.set(Date.now());
  createSnapshot(data, "auto");
}
