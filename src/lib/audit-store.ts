import { sharedValue } from "./shared-state";

export type AuditAction =
  | "seder.create"
  | "seder.update"
  | "seder.delete"
  | "learning.create"
  | "learning.delete"
  | "learning.timer_start"
  | "learning.timer_stop"
  | "settings.update"
  | "backup.export"
  | "backup.import"
  | "backup.auto"
  | "backup.restore"
  | "backup.delete_db"
  | "backup.reset_settings"
  | "backup.download_source"
  | "report.export"
  | "data.validation_failed";

export type AuditEntry = {
  id: string;
  ts: number;
  action: AuditAction;
  recordId?: string;
  oldValue?: unknown;
  newValue?: unknown;
  detail?: string;
};

const MAX = 1000;

// In the shared data file, so the log covers what was done in *both* EXEs —
// entries made from the quick window included. See shared-state.ts.
const store = sharedValue<AuditEntry[]>({
  key: "audit",
  legacyKey: "tracker.audit.v1",
  fallback: [],
  parse: (raw) => (Array.isArray(raw) ? (raw as AuditEntry[]).slice(0, MAX) : []),
});

export function logAudit(action: AuditAction, payload: Omit<AuditEntry, "id" | "ts" | "action"> = {}) {
  const entry: AuditEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ts: Date.now(),
    action,
    ...payload,
  };
  store.set([entry, ...store.get()].slice(0, MAX));
}

export function getAuditEntries(): readonly AuditEntry[] { return store.get(); }

export function clearAudit() {
  store.set([]);
}

export function useAudit(): readonly AuditEntry[] {
  return store.use();
}

export const ACTION_LABELS: Record<AuditAction, string> = {
  "seder.create": "רישום סדר חדש",
  "seder.update": "עדכון רישום סדר",
  "seder.delete": "מחיקת רישום סדר",
  "learning.create": "הוספת רישום לימוד",
  "learning.delete": "מחיקת רישום לימוד",
  "learning.timer_start": "הפעלת טיימר",
  "learning.timer_stop": "עצירת טיימר",
  "settings.update": "עדכון הגדרות",
  "backup.export": "ייצוא גיבוי",
  "backup.import": "ייבוא גיבוי",
  "backup.auto": "גיבוי אוטומטי",
  "backup.restore": "שחזור מגיבוי",
  "backup.delete_db": "מחיקת בסיס נתונים",
  "backup.reset_settings": "איפוס הגדרות",
  "backup.download_source": "הורדת קוד מקור",
  "report.export": "ייצוא דוח",
  "data.validation_failed": "כשל בוולידציה",
};
