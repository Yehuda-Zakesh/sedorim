import { useEffect, useState } from "react";
import { logWarn } from "./diagnostics";
import { attendanceBlockedMessage } from "./attendance-day";
import { getSettings, getSederTimesFor, SHAS_ARRIVAL_DEADLINE } from "./settings-store";
import {
  maybeAutoBackup,
  createSnapshot,
  planSnapshot,
  commitSnapshotPlan,
  isEmptyData,
  type BackupSnapshot,
} from "./auto-backup";
import {
  isLearningDay,
  hebrewFromGregorian,
  hebrewMonthName,
  hebrewYearLetters,
  formatHebrewMonthYear,
} from "./hebrew-calendar";
import {
  loadStore,
  saveStoreKey,
  saveStoreKeys,
  storeStamp,
  type SaveResult,
  type StoreBases,
  type StoreKey,
} from "./store-bridge";
import { applyMineToList, type RecordConflict } from "./record-merge";
import {
  COMPLETE_SAVE,
  outcomeOf,
  registerConflictResolver,
  reportConflicts,
  type SaveOutcome,
} from "./save-conflicts";
import { assertStoreWritable, getStoreGate, reportWriteFailure } from "./store-gate";
import { onStoreReady } from "./store-startup";
export type SederNum = 1 | 2;
export type LearningFramework = "kollel-erev" | "torato-beyado" | "bein-hazmanim";

export type SederEntry = {
  id: string;
  date: string; // YYYY-MM-DD
  seder: SederNum;
  arrival?: string; // HH:MM (24h)
  departure?: string;
  absent: boolean;
  ohevei: boolean;
  excusedAll: boolean;
  excusedMinutes: number;
  excusedReason?: string;
  manualAdjustMin: number; // signed: +adds missing, -reduces missing
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
  tanitDibur?: boolean; // לימוד בבית בתענית דיבור — כל דקה נחשבת ×2 בחישובים
};

export type TimerSession = {
  framework: LearningFramework;
  /** תחילת הקטע הרץ הנוכחי — לא תחילת הלימוד, כשהטיימר הושהה וחזר. */
  startedAt: number;
  limitMinutes?: number; // הגבלת זמן אופציונלית — בסיום עוצר ושומר אוטומטית
  tanitDibur?: boolean; // רק לכולל ערב — סימון תענית דיבור
  /** מילישניות שנצברו בקטעים שכבר הסתיימו (לפני ההשהיה האחרונה). */
  accumulatedMs?: number;
  /** מתי הושהה. כל עוד הוא קיים — הטיימר עומד ואינו צובר זמן. */
  pausedAt?: number;
};

// Carrying the old localStorage build's data over lives in legacy-migration.ts
// and runs inside the single startup read (store-startup.ts), before this
// module hydrates — so what is hydrated below is what really is in the file.

// ============ File-backed store ============
// The in-memory arrays below are the synchronous source of truth for all UI
// code (unchanged API). They're hydrated once from the shared JSON data file
// on startup, kept fresh via short polling (to pick up changes made in the
// *other* window/EXE), and written back — fire-and-forget — on every
// mutation. This avoids relying on WebView localStorage, which two separate
// EXE processes cannot safely share (see src/lib/store-bridge.ts).
let sederEntries: SederEntry[] = [];
let learningEntries: LearningEntry[] = [];
// The arrays as this window last loaded or wrote them — see applyRemoteStore.
let sederBase: SederEntry[] | undefined;
let learningBase: LearningEntry[] | undefined;
let timerSession: TimerSession | null = null;
// The timer as the file last held it (loaded or written): what an unsaved change rolls back to.
let timerBase: TimerSession | null = null;
let lastKnownUpdatedAt = 0;
let hydrated = false;
// Identity of the running timer session. Bumped whenever a session starts,
// ends or is cancelled (here or in the other window) — but NOT on pause/resume,
// which keep the same session. Lets a late "save this" request tell that the
// session it was made for is gone. (The stored session has no id field and the
// schema must not change, so identity is tracked in memory.)
let timerGeneration = 0;
export function getTimerGeneration(): number {
  return timerGeneration;
}
// Pause keeps startedAt and adds accumulatedMs (accumulatedMs = what it was at
// the last resume + the stretch run since); resume sets a new startedAt but
// keeps accumulatedMs; a brand-new session never has accumulatedMs.
//
// "Same session" must hold across any pause/resume in the other window, and
// must NOT hold when one session was replaced by another — including two
// *paused* sessions that both carry accumulatedMs. The stored session has no
// id, so identity is inferred from the arithmetic of those transitions:
// the later state must have started no earlier than the earlier one stopped,
// and what it had banked by its last resume must not be less than what the
// earlier one had banked in total.
export function sameTimerSession(a: TimerSession | null, b: TimerSession | null): boolean {
  if (!a || !b) return a === b;
  if (a.framework !== b.framework) return false;
  if (
    a.startedAt === b.startedAt &&
    a.accumulatedMs === b.accumulatedMs &&
    a.pausedAt === b.pausedAt
  )
    return true;
  const aBanked = a.accumulatedMs ?? 0;
  // What b had banked at its last resume (before the stretch that ended at pausedAt).
  const bAtResume =
    (b.accumulatedMs ?? 0) - (b.pausedAt !== undefined ? Math.max(0, b.pausedAt - b.startedAt) : 0);
  if (a.accumulatedMs === undefined) {
    // A fresh session can only turn into the same session: paused at the same
    // startedAt, or paused/resumed later (then it has banked something).
    if (b.accumulatedMs === undefined) return false; // fresh, different startedAt
    return b.startedAt === a.startedAt || (b.startedAt >= a.startedAt && bAtResume > 0);
  }
  if (b.accumulatedMs === undefined) return false; // a new session replaced a banked one
  const aStopped = a.pausedAt ?? a.startedAt;
  return b.startedAt >= aStopped && bAtResume >= aBanked - 1 && b.startedAt >= a.startedAt;
}

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());

function applyRemoteStore(store: {
  seder?: unknown;
  learning?: unknown;
  timer?: unknown;
  updatedAt?: number;
}) {
  sederEntries = (store.seder as SederEntry[] | undefined) ?? [];
  learningEntries = (store.learning as LearningEntry[] | undefined) ?? [];
  // What the file held when this window adopted it: the base the next save is
  // merged against (store-bridge saveStoreKeys `bases`). Absent key = no base.
  sederBase = Array.isArray(store.seder) ? sederEntries : undefined;
  learningBase = Array.isArray(store.learning) ? learningEntries : undefined;
  const nextTimer = (store.timer as TimerSession | null | undefined) ?? null;
  if (!sameTimerSession(timerSession, nextTimer)) timerGeneration++;
  timerSession = nextTimer;
  timerBase = nextTimer;
  lastKnownUpdatedAt = store.updatedAt ?? 0;
}

// Hydrates only when the shared startup read succeeded (store-startup.ts:
// the gate is "ready"). On a failed or corrupt read nothing is applied and
// `hydrated` stays false — empty defaults are never passed off as the user's
// data — and a retry from the recovery screen hydrates here the same way.
function hydrate() {
  onStoreReady((store) => {
    applyRemoteStore(store);
    hydrated = true;
    emit();
  });
}

/**
 * Re-reads the file now and adopts it (used after an action that wrote to it
 * from outside this module, such as adding legacy records). Rejects if the
 * file cannot be read.
 */
export async function refreshFromStore(): Promise<void> {
  const store = await loadStore();
  applyRemoteStore(store);
  emit();
}

// Returns the save's outcome (rejects on failure) for callers that must not
// report success falsely; the fire-and-forget callers go through persistKey.
function persistKeyChecked(
  key: "seder" | "learning" | "timer",
  value: unknown,
  replace = false,
): Promise<RecordConflict[]> {
  const partial = { [key]: value } as Persisted;
  return saveStoreKey(key, value, { bases: replace ? undefined : basesFor(partial) }).then((res) =>
    afterPersist(partial, res),
  );
}

// Fire-and-forget save. A refused or failed write is never swallowed: what this
// call changed in memory is rolled back to what the file holds (unless
// something newer replaced it meanwhile) and the failure is reported, so the
// screen shows the truth instead of an unsaved change.
function persistKey(key: "seder" | "learning" | "timer", value: unknown, replace = false) {
  persistKeyChecked(key, value, replace).catch((err) => {
    rollbackUnsaved(key, value);
    reportWriteFailure(err);
  });
}

function rollbackUnsaved(key: "seder" | "learning" | "timer", written: unknown) {
  if (key === "seder" && sederEntries === written) {
    sederEntries = sederBase ?? [];
  } else if (key === "learning" && learningEntries === written) {
    learningEntries = learningBase ?? [];
  } else if (key === "timer" && timerSession === written) {
    timerSession = timerBase;
    timerGeneration++;
  } else {
    return;
  }
  emit();
}

// Use this instead of two separate persistKey() calls whenever seder +
// learning change together (backup restore, snapshot restore). Two
// independent writes leave a real window where the shared file — and the
// 4s poll below, in this same window or the other EXE — can observe a
// partial state with only one of the two updated.
function persistKeysChecked(
  partial: Persisted,
  opts: { replace?: boolean } = {},
): Promise<RecordConflict[]> {
  // `replace` (restore, import, delete-all) means the whole list really is the
  // new truth and is written as such, not merged. `extra` keys ride in the
  // same write as plain keys of the file.
  const { extra, ...known } = partial;
  return saveStoreKeys({ ...extra, ...known } as Partial<Record<StoreKey, unknown>>, {
    bases: opts.replace ? undefined : basesFor(known),
  }).then((res) => afterPersist(known, res));
}

type Persisted = {
  seder?: SederEntry[];
  learning?: LearningEntry[];
  timer?: TimerSession | null;
  snapshots?: BackupSnapshot[];
  extra?: Record<string, unknown>;
};

// Entries are written as a record-level merge against what this window last
// loaded/wrote, so another window's concurrent add or edit is not erased by
// this window's stale array (see saveStoreKeys `bases`).
function basesFor(partial: Persisted): StoreBases {
  const bases: StoreBases = {};
  if (partial.seder !== undefined && sederBase) bases.seder = sederBase;
  if (partial.learning !== undefined && learningBase) bases.learning = learningBase;
  return bases;
}

// Returns the records that could not be applied (see store.rs merge_records):
// the file kept its version of each, `merged` below makes this window adopt it,
// and the user's pending version is parked for them to resolve (save-conflicts.ts).
function afterPersist(partial: Persisted, res: SaveResult): RecordConflict[] {
  lastKnownUpdatedAt = res.updatedAt;
  if (partial.timer !== undefined) timerBase = partial.timer;
  if (partial.seder !== undefined) {
    sederBase = partial.seder;
    const merged = res.merged?.seder;
    // Adopt what the file really holds now (the other window's records), but
    // only if nothing newer replaced the list while the save was in flight.
    if (Array.isArray(merged) && sederEntries === partial.seder) {
      sederEntries = merged as SederEntry[];
      sederBase = sederEntries;
      emit();
    }
  }
  if (partial.learning !== undefined) {
    learningBase = partial.learning;
    const merged = res.merged?.learning;
    if (Array.isArray(merged) && learningEntries === partial.learning) {
      learningEntries = merged as LearningEntry[];
      learningBase = learningEntries;
      emit();
    }
  }
  const conflicts = res.conflicts ?? [];
  reportConflicts(conflicts);
  return conflicts;
}

// "החלף": this window's version of one conflicting record written over the
// file's — an explicit overwrite. It starts from the file as it is NOW (read
// fresh) and uses that as the merge base, so the only difference it makes is
// the user's own version of that one record; if the file moved yet again in
// between, that is a new conflict, not a silent overwrite.
async function replaceConflictingRecord(
  key: "seder" | "learning",
  conflict: RecordConflict,
): Promise<void> {
  const store = await loadStore();
  const fileList = (store as Record<string, unknown>)[key];
  if (!Array.isArray(fileList)) throw new Error("הקובץ אינו מכיל את הרשימה הזאת");
  const merged = applyMineToList(fileList as { id: string | number }[], conflict);
  const before = key === "seder" ? sederEntries : learningEntries;
  const next = key === "seder" ? sortSeder(merged as SederEntry[]) : (merged as LearningEntry[]);
  if (key === "seder") sederEntries = next as SederEntry[];
  else learningEntries = next as LearningEntry[];
  emit();
  try {
    const res = await saveStoreKey(key, next, { bases: { [key]: fileList } });
    afterPersist({ [key]: next } as Persisted, res);
    backupNow();
  } catch (err) {
    if (key === "seder" && sederEntries === next) sederEntries = before as SederEntry[];
    if (key === "learning" && learningEntries === next) learningEntries = before as LearningEntry[];
    emit();
    throw err;
  }
}

registerConflictResolver("seder", (c) => replaceConflictingRecord("seder", c));
registerConflictResolver("learning", (c) => replaceConflictingRecord("learning", c));

function persistKeys(partial: { seder?: SederEntry[]; learning?: LearningEntry[] }) {
  persistKeysChecked(partial, { replace: true }).catch(() => {
    /* best-effort; next poll will reconcile */
  });
}

const sortSeder = (list: SederEntry[]) =>
  [...list].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.seder - b.seder));

function backupNow() {
  maybeAutoBackup({
    attendance: sederEntries as unknown,
    learning: learningEntries as unknown,
  });
}

/**
 * Swaps ALL attendance and learning for the given lists, together with ONE full
 * safety snapshot of what is there now, in a single atomic write
 * (snapshots + seder + learning): the file gets both or neither. Nothing is
 * filtered — an invalid record rejects the whole call with a ValidationError
 * before anything changes (analyse first, see backup-analysis.ts).
 *
 * The snapshot is the new, complete one and goes first in the list, so it is
 * the one kept even when the retention is 1; none is taken when there is no
 * data. Memory updates synchronously; the promise settles with the save. On
 * failure memory is restored (if nothing changed meanwhile), the snapshot list
 * is untouched and it rejects. Resolves with the snapshot taken (or null).
 * `opts.extra` (a restore from a full copy, chosen explicitly) adds other file
 * keys — settings, onboarded, unknown keys — to the same atomic write. Keys not
 * named there, and keys of the file this version does not know, are never
 * touched. It does not read the file back — see backup-actions.ts, which does.
 */
/**
 * The window's lists can be a few seconds old (another window may have written
 * since the last poll), and the safety copy is built from them. So the file is
 * read again first; if that read fails, nothing is changed.
 */
export async function replaceAllDataChecked(
  sederList: SederEntry[],
  learningList: LearningEntry[],
  opts: { safetySnapshot?: boolean; extra?: Record<string, unknown> } = {},
): Promise<{ snapshot: BackupSnapshot | null }> {
  if (opts.safetySnapshot !== false) {
    try {
      await refreshFromStore();
    } catch (e) {
      throw new Error(
        `לא ניתן לקרוא את קובץ הנתונים לפני ההחלפה, ולכן לא שונה דבר${e instanceof Error && e.message ? ` (${e.message})` : ""}`,
      );
    }
  }
  return replaceAllDataNow(sederList, learningList, opts);
}

function replaceAllDataNow(
  sederList: SederEntry[],
  learningList: LearningEntry[],
  opts: { safetySnapshot?: boolean; extra?: Record<string, unknown> } = {},
): Promise<{ snapshot: BackupSnapshot | null }> {
  for (const e of sederList) {
    const v = validateSeder(e);
    if (!v.ok) return Promise.reject(new ValidationError(`רשומת סדר ${e.date}: ${v.error}`));
  }
  for (const l of learningList) {
    const v = validateLearning(l);
    if (!v.ok) return Promise.reject(new ValidationError(`רשומת לימוד ${l.date}: ${v.error}`));
  }
  const beforeSeder = sederEntries;
  const beforeLearning = learningEntries;
  const nextSeder = sortSeder(sederList);
  const nextLearning = [...learningList];
  // The safety copy is part of the operation: when it cannot be made (an empty
  // store needs none), nothing is changed and the call rejects.
  let plan: ReturnType<typeof planSnapshot> = null;
  if (opts.safetySnapshot !== false) {
    try {
      plan = planSnapshot({ attendance: beforeSeder, learning: beforeLearning }, "before-op");
    } catch (e) {
      return Promise.reject(
        new Error(
          `אי אפשר ליצור עותק בטיחות של הנתונים הנוכחיים${e instanceof Error && e.message ? ` (${e.message})` : ""}`,
        ),
      );
    }
    if (!plan && beforeSeder.length + beforeLearning.length > 0)
      return Promise.reject(new Error("אי אפשר ליצור עותק בטיחות של הנתונים הנוכחיים"));
  }
  sederEntries = nextSeder;
  learningEntries = nextLearning;
  emit();
  return persistKeysChecked(
    {
      seder: nextSeder,
      learning: nextLearning,
      ...(plan ? { snapshots: plan.list } : {}),
      ...(opts.extra ? { extra: opts.extra } : {}),
    },
    { replace: true },
  ).then(
    () => {
      if (plan) commitSnapshotPlan(plan);
      return { snapshot: plan?.snap ?? null };
    },
    (err) => {
      if (sederEntries === nextSeder) sederEntries = beforeSeder;
      if (learningEntries === nextLearning) learningEntries = beforeLearning;
      emit();
      throw err;
    },
  );
}

/** Deletes ALL attendance and learning, with its safety snapshot in the same
 *  atomic write. See replaceAllDataChecked. */
export function clearAllData(): Promise<{ snapshot: BackupSnapshot | null }> {
  return replaceAllDataChecked([], []);
}

/**
 * Ends the timer session and records its learning entry in ONE write
 * (learning + timer together). Memory updates synchronously; the promise
 * settles with the save. On failure the entry is removed again and the session
 * is put back (only if nothing else started/changed meanwhile), and it rejects
 * — so a failed save never loses the session. Rejects at once (nothing
 * changed) when the entry is invalid or the session is not the one the caller
 * saw (`expectedGeneration`, see getTimerGeneration).
 */
export function saveLearningAndEndTimer(
  entry: LearningEntry,
  expectedGeneration: number,
): Promise<void> {
  const v = validateLearning(entry);
  if (!v.ok) {
    logWarn(`רישום לימוד נדחה (${entry.date}): ${v.error}`);
    return Promise.reject(new ValidationError(v.error));
  }
  const session = timerSession;
  if (!session || timerGeneration !== expectedGeneration)
    return Promise.reject(new ValidationError("הטיימר התחלף או הסתיים, ולכן לא נשמר"));
  const beforeLearning = learningEntries;
  const nextLearning = [entry, ...beforeLearning];
  learningEntries = nextLearning;
  timerSession = null;
  emit();
  return persistKeysChecked({ learning: nextLearning, timer: null }).then(
    () => {
      timerGeneration++;
      backupNow();
    },
    (err) => {
      if (learningEntries === nextLearning) learningEntries = beforeLearning;
      else learningEntries = learningEntries.filter((i) => i.id !== entry.id);
      if (timerSession === null && timerGeneration === expectedGeneration) timerSession = session;
      emit();
      throw err;
    },
  );
}

// Cross-window sync: poll the shared data file so a write made in the
// *other* EXE/window shows up here without a manual refresh. Gated on the
// file's mtime (a stat, nothing read or parsed) because the same file also
// holds the settings and the in-app snapshots — re-parsing all of that every
// few seconds in every window would not be free. The shared-state module runs
// its own poll over the same file for settings/theme/snapshots; both are
// mtime-gated, so an idle app does two stat calls every 4s and nothing more.
if (typeof window !== "undefined") {
  hydrate();
  let lastSeenStamp = "";
  setInterval(async () => {
    // Not read yet, or unreadable: keep what is in memory untouched.
    if (getStoreGate() !== "ready") return;
    try {
      const stamp = await storeStamp();
      if (stamp === lastSeenStamp) return;
      const store = await loadStore();
      lastSeenStamp = stamp;
      if ((store.updatedAt ?? 0) > lastKnownUpdatedAt) {
        applyRemoteStore(store);
        emit();
      }
    } catch {
      /* transient read failure — try again next tick */
    }
  }, 4000);
}

function snapshotIfConfigured() {
  if (typeof window === "undefined") return;
  if (!getSettings().data.autoBackupBeforeOps) return;
  const data = { attendance: sederEntries as unknown, learning: learningEntries as unknown };
  // No data, no safety copy: an empty one would push a full one out.
  if (isEmptyData(data)) return;
  createSnapshot(data, "before-op");
}

export class ValidationError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "ValidationError";
  }
}

// ============ Time helpers ============
export function hhmmToMin(t?: string): number | null {
  if (!t) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(t);
  if (!m) return null;
  const h = +m[1],
    mm = +m[2];
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
  missingMin: number; // raw missing (late + early or absent length)
  bonusMin: number; // bonus from early arrival, capped at threshold
  excusedMin: number; // excused portion of missing
  nonExcusedMin: number; // missing - excused
  netMissingMin: number; // nonExcused + manualAdjust, clamped to >= 0, minus bonus, >= 0
  isLate: boolean;
  isEarlyDeparture: boolean;
  isOhevei: boolean; // whether ohevei is actually valid
  /**
   * A seder ב׳ the user was already sitting at by SHAS_ARRIVAL_DEADLINE —
   * what חבורת ש"ס counts. Computed for every row regardless of the setting;
   * whether it is *shown* is what the setting decides, so switching the
   * חבורה on does not require re-entering a single past record.
   */
  isShasArrival: boolean;
};

export function calcSeder(entry: SederEntry): SederCalc {
  const s = getSettings().seder;
  const t = getSederTimesFor(entry.date);
  const startStr = entry.seder === 1 ? t.s1Start : t.s2Start;
  const endStr = entry.seder === 1 ? t.s1End : t.s2End;
  const startMin = hhmmToMin(startStr) ?? 0;
  const endMin = hhmmToMin(endStr) ?? 0;
  const sederLengthMin = Math.max(0, endMin - startMin);

  let missing = 0,
    bonus = 0,
    isLate = false,
    isEarly = false;
  if (entry.absent) {
    missing = sederLengthMin;
  } else {
    const arr = hhmmToMin(entry.arrival);
    const dep = hhmmToMin(entry.departure);
    if (arr !== null) {
      if (arr > startMin) {
        missing += arr - startMin;
        isLate = true;
      } else if (arr < startMin) {
        bonus = Math.min(s.bonusThresholdMin, startMin - arr);
      }
    } else {
      // missing arrival treated as absent if no departure either
      if (dep === null) missing = sederLengthMin;
    }
    if (dep !== null) {
      if (dep < endMin) {
        missing += endMin - dep;
        isEarly = true;
      }
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
  const isOhevei =
    entry.ohevei &&
    !entry.absent &&
    arr !== null &&
    dep !== null &&
    arr <= startMin &&
    dep >= endMin;

  // חבורת ש"ס — סדר ב׳ בלבד, נוכח בפועל, והגיע עד השעה הקבועה.
  const shasDeadline = hhmmToMin(SHAS_ARRIVAL_DEADLINE);
  const isShasArrival =
    entry.seder === 2 &&
    !entry.absent &&
    arr !== null &&
    shasDeadline !== null &&
    arr <= shasDeadline;

  return {
    sederLengthMin,
    missingMin: missing,
    bonusMin: bonus,
    excusedMin: excused,
    nonExcusedMin: nonExcused,
    netMissingMin,
    isLate,
    isEarlyDeparture: isEarly,
    isOhevei,
    isShasArrival,
  };
}

// ============ Validation ============
export function validateSeder(e: SederEntry): { ok: true } | { ok: false; error: string } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date)) return { ok: false, error: "תאריך לא תקין" };
  if (new Date(e.date).getTime() > Date.now() + 86400000)
    return { ok: false, error: "לא ניתן לרשום תאריך עתידי" };
  if (e.seder !== 1 && e.seder !== 2) return { ok: false, error: "סדר לא חוקי" };
  if (!e.absent) {
    if (e.arrival !== undefined && hhmmToMin(e.arrival) === null)
      return { ok: false, error: "שעת הגעה לא תקינה" };
    if (e.departure !== undefined && hhmmToMin(e.departure) === null)
      return { ok: false, error: "שעת יציאה לא תקינה" };
    const a = hhmmToMin(e.arrival),
      d = hhmmToMin(e.departure);
    if (a !== null && d !== null && d < a) return { ok: false, error: "שעת יציאה לפני שעת הגעה" };
  }
  if (e.excusedMinutes < 0 || e.excusedMinutes > 24 * 60)
    return { ok: false, error: "מספר דקות מוצדק לא תקין" };
  if (Math.abs(e.manualAdjustMin) > 24 * 60) return { ok: false, error: "התאמה ידנית גדולה מדי" };
  if (e.note && e.note.length > 500) return { ok: false, error: "הערה ארוכה מדי" };
  return { ok: true };
}

export function validateLearning(l: LearningEntry): { ok: true } | { ok: false; error: string } {
  if (!l.id) return { ok: false, error: "מזהה חסר" };
  if (!["kollel-erev", "torato-beyado", "bein-hazmanim"].includes(l.framework))
    return { ok: false, error: "מסגרת לא חוקית" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(l.date)) return { ok: false, error: "תאריך לא תקין" };
  if (typeof l.minutes !== "number" || l.minutes < 1 || l.minutes > 24 * 60)
    return { ok: false, error: "משך לא חוקי (1–1440 דקות)" };
  return { ok: true };
}

// דקות אפקטיביות לחישוב סיכומים — תענית דיבור נספרת כפול.
export function effectiveLearningMin(l: LearningEntry): number {
  return l.tanitDibur ? l.minutes * 2 : l.minutes;
}

// In-memory seeding helper (and legacy fire-and-forget): it silently drops
// records that fail validation and does not wait for the save, so the backup
// screen must NOT use it — import/restore go through replaceAllDataChecked.
// Kept because many tests seed the store with it.
export function replaceAllData(sederList: SederEntry[], learningList: LearningEntry[]) {
  sederEntries = sederList
    .filter((e) => validateSeder(e).ok)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.seder - b.seder));
  learningEntries = learningList.filter((l) => validateLearning(l).ok);
  persistKeys({ seder: sederEntries, learning: learningEntries });
  emit();
}

// Shared by upsert / upsertChecked: validation, the weekend/Yom Tov block and
// the restore rule. Throws ValidationError; returns the record being replaced.
function checkSederUpsert(e: SederEntry, opts?: { restore?: boolean }): SederEntry | undefined {
  const v = validateSeder(e);
  if (!v.ok) {
    logWarn(`רישום סדר נדחה (${e.date}, סדר ${e.seder}): ${v.error}`);
    throw new ValidationError(v.error);
  }
  const prev = sederEntries.find((x) => x.id === e.id);
  // No attendance on a weekend or Yom Tov. Only a record arriving on that day
  // is refused — one already there (old, imported, restored) can still be
  // edited in place, and replaceAll (import/restore) is not subject to this.
  if (!opts?.restore && (!prev || prev.date !== e.date)) {
    const blocked = attendanceBlockedMessage(e.date);
    if (blocked) {
      logWarn(`רישום סדר נדחה (${e.date}, סדר ${e.seder}): ${blocked}`);
      throw new ValidationError(blocked);
    }
  }
  // Undoing a deletion must not put a second record on a day and seder that
  // has meanwhile been filled in again.
  if (
    opts?.restore &&
    sederEntries.some((x) => x.id !== e.id && x.date === e.date && x.seder === e.seder)
  ) {
    throw new ValidationError("כבר נרשם סדר זה ביום הזה, ולכן הרישום שנמחק לא שוחזר");
  }
  return prev;
}

function checkLearningAdd(item: LearningEntry) {
  const v = validateLearning(item);
  if (!v.ok) {
    logWarn(`רישום לימוד נדחה (${item.date}): ${v.error}`);
    throw new ValidationError(v.error);
  }
}

// ============ Hooks / API ============
export function useSeder() {
  const [, force] = useState(0);
  useEffect(() => {
    const fn = () => force((n) => n + 1);
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);
  return {
    entries: sederEntries,
    /**
     * `restore` is for undoing a deletion: the record goes back exactly where
     * it was, even on a weekend/Yom Tov where it was saved before the rule.
     */
    upsert(e: SederEntry, opts?: { restore?: boolean }) {
      const prev = checkSederUpsert(e, opts);
      if (!prev) snapshotIfConfigured();
      sederEntries = sortSeder([e, ...sederEntries.filter((x) => x.id !== e.id)]);
      persistKey("seder", sederEntries);
      backupNow();
      emit();
    },
    /**
     * Same validation/weekend-Yom-Tov block/restore rules as `upsert`, but the
     * promise settles only after the write reached storage. Memory updates at
     * once; on a failed save THIS record (by id) is put back — the previous
     * version, or removed if it was new — without touching other records
     * changed meanwhile, and the promise rejects. Validation failures reject
     * the promise too (nothing changed).
     */
    upsertChecked(e: SederEntry, opts?: { restore?: boolean }): Promise<SaveOutcome> {
      let prev: SederEntry | undefined;
      try {
        prev = checkSederUpsert(e, opts);
      } catch (err) {
        return Promise.reject(err);
      }
      if (!prev) snapshotIfConfigured();
      sederEntries = sortSeder([e, ...sederEntries.filter((x) => x.id !== e.id)]);
      const written = sederEntries;
      emit();
      return persistKeyChecked("seder", written).then(
        (conflicts) => {
          backupNow();
          return outcomeOf(conflicts);
        },
        (err) => {
          if (sederEntries.find((x) => x.id === e.id) === e) {
            const rest = sederEntries.filter((x) => x.id !== e.id);
            sederEntries = sortSeder(prev ? [prev, ...rest] : rest);
            emit();
          }
          throw err;
        },
      );
    },
    /** Checked delete: rejects on a failed save, putting the record back by id. */
    removeChecked(id: string): Promise<SaveOutcome> {
      const prev = sederEntries.find((x) => x.id === id);
      if (!prev) return Promise.resolve(COMPLETE_SAVE);
      snapshotIfConfigured();
      sederEntries = sederEntries.filter((x) => x.id !== id);
      emit();
      return persistKeyChecked("seder", sederEntries).then(outcomeOf, (err) => {
        if (!sederEntries.some((x) => x.id === id)) {
          sederEntries = sortSeder([prev, ...sederEntries]);
          emit();
        }
        throw err;
      });
    },
    remove(id: string) {
      const prev = sederEntries.find((x) => x.id === id);
      if (!prev) return;
      snapshotIfConfigured();
      sederEntries = sederEntries.filter((x) => x.id !== id);
      persistKey("seder", sederEntries);
      emit();
    },
    replaceAll(list: SederEntry[]) {
      sederEntries = list
        .filter((e) => validateSeder(e).ok)
        .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.seder - b.seder));
      persistKey("seder", sederEntries, true);
      emit();
    },
    clearAll() {
      snapshotIfConfigured();
      sederEntries = [];
      persistKey("seder", sederEntries, true);
      emit();
    },
  };
}

export function useLearning() {
  const [, force] = useState(0);
  useEffect(() => {
    const fn = () => force((n) => n + 1);
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);
  return {
    items: learningEntries,
    add(item: LearningEntry) {
      checkLearningAdd(item);
      learningEntries = [item, ...learningEntries];
      persistKey("learning", learningEntries);
      backupNow();
      emit();
    },
    /**
     * Same validation as `add`, but the promise settles only after the write
     * reached storage. On a failed save THIS record (by id) is removed again,
     * leaving records changed meanwhile alone, and the promise rejects.
     * Validation failures reject the promise too (nothing changed).
     */
    addChecked(item: LearningEntry): Promise<SaveOutcome> {
      try {
        checkLearningAdd(item);
      } catch (err) {
        return Promise.reject(err);
      }
      // Idempotent on id: a double-clicked "undo" (or an undo after a restore)
      // must not count the same lesson twice.
      if (learningEntries.some((i) => i.id === item.id)) return Promise.resolve(COMPLETE_SAVE);
      learningEntries = [item, ...learningEntries];
      emit();
      return persistKeyChecked("learning", learningEntries).then(
        (conflicts) => {
          backupNow();
          return outcomeOf(conflicts);
        },
        (err) => {
          if (learningEntries.includes(item)) {
            learningEntries = learningEntries.filter((i) => i !== item);
            emit();
          }
          throw err;
        },
      );
    },
    /**
     * Swaps the entry with the same id for `item` in place, with ONE save and
     * no intermediate delete. Throws ValidationError (nothing changed) when the
     * item is invalid or unknown. Memory updates synchronously; the returned
     * promise settles with the save, and on failure memory is rolled back to
     * the previous array (if nothing else changed it meanwhile) and it rejects.
     */
    replace(item: LearningEntry): Promise<SaveOutcome> {
      const v = validateLearning(item);
      if (!v.ok) {
        logWarn(`החלפת רישום לימוד נדחתה (${item.date}): ${v.error}`);
        throw new ValidationError(v.error);
      }
      if (!learningEntries.some((i) => i.id === item.id))
        throw new ValidationError("הרישום לא נמצא");
      const prev = learningEntries.find((i) => i.id === item.id)!;
      learningEntries = learningEntries.map((i) => (i.id === item.id ? item : i));
      emit();
      return persistKeyChecked("learning", learningEntries).then(
        (conflicts) => {
          backupNow();
          return outcomeOf(conflicts);
        },
        (err) => {
          // By record id, not whole array: a parallel change to another record
          // is neither overwritten nor left wrong.
          if (learningEntries.includes(item)) {
            learningEntries = learningEntries.map((i) => (i === item ? prev : i));
            emit();
          }
          throw err;
        },
      );
    },
    /** Checked delete: rejects on a failed save, putting the record back by id. */
    removeChecked(id: string): Promise<SaveOutcome> {
      const prev = learningEntries.find((i) => i.id === id);
      if (!prev) return Promise.resolve(COMPLETE_SAVE);
      const index = learningEntries.indexOf(prev);
      learningEntries = learningEntries.filter((i) => i.id !== id);
      emit();
      return persistKeyChecked("learning", learningEntries).then(outcomeOf, (err) => {
        if (!learningEntries.some((i) => i.id === id)) {
          const next = [...learningEntries];
          next.splice(Math.min(index, next.length), 0, prev);
          learningEntries = next;
          emit();
        }
        throw err;
      });
    },
    remove(id: string) {
      const prev = learningEntries.find((i) => i.id === id);
      if (!prev) return;
      learningEntries = learningEntries.filter((i) => i.id !== id);
      persistKey("learning", learningEntries);
      emit();
    },
    replaceAll(list: LearningEntry[]) {
      learningEntries = list.filter((l) => validateLearning(l).ok);
      persistKey("learning", learningEntries, true);
      emit();
    },
    clearAll() {
      snapshotIfConfigured();
      learningEntries = [];
      persistKey("learning", learningEntries, true);
      emit();
    },
  };
}

// ============ Timer ============
export function getTimer(): TimerSession | null {
  return timerSession;
}
export function useTimer(): TimerSession | null {
  const [, force] = useState(0);
  useEffect(() => {
    const fn = () => force((n) => n + 1);
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);
  return timerSession;
}
/**
 * How long the session has actually been running, in milliseconds.
 *
 * The clock is derived from timestamps in the shared data file rather than
 * kept by a `setInterval` in the window, which is why closing the app does
 * not stop it: whatever reopens the app — this EXE or the other one — reads
 * the same `startedAt` and carries on from it.
 */
export function timerElapsedMs(t: TimerSession, now = Date.now()): number {
  const banked = t.accumulatedMs ?? 0;
  return t.pausedAt !== undefined ? banked : banked + Math.max(0, now - t.startedAt);
}

export function isTimerPaused(t: TimerSession): boolean {
  return t.pausedAt !== undefined;
}

export function startTimer(
  framework: LearningFramework,
  opts?: { limitMinutes?: number; tanitDibur?: boolean },
): TimerSession {
  assertStoreWritable();
  timerGeneration++;
  const t: TimerSession = {
    framework,
    startedAt: Date.now(),
    ...(opts?.limitMinutes && opts.limitMinutes > 0 ? { limitMinutes: opts.limitMinutes } : {}),
    ...(opts?.tanitDibur ? { tanitDibur: true } : {}),
  };
  timerSession = t;
  persistKey("timer", t);
  emit();
  return t;
}

/** Stops the clock, banking the time run so far. No-op if already paused. */
export function pauseTimer(now = Date.now()): TimerSession | null {
  const t = getTimer();
  if (!t || t.pausedAt !== undefined) return t;
  assertStoreWritable();
  const next: TimerSession = {
    ...t,
    accumulatedMs: timerElapsedMs(t, now),
    pausedAt: now,
  };
  timerSession = next;
  persistKey("timer", next);
  emit();
  return next;
}

/** Restarts the clock from where it stopped. No-op if not paused. */
export function resumeTimer(now = Date.now()): TimerSession | null {
  const t = getTimer();
  if (!t || t.pausedAt === undefined) return t;
  assertStoreWritable();
  const next: TimerSession = { ...t, startedAt: now };
  delete next.pausedAt;
  timerSession = next;
  persistKey("timer", next);
  emit();
  return next;
}

export type TimerResult = {
  framework: LearningFramework;
  minutes: number;
  tanitDibur?: boolean;
};

/** What stopTimer() would return, without ending the session. */
export function previewStopTimer(): TimerResult | null {
  const t = getTimer();
  if (!t) return null;
  let minutes = Math.max(1, Math.round(timerElapsedMs(t) / 60000));
  if (t.limitMinutes && minutes > t.limitMinutes) minutes = t.limitMinutes;
  return { framework: t.framework, minutes, tanitDibur: t.tanitDibur };
}

export function stopTimer(): TimerResult | null {
  const res = previewStopTimer();
  if (!res) return null;
  assertStoreWritable();
  timerGeneration++;
  timerSession = null;
  persistKey("timer", null);
  emit();
  return res;
}
/**
 * Drops the time limit of the running session and nothing else: startedAt,
 * accumulatedMs and pausedAt are kept, so the time already run still counts.
 * Same session (generation unchanged). Throws StoreBlockedError when the file
 * may not be written; on a failed save the limit comes back.
 */
export function removeTimerLimit(): TimerSession | null {
  const t = timerSession;
  if (!t || t.limitMinutes === undefined) return t;
  assertStoreWritable();
  const next: TimerSession = { ...t };
  delete next.limitMinutes;
  timerSession = next;
  persistKey("timer", next);
  emit();
  return next;
}

export function cancelTimer(): void {
  if (!timerSession) return;
  assertStoreWritable();
  timerGeneration++;
  timerSession = null;
  persistKey("timer", null);
  emit();
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
  /** סדרי ב׳ שהגיע אליהם עד SHAS_ARRIVAL_DEADLINE — מונה חבורת ש"ס. */
  shasCount: number;
  entries: number;
  netMissing: number;
};

export function summarizeEntries(list: SederEntry[]): MonthlySummary {
  const out: MonthlySummary = {
    totalMissing: 0,
    excused: 0,
    nonExcused: 0,
    bonus: 0,
    lateCount: 0,
    absenceCount: 0,
    earlyDepCount: 0,
    oheveiCount: 0,
    shasCount: 0,
    entries: list.length,
    netMissing: 0,
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
    if (c.isShasArrival) out.shasCount++;
  }
  return out;
}

export function monthlySummary(year: number, monthIdx: number): MonthlySummary {
  return summarizeEntries(entriesInMonth(sederEntries, year, monthIdx));
}

// ============ Monthly closing (נעילת חודש) ============
// A per-month closing line: the seder totals for the month plus the extra
// learning minutes logged in it. Built from whatever list is handed in, so the
// History screen can close each month over exactly the rows it displays.

const GREGORIAN_MONTHS_HE = [
  "ינואר",
  "פברואר",
  "מרץ",
  "אפריל",
  "מאי",
  "יוני",
  "יולי",
  "אוגוסט",
  "ספטמבר",
  "אוקטובר",
  "נובמבר",
  "דצמבר",
];

export type MonthLearningTotals = {
  kollelErev: number; // דקות אפקטיביות (תענית דיבור נספרת כפול)
  kollelErevRaw: number; // דקות בפועל, לפני הכפלה
  toratoBeyado: number;
  beinHazmanim: number;
};

export type MonthClosing = {
  monthKey: string; // YYYY-MM
  gregorianLabel: string; // "אוגוסט 2026"
  hebrewLabel: string; // "תמוז–אב תשפ״ו"
  closed: boolean; // האם החודש הסתיים (אחרת: סיכום ביניים)
  seder: MonthlySummary;
  learning: MonthLearningTotals;
};

// "אב תשפ״ו" for a Gregorian month fully inside one Hebrew month, otherwise
// the two-month span it straddles ("תמוז–אב תשפ״ו").
function hebrewMonthLabelFor(year: number, monthIdx: number): string {
  const first = hebrewFromGregorian(new Date(year, monthIdx, 1));
  const last = hebrewFromGregorian(new Date(year, monthIdx + 1, 0));
  if (first.month === last.month && first.year === last.year) return formatHebrewMonthYear(first);
  const a = hebrewMonthName(first.month, first.year);
  const b = hebrewMonthName(last.month, last.year);
  if (first.year !== last.year) {
    return `${a} ${hebrewYearLetters(first.year)}–${b} ${hebrewYearLetters(last.year)}`;
  }
  return `${a}–${b} ${hebrewYearLetters(last.year)}`;
}

export function monthClosing(
  monthKey: string,
  entries: SederEntry[],
  lessons: LearningEntry[],
): MonthClosing {
  const [year, month] = monthKey.split("-").map(Number);
  const monthIdx = month - 1;
  const learning: MonthLearningTotals = {
    kollelErev: 0,
    kollelErevRaw: 0,
    toratoBeyado: 0,
    beinHazmanim: 0,
  };
  for (const l of lessons) {
    if (!l.date.startsWith(monthKey)) continue;
    const eff = effectiveLearningMin(l);
    if (l.framework === "kollel-erev") {
      learning.kollelErev += eff;
      learning.kollelErevRaw += l.minutes;
    } else if (l.framework === "torato-beyado") learning.toratoBeyado += eff;
    else learning.beinHazmanim += eff;
  }
  // Closed once the last day of the month has passed.
  const lastDay = new Date(year, monthIdx + 1, 0);
  const closed = lastDay.getTime() < new Date(new Date().toDateString()).getTime();
  return {
    monthKey,
    gregorianLabel: `${GREGORIAN_MONTHS_HE[monthIdx] ?? monthKey} ${year}`,
    hebrewLabel: hebrewMonthLabelFor(year, monthIdx),
    closed,
    seder: summarizeEntries(entries.filter((e) => e.date.startsWith(monthKey))),
    learning,
  };
}

/**
 * Attendance score 0–100 over an arbitrary set of entries.
 *
 * Takes the list rather than reading the store, so a report built over a date
 * range scores the rows it is actually showing — the month columns used to be
 * computed from every record on file regardless of the range asked for.
 */
export function scoreEntries(list: SederEntry[]): number {
  if (!list.length) return 0;
  // expected total minutes = sum of seder lengths across entries
  let expected = 0,
    net = 0,
    bonus = 0,
    lateCount = 0;
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

/** Attendance score 0–100 for one calendar month of the live store. */
export function attendanceScore(year: number, monthIdx: number): number {
  return scoreEntries(entriesInMonth(sederEntries, year, monthIdx));
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
    if (!isLearningDay(d)) continue; // weekend / יום טוב / ערב יום טוב — לא שוברים רצף
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

export function getSederSnapshot() {
  return sederEntries;
}
export function getLearningSnapshot() {
  return learningEntries;
}

// The list is a parameter so a component can hand over the entries it already
// holds from useSeder. Reading the module store instead is invisible to
// useMemo, which then flags its own [entries] trigger as an unnecessary
// dependency; passing them in makes that dependency real. Defaults to the
// store for callers with nothing in hand.
export function allTags(list: readonly SederEntry[] = sederEntries): string[] {
  const set = new Set<string>();
  for (const e of list) (e.tags || []).forEach((t) => set.add(t));
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
