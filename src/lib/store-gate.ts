import { useSyncExternalStore } from "react";

// The one switch that says whether the shared data file may be trusted.
//
//   loading  — the first read (and the legacy migration) has not finished.
//   ready    — the file was read ("ok") or genuinely does not exist ("missing",
//              a real fresh install). Reads and writes are allowed.
//   corrupt  — the file exists but could not be read. NOTHING is written (a
//              write would be built on an empty store and replace the user's
//              data) until the recovery screen resolves it.
//
// Every other module goes through this state: store-bridge refuses writes
// unless it is "ready", kollel-store and shared-state hydrate only when it
// turns "ready", and the onboarding wizard waits for it — so a failed load can
// never show up as "empty defaults" that then get saved.

export type StoreGateState = "loading" | "ready" | "corrupt";

export type StoreBackupInfo = {
  name: string;
  ts: number;
  size: number;
  valid: boolean;
  counts: { seder: number; learning: number };
};

export type CorruptStoreInfo = {
  reason: "unparseable" | "not-an-object" | "unreadable" | "missing";
  message: string;
  /** Where the untouched original bytes were kept, when they could be. */
  preservedAs: string | null;
  backups: StoreBackupInfo[];
};

/** Thrown by every write attempted while the gate is not "ready". */
export class StoreBlockedError extends Error {
  constructor(public readonly state: StoreGateState) {
    super(
      state === "corrupt"
        ? "STORE_BLOCKED: קובץ הנתונים לא נקרא, ולכן שום דבר לא נשמר"
        : "STORE_BLOCKED: הנתונים עדיין נטענים, ולכן שום דבר לא נשמר",
    );
    this.name = "StoreBlockedError";
  }
}

let state: StoreGateState = "loading";
let corrupt: CorruptStoreInfo | null = null;
let version = 0;
const listeners = new Set<() => void>();

export function getStoreGate(): StoreGateState {
  return state;
}

export function getCorruptInfo(): CorruptStoreInfo | null {
  return corrupt;
}

export function setStoreGate(next: StoreGateState, info: CorruptStoreInfo | null = null): void {
  const nextInfo = next === "corrupt" ? info : null;
  if (state === next && corrupt === nextInfo) return;
  state = next;
  corrupt = nextInfo;
  version++;
  listeners.forEach((fn) => fn());
}

export function subscribeStoreGate(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Throws StoreBlockedError unless the file may be written to. */
export function assertStoreWritable(): void {
  if (state !== "ready") throw new StoreBlockedError(state);
}

export function useStoreGate(): { state: StoreGateState; corrupt: CorruptStoreInfo | null } {
  useSyncExternalStore(
    subscribeStoreGate,
    () => version,
    () => version,
  );
  return { state, corrupt };
}

/** True while the data file may be written to. Automatic actions (backups,
 *  reminders, plan refresh, auto-stop) check this and do nothing otherwise. */
export function isStoreWritable(): boolean {
  return state === "ready";
}

// A write that nobody awaits (the fire-and-forget saves) still must not fail
// silently: it is reported here, and the UI shows it as a real error.
const failureListeners = new Set<(err: unknown) => void>();

export function onWriteFailure(fn: (err: unknown) => void): () => void {
  failureListeners.add(fn);
  return () => {
    failureListeners.delete(fn);
  };
}

export function reportWriteFailure(err: unknown): void {
  failureListeners.forEach((fn) => fn(err));
}

/** The user-facing message for a failed write. */
export function writeFailureMessage(err: unknown): string {
  if (err instanceof StoreBlockedError) return err.message.replace(/^STORE_BLOCKED:\s*/, "");
  return `השמירה נכשלה: ${err instanceof Error ? err.message : String(err)}`;
}
