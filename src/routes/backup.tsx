// Data and backup.
//
// Two different things are called "backup" here and the screen keeps them
// apart:
//   - a snapshot: a copy kept inside the app, taken automatically, before big
//     operations, or on demand. Fast, but it lives with the app's own data —
//     it is not protection against losing the computer;
//   - a backup file: a JSON file saved somewhere on this computer (or a USB
//     stick) by the user. The only kind that survives the app being removed.
//
// "There is a copy you can restore" is derived from the snapshots that exist
// and pass their checksum — nothing else. When the last automatic run happened
// is a separate line with a name that promises nothing: a run whose copies were
// since deleted is history, not a restore point.
//
// The page starts from that state, offers one primary action (save a file),
// keeps history and restore together, tucks sizes and technical details into a
// collapsed block, and puts deletions last, as quiet secondary actions with
// confirmations that match what they destroy. Formats and keys are unchanged.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useRef, useState, type ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { Download, Upload, Trash2, Camera, ChevronDown, FolderOpen } from "lucide-react";
import { useSeder, useLearning } from "@/lib/kollel-store";
import {
  useSnapshots,
  deleteSnapshot,
  verifySnapshot,
  getLastAutoBackupTs,
  clearAllSnapshots,
} from "@/lib/auto-backup";
import {
  analyzeBackup,
  analyzeBackupText,
  invalidCount,
  outcomeMessage,
  summarizeIssues,
  validCount,
  type BackupAnalysis,
} from "@/lib/backup-analysis";
import { describeRestoreDiff } from "@/lib/restore-diff";
import { deleteEverything, replaceEverything, takeSnapshot } from "@/lib/backup-actions";
import { useSettings } from "@/lib/settings-store";
import { saveTextFile } from "@/lib/save-file";
import { openDataFolder } from "@/lib/store-bridge";
import { getUpgradeMeta } from "@/lib/store-startup";
import { isDesktop } from "@/lib/tauri";
import { Button } from "@/components/ui/button";
import { EmptyNote, LedgerRow, Notice, PageSection, StatusMark } from "@/components/ui/ledger";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";

export const Route = createFileRoute("/backup")({
  head: () => ({ meta: [{ title: "נתונים וגיבוי — סדר פלוס" }] }),
  component: BackupPage,
});

function formatTs(ts: number) {
  return new Date(ts).toLocaleString("he-IL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
function formatSize(n: number) {
  return n > 1024 ? `${(n / 1024).toFixed(1)} KB` : `${n} B`;
}
function ago(ts: number) {
  const days = Math.floor((Date.now() - ts) / 86_400_000);
  if (days <= 0) return "היום";
  if (days === 1) return "אתמול";
  return `לפני ${days} ימים`;
}

const TRIGGER_LABEL = { auto: "אוטומטי", "before-op": "לפני פעולה", manual: "ידני" } as const;
const AUTO_LABEL = { off: "כבוי", daily: "יומי", weekly: "שבועי" } as const;

function BackupPage() {
  return (
    <AppShell title="נתונים וגיבוי" subtitle="שמירת קובץ גיבוי, שחזור והיסטוריית עותקים">
      <BackupView />
    </AppShell>
  );
}

/** A confirmation sized to what it destroys; optionally asks for a typed word. */
function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  tone = "default",
  typeToConfirm,
  confirmDisabled = false,
  extraAction,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  tone?: "default" | "destructive";
  typeToConfirm?: string;
  /** Blocks the main button (e.g. the file has errors). */
  confirmDisabled?: boolean;
  /** A second, explicit decision offered next to the main one. */
  extraAction?: { label: string; onClick: () => void };
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [typed, setTyped] = useState("");
  const cancelRef = useRef<HTMLButtonElement>(null);
  const ready = !typeToConfirm || typed.trim() === typeToConfirm;
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setTyped("");
          onCancel();
        }
      }}
    >
      <DialogContent
        dir="rtl"
        className="max-w-md"
        // A destructive question opens on its safe answer.
        onOpenAutoFocus={(e) => {
          if (!typeToConfirm) {
            e.preventDefault();
            cancelRef.current?.focus();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-2 text-sm">{children}</div>
          </DialogDescription>
        </DialogHeader>
        {typeToConfirm && (
          <label className="block text-sm text-muted-foreground">
            להמשך, הקלד ״{typeToConfirm}״:
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              className="field-input mt-1 w-full text-foreground"
              autoComplete="off"
            />
          </label>
        )}
        <DialogFooter className="flex-row-reverse gap-2 sm:justify-start">
          <Button
            type="button"
            variant={tone === "destructive" ? "destructive" : "default"}
            disabled={!ready || confirmDisabled}
            onClick={() => {
              setTyped("");
              onConfirm();
            }}
          >
            {confirmLabel}
          </Button>
          {extraAction && (
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                setTyped("");
                extraAction.onClick();
              }}
            >
              {extraAction.label}
            </Button>
          )}
          <Button
            ref={cancelRef}
            type="button"
            variant="outline"
            onClick={() => {
              setTyped("");
              onCancel();
            }}
          >
            ביטול
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type ReplaceSource = { name: string; rawText: string; analysis: BackupAnalysis };

/** What the file or snapshot holds, so the user decides knowing the facts. */
function ReplacePreview({
  source,
  currentSeder,
  currentLearning,
  currentRecords,
  retention,
  snapshotLabel,
  restoreExtras,
  onToggleExtras,
}: {
  source: ReplaceSource;
  currentSeder: number;
  currentLearning: number;
  currentRecords: { seder: readonly { id: string }[]; learning: readonly { id: string }[] };
  retention: number;
  snapshotLabel?: string;
  restoreExtras: boolean;
  onToggleExtras: (on: boolean) => void;
}) {
  const a = source.analysis;
  const bad = invalidCount(a);
  const hasCurrent = currentSeder + currentLearning > 0;
  const full = a.copyKind === "full";
  const emptyBackup = a.totalSeder + a.totalLearning === 0;
  return (
    <>
      <p>
        {snapshotLabel ? `תמונת המצב מ־${snapshotLabel}` : `הקובץ ״${source.name}״`} הוא{" "}
        <strong>{full ? "עותק מלא" : "גיבוי רשומות"}</strong>
        {full ? " (רשומות, וגם הגדרות או מפתחות נוספים)" : " (נוכחות ולימוד בלבד)"}.
      </p>
      <p>
        <strong>יוחזר:</strong> {a.totalSeder} רישומי סדרים ו־{a.totalLearning} רישומי לימוד
        {a.period ? `, בתקופה ${a.period.first} עד ${a.period.last}` : ""}. סוגי נתונים:{" "}
        {a.kinds.length ? a.kinds.join(", ") : "אין רישומים"}. הרישומים הנוכחיים ({currentSeder}{" "}
        סדרים ו־{currentLearning} לימוד) יוחלפו בהם.
      </p>
      <ul className="list-disc ps-5">
        {describeRestoreDiff(currentRecords, { seder: a.seder, learning: a.learning }).map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
      {emptyBackup && hasCurrent && (
        <p className="rounded border border-destructive/50 p-2 font-semibold text-destructive">
          הגיבוי ריק: ההחלפה תמחק את כל הרישומים הנוכחיים (עותק בטיחות יישמר קודם).
        </p>
      )}
      <p>
        <strong>הגדרות בגיבוי:</strong> {a.hasSettings ? "כן" : "אין"}.{" "}
        {full ? `בעותק יש גם: ${a.carryLabels.join(", ")}.` : ""}
      </p>
      {full && (
        <label className="flex items-start gap-2 rounded border border-border p-2">
          <input
            type="checkbox"
            className="mt-1"
            checked={restoreExtras}
            onChange={(e) => onToggleExtras(e.target.checked)}
          />
          <span>
            לשחזר גם את ההגדרות והמפתחות הנוספים מהעותק ({a.carryLabels.join(", ")}). ההגדרות
            הנוכחיות יוחלפו, ואי אפשר לחזור מהן מתמונת מצב (היא כוללת רשומות בלבד).
          </span>
        </label>
      )}
      <p>
        <strong>יישאר ללא שינוי:</strong>{" "}
        {full && restoreExtras
          ? "תמונות המצב הפנימיות והטיימר הפעיל. מפתחות שבקובץ הנוכחי ואינם בעותק נשארים."
          : `ההגדרות, מצב ההיכרות (האשף לא יופיע שוב), תמונות המצב הפנימיות והטיימר הפעיל${
              a.hasSettings || full
                ? "."
                : ". לגיבוי אין הגדרות, ולכן שום הגדרה לא תאופס ולא תומצא."
            }`}
      </p>
      {a.repairedIds > 0 && <p>ל־{a.repairedIds} רישומים ישנים בלי מזהה יינתן מזהה חדש.</p>}
      {bad > 0 ? (
        <div className="rounded border border-destructive/50 p-2 text-destructive">
          <p className="font-semibold">
            נמצאו {bad} רשומות לא תקינות מתוך {a.totalSeder + a.totalLearning}. ההחלפה חסומה.
          </p>
          <ul className="mt-1 list-disc ps-5">
            {summarizeIssues(a).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <p className="mt-1">
            {validCount(a) > 0
              ? `אפשר לדלג על הרשומות האלה ולהחליף ב־${validCount(a)} התקינות. לפני כן תתבקש לשמור עותק מלא של המקור, והדילוג יירשם בהודעה.`
              : "אין אף רשומה תקינה, ולכן אי אפשר להחליף."}
          </p>
        </div>
      ) : (
        <p>כל הרשומות תקינות.</p>
      )}
      {hasCurrent ? (
        <p>
          לפני ההחלפה יישמר עותק מלא של המצב הנוכחי כתמונת מצב, באותה שמירה.
          {retention <= 1 && " מוגדר לשמור עותק אחד בלבד, ולכן הוא יחליף את העותק הקודם."}
        </p>
      ) : (
        <p>אין כרגע נתונים, ולכן לא תיווצר תמונת מצב.</p>
      )}
    </>
  );
}

type Pending =
  | { kind: "file"; name: string; rawText: string; analysis: BackupAnalysis }
  | { kind: "snapshot"; id: string; rawText: string; analysis: BackupAnalysis }
  | { kind: "delete-data" }
  | { kind: "delete-snapshots" }
  | null;

function BackupView() {
  const { entries } = useSeder();
  const { items } = useLearning();
  const snapshots = useSnapshots();
  const { settings } = useSettings();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<Pending>(null);
  const [busy, setBusy] = useState(false);
  // For a full copy: restore its settings / extra keys too. Off by default — a
  // plain restore never touches settings or the onboarding state.
  const [restoreExtras, setRestoreExtras] = useState(false);

  const exportData = async () => {
    const payload = {
      version: 3,
      exportedAt: new Date().toISOString(),
      kind: "kollel",
      seder: entries,
      learning: items,
    };
    const json = JSON.stringify(payload, null, 2);
    const filename = `kollel-backup-${new Date().toISOString().slice(0, 10)}.json`;
    try {
      // Goes through the native save dialog — a WebView has no working
      // <a download>. See src/lib/save-file.ts.
      if (!(await saveTextFile(filename, json))) return; // cancelled
    } catch (e) {
      console.error(e);
      toast.error("שמירת הקובץ נכשלה");
      return;
    }
    toast.success("קובץ הגיבוי נשמר");
  };

  // Reading the file only stages it: it is analysed here, nothing is replaced
  // until the user has seen the result and confirmed.
  const stageImport = async (file: File) => {
    let text: string;
    try {
      text = await file.text();
    } catch {
      toast.error("לא ניתן היה לקרוא את הקובץ");
      return;
    }
    const analysis = analyzeBackupText(text);
    if (analysis.formatError) {
      toast.error(`הקובץ אינו קובץ גיבוי תקין: ${analysis.formatError}`);
      return;
    }
    setRestoreExtras(false);
    setPending({ kind: "file", name: file.name, rawText: text, analysis });
  };

  const stageSnapshot = (id: string) => {
    const snap = snapshots.find((s) => s.id === id);
    if (!snap) return;
    if (!verifySnapshot(snap)) {
      toast.error("תמונת המצב פגומה (סכום הביקורת אינו תואם) ולכן אי אפשר לשחזר ממנה");
      return;
    }
    // payload comes off disk, so it is analysed like any other file.
    const analysis = analyzeBackup(snap.payload);
    if (analysis.formatError) {
      toast.error(`אי אפשר לשחזר מתמונת המצב: ${analysis.formatError}`);
      return;
    }
    setRestoreExtras(false);
    setPending({ kind: "snapshot", id, rawText: JSON.stringify(snap.payload), analysis });
  };

  // One path for file import and snapshot restore. `skipInvalid` is the user's
  // explicit decision to drop the unusable records; the complete original is
  // then saved as a file first, and if that is cancelled nothing happens.
  const applyReplacement = async (
    source: { name: string; rawText: string; analysis: BackupAnalysis },
    skipInvalid: boolean,
  ) => {
    const { analysis } = source;
    const skipped = invalidCount(analysis);
    if (skipped > 0 && !skipInvalid) return; // errors block a plain replace
    setBusy(true);
    try {
      if (skipped > 0) {
        try {
          const copyName = `kollel-original-${new Date().toISOString().slice(0, 10)}.json`;
          if (!(await saveTextFile(copyName, source.rawText))) {
            toast.info("לא נשמר עותק של הקובץ המקורי, ולכן לא בוצעה החלפה");
            return;
          }
        } catch (e) {
          console.error(e);
          toast.error("שמירת העותק של הקובץ המקורי נכשלה, ולכן לא בוצעה החלפה");
          return;
        }
      }
      const extra = restoreExtras && analysis.copyKind === "full" ? analysis.carry : undefined;
      const out = await replaceEverything(analysis.seder, analysis.learning, { extra });
      const kept = out.snapshot ? " המצב הקודם נשמר כתמונת מצב." : "";
      const untouched = out.restoredKeys.length ? "" : " ההגדרות ושאר הנתונים לא שונו.";
      const msg = `${outcomeMessage(out.accepted, skipped, out.restoredKeys)}${untouched}${kept}`;
      if (skipped > 0) toast.warning(msg, { duration: 12000 });
      else toast.success(msg);
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "הפעולה נכשלה", { duration: 12000 });
    } finally {
      setBusy(false);
    }
  };

  const snapshotNow = async () => {
    setBusy(true);
    try {
      const snap = await takeSnapshot();
      if (snap) toast.success("נוצרה תמונת מצב בתוך התוכנה");
      else toast.info("אין נתונים לשמירה, ולכן לא נוצרה תמונת מצב");
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "יצירת תמונת המצב נכשלה");
    } finally {
      setBusy(false);
    }
  };

  // The safety snapshot and the delete are ONE atomic write (see
  // backup-actions.ts): if it fails nothing is deleted, and success is shown
  // only after the file was read back.
  const doDelete = async () => {
    // Nothing to delete means nothing to protect.
    if (entries.length + items.length === 0) {
      toast.info("אין נתונים למחיקה");
      return;
    }
    setBusy(true);
    try {
      await deleteEverything();
      toast.success("הנתונים נמחקו. אפשר לשחזר מתמונת המצב שנוצרה לפני המחיקה.");
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "המחיקה נכשלה, והנתונים נשארו", {
        duration: 12000,
      });
    } finally {
      setBusy(false);
    }
  };

  const upgradeMeta = getUpgradeMeta();
  const openFolder = async () => {
    if (!isDesktop) {
      toast.info("פתיחת תיקיית הנתונים זמינה רק בתוכנה המותקנת");
      return;
    }
    try {
      await openDataFolder();
    } catch (e) {
      console.error(e);
      toast.error(`פתיחת תיקיית הנתונים נכשלה: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const totalBytes = JSON.stringify({ entries, items }).length;
  const lastAuto = getLastAutoBackupTs();
  const hasData = entries.length + items.length > 0;

  // Restorable = exists AND passes its checksum. Nothing else counts.
  const validSnaps = snapshots.filter(verifySnapshot);
  const brokenCount = snapshots.length - validSnaps.length;
  const newestValid = validSnaps[0];
  const stale = hasData && (!newestValid || Date.now() - newestValid.ts > 7 * 86_400_000);
  const restoreTarget =
    pending?.kind === "snapshot" ? snapshots.find((s) => s.id === pending.id) : undefined;
  const replaceSource: ReplaceSource | undefined =
    pending?.kind === "file"
      ? pending
      : pending?.kind === "snapshot" && restoreTarget
        ? { name: "תמונת מצב", rawText: pending.rawText, analysis: pending.analysis }
        : undefined;

  return (
    <div className="stack-gap max-w-3xl">
      {/* 1. What can be restored right now */}
      <section aria-labelledby="backup-status">
        <h2 id="backup-status" className="sr-only">
          מצב הגיבוי
        </h2>
        <div className="space-y-1">
          {newestValid ? (
            <StatusMark tone="present" className="text-lg">
              יש עותק זמין לשחזור
            </StatusMark>
          ) : (
            <StatusMark tone={hasData ? "late" : "none"} className="text-lg">
              אין עותק זמין לשחזור
            </StatusMark>
          )}
          <p className="text-sm text-muted-foreground">
            {newestValid ? (
              <>
                העותק האחרון: {ago(newestValid.ts)} ·{" "}
                <span className="figure">{formatTs(newestValid.ts)}</span>
                {validSnaps.length > 1 && ` · בסך הכול ${validSnaps.length} עותקים תקינים`}
              </>
            ) : (
              "אין עדיין תמונת מצב תקינה בתוך התוכנה."
            )}
          </p>
          {brokenCount > 0 && (
            <p className="text-sm text-destructive">
              לתיקון: {brokenCount === 1 ? "עותק אחד פגום" : `${brokenCount} עותקים פגומים`} — אי
              אפשר לשחזר מהם. אפשר למחוק אותם בהיסטוריה שלמטה.
            </p>
          )}
        </div>

        <div className="mt-3 max-w-md">
          <div className="ledger">
            <LedgerRow
              label="הרצת גיבוי אוטומטי אחרונה"
              note="מועד ההרצה בלבד, לא הבטחה שעדיין יש עותק"
            >
              <span className="text-sm">{lastAuto ? formatTs(lastAuto) : "טרם רץ"}</span>
            </LedgerRow>
            <LedgerRow label="גיבוי אוטומטי">
              <span className="text-sm">{AUTO_LABEL[settings.data.autoBackup]}</span>
            </LedgerRow>
          </div>
        </div>

        {stale && (
          <div className="mt-4">
            <Notice tone="warning" title="כדאי לשמור עכשיו קובץ גיבוי במחשב">
              {newestValid
                ? "העותק התקין האחרון ישן משבוע."
                : "אין עותק תקין, ויש נתונים שאין להם גיבוי."}
            </Notice>
          </div>
        )}
      </section>

      {/* 2. Actions: one primary, the rest quieter */}
      <section aria-labelledby="backup-actions" className="section-rule">
        <h2 id="backup-actions" className="mb-3 text-base font-semibold">
          גיבוי עכשיו
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          <Button size="lg" onClick={exportData}>
            <Download aria-hidden="true" />
            שמירת קובץ גיבוי במחשב
          </Button>
          <Button variant="outline" disabled={busy} onClick={() => void snapshotNow()}>
            <Camera aria-hidden="true" />
            תמונת מצב בתוך התוכנה
          </Button>
        </div>
        <dl className="mt-4 grid gap-3 text-sm md:grid-cols-3">
          <div>
            <dt className="font-semibold">גיבוי רשומות (קובץ)</dt>
            <dd className="mt-0.5 text-muted-foreground">
              קובץ JSON עם רישומי הנוכחות והלימוד בלבד — בלי הגדרות. שחזור ממנו מחליף רישומים ולא
              נוגע בהגדרות. הוא היחיד שנשאר גם אם התוכנה תוסר. התוכנה לא עוקבת אחרי קבצים שנשמרו,
              ולכן הם אינם נספרים בסטטוס שלמעלה.
            </dd>
          </div>
          <div>
            <dt className="font-semibold">תמונת מצב פנימית</dt>
            <dd className="mt-0.5 text-muted-foreground">
              עותק מהיר השמור בתוך התוכנה, לחזרה אחורה אחרי טעות. הוא אינו מגן מפני אובדן הנתונים
              עצמם.
            </dd>
          </div>
          <div>
            <dt className="font-semibold">עותק מלא (לשדרוג)</dt>
            <dd className="mt-0.5 text-muted-foreground">
              עותק של כל קובץ הנתונים: רישומים, הגדרות, מצב היכרות ומפתחות נוספים. כששדרוג מעביר את
              הנתונים לגרסה חדשה, התוכנה שומרת אותו בעצמה בתיקיית backups שליד קובץ הנתונים (קבצים
              בשם sedorim-upgrade). אין צורך ליצור אותו ידנית, ואפשר לשמור אותו כל עוד אינך בטוח
              בשדרוג.
              {upgradeMeta?.upgradeCopy && (
                <>
                  {" "}
                  העותק של השדרוג האחרון
                  {upgradeMeta.upgradedFrom && upgradeMeta.upgradedFrom !== "unknown"
                    ? ` (מגרסה ${upgradeMeta.upgradedFrom})`
                    : ""}
                  : <span dir="ltr">{upgradeMeta.upgradeCopy}</span>.
                </>
              )}
            </dd>
          </div>
        </dl>
        <div className="mt-3">
          <Button variant="outline" size="sm" onClick={() => void openFolder()}>
            <FolderOpen aria-hidden="true" />
            פתח תיקיית נתונים
          </Button>
        </div>
      </section>

      {/* 3. History and restore */}
      <PageSection
        title="תמונות מצב פנימיות ושחזור"
        aside={
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
          >
            <Upload aria-hidden="true" />
            שחזור מקובץ גיבוי
          </Button>
        }
      >
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          className="hidden"
          aria-label="בחירת קובץ גיבוי לשחזור"
          tabIndex={-1}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void stageImport(f);
            e.target.value = "";
          }}
        />
        {snapshots.length ? (
          <ul className="ledger">
            {snapshots.map((s) => {
              const valid = verifySnapshot(s);
              return (
                <li key={s.id} className="row-pad flex flex-wrap items-center gap-x-4 gap-y-2">
                  <div className="min-w-0 flex-1 basis-48">
                    <div className="figure text-sm font-medium">{formatTs(s.ts)}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {TRIGGER_LABEL[s.trigger]} · {formatSize(s.size)}
                    </div>
                  </div>
                  <StatusMark tone={valid ? "present" : "absent"} className="text-xs">
                    {valid ? "תקינה" : "פגומה — אי אפשר לשחזר"}
                  </StatusMark>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!valid}
                      onClick={() => stageSnapshot(s.id)}
                      aria-label={`שחזר מתמונת המצב מ-${formatTs(s.ts)}`}
                    >
                      שחזר
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-9 text-muted-foreground hover:text-destructive"
                      onClick={() => {
                        deleteSnapshot(s.id);
                        toast("תמונת המצב נמחקה");
                      }}
                      aria-label={`מחק את תמונת המצב מ-${formatTs(s.ts)}`}
                    >
                      <Trash2 aria-hidden="true" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyNote title="אין עדיין תמונות מצב">
            הן נוצרות אוטומטית לפי ההגדרות, וגם בלחיצה על ״תמונת מצב בתוך התוכנה״.
          </EmptyNote>
        )}
        <p className="mt-3 text-sm text-muted-foreground">
          תדירות הגיבוי האוטומטי ({AUTO_LABEL[settings.data.autoBackup]}) ומספר העותקים שנשמרים (
          {settings.data.backupRetention}) נקבעים{" "}
          <Link to="/settings" className="underline underline-offset-2 hover:text-foreground">
            בהגדרות
          </Link>
          .
        </p>
      </PageSection>

      {/* 4. Size and technical detail, collapsed */}
      <details className="group section-rule">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-base font-semibold [&::-webkit-details-marker]:hidden">
          נפח ופרטים טכניים
          <ChevronDown
            className="size-4 text-muted-foreground transition-transform group-open:rotate-180"
            aria-hidden="true"
          />
        </summary>
        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
          {[
            ["רישומי סדרים", entries.length.toString()],
            ["רישומי לימוד", items.length.toString()],
            ["נפח נתונים", formatSize(totalBytes)],
            ["תמונות מצב שמורות", snapshots.length.toString()],
            ["פורמט קובץ גיבוי", "JSON, גרסה 3"],
          ].map(([k, v]) => (
            <div key={k}>
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="figure font-medium">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-sm text-muted-foreground">
          כל תמונת מצב נבדקת בסכום ביקורת; תמונה שנפגמה מסומנת ואי אפשר לשחזר ממנה.
        </p>
      </details>

      {/* 5. Deletions, last and quiet */}
      <PageSection title="מחיקות ואיפוסים">
        <ul className="ledger">
          <li className="row-pad flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <div className="min-w-0 flex-1 basis-56">
              <div className="text-sm font-semibold">מחיקת כל הנתונים</div>
              <div className="mt-0.5 text-sm text-muted-foreground">
                {hasData
                  ? "מוחקת את כל רישומי הסדרים והלימוד. לפני המחיקה נוצרת תמונת מצב, כך שאפשר לחזור."
                  : "אין כרגע נתונים למחיקה."}
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={!hasData}
              onClick={() => setPending({ kind: "delete-data" })}
            >
              מחק נתונים
            </Button>
          </li>
          <li className="row-pad flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <div className="min-w-0 flex-1 basis-56">
              <div className="text-sm font-semibold">מחיקת כל תמונות המצב</div>
              <div className="mt-0.5 text-sm text-muted-foreground">
                מוחקת רק את העותקים הפנימיים. הנתונים עצמם נשארים. אי אפשר לבטל.
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={snapshots.length === 0}
              onClick={() => setPending({ kind: "delete-snapshots" })}
            >
              מחק תמונות מצב
            </Button>
          </li>
        </ul>
        <p className="mt-3 text-sm text-muted-foreground">
          לאיפוס ההגדרות (שעות סדרים, יעדים והעדפות) —{" "}
          <Link to="/settings" className="underline underline-offset-2 hover:text-foreground">
            מסך ההגדרות
          </Link>
          .
        </p>
      </PageSection>

      {/* Confirmations */}
      {/* Import / restore: shows what the source holds BEFORE anything is replaced. */}
      <ConfirmDialog
        open={(pending?.kind === "file" || pending?.kind === "snapshot") && !!replaceSource}
        title={pending?.kind === "snapshot" ? "לשחזר מתמונת המצב?" : "לשחזר מקובץ הגיבוי?"}
        confirmLabel="שחזר והחלף"
        tone="destructive"
        // Replacing existing data with an EMPTY backup deletes it all: say a word first.
        typeToConfirm={
          replaceSource &&
          validCount(replaceSource.analysis) + invalidCount(replaceSource.analysis) === 0 &&
          entries.length + items.length > 0
            ? "מחק"
            : undefined
        }
        confirmDisabled={busy || (replaceSource ? invalidCount(replaceSource.analysis) > 0 : true)}
        extraAction={
          replaceSource &&
          invalidCount(replaceSource.analysis) > 0 &&
          validCount(replaceSource.analysis) > 0
            ? {
                label: `דלג על ${invalidCount(replaceSource.analysis)} רשומות לא תקינות והחלף`,
                onClick: () => {
                  void applyReplacement(replaceSource, true);
                  setPending(null);
                },
              }
            : undefined
        }
        onCancel={() => setPending(null)}
        onConfirm={() => {
          if (replaceSource) void applyReplacement(replaceSource, false);
          setPending(null);
        }}
      >
        {replaceSource && (
          <ReplacePreview
            source={replaceSource}
            currentSeder={entries.length}
            currentLearning={items.length}
            currentRecords={{ seder: entries, learning: items }}
            retention={settings.data.backupRetention}
            snapshotLabel={restoreTarget ? formatTs(restoreTarget.ts) : undefined}
            restoreExtras={restoreExtras}
            onToggleExtras={setRestoreExtras}
          />
        )}
      </ConfirmDialog>

      <ConfirmDialog
        open={pending?.kind === "delete-data"}
        title="למחוק את כל הנתונים?"
        confirmLabel="מחק את כל הנתונים"
        tone="destructive"
        typeToConfirm="מחק"
        onCancel={() => setPending(null)}
        onConfirm={() => {
          void doDelete();
          setPending(null);
        }}
      >
        <p>
          יימחקו {entries.length} רישומי סדרים ו־{items.length} רישומי לימוד. תמונת מצב תיווצר מיד
          לפני המחיקה ותאפשר לשחזר — כל עוד לא תמחק גם אותה.
        </p>
      </ConfirmDialog>

      <ConfirmDialog
        open={pending?.kind === "delete-snapshots"}
        title="למחוק את כל תמונות המצב?"
        confirmLabel="מחק תמונות מצב"
        tone="destructive"
        onCancel={() => setPending(null)}
        onConfirm={() => {
          clearAllSnapshots();
          toast("תמונות המצב נמחקו");
          setPending(null);
        }}
      >
        <p>
          יימחקו {snapshots.length} עותקים פנימיים. הנתונים עצמם לא ייפגעו, אבל לא תהיה אפשרות לחזור
          אחורה מהם.
        </p>
      </ConfirmDialog>
    </div>
  );
}
