import { r as reactExports } from "../_libs/react.mjs";
const KEY$1 = "tracker.audit.v1";
const MAX = 1e3;
function read$1() {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY$1);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
let entries = read$1();
const listeners$1 = /* @__PURE__ */ new Set();
const emit$1 = () => listeners$1.forEach((fn) => fn());
function write() {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY$1, JSON.stringify(entries.slice(0, MAX)));
  } catch {
  }
}
function logAudit(action, payload = {}) {
  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ts: Date.now(),
    action,
    ...payload
  };
  entries = [entry, ...entries].slice(0, MAX);
  write();
  emit$1();
}
function useAudit() {
  const [, force] = reactExports.useState(0);
  reactExports.useEffect(() => {
    const fn = () => force((n) => n + 1);
    listeners$1.add(fn);
    return () => {
      listeners$1.delete(fn);
    };
  }, []);
  return entries;
}
const ACTION_LABELS = {
  "seder.create": "רישום סדר חדש",
  "seder.update": "עדכון רישום סדר",
  "seder.delete": "מחיקת רישום סדר",
  "learning.create": "הוספת שיעור לימוד",
  "learning.delete": "מחיקת שיעור לימוד",
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
  "data.validation_failed": "כשל בוולידציה"
};
const DEFAULT_SETTINGS = {
  profile: { name: "תלמיד הכולל", classroom: "" },
  seder: {
    s1Start: "09:30",
    s1End: "13:30",
    s2Start: "16:00",
    s2End: "19:00",
    bonusThresholdMin: 15,
    alertMissingMinPerMonth: 180,
    defaultDeparture: "seder_end"
  },
  notifications: { dailyReminder: true, latenessAlert: true, weeklySummary: false },
  appearance: { fontSize: "normal", highContrast: false, compactMode: false },
  dashboard: { showInsights: true, showReminders: true, showQuickActions: true },
  language: { dateFormat: "mixed" },
  privacy: { lockScreen: false, enableAudit: true },
  data: { autoBackup: "weekly", backupRetention: 5, autoBackupBeforeOps: true },
  goals: { monthlyTarget: 95, maxLatePerMonth: 3 }
};
const KEY = "tracker.settings.v1";
const ONBOARD_KEY = "tracker.onboarded.v1";
function deepMerge(base, over) {
  const out = Array.isArray(base) ? [...base] : { ...base };
  for (const k of Object.keys(over || {})) {
    const v = over[k];
    if (v && typeof v === "object" && !Array.isArray(v) && typeof base[k] === "object") {
      out[k] = deepMerge(base[k], v);
    } else if (v !== void 0) {
      out[k] = v;
    }
  }
  return out;
}
function read() {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw);
    return deepMerge(DEFAULT_SETTINGS, parsed);
  } catch {
    return DEFAULT_SETTINGS;
  }
}
let settings = read();
const listeners = /* @__PURE__ */ new Set();
const emit = () => listeners.forEach((fn) => fn());
function persist() {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
  }
}
function getSettings() {
  return settings;
}
function updateSettings(patch, opts) {
  const prev = settings;
  settings = deepMerge(settings, patch);
  persist();
  applyAppearance();
  if (!opts?.skipAudit) logAudit("settings.update", { oldValue: prev, newValue: settings });
  emit();
}
function resetSettings() {
  const prev = settings;
  settings = DEFAULT_SETTINGS;
  persist();
  applyAppearance();
  logAudit("backup.reset_settings", { oldValue: prev, newValue: settings });
  emit();
}
function useSettings() {
  const [, force] = reactExports.useState(0);
  reactExports.useEffect(() => {
    const fn = () => force((n) => n + 1);
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);
  return { settings, update: updateSettings };
}
function applyAppearance() {
  if (typeof document === "undefined") return;
  const r = document.documentElement;
  r.classList.toggle("hc", settings.appearance.highContrast);
  r.classList.toggle("compact", settings.appearance.compactMode);
  r.dataset.fontSize = settings.appearance.fontSize;
  const sizes = { small: "14px", normal: "16px", large: "18px", xlarge: "20px" };
  r.style.fontSize = sizes[settings.appearance.fontSize];
}
function isOnboarded() {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(ONBOARD_KEY) === "1";
}
function markOnboarded() {
  if (typeof window === "undefined") return;
  localStorage.setItem(ONBOARD_KEY, "1");
}
function resetOnboarding() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(ONBOARD_KEY);
}
export {
  ACTION_LABELS as A,
  DEFAULT_SETTINGS as D,
  updateSettings as a,
  resetSettings as b,
  useAudit as c,
  applyAppearance as d,
  getSettings as g,
  isOnboarded as i,
  logAudit as l,
  markOnboarded as m,
  resetOnboarding as r,
  useSettings as u
};
