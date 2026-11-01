import { useEffect, useState } from "react";

import {
  loadStore,
  saveStoreKey,
  storeStamp,
  type SaveResult,
  type StoreKey,
  type StoreShape,
} from "./store-bridge";
import { applyMineToList, type RecordConflict } from "./record-merge";
import {
  outcomeOf,
  registerConflictResolver,
  reportConflicts,
  type SaveOutcome,
} from "./save-conflicts";
import { getStoreGate, isStoreWritable, reportWriteFailure, StoreBlockedError } from "./store-gate";
import { onStoreReady } from "./store-startup";

// Everything that both EXEs must agree on lives in the one shared data file,
// not in localStorage.
//
// SederPlus.exe and SederPlusQuick.exe each get their own WebView2 profile,
// which means their own localStorage. Anything kept there would silently
// diverge between them — and settings in particular drive the attendance
// maths (getSederTimesFor feeds calcSeder), so the quick window would score
// arrivals against different seder hours than the full app.
//
// This module gives those stores the same treatment kollel-store already
// gives the entries: a synchronous in-memory value for the UI, hydrated from
// the file on startup, refreshed by a poll so the *other* EXE's writes show
// up, and written back fire-and-forget on every change.

/** Mirrors of the shared values, kept only to make the first paint correct. */
const MIRROR_PREFIX = "sedorim.mirror.";
const POLL_MS = 4000;

type Slot = {
  key: StoreKey;
  legacyKey?: string;
  /** Serialized form of whatever we last read/wrote, to skip no-op emits. */
  encoded: string | null;
  /** The array-of-records the file held when we last adopted or wrote it: the
   *  base for a record-level merge on the next save. Unset for anything else. */
  base?: unknown[];
  apply: (raw: unknown) => void;
  emit: () => void;
};

const slots: Slot[] = [];
let lastSeenStamp = "";
let hydrated = false;
const hydrationListeners = new Set<() => void>();

/**
 * False until the shared file has been read successfully (the gate is ready
 * and every value has been adopted from it). A corrupt or unreadable file
 * leaves this false — the defaults seeded for the first paint are then never
 * mistaken for the user's real values.
 *
 * Anything that would look wrong if it acted on a pre-hydration value —
 * showing the onboarding wizard to someone who already finished it, say —
 * should wait for this.
 */
export function isHydrated(): boolean {
  return hydrated;
}

export function useHydrated(): boolean {
  const [value, setValue] = useState(hydrated);
  useEffect(() => {
    if (hydrated) {
      setValue(true);
      return;
    }
    const fn = () => setValue(true);
    hydrationListeners.add(fn);
    return () => {
      hydrationListeners.delete(fn);
    };
  }, []);
  return value;
}

function readMirror(key: StoreKey): unknown {
  try {
    const raw = localStorage.getItem(MIRROR_PREFIX + key);
    return raw === null ? undefined : JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function writeMirror(key: StoreKey, value: unknown): void {
  try {
    localStorage.setItem(MIRROR_PREFIX + key, JSON.stringify(value));
  } catch {
    // Quota or private mode — the shared file is the real store, so losing
    // the mirror only costs a slightly slower first paint next launch.
  }
}

function readLegacy(legacyKey: string): unknown {
  try {
    const raw = localStorage.getItem(legacyKey);
    if (raw === null) return undefined;
    // The onboarding flag was stored as the bare string "1", not as JSON.
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  } catch {
    return undefined;
  }
}

export type SharedValue<T> = {
  get(): T;
  set(next: T): void;
  /**
   * Like set(), but resolves only once the shared file has the new value, and
   * on a failed write puts the previous value back (if nothing changed it
   * meanwhile) and rejects — for callers that must not say "saved" falsely.
   * Resolves with `complete: false` when an array-of-records value hit an
   * edit conflict with another window (the file's version was kept and the
   * user is asked what to do — see save-conflicts.ts).
   */
  setChecked(next: T): Promise<SaveOutcome>;
  /** Re-renders the calling component whenever this value changes. */
  use(): T;
};

/**
 * Declares one key of the shared data file as a synchronously readable value.
 *
 * `parse` runs on everything coming off disk, so it must cope with data
 * written by an older version of the app (or with junk) and fall back rather
 * than throw.
 */
export function sharedValue<T>(options: {
  key: StoreKey;
  fallback: T;
  parse: (raw: unknown) => T;
  /**
   * A pre-1.1 localStorage key. Used only to seed the shared file the first
   * time, when the file has no value for this key yet.
   */
  legacyKey?: string;
  /** Runs whenever the value changes, including on hydration. */
  onChange?: (value: T) => void;
}): SharedValue<T> {
  const { key, fallback, parse, legacyKey, onChange } = options;
  const listeners = new Set<() => void>();

  // Seed synchronously so the very first render is right: this window's
  // mirror if it has one, then the pre-1.1 localStorage key, then the
  // fallback. Hydration replaces all of that a few milliseconds later.
  const seed = readMirror(key) ?? (legacyKey ? readLegacy(legacyKey) : undefined);
  let value: T = seed === undefined ? fallback : parse(seed);

  const slot: Slot = {
    key,
    legacyKey,
    encoded: null,
    emit: () => listeners.forEach((fn) => fn()),
    // Compares the *parsed* value, not the raw JSON: the file round-trips
    // through serde_json, which sorts object keys, so raw text differs from
    // what we wrote even when nothing actually changed.
    apply: (raw) => {
      slot.base = Array.isArray(raw) ? raw : undefined;
      const parsed = parse(raw);
      const encoded = safeEncode(parsed);
      if (encoded !== null && encoded === slot.encoded) return;
      slot.encoded = encoded;
      value = parsed;
      writeMirror(key, value);
      onChange?.(value);
      slot.emit();
    },
  };
  slots.push(slot);
  if (hydrated) {
    // Registered after the first read already happened — only possible from a
    // lazily loaded module, but it would otherwise never see the file's value
    // (nor get its legacy key migrated), so catch it up on its own.
    void loadStore()
      .then((store) => hydrateSlot(slot, store))
      .catch(() => {});
  }
  startSync();

  // Array-of-records values are saved as a record-level merge against what we
  // last loaded/wrote (so the other window's concurrent change survives);
  // anything else is replaced whole.
  const writeOpts = () => (slot.base ? { bases: { [key]: slot.base } } : undefined);
  const afterWrite = (res: SaveResult, sent: T): SaveOutcome => {
    slot.base = Array.isArray(sent) ? sent : undefined;
    const merged = res.merged?.[key];
    // Adopt what the file really holds now, unless a newer set() came meanwhile.
    if (merged !== undefined && value === sent) slot.apply(merged);
    // A record the file kept its own version of: park this window's version
    // for the user to resolve instead of overwriting.
    const conflicts: RecordConflict[] = res.conflicts ?? [];
    reportConflicts(conflicts);
    return outcomeOf(conflicts);
  };

  // "החלף": my version of one conflicting record, written over the file's,
  // starting from the file as it is now (see save-conflicts.ts).
  registerConflictResolver(key, async (conflict) => {
    const store = await loadStore();
    const fileList = (store as Record<string, unknown>)[key];
    if (!Array.isArray(fileList)) throw new Error("הקובץ אינו מכיל את הרשימה הזאת");
    const next = parse(applyMineToList(fileList as { id: string | number }[], conflict));
    const prev = value;
    value = next;
    slot.encoded = safeEncode(next);
    writeMirror(key, next);
    onChange?.(next);
    slot.emit();
    try {
      afterWrite(await saveStoreKey(key, next, { bases: { [key]: fileList } }), next);
    } catch (err) {
      if (value === next) {
        value = prev;
        slot.encoded = safeEncode(prev);
        writeMirror(key, prev);
        onChange?.(prev);
        slot.emit();
      }
      throw err;
    }
  });

  return {
    get: () => value,
    set: (next) => {
      // Refused up front while the file may not be written: nothing changes in
      // memory (an unsaved value must not look saved) and the refusal is shown.
      if (!isStoreWritable()) {
        reportWriteFailure(new StoreBlockedError(getStoreGate()));
        return;
      }
      const prev = value;
      value = next;
      slot.encoded = safeEncode(next);
      writeMirror(key, next);
      onChange?.(next);
      slot.emit();
      // Fire-and-forget, like kollel-store's writes — but a failure is not
      // swallowed: the previous value comes back (unless something newer
      // replaced it meanwhile) and the failure is reported to the UI.
      saveStoreKey(key, next, writeOpts())
        .then((res) => afterWrite(res, next))
        .catch((err) => {
          if (value === next) {
            value = prev;
            slot.encoded = safeEncode(prev);
            writeMirror(key, prev);
            onChange?.(prev);
            slot.emit();
          }
          reportWriteFailure(err);
        });
    },
    setChecked: (next): Promise<SaveOutcome> => {
      const prev = value;
      value = next;
      slot.encoded = safeEncode(next);
      writeMirror(key, next);
      onChange?.(next);
      slot.emit();
      return saveStoreKey(key, next, writeOpts()).then(
        (res) => afterWrite(res, next),
        (err) => {
          if (value === next) {
            value = prev;
            slot.encoded = safeEncode(prev);
            writeMirror(key, prev);
            onChange?.(prev);
            slot.emit();
          }
          throw err;
        },
      );
    },
    use: () => {
      const [, force] = useState(0);
      useEffect(() => {
        const fn = () => force((n) => n + 1);
        listeners.add(fn);
        return () => {
          listeners.delete(fn);
        };
      }, []);
      return value;
    },
  };
}

function safeEncode(value: unknown): string | null {
  try {
    return JSON.stringify(value) ?? null;
  } catch {
    return null;
  }
}

/** The first read for one slot: adopt the file's value, or migrate a legacy key. */
function hydrateSlot(slot: Slot, store: StoreShape): void {
  const raw = (store as Record<string, unknown>)[slot.key];

  if (raw === undefined) {
    // Nothing in the file yet. Adopt whatever the pre-1.1 localStorage key
    // holds and write it through, so an upgrade from a build that kept this
    // in localStorage carries over.
    if (!slot.legacyKey) return;
    const legacy = readLegacy(slot.legacyKey);
    if (legacy === undefined) return;
    slot.apply(legacy);
    // Not in the file yet, so not a base to merge against.
    slot.base = undefined;
    saveStoreKey(slot.key, legacy).catch(() => {});
    return;
  }

  slot.apply(raw);
}

function applyStore(store: StoreShape, initial: boolean): void {
  for (const slot of slots) {
    if (initial) {
      hydrateSlot(slot, store);
      continue;
    }
    // apply() is a no-op when the value hasn't really changed.
    const raw = (store as Record<string, unknown>)[slot.key];
    if (raw !== undefined) slot.apply(raw);
  }
}

let syncStarted = false;

function startSync(): void {
  if (syncStarted || typeof window === "undefined") return;
  syncStarted = true;

  // One gate for everything: nothing is adopted (or seeded from legacy keys,
  // or written) until the file has been read successfully. On a corrupt file
  // this never fires until the recovery screen resolves it, and a retry
  // hydrates exactly like the first load.
  onStoreReady((store, stamp) => {
    lastSeenStamp = stamp;
    applyStore(store, true);
    hydrated = true;
    hydrationListeners.forEach((fn) => fn());
  });

  // Cross-window sync: one poll covering every shared value, gated on the
  // file's mtime so an idle app never reads or parses anything.
  setInterval(async () => {
    // Not read yet, or unreadable: nothing to carry over, and the stamp must
    // not be marked as seen for a file that was never actually read.
    if (getStoreGate() !== "ready") return;
    try {
      const stamp = await storeStamp();
      if (stamp === lastSeenStamp) return;
      const store = await loadStore();
      lastSeenStamp = stamp;
      applyStore(store, false);
    } catch {
      // Transient read failure — try again next tick.
    }
  }, POLL_MS);
}

/**
 * Adopts values that were just written to the file by someone else (a restore
 * from a full copy): every registered shared value whose key is in `patch`
 * takes the stored value, exactly as if the poll had read it. Keys with no
 * registered value are simply left in the file.
 */
export function adoptStoredKeys(patch: Record<string, unknown>): void {
  for (const slot of slots) {
    const raw = patch[slot.key];
    if (raw !== undefined) slot.apply(raw);
  }
}
