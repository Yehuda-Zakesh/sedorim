import { runLegacyMigration } from "./legacy-migration";
import { logProblem } from "./diagnostics";
import {
  loadStoreChecked,
  onStoreCorruptDetected,
  saveStoreKeysDuringStartup,
  storeStamp,
  type LoadCheckedResult,
  type StoreShape,
} from "./store-bridge";
import { setStoreGate, type CorruptStoreInfo } from "./store-gate";

// The single first read of the data file. kollel-store and shared-state both
// wait on THIS — not on two loads of their own with their own ideas of what
// "loaded" means — and neither hydrates until the gate is "ready":
//
//   read the file (loadStoreChecked)
//     corrupt  -> gate "corrupt" (recovery screen; nothing is written)
//     missing  -> a real fresh install
//     ok       -> normal
//   then run the legacy migration (the only writer while the gate is still
//   "loading"), re-read, and only then open the gate.

type ReadyListener = (store: StoreShape, stamp: string) => void;

let inFlight: Promise<StoreShape | null> | null = null;
let readyStore: StoreShape | null = null;
let readyStamp = "";
let upgradeMeta: { upgradedFrom: string | null; upgradeCopy: string | null } | null = null;

/** Set when this launch is the first of a new version and a raw copy of the data was made. */
export function getUpgradeMeta() {
  return upgradeMeta?.upgradeCopy ? upgradeMeta : null;
}
const readyListeners = new Set<ReadyListener>();

function corruptInfoOf(res: Extract<LoadCheckedResult, { status: "corrupt" }>): CorruptStoreInfo {
  return {
    reason: res.reason,
    message: res.message,
    preservedAs: res.preservedAs,
    backups: res.backups ?? [],
  };
}

async function run(): Promise<StoreShape | null> {
  // Taken BEFORE the read, so a write landing in between is seen by the first poll.
  const stamp = await storeStamp().catch(() => "");
  let res: LoadCheckedResult;
  try {
    res = await loadStoreChecked();
  } catch (e) {
    // The read itself failed (not "file missing"): never treat as empty.
    logProblem("טעינת קובץ הנתונים", e);
    readyStore = null;
    setStoreGate("corrupt", {
      reason: "unreadable",
      message: e instanceof Error ? e.message : String(e),
      preservedAs: null,
      backups: [],
    });
    return null;
  }
  if (res.status === "corrupt") {
    readyStore = null;
    setStoreGate("corrupt", corruptInfoOf(res));
    return null;
  }
  upgradeMeta = res.meta ?? null;
  let store: StoreShape = res.status === "ok" ? res.store : {};

  // Failures are logged and shown by the migration itself; they must not stop
  // the app from opening on the data that IS there.
  const migrated = await runLegacyMigration(saveStoreKeysDuringStartup);
  const touched =
    migrated.status === "failed" || (migrated.status !== "skipped" && migrated.wrote.length > 0);
  if (touched) {
    // Re-read so what the app hydrates from is what is really in the file.
    const again = await loadStoreChecked().catch(() => null);
    if (again?.status === "corrupt") {
      readyStore = null;
      setStoreGate("corrupt", corruptInfoOf(again));
      return null;
    }
    if (again?.status === "ok") store = again.store;
  }
  readyStore = store;
  readyStamp = stamp;
  setStoreGate("ready");
  readyListeners.forEach((fn) => fn(store, stamp));
  return store;
}

/** Starts the first read once; later callers share the same promise. */
export function ensureStoreReady(): Promise<StoreShape | null> {
  if (!inFlight) inFlight = run();
  return inFlight;
}

/**
 * Reads the file again from the recovery screen (or after a recovery action).
 * Resolves true once the gate is "ready".
 */
export async function retryStoreLoad(): Promise<boolean> {
  inFlight = run();
  return (await inFlight) !== null;
}

/**
 * Calls `fn` with the store each time the gate becomes ready — now, if it
 * already is — so a retry after a recovery hydrates exactly like the first
 * load did.
 */
export function onStoreReady(fn: ReadyListener): () => void {
  readyListeners.add(fn);
  if (readyStore) {
    const store = readyStore;
    const stamp = readyStamp;
    queueMicrotask(() => {
      if (readyListeners.has(fn)) fn(store, stamp);
    });
  }
  void ensureStoreReady();
  return () => {
    readyListeners.delete(fn);
  };
}

// A corrupt read or a refused write after startup: re-read for the details and
// raise the recovery screen. The gate closes at once so nothing else writes.
onStoreCorruptDetected(() => {
  readyStore = null;
  setStoreGate("corrupt", {
    reason: "unreadable",
    message: "הקובץ השתנה והפך ללא קריא",
    preservedAs: null,
    backups: [],
  });
  void loadStoreChecked()
    .then((res) => {
      if (res.status === "corrupt") setStoreGate("corrupt", corruptInfoOf(res));
    })
    .catch(() => {});
});
