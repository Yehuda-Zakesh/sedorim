import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Save, AlertTriangle, Check, X, FileText, ChevronDown, Pencil } from "lucide-react";
import {
  useSeder,
  todayISO,
  calcSeder,
  newId,
  type SederEntry,
  type SederNum,
} from "@/lib/kollel-store";
import { useSettings, getSederTimesFor } from "@/lib/settings-store";
import { formatHebrewDate, fastDayName, hasNoSederB, isLearningDay } from "@/lib/hebrew-calendar";
import { StackedField } from "@/components/ui/form";
import { attendanceBlockedMessage } from "@/lib/attendance-day";
import { finalNumber } from "@/lib/number-input";
import {
  editStateFromForm,
  errorMessage,
  fmtDur,
  notableWords,
  parseAttendanceSearch,
  parseLocalISO,
  reconcileForm,
  recordState,
  saveStatusLabel,
  sederName,
  statusWords,
  type AttendanceFocus,
  type SaveState,
} from "@/components/today-utils";
import { Button } from "@/components/ui/button";
import { LedgerRow, Notice, StatusMark, type MarkTone } from "@/components/ui/ledger";
import { toastUndo } from "@/lib/undo";
import { toast } from "sonner";
import { CONFLICT_SAVE_TEXT } from "@/lib/save-conflicts";

export const Route = createFileRoute("/attendance")({
  head: () => ({ meta: [{ title: "רישום נוכחות — המעקב שלי" }] }),
  // Links from the today screen land straight on the field they mean:
  // ?seder=1|2&focus=arrival|departure|edit (and optionally &date=YYYY-MM-DD).
  validateSearch: (raw: Record<string, unknown>) => parseAttendanceSearch(raw),
  component: AttendancePage,
});

type SederFormState = {
  arrival: string;
  departure: string;
  absent: boolean;
  ohevei: boolean;
  excusedAll: boolean;
  excusedMinutes: number;
  excusedReason: string;
  manualAdjustMin: number;
  note: string;
};

function defaultsFor(seder: SederNum, date: string): SederFormState {
  const t = getSederTimesFor(date);
  return {
    arrival: seder === 1 ? t.s1Start : t.s2Start,
    departure: seder === 1 ? t.s1End : t.s2End,
    absent: false,
    ohevei: false,
    excusedAll: false,
    excusedMinutes: 0,
    excusedReason: "",
    manualAdjustMin: 0,
    note: "",
  };
}

function fromEntry(e: SederEntry): SederFormState {
  return {
    arrival: e.arrival || "",
    departure: e.departure || "",
    absent: e.absent,
    ohevei: e.ohevei,
    excusedAll: e.excusedAll,
    excusedMinutes: e.excusedMinutes,
    excusedReason: e.excusedReason || "",
    manualAdjustMin: e.manualAdjustMin,
    note: e.note || "",
  };
}

/**
 * A number box that lets the user clear it and type a new value: the text is
 * kept as typed while focused, the clamped number is what the form holds.
 */
function MinutesInput({
  value,
  min,
  max,
  onChange,
  onEnter,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  onEnter?: () => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      value={draft ?? value}
      onChange={(e) => {
        setDraft(e.target.value);
        onChange(finalNumber(e.target.value, min, max));
      }}
      onBlur={() => setDraft(null)}
      onKeyDown={(e) => {
        if (e.key === "Enter") onEnter?.();
      }}
      className="field-input w-full tabular-nums"
    />
  );
}

function ToggleButton({
  pressed,
  onClick,
  disabled,
  tone,
  icon: Icon,
  children,
}: {
  pressed: boolean;
  onClick: () => void;
  disabled?: boolean;
  tone: string;
  icon: typeof Check;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={pressed}
      disabled={disabled}
      className={`pressable inline-flex items-center justify-center gap-1.5 rounded-md border-2 px-3 py-2 text-sm font-medium transition disabled:opacity-50 ${
        pressed ? tone : "border-border hover:border-foreground/30"
      }`}
    >
      {pressed ? (
        <Icon className="size-3.5" aria-hidden="true" />
      ) : (
        <span className="size-3.5 rounded-sm border border-current opacity-50" aria-hidden="true" />
      )}
      {children}
    </button>
  );
}

function SederCard({
  num,
  date,
  existing,
  focus,
}: {
  num: SederNum;
  date: string;
  existing?: SederEntry;
  /** Open the form and put the cursor on this field (from a link on the today screen). */
  focus?: AttendanceFocus;
}) {
  const { upsertChecked, removeChecked } = useSeder();
  const [save, setSave] = useState<SaveState>({ kind: "idle" });
  const saving = save.kind === "saving";
  // Held through a failed save's rollback, so the form keeps what was typed.
  const savingRef = useRef(false);
  const arrivalRef = useRef<HTMLInputElement>(null);
  const departureRef = useRef<HTMLInputElement>(null);
  const [focusReq, setFocusReq] = useState(focus);
  useSettings();
  const dayDate = parseLocalISO(date);
  const fastName = fastDayName(dayDate);
  const skipSederB = num === 2 && hasNoSederB(dayDate);
  const initial = () => (existing ? fromEntry(existing) : defaultsFor(num, date));
  const [form, setForm] = useState<SederFormState>(initial);
  // What the form was loaded from: tells a clean form from one with a draft.
  const [base, setBase] = useState<SederFormState>(initial);
  // A saved seder is shown as a compact summary; "עריכה" opens the form again.
  const [editing, setEditing] = useState(!existing || !!focus);
  const [excuseOpen, setExcuseOpen] = useState(() => editStateFromForm(initial()).excuseOpen);
  const [extrasOpen, setExtrasOpen] = useState(() => editStateFromForm(initial()).extrasOpen);
  // A newer stored version of this record that arrived while the user had a draft.
  const [conflict, setConflict] = useState<SederFormState | null>(null);
  const slot = `${num}|${date}`;
  const sig = existing ? JSON.stringify(existing) : "";
  const [seen, setSeen] = useState({ slot, sig, had: !!existing });

  /** Puts the whole editing state — fields and the sections they open — back to a record's. */
  const loadForm = (f: SederFormState, isEditing: boolean) => {
    const st = editStateFromForm(f);
    setForm(f);
    setBase(f);
    setConflict(null);
    setEditing(isEditing);
    setExcuseOpen(st.excuseOpen);
    setExtrasOpen(st.extrasOpen);
  };

  // The day or seder changed, or the stored record changed under the form
  // (same id, e.g. saved from another window). Adjusting state while rendering
  // is the documented way to follow a prop without a flash of stale values.
  if (seen.slot !== slot || seen.sig !== sig) {
    setSeen({ slot, sig, had: !!existing });
    if (seen.slot !== slot) setSave({ kind: "idle" });
    const incoming = existing ? fromEntry(existing) : defaultsFor(num, date);
    if (seen.slot === slot && savingRef.current) {
      // Our own write is moving the stored record (and may roll it back): the form stays as typed.
    } else if (seen.slot !== slot || !existing) {
      loadForm(incoming, !existing);
    } else {
      const verdict = reconcileForm(form, base, incoming);
      if (verdict === "sync") loadForm(incoming, seen.had ? editing : false);
      else if (verdict === "same") {
        setBase(incoming);
        setConflict(null);
        if (!seen.had) setEditing(false);
      } else setConflict(incoming);
    }
  }

  const preview: SederEntry = {
    id: existing?.id || newId(),
    date,
    seder: num,
    arrival: form.absent ? undefined : form.arrival || undefined,
    departure: form.absent ? undefined : form.departure || undefined,
    absent: form.absent,
    ohevei: form.ohevei,
    excusedAll: form.excusedAll,
    excusedMinutes: form.excusedMinutes,
    excusedReason: form.excusedReason || undefined,
    manualAdjustMin: form.manualAdjustMin,
    tags: existing?.tags || [],
    note: form.note || undefined,
  };
  const calc = calcSeder(preview);
  const name = sederName(num);

  // A new record on a blocked day is never offered; a record that already sits
  // there stays editable in place (its date is not changed here).
  const blockedMessage = existing ? null : attendanceBlockedMessage(date);

  const submit = async () => {
    if (savingRef.current) return;
    if (blockedMessage) {
      setSave({ kind: "failed", message: blockedMessage });
      toast.error(blockedMessage);
      return;
    }
    savingRef.current = true;
    setSave({ kind: "saving" });
    try {
      const outcome = await upsertChecked(preview);
      if (!outcome.complete) {
        setSave({ kind: "failed", message: CONFLICT_SAVE_TEXT });
        toast.warning(CONFLICT_SAVE_TEXT);
        return;
      }
      toast.success(`${name} נשמר`);
      setBase(form);
      setConflict(null);
      setEditing(false);
      setSave({ kind: "idle" });
    } catch (e) {
      setSave({ kind: "failed", message: errorMessage(e) });
      toast.error(`שמירת ${name} נכשלה: ${errorMessage(e)}`);
    } finally {
      savingRef.current = false;
    }
  };

  const times = getSederTimesFor(date);
  const startStr = num === 1 ? times.s1Start : times.s2Start;
  const endStr = num === 1 ? times.s1End : times.s2End;

  /**
   * Ticking אוהבי ה׳ when the hours don't support it should say so. The next
   * state is asked directly, not read from this render's (stale) closure.
   */
  const toggleOhevei = () => {
    const next = !form.ohevei;
    setForm({ ...form, ohevei: next });
    if (next && !calcSeder({ ...preview, ohevei: true }).isOhevei) {
      toast.warning("לא ניתן לסמן אוהבי ה׳ — הסדר לא נכח מתחילתו ועד סופו");
    }
  };

  const toggleExcuse = () => {
    if (excuseOpen) {
      // Turning "מוצדק" off clears what it held — that is what off means.
      setForm({ ...form, excusedAll: false, excusedMinutes: 0, excusedReason: "" });
    }
    setExcuseOpen(!excuseOpen);
  };

  const remove_ = async () => {
    if (!existing || savingRef.current) return;
    savingRef.current = true;
    setSave({ kind: "saving" });
    try {
      const outcome = await removeChecked(existing.id);
      if (!outcome.complete) {
        setSave({ kind: "failed", message: CONFLICT_SAVE_TEXT });
        toast.warning(CONFLICT_SAVE_TEXT);
        return;
      }
      // The record is gone: the form goes back to a blank one for this day and
      // seder, not left holding the deleted record's values to be saved anew.
      loadForm(defaultsFor(num, date), true);
      setSave({ kind: "idle" });
      toastUndo("הרישום נמחק", () => upsertChecked(existing, { restore: true }));
    } catch (e) {
      setSave({ kind: "failed", message: errorMessage(e) });
      toast.error(`המחיקה נכשלה: ${errorMessage(e)}`);
    } finally {
      savingRef.current = false;
    }
  };

  // Land on the field a link asked for, once the form is on screen.
  useEffect(() => {
    if (!focusReq || !editing) return;
    (focusReq === "departure" ? departureRef : arrivalRef).current?.focus();
    setFocusReq(undefined);
  }, [focusReq, editing]);

  const hours = (
    <span className="text-sm font-normal text-muted-foreground">
      <bdi dir="ltr" className="figure">
        {startStr}–{endStr}
      </bdi>
    </span>
  );

  // ---- compact summary of a saved seder ----
  if (existing && !editing) {
    const c = calcSeder(existing);
    const state = recordState(existing);
    const tone: MarkTone =
      state === "absent"
        ? "absent"
        : state === "incomplete"
          ? "late"
          : state === "arrived"
            ? "excused"
            : c.isLate || c.isEarlyDeparture
              ? "late"
              : "present";
    return (
      <section aria-label={name} className="flex flex-col gap-3">
        <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 className="text-lg font-semibold">
            {name} {hours}
          </h2>
          <StatusMark tone={tone}>{notableWords(existing, c).join(" · ") || "נרשם"}</StatusMark>
        </header>
        <p className="text-base">
          {existing.absent ? (
            "היעדרות נרשמה"
          ) : (
            <>
              הגעה{" "}
              <bdi dir="ltr" className="figure">
                {existing.arrival ?? "—"}
              </bdi>{" "}
              · יציאה{" "}
              <bdi dir="ltr" className="figure">
                {existing.departure ?? "—"}
              </bdi>
            </>
          )}
        </p>
        <div className="ledger">
          <LedgerRow label="חסר">{fmtDur(c.missingMin)}</LedgerRow>
          <LedgerRow label="בונוס">{fmtDur(c.bonusMin)}</LedgerRow>
          <LedgerRow label="מוצדק">{fmtDur(c.excusedMin)}</LedgerRow>
          <LedgerRow label="נטו" strong>
            {fmtDur(c.netMissingMin)}
          </LedgerRow>
        </div>
        {existing.note && <p className="text-sm text-muted-foreground">הערה: {existing.note}</p>}
        <div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label={`עריכת ${name}`}
            onClick={() => loadForm(fromEntry(existing), true)}
          >
            <Pencil aria-hidden="true" /> עריכה
          </Button>
        </div>
      </section>
    );
  }

  // The page explains once, above the cards; the empty slot just stays out of the way.
  if (blockedMessage) return null;

  return (
    <form
      className="card-surface p-5 flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      aria-label={`רישום ${name}`}
    >
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <h2 className="text-lg font-semibold">
          {name} {hours}
        </h2>
        <span
          className={`text-sm ${save.kind === "failed" ? "text-status-absent-fg" : "text-muted-foreground"}`}
          role={save.kind === "failed" ? "alert" : "status"}
        >
          {save.kind === "idle"
            ? existing
              ? "עריכת רישום קיים"
              : "רישום חדש — טרם נשמר"
            : saveStatusLabel(save, true)}
        </span>
      </header>

      <fieldset disabled={saving} className="flex min-w-0 flex-col gap-4 border-0 p-0">
        {conflict && (
          <Notice
            tone="warning"
            title="הרישום הזה עודכן בחלון אחר"
            action={
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" onClick={() => loadForm(conflict, true)}>
                  טען את העדכני
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setConflict(null)}>
                  המשך עם שלי
                </Button>
              </div>
            }
          >
            יש לך שינויים שלא נשמרו. טעינת העדכני תבטל אותם; המשך יחליף את הגרסה השמורה בשלך.
          </Notice>
        )}

        {skipSederB && (
          <Notice tone="warning" title={`היום ${fastName} — אין סדר ב׳`}>
            אין צורך לרשום נוכחות לסדר ב׳ ביום זה.
          </Notice>
        )}

        <div className="grid grid-cols-2 gap-3">
          <StackedField label="שעת הגעה">
            <input
              type="time"
              dir="ltr"
              disabled={form.absent}
              ref={arrivalRef}
              value={form.arrival}
              onChange={(e) => setForm({ ...form, arrival: e.target.value })}
              className="field-input figure w-full"
            />
          </StackedField>
          <StackedField label="שעת יציאה">
            <input
              type="time"
              dir="ltr"
              disabled={form.absent}
              ref={departureRef}
              value={form.departure}
              onChange={(e) => setForm({ ...form, departure: e.target.value })}
              className="field-input figure w-full"
            />
          </StackedField>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <ToggleButton
            pressed={form.absent}
            onClick={() => setForm({ ...form, absent: !form.absent, ohevei: false })}
            tone="bg-status-absent/15 border-status-absent text-status-absent-fg"
            icon={X}
          >
            היעדרות
          </ToggleButton>
          <ToggleButton
            pressed={excuseOpen}
            onClick={toggleExcuse}
            tone="bg-status-excused/15 border-status-excused text-status-excused-fg"
            icon={FileText}
          >
            מוצדק
          </ToggleButton>
          <ToggleButton
            pressed={form.ohevei}
            onClick={toggleOhevei}
            disabled={form.absent}
            tone="bg-status-present/15 border-status-present text-status-present-fg"
            icon={Check}
          >
            אוהבי ה׳
          </ToggleButton>
        </div>

        {excuseOpen && (
          <fieldset className="rounded-md border border-border p-3">
            <legend className="px-1 text-sm text-muted-foreground">פרטי המוצדק</legend>
            <div className="flex gap-2 mb-3" role="group" aria-label="היקף המוצדק">
              <button
                type="button"
                aria-pressed={form.excusedAll}
                onClick={() => setForm({ ...form, excusedAll: true })}
                className={`pressable rounded-md border-2 px-3 py-1.5 text-sm font-medium ${form.excusedAll ? "border-status-excused bg-status-excused/15 text-status-excused-fg" : "border-border"}`}
              >
                כל החסר מוצדק
              </button>
              <button
                type="button"
                aria-pressed={!form.excusedAll}
                onClick={() => setForm({ ...form, excusedAll: false })}
                className={`pressable rounded-md border-2 px-3 py-1.5 text-sm font-medium ${!form.excusedAll ? "border-status-excused bg-status-excused/15 text-status-excused-fg" : "border-border"}`}
              >
                חלק מהחסר
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {!form.excusedAll && (
                <StackedField label="דקות מוצדקות (חלקי)">
                  <MinutesInput
                    value={form.excusedMinutes}
                    min={0}
                    max={1440}
                    onChange={(v) => setForm((f) => ({ ...f, excusedMinutes: v }))}
                  />
                </StackedField>
              )}
              <StackedField label="סיבה (אופציונלי)">
                <input
                  value={form.excusedReason}
                  maxLength={100}
                  onChange={(e) => setForm({ ...form, excusedReason: e.target.value })}
                  className="field-input w-full"
                />
              </StackedField>
            </div>
          </fieldset>
        )}

        <div>
          <button
            type="button"
            onClick={() => setExtrasOpen(!extrasOpen)}
            aria-expanded={extrasOpen}
            className="pressable inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <ChevronDown
              className={`size-4 transition-transform ${extrasOpen ? "rotate-180" : ""}`}
              aria-hidden="true"
            />
            התאמה ידנית, הערה ופרטים נוספים
          </button>
          {extrasOpen && (
            <div className="mt-2 grid grid-cols-2 gap-3">
              <StackedField label="התאמה ידנית (דק׳, חתום)">
                <MinutesInput
                  value={form.manualAdjustMin}
                  min={-1440}
                  max={1440}
                  onChange={(v) => setForm((f) => ({ ...f, manualAdjustMin: v }))}
                />
              </StackedField>
              <StackedField label="הערה">
                <input
                  value={form.note}
                  maxLength={200}
                  onChange={(e) => setForm({ ...form, note: e.target.value })}
                  className="field-input w-full"
                />
              </StackedField>
            </div>
          )}
        </div>

        <div aria-live="polite">
          <div className="eyebrow mb-1">
            תוצאת החישוב — {existing ? "טרם נשמרו השינויים" : "טרם נשמר"} ·{" "}
            {statusWords(preview, calc).join(" · ")}
          </div>
          <div className="ledger">
            <LedgerRow label="חסר">{fmtDur(calc.missingMin)}</LedgerRow>
            <LedgerRow label="בונוס">{fmtDur(calc.bonusMin)}</LedgerRow>
            <LedgerRow label="מוצדק">{fmtDur(calc.excusedMin)}</LedgerRow>
            <LedgerRow label="נטו" strong>
              {fmtDur(calc.netMissingMin)}
            </LedgerRow>
          </div>
        </div>

        {form.ohevei && !calc.isOhevei && !form.absent && (
          <p className="text-sm text-warning-fg flex items-center gap-1.5">
            <AlertTriangle className="size-4 shrink-0" aria-hidden="true" /> אוהבי ה׳ לא יוחל — שעת
            ההגעה/יציאה לא תואמות את גבולות הסדר.
          </p>
        )}
      </fieldset>

      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
        <Button type="submit" disabled={saving}>
          <Save aria-hidden="true" /> {saving ? "שומר…" : existing ? "שמור שינויים" : "שמור רישום"}
        </Button>
        {existing && (
          <>
            <Button
              type="button"
              variant="ghost"
              disabled={saving}
              onClick={() => loadForm(fromEntry(existing), false)}
            >
              ביטול
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="ms-auto"
              aria-label={`מחיקת רישום ${name}`}
              disabled={saving}
              onClick={() => void remove_()}
            >
              מחיקה
            </Button>
          </>
        )}
      </div>
    </form>
  );
}

function AttendancePage() {
  const search = Route.useSearch();
  const [date, setDate] = useState(search.date ?? todayISO());
  const { entries } = useSeder();
  const dayEntries = entries.filter((e) => e.date === date);
  const e1 = dayEntries.find((x) => x.seder === 1);
  const e2 = dayEntries.find((x) => x.seder === 2);
  const dayDate = parseLocalISO(date);
  const validDate = !Number.isNaN(dayDate.getTime());
  const heDate = validDate ? formatHebrewDate(dayDate) : "";
  const fastName = validDate ? fastDayName(dayDate) : null;
  const notLearningDay = validDate && !isLearningDay(dayDate);
  const blockedMessage = validDate ? attendanceBlockedMessage(date) : null;

  return (
    <AppShell title="רישום נוכחות" subtitle={heDate}>
      <div className="stack-gap flex flex-col">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            תאריך הרישום
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="field-input"
            />
          </label>
          {notLearningDay && <StatusMark tone="none">יום שאינו יום לימוד</StatusMark>}
          {fastName && <StatusMark tone="excused">{fastName}</StatusMark>}
        </div>

        {blockedMessage && (
          <Notice tone="warning" title={blockedMessage}>
            {dayEntries.length > 0
              ? "הרישומים שכבר קיימים ביום הזה נשארים וניתנים לעריכה. לרישום חדש — בחרו תאריך אחר."
              : "לא ניתן לרשום נוכחות בתאריך הזה. בחרו תאריך אחר."}
          </Notice>
        )}

        {validDate ? (
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <SederCard
              num={1}
              date={date}
              existing={e1}
              focus={search.seder === 1 ? search.focus : undefined}
            />
            <SederCard
              num={2}
              date={date}
              existing={e2}
              focus={search.seder === 2 ? search.focus : undefined}
            />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">בחרו תאריך תקין כדי לרשום נוכחות.</p>
        )}
      </div>
    </AppShell>
  );
}
