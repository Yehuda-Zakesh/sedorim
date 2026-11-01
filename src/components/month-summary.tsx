// One month's totals. The History and Calendar screens both showed this, each
// with its own layout and its own partial selection of the same fields — so
// the two disagreed about what "the monthly summary" even contains. This is
// now the single answer: counts in one ruled column, minutes in another, the
// net missing time as the line the minutes lead to.
import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import {
  effectiveLearningMin,
  useLearning,
  useSeder,
  type MonthlySummary,
} from "@/lib/kollel-store";
import { calcStipend } from "@/lib/stipend";
import { DEFAULT_VIEW, filterSeder } from "@/lib/journal";
import { useSettings } from "@/lib/settings-store";
import { LedgerRow } from "@/components/ui/ledger";
import { fmtDur } from "@/components/today-utils";

type Field = { key: keyof MonthlySummary; label: string };

const COUNTS: Field[] = [
  { key: "entries", label: "רישומים" },
  { key: "lateCount", label: "איחורים" },
  { key: "earlyDepCount", label: "יציאה מוקדמת" },
  { key: "absenceCount", label: "היעדרויות" },
  { key: "oheveiCount", label: "אוהבי ה׳" },
];

/** Only meaningful to a member of the חבורה, so only shown to one. */
const SHAS_FIELD: Field = { key: "shasCount", label: "חבורת ש״ס" };

const MINUTES: Field[] = [
  { key: "totalMissing", label: "חסר סה״כ" },
  { key: "excused", label: "מוצדק" },
  { key: "nonExcused", label: "לא מוצדק" },
  { key: "bonus", label: "בונוס" },
];

const nis = (n: number) => `${n < 0 ? "−" : ""}${Math.abs(n).toLocaleString("he-IL")} ₪`;

/**
 * `monthKey` (YYYY-MM) switches on the short way in: the stipend and the
 * learning minutes of that month, and a link to its exceptions in the journal.
 * Without it the summary is the plain ledger.
 */
export function MonthSummaryCard({
  title,
  summary,
  monthKey,
}: {
  title: string;
  summary: MonthlySummary;
  monthKey?: string;
}) {
  const { settings } = useSettings();
  const { entries } = useSeder();
  const { items: lessons } = useLearning();
  const counts = settings.seder.shasChavura ? [...COUNTS, SHAS_FIELD] : COUNTS;

  const extra = useMemo(() => {
    if (!monthKey) return null;
    const monthLessons = lessons.filter((l) => l.date.startsWith(monthKey));
    const exceptions = filterSeder(
      entries.filter((e) => e.date.startsWith(monthKey)),
      { ...DEFAULT_VIEW, type: "exceptions" },
    ).length;
    const stipend = calcStipend({
      monthKey,
      entries,
      lessons,
      shasChavura: settings.seder.shasChavura,
      priorApproval: (settings.stipend?.approvedMonths ?? []).includes(monthKey),
    });
    return {
      exceptions,
      stipendNis: stipend.totalNis,
      rawMin: monthLessons.reduce((t, l) => t + l.minutes, 0),
      countedMin: monthLessons.reduce((t, l) => t + effectiveLearningMin(l), 0),
    };
  }, [monthKey, entries, lessons, settings.seder.shasChavura, settings.stipend?.approvedMonths]);

  const link = "text-primary underline underline-offset-2";

  return (
    <section className="section-rule" aria-label={title}>
      <h3 className="mb-2 text-base font-semibold">{title}</h3>

      {/* The short way: what the month came to, before the working. */}
      <div className="mb-4 grid grid-cols-2 gap-x-8 gap-y-3 border-b border-border pb-4 md:grid-cols-4">
        <div className="min-w-0">
          <div className="eyebrow">חסר נטו</div>
          <div className="figure mt-0.5 text-2xl font-semibold" dir="ltr">
            {fmtDur(summary.netMissing)}
          </div>
        </div>
        {extra && (
          <>
            <div className="min-w-0">
              <div className="eyebrow">לימוד נוסף</div>
              <div className="figure mt-0.5 text-2xl font-semibold" dir="ltr">
                {fmtDur(extra.countedMin)}
              </div>
              <div className="text-xs text-muted-foreground">
                בפועל <bdi dir="ltr">{fmtDur(extra.rawMin)}</bdi> · מזכה
              </div>
            </div>
            <div className="min-w-0">
              <div className="eyebrow">מלגה מחושבת</div>
              <div className="figure mt-0.5 text-2xl font-semibold" dir="ltr">
                {nis(extra.stipendNis)}
              </div>
              <Link to="/stipend" className={`text-xs ${link}`}>
                לפירוט החישוב
              </Link>
            </div>
            <div className="min-w-0">
              <div className="eyebrow">חריגות</div>
              <div className="figure mt-0.5 text-2xl font-semibold" dir="ltr">
                {extra.exceptions}
              </div>
              {extra.exceptions > 0 ? (
                <Link
                  to="/history"
                  search={{ month: monthKey, kind: "attendance", filter: "exceptions" }}
                  className={`text-xs ${link}`}
                >
                  לחריגות ביומן
                </Link>
              ) : (
                <div className="text-xs text-muted-foreground">אין חריגות</div>
              )}
            </div>
          </>
        )}
      </div>

      <div className="grid max-w-3xl grid-cols-1 gap-x-10 md:grid-cols-2">
        <div className="ledger">
          {counts.map((f) => (
            <LedgerRow key={f.key} label={f.label}>
              {summary[f.key]}
            </LedgerRow>
          ))}
        </div>
        <div className="ledger">
          {MINUTES.map((f) => (
            <LedgerRow key={f.key} label={f.label}>
              {fmtDur(summary[f.key])}
            </LedgerRow>
          ))}
          <LedgerRow label="חסר נטו" note="אחרי מוצדק ובונוס" strong>
            {fmtDur(summary.netMissing)}
          </LedgerRow>
        </div>
      </div>
    </section>
  );
}
