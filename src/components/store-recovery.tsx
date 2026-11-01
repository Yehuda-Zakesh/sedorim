import { useEffect, useState, type ReactNode } from "react";

import { SaveConflictNotice } from "@/components/save-conflict-notice";
import { Button } from "@/components/ui/button";
import { describePreview } from "@/lib/backup-preview";
import { logProblem } from "@/lib/diagnostics";
import { refreshFromStore } from "@/lib/kollel-store";
import {
  applyLegacyMissingRecords,
  getLegacyMigrationFailure,
  useLegacyConflict,
} from "@/lib/legacy-migration";
import { dismissNotice, useNoticeDismissed } from "@/lib/notice-dismissed";
import { keepOnboardedAfterRecovery } from "@/lib/settings-store";
import {
  loadStore,
  openDataFolder,
  previewBackup,
  recoverStore,
  startEmptyStore,
  type BackupPreview,
} from "@/lib/store-bridge";
import { useStoreGate, type StoreBackupInfo } from "@/lib/store-gate";
import { retryStoreLoad } from "@/lib/store-startup";

// What the user sees when the data file exists but could not be read. Nothing
// else runs against the file while this is on screen: the gate (store-gate.ts)
// refuses every write except the three recovery commands used here.

const START_EMPTY_PHRASE = "התחל ריק";

const REASON_TEXT: Record<string, string> = {
  unparseable: "תוכן הקובץ אינו תקין ולא ניתן לקרוא אותו.",
  "not-an-object": "תוכן הקובץ אינו במבנה שהאפליקציה מכירה.",
  missing: "קובץ הנתונים חסר, אבל נמצאו גיבויים — כנראה שהוא נמחק.",
  unreadable: "הקובץ קיים אך לא הצלחנו לפתוח אותו (ייתכן שהוא נעול או שאין הרשאה).",
};

function formatTs(ts: number): string {
  try {
    return new Date(ts).toLocaleString("he-IL", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return String(ts);
  }
}

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Replaces its children with the recovery screen while the data file is unreadable. */
export function StoreGuard({
  children,
  scroll = false,
}: {
  children: ReactNode;
  /** The quick window's shell does not scroll on its own. */
  scroll?: boolean;
}) {
  const { state } = useStoreGate();
  // What a recovery from a backup actually restored — shown after the recovery
  // screen is gone, because the point of it is to say what is NOT in the copy.
  const [recovered, setRecovered] = useState<string | null>(null);
  if (state === "corrupt") {
    return scroll ? (
      <div className="flex-1 min-h-0 overflow-y-auto">
        <StoreRecovery onRecovered={setRecovered} />
      </div>
    ) : (
      <StoreRecovery onRecovered={setRecovered} />
    );
  }
  return (
    <>
      {recovered && (
        <div role="status" className="border-b border-border bg-card px-4 py-3 text-sm">
          <p>{recovered}</p>
          <Button size="sm" variant="ghost" className="mt-2" onClick={() => setRecovered(null)}>
            הבנתי
          </Button>
        </div>
      )}
      <UpgradeNotice />
      <LegacyConflictNotice />
      <SaveConflictNotice />
      {children}
    </>
  );
}

/**
 * Says, in plain Hebrew, what the file holds after a recovery from a backup
 * copy. A copy replaces the WHOLE file, so anything it lacks (settings, the
 * onboarding flag) is not restored — this names what is missing instead of
 * letting defaults pass as the person's own settings.
 */
async function describeRecovery(backup: StoreBackupInfo, keptOnboarded: boolean): Promise<string> {
  let store: Awaited<ReturnType<typeof loadStore>> = {};
  try {
    store = await loadStore();
  } catch {
    // The counts from the backup list still say what was restored.
  }
  const hasSettings = !!store.settings && typeof store.settings === "object";
  const parts = [
    "השחזור אומת: הקובץ נקרא מחדש מהדיסק והתוכן שבו זהה לגיבוי.",
    `שוחזרו ${backup.counts.seder} רשומות נוכחות ו-${backup.counts.learning} רשומות לימוד מהגיבוי מ-${formatTs(backup.ts)}.`,
  ];
  if (backup.counts.seder + backup.counts.learning === 0)
    parts.push("הגיבוי הזה ריק — אין בו רשומות.");
  parts.push(
    hasSettings
      ? "ההגדרות נלקחו מהגיבוי."
      : "בגיבוי לא היו הגדרות, ולכן ההגדרות חזרו לברירת המחדל — כדאי לעבור עליהן במסך ההגדרות.",
  );
  if (keptOnboarded) parts.push("מצב ההיכרות נשמר: אשף הפתיחה לא יוצג שוב.");
  else if (store.onboarded === undefined)
    parts.push("בגיבוי אין מצב היכרות, ולכן ייתכן שאשף הפתיחה יוצג.");
  return parts.join(" ");
}

export function StoreRecovery({ onRecovered }: { onRecovered?: (message: string) => void } = {}) {
  const { corrupt } = useStoreGate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmBackup, setConfirmBackup] = useState<string | null>(null);
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const [phrase, setPhrase] = useState("");

  if (!corrupt) return null;
  const valid = corrupt.backups.filter((b) => b.valid);

  /** Resolves true when the action itself succeeded. */
  async function run(
    label: string,
    action: () => Promise<unknown>,
    reload = true,
  ): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      await action();
      if (reload && !(await retryStoreLoad())) {
        setError("הקובץ עדיין אינו נקרא.");
      }
      return true;
    } catch (e) {
      logProblem(label, e);
      setError(`${label} נכשל: ${errorText(e)}`);
      return false;
    } finally {
      setBusy(false);
    }
  }

  // Recovery = write the copy, read it back (opening the gate), then keep the
  // onboarding flag the copy may lack and say what the copy did and did not hold.
  async function finishRecovery(b: StoreBackupInfo) {
    setBusy(true);
    setError(null);
    try {
      if (!(await retryStoreLoad())) {
        setError("הקובץ עדיין אינו נקרא.");
        return;
      }
      let kept = false;
      try {
        kept = await keepOnboardedAfterRecovery();
      } catch (e) {
        logProblem("שמירת מצב ההיכרות אחרי שחזור", e);
      }
      onRecovered?.(await describeRecovery(b, kept));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      role="alert"
      aria-labelledby="store-recovery-title"
      className="mx-auto w-full max-w-2xl px-4 py-8"
    >
      <h1 id="store-recovery-title" className="title-serif text-2xl">
        קובץ הנתונים לא נקרא
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {REASON_TEXT[corrupt.reason] ?? REASON_TEXT.unreadable} כדי לא לאבד מידע, האפליקציה לא כותבת
        כלום עד שתבחר איך להמשיך.
      </p>
      <p className="mt-2 text-sm">
        {corrupt.preservedAs
          ? `הקובץ המקורי נשמר ללא שינוי: ${corrupt.preservedAs}`
          : "הקובץ המקורי לא נגעו בו ונשאר במקומו."}
      </p>
      {corrupt.message && (
        <p className="mt-1 text-xs text-muted-foreground" dir="auto">
          {corrupt.message}
        </p>
      )}

      <div className="section-rule mt-6">
        <h2 className="mb-3 text-base font-semibold">גיבויים תקינים</h2>
        {valid.length === 0 ? (
          <p className="text-sm text-muted-foreground">לא נמצא גיבוי תקין.</p>
        ) : (
          <ul className="divide-y divide-border border-y border-border">
            {valid.map((b) => (
              <BackupRow
                key={b.name}
                backup={b}
                disabled={busy}
                confirming={confirmBackup === b.name}
                onAsk={() => setConfirmBackup(b.name)}
                onCancel={() => setConfirmBackup(null)}
                onConfirm={() =>
                  void run("שחזור מגיבוי", () => recoverStore(b.name), false)
                    .then((ok) => (ok ? finishRecovery(b) : undefined))
                    .then(() => setConfirmBackup(null))
                }
              />
            ))}
          </ul>
        )}
      </div>

      <div className="section-rule mt-6 flex flex-wrap gap-2">
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => void run("טעינה חוזרת", async () => {})}
        >
          נסה לטעון שוב
        </Button>
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => void run("פתיחת תיקיית הנתונים", openDataFolder, false)}
        >
          פתח את תיקיית הנתונים
        </Button>
        <Button variant="destructive" disabled={busy} onClick={() => setConfirmEmpty(true)}>
          התחל ריק
        </Button>
      </div>

      {confirmEmpty && (
        <div className="mt-4 border-t border-border pt-4">
          <p className="text-sm">
            תיווצר רשימה ריקה חדשה. הקובץ הישן ישמר בתיקיית הנתונים ואפשר יהיה לשחזר ממנו ידנית.
            להמשך, הקלד <strong>{START_EMPTY_PHRASE}</strong>:
          </p>
          <input
            aria-label="אישור התחלה ריקה"
            className="mt-2 h-10 w-full max-w-xs rounded-md border border-input bg-card px-3 text-sm"
            value={phrase}
            onChange={(e) => setPhrase(e.target.value)}
          />
          <div className="mt-2 flex gap-2">
            <Button
              variant="destructive"
              disabled={busy || phrase.trim() !== START_EMPTY_PHRASE}
              onClick={() => void run("התחלה ריקה", startEmptyStore)}
            >
              אשר והתחל ריק
            </Button>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setConfirmEmpty(false);
                setPhrase("");
              }}
            >
              ביטול
            </Button>
          </div>
        </div>
      )}

      {error && (
        <p role="status" className="mt-4 text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}

function BackupRow({
  backup,
  disabled,
  confirming,
  onAsk,
  onCancel,
  onConfirm,
}: {
  backup: StoreBackupInfo;
  disabled: boolean;
  confirming: boolean;
  onAsk: () => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  // Shown before the person confirms: what the copy holds and what it replaces.
  const [preview, setPreview] = useState<BackupPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  useEffect(() => {
    if (!confirming) return;
    let live = true;
    setPreview(null);
    setPreviewError(null);
    previewBackup(backup.name).then(
      (p) => {
        if (live) setPreview(p);
      },
      (e) => {
        logProblem("תצוגה מקדימה של גיבוי", e);
        if (live) setPreviewError(errorText(e));
      },
    );
    return () => {
      live = false;
    };
  }, [confirming, backup.name]);

  return (
    <li className="py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <div className="text-sm font-medium">{formatTs(backup.ts)}</div>
          <div className="text-xs text-muted-foreground">
            {backup.counts.seder} רשומות נוכחות · {backup.counts.learning} רשומות לימוד
          </div>
        </div>
        {!confirming && (
          <Button size="sm" variant="outline" disabled={disabled} onClick={onAsk}>
            שחזר מהגיבוי הזה
          </Button>
        )}
      </div>
      {confirming && (
        <div className="mt-2">
          <p className="text-sm">
            יוחזרו {backup.counts.seder} רשומות נוכחות ו-{backup.counts.learning} רשומות לימוד
            מהגיבוי מ-{formatTs(backup.ts)}. הקובץ הנוכחי נשמר ולא יימחק.
          </p>
          {backup.counts.seder + backup.counts.learning === 0 && (
            <p className="mt-1 text-sm font-semibold text-destructive">
              הגיבוי הזה ריק: אין בו רשומות כלל.
            </p>
          )}
          <p className="mt-1 text-sm text-muted-foreground">
            השחזור מחליף את כל הקובץ, כולל ההגדרות. הגדרות ומצב היכרות שחסרים בגיבוי לא יוחזרו —
            ההגדרות יחזרו לברירת המחדל, ומצב ההיכרות שנרשם במחשב הזה יישמר כדי שהאשף לא יופיע שוב.
            אחרי השחזור תוצג הודעה שמפרטת מה היה בגיבוי.
          </p>
          <PreviewPanel preview={preview} error={previewError} />
          <div className="mt-2 flex gap-2">
            <Button size="sm" disabled={disabled || !preview} onClick={onConfirm}>
              אשר שחזור
            </Button>
            <Button size="sm" variant="ghost" disabled={disabled} onClick={onCancel}>
              ביטול
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}

/**
 * Shown when old data on this machine holds records the current file lacks.
 * Nothing was changed; adding them is an explicit choice.
 */
/**
 * Only a migration that failed is worth interrupting for. There is no "the
 * version was updated" message: the safety copy an upgrade makes is listed on
 * the backup screen instead.
 */
function UpgradeNotice() {
  useLegacyConflict();
  const hidden = useNoticeDismissed("upgrade");
  const failure = getLegacyMigrationFailure();
  if (hidden || !failure) return null;
  return (
    <div role="status" className="border-b border-border bg-card px-4 py-3 text-sm">
      <p>
        העברת הנתונים הישנים לא הושלמה, והם נשארו במקומם ולא נמחקו: {failure}. תוצג שוב בהפעלה הבאה.
      </p>
      <Button size="sm" variant="ghost" className="mt-2" onClick={() => dismissNotice("upgrade")}>
        הבנתי
      </Button>
    </div>
  );
}

export function LegacyConflictNotice() {
  const conflict = useLegacyConflict();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const hidden = useNoticeDismissed("legacy-conflict");
  if (!conflict || hidden) return null;

  async function add() {
    setBusy(true);
    setError(null);
    try {
      await applyLegacyMissingRecords();
      await refreshFromStore().catch(() => {});
      setConfirming(false);
    } catch (e) {
      logProblem("הוספת רשומות ישנות", e);
      setError(`ההוספה נכשלה, לא השתנה דבר: ${errorText(e)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div role="status" className="border-b border-border bg-card px-4 py-3 text-sm">
      <p>נמצאו נתונים ישנים במכשיר שאינם במאגר הנוכחי — הם שמורים.</p>
      {confirming ? (
        <div className="mt-2">
          <p>
            יתווספו {conflict.seder} רשומות נוכחות ו-{conflict.learning} רשומות לימוד שאינן קיימות
            במאגר. שום רשומה קיימת לא תשתנה.
          </p>
          <div className="mt-2 flex gap-2">
            <Button size="sm" disabled={busy} onClick={() => void add()}>
              הוסף
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => setConfirming(false)}>
              ביטול
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-2 flex gap-2">
          <Button size="sm" variant="outline" disabled={busy} onClick={() => setConfirming(true)}>
            הוסף את הרשומות החסרות
          </Button>
          <Button size="sm" variant="ghost" onClick={() => dismissNotice("legacy-conflict")}>
            השאר כך
          </Button>
        </div>
      )}
      {error && <p className="mt-2 text-destructive">{error}</p>}
    </div>
  );
}

/** What the copy holds, what the file holds now, and what the restore replaces or leaves out. */
function PreviewPanel({ preview, error }: { preview: BackupPreview | null; error: string | null }) {
  if (error)
    return (
      <p role="status" className="mt-2 text-sm text-destructive">
        לא ניתן להציג תצוגה מקדימה של הגיבוי, ולכן לא ניתן לשחזר ממנו: {error}
      </p>
    );
  if (!preview)
    return (
      <p role="status" className="mt-2 text-sm text-muted-foreground">
        טוען תצוגה מקדימה…
      </p>
    );
  const text = describePreview(preview);
  return (
    <div className="mt-2 rounded-md border border-border p-3 text-sm" data-testid="backup-preview">
      <h3 className="font-semibold">מה בגיבוי</h3>
      <ul className="mt-1 space-y-0.5">
        {text.backup.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <h3 className="mt-3 font-semibold">מה יוחלף</h3>
      <p className="mt-1">{text.current}</p>
      <ul className="mt-1 space-y-0.5">
        {text.replaced.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      {text.missing.length > 0 && (
        <>
          <h3 className="mt-3 font-semibold text-destructive">מה יחסר אחרי השחזור</h3>
          <ul className="mt-1 space-y-0.5">
            {text.missing.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
