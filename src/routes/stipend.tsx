// מחשבון מלגה.
//
// The screen answers one question — "how much am I due this month, and why" —
// so it is laid out as a bill: the sum in large type, then the workings as
// ruled rows (base, additions, deductions, total), then the two things a person
// will want to check (the missing-minute bands, and the caps on the learning
// frameworks).
//
// Every number on it is derived; nothing here is entered by hand. The rules
// live in src/lib/stipend.ts, and the "להמחשה בלבד" note is not decoration —
// the app does not know about advance approvals from the Rosh Kollel, and
// several of the rules turn on them.
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, type ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { CalendarRange } from "lucide-react";
import { useSeder, useLearning } from "@/lib/kollel-store";
import { useSettings, setMonthApproved } from "@/lib/settings-store";
import {
  calcStipend,
  STIPEND_POLICY,
  type StipendBreakdown,
  type StipendLine,
} from "@/lib/stipend";
import { monthKeyLabel, monthsWithData } from "@/lib/month-nav";
import { MonthPicker } from "@/components/month-picker";
import { useSelectedMonth } from "@/lib/period";
import { hebrewFromGregorian, formatHebrewMonthYear } from "@/lib/hebrew-calendar";
import { PageSection, LedgerRow, Notice } from "@/components/ui/ledger";

export const Route = createFileRoute("/stipend")({
  head: () => ({ meta: [{ title: "מחשבון מלגה — סדר פלוס" }] }),
  component: StipendPage,
});

const nis = (n: number) => `${n < 0 ? "−" : ""}${Math.abs(n).toLocaleString("he-IL")} ₪`;

function StipendPage() {
  const { entries } = useSeder();
  const { items: lessons } = useLearning();
  const { settings } = useSettings();
  const [month, setMonth] = useSelectedMonth();

  const months = useMemo(() => monthsWithData(entries, lessons), [entries, lessons]);
  const approvedMonths = settings.stipend?.approvedMonths ?? [];
  const priorApproval = approvedMonths.includes(month);
  // Not memoised, on purpose. calcStipend reads the seder hours (and their
  // effective-date schedule) from the settings store, none of which are in the
  // arguments — a cache keyed on the arguments kept showing the old sum after the
  // hours changed. It is one month of rows, and useSettings() above re-renders
  // this on every settings change, from either window.
  const result = calcStipend({
    monthKey: month,
    entries,
    lessons,
    shasChavura: settings.seder.shasChavura,
    priorApproval,
  });

  const [y, m] = month.split("-").map(Number);
  const hebrewLabel = formatHebrewMonthYear(hebrewFromGregorian(new Date(y, m - 1, 15)));
  const monthLabel = monthKeyLabel(month);

  const baseLines = result.lines.filter((l) => l.kind === "base");
  const credits = result.lines.filter((l) => l.kind === "credit");
  const debits = result.lines.filter((l) => l.kind === "debit");
  const noRecords =
    entries.every((e) => !e.date.startsWith(month)) &&
    lessons.every((l) => !l.date.startsWith(month));

  return (
    <AppShell title="מחשבון מלגה" subtitle="כמה מלגה מגיעה החודש, לפי הנתונים שבתוכנה">
      <div className="stack-gap">
        <MonthPicker
          value={month}
          months={months}
          onChange={setMonth}
          sublabel={hebrewLabel}
          leading={<CalendarRange className="size-3.5 text-muted-foreground" aria-hidden="true" />}
        />

        {/* 1 — the sum, large; the caveat beside it, quiet but unmissable. */}
        <section aria-label={`סכום המלגה, ${monthLabel}`}>
          <div className="eyebrow">סה״כ מלגה משוערת · {monthLabel}</div>
          <div className="figure mt-1 text-5xl font-bold">
            <bdi dir="ltr">{nis(result.totalNis)}</bdi>
          </div>
          <div className="mt-2 text-sm text-muted-foreground">
            בסיס <bdi dir="ltr">{nis(STIPEND_POLICY.baseNis)}</bdi>
            {result.deductionNis > 0 && (
              <>
                {" · הפחתה "}
                <bdi dir="ltr">{nis(-result.deductionNis)}</bdi>
              </>
            )}
            {result.totalNis > STIPEND_POLICY.baseNis - result.deductionNis && (
              <>
                {" · תוספות "}
                <bdi dir="ltr">
                  {`+${nis(result.totalNis - STIPEND_POLICY.baseNis + result.deductionNis)}`}
                </bdi>
              </>
            )}
          </div>
          <div className="mt-4">
            <Notice tone="info" title="להמחשה בלבד">
              הסכום מחושב מהרישומים שבתוכנה. אישורים חריגים מראש הכולל והחלטות הנהלה אינם ידועים לה.
              הקובע הוא תלוש המלגה.
            </Notice>
          </div>
          {noRecords && (
            <p className="mt-3 text-sm text-muted-foreground">
              אין רישומים ב{monthLabel}. הסכום משקף היעדר נתונים ולא נוכחות: אין חסר רשום, ולכן
              ייתכנו בו תוספות שאינן מאומתות.
            </p>
          )}
        </section>

        {/* 2 — the workings, in the order the rules are written. */}
        <PageSection title="פירוט החישוב" aside="כל שורה היא סעיף אחד בכללי הכולל">
          <div aria-label="שורות חישוב המלגה" role="group">
            <LineGroup label="בסיס" lines={baseLines} />
            <LineGroup label="תוספות" lines={credits} />
            <LineGroup label="הפחתות" lines={debits} />
            <div className="mt-2 border-t-2 border-foreground/40">
              <LedgerRow label="סה״כ מלגה" strong>
                <span className="text-2xl font-bold">
                  <bdi dir="ltr">{nis(result.totalNis)}</bdi>
                </span>
              </LedgerRow>
            </div>
          </div>
        </PageSection>

        {/* The approval belongs to the selected month, so it sits with it. */}
        <ApprovalToggle
          month={month}
          checked={priorApproval}
          onChange={(v) => setMonthApproved(month, v)}
        />

        <ProportionSection result={result} />

        <div className="grid grid-cols-1 gap-x-8 gap-y-[var(--density-gap)] lg:grid-cols-2">
          <MissingMinutesSection result={result} />
          <LearningSection result={result} />
        </div>
      </div>
    </AppShell>
  );
}

function LineGroup({ label, lines }: { label: string; lines: StipendLine[] }) {
  if (lines.length === 0) return null;
  return (
    <div className="mb-3">
      <div className="eyebrow mb-1">{label}</div>
      <div className="ledger">
        {lines.map((line) => (
          <LedgerRow key={line.id} label={line.label} note={line.detail}>
            <LineValue line={line} />
          </LedgerRow>
        ))}
      </div>
    </div>
  );
}

/** The sign is part of the figure, so the colour never carries the meaning alone. */
function LineValue({ line }: { line: StipendLine }) {
  const zero = line.nis === 0;
  const color =
    line.kind === "base"
      ? "text-foreground"
      : zero
        ? "text-muted-foreground"
        : line.nis < 0
          ? "text-destructive"
          : "text-success";
  const text =
    line.kind === "base" || zero ? nis(line.nis) : `${line.nis > 0 ? "+" : ""}${nis(line.nis)}`;
  return (
    <bdi dir="ltr" className={`font-semibold ${color}`}>
      {text}
    </bdi>
  );
}

/**
 * The one thing about a month the app cannot derive: whether the Rosh Kollel
 * approved it in advance.
 *
 * Kept per month rather than as a global setting, because that is how the
 * approval itself is given — for a particular month, not once and for all.
 * Every rule written to bend for such an approval reads it; today that is only
 * §3's ceiling on free excused minutes.
 */
function ApprovalToggle({
  month,
  checked,
  onChange,
}: {
  month: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label
      className={`card-surface flex cursor-pointer items-start gap-3 p-4 pressable transition ${
        checked ? "border-s-4 border-s-success" : ""
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 size-4 shrink-0 accent-primary"
      />
      <div className="min-w-0 text-sm">
        <div className="font-semibold">
          יש לי אישור מראש הכולל ל{monthKeyLabel(month)}
          {checked && <span className="ms-2 text-xs font-medium text-success">מסומן לחודש זה</span>}
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {checked
            ? "ההגבלות שתלויות באישור מיוחד מראש הכולל אינן חלות על חודש זה: דקות מוצדקות אינן מורידות מהמלגה, ללא תקרה."
            : "סמן אם ראש הכולל אישר לך מראש. הסימון נשמר לחודש זה בלבד, ומבטל את התקרה על הדקות המוצדקות."}
        </p>
      </div>
    </label>
  );
}

function Num({ children }: { children: ReactNode }) {
  return <bdi dir="ltr">{children}</bdi>;
}

/** Why the thresholds on this screen are not always 500 and 600. */
function ProportionSection({ result }: { result: StipendBreakdown }) {
  const partial = result.sessionDays < result.fullMonthDays;
  const pct = Math.round(result.ratio * 100);

  return (
    <PageSection
      title="ימי הלימוד בחודש"
      aside={partial ? "חודש חלקי: הספים מוקטנים" : "חודש לימודים מלא"}
    >
      <p className="mb-2 text-xs text-muted-foreground">
        {partial
          ? "החודש קצר מחודש רגיל, ולכן הספים שנמדדים בדקות קטנים בהתאם. המלגה עצמה קשיחה: היא מתחילה תמיד מ־2,000 ₪."
          : "הספים שנמדדים בדקות בתוקפם המלא."}
      </p>
      <div className="ledger">
        <LedgerRow label="ימי לימוד בפועל" note="ללא שישי־שבת, יו״ט, ערבי יו״ט ובין הזמנים">
          {result.sessionDays}
        </LedgerRow>
        <LedgerRow label="ימי לימוד בחודש מלא" note="כל ימי א׳–ה׳ בחודש">
          {result.fullMonthDays}
        </LedgerRow>
        <LedgerRow label="יחס" note={partial ? "כל הספים מוקטנים ביחס זה" : "ללא הקטנה"}>
          {pct}%
        </LedgerRow>
        <LedgerRow
          label="סף החיסור החופשי"
          note={partial ? `במקום ${STIPEND_POLICY.freeMissingMin} דק׳` : undefined}
        >
          {result.scaled.freeMissingMin} דק׳
        </LedgerRow>
      </div>
    </PageSection>
  );
}

/** The bands, and what the month put into each of them. */
function MissingMinutesSection({ result }: { result: StipendBreakdown }) {
  const { missing, scaled, charges } = result;
  const excusedOver = missing.excusedCharged > 0;
  const waived = missing.excusedWaived > 0;

  return (
    <PageSection title="הדקות החסרות">
      <p className="mb-2 text-xs text-muted-foreground">
        {waived ? (
          "יש אישור מראש הכולל לחודש זה: דקות מוצדקות אינן מורידות מהמלגה, ללא תקרה."
        ) : (
          <>
            דקות מוצדקות אינן מורידות מהמלגה, עד <Num>{scaled.excusedFreeMin}</Num> דק׳. מעבר לכך,
            ובלי אישור מראש הכולל, העודף נחשב כדקות רגילות.
          </>
        )}
      </p>

      <div className="ledger">
        <LedgerRow label="סה״כ נשמט" note="כולל מוצדקות">
          {missing.total} דק׳
        </LedgerRow>
        <LedgerRow
          label="מתוכן מוצדקות"
          note={
            waived
              ? `${missing.excusedWaived} דק׳ מעל התקרה: לא נספרו, יש אישור`
              : excusedOver
                ? `${missing.excusedCharged} דק׳ מעל התקרה: נחשבות רגילות`
                : "כולן בתוך התקרה"
          }
        >
          {missing.excused} דק׳
        </LedgerRow>
        <LedgerRow label="חסר נטו" note="לא מוצדק, אחרי בונוס">
          {missing.net} דק׳
        </LedgerRow>
        <LedgerRow label="נכנס לחישוב" note="חסר נטו + מוצדק מעל התקרה" strong>
          {missing.chargeable} דק׳
        </LedgerRow>
      </div>

      <h3 className="eyebrow mb-1 mt-5">מדרגות ההפחתה</h3>
      <div className="ledger">
        {charges.map((c, i) => (
          <div key={i} className="row-pad flex items-baseline gap-3 text-sm">
            <span className="figure min-w-0">
              <Num>
                {c.fromMin}–{Number.isFinite(c.toMin) ? c.toMin : "∞"}
              </Num>{" "}
              דק׳
              <span className="ms-2 text-xs text-muted-foreground">
                <Num>{c.nisPer10Min}</Num> ₪ לכל 10 דק׳
              </span>
            </span>
            <span className="flex-1" />
            <span className="figure text-xs text-muted-foreground">
              <Num>{c.minutes}</Num> דק׳
            </span>
            <span
              className={`figure w-16 text-end font-semibold ${c.nis > 0 ? "text-destructive" : ""}`}
            >
              <Num>{c.nis > 0 ? `−${c.nis} ₪` : "—"}</Num>
            </span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        בכל מדרגה נספרות רק יחידות שלמות של 10 דקות; שארית קטנה מ־10 דק׳ אינה מחויבת.
      </p>
    </PageSection>
  );
}

/** The two frameworks, with §7's floor and §8's ceilings spelled out. */
function LearningSection({ result }: { result: StipendBreakdown }) {
  const l = result.learning;
  const p = STIPEND_POLICY;

  return (
    <PageSection title="לימוד נוסף">
      <p className="mb-2 text-xs text-muted-foreground">
        הדקות המוצגות הן דקות אפקטיביות: לימוד בתענית דיבור נספר כפול, כאן כמו בכל שאר הסיכומים.
      </p>

      <div className="ledger">
        <div>
          <LedgerRow
            label="כולל ערב"
            note={
              <>
                {l.kollelErevCountedMin} דק׳ נספרות
                {l.kollelErevRawMin !== l.kollelErevCountedMin &&
                  ` (מתוך ${l.kollelErevRawMin} שנרשמו)`}
                {" · "}
                {p.kollelErev.nisPerHour} ₪ לשעה
              </>
            }
          >
            <span
              className={
                l.kollelErevNis > 0 ? "text-success font-semibold" : "text-muted-foreground"
              }
            >
              {nis(l.kollelErevNis)}
            </span>
          </LedgerRow>
          {l.kollelErevBelowMinimum && (
            <p className="pb-2 text-xs font-medium text-warning-fg">
              לא הושג המינימום: למלגה על כולל ערב נדרשות החודש{" "}
              <Num>{result.scaled.kollelErevMinMonthlyMin}</Num> דק׳. חסרות{" "}
              <Num>{result.scaled.kollelErevMinMonthlyMin - l.kollelErevCountedMin}</Num> דק׳.
            </p>
          )}
          {l.kollelErevDaysOverCap > 0 && (
            <p className="pb-2 text-xs text-muted-foreground">
              ב־{l.kollelErevDaysOverCap} ימים נרשם מעל התקרה של {p.kollelErev.maxDailyMin} דק׳ ליום
              והעודף לא נספר.
            </p>
          )}
        </div>

        <div>
          <LedgerRow
            label="תורתו בידו"
            note={
              <>
                {l.toratoCountedMin} דק׳ נספרות
                {l.toratoCapped && ` (מתוך ${l.toratoRawMin} שנרשמו)`}
                {" · "}
                {p.toratoBeyado.nisPerHour} ₪ לשעה · ללא מינימום
              </>
            }
          >
            <span
              className={l.toratoNis > 0 ? "text-success font-semibold" : "text-muted-foreground"}
            >
              {nis(l.toratoNis)}
            </span>
          </LedgerRow>
          {l.toratoCapped && (
            <p className="pb-2 text-xs text-muted-foreground">
              התקרה החודשית היא {p.toratoBeyado.maxMonthlyMin / 60} שעות והעודף לא נספר.
            </p>
          )}
        </div>
      </div>
    </PageSection>
  );
}
