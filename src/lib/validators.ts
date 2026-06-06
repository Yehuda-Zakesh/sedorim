import type { AttendanceRecord, LearningItem } from "./tracker-store";

export type ValidationResult = { ok: true } | { ok: false; error: string };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const VALID_STATUS = new Set(["present", "late", "absent", "excused"]);

export function validateAttendance(r: AttendanceRecord): ValidationResult {
  if (!r || typeof r !== "object") return { ok: false, error: "רישום לא תקין" };
  if (!DATE_RE.test(r.date)) return { ok: false, error: "פורמט תאריך לא תקין (YYYY-MM-DD)" };
  const d = new Date(r.date);
  if (isNaN(d.getTime())) return { ok: false, error: "תאריך לא קיים" };
  if (d.getTime() > Date.now() + 24 * 3600 * 1000) return { ok: false, error: "לא ניתן לרשום תאריך עתידי" };
  if (d.getFullYear() < 2000) return { ok: false, error: "תאריך מוקדם מדי" };
  if (!VALID_STATUS.has(r.status)) return { ok: false, error: "סטטוס לא חוקי" };
  if (r.note && r.note.length > 500) return { ok: false, error: "הערה ארוכה מדי (מקסימום 500 תווים)" };
  if (r.tags && (!Array.isArray(r.tags) || r.tags.some((t) => typeof t !== "string" || t.length > 40))) {
    return { ok: false, error: "תגיות לא תקינות" };
  }
  return { ok: true };
}

export function validateLearning(i: LearningItem): ValidationResult {
  if (!i || typeof i !== "object") return { ok: false, error: "פריט לא תקין" };
  if (!i.id || typeof i.id !== "string") return { ok: false, error: "מזהה חסר" };
  if (!i.topic || !i.topic.trim()) return { ok: false, error: "נושא חובה" };
  if (i.topic.length > 200) return { ok: false, error: "נושא ארוך מדי" };
  if (!DATE_RE.test(i.date)) return { ok: false, error: "פורמט תאריך לא תקין" };
  if (typeof i.minutes !== "number" || i.minutes < 1 || i.minutes > 24 * 60) {
    return { ok: false, error: "משך לא חוקי (1–1440 דקות)" };
  }
  return { ok: true };
}

export function detectDuplicate(records: AttendanceRecord[], date: string) {
  return records.some((r) => r.date === date);
}

export function isUnusualLearning(minutes: number): string | null {
  if (minutes > 360) return "משך לימוד ארוך מהרגיל (מעל 6 שעות)";
  return null;
}
