import { invoke, isDesktop } from "./tauri";

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
  | "audit"
  | "snapshots"
  | "lastAutoBackupAt"
  // Which reminders have already been raised, so two open EXEs don't both
  // toast the same one — see notifications.ts.
  | "notificationsSent";

export type StoreShape = Partial<Record<StoreKey, unknown>> & {
  updatedAt?: number;
};

export type SaveResult = { ok: true; updatedAt: number };

// Browser fallback for `npm run dev`, where there is no Rust side. Single
// key, same shape as the file, so the app behaves identically.
const DEV_STORE_KEY = "sedorim.devStore.v1";

function devLoad(): StoreShape {
  try {
    const raw = localStorage.getItem(DEV_STORE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" ? (parsed as StoreShape) : {};
  } catch {
    return {};
  }
}

function devSave(patch: Partial<Record<StoreKey, unknown>>): SaveResult {
  const updatedAt = Date.now();
  localStorage.setItem(DEV_STORE_KEY, JSON.stringify({ ...devLoad(), ...patch, updatedAt }));
  return { ok: true, updatedAt };
}

// Callers treat a save failure as a rejected promise they can swallow. On the
// dev path localStorage.setItem throws *synchronously* (quota), which would
// escape past those .catch() handlers and out of the React event handler
// that started the save, so it has to be turned into a rejection.
function devSaveAsync(patch: Partial<Record<StoreKey, unknown>>): Promise<SaveResult> {
  try {
    return Promise.resolve(devSave(patch));
  } catch (e) {
    return Promise.reject(e);
  }
}

export function loadStore(): Promise<StoreShape> {
  if (!isDesktop) return Promise.resolve(devLoad());
  return invoke<StoreShape>("load_store");
}

/**
 * An opaque token that changes whenever the data file does — the file's mtime.
 *
 * Poll this instead of loadStore(): it's one stat call with nothing read or
 * parsed, whereas the file holds the audit log and the in-app snapshots and is
 * not cheap to re-parse every few seconds in every window. Only fetch the
 * store itself once this has moved.
 */
export function storeStamp(): Promise<string> {
  if (!isDesktop) return Promise.resolve(String(devLoad().updatedAt ?? 0));
  return invoke<string>("store_stamp");
}

/**
 * Applies several keys in one atomic write.
 *
 * Use this — not repeated saveStoreKey() calls — whenever more than one key
 * changes together (restoring a backup that holds both seder and learning,
 * say). Two separate writes leave a real window where the file, and the poll
 * in the other EXE, can observe only one of them updated.
 */
export function saveStoreKeys(patch: Partial<Record<StoreKey, unknown>>): Promise<SaveResult> {
  if (!isDesktop) return devSaveAsync(patch);
  return invoke<SaveResult>("save_store_keys", { patch });
}

export function saveStoreKey(key: StoreKey, value: unknown): Promise<SaveResult> {
  return saveStoreKeys({ [key]: value });
}
