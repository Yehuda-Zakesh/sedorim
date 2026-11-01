import { useSyncExternalStore } from "react";

import type { RecordConflict } from "./record-merge";

// Edit conflicts between two windows. When the data file holds a different
// version of a record than the one a window started from, the writer does not
// overwrite it (see merge_records in store.rs): the file's version stays, the
// window adopts it, and the user's own pending version is parked here until
// they choose:
//   "רענן"  (refresh) — drop my edit, keep what the file has;
//   "החלף"  (replace) — write my edit over it, explicitly, against the file's
//                       current version (so it cannot conflict again unless a
//                       third change lands in between).
// There is no automatic field-by-field merge.

export type PendingConflict = RecordConflict & {
  /** key + id: one pending entry per record. */
  uid: string;
  /** When it was detected (ms). */
  at: number;
};

/** What a checked save reports: `complete` is false when any record conflicted. */
export type SaveOutcome = { complete: boolean; conflicts: RecordConflict[] };

export const COMPLETE_SAVE: SaveOutcome = { complete: true, conflicts: [] };

export function outcomeOf(conflicts: RecordConflict[] | undefined): SaveOutcome {
  const list = conflicts ?? [];
  return list.length ? { complete: false, conflicts: list } : COMPLETE_SAVE;
}

/** Writes this window's version of one conflicting record over the file's. */
type Resolver = (conflict: RecordConflict) => Promise<void>;

let pending: PendingConflict[] = [];
let version = 0;
const listeners = new Set<() => void>();
const resolvers = new Map<string, Resolver>();

function changed(next: PendingConflict[]): void {
  pending = next;
  version++;
  listeners.forEach((fn) => fn());
}

const uidOf = (c: Pick<RecordConflict, "key" | "id">) => `${c.key}:${JSON.stringify(c.id)}`;

/** Registered by whoever owns the in-memory copy of `key` (kollel-store, shared-state). */
export function registerConflictResolver(key: string, fn: Resolver): void {
  resolvers.set(key, fn);
}

/** Parks conflicts for the user to resolve; a newer one for the same record replaces the older. */
export function reportConflicts(conflicts: RecordConflict[]): void {
  if (!conflicts.length) return;
  const incoming = new Map<string, PendingConflict>();
  for (const c of conflicts) incoming.set(uidOf(c), { ...c, uid: uidOf(c), at: Date.now() });
  const kept = pending.filter((p) => !incoming.has(p.uid));
  changed([...kept, ...incoming.values()]);
}

export function getPendingConflicts(): readonly PendingConflict[] {
  return pending;
}

export function usePendingConflicts(): readonly PendingConflict[] {
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
  return pending;
}

/** "רענן": throw this window's edit away. The window already shows the file's version. */
export function refreshConflict(uid: string): void {
  if (pending.some((p) => p.uid === uid)) changed(pending.filter((p) => p.uid !== uid));
}

/**
 * "החלף": write this window's version over the file's. Resolves once the file
 * has it; rejects (the conflict stays pending) when the write failed or hit a
 * newer conflict.
 */
export async function replaceConflict(uid: string): Promise<void> {
  const c = pending.find((p) => p.uid === uid);
  if (!c) return;
  const resolver = resolvers.get(c.key);
  if (!resolver) throw new Error("אי אפשר להחליף: הרשומה אינה נטענת בחלון הזה");
  await resolver(c);
  // A resolver that hit a fresh conflict re-reported it (a new entry replaced
  // this one) — only an untouched entry means the overwrite really landed.
  if (pending.find((p) => p.uid === uid) === c) changed(pending.filter((p) => p.uid !== uid));
}

/** Test seam. */
export function resetConflicts(): void {
  resolvers.clear();
  changed([]);
}

const KEY_LABEL: Record<string, string> = {
  seder: "רישום הנוכחות",
  learning: "רישום הלימוד",
  snapshots: "הגיבוי הפנימי",
};

function dateOf(c: RecordConflict): string | null {
  for (const side of [c.mine, c.theirs]) {
    const d = side && typeof side === "object" ? (side as { date?: unknown }).date : undefined;
    if (typeof d === "string" && d) return d;
  }
  return null;
}

/** One plain-Hebrew sentence saying what happened and what is pending. */
export function conflictMessage(c: RecordConflict): string {
  const label = KEY_LABEL[c.key] ?? "הרשומה";
  const date = dateOf(c);
  const what = date ? `${label} מ-${date}` : label;
  switch (c.kind) {
    case "edit-edit":
      return `${what} נערך גם בחלון אחר. נשמרה הגרסה שבקובץ, והעריכה שלך עדיין ממתינה.`;
    case "edit-deleted":
      return `${what} שערכת נמחק בינתיים בחלון אחר. הוא נשאר מחוק, והעריכה שלך עדיין ממתינה.`;
    case "deleted-edited":
      return `${what} שמחקת נערך בינתיים בחלון אחר. נשמרה הגרסה שבקובץ, והמחיקה שלך עדיין ממתינה.`;
    case "add-add":
      return `${what} נוסף גם בחלון אחר, בתוכן שונה. נשמרה הגרסה שבקובץ, והגרסה שלך עדיין ממתינה.`;
  }
}

/** Shown where a save finished without being applied in full. */
export const CONFLICT_SAVE_TEXT =
  "הרשומה נערכה גם בחלון אחר, ולכן השינוי שלך עוד לא נשמר. בחר בהודעה שבראש המסך: רענן או החלף.";
