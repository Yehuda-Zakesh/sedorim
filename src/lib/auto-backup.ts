import { useEffect, useState } from "react";
import { logAudit } from "./audit-store";
import { getSettings } from "./settings-store";

export type BackupSnapshot = {
  id: string;
  ts: number;
  trigger: "auto" | "manual" | "before-op";
  size: number;
  checksum: string;
  payload: { attendance: unknown; learning: unknown };
};

const KEY = "tracker.backups.v1";
const META_KEY = "tracker.backups.meta.v1";

function readAll(): BackupSnapshot[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as BackupSnapshot[]) : [];
  } catch { return []; }
}

let snapshots: BackupSnapshot[] = readAll();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());

function persist() {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(KEY, JSON.stringify(snapshots)); } catch { /* quota */ }
}

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
  snapshots = [snap, ...snapshots].slice(0, retention);
  persist();
  if (trigger === "auto") logAudit("backup.auto", { recordId: snap.id, detail: `${snap.size} bytes` });
  emit();
  return snap;
}

export function verifySnapshot(snap: BackupSnapshot): boolean {
  return checksum(JSON.stringify(snap.payload)) === snap.checksum;
}

export function listSnapshots(): readonly BackupSnapshot[] {
  return snapshots;
}

export function deleteSnapshot(id: string) {
  snapshots = snapshots.filter((s) => s.id !== id);
  persist();
  emit();
}

export function useSnapshots() {
  const [, force] = useState(0);
  useEffect(() => {
    const fn = () => force((n) => n + 1);
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  }, []);
  return snapshots;
}

export function getLastAutoBackupTs(): number {
  if (typeof window === "undefined") return 0;
  try { return parseInt(localStorage.getItem(META_KEY) || "0", 10) || 0; } catch { return 0; }
}
function setLastAutoBackupTs(ts: number) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(META_KEY, String(ts)); } catch { /* noop */ }
}

export function maybeAutoBackup(data: { attendance: unknown; learning: unknown }) {
  const s = getSettings();
  if (s.data.autoBackup === "off") return;
  const intervalMs = s.data.autoBackup === "daily" ? 86_400_000 : 7 * 86_400_000;
  const last = getLastAutoBackupTs();
  if (Date.now() - last < intervalMs) return;
  createSnapshot(data, "auto");
  setLastAutoBackupTs(Date.now());
}
