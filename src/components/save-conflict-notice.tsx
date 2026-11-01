import { useState } from "react";

import { Button } from "@/components/ui/button";
import { logProblem } from "@/lib/diagnostics";
import {
  conflictMessage,
  refreshConflict,
  replaceConflict,
  usePendingConflicts,
  type PendingConflict,
} from "@/lib/save-conflicts";

/**
 * Shown when another window changed the same record this window changed. The
 * file's version was kept and is on screen; this window's own version is
 * waiting. Two explicit choices, no automatic merge:
 *   רענן — drop my edit, keep what the file has;
 *   החלף — save my edit over the file's version.
 */
export function SaveConflictNotice() {
  const conflicts = usePendingConflicts();
  if (!conflicts.length) return null;
  return (
    <div role="alert" className="border-b border-border bg-card px-4 py-3 text-sm">
      <p className="font-semibold">השמירה לא הושלמה במלואה</p>
      <ul className="mt-2 space-y-3">
        {conflicts.map((c) => (
          <ConflictRow key={c.uid} conflict={c} />
        ))}
      </ul>
    </div>
  );
}

function ConflictRow({ conflict }: { conflict: PendingConflict }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function replace() {
    setBusy(true);
    setError(null);
    try {
      await replaceConflict(conflict.uid);
    } catch (e) {
      logProblem("החלפת רשומה אחרי התנגשות עריכה", e);
      setError(`ההחלפה נכשלה, לא השתנה דבר: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <li>
      <p>{conflictMessage(conflict)}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        רענן: העריכה שלך תיזרק והקובץ יישאר כמו שהוא. החלף: העריכה שלך תישמר מעל מה שבקובץ.
      </p>
      <div className="mt-2 flex gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => refreshConflict(conflict.uid)}
        >
          רענן
        </Button>
        <Button size="sm" disabled={busy} onClick={() => void replace()}>
          החלף
        </Button>
      </div>
      {error && <p className="mt-2 text-destructive">{error}</p>}
    </li>
  );
}
