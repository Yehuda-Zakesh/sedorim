import { invoke, isDesktop } from "./tauri";
import { mergeRecordsDetailed, type RecordConflict } from "./record-merge";
import {
  assertStoreWritable,
  getStoreGate,
  StoreBlockedError,
  type CorruptStoreInfo,
  type StoreBackupInfo,
} from "./store-gate";

export { StoreBlockedError };
export type { CorruptStoreInfo, StoreBackupInfo, RecordConflict };

// The app's data lives in one JSON file that both EXEs read and write —
// %APPDATA%\SederPlus\sedorim-data.json. This module is the whole transport
// to it: three calls into Rust (src-tauri/core/src/store.rs).
//
// It replaces the old src/lib/store.functions.ts, which did the same job over
// HTTP against a Nitro server that Electron booted in-process on a fixed
// loopback port. The file, its location and its format are unchanged, so an
// install upgrading from that build keeps its data.
//
// Why a file and not localStorage: SederPlus.exe and SederPlusQuick.exe are
// separate OS processes, and two processes cannot safely share one WebView
// storage partition — whichever opens second can come up blank.

// Every key both EXEs need to agree on. The Rust side treats the file as an
// opaque JSON object, so adding a key here is all it takes.
export type StoreKey =
  | "seder"
  | "learning"
  | "timer"
  // Shared because settings drive the attendance maths, and because a second
  // WebView profile would otherwise keep its own divergent copy of all of
  // this — see shared-state.ts.
  | "settings"
  | "theme"
  | "onboarded"
  | "snapshots"
  | "lastAutoBackupAt"
  // Which reminders have already been raised, so two open EXEs don't both
  // toast the same one — see notifications.ts.
  | "notificationsSent"
  // How each reminder's recent deliveries went, which is what lets one that
  // keeps going unanswered go quiet — see notification-learning.ts.
  | "notificationLearning"
  // When each of the next few hundred days' reminders falls due, worked out
  // here and left for SederPlusAgent.exe to act on while the app is closed —
  // see background-plan.ts and src-tauri/shared/src/plan.rs.
  | "backgroundPlan"
  // Which months have been reported to the phone system. Written by the app
  // and by the agent (from the button on its toast) — see phone-report.ts.
  | "phoneReport";

export type StoreShape = Partial<Record<StoreKey, unknown>> & {
  updatedAt?: number;
};

/**
 * `merged` is present only when a record-level merge kept something the caller
 * did not send (another window's change): the array now in the file, for the
 * caller to adopt.
 */
export type SaveResult = {
  ok: true;
  updatedAt: number;
  merged?: Partial<Record<StoreKey, unknown>>;
  /**
   * Present only when the write was NOT a full success: records this window
   * changed that another window also changed or deleted since this window's
   * base. The file's version of each was kept (nothing was overwritten), every
   * other change was applied, and `merged` holds the arrays now in the file.
   */
  conflicts?: RecordConflict[];
};

/** Per key, the array as the caller last loaded/wrote it — see saveStoreKeys. */
export type StoreBases = Partial<Record<StoreKey, unknown>>;

export type StoreMeta = { upgradedFrom: string | null; upgradeCopy: string | null };

/**
 * What a read of the data file found. "missing" is a real fresh install;
 * "corrupt" means a file IS there and could not be read — never to be treated
 * as empty, and never written over.
 */
export type LoadCheckedResult =
  | { status: "missing"; meta: StoreMeta }
  | { status: "ok"; store: StoreShape; meta: StoreMeta }
  | ({ status: "corrupt"; meta: StoreMeta } & CorruptStoreInfo);

const NO_META: StoreMeta = { upgradedFrom: null, upgradeCopy: null };

// Browser fallback for `npm run dev`, where there is no Rust side. Single
// key, same shape as the file, so the app behaves identically. It mimics the
// same contract as the desktop commands: a missing key is "missing", text that
// is not a JSON object is "corrupt" (its raw text kept under a separate key).
const DEV_STORE_KEY = "sedorim.devStore.v1";
const DEV_CORRUPT_KEY = "sedorim.devStore.corrupt.v1";
const DEV_COPY_PREFIX = "sedorim.devUpgradeCopy.v1.";

function devLoadChecked(): LoadCheckedResult {
  let raw: string | null;
  try {
    raw = localStorage.getItem(DEV_STORE_KEY);
  } catch (e) {
    return {
      status: "corrupt",
      reason: "unreadable",
      message: e instanceof Error ? e.message : String(e),
      preservedAs: null,
      backups: [],
      meta: NO_META,
    };
  }
  if (raw === null) return { status: "missing", meta: NO_META };
  let reason: "unparseable" | "not-an-object";
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return { status: "ok", store: parsed as StoreShape, meta: NO_META };
    }
    reason = "not-an-object";
  } catch {
    reason = "unparseable";
  }
  let preservedAs: string | null = null;
  try {
    if (localStorage.getItem(DEV_CORRUPT_KEY) === null) localStorage.setItem(DEV_CORRUPT_KEY, raw);
    preservedAs = DEV_CORRUPT_KEY;
  } catch {
    // Could not keep a second copy — the original is still under DEV_STORE_KEY.
    preservedAs = null;
  }
  return {
    status: "corrupt",
    reason,
    message: reason === "unparseable" ? "התוכן אינו JSON תקין" : "התוכן אינו אובייקט",
    preservedAs,
    backups: [],
    meta: NO_META,
  };
}

function devSave(patch: Partial<Record<StoreKey, unknown>>, bases?: StoreBases): SaveResult {
  const current = devLoadChecked();
  if (current.status === "corrupt") throw new Error("STORE_CORRUPT: " + current.message);
  const file: Record<string, unknown> = current.status === "ok" ? { ...current.store } : {};
  const merged: Partial<Record<StoreKey, unknown>> = {};
  const conflicts: RecordConflict[] = [];
  for (const [key, value] of Object.entries(patch)) {
    const res =
      bases && key in bases
        ? mergeRecordsDetailed(key, bases[key as StoreKey], value, file[key])
        : null;
    if (res) {
      if (JSON.stringify(res.list) !== JSON.stringify(value)) merged[key as StoreKey] = res.list;
      conflicts.push(...res.conflicts);
      file[key] = res.list;
    } else {
      file[key] = value;
    }
  }
  const updatedAt = Date.now();
  localStorage.setItem(DEV_STORE_KEY, JSON.stringify({ ...file, updatedAt }));
  const out: SaveResult = { ok: true, updatedAt };
  if (Object.keys(merged).length) out.merged = merged;
  if (conflicts.length) out.conflicts = conflicts;
  return out;
}

// Callers treat a save failure as a rejected promise they can swallow. On the
// dev path localStorage.setItem throws *synchronously* (quota), which would
// escape past those .catch() handlers and out of the React event handler
// that started the save, so it has to be turned into a rejection.
function devSaveAsync(
  patch: Partial<Record<StoreKey, unknown>>,
  bases?: StoreBases,
): Promise<SaveResult> {
  try {
    return Promise.resolve(devSave(patch, bases));
  } catch (e) {
    return Promise.reject(e);
  }
}

/** Reads the file and says whether it is missing, fine, or present-but-unreadable. */
export async function loadStoreChecked(): Promise<LoadCheckedResult> {
  if (!isDesktop) return devLoadChecked();
  const res = await invoke<LoadCheckedResult>("load_store_checked");
  return { ...res, meta: res.meta ?? NO_META } as LoadCheckedResult;
}

// store-startup.ts registers this: a corrupt read or a write the Rust side
// refused with STORE_CORRUPT means the file went bad after the first read, so
// the gate must be told and the recovery screen raised.
let corruptHandler: (() => void) | null = null;
export function onStoreCorruptDetected(fn: () => void): void {
  corruptHandler = fn;
}

function isCorruptWriteError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return msg.startsWith("STORE_CORRUPT:");
}

/**
 * The data for pollers: only when the gate is "ready" and the file reads back
 * as ok. A missing file is an empty store; a corrupt one raises the recovery
 * screen and throws — callers already treat a throw as "try next tick".
 */
export async function loadStore(): Promise<StoreShape> {
  const gate = getStoreGate();
  if (gate !== "ready") throw new StoreBlockedError(gate);
  const res = await loadStoreChecked();
  if (res.status === "ok") return res.store;
  if (res.status === "missing") return {};
  corruptHandler?.();
  throw new StoreBlockedError("corrupt");
}

/**
 * An opaque token that changes whenever the data file does — the file's mtime.
 *
 * Poll this instead of loadStore(): it's one stat call with nothing read or
 * parsed, whereas the file also holds the in-app snapshots and is
 * not cheap to re-parse every few seconds in every window. Only fetch the
 * store itself once this has moved.
 */
export function storeStamp(): Promise<string> {
  if (!isDesktop) {
    const r = devLoadChecked();
    return Promise.resolve(String(r.status === "ok" ? (r.store.updatedAt ?? 0) : 0));
  }
  return invoke<string>("store_stamp");
}

async function writeKeys(
  patch: Partial<Record<StoreKey, unknown>>,
  bases?: StoreBases,
): Promise<SaveResult> {
  try {
    if (!isDesktop) return await devSaveAsync(patch, bases);
    return await invoke<SaveResult>("save_store_keys", bases ? { patch, bases } : { patch });
  } catch (e) {
    if (isCorruptWriteError(e)) corruptHandler?.();
    throw e;
  }
}

/**
 * Applies several keys in one atomic write.
 *
 * Use this — not repeated saveStoreKey() calls — whenever more than one key
 * changes together (restoring a backup that holds both seder and learning,
 * say). Two separate writes leave a real window where the file, and the poll
 * in the other EXE, can observe only one of them updated.
 *
 * Rejects with StoreBlockedError, without touching anything, while the store
 * has not been read successfully (still loading, or corrupt).
 *
 * `opts.bases` (optional) makes an array-of-records key a record-level merge
 * instead of a whole replace: per key, pass the array exactly as this window
 * last loaded or wrote it. The writer then applies only what changed against
 * that base (by `id`) onto what is in the file now, so another window's
 * concurrent add/edit/delete survives; a true conflict on one record is won
 * by the later writer, for that record only. When something of the other
 * window's was kept, `result.merged[key]` holds the array now in the file for
 * the caller to adopt. A record this window changed that the other window also
 * changed (or deleted, or edited while this window deleted it) is NOT
 * overwritten: the file's version stays, every other change is applied, and
 * the record comes back in `result.conflicts` — the promise still resolves,
 * but the write is not a full success and callers must not report it as one.
 * Keys without a base, and keys that are not id-record arrays, are replaced
 * exactly as without it.
 */
export function saveStoreKeys(
  patch: Partial<Record<StoreKey, unknown>>,
  opts?: { bases?: StoreBases },
): Promise<SaveResult> {
  try {
    assertStoreWritable();
  } catch (e) {
    return Promise.reject(e);
  }
  const bases = opts?.bases;
  return writeKeys(patch, bases && Object.keys(bases).length ? bases : undefined);
}

export function saveStoreKey(
  key: StoreKey,
  value: unknown,
  opts?: { bases?: StoreBases },
): Promise<SaveResult> {
  return saveStoreKeys({ [key]: value }, opts);
}

/**
 * The same write, for the startup legacy migration only — it runs while the
 * gate is still "loading" (the file has been read and found ok/missing, but
 * the app is not yet told it may write). Nothing else may call this.
 */
export function saveStoreKeysDuringStartup(
  patch: Partial<Record<StoreKey, unknown>>,
): Promise<SaveResult> {
  return writeKeys(patch);
}

// ---- Recovery commands: the only writes allowed while the gate is corrupt ----

/** What a data file holds — for the "what a restore would replace" preview. */
export type StoreSummary = {
  sederCount: number;
  learningCount: number;
  /** Earliest / latest `date` (YYYY-MM-DD) of the attendance / learning records. */
  attendanceFirst: string | null;
  attendanceLast: string | null;
  learningFirst: string | null;
  learningLast: string | null;
  hasSettings: boolean;
  hasOnboarded: boolean;
  onboarded: boolean;
  /** A timer session is running. */
  hasTimer: boolean;
  hasSnapshots: boolean;
  snapshotsCount: number;
  /** Names of top-level keys this version does not know. */
  unknownKeys: string[];
  updatedAt: number | null;
};

export type BackupPreview = {
  name: string;
  /** When the backup was taken (ms since the epoch). */
  ts: number;
  size: number;
  backup: StoreSummary;
  /** The current data file: read fine, absent, or damaged. */
  currentStatus: "ok" | "missing" | "unreadable";
  current: StoreSummary | null;
  currentError: string | null;
};

/** Read-only look at a backup next to the current file, before restoring it. */
export function previewBackup(name: string): Promise<BackupPreview> {
  if (!isDesktop) return Promise.reject(new Error("אין גיבויי קבצים בסביבת הפיתוח"));
  return invoke<BackupPreview>("preview_backup", { name });
}

/**
 * Restores the named backup over the unreadable file (the original is kept).
 * Resolves only after the new file was read back from disk and found identical
 * to the backup (Rust side); a mismatch rejects.
 */
export function recoverStore(name: string): Promise<SaveResult> {
  if (!isDesktop) return Promise.reject(new Error("אין גיבויי קבצים בסביבת הפיתוח"));
  return invoke<SaveResult>("recover_store", { name });
}

/** Starts a new empty file. The unreadable one has already been preserved. */
export function startEmptyStore(): Promise<SaveResult> {
  if (!isDesktop) {
    try {
      const updatedAt = Date.now();
      localStorage.setItem(DEV_STORE_KEY, JSON.stringify({ updatedAt }));
      return Promise.resolve({ ok: true, updatedAt });
    } catch (e) {
      return Promise.reject(e);
    }
  }
  return invoke<SaveResult>("start_empty_store");
}

/**
 * A full, separate copy of the current file — plus, as `legacy`, the raw text
 * of the old localStorage keys — made before anything is migrated.
 */
export async function createUpgradeCopy(
  label: string,
  legacy?: Record<string, string>,
): Promise<{ files: string[] }> {
  if (!isDesktop) {
    const key = DEV_COPY_PREFIX + label + "." + Date.now();
    let current: string | null = null;
    try {
      current = localStorage.getItem(DEV_STORE_KEY);
    } catch {
      // The write below decides whether the copy could be made.
    }
    localStorage.setItem(key, JSON.stringify({ store: current, legacy: legacy ?? {} }));
    return { files: [key] };
  }
  return invoke<{ files: string[] }>("create_upgrade_copy", { label, legacy });
}

export async function openDataFolder(): Promise<void> {
  if (!isDesktop) return;
  await invoke<void>("open_data_folder");
}
