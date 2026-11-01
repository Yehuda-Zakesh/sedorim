// Proof that something reached storage: read the data file back (loadStore)
// and compare it with what was meant to be written. An in-memory list or a
// checksum proves nothing about the file.
import { loadStore } from "./store-bridge";
import type { BackupSnapshot } from "./auto-backup";

export class PersistVerifyError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "PersistVerifyError";
  }
}

/** JSON with sorted keys and no undefined — the file round-trips through a
 *  serializer that reorders keys, so raw text cannot be compared. */
export function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v) ?? "null";
}

// Same records, same content, regardless of order.
function sameRecords(stored: unknown, expected: unknown[], label: string): void {
  const got = Array.isArray(stored) ? stored : [];
  if (got.length !== expected.length)
    throw new PersistVerifyError(`${label}: בקובץ ${got.length} רישומים במקום ${expected.length}`);
  const a = got.map(canonical).sort();
  const b = expected.map(canonical).sort();
  for (let i = 0; i < a.length; i++)
    if (a[i] !== b[i]) throw new PersistVerifyError(`${label}: תוכן הרישומים בקובץ שונה ממה שנשמר`);
}

export type Expected = {
  /** Other keys of the file (a full-copy restore) that must read back as written. */
  extra?: Record<string, unknown>;
  seder?: unknown[];
  learning?: unknown[];
  snapshot?: BackupSnapshot | null;
};

/** Reads the file back and throws PersistVerifyError on any mismatch. */
export async function verifyPersisted(expected: Expected): Promise<void> {
  let stored: Awaited<ReturnType<typeof loadStore>>;
  try {
    stored = await loadStore();
  } catch {
    throw new PersistVerifyError("לא ניתן היה לקרוא את הקובץ בחזרה כדי לאמת את השמירה");
  }
  if (expected.seder) sameRecords(stored.seder, expected.seder, "רישומי סדרים");
  if (expected.learning) sameRecords(stored.learning, expected.learning, "רישומי לימוד");
  if (expected.extra) {
    const file = stored as Record<string, unknown>;
    for (const [k, v] of Object.entries(expected.extra))
      if (canonical(file[k]) !== canonical(v))
        throw new PersistVerifyError(`המפתח ״${k}״ בקובץ שונה ממה שנשמר`);
  }
  if (expected.snapshot) {
    const want = expected.snapshot;
    const list = Array.isArray(stored.snapshots) ? (stored.snapshots as BackupSnapshot[]) : [];
    const got = list.find((s) => s?.id === want.id);
    if (!got) throw new PersistVerifyError("עותק הבטיחות אינו נמצא בקובץ");
    if (got.checksum !== want.checksum || canonical(got.payload) !== canonical(want.payload))
      throw new PersistVerifyError("עותק הבטיחות בקובץ שונה ממה שנשמר");
  }
}
