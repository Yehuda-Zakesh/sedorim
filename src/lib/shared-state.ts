import { useEffect, useState } from "react";

import {
  loadStore,
  saveStoreKey,
  storeStamp,
  type StoreKey,
  type StoreShape,
} from "./store-bridge";

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
  apply: (raw: unknown) => void;
  emit: () => void;
};

const slots: Slot[] = [];
let lastSeenStamp = "";
let hydrated = false;
const hydrationListeners = new Set<() => void>();

/**
 * False until the shared file has been read once.
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

  return {
    get: () => value,
    set: (next) => {
      value = next;
      slot.encoded = safeEncode(next);
      writeMirror(key, next);
      onChange?.(next);
      slot.emit();
      // Fire-and-forget, exactly like kollel-store's writes: a failure here
      // is reconciled by the next poll rather than surfaced to the user
      // mid-interaction.
      saveStoreKey(key, next).catch(() => {});
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

  void Promise.all([storeStamp(), loadStore()])
    .then(([stamp, store]) => {
      lastSeenStamp = stamp;
      applyStore(store, true);
    })
    .catch(() => {
      // File unreadable right now — keep the seeded values; the poll retries.
    })
    .finally(() => {
      hydrated = true;
      hydrationListeners.forEach((fn) => fn());
      hydrationListeners.clear();
    });

  // Cross-window sync: one poll covering every shared value, gated on the
  // file's mtime so an idle app never reads or parses anything.
  setInterval(async () => {
    try {
      const stamp = await storeStamp();
      if (stamp === lastSeenStamp) return;
      lastSeenStamp = stamp;
      applyStore(await loadStore(), false);
    } catch {
      // Transient read failure — try again next tick.
    }
  }, POLL_MS);
}
