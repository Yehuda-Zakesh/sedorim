import { r as reactExports } from "../_libs/react.mjs";
import { l as logAudit, g as getSettings } from "./settings-store-Dn4IHvuo.mjs";
const KEY = "tracker.backups.v1";
const META_KEY = "tracker.backups.meta.v1";
function readAll() {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
let snapshots = readAll();
const listeners$1 = /* @__PURE__ */ new Set();
const emit$1 = () => listeners$1.forEach((fn) => fn());
function persist() {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(snapshots));
  } catch {
  }
}
function checksum(text) {
  let h = 0;
  for (let i = 0; i < text.length; i++) {
    h = (h << 5) - h + text.charCodeAt(i);
    h |= 0;
  }
  return (h >>> 0).toString(16);
}
function createSnapshot(data, trigger = "auto") {
  const payloadStr = JSON.stringify(data);
  const snap = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    ts: Date.now(),
    trigger,
    size: payloadStr.length,
    checksum: checksum(payloadStr),
    payload: data
  };
  const retention = Math.max(1, getSettings().data.backupRetention);
  snapshots = [snap, ...snapshots].slice(0, retention);
  persist();
  if (trigger === "auto") logAudit("backup.auto", { recordId: snap.id, detail: `${snap.size} bytes` });
  emit$1();
  return snap;
}
function verifySnapshot(snap) {
  return checksum(JSON.stringify(snap.payload)) === snap.checksum;
}
function deleteSnapshot(id) {
  snapshots = snapshots.filter((s) => s.id !== id);
  persist();
  emit$1();
}
function clearAllSnapshots() {
  snapshots = [];
  persist();
  emit$1();
}
function useSnapshots() {
  const [, force] = reactExports.useState(0);
  reactExports.useEffect(() => {
    const fn = () => force((n) => n + 1);
    listeners$1.add(fn);
    return () => {
      listeners$1.delete(fn);
    };
  }, []);
  return snapshots;
}
function getLastAutoBackupTs() {
  if (typeof window === "undefined") return 0;
  try {
    return parseInt(localStorage.getItem(META_KEY) || "0", 10) || 0;
  } catch {
    return 0;
  }
}
function setLastAutoBackupTs(ts) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(META_KEY, String(ts));
  } catch {
  }
}
function maybeAutoBackup(data) {
  const s = getSettings();
  if (s.data.autoBackup === "off") return;
  const intervalMs = s.data.autoBackup === "daily" ? 864e5 : 7 * 864e5;
  const last = getLastAutoBackupTs();
  if (Date.now() - last < intervalMs) return;
  createSnapshot(data, "auto");
  setLastAutoBackupTs(Date.now());
}
const SEDER_KEY = "kollel.seder.v1";
const LRN_KEY = "kollel.learning.v1";
const TIMER_KEY = "kollel.timer.v1";
const LEGACY_ATT = "tracker.attendance.v1";
const LEGACY_LRN = "tracker.learning.v1";
const LEGACY_ARCHIVE = "tracker.legacy.archive.v1";
function load(key, fallback) {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}
function save(key, value) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
  }
}
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
let sederEntries = load(SEDER_KEY, []);
let learningEntries = load(LRN_KEY, []);
const listeners = /* @__PURE__ */ new Set();
const emit = () => listeners.forEach((fn) => fn());
function snapshotIfConfigured() {
  if (typeof window === "undefined") return;
  if (!getSettings().data.autoBackupBeforeOps) return;
  createSnapshot({ attendance: sederEntries, learning: learningEntries }, "before-op");
}
class ValidationError extends Error {
  constructor(msg) {
    super(msg);
    this.name = "ValidationError";
  }
}
function hhmmToMin(t) {
  if (!t) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(t);
  if (!m) return null;
  const h = +m[1], mm = +m[2];
  if (h < 0 || h > 23 || mm < 0 || mm > 59) return null;
  return h * 60 + mm;
}
function todayISO() {
  const d = /* @__PURE__ */ new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function calcSeder(entry) {
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
    const arr2 = hhmmToMin(entry.arrival);
    const dep2 = hhmmToMin(entry.departure);
    if (arr2 !== null) {
      if (arr2 > startMin) {
        missing += arr2 - startMin;
        isLate = true;
      } else if (arr2 < startMin) {
        bonus = Math.min(s.bonusThresholdMin, startMin - arr2);
      }
    } else {
      if (dep2 === null) missing = sederLengthMin;
    }
    if (dep2 !== null) {
      if (dep2 < endMin) {
        missing += endMin - dep2;
        isEarly = true;
      }
    }
  }
  const excused = entry.excusedAll ? missing : Math.min(Math.max(0, entry.excusedMinutes), missing);
  const nonExcused = missing - excused;
  const netRaw = nonExcused + (entry.manualAdjustMin || 0) - bonus;
  const netMissingMin = Math.max(0, netRaw);
  const arr = hhmmToMin(entry.arrival);
  const dep = hhmmToMin(entry.departure);
  const isOhevei = entry.ohevei && !entry.absent && arr !== null && dep !== null && arr <= startMin && dep >= endMin;
  return {
    sederLengthMin,
    missingMin: missing,
    bonusMin: bonus,
    excusedMin: excused,
    nonExcusedMin: nonExcused,
    netMissingMin,
    isLate,
    isEarlyDeparture: isEarly,
    isOhevei
  };
}
function validateSeder(e) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date)) return { ok: false, error: "תאריך לא תקין" };
  if (new Date(e.date).getTime() > Date.now() + 864e5) return { ok: false, error: "לא ניתן לרשום תאריך עתידי" };
  if (e.seder !== 1 && e.seder !== 2) return { ok: false, error: "סדר לא חוקי" };
  if (!e.absent) {
    if (e.arrival !== void 0 && hhmmToMin(e.arrival) === null) return { ok: false, error: "שעת הגעה לא תקינה" };
    if (e.departure !== void 0 && hhmmToMin(e.departure) === null) return { ok: false, error: "שעת יציאה לא תקינה" };
    const a = hhmmToMin(e.arrival), d = hhmmToMin(e.departure);
    if (a !== null && d !== null && d < a) return { ok: false, error: "שעת יציאה לפני שעת הגעה" };
  }
  if (e.excusedMinutes < 0 || e.excusedMinutes > 24 * 60) return { ok: false, error: "מספר דקות מוצדק לא תקין" };
  if (Math.abs(e.manualAdjustMin) > 24 * 60) return { ok: false, error: "התאמה ידנית גדולה מדי" };
  if (e.note && e.note.length > 500) return { ok: false, error: "הערה ארוכה מדי" };
  return { ok: true };
}
function validateLearning(l) {
  if (!l.id) return { ok: false, error: "מזהה חסר" };
  if (!["kollel-erev", "torato-beyado", "bein-hazmanim"].includes(l.framework)) return { ok: false, error: "מסגרת לא חוקית" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(l.date)) return { ok: false, error: "תאריך לא תקין" };
  if (typeof l.minutes !== "number" || l.minutes < 1 || l.minutes > 24 * 60) return { ok: false, error: "משך לא חוקי (1–1440 דקות)" };
  return { ok: true };
}
function useSeder() {
  const [, force] = reactExports.useState(0);
  reactExports.useEffect(() => {
    const fn = () => force((n) => n + 1);
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);
  return {
    entries: sederEntries,
    upsert(e) {
      const v = validateSeder(e);
      if (!v.ok) {
        logAudit("data.validation_failed", { recordId: e.id, detail: v.error, newValue: e });
        throw new ValidationError(v.error);
      }
      const prev = sederEntries.find((x) => x.id === e.id);
      if (!prev) snapshotIfConfigured();
      sederEntries = [e, ...sederEntries.filter((x) => x.id !== e.id)].sort((a, b) => a.date < b.date ? 1 : a.date > b.date ? -1 : a.seder - b.seder);
      save(SEDER_KEY, sederEntries);
      logAudit(prev ? "seder.update" : "seder.create", { recordId: e.id, oldValue: prev, newValue: e });
      maybeAutoBackup({ attendance: sederEntries, learning: learningEntries });
      emit();
    },
    remove(id) {
      const prev = sederEntries.find((x) => x.id === id);
      if (!prev) return;
      snapshotIfConfigured();
      sederEntries = sederEntries.filter((x) => x.id !== id);
      save(SEDER_KEY, sederEntries);
      logAudit("seder.delete", { recordId: id, oldValue: prev });
      emit();
    },
    replaceAll(list) {
      sederEntries = list.filter((e) => validateSeder(e).ok).sort((a, b) => a.date < b.date ? 1 : a.date > b.date ? -1 : a.seder - b.seder);
      save(SEDER_KEY, sederEntries);
      emit();
    },
    clearAll() {
      snapshotIfConfigured();
      sederEntries = [];
      save(SEDER_KEY, sederEntries);
      emit();
    }
  };
}
function useLearning() {
  const [, force] = reactExports.useState(0);
  reactExports.useEffect(() => {
    const fn = () => force((n) => n + 1);
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);
  return {
    items: learningEntries,
    add(item) {
      const v = validateLearning(item);
      if (!v.ok) {
        logAudit("data.validation_failed", { recordId: item.id, detail: v.error, newValue: item });
        throw new ValidationError(v.error);
      }
      learningEntries = [item, ...learningEntries];
      save(LRN_KEY, learningEntries);
      logAudit("learning.create", { recordId: item.id, newValue: item });
      maybeAutoBackup({ attendance: sederEntries, learning: learningEntries });
      emit();
    },
    remove(id) {
      const prev = learningEntries.find((i) => i.id === id);
      if (!prev) return;
      learningEntries = learningEntries.filter((i) => i.id !== id);
      save(LRN_KEY, learningEntries);
      logAudit("learning.delete", { recordId: id, oldValue: prev });
      emit();
    },
    replaceAll(list) {
      learningEntries = list.filter((l) => validateLearning(l).ok);
      save(LRN_KEY, learningEntries);
      emit();
    },
    clearAll() {
      snapshotIfConfigured();
      learningEntries = [];
      save(LRN_KEY, learningEntries);
      emit();
    }
  };
}
function getTimer() {
  return load(TIMER_KEY, null);
}
function startTimer(framework) {
  const t = { framework, startedAt: Date.now() };
  save(TIMER_KEY, t);
  logAudit("learning.timer_start", { detail: framework });
  return t;
}
function stopTimer() {
  const t = getTimer();
  if (!t) return null;
  const minutes = Math.max(1, Math.round((Date.now() - t.startedAt) / 6e4));
  save(TIMER_KEY, null);
  logAudit("learning.timer_stop", { detail: `${t.framework} · ${minutes} דק׳` });
  return { framework: t.framework, minutes };
}
function cancelTimer() {
  save(TIMER_KEY, null);
}
function entriesInMonth(list, year, monthIdx) {
  const prefix = `${year}-${String(monthIdx + 1).padStart(2, "0")}`;
  return list.filter((e) => e.date.startsWith(prefix));
}
function entriesByDate(list) {
  const out = {};
  for (const e of list) (out[e.date] = out[e.date] || []).push(e);
  return out;
}
function monthlySummary(year, monthIdx) {
  const list = entriesInMonth(sederEntries, year, monthIdx);
  const out = {
    totalMissing: 0,
    excused: 0,
    nonExcused: 0,
    bonus: 0,
    lateCount: 0,
    absenceCount: 0,
    earlyDepCount: 0,
    oheveiCount: 0,
    entries: list.length,
    netMissing: 0
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
function attendanceScore(year, monthIdx) {
  const list = entriesInMonth(sederEntries, year, monthIdx);
  if (!list.length) return 0;
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
  score += Math.min(3, bonus / 30);
  score -= Math.min(5, lateCount * 0.5);
  return Math.max(0, Math.min(100, Math.round(score)));
}
function currentDayStreak() {
  const byDate = entriesByDate(sederEntries);
  const now = /* @__PURE__ */ new Date();
  let streak = 0;
  for (let i = 0; i < 366; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const list = byDate[iso];
    if (!list) {
      if (i === 0) continue;
      break;
    }
    const good = list.some((e) => {
      const c = calcSeder(e);
      return !e.absent && c.netMissingMin === 0;
    });
    if (good) streak++;
    else break;
  }
  return streak;
}
function getSederSnapshot() {
  return sederEntries;
}
function allTags() {
  const set = /* @__PURE__ */ new Set();
  for (const e of sederEntries) (e.tags || []).forEach((t) => set.add(t));
  return [...set].sort();
}
const FRAMEWORK_LABELS = {
  "kollel-erev": "כולל ערב",
  "torato-beyado": "תורתו בידו",
  "bein-hazmanim": "ישיבת בין הזמנים"
};
function newId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
export {
  FRAMEWORK_LABELS as F,
  useLearning as a,
  attendanceScore as b,
  currentDayStreak as c,
  calcSeder as d,
  allTags as e,
  cancelTimer as f,
  getTimer as g,
  hhmmToMin as h,
  startTimer as i,
  entriesInMonth as j,
  getSederSnapshot as k,
  entriesByDate as l,
  monthlySummary as m,
  newId as n,
  useSnapshots as o,
  getLastAutoBackupTs as p,
  deleteSnapshot as q,
  clearAllSnapshots as r,
  stopTimer as s,
  todayISO as t,
  useSeder as u,
  verifySnapshot as v,
  createSnapshot as w
};
