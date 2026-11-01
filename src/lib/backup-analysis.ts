// Reads a backup file (or a snapshot's payload) WITHOUT changing anything and
// says exactly what is in it: how many records are usable, which are not and
// why, the period and the kinds of data. Nothing here is filtered silently —
// the caller shows the result and the user decides.
//
// Formats understood (all that have been written by this app):
//   - export file:  { version, exportedAt, kind: "kollel", seder: [...], learning: [...] }
//   - older export: the same with the attendance list under "attendance"
//   - snapshot payload: { attendance: [...], learning: [...] }
//   - full copy: the data file itself (or an export carrying more of it): the
//     lists above PLUS other keys — settings, onboarded, theme, reminders
//     state, and any key this version does not know. See `copyKind`.
// A missing "learning" means no learning records. Fields missing inside a
// record (older versions had fewer) are left as they are, like everywhere else.
import {
  validateLearning,
  validateSeder,
  type LearningEntry,
  type SederEntry,
} from "./kollel-store";

export type BackupIssue = {
  kind: "seder" | "learning";
  /** 1-based position in the file's list. */
  index: number;
  message: string;
};

/**
 * Two different things are called a backup:
 *  - "records": only attendance + learning (the export file, a snapshot, the
 *    old seder/attendance formats). Restoring it replaces the records and
 *    touches NOTHING else: settings, onboarding and all other keys stay as they are;
 *  - "full": a copy of the whole data file — the records plus other keys.
 *    Its extra keys are listed in `carry` and are restored only when the user
 *    explicitly asks for it.
 */
export type CopyKind = "records" | "full";

/** Keys of a data file / export that are never carried over by a restore:
 *  the record lists themselves, the running timer, the in-app snapshot list
 *  (the safety copy was just added to it) and file metadata. */
const NOT_CARRIED = new Set([
  "seder",
  "attendance",
  "learning",
  "timer",
  "snapshots",
  "updatedAt",
  "version",
  "exportedAt",
  "kind",
]);

export type BackupAnalysis = {
  /** Set when the file is not a backup at all; nothing else is meaningful then. */
  formatError?: string;
  version?: number;
  /** Which key held the attendance list. */
  sederKey: "seder" | "attendance" | null;
  seder: SederEntry[];
  learning: LearningEntry[];
  totalSeder: number;
  totalLearning: number;
  issues: BackupIssue[];
  /** Records with no id that were given one (they would otherwise be unusable). */
  repairedIds: number;
  period: { first: string; last: string } | null;
  kinds: string[];
  copyKind: CopyKind;
  /** The extra keys a full copy holds (settings, onboarded, unknown keys...), as found. */
  carry: Record<string, unknown>;
  /** Plain-Hebrew names of what `carry` holds, for the preview. */
  carryLabels: string[];
  /** True when the copy holds a usable settings object. */
  hasSettings: boolean;
  /** Keys this version does not recognise (kept and restored with a full copy). */
  unknownKeys: string[];
};

const KNOWN_EXTRA_LABELS: Record<string, string> = {
  settings: "הגדרות",
  onboarded: "מצב היכרות (אשף פתיחה)",
  theme: "ערכת נושא",
  lastAutoBackupAt: "מועד הגיבוי האוטומטי האחרון",
  notificationsSent: "מצב תזכורות שנשלחו",
  notificationLearning: "למידת התזכורות",
  backgroundPlan: "תוכנית הרקע",
  phoneReport: "דיווחי טלפון",
};

const isObj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);

export const invalidCount = (a: BackupAnalysis) => a.issues.length;
export const validCount = (a: BackupAnalysis) => a.seder.length + a.learning.length;
export const totalCount = (a: BackupAnalysis) => a.totalSeder + a.totalLearning;

function empty(formatError?: string): BackupAnalysis {
  return {
    formatError,
    sederKey: null,
    seder: [],
    learning: [],
    totalSeder: 0,
    totalLearning: 0,
    issues: [],
    repairedIds: 0,
    period: null,
    kinds: [],
    copyKind: "records",
    carry: {},
    carryLabels: [],
    hasSettings: false,
    unknownKeys: [],
  };
}

export function analyzeBackupText(text: string): BackupAnalysis {
  let root: unknown;
  try {
    root = JSON.parse(text);
  } catch {
    return empty("הקובץ אינו JSON תקין");
  }
  return analyzeBackup(root);
}

export function analyzeBackup(root: unknown): BackupAnalysis {
  if (!isObj(root)) return empty("הקובץ אינו קובץ גיבוי של סדר פלוס");
  const sederKey = Array.isArray(root.seder)
    ? "seder"
    : Array.isArray(root.attendance)
      ? "attendance"
      : null;
  const hasLearning = Array.isArray(root.learning);
  // `{}` or an unrelated JSON would otherwise read as an empty backup and wipe
  // everything on restore.
  if (!sederKey && !hasLearning) return empty("בקובץ אין רשימת סדרים ולא רשימת לימוד");
  if (
    (!sederKey && (root.seder !== undefined || root.attendance !== undefined)) ||
    (root.learning !== undefined && !hasLearning)
  )
    return empty("מבנה הקובץ אינו תקין: צפויה רשימה אך נמצא ערך אחר");

  const rawSeder = (sederKey ? root[sederKey] : []) as unknown[];
  const rawLearning = (hasLearning ? root.learning : []) as unknown[];
  const a = empty();
  a.sederKey = sederKey;
  if (typeof root.version === "number") a.version = root.version;
  a.totalSeder = rawSeder.length;
  a.totalLearning = rawLearning.length;

  const seenSeder = new Set<string>();
  rawSeder.forEach((raw, i) => {
    const index = i + 1;
    if (!isObj(raw)) {
      a.issues.push({ kind: "seder", index, message: "הרשומה אינה אובייקט" });
      return;
    }
    let entry = raw as unknown as SederEntry;
    let repaired = false;
    if (typeof entry.id !== "string" || !entry.id) {
      entry = { ...entry, id: `import-${String(entry.date)}-${String(entry.seder)}-${index}` };
      repaired = true;
    }
    const v = validateSeder(entry);
    if (!v.ok) {
      a.issues.push({ kind: "seder", index, message: `${entry.date ?? "?"}: ${v.error}` });
      return;
    }
    if (seenSeder.has(entry.id)) {
      a.issues.push({ kind: "seder", index, message: `${entry.date}: מזהה כפול` });
      return;
    }
    seenSeder.add(entry.id);
    if (repaired) a.repairedIds++;
    a.seder.push(entry);
  });

  const seenLearning = new Set<string>();
  rawLearning.forEach((raw, i) => {
    const index = i + 1;
    if (!isObj(raw)) {
      a.issues.push({ kind: "learning", index, message: "הרשומה אינה אובייקט" });
      return;
    }
    const entry = raw as unknown as LearningEntry;
    const v = validateLearning(entry);
    if (!v.ok) {
      a.issues.push({ kind: "learning", index, message: `${entry.date ?? "?"}: ${v.error}` });
      return;
    }
    if (seenLearning.has(entry.id)) {
      a.issues.push({ kind: "learning", index, message: `${entry.date}: מזהה כפול` });
      return;
    }
    seenLearning.add(entry.id);
    a.learning.push(entry);
  });

  // Everything else in the file. A settings value that is not an object is not
  // settings (it would blank them), so it is left out rather than carried.
  for (const [k, v] of Object.entries(root)) {
    if (NOT_CARRIED.has(k) || v === undefined) continue;
    if (k === "settings" && !isObj(v)) continue;
    a.carry[k] = v;
    if (k === "settings") a.hasSettings = true;
    if (!(k in KNOWN_EXTRA_LABELS)) a.unknownKeys.push(k);
  }
  if (Object.keys(a.carry).length > 0) {
    a.copyKind = "full";
    a.carryLabels = Object.keys(a.carry)
      .filter((k) => k in KNOWN_EXTRA_LABELS)
      .map((k) => KNOWN_EXTRA_LABELS[k]);
    if (a.unknownKeys.length)
      a.carryLabels.push(`${a.unknownKeys.length} מפתחות נוספים שהגרסה הזו אינה מכירה`);
  }

  const dates = [...a.seder, ...a.learning].map((e) => e.date).sort();
  if (dates.length) a.period = { first: dates[0], last: dates[dates.length - 1] };
  if (a.totalSeder > 0) a.kinds.push("רישומי סדרים");
  if (a.totalLearning > 0) a.kinds.push("רישומי לימוד");
  return a;
}

/** Plain-Hebrew list of the first few problems, with the count of the rest. */
export function summarizeIssues(a: BackupAnalysis, max = 5): string[] {
  const label = { seder: "סדר", learning: "לימוד" } as const;
  const lines = a.issues
    .slice(0, max)
    .map((i) => `${label[i.kind]} מספר ${i.index} — ${i.message}`);
  if (a.issues.length > max) lines.push(`ועוד ${a.issues.length - max} רשומות לא תקינות`);
  return lines;
}

/** The exact outcome sentence — never "fully restored" when something was skipped. */
export function outcomeMessage(
  accepted: { seder: number; learning: number },
  skipped: number,
  restoredKeys: string[] = [],
) {
  const base = `נקלטו ${accepted.seder} רישומי סדרים ו־${accepted.learning} רישומי לימוד`;
  const head = skipped > 0 ? `${base}. דולגו ${skipped} רשומות לא תקינות.` : `${base}.`;
  return restoredKeys.length ? `${head} שוחזרו גם הגדרות ומפתחות נוספים מהעותק המלא.` : head;
}
