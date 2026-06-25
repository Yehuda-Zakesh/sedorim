import { useEffect, useState } from "react";
import { logAudit } from "./audit-store";
import { getSettings } from "./settings-store";
import { maybeAutoBackup, createSnapshot } from "./auto-backup";

export type SederNum = 1 | 2;
export type LearningFramework = "kollel-erev" | "torato-beyado" | "bein-hazmanim";

export type SederEntry = {
  id: string;
  date: string;          // YYYY-MM-DD
  seder: SederNum;
  arrival?: string;      // HH:MM (24h)
  departure?: string;
  absent: boolean;
  ohevei: boolean;
  excusedAll: boolean;
  excusedMinutes: number;
  excusedReason?: string;
  manualAdjustMin: number;  // signed: +adds missing, -reduces missing
  tags: string[];
  note?: string;
};

export type LearningEntry = {
  id: string;
  framework: LearningFramework;
  date: string;
  minutes: number;
  source: "manual" | "range" | "timer";
  note?: string;
};

export type TimerSession = { framework: LearningFramework; startedAt: number };

const SEDER_KEY = "kollel.seder.v1";
const LRN_KEY = "kollel.learning.v1";
const TIMER_KEY = "kollel.timer.v1";
const LEGACY_ATT = "tracker.attendance.v1";
const LEGACY_LRN = "tracker.learning.v1";
const LEGACY_ARCHIVE = "tracker.legacy.archive.v1";

function load<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch { return fallback; }
}
function save<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* noop */ }
}

// One-time silent legacy archive
function archiveLegacyOnce() {
  if (typeof window === "undefined") return;
  if (localStorage.getItem(LEGACY_ARCHIVE)) return;
  const att = localStorage.getItem(LEGACY_ATT);
  const lrn = localStorage.getItem(LEGACY_LRN);
  if (att || lrn) {
    localStorage.setItem(LEGACY_ARCHIVE, JSON.stringify({ at: Date.now(), attendance: att, learning: lrn }));
    localStorage.removeItem(LEGACY_ATT);
    localStorage.removeItem(LEGACY_LRN);
  } else {
    localStorage.setItem(LEGACY_ARCHIVE, "{}");
  }
}
archiveLegacyOnce();

let sederEntries: SederEntry[] = load<SederEntry[]>(SEDER_KEY, []);
let learningEntries: LearningEntry[] = load<LearningEntry[]>(LRN_KEY, []);

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());

// Cross-window sync: when another Chromium window (e.g. KollelQuick.exe)
// writes to the same localStorage, the `storage` event fires here. Reload
// the in-memory caches and notify subscribers so the UI updates live.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === SEDER_KEY) {
      sederEntries = load<SederEntry[]>(SEDER_KEY, []);
      emit();
    } else if (e.key === LRN_KEY) {
      learningEntries = load<LearningEntry[]>(LRN_KEY, []);
      emit();
    }
  });
}

function snapshotIfConfigured() {
  if (typeof window === "undefined") return;
  if (!getSettings().data.autoBackupBeforeOps) return;
  createSnapshot({ attendance: sederEntries as unknown, learning: learningEntries as unknown }, "before-op");
}

export class ValidationError extends Error {
  constructor(msg: string) { super(msg); this.name = "ValidationError"; }
}

// ============ Time helpers ============
export function hhmmToMin(t?: string): number | null {
  if (!t) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(t);
  if (!m) return null;
  const h = +m[1], mm = +m[2];
  if (h < 0 || h > 23 || mm < 0 || mm > 59) return null;
  return h * 60 + mm;
}
export function minToHHMM(min: number): string {
  const h = Math.floor(min / 60) % 24;
  const m = ((min % 60) + 60) % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ============ Per-entry calculations ============
export type SederCalc = {
  sederLengthMin: number;
  missingMin: number;        // raw missing (late + early or absent length)
  bonusMin: number;          // bonus from early arrival, capped at threshold
  excusedMin: number;        // excused portion of missing
  nonExcusedMin: number;     // missing - excused
  netMissingMin: number;     // nonExcused + manualAdjust, clamped to >= 0, minus bonus, >= 0
  isLate: boolean;
  isEarlyDeparture: boolean;
  isOhevei: boolean;         // whether ohevei is actually valid
};

export function calcSeder(entry: SederEntry): SederCalc {
  const s = getSettings().seder;
  const startStr = entry.seder === 1 ? s.s1Start : s.s2Start;
  const endStr = entry.seder === 1 ? s.s1End : s.s2End;
  const startMin = hhmmToMin(startStr) ?? 0;
  const endMin = hhmmToMin(endStr) ?? 0;
  const sederLengthMin = Math.max(0, endMin - startMin);

  let missing = 0, bonus = 0, isLate = false, isEarly = false;
  if (entry.absent) {
    missing = sederLengthMin;
  } else {
    const arr = hhmmToMin(entry.arrival);
    const dep = hhmmToMin(entry.departure);
    if (arr !== null) {
      if (arr > startMin) { missing += arr - startMin; isLate = true; }
      else if (arr < startMin) {
        bonus = Math.min(s.bonusThresholdMin, startMin - arr);
      }
    } else {
      // missing arrival treated as absent if no departure either
      if (dep === null) missing = sederLengthMin;
    }
    if (dep !== null) {
      if (dep < endMin) { missing += endMin - dep; isEarly = true; }
    } else if (arr !== null) {
      // departure missing but arrived → treat as no early-leave (assume stayed)
    }
  }

  const excused = entry.excusedAll ? missing : Math.min(Math.max(0, entry.excusedMinutes), missing);
  const nonExcused = missing - excused;
  const netRaw = nonExcused + (entry.manualAdjustMin || 0) - bonus;
  const netMissingMin = Math.max(0, netRaw);

  // Ohevei valid: arrival ≤ start AND departure ≥ end AND not absent
  const arr = hhmmToMin(entry.arrival);
  const dep = hhmmToMin(entry.departure);
  const isOhevei = entry.ohevei && !entry.absent &&
    arr !== null && dep !== null && arr <= startMin && dep >= endMin;

  return {
    sederLengthMin, missingMin: missing, bonusMin: bonus,
    excusedMin: excused, nonExcusedMin: nonExcused, netMissingMin,
    isLate, isEarlyDeparture: isEarly, isOhevei,
  };
}

// ============ Validation ============
function validateSeder(e: SederEntry): { ok: true } | { ok: false; error: string } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date)) return { ok: false, error: "תאריך לא תקין" };
  if (new Date(e.date).getTime() > Date.now() + 86400000) return { ok: false, error: "לא ניתן לרשום תאריך עתידי" };
  if (e.seder !== 1 && e.seder !== 2) return { ok: false, error: "סדר לא חוקי" };
  if (!e.absent) {
    if (e.arrival !== undefined && hhmmToMin(e.arrival) === null) return { ok: false, error: "שעת הגעה לא תקינה" };
    if (e.departure !== undefined && hhmmToMin(e.departure) === null) return { ok: false, error: "שעת יציאה לא תקינה" };
    const a = hhmmToMin(e.arrival), d = hhmmToMin(e.departure);
    if (a !== null && d !== null && d < a) return { ok: false, error: "שעת יציאה לפני שעת הגעה" };
  }
  if (e.excusedMinutes < 0 || e.excusedMinutes > 24 * 60) return { ok: false, error: "מספר דקות מוצדק לא תקין" };
  if (Math.abs(e.manualAdjustMin) > 24 * 60) return { ok: false, error: "התאמה ידנית גדולה מדי" };
  if (e.note && e.note.length > 500) return { ok: false, error: "הערה ארוכה מדי" };
  return { ok: true };
}

function validateLearning(l: LearningEntry): { ok: true } | { ok: false; error: string } {
  if (!l.id) return { ok: false, error: "מזהה חסר" };
  if (!["kollel-erev", "torato-beyado", "bein-hazmanim"].includes(l.framework)) return { ok: false, error: "מסגרת לא חוקית" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(l.date)) return { ok: false, error: "תאריך לא תקין" };
  if (typeof l.minutes !== "number" || l.minutes < 1 || l.minutes > 24 * 60) return { ok: false, error: "משך לא חוקי (1–1440 דקות)" };
  return { ok: true };
}

// ============ Hooks / API ============
export function useSeder() {
  const [, force] = useState(0);
  useEffect(() => {
    const fn = () => force((n) => n + 1);
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  }, []);
  return {
    entries: sederEntries,
    upsert(e: SederEntry) {
      const v = validateSeder(e);
      if (!v.ok) {
        logAudit("data.validation_failed", { recordId: e.id, detail: v.error, newValue: e });
        throw new ValidationError(v.error);
      }
      const prev = sederEntries.find((x) => x.id === e.id);
      if (!prev) snapshotIfConfigured();
      sederEntries = [e, ...sederEntries.filter((x) => x.id !== e.id)]
        .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.seder - b.seder));
      save(SEDER_KEY, sederEntries);
      logAudit(prev ? "seder.update" : "seder.create", { recordId: e.id, oldValue: prev, newValue: e });
      maybeAutoBackup({ attendance: sederEntries as unknown, learning: learningEntries as unknown });
      emit();
    },
    remove(id: string) {
      const prev = sederEntries.find((x) => x.id === id);
      if (!prev) return;
      snapshotIfConfigured();
      sederEntries = sederEntries.filter((x) => x.id !== id);
      save(SEDER_KEY, sederEntries);
      logAudit("seder.delete", { recordId: id, oldValue: prev });
      emit();
    },
    replaceAll(list: SederEntry[]) {
      sederEntries = list.filter((e) => validateSeder(e).ok)
        .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.seder - b.seder));
      save(SEDER_KEY, sederEntries);
      emit();
    },
    clearAll() {
      snapshotIfConfigured();
      sederEntries = [];
      save(SEDER_KEY, sederEntries);
      emit();
    },
  };
}

export function useLearning() {
  const [, force] = useState(0);
  useEffect(() => {
    const fn = () => force((n) => n + 1);
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  }, []);
  return {
    items: learningEntries,
    add(item: LearningEntry) {
      const v = validateLearning(item);
      if (!v.ok) {
        logAudit("data.validation_failed", { recordId: item.id, detail: v.error, newValue: item });
        throw new ValidationError(v.error);
      }
      learningEntries = [item, ...learningEntries];
      save(LRN_KEY, learningEntries);
      logAudit("learning.create", { recordId: item.id, newValue: item });
      maybeAutoBackup({ attendance: sederEntries as unknown, learning: learningEntries as unknown });
      emit();
    },
    remove(id: string) {
      const prev = learningEntries.find((i) => i.id === id);
      if (!prev) return;
      learningEntries = learningEntries.filter((i) => i.id !== id);
      save(LRN_KEY, learningEntries);
      logAudit("learning.delete", { recordId: id, oldValue: prev });
      emit();
    },
    replaceAll(list: LearningEntry[]) {
      learningEntries = list.filter((l) => validateLearning(l).ok);
      save(LRN_KEY, learningEntries);
      emit();
    },
    clearAll() {
      snapshotIfConfigured();
      learningEntries = [];
      save(LRN_KEY, learningEntries);
      emit();
    },
  };
}

// ============ Timer ============
export function getTimer(): TimerSession | null {
  return load<TimerSession | null>(TIMER_KEY, null);
}
export function startTimer(framework: LearningFramework): TimerSession {
  const t = { framework, startedAt: Date.now() };
  save(TIMER_KEY, t);
  logAudit("learning.timer_start", { detail: framework });
  return t;
}
export function stopTimer(): { framework: LearningFramework; minutes: number } | null {
  const t = getTimer();
  if (!t) return null;
  const minutes = Math.max(1, Math.round((Date.now() - t.startedAt) / 60000));
  save<TimerSession | null>(TIMER_KEY, null);
  logAudit("learning.timer_stop", { detail: `${t.framework} · ${minutes} דק׳` });
  return { framework: t.framework, minutes };
}
export function cancelTimer(): void {
  save<TimerSession | null>(TIMER_KEY, null);
}

// ============ Aggregations ============
export function entriesInMonth(list: SederEntry[], year: number, monthIdx: number) {
  const prefix = `${year}-${String(monthIdx + 1).padStart(2, "0")}`;
  return list.filter((e) => e.date.startsWith(prefix));
}

export function entriesByDate(list: SederEntry[]): Record<string, SederEntry[]> {
  const out: Record<string, SederEntry[]> = {};
  for (const e of list) (out[e.date] = out[e.date] || []).push(e);
  return out;
}

export type MonthlySummary = {
  totalMissing: number;
  excused: number;
  nonExcused: number;
  bonus: number;
  lateCount: number;
  absenceCount: number;
  earlyDepCount: number;
  oheveiCount: number;
  entries: number;
  netMissing: number;
};

export function monthlySummary(year: number, monthIdx: number): MonthlySummary {
  const list = entriesInMonth(sederEntries, year, monthIdx);
  const out: MonthlySummary = {
    totalMissing: 0, excused: 0, nonExcused: 0, bonus: 0,
    lateCount: 0, absenceCount: 0, earlyDepCount: 0, oheveiCount: 0,
    entries: list.length, netMissing: 0,
  };
  for (const e of list) {
    const c = calcSeder(e);
    out.totalMissing += c.missingMin;
    out.excused += c.excusedMin;
    out.nonExcused += c.nonExcusedMin;
    out.bonus += c.bonusMin;
    out.netMissing += c.netMissingMin;
    if (e.absent) out.absenceCount++;
    if (c.isLate) out.lateCount++;
    if (c.isEarlyDeparture) out.earlyDepCount++;
    if (c.isOhevei) out.oheveiCount++;
  }
  return out;
}

// Attendance score 0–100 for a month
export function attendanceScore(year: number, monthIdx: number): number {
  const list = entriesInMonth(sederEntries, year, monthIdx);
  if (!list.length) return 0;
  // expected total minutes = sum of seder lengths across entries
  let expected = 0, net = 0, bonus = 0, lateCount = 0;
  for (const e of list) {
    const c = calcSeder(e);
    expected += c.sederLengthMin;
    net += c.netMissingMin;
    bonus += c.bonusMin;
    if (c.isLate) lateCount++;
  }
  if (expected === 0) return 0;
  let score = (1 - net / expected) * 100;
  // small bonus boost (up to +3) and lateness penalty (up to -5)
  score += Math.min(3, bonus / 30);
  score -= Math.min(5, lateCount * 0.5);
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function currentDayStreak(): number {
  // counts consecutive days (ending today or yesterday) with at least one fully-attended seder (no missing)
  const byDate = entriesByDate(sederEntries);
  const now = new Date();
  let streak = 0;
  for (let i = 0; i < 366; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const list = byDate[iso];
    if (!list) { if (i === 0) continue; break; }
    const good = list.some((e) => {
      const c = calcSeder(e);
      return !e.absent && c.netMissingMin === 0;
    });
    if (good) streak++; else break;
  }
  return streak;
}

export function getSederSnapshot() { return sederEntries; }
export function getLearningSnapshot() { return learningEntries; }

export function allTags(): string[] {
  const set = new Set<string>();
  for (const e of sederEntries) (e.tags || []).forEach((t) => set.add(t));
  return [...set].sort();
}

export const FRAMEWORK_LABELS: Record<LearningFramework, string> = {
  "kollel-erev": "כולל ערב",
  "torato-beyado": "תורתו בידו",
  "bein-hazmanim": "ישיבת בין הזמנים",
};

export function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
