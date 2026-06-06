import { useEffect, useState } from "react";

export type AttendanceStatus = "present" | "late" | "absent" | "excused";

export type AttendanceRecord = {
  date: string;     // YYYY-MM-DD
  status: AttendanceStatus;
  note?: string;
};

export type LearningItem = {
  id: string;
  topic: string;
  date: string;
  minutes: number;
};

const ATT_KEY = "tracker.attendance.v1";
const LRN_KEY = "tracker.learning.v1";

const seedAttendance: AttendanceRecord[] = [
  { date: "2026-06-05", status: "present" },
  { date: "2026-06-04", status: "present" },
  { date: "2026-06-03", status: "late", note: "תחבורה ציבורית" },
  { date: "2026-06-02", status: "present" },
  { date: "2026-06-01", status: "excused", note: "תור רפואי" },
  { date: "2026-05-31", status: "present" },
  { date: "2026-05-30", status: "present" },
  { date: "2026-05-29", status: "absent", note: "מחלה" },
  { date: "2026-05-28", status: "present" },
  { date: "2026-05-27", status: "present" },
  { date: "2026-05-26", status: "late" },
  { date: "2026-05-25", status: "present" },
  { date: "2026-05-22", status: "present" },
  { date: "2026-05-21", status: "present" },
  { date: "2026-05-20", status: "present" },
  { date: "2026-05-19", status: "present" },
  { date: "2026-05-18", status: "present" },
];

const seedLearning: LearningItem[] = [
  { id: "1", topic: "תגבור מתמטיקה", date: "2026-06-04", minutes: 60 },
  { id: "2", topic: "קריאה מודרכת", date: "2026-06-02", minutes: 45 },
  { id: "3", topic: "סדנת כתיבה", date: "2026-05-30", minutes: 90 },
];

function load<T>(key: string, seed: T): T {
  if (typeof window === "undefined") return seed;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : seed;
  } catch { return seed; }
}

function save<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* noop */ }
}

// Simple pub-sub so multiple components stay in sync within one tab
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());

let attendance = load(ATT_KEY, seedAttendance);
let learning = load(LRN_KEY, seedLearning);

export function useAttendance() {
  const [, force] = useState(0);
  useEffect(() => {
    const fn = () => force((n) => n + 1);
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  }, []);

  return {
    records: attendance,
    upsert(rec: AttendanceRecord) {
      attendance = [rec, ...attendance.filter((r) => r.date !== rec.date)]
        .sort((a, b) => (a.date < b.date ? 1 : -1));
      save(ATT_KEY, attendance);
      emit();
    },
    remove(date: string) {
      attendance = attendance.filter((r) => r.date !== date);
      save(ATT_KEY, attendance);
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
    items: learning,
    add(item: LearningItem) {
      learning = [item, ...learning];
      save(LRN_KEY, learning);
      emit();
    },
    remove(id: string) {
      learning = learning.filter((i) => i.id !== id);
      save(LRN_KEY, learning);
      emit();
    },
  };
}

// Aggregations
export function inMonth(records: AttendanceRecord[], year: number, month: number) {
  const prefix = `${year}-${String(month + 1).padStart(2, "0")}`;
  return records.filter((r) => r.date.startsWith(prefix));
}

export function countByStatus(records: AttendanceRecord[]) {
  const out: Record<AttendanceStatus, number> = { present: 0, late: 0, absent: 0, excused: 0 };
  for (const r of records) out[r.status]++;
  return out;
}

export function attendanceRate(records: AttendanceRecord[]) {
  if (!records.length) return 0;
  const good = records.filter((r) => r.status === "present" || r.status === "excused").length;
  return Math.round((good / records.length) * 100);
}

export function currentStreak(records: AttendanceRecord[]) {
  const sorted = [...records].sort((a, b) => (a.date < b.date ? 1 : -1));
  let streak = 0;
  for (const r of sorted) {
    if (r.status === "present" || r.status === "excused") streak++;
    else break;
  }
  return streak;
}

export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
