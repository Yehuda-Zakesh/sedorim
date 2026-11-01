// What a restore does to the current records, by id: how many stay as they are,
// are replaced by a different version, are removed (not in the backup) and are
// added (not here now). Shown before the final confirmation.
import { canonical } from "./backup-verify";

export type RecordsDiff = { same: number; replaced: number; removed: number; added: number };

export function diffById(
  current: readonly { id: string }[],
  restored: readonly { id: string }[],
): RecordsDiff {
  const cur = new Map(current.map((r) => [r.id, canonical(r)]));
  const out: RecordsDiff = { same: 0, replaced: 0, removed: 0, added: 0 };
  const seen = new Set<string>();
  for (const r of restored) {
    seen.add(r.id);
    const c = cur.get(r.id);
    if (c === undefined) out.added++;
    else if (c === canonical(r)) out.same++;
    else out.replaced++;
  }
  for (const id of cur.keys()) if (!seen.has(id)) out.removed++;
  return out;
}

function line(label: string, d: RecordsDiff): string {
  return `${label}: ${d.added} יתווספו, ${d.replaced} יוחלפו בגרסה אחרת, ${d.removed} יימחקו (אינם בגיבוי), ${d.same} יישארו זהים.`;
}

export function describeRestoreDiff(
  current: { seder: readonly { id: string }[]; learning: readonly { id: string }[] },
  restored: { seder: readonly { id: string }[]; learning: readonly { id: string }[] },
): string[] {
  return [
    line("נוכחות", diffById(current.seder, restored.seder)),
    line("לימוד", diffById(current.learning, restored.learning)),
  ];
}
