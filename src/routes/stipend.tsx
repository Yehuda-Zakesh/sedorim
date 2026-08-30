// מחשבון מלגה.
//
// The screen answers one question — "how much am I due this month, and why" —
// so it is laid out as an answer followed by its workings: the figure, then
// the line-by-line breakdown that adds up to it, then the two things a person
// will want to check (the missing-minute bands, and the caps on the learning
// frameworks).
//
// Every number on it is derived; nothing here is entered by hand. The rules
// live in src/lib/stipend.ts, and the "להמחשה בלבד" note is not decoration —
// the app does not know about advance approvals from the Rosh Kollel, and
// several of the rules turn on them.
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import {
  Wallet, ChevronRight, ChevronLeft, Info, AlertTriangle, TrendingDown,
  TrendingUp, CalendarRange, X,
} from "lucide-react";
import { useSeder, useLearning } from "@/lib/kollel-store";
import { useSettings } from "@/lib/settings-store";
import { calcStipend, STIPEND_POLICY, type StipendBreakdown, type StipendLine } from "@/lib/stipend";
import { currentMonthKey, monthKeyLabel, monthsWithData, shiftMonth } from "@/lib/month-nav";
import { hebrewFromGregorian, formatHebrewMonthYear } from "@/lib/hebrew-calendar";
import { IconBadge, StatTile } from "@/components/ui/stat";

export const Route = createFileRoute("/stipend")({
  head: () => ({ meta: [{ title: "מחשבון מלגה — סדר פלוס" }] }),
  component: StipendPage,
});

const nis = (n: number) => `${n < 0 ? "−" : ""}${Math.abs(n).toLocaleString("he-IL")} ₪`;

function StipendPage() {
  const { entries } = useSeder();
  const { items: lessons } = useLearning();
  const { settings } = useSettings();
  const [month, setMonth] = useState(currentMonthKey());

  const months = useMemo(() => monthsWithData(entries, lessons), [entries, lessons]);
  const result = useMemo(
    () => calcStipend({
      monthKey: month,
      entries,
      lessons,
      shasChavura: settings.seder.shasChavura,
    }),
    [month, entries, lessons, settings.seder.shasChavura],
  );

  const [y, m] = month.split("-").map(Number);
  const hebrewLabel = formatHebrewMonthYear(hebrewFromGregorian(new Date(y, m - 1, 15)));

  return (
    <AppShell title="מחשבון מלגה" subtitle="כמה מלגה מגיעה החודש, לפי הנתונים שבתוכנה">
      <MonthPicker value={month} months={months} hebrewLabel={hebrewLabel} onChange={setMonth} />

      <Disclaimer />

      {/* 1 — the figure. */}
      <section className="mt-4 card-surface p-6 border-s-4 border-s-primary">
        <div className="flex items-start gap-4 flex-wrap">
          <IconBadge icon={Wallet} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="text-xs text-muted-foreground">סה״כ מלגה משוערת · {monthKeyLabel(month)}</div>
            <div className="mt-1 text-4xl font-bold">{nis(result.totalNis)}</div>
            <div className="mt-1 text-xs text-muted-foreground">
              מלגת בסיס {nis(STIPEND_POLICY.baseNis)}
              {result.deductionNis > 0 && ` · פחות ${nis(result.deductionNis)} הפחתה`}
              {result.totalNis > STIPEND_POLICY.baseNis - result.deductionNis &&
                ` · בתוספת ${nis(result.totalNis - STIPEND_POLICY.baseNis + result.deductionNis)}`}
            </div>
          </div>
        </div>
      </section>

      {/* 2 — the workings, in the order the rules are written. */}
      <section className="mt-4 card-surface overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="text-sm font-semibold">פירוט החישוב</h2>
          <p className="text-2xs text-muted-foreground mt-0.5">
            כל שורה היא סעיף אחד בכללי הכולל, בסדר שבו הם כתובים.
          </p>
        </div>
        <ul className="divide-y divide-border">
          {result.lines.map((line) => <LineRow key={line.id} line={line} />)}
        </ul>
        <div className="flex items-baseline gap-3 border-t-2 border-border bg-muted/30 px-5 py-4">
          <span className="text-sm font-semibold">סה״כ</span>
          <span className="flex-1" />
          <span className="text-2xl font-bold tabular-nums">{nis(result.totalNis)}</span>
        </div>
      </section>

      {/* 3 — the proportional month, which quietly moves every threshold above. */}
      <ProportionSection result={result} />

      <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
        <MissingMinutesSection result={result} />
        <LearningSection result={result} />
      </div>
    </AppShell>
  );
}

function LineRow({ line }: { line: StipendLine }) {
  const zero = line.nis === 0;
  const color =
    line.kind === "base" ? "text-foreground"
    : zero ? "text-muted-foreground"
    : line.nis < 0 ? "text-destructive" : "text-success";

  return (
    <li className="flex items-start gap-3 px-5 py-3.5">
      {line.kind !== "base" && (
        <span className={`mt-0.5 shrink-0 ${zero ? "text-muted-foreground/50" : color}`}>
          {line.kind === "debit" ? <TrendingDown className="size-4" /> : <TrendingUp className="size-4" />}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{line.label}</span>
        <span className="block text-2xs text-muted-foreground">{line.detail}</span>
      </span>
      <span className={`shrink-0 text-base font-semibold tabular-nums ${color}`}>
        {line.kind === "base" || zero ? nis(line.nis) : `${line.nis > 0 ? "+" : ""}${nis(line.nis)}`}
      </span>
    </li>
  );
}

/**
 * The one thing that has to be said on this screen, whatever the numbers are.
 *
 * It is not a formality: the app has no way of knowing about an advance
 * approval from the Rosh Kollel, and several of the rules turn on one.
 */
function Disclaimer() {
  return (
    <div className="mt-4">
      <div className="card-surface p-4 flex items-start gap-3 border-s-4 border-s-info">
        <IconBadge icon={Info} tone="info" size="md" />
        <div className="min-w-0 text-sm">
          <div className="font-semibold">החישוב להמחשה בלבד</div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            הסכום מחושב מהרישומים שבתוכנה בלבד. אישורים חריגים מראש הכולל, זמנים חריגים
            והחלטות של הנהלת הכולל אינם ידועים לתוכנה ואינם נכללים כאן. הקובע הוא תלוש המלגה.
          </p>
        </div>
      </div>
    </div>
  );
}

/** Why the thresholds on this screen are not always 500 and 600. */
function ProportionSection({ result }: { result: StipendBreakdown }) {
  const partial = result.sessionDays < result.fullMonthDays;
  const pct = Math.round(result.ratio * 100);

  return (
    <section className="mt-4 card-surface p-5">
      <h2 className="text-sm font-semibold">ימי הלימוד בחודש</h2>
      <p className="text-2xs text-muted-foreground mt-0.5">
        {partial
          ? "החודש קצר מחודש רגיל, ולכן הספים שנמדדים בדקות קטנים בהתאם. המלגה עצמה קשיחה — היא מתחילה תמיד מ־2,000 ₪."
          : "חודש לימודים מלא — הספים שנמדדים בדקות בתוקפם המלא."}
      </p>
      <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatTile label="ימי לימוד בפועל" value={result.sessionDays}
          hint="ללא שישי־שבת, יו״ט, ערבי יו״ט ובין הזמנים" />
        <StatTile label="בחודש מלא" value={result.fullMonthDays} hint="כל ימי א׳–ה׳ בחודש" />
        <StatTile label="יחס" value={`${pct}%`} hint={partial ? "כל הספים מוקטנים ביחס זה" : "ללא הקטנה"} />
        <StatTile label="סף החיסור החופשי" value={result.scaled.freeMissingMin}
          hint={partial ? `במקום ${STIPEND_POLICY.freeMissingMin} דק׳` : "דקות"} />
      </div>
    </section>
  );
}

/** The bands, and what the month put into each of them. */
function MissingMinutesSection({ result }: { result: StipendBreakdown }) {
  const { missing, scaled, charges } = result;
  const excusedOver = missing.excusedCharged > 0;

  return (
    <section className="card-surface p-5">
      <h2 className="text-sm font-semibold">הדקות החסרות</h2>
      <p className="text-2xs text-muted-foreground mt-0.5">
        דקות מוצדקות אינן מורידות מהמלגה — עד {scaled.excusedFreeMin} דק׳. מעבר לכך, ובלי אישור מראש הכולל,
        העודף נחשב כדקות רגילות.
      </p>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <StatTile label="סה״כ נשמט" value={missing.total} hint="כולל מוצדקות" />
        <StatTile label="מתוכן מוצדקות" value={missing.excused}
          hint={excusedOver ? `${missing.excusedCharged} דק׳ מעל התקרה — נחשבות רגילות` : "כולן בתוך התקרה"} />
        <StatTile label="חסר נטו" value={missing.net} hint="לא מוצדק, אחרי בונוס" />
        <StatTile label="נכנס לחישוב" value={missing.chargeable} hint="חסר נטו + מוצדק מעל התקרה" />
      </div>

      <h3 className="mt-5 text-xs font-semibold text-muted-foreground">מדרגות ההפחתה</h3>
      <ul className="mt-2 space-y-2">
        {charges.map((c, i) => (
          <li key={i} className="flex items-baseline gap-2 rounded-lg border border-border px-3 py-2 text-xs">
            <span className="tabular-nums">
              {c.fromMin}–{Number.isFinite(c.toMin) ? c.toMin : "∞"} דק׳
            </span>
            <span className="text-muted-foreground">{c.nisPer10Min} ₪ לכל 10 דק׳</span>
            <span className="flex-1" />
            <span className="tabular-nums text-muted-foreground">{c.minutes} דק׳</span>
            <span className={`tabular-nums font-semibold ${c.nis > 0 ? "text-destructive" : ""}`}>
              {c.nis > 0 ? `−${c.nis} ₪` : "—"}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-2xs text-muted-foreground">
        בכל מדרגה נספרות רק יחידות שלמות של 10 דקות; שארית קטנה מ־10 דק׳ אינה מחויבת.
      </p>
    </section>
  );
}

/** The two frameworks, with §7's floor and §8's ceilings spelled out. */
function LearningSection({ result }: { result: StipendBreakdown }) {
  const l = result.learning;
  const p = STIPEND_POLICY;

  return (
    <section className="card-surface p-5">
      <h2 className="text-sm font-semibold">לימוד נוסף</h2>
      <p className="text-2xs text-muted-foreground mt-0.5">
        הדקות המוצגות הן דקות אפקטיביות — לימוד בתענית דיבור נספר כפול, כאן כמו בכל שאר הסיכומים.
      </p>

      <div className="mt-3 space-y-3">
        <div className="rounded-lg border border-border p-3">
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-medium">כולל ערב</span>
            <span className="flex-1" />
            <span className={`text-base font-semibold tabular-nums ${l.kollelErevNis > 0 ? "text-success" : "text-muted-foreground"}`}>
              {nis(l.kollelErevNis)}
            </span>
          </div>
          <div className="mt-1 text-2xs text-muted-foreground tabular-nums">
            {l.kollelErevCountedMin} דק׳ נספרות
            {l.kollelErevRawMin !== l.kollelErevCountedMin && ` (מתוך ${l.kollelErevRawMin} שנרשמו)`}
            {" · "}{p.kollelErev.nisPerHour} ₪ לשעה
          </div>
          {l.kollelErevBelowMinimum && (
            <div className="mt-2 flex items-start gap-1.5 text-2xs text-warning-fg">
              <AlertTriangle className="size-3 mt-0.5 shrink-0" />
              <span>
                המינימום למלגה על כולל ערב הוא {p.kollelErev.minMonthlyMin} דק׳ (10 שעות).
                חסרות {p.kollelErev.minMonthlyMin - l.kollelErevCountedMin} דק׳.
              </span>
            </div>
          )}
          {l.kollelErevDaysOverCap > 0 && (
            <div className="mt-2 text-2xs text-muted-foreground">
              ב־{l.kollelErevDaysOverCap} ימים נרשם מעל התקרה של {p.kollelErev.maxDailyMin} דק׳ ליום — העודף לא נספר.
            </div>
          )}
        </div>

        <div className="rounded-lg border border-border p-3">
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-medium">תורתו בידו</span>
            <span className="flex-1" />
            <span className={`text-base font-semibold tabular-nums ${l.toratoNis > 0 ? "text-success" : "text-muted-foreground"}`}>
              {nis(l.toratoNis)}
            </span>
          </div>
          <div className="mt-1 text-2xs text-muted-foreground tabular-nums">
            {l.toratoCountedMin} דק׳ נספרות
            {l.toratoCapped && ` (מתוך ${l.toratoRawMin} שנרשמו)`}
            {" · "}{p.toratoBeyado.nisPerHour} ₪ לשעה · ללא מינימום
          </div>
          {l.toratoCapped && (
            <div className="mt-2 text-2xs text-muted-foreground">
              התקרה החודשית היא {p.toratoBeyado.maxMonthlyMin / 60} שעות — העודף לא נספר.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

/** The same two arrows and month list the History screen uses. */
function MonthPicker({
  value, months, hebrewLabel, onChange,
}: {
  value: string;
  months: string[];
  hebrewLabel: string;
  onChange: (key: string) => void;
}) {
  const [listOpen, setListOpen] = useState(false);
  const isCurrent = value === currentMonthKey();

  return (
    <div className="card-surface p-4">
      <div className="flex items-center gap-2">
        {/* Right arrow steps back in time: in an RTL layout, back is to the right. */}
        <button onClick={() => onChange(shiftMonth(value, -1))} title="החודש הקודם"
          className="size-9 rounded-lg border border-border grid place-items-center text-muted-foreground hover:text-foreground hover:bg-accent pressable transition">
          <ChevronRight className="size-4" />
        </button>

        <button onClick={() => setListOpen((v) => !v)}
          className="flex-1 min-w-0 rounded-lg px-3 py-1.5 text-center hover:bg-accent/40 pressable transition">
          <div className="flex items-center justify-center gap-2">
            <CalendarRange className="size-3.5 text-muted-foreground" />
            <span className="text-base font-semibold">{monthKeyLabel(value)}</span>
          </div>
          <div className="text-2xs text-muted-foreground">{hebrewLabel}</div>
        </button>

        <button onClick={() => onChange(shiftMonth(value, 1))} disabled={isCurrent} title="החודש הבא"
          className="size-9 rounded-lg border border-border grid place-items-center text-muted-foreground hover:text-foreground hover:bg-accent pressable transition disabled:opacity-30">
          <ChevronLeft className="size-4" />
        </button>
      </div>

      {listOpen && (
        <div className="mt-3 border-t border-border pt-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-muted-foreground">בחר חודש</span>
            <button onClick={() => setListOpen(false)} className="text-muted-foreground hover:text-foreground">
              <X className="size-3.5" />
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 max-h-56 overflow-auto">
            {months.map((key) => (
              <button key={key}
                onClick={() => { onChange(key); setListOpen(false); }}
                className={`rounded-md border px-2.5 py-2 text-xs pressable transition ${
                  key === value ? "border-primary bg-primary/10 text-primary font-medium" : "border-border hover:bg-accent"
                }`}>
                {monthKeyLabel(key)}
              </button>
            ))}
          </div>
        </div>
      )}

      {!isCurrent && (
        <button onClick={() => onChange(currentMonthKey())}
          className="mt-3 w-full rounded-md border border-dashed border-border py-1.5 text-2xs text-muted-foreground hover:bg-accent pressable transition">
          חזור לחודש הנוכחי
        </button>
      )}
    </div>
  );
}
