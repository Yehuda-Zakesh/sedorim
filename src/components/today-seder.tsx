// One seder of today as a working column: its name and hours, where it stands,
// the hours recorded — or the field to record the arrival right here — and the
// one action that fits that state. Used by the home screen.
import { useRef, useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import {
  calcSeder,
  hhmmToMin,
  newId,
  useSeder,
  type SederEntry,
  type SederNum,
} from "@/lib/kollel-store";
import { getSederTimesFor } from "@/lib/settings-store";
import { arrivalEntry } from "@/lib/quick-entry";
import { attendanceBlockedMessage, attendanceBlockedReason } from "@/lib/attendance-day";
import { toastUndo } from "@/lib/undo";
import { toast } from "sonner";
import { CONFLICT_SAVE_TEXT } from "@/lib/save-conflicts";
import { todayISO } from "@/lib/today";
import { Button } from "@/components/ui/button";
import { LedgerRow, StatusMark, type MarkTone } from "@/components/ui/ledger";
import {
  attendanceSearch,
  draftBelongs,
  draftKey,
  errorMessage,
  fmtDur,
  focusFor,
  notableWords,
  nowHHMM,
  recordState,
  saveStatusLabel,
  sederName,
  type SaveState,
} from "./today-utils";

const Hours = ({ from, to }: { from: string; to: string }) => (
  <bdi dir="ltr" className="figure">
    {from}–{to}
  </bdi>
);

/** The card's draft: what was typed, tied to the date and seder it was typed for. */
type Draft = { key: string; txt: string | null; open: boolean; dropped: boolean };

export function TodaySeder({
  num,
  date,
  existing: stored,
  notApplicable,
  learningDay,
}: {
  num: SederNum;
  date: string;
  existing?: SederEntry;
  /** A fast day: there is no seder ב׳ and nothing is owed. */
  notApplicable?: string;
  learningDay: boolean;
}) {
  const { upsertChecked, removeChecked } = useSeder();
  const [save, setSave] = useState<SaveState>({ kind: "idle" });
  const saving = save.kind === "saving";
  // Until the write has reached storage the card stays a form: the summary row
  // appears only for what is really saved (and a failed save leaves the form).
  const existing = saving ? undefined : stored;
  const savingRef = useRef(false);
  const key = draftKey(date, num);
  // The draft (arrival typed, exceptional-entry form opened) belongs to one date
  // and seder. When the date rolls over it is dropped — never carried over into
  // the new day — and the card says so.
  const [draft, setDraft] = useState<Draft>({ key, txt: null, open: false, dropped: false });
  if (!draftBelongs(draft, key)) {
    setDraft({ key, txt: null, open: false, dropped: draft.txt !== null });
    setSave({ kind: "idle" });
  }
  const arrivalTxt = draft.txt;
  const open = draft.open;
  const t = getSederTimesFor(date);
  const start = num === 1 ? t.s1Start : t.s2Start;
  const end = num === 1 ? t.s1End : t.s2End;
  const arrivalValue = arrivalTxt ?? start;
  const name = sederName(num);
  const blockedReason = attendanceBlockedReason(date);

  // What both buttons save is exactly what the quick window saves: arrival as
  // given, departure at the end of the seder's hours. Undo removes it again.
  const renderToday = todayISO();
  const record = async (arrival: string) => {
    if (savingRef.current) return;
    const blockedNow = attendanceBlockedMessage(date === renderToday ? todayISO() : date);
    if (blockedNow) {
      setSave({ kind: "failed", message: blockedNow });
      toast.error(blockedNow);
      return;
    }
    if (!arrival) {
      setSave({ kind: "failed", message: "יש להזין שעת הגעה" });
      toast.error("יש להזין שעת הגעה");
      return;
    }
    // When showing "today", re-read the date at the click (the screen may have
    // stayed open past midnight); an explicit other date stays as given.
    const saveDate = date === renderToday ? todayISO() : date;
    const rolled = saveDate !== date;
    const times = rolled ? getSederTimesFor(saveDate) : t;
    let saved: SederEntry;
    try {
      const entry = arrivalEntry({
        date: saveDate,
        seder: num,
        time: arrival,
        ohevei: false,
        times,
      });
      saved = { ...entry, id: newId() };
    } catch (e) {
      setSave({ kind: "failed", message: errorMessage(e) });
      toast.error(errorMessage(e));
      return;
    }
    savingRef.current = true;
    setSave({ kind: "saving" });
    try {
      const outcome = await upsertChecked(saved);
      if (!outcome.complete) {
        setSave({ kind: "failed", message: CONFLICT_SAVE_TEXT });
        toast.warning(CONFLICT_SAVE_TEXT);
        return;
      }
      setDraft((d) => (d.key === key ? { ...d, txt: null, dropped: false } : d));
      setSave({ kind: "idle" });
      toastUndo(`${name} נרשם: ${saved.arrival}–${saved.departure}`, () => removeChecked(saved.id));
    } catch (e) {
      setSave({ kind: "failed", message: errorMessage(e) });
      toast.error(`שמירת ${name} נכשלה: ${errorMessage(e)}`);
    } finally {
      savingRef.current = false;
    }
  };
  // "Full attendance" is the arrival at the start of the seder.
  const quickRecord = () => {
    const saveDate = date === renderToday ? todayISO() : date;
    const st = saveDate === date ? t : getSederTimesFor(saveDate);
    void record(num === 1 ? st.s1Start : st.s2Start);
  };
  const setTxt = (txt: string) => {
    setDraft({ ...draft, txt, dropped: false });
    if (save.kind === "failed") setSave({ kind: "idle" });
  };

  const header = (mark: { tone: MarkTone; text: string }) => (
    <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <h3 className="text-lg font-semibold">
        {name}{" "}
        <span className="text-sm font-normal text-muted-foreground">
          <Hours from={start} to={end} />
        </span>
      </h3>
      <StatusMark tone={mark.tone}>{mark.text}</StatusMark>
    </header>
  );

  // ---- a seder that is not owed today ----
  if (notApplicable && !existing) {
    return (
      <div className="stack-gap flex flex-col">
        {header({ tone: "none", text: "לא נדרש" })}
        <p className="text-sm text-muted-foreground">{notApplicable}</p>
      </div>
    );
  }

  // ---- not recorded yet ----
  if (!existing) {
    // Attendance is not recorded on such a day at all: no exceptional entry, no
    // field, no buttons. The screen says why once, above the sedarim.
    if (blockedReason) {
      return (
        <div className="flex flex-col gap-2">
          {header({ tone: "none", text: "אין רישום נוכחות" })}
          <p className="text-sm text-muted-foreground">
            {blockedReason} לא רושמים נוכחות — זה אינו יום לימוד רגיל.
          </p>
        </div>
      );
    }
    if (!learningDay && !open) {
      return (
        <div className="flex flex-col gap-2">
          {header({ tone: "none", text: "אין חובה לרשום" })}
          <div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDraft({ ...draft, open: true, dropped: false })}
            >
              רישום חריג
            </Button>
          </div>
        </div>
      );
    }
    const preview = arrivalValue
      ? calcSeder({
          ...arrivalEntry({
            date,
            seder: num,
            time: arrivalValue,
            ohevei: false,
            times: t,
          }),
          id: "preview",
        })
      : null;
    const onSubmit = (ev: FormEvent) => {
      ev.preventDefault();
      void record(arrivalValue);
    };
    // At the start of the seder "save arrival" already is full attendance, so the
    // second button would only repeat it: it shows when the field says something else.
    const atStart = arrivalValue === start;
    // An arrival after the seder has ended cannot be saved with the seder's own
    // departure time; say so up front instead of failing on the click.
    const a = hhmmToMin(arrivalValue);
    const e = hhmmToMin(end);
    const afterEnd = a !== null && e !== null && a > e;
    const status =
      save.kind !== "idle" || arrivalTxt !== null
        ? saveStatusLabel(save, arrivalTxt !== null)
        : null;
    return (
      <div className="flex flex-col gap-3">
        {header({ tone: "none", text: "טרם נרשם" })}
        <form onSubmit={onSubmit} className="flex flex-col gap-3" aria-label={`רישום הגעה ${name}`}>
          <fieldset disabled={saving} className="flex flex-col gap-3 border-0 p-0">
            <div>
              <label htmlFor={`arrival-${num}`} className="text-sm text-muted-foreground">
                שעת הגעה בפועל
              </label>
              <div className="mt-1 flex items-center gap-2">
                <input
                  id={`arrival-${num}`}
                  type="time"
                  dir="ltr"
                  value={arrivalValue}
                  onChange={(e) => setTxt(e.target.value)}
                  className="field-input figure block w-36"
                />
                <Button type="button" variant="ghost" size="sm" onClick={() => setTxt(nowHHMM())}>
                  עכשיו
                </Button>
              </div>
            </div>
            <p className="min-h-10 text-sm text-muted-foreground" aria-live="polite">
              {draft.dropped ? (
                <span className="block">התאריך התחלף — שעת ההגעה שהוקלדה אופסה.</span>
              ) : null}
              {status ? (
                <span
                  className={`block ${save.kind === "failed" ? "text-status-absent-fg" : ""}`}
                  role={save.kind === "failed" ? "alert" : undefined}
                >
                  {status}
                </span>
              ) : null}
              {afterEnd ? (
                <>
                  שעת ההגעה אחרי סיום הסדר (<bdi dir="ltr">{end}</bdi>). לרישום מאוחר השתמשו ב״שעות
                  אחרות״.
                </>
              ) : arrivalValue ? (
                <>
                  יישמר: הגעה <bdi dir="ltr">{arrivalValue}</bdi>, יציאה <bdi dir="ltr">{end}</bdi>{" "}
                  (לפי שעות הסדר)
                  {preview?.isLate ? ` · איחור ${fmtDur(preview.missingMin)}` : ""}
                </>
              ) : (
                "הזינו שעת הגעה כדי לשמור."
              )}
            </p>
            <div className="flex min-h-9 flex-wrap items-center gap-2">
              <Button type="submit" size="sm" disabled={saving || afterEnd}>
                {saving ? "שומר…" : "שמור הגעה"}
              </Button>
              {!atStart && (
                <Button type="button" variant="outline" size="sm" onClick={quickRecord}>
                  נוכחות מלאה (<Hours from={start} to={end} />)
                </Button>
              )}
              <Button asChild variant="ghost" size="sm">
                <Link to="/attendance" search={attendanceSearch({ date, seder: num })}>
                  היעדרות / שעות אחרות
                </Link>
              </Button>
            </div>
          </fieldset>
        </form>
      </div>
    );
  }

  // ---- recorded ----
  const c = calcSeder(existing);
  const words = notableWords(existing, c);
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
  const label =
    state === "incomplete"
      ? "נדרש תיקון"
      : state === "arrived"
        ? "הגעה נרשמה"
        : state === "absent"
          ? "היעדרות"
          : "נרשם";
  // A regular record says nothing more; only what deviates is spelled out.
  const notes = [
    ...words,
    ...(c.netMissingMin > 0 ? [`חסר נטו ${fmtDur(c.netMissingMin)}`] : []),
    ...(c.bonusMin > 0 ? [`בונוס ${fmtDur(c.bonusMin)}`] : []),
  ];
  const linkSearch = attendanceSearch({ date, seder: num, focus: focusFor(state) });

  return (
    <div className="flex flex-col gap-3">
      {header({ tone, text: label })}
      {notApplicable && (
        <p className="text-sm text-muted-foreground">
          {notApplicable} הרישום נשמר, אך אינו נספר בהשלמת היום.
        </p>
      )}
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
      {notes.length > 0 && <p className="text-sm text-muted-foreground">{notes.join(" · ")}</p>}
      <div className="flex min-h-9 flex-wrap items-center gap-2">
        {state === "incomplete" || state === "arrived" ? (
          <Button asChild size="sm">
            <Link
              to="/attendance"
              search={linkSearch}
              aria-label={`${state === "arrived" ? "השלמת יציאה" : "הוספת שעות"} — ${name}`}
            >
              {state === "arrived" ? "השלם יציאה" : "הוסף שעות"}
            </Link>
          </Button>
        ) : (
          <Button asChild variant="outline" size="sm">
            <Link to="/attendance" search={linkSearch} aria-label={`עריכת רישום ${name}`}>
              עריכה
            </Link>
          </Button>
        )}
      </div>
      <details className="group text-sm">
        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
          פירוט חישוב
        </summary>
        <div className="ledger mt-1">
          <LedgerRow label="חסר">{fmtDur(c.missingMin)}</LedgerRow>
          <LedgerRow label="בונוס">{fmtDur(c.bonusMin)}</LedgerRow>
          <LedgerRow label="מוצדק">{fmtDur(c.excusedMin)}</LedgerRow>
          <LedgerRow label="נטו" strong>
            {fmtDur(c.netMissingMin)}
          </LedgerRow>
        </div>
      </details>
    </div>
  );
}
