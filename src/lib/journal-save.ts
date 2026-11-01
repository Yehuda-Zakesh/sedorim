// A save that finishes later than it starts. Turns "did it work?" into the one
// thing a form needs: an error message to show, or null when it really saved.
import { ValidationError } from "./kollel-store";
import { CONFLICT_SAVE_TEXT } from "./save-conflicts";

/**
 * Awaits `save` and maps its outcome: null on success, otherwise a message.
 * A ValidationError (thrown at once or on the promise) carries its own text;
 * any other failure means the write did not reach storage and the store rolled
 * back. A save that resolved with edit conflicts (another window changed the
 * same record; the file's version was kept) is not a success either: it gets
 * the conflict text, and the user resolves it from the notice at the top of
 * the screen. The caller closes the form / reports success ONLY on null.
 */
export async function runSave(
  save: () => Promise<unknown> | void,
  failureText = "השמירה נכשלה — הרישום חזר לערכו הקודם",
): Promise<string | null> {
  try {
    const outcome = await save();
    if (isIncomplete(outcome)) return CONFLICT_SAVE_TEXT;
    return null;
  } catch (e) {
    if (e instanceof ValidationError) return e.message;
    return failureText;
  }
}

function isIncomplete(outcome: unknown): boolean {
  return (
    !!outcome &&
    typeof outcome === "object" &&
    (outcome as { complete?: unknown }).complete === false
  );
}
