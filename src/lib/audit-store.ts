import { useEffect, useState } from "react";

export type AuditAction =
  | "attendance.create"
  | "attendance.update"
  | "attendance.delete"
  | "learning.create"
  | "learning.delete"
  | "settings.update"
  | "backup.export"
  | "backup.import"
  | "backup.auto"
  | "backup.restore"
  | "report.export"
  | "data.validation_failed";

export type AuditEntry = {
  id: string;
  ts: number;            // epoch ms
  action: AuditAction;
  recordId?: string;
  oldValue?: unknown;
  newValue?: unknown;
  detail?: string;
};

const KEY = "tracker.audit.v1";
const MAX = 1000;

function read(): AuditEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as AuditEntry[]) : [];
  } catch { return []; }
}

let entries: AuditEntry[] = read();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());

function write() {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(KEY, JSON.stringify(entries.slice(0, MAX))); } catch { /* noop */ }
}

export function logAudit(action: AuditAction, payload: Omit<AuditEntry, "id" | "ts" | "action"> = {}) {
  const entry: AuditEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ts: Date.now(),
    action,
    ...payload,
  };
  entries = [entry, ...entries].slice(0, MAX);
  write();
  emit();
}

export function getAuditEntries(): readonly AuditEntry[] {
  return entries;
}

export function useAudit() {
  const [, force] = useState(0);
  useEffect(() => {
    const fn = () => force((n) => n + 1);
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  }, []);
  return entries;
}

export const ACTION_LABELS: Record<AuditAction, string> = {
  "attendance.create": "רישום נוכחות חדש",
  "attendance.update": "עדכון רישום נוכחות",
  "attendance.delete": "מחיקת רישום נוכחות",
  "learning.create": "הוספת שיעור לימוד",
  "learning.delete": "מחיקת שיעור לימוד",
  "settings.update": "עדכון הגדרות",
  "backup.export": "ייצוא גיבוי",
  "backup.import": "ייבוא גיבוי",
  "backup.auto": "גיבוי אוטומטי",
  "backup.restore": "שחזור מגיבוי",
  "report.export": "ייצוא דוח",
  "data.validation_failed": "כשל בוולידציה",
};
