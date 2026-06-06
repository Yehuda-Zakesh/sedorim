import { useEffect, useState } from "react";
import { logAudit } from "./audit-store";

export type FontSize = "small" | "normal" | "large" | "xlarge";
export type DateFormat = "iso" | "he" | "mixed";

export type Settings = {
  profile: { name: string; classroom: string };
  notifications: {
    dailyReminder: boolean;
    latenessAlert: boolean;
    weeklySummary: boolean;
  };
  appearance: {
    fontSize: FontSize;
    highContrast: boolean;
    compactMode: boolean;
  };
  dashboard: {
    showInsights: boolean;
    showReminders: boolean;
    showQuickActions: boolean;
  };
  language: {
    dateFormat: DateFormat;
  };
  privacy: {
    lockScreen: boolean;
    enableAudit: boolean;
  };
  data: {
    autoBackup: "off" | "daily" | "weekly";
    backupRetention: number;     // count of snapshots to keep
    autoBackupBeforeOps: boolean;
  };
  goals: {
    monthlyTarget: number;        // % attendance
    maxLatePerMonth: number;
  };
};

export const DEFAULT_SETTINGS: Settings = {
  profile: { name: "המשתמש שלי", classroom: "" },
  notifications: { dailyReminder: true, latenessAlert: true, weeklySummary: false },
  appearance: { fontSize: "normal", highContrast: false, compactMode: false },
  dashboard: { showInsights: true, showReminders: true, showQuickActions: true },
  language: { dateFormat: "mixed" },
  privacy: { lockScreen: false, enableAudit: true },
  data: { autoBackup: "weekly", backupRetention: 5, autoBackupBeforeOps: true },
  goals: { monthlyTarget: 95, maxLatePerMonth: 3 },
};

const KEY = "tracker.settings.v1";
const ONBOARD_KEY = "tracker.onboarded.v1";

function read(): Settings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw);
    return deepMerge(DEFAULT_SETTINGS, parsed);
  } catch { return DEFAULT_SETTINGS; }
}

function deepMerge<T>(base: T, over: Partial<T>): T {
  const out: any = Array.isArray(base) ? [...(base as any)] : { ...base };
  for (const k of Object.keys(over || {})) {
    const v: any = (over as any)[k];
    if (v && typeof v === "object" && !Array.isArray(v) && typeof (base as any)[k] === "object") {
      out[k] = deepMerge((base as any)[k], v);
    } else if (v !== undefined) {
      out[k] = v;
    }
  }
  return out;
}

let settings: Settings = read();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());

function persist() {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* noop */ }
}

export function getSettings(): Settings { return settings; }

export function updateSettings(patch: Partial<Settings>, opts?: { skipAudit?: boolean }) {
  const prev = settings;
  settings = deepMerge(settings, patch);
  persist();
  applyAppearance();
  if (!opts?.skipAudit) {
    logAudit("settings.update", { oldValue: prev, newValue: settings });
  }
  emit();
}

export function useSettings() {
  const [, force] = useState(0);
  useEffect(() => {
    const fn = () => force((n) => n + 1);
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  }, []);
  return { settings, update: updateSettings };
}

export function applyAppearance() {
  if (typeof document === "undefined") return;
  const r = document.documentElement;
  r.classList.toggle("hc", settings.appearance.highContrast);
  r.classList.toggle("compact", settings.appearance.compactMode);
  r.dataset.fontSize = settings.appearance.fontSize;
  const sizes: Record<FontSize, string> = { small: "14px", normal: "16px", large: "18px", xlarge: "20px" };
  r.style.fontSize = sizes[settings.appearance.fontSize];
}

export function isOnboarded(): boolean {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(ONBOARD_KEY) === "1";
}
export function markOnboarded() {
  if (typeof window === "undefined") return;
  localStorage.setItem(ONBOARD_KEY, "1");
}
export function resetOnboarding() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(ONBOARD_KEY);
}
