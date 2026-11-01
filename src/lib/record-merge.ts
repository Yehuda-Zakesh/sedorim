// Record-level three-way merge by `id` — the TypeScript twin of
// `merge_records` in src-tauri/shared/src/store.rs. The desktop build merges
// in Rust; this copy serves the browser/dev fallback in store-bridge.ts so
// both transports behave the same (and so the behaviour is testable here).
//
// base    = the array as this window last loaded or wrote it
// next    = the array this window now wants
// current = the array in the shared file right now
//
// Removed (in base, not in next) -> removed, unless the file edited it since
// base. Added (in next, not in base) -> added; a same-id record in the file with other
// content is an add-add conflict (file's kept), an identical one is a no-op.
// Modified (differs from base) -> replaces the file's record while the file
// still has the base version (or the very same edit). When the file has a
// different version, or no longer has the record, the FILE wins and the record
// is reported as a conflict — nothing is merged field by field, nothing is
// overwritten. Untouched records keep the file's version, and records another
// window added meanwhile are kept. Every other change applies regardless.
// Returns null when any input is not a clean list of id records (unique string
// or number ids) — the caller then replaces the key as before.

type Rec = Record<string, unknown>;

export type RecordConflictKind =
  /** Both sides edited the record differently. */
  | "edit-edit"
  /** This window edited a record the file no longer has. */
  | "edit-deleted"
  /** This window deleted a record the file has since edited. */
  | "deleted-edited"
  /** This window added a record whose id the file already has, with other content. */
  | "add-add";

/** Same shape as `RecordConflict` in store.rs (what Rust returns). */
export type RecordConflict = {
  /** The top-level key of the data file: "seder", "learning"... */
  key: string;
  id: string | number;
  kind: RecordConflictKind;
  /** This window's version; null = this window deleted it. */
  mine: unknown | null;
  /** The file's version, which was kept; null = deleted in the file. */
  theirs: unknown | null;
};

function indexById(v: unknown): { keys: string[]; items: Rec[] } | null {
  if (!Array.isArray(v)) return null;
  const seen = new Set<string>();
  const keys: string[] = [];
  const items: Rec[] = [];
  for (const item of v) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const id = (item as Rec).id;
    if (typeof id !== "string" && typeof id !== "number") return null;
    const key = JSON.stringify(id);
    if (seen.has(key)) return null;
    seen.add(key);
    keys.push(key);
    items.push(item as Rec);
  }
  return { keys, items };
}

// Key order is irrelevant: the Rust side compares parsed values, and the file
// round-trips through a serializer that sorts keys.
export function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((x, i) => sameValue(x, b[i]));
  }
  if (a && b && typeof a === "object" && typeof b === "object") {
    const ak = Object.keys(a as Rec).filter((k) => (a as Rec)[k] !== undefined);
    const bk = Object.keys(b as Rec).filter((k) => (b as Rec)[k] !== undefined);
    if (ak.length !== bk.length) return false;
    return ak.every((k) => k in (b as Rec) && sameValue((a as Rec)[k], (b as Rec)[k]));
  }
  return false;
}

/** The merged list and the records that could not be applied (file's version kept). */
export function mergeRecordsDetailed(
  keyName: string,
  base: unknown,
  next: unknown,
  current: unknown,
): { list: unknown[]; conflicts: RecordConflict[] } | null {
  const b = indexById(base);
  const n = indexById(next);
  const c = indexById(current);
  if (!b || !n || !c) return null;
  const baseByKey = new Map(b.keys.map((k, i) => [k, b.items[i]]));
  const curByKey = new Map(c.keys.map((k, i) => [k, c.items[i]]));
  const nextKeys = new Set(n.keys);

  const out: Rec[] = [];
  const outKeys: string[] = [];
  const conflicts: RecordConflict[] = [];
  const idOf = (item: Rec) => item.id as string | number;
  n.keys.forEach((key, i) => {
    const item = n.items[i];
    const old = baseByKey.get(key);
    if (old === undefined) {
      // Added here. A same-id record already in the file with other content
      // is a conflict (the file's stays); an identical one is a retry.
      const there = curByKey.get(key);
      if (there !== undefined && !sameValue(there, item)) {
        conflicts.push({
          key: keyName,
          id: idOf(item),
          kind: "add-add",
          mine: item,
          theirs: there,
        });
        out.push(there);
      } else {
        out.push(item);
      }
      outKeys.push(key);
      return;
    }
    const theirs = curByKey.get(key);
    if (sameValue(old, item)) {
      // Untouched here: the file's version is current. Gone from the file:
      // someone else deleted it, and we did not touch it.
      if (theirs !== undefined) {
        out.push(theirs);
        outKeys.push(key);
      }
      return;
    }
    // Edited here.
    if (theirs !== undefined && sameValue(theirs, old)) {
      out.push(item);
      outKeys.push(key);
    } else if (theirs !== undefined && sameValue(theirs, item)) {
      out.push(theirs);
      outKeys.push(key);
    } else if (theirs !== undefined) {
      conflicts.push({ key: keyName, id: idOf(item), kind: "edit-edit", mine: item, theirs });
      out.push(theirs);
      outKeys.push(key);
    } else {
      conflicts.push({
        key: keyName,
        id: idOf(item),
        kind: "edit-deleted",
        mine: item,
        theirs: null,
      });
    }
  });
  c.keys.forEach((key, idx) => {
    if (nextKeys.has(key)) return;
    const old = baseByKey.get(key);
    if (old !== undefined) {
      // Deleted here: fine if the file still has what we saw; if the file
      // edited it meanwhile, that edit stays.
      if (sameValue(old, c.items[idx])) return;
      conflicts.push({
        key: keyName,
        id: idOf(c.items[idx]),
        kind: "deleted-edited",
        mine: null,
        theirs: c.items[idx],
      });
    }
    // Added by someone else (or kept after a conflict): after its nearest
    // earlier neighbour that made it into the result, else at the front.
    let at = 0;
    for (let j = idx - 1; j >= 0; j--) {
      const p = outKeys.indexOf(c.keys[j]);
      if (p >= 0) {
        at = p + 1;
        break;
      }
    }
    out.splice(at, 0, c.items[idx]);
    outKeys.splice(at, 0, key);
  });
  return { list: out, conflicts };
}

/** The merged list only (conflicting records keep the file's version). */
export function mergeRecords(base: unknown, next: unknown, current: unknown): unknown[] | null {
  return mergeRecordsDetailed("", base, next, current)?.list ?? null;
}

/**
 * `list` with this window's side of one conflict put on top: its version
 * replaces (or is inserted for) the record, or the record is removed when
 * this window had deleted it. Nothing else in `list` changes. The caller
 * writes the result against `list` as base, which makes it an explicit overwrite.
 */
export function applyMineToList<T extends { id: string | number }>(
  list: readonly T[],
  conflict: Pick<RecordConflict, "id" | "mine">,
): T[] {
  const rest = list.filter((r) => r.id !== conflict.id);
  if (conflict.mine === null || conflict.mine === undefined) return rest;
  const at = list.findIndex((r) => r.id === conflict.id);
  const mine = conflict.mine as T;
  if (at < 0) return [mine, ...list];
  const next = [...list];
  next[at] = mine;
  return next;
}
