// The destructive backup-screen operations — delete everything, import a file,
// restore a snapshot, take a snapshot — each with the same contract:
//   1. the safety copy and the change reach storage in ONE atomic write (both
//      or neither), so a failed write leaves the data exactly as it was;
//   2. success is reported only after the file has been read back and matches
//      (ids and content, not just counts).
// Nothing here says "done" on its own: it resolves with what was verified, or
// throws a BackupActionError whose message is safe to show.
import {
  clearAllData,
  getLearningSnapshot,
  getSederSnapshot,
  replaceAllDataChecked,
  type LearningEntry,
  type SederEntry,
} from "./kollel-store";
import { createSnapshotChecked, type BackupSnapshot } from "./auto-backup";
import { PersistVerifyError, verifyPersisted } from "./backup-verify";
import { adoptStoredKeys } from "./shared-state";

export class BackupActionError extends Error {
  /** "write": nothing changed. "verify": the write ran but could not be confirmed. */
  readonly stage: "write" | "verify";
  constructor(stage: "write" | "verify", msg: string) {
    super(msg);
    this.name = "BackupActionError";
    this.stage = stage;
  }
}

function writeFailure(err: unknown): BackupActionError {
  const name = err instanceof Error ? err.name : "";
  if (name === "StoreBlockedError")
    return new BackupActionError(
      "write",
      "קובץ הנתונים חסום לכתיבה כרגע (ייתכן שהוא פגום), ולכן לא נשמר דבר. הנתונים נשארו כפי שהיו.",
    );
  if (name === "ValidationError")
    return new BackupActionError("write", `${(err as Error).message}. הנתונים נשארו כפי שהיו.`);
  const detail = err instanceof Error && err.message ? ` (${err.message})` : "";
  return new BackupActionError(
    "write",
    `השמירה לקובץ הנתונים נכשלה${detail}, ולכן לא בוצעה פעולה והנתונים נשארו כפי שהיו.`,
  );
}

async function confirmStored(expected: Parameters<typeof verifyPersisted>[0]) {
  try {
    await verifyPersisted(expected);
  } catch (e) {
    const detail = e instanceof PersistVerifyError ? ` (${e.message})` : "";
    throw new BackupActionError(
      "verify",
      `הפעולה נשמרה אך הקריאה החוזרת מהקובץ לא תאמה את הצפוי${detail}. אל תסתמך על המצב הנוכחי: סגור ופתח את התוכנה ובדוק את הנתונים.`,
    );
  }
}

export type ReplaceOutcome = {
  /** The full safety copy of what was there before; null when there was nothing. */
  snapshot: BackupSnapshot | null;
  accepted: { seder: number; learning: number };
  /** The extra keys (settings, ...) that were restored from a full copy; empty for a records restore. */
  restoredKeys: string[];
};

/**
 * Replaces everything with the given (already analysed, valid) records, with
 * one safety snapshot of the current data written in the same atomic save.
 */
export async function replaceEverything(
  seder: SederEntry[],
  learning: LearningEntry[],
  opts: {
    /**
     * Other keys of a FULL copy (settings, onboarded, unknown keys), written in
     * the same atomic save — only when the person asked for them. Without it a
     * restore touches the records and nothing else: settings and onboarding
     * stay exactly as they are, whatever the backup lacks.
     */
    extra?: Record<string, unknown>;
  } = {},
): Promise<ReplaceOutcome> {
  const extra = opts.extra && Object.keys(opts.extra).length ? opts.extra : undefined;
  let snapshot: BackupSnapshot | null;
  try {
    ({ snapshot } = await replaceAllDataChecked(seder, learning, { extra }));
  } catch (e) {
    throw writeFailure(e);
  }
  await confirmStored({ seder, learning, snapshot, extra });
  // Only now, with the file confirmed, do the in-memory values follow it.
  if (extra) adoptStoredKeys(extra);
  return {
    snapshot,
    accepted: { seder: seder.length, learning: learning.length },
    restoredKeys: extra ? Object.keys(extra) : [],
  };
}

/** Deletes everything; the safety snapshot is written in the same save. */
export async function deleteEverything(): Promise<{ snapshot: BackupSnapshot | null }> {
  let snapshot: BackupSnapshot | null;
  try {
    ({ snapshot } = await clearAllData());
  } catch (e) {
    throw writeFailure(e);
  }
  await confirmStored({ seder: [], learning: [], snapshot });
  return { snapshot };
}

/** A manual snapshot, confirmed in the file. Resolves null when there is no data. */
export async function takeSnapshot(): Promise<BackupSnapshot | null> {
  let snap: BackupSnapshot | null;
  try {
    snap = await createSnapshotChecked(
      { attendance: getSederSnapshot(), learning: getLearningSnapshot() },
      "manual",
    );
  } catch (e) {
    throw writeFailure(e);
  }
  if (snap) await confirmStored({ snapshot: snap });
  return snap;
}
