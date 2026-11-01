import { useSyncExternalStore } from "react";

import { logInfo, logProblem, logWarn } from "./diagnostics";
import {
  createUpgradeCopy,
  loadStoreChecked,
  saveStoreKeys,
  type StoreShape,
} from "./store-bridge";

// Carrying the old localStorage build's data into the shared data file.
//
// The rules, in the order they matter:
//   * Nothing in localStorage or in the file is ever deleted.
//   * A segment (seder / learning / timer) is carried over ONLY when its key
//     is absent from the file. A key that exists — even as [] — means the user
//     already worked there or deleted on purpose, and is never revived.
//   * Legacy records (by id) that the existing file does not have are a
//     conflict nobody can decide automatically: nothing changes, a full copy
//     of both sides is kept, and the UI offers an explicit "add the missing
//     records" action (which only ever adds ids that are not there).
//   * Before the first write a full upgrade copy (the file + the raw legacy
//     keys) is made and checked. No copy, no write.
//   * Everything missing is written in ONE atomic save, read back, and
//     compared by id and content. Only then is the (v2) done-flag written.
//   * The old MIGRATED_FLAG proves nothing: the previous code set it even when
//     the learning copy had failed. It is never consulted.
//   * Any failure is visible — logged, flag not written — and retried on the
//     next launch. Running again after success changes nothing.

export const LEGACY_SEDER_KEY = "kollel.seder.v1";
export const LEGACY_LEARNING_KEY = "kollel.learning.v1";
export const LEGACY_TIMER_KEY = "kollel.timer.v1";
/** The old flag. Recorded in the copy, never trusted. */
export const OLD_MIGRATED_FLAG = "kollel.serverStoreMigrated.v1";
/** Written only after a verified, complete migration. */
export const MIGRATION_DONE_FLAG = "kollel.legacyMigration.v2";
const COPY_MARKER = "kollel.legacyMigration.v2.copy";

/** Settings, theme, wizard and snapshot keys — seeded by shared-state per key, and kept in the copy. */
const OTHER_LEGACY_KEYS = [
  "tracker.settings.v1",
  "tracker.onboarded.v1",
  "tracker.theme",
  "tracker.backups.v1",
  "tracker.backups.meta.v1",
];

const DUMP_KEYS = [
  LEGACY_SEDER_KEY,
  LEGACY_LEARNING_KEY,
  LEGACY_TIMER_KEY,
  OLD_MIGRATED_FLAG,
  ...OTHER_LEGACY_KEYS,
];

type Segment = "seder" | "learning";
type Writer = typeof saveStoreKeys;

export type LegacyConflict = { seder: number; learning: number; total: number };

export type MigrationResult =
  | { status: "skipped" }
  | { status: "done"; wrote: string[]; alreadyDone: boolean }
  | { status: "conflict"; wrote: string[]; conflict: LegacyConflict }
  | { status: "failed"; error: string };

type LegacyData = {
  seder?: unknown[];
  learning?: unknown[];
  timer?: unknown;
  errors: string[];
  dump: Record<string, string>;
};

// ---- state the UI reads ----

let conflict: LegacyConflict | null = null;
let failure: string | null = null;
let version = 0;
const listeners = new Set<() => void>();
const bump = () => {
  version++;
  listeners.forEach((fn) => fn());
};

export function getLegacyConflict(): LegacyConflict | null {
  return conflict;
}
export function getLegacyMigrationFailure(): string | null {
  return failure;
}
function setState(nextConflict: LegacyConflict | null, nextFailure: string | null) {
  conflict = nextConflict;
  failure = nextFailure;
  bump();
}
export function useLegacyConflict(): LegacyConflict | null {
  useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    () => version,
    () => version,
  );
  return conflict;
}

// ---- helpers ----

function stable(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(stable).join(",") + "]";
  if (value && typeof value === "object") {
    const rec = value as Record<string, unknown>;
    return (
      "{" +
      Object.keys(rec)
        .filter((k) => rec[k] !== undefined)
        .sort()
        .map((k) => JSON.stringify(k) + ":" + stable(rec[k]))
        .join(",") +
      "}"
    );
  }
  return JSON.stringify(value) ?? "null";
}

/** A record's identity: its id, or — when it has none — its whole content. */
function identity(entry: unknown): string {
  const id = entry && typeof entry === "object" ? (entry as Record<string, unknown>).id : undefined;
  return typeof id === "string" ? "id:" + id : "json:" + stable(entry);
}

function readLegacy(): LegacyData {
  const data: LegacyData = { errors: [], dump: {} };
  const get = (key: string): string | null => {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      data.errors.push(`${key}: ${e instanceof Error ? e.message : String(e)}`);
      return null;
    }
  };
  for (const key of DUMP_KEYS) {
    const raw = get(key);
    if (raw !== null) data.dump[key] = raw;
  }
  const parse = (key: string): unknown | undefined => {
    const raw = data.dump[key];
    if (raw === undefined) return undefined;
    try {
      return JSON.parse(raw);
    } catch {
      data.errors.push(`${key}: התוכן אינו JSON תקין`);
      return undefined;
    }
  };
  for (const [seg, key] of [
    ["seder", LEGACY_SEDER_KEY],
    ["learning", LEGACY_LEARNING_KEY],
  ] as const) {
    const parsed = parse(key);
    if (parsed === undefined) continue;
    if (!Array.isArray(parsed)) {
      data.errors.push(`${key}: התוכן אינו רשימה`);
      continue;
    }
    if (parsed.length) data[seg] = parsed;
  }
  const timer = parse(LEGACY_TIMER_KEY);
  if (timer && typeof timer === "object") data.timer = timer;
  return data;
}

function dumpSignature(dump: Record<string, string>): string {
  const text = stable(dump);
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (Math.imul(h, 31) + text.charCodeAt(i)) | 0;
  return `${text.length}:${(h >>> 0).toString(16)}`;
}

type Plan = {
  /** Segments whose key is absent from the file: written as they are. */
  toWrite: Partial<Record<Segment | "timer", unknown>>;
  /** Legacy records of segments whose key exists, that the file lacks by id. */
  missing: Record<Segment, unknown[]>;
  errors: string[];
};

function plan(legacy: LegacyData, target: StoreShape): Plan {
  const out: Plan = { toWrite: {}, missing: { seder: [], learning: [] }, errors: [] };
  const t = target as Record<string, unknown>;
  for (const seg of ["seder", "learning"] as const) {
    const items = legacy[seg];
    if (!items) continue;
    const existing = t[seg];
    if (existing === undefined) {
      out.toWrite[seg] = items;
      continue;
    }
    if (!Array.isArray(existing)) {
      out.errors.push(`${seg}: המבנה בקובץ אינו רשימה`);
      continue;
    }
    const have = new Set(existing.map(identity));
    for (const item of items) {
      const id = identity(item);
      if (have.has(id)) continue;
      have.add(id);
      out.missing[seg].push(item);
    }
  }
  // The timer is transient: carried over as it is only when the key is absent.
  if (legacy.timer !== undefined && t.timer === undefined) out.toWrite.timer = legacy.timer;
  return out;
}

function conflictOf(missing: Plan["missing"]): LegacyConflict | null {
  const seder = missing.seder.length;
  const learning = missing.learning.length;
  return seder + learning > 0 ? { seder, learning, total: seder + learning } : null;
}

/** Throws unless every legacy record is in the file, equal by id and by content. */
function verify(expected: Partial<Record<Segment | "timer", unknown>>, after: StoreShape): void {
  const a = after as Record<string, unknown>;
  for (const seg of ["seder", "learning"] as const) {
    const want = expected[seg];
    if (!Array.isArray(want)) continue;
    const got = a[seg];
    if (!Array.isArray(got)) throw new Error(`אימות נכשל: ${seg} לא נמצא בקובץ`);
    const byId = new Map<string, string>();
    for (const e of got) byId.set(identity(e), stable(e));
    for (const e of want) {
      if (byId.get(identity(e)) !== stable(e)) {
        throw new Error(`אימות נכשל: רשומה ב-${seg} חסרה או שונה אחרי הכתיבה`);
      }
    }
  }
  if (expected.timer !== undefined && stable(a.timer) !== stable(expected.timer)) {
    throw new Error("אימות נכשל: הטיימר שונה אחרי הכתיבה");
  }
}

async function readTarget(): Promise<StoreShape> {
  const res = await loadStoreChecked();
  if (res.status === "corrupt") throw new Error("קובץ הנתונים אינו נקרא: " + res.message);
  return res.status === "ok" ? res.store : {};
}

async function makeCopy(dump: Record<string, string>, always: boolean): Promise<void> {
  const sig = dumpSignature(dump);
  if (!always) {
    try {
      const m = localStorage.getItem(COPY_MARKER);
      if (m && (JSON.parse(m) as { sig?: string }).sig === sig) return;
    } catch {
      // No usable marker — just make the copy.
    }
  }
  const res = await createUpgradeCopy("legacy-localstorage", dump);
  if (!res || !Array.isArray(res.files) || res.files.length === 0) {
    throw new Error("עותק השדרוג לא נוצר");
  }
  try {
    localStorage.setItem(COPY_MARKER, JSON.stringify({ sig, files: res.files, at: Date.now() }));
  } catch {
    // Only a marker — the copy itself exists.
  }
}

function setDoneFlag(): void {
  try {
    localStorage.setItem(MIGRATION_DONE_FLAG, String(Date.now()));
  } catch {
    // Not written: the next launch repeats this (idempotent) check.
  }
}

function isDone(): boolean {
  try {
    return !!localStorage.getItem(MIGRATION_DONE_FLAG);
  } catch {
    return false;
  }
}

// ---- the migration ----

/**
 * Runs once per launch, after the file was read successfully. `write` is how
 * missing segments reach the file (startup passes the gate-exempt writer).
 */
export async function runLegacyMigration(write: Writer = saveStoreKeys): Promise<MigrationResult> {
  if (typeof localStorage === "undefined") return { status: "skipped" };
  if (isDone()) return { status: "done", wrote: [], alreadyDone: true };
  try {
    const legacy = readLegacy();
    const nothing =
      !legacy.seder && !legacy.learning && legacy.timer === undefined && legacy.errors.length === 0;
    if (nothing) {
      setDoneFlag();
      setState(null, null);
      return { status: "done", wrote: [], alreadyDone: false };
    }

    const target = await readTarget();
    const p = plan(legacy, target);
    const wrote = Object.keys(p.toWrite);

    if (wrote.length) {
      await makeCopy(legacy.dump, true);
      await write(p.toWrite as Parameters<Writer>[0]);
      verify(p.toWrite, await readTarget());
    }

    const found = conflictOf(p.missing);
    if (found) await makeCopy(legacy.dump, false);

    const errors = [...legacy.errors, ...p.errors];
    if (errors.length) {
      const message = errors.join("; ");
      logWarn(`העברת נתונים ישנים לא הושלמה: ${message}`);
      setState(found, message);
      return { status: "failed", error: message };
    }
    if (found) {
      logWarn(
        `נמצאו נתונים ישנים שאינם במאגר (${found.seder} נוכחות, ${found.learning} לימוד); נשמרו ללא שינוי`,
      );
      setState(found, null);
      return { status: "conflict", wrote, conflict: found };
    }
    setDoneFlag();
    setState(null, null);
    if (wrote.length) logInfo(`נתונים ישנים הועברו ואומתו: ${wrote.join(", ")}`);
    return { status: "done", wrote, alreadyDone: false };
  } catch (e) {
    logProblem("העברת נתונים ישנים", e);
    const message = e instanceof Error ? e.message : String(e);
    setState(conflict, message);
    return { status: "failed", error: message };
  }
}

/**
 * The explicit action behind the conflict notice: appends ONLY the legacy
 * records whose id is not already in the file. Never replaces or removes.
 */
export async function applyLegacyMissingRecords(): Promise<{ seder: number; learning: number }> {
  const legacy = readLegacy();
  if (legacy.errors.length) throw new Error(legacy.errors.join("; "));
  const target = await readTarget();
  const p = plan(legacy, target);
  if (p.errors.length) throw new Error(p.errors.join("; "));
  const t = target as Record<string, unknown>;
  const patch: Partial<Record<Segment | "timer", unknown>> = { ...p.toWrite };
  for (const seg of ["seder", "learning"] as const) {
    if (p.missing[seg].length) patch[seg] = [...(t[seg] as unknown[]), ...p.missing[seg]];
  }
  const added = { seder: p.missing.seder.length, learning: p.missing.learning.length };
  if (Object.keys(patch).length) {
    await makeCopy(legacy.dump, true);
    await saveStoreKeys(patch as Parameters<Writer>[0]);
    // Verify the appended records (and any absent segment) now exist in full.
    const expected: typeof patch = { ...p.toWrite };
    for (const seg of ["seder", "learning"] as const) {
      if (p.missing[seg].length) expected[seg] = p.missing[seg];
    }
    verify(expected, await readTarget());
  }
  setDoneFlag();
  setState(null, null);
  logInfo(`נוספו רשומות ישנות חסרות: ${added.seder} נוכחות, ${added.learning} לימוד`);
  return added;
}
