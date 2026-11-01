// One record, opened from the calendar, the list or a search result.
//
// A dialog rather than a page: the screen behind keeps its month, filters and
// scroll position, and Escape or the close button puts the user back exactly
// where they were. Radix handles focus (trapped inside, returned to the
// control that opened it). Height is capped and the body scrolls.
import { useEffect, useRef, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { StatusMark } from "@/components/ui/ledger";
import { NumberField, SelectField, TimeField, Toggle } from "@/components/ui/form";
import {
  calcSeder,
  effectiveLearningMin,
  FRAMEWORK_LABELS,
  useLearning,
  useSeder,
  validateLearning,
  type LearningEntry,
  type LearningFramework,
  type SederEntry,
} from "@/lib/kollel-store";
import { formatHebrewDate } from "@/lib/hebrew-calendar";
import { attendanceBlockedMessage } from "@/lib/attendance-day";
import {
  hoursState,
  needsAttention,
  parseLocalDate,
  sederStatusWords,
  WEEKDAYS_HE,
  type EntryKind,
} from "@/lib/journal";
import { runSave } from "@/lib/journal-save";
import { toastUndo } from "@/lib/undo";

export type DrawerTarget = { kind: EntryKind; id: string };

export function EntryDrawer({
  target,
  onClose,
}: {
  target: DrawerTarget | null;
  onClose: () => void;
}) {
  const { entries } = useSeder();
  const { items } = useLearning();
  const seder = target?.kind === "seder" ? entries.find((e) => e.id === target.id) : undefined;
  const lesson = target?.kind === "learning" ? items.find((l) => l.id === target.id) : undefined;
  const open = !!(seder || lesson);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[88vh] max-w-md overflow-y-auto">
        {seder && <SederBody key={seder.id} entry={seder} onClose={onClose} />}
        {lesson && <LearningBody key={lesson.id} entry={lesson} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function dateLine(date: string) {
  const d = parseLocalDate(date);
  return `${WEEKDAYS_HE[d.getDay()]} · ${formatHebrewDate(d)}`;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="figure text-end font-medium">{children}</dd>
    </div>
  );
}

/** The day, set large: the date is the anchor of the record. */
function Heading({ eyebrow, date }: { eyebrow: string; date: string }) {
  return (
    <DialogHeader>
      <div className="eyebrow">{eyebrow}</div>
      <DialogTitle className="figure text-2xl" dir="ltr" style={{ textAlign: "start" }}>
        {date}
      </DialogTitle>
      <DialogDescription>{dateLine(date)}</DialogDescription>
    </DialogHeader>
  );
}

function ActionBar({
  editing,
  onEdit,
  onDelete,
  deleteLabel,
}: {
  editing: boolean;
  onEdit: () => void;
  onDelete: () => void;
  deleteLabel: string;
}) {
  if (editing) return null;
  return (
    <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
      <Button type="button" size="sm" onClick={onEdit}>
        <Pencil aria-hidden="true" /> עריכה
      </Button>
      {/* Deleting is the quiet option: plain text, muted, and undoable. */}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onDelete}
        aria-label={deleteLabel}
        className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
      >
        <Trash2 aria-hidden="true" /> מחיקה
      </Button>
    </div>
  );
}

function FormButtons({
  onCancel,
  busy = false,
  saveDisabled = false,
}: {
  onCancel: () => void;
  busy?: boolean;
  /** Saving is not possible as the form stands (the reason is shown in the form). */
  saveDisabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 border-t border-border pt-3">
      <Button type="submit" size="sm" disabled={busy || saveDisabled}>
        {busy ? "שומר..." : "שמירה"}
      </Button>
      <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={busy}>
        ביטול
      </Button>
    </div>
  );
}

/** Moves focus to the first field when a form opens inside the dialog. */
function useFocusFirstField() {
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>("input:not([disabled]), select, textarea")?.focus();
  }, []);
  return ref;
}

// ---------------------------------------------------------------- seder

function SederBody({ entry, onClose }: { entry: SederEntry; onClose: () => void }) {
  const { entries, upsertChecked, removeChecked } = useSeder();
  const [editing, setEditing] = useState(false);
  const label = entry.seder === 1 ? "א׳" : "ב׳";

  return (
    <>
      <Heading eyebrow={`סדר ${label}`} date={entry.date} />

      {editing ? (
        <SederForm
          entry={entry}
          onCancel={() => setEditing(false)}
          onSave={async (next) => {
            // upsert only matches on id, so moving a record onto a day and
            // seder that already has one would count that seder twice.
            if (
              entries.some(
                (x) => x.id !== next.id && x.date === next.date && x.seder === next.seder,
              )
            ) {
              return `כבר קיים רישום לסדר ${next.seder === 1 ? "א׳" : "ב׳"} בתאריך ${next.date}`;
            }
            // Success and closing the form only once the write reached storage.
            const error = await runSave(() => upsertChecked(next));
            if (error) return error;
            toast.success("הרישום עודכן");
            setEditing(false);
            return null;
          }}
        />
      ) : (
        <SederView entry={entry} />
      )}

      <ActionBar
        editing={editing}
        onEdit={() => setEditing(true)}
        deleteLabel={`מחיקת רישום סדר ${label} מ-${entry.date}`}
        onDelete={async () => {
          const error = await runSave(
            () => removeChecked(entry.id),
            "המחיקה לא נשמרה — הרישום נשאר",
          );
          if (error) {
            toast.error(error);
            return;
          }
          toastUndo(`הרישום מ-${entry.date} נמחק`, () => upsertChecked(entry, { restore: true }));
          onClose();
        }}
      />
    </>
  );
}

function SederView({ entry }: { entry: SederEntry }) {
  const c = calcSeder(entry);
  const status = sederStatusWords(entry, c);
  const incomplete = hoursState(entry) === "no-hours" || hoursState(entry) === "no-arrival";
  const attention = needsAttention(entry, c);

  return (
    <div className="space-y-4">
      <dl className="ledger border-y border-border">
        <Row label="סטטוס">
          {attention ? (
            <StatusMark tone={entry.absent ? "absent" : "late"}>{status.join(" · ")}</StatusMark>
          ) : (
            <span className="text-muted-foreground">{status.join(" · ")}</span>
          )}
        </Row>
        <Row label="שעות">
          {entry.absent ? (
            "—"
          ) : (
            <span dir="ltr">
              {entry.arrival || "—"} – {entry.departure || "—"}
            </span>
          )}
        </Row>
        <Row label="אורך הסדר">{c.sederLengthMin} דק׳</Row>
        <Row label="חסר נטו">
          <span className="text-lg font-bold">{c.netMissingMin}</span> דק׳
        </Row>
      </dl>
      {incomplete && (
        <p className="text-sm text-muted-foreground">
          רישום לא שלם: לא נרשמו שעות, ולכן החישוב מונה את כל הסדר כחסר. אפשר להשלים בעריכה.
        </p>
      )}

      <section aria-labelledby="calc-meaning">
        <h3 id="calc-meaning" className="eyebrow mb-1.5">
          איך זה חושב
        </h3>
        <ul className="space-y-1 text-sm text-muted-foreground">
          <li>
            חסר בפועל: <b className="tabular-nums text-foreground">{c.missingMin}</b> דק׳
            {c.isLate && " (כולל איחור)"}
            {c.isEarlyDeparture && " (כולל יציאה מוקדמת)"}
          </li>
          {c.excusedMin > 0 && (
            <li>
              מתוכן מוצדק: <b className="tabular-nums text-foreground">{c.excusedMin}</b> דק׳
              {entry.excusedReason && ` — ${entry.excusedReason}`}
            </li>
          )}
          {entry.manualAdjustMin !== 0 && (
            <li>
              התאמה ידנית:{" "}
              <b className="tabular-nums text-foreground" dir="ltr">
                {entry.manualAdjustMin > 0 ? "+" : ""}
                {entry.manualAdjustMin}
              </b>{" "}
              דק׳
            </li>
          )}
          {c.bonusMin > 0 && (
            <li>
              בונוס הגעה מוקדמת: <b className="tabular-nums text-foreground">{c.bonusMin}</b> דק׳
              מקוזזות
            </li>
          )}
          {entry.ohevei && !c.isOhevei && (
            <li>סומן אוהבי ה׳, אך התנאים אינם מתקיימים ולכן לא נספר.</li>
          )}
          <li>
            חסר נטו לרישום: <b className="tabular-nums text-foreground">{c.netMissingMin}</b> דק׳
          </li>
        </ul>
      </section>

      {(entry.note || entry.tags?.length > 0) && (
        <section aria-label="הערות ותגיות" className="space-y-1.5 text-sm">
          {entry.note && <p className="whitespace-pre-wrap">{entry.note}</p>}
          {entry.tags?.length > 0 && (
            <p className="text-muted-foreground">תגיות: {entry.tags.join(", ")}</p>
          )}
        </section>
      )}
    </div>
  );
}

function SederForm({
  entry,
  onSave,
  onCancel,
}: {
  entry: SederEntry;
  /** Resolves to an error message, or null once the record is really saved. */
  onSave: (next: SederEntry) => Promise<string | null>;
  onCancel: () => void;
}) {
  const [date, setDate] = useState(entry.date);
  const [seder, setSeder] = useState<"1" | "2">(String(entry.seder) as "1" | "2");
  const [arrival, setArrival] = useState(entry.arrival || "");
  const [departure, setDeparture] = useState(entry.departure || "");
  const [absent, setAbsent] = useState(entry.absent);
  const [ohevei, setOhevei] = useState(entry.ohevei);
  const [excusedAll, setExcusedAll] = useState(entry.excusedAll);
  const [excusedMinutes, setExcusedMinutes] = useState(entry.excusedMinutes);
  const [reason, setReason] = useState(entry.excusedReason || "");
  const [adjust, setAdjust] = useState(entry.manualAdjustMin);
  const [tags, setTags] = useState((entry.tags || []).join(", "));
  const [note, setNote] = useState(entry.note || "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const next: SederEntry = {
    ...entry,
    date,
    seder: seder === "1" ? 1 : 2,
    arrival: absent ? undefined : arrival || undefined,
    departure: absent ? undefined : departure || undefined,
    absent,
    ohevei: absent ? false : ohevei,
    excusedAll,
    excusedMinutes,
    excusedReason: reason || undefined,
    manualAdjustMin: adjust,
    tags: tags
      .split(/[,،]/)
      .map((t) => t.trim())
      .filter(Boolean),
    note: note || undefined,
  };
  const preview = calcSeder(next);
  const formRef = useFocusFirstField();
  // Moving a record onto a day that takes no attendance is refused up front. A
  // record already on such a day can still be edited as long as its date stays.
  const blockedMessage = date !== entry.date ? attendanceBlockedMessage(date) : null;

  return (
    <form
      ref={formRef}
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (blockedMessage || busy) return;
        setBusy(true);
        setError(null);
        void onSave(next).then((err) => {
          setBusy(false);
          if (err) setError(err);
        });
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-sm text-muted-foreground">תאריך</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            aria-invalid={!!blockedMessage}
            aria-describedby={blockedMessage ? "drawer-date-blocked" : undefined}
            className="field-input mt-1 w-full tabular-nums"
          />
        </label>
        <div className="block">
          <label className="text-sm text-muted-foreground" htmlFor="drawer-seder">
            סדר
          </label>
          <select
            id="drawer-seder"
            value={seder}
            onChange={(e) => setSeder(e.target.value as "1" | "2")}
            className="field-input mt-1 w-full"
          >
            <option value="1">סדר א׳</option>
            <option value="2">סדר ב׳</option>
          </select>
        </div>
      </div>

      {blockedMessage && (
        <p
          id="drawer-date-blocked"
          role="status"
          className="border-s-4 border-warning bg-secondary/60 px-3 py-2 text-sm"
        >
          {blockedMessage} בחרו תאריך אחר כדי לשמור.
        </p>
      )}

      <Toggle label="היעדרות (לא הגעתי לסדר)" on={absent} onChange={setAbsent} />
      <div className="grid grid-cols-2 gap-3" dir="ltr">
        <TimeField label="הגעה" value={arrival} onChange={setArrival} disabled={absent} />
        <TimeField label="יציאה" value={departure} onChange={setDeparture} disabled={absent} />
      </div>
      {!absent && <Toggle label="אוהבי ה׳" on={ohevei} onChange={setOhevei} />}

      <Toggle label="כל החסר מוצדק" on={excusedAll} onChange={setExcusedAll} />
      {!excusedAll && (
        <NumberField
          label="דקות מוצדקות"
          value={excusedMinutes}
          min={0}
          max={1440}
          onChange={setExcusedMinutes}
        />
      )}
      <div className="grid grid-cols-3 items-center gap-3">
        <label htmlFor="drawer-reason" className="text-sm text-muted-foreground">
          סיבה
        </label>
        <input
          id="drawer-reason"
          value={reason}
          maxLength={120}
          onChange={(e) => setReason(e.target.value)}
          className="field-input col-span-2 w-full"
        />
      </div>
      <NumberField
        label="התאמה ידנית (דק׳, ± )"
        value={adjust}
        min={-1440}
        max={1440}
        onChange={setAdjust}
      />

      <div className="grid grid-cols-3 items-center gap-3">
        <label htmlFor="drawer-tags" className="text-sm text-muted-foreground">
          תגיות
        </label>
        <input
          id="drawer-tags"
          value={tags}
          placeholder="מופרדות בפסיק"
          onChange={(e) => setTags(e.target.value)}
          className="field-input col-span-2 w-full"
        />
      </div>
      <label className="block">
        <span className="text-sm text-muted-foreground">הערה</span>
        <textarea
          value={note}
          maxLength={500}
          rows={2}
          onChange={(e) => setNote(e.target.value)}
          className="field-input mt-1 w-full"
        />
      </label>

      <p className="rounded-md bg-muted/50 px-3 py-2 text-sm" aria-live="polite">
        בחישוב הנוכחי: חסר נטו <b className="tabular-nums">{preview.netMissingMin}</b> דק׳
        {preview.bonusMin > 0 && <> · בונוס {preview.bonusMin}</>}
      </p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <FormButtons onCancel={onCancel} busy={busy} saveDisabled={!!blockedMessage} />
    </form>
  );
}

// ------------------------------------------------------------- learning

const FRAMEWORK_OPTIONS = (Object.keys(FRAMEWORK_LABELS) as LearningFramework[]).map((k) => ({
  v: k,
  l: FRAMEWORK_LABELS[k],
}));

function LearningBody({ entry, onClose }: { entry: LearningEntry; onClose: () => void }) {
  const { addChecked, replace: replaceEntry, removeChecked } = useLearning();
  const [editing, setEditing] = useState(false);

  // One in-place swap (same id, one save, no intermediate delete). The form
  // closes and the success toast shows only after the save has really
  // succeeded; a failed save leaves the form open with its values and a message
  // (the store has already put the previous record back).
  const replace = async (next: LearningEntry): Promise<string | null> => {
    const error = await runSave(() => replaceEntry(next));
    if (error) return error;
    toast.success("הרישום עודכן");
    setEditing(false);
    return null;
  };

  return (
    <>
      <Heading eyebrow={FRAMEWORK_LABELS[entry.framework]} date={entry.date} />

      {editing ? (
        <LearningForm entry={entry} onSave={replace} onCancel={() => setEditing(false)} />
      ) : (
        <div className="space-y-4">
          <dl className="ledger border-y border-border">
            <Row label="מסגרת">{FRAMEWORK_LABELS[entry.framework]}</Row>
            <Row label="משך">{entry.minutes} דק׳</Row>
            <Row label="נחשב בסיכומים">{effectiveLearningMin(entry)} דק׳</Row>
            <Row label="מקור">
              {entry.source === "timer" ? "טיימר" : entry.source === "range" ? "טווח שעות" : "ידני"}
            </Row>
          </dl>
          {entry.tanitDibur && (
            <p className="text-sm text-muted-foreground">
              סומן כלימוד בבית בתענית דיבור, ולכן כל דקה נספרת פעמיים.
            </p>
          )}
          {entry.note && <p className="whitespace-pre-wrap text-sm">{entry.note}</p>}
        </div>
      )}

      <ActionBar
        editing={editing}
        onEdit={() => setEditing(true)}
        deleteLabel={`מחיקת רישום לימוד מ-${entry.date}`}
        onDelete={async () => {
          const error = await runSave(
            () => removeChecked(entry.id),
            "המחיקה לא נשמרה — הרישום נשאר",
          );
          if (error) {
            toast.error(error);
            return;
          }
          toastUndo("רישום הלימוד נמחק", () => addChecked(entry));
          onClose();
        }}
      />
    </>
  );
}

function LearningForm({
  entry,
  onSave,
  onCancel,
}: {
  entry: LearningEntry;
  /** Resolves to an error message, or null once the record is really saved. */
  onSave: (next: LearningEntry) => Promise<string | null>;
  onCancel: () => void;
}) {
  const [framework, setFramework] = useState<LearningFramework>(entry.framework);
  const [date, setDate] = useState(entry.date);
  const [minutes, setMinutes] = useState(entry.minutes);
  const [tanit, setTanit] = useState(!!entry.tanitDibur);
  const [note, setNote] = useState(entry.note || "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const formRef = useFocusFirstField();

  const next: LearningEntry = {
    ...entry,
    framework,
    date,
    minutes,
    tanitDibur: framework === "kollel-erev" && tanit ? true : undefined,
    note: note || undefined,
  };

  return (
    <form
      ref={formRef}
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (busy) return;
        setBusy(true);
        setError(null);
        void onSave(next).then((err) => {
          setBusy(false);
          if (err) setError(err);
        });
      }}
    >
      <SelectField
        label="מסגרת"
        value={framework}
        options={FRAMEWORK_OPTIONS}
        onChange={(v) => setFramework(v as LearningFramework)}
      />
      <label className="block">
        <span className="text-sm text-muted-foreground">תאריך</span>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="field-input mt-1 w-full tabular-nums"
        />
      </label>
      <NumberField label="משך (דק׳)" value={minutes} min={1} max={1440} onChange={setMinutes} />
      {framework === "kollel-erev" && (
        <Toggle label="לימוד בבית בתענית דיבור (נספר כפול)" on={tanit} onChange={setTanit} />
      )}
      <label className="block">
        <span className="text-sm text-muted-foreground">הערה</span>
        <textarea
          value={note}
          maxLength={500}
          rows={2}
          onChange={(e) => setNote(e.target.value)}
          className="field-input mt-1 w-full"
        />
      </label>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <FormButtons onCancel={onCancel} busy={busy} />
    </form>
  );
}
