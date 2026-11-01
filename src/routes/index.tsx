import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import {
  useSeder,
  useLearning,
  monthlySummary,
  attendanceScore,
  currentDayStreak,
} from "@/lib/kollel-store";
import { useToday } from "@/lib/today";
import { attendanceBlockedReason } from "@/lib/attendance-day";
import {
  fastDayName,
  formatHebrewDate,
  hasNoSederB,
  isBeinHazmanim,
  isLearningDay,
} from "@/lib/hebrew-calendar";
import { useSettings } from "@/lib/settings-store";
import { currentMonthKey, formatDateDots } from "@/lib/month-nav";
import { setSelectedMonth } from "@/lib/period";
import { Button } from "@/components/ui/button";
import { Notice, PageSection, StatusMark } from "@/components/ui/ledger";
import { TodaySeder } from "@/components/today-seder";
import {
  completionText,
  dayCompletion,
  fmtDur,
  parseLocalISO,
  weekdayName,
} from "@/components/today-utils";
import {
  formatMonthKey,
  reportedMonthFor,
  setReported,
  usePhoneReport,
  REPORT_WINDOW_LAST_DAY,
} from "@/lib/phone-report";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "היום — המעקב שלי" },
      { name: "description", content: "מעקב אישי על נוכחות בסדרי הכולל" },
    ],
  }),
  component: Dashboard,
});

/** "לסיכום חודש מלא" from here means this month, whatever month was browsed last. */
const selectCurrentMonth = () => setSelectedMonth(currentMonthKey());

function Dashboard() {
  const { entries } = useSeder();
  const { items: lessons } = useLearning();
  const { settings } = useSettings();

  // Re-renders at midnight and on returning to the window.
  const date = useToday();
  const today = parseLocalISO(date);
  const y = today.getFullYear(),
    m = today.getMonth();
  const hebrewDate = formatHebrewDate(today);
  const beinHazmanim = isBeinHazmanim(today);
  // Nothing is owed on a day the kollel does not sit, so nothing is chased on
  // one either — the same rule the reminder notifications already follow.
  const learningDay = isLearningDay(today);
  // Weekends and Yom Tov: attendance cannot be recorded at all (not just not owed).
  const blockedReason = attendanceBlockedReason(date);
  const fastName = fastDayName(today);
  const noSederB = hasNoSederB(today);

  const e1 = entries.find((e) => e.date === date && e.seder === 1);
  const e2 = entries.find((e) => e.date === date && e.seder === 2);
  const completion = dayCompletion({
    learningDay,
    noSederB,
    recorded: [e1 ? 1 : null, e2 ? 2 : null].filter((n): n is 1 | 2 => n !== null),
  });

  const summary = monthlySummary(y, m);
  const hasMonthData = summary.entries > 0;
  const score = attendanceScore(y, m);
  const streak = currentDayStreak();

  const monthPrefix = `${y}-${String(m + 1).padStart(2, "0")}`;
  const learningTotalMin = lessons
    .filter((l) => l.date.startsWith(monthPrefix))
    .reduce((s, l) => s + l.minutes, 0);

  const { showReminders } = settings.dashboard;
  const overLate = summary.lateCount >= settings.goals.maxLatePerMonth;
  const overMissing = summary.netMissing > settings.seder.alertMissingMinPerMonth;

  const monthLink = (
    <Link to="/statistics" onClick={selectCurrentMonth} className="text-primary hover:underline">
      לסיכום חודש מלא ←
    </Link>
  );

  return (
    <AppShell
      title="היום"
      subtitle={`${weekdayName(today)}, ${formatDateDots(date)} · ${hebrewDate}`}
    >
      <div className="stack-gap flex flex-col">
        {blockedReason && (
          <Notice tone="info" title={`היום ${blockedReason} — אין רישום נוכחות`}>
            זה אינו יום לימוד רגיל. לימוד נוסף אפשר לרשום גם היום.
          </Notice>
        )}

        {((!learningDay && !blockedReason) || fastName || beinHazmanim) && (
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2" aria-label="מצב היום">
            {!learningDay && !blockedReason && (
              <StatusMark tone="none">היום אינו יום לימוד — אין חובת רישום</StatusMark>
            )}
            {fastName && <StatusMark tone="excused">{fastName}</StatusMark>}
            {beinHazmanim && (
              <span className="inline-flex items-center gap-3 text-sm">
                <StatusMark tone="excused">בין הזמנים</StatusMark>
                <Link to="/learning" className="text-primary hover:underline">
                  למסגרת ״ישיבת בין הזמנים״ בלימוד נוסף
                </Link>
              </span>
            )}
          </div>
        )}

        <PageSection
          title="הסדרים של היום"
          aside={<span role="status">{completionText(completion)}</span>}
        >
          <div className="grid grid-cols-1 lg:grid-cols-2">
            <div className="py-3 lg:pe-8">
              <TodaySeder num={1} date={date} existing={e1} learningDay={learningDay} />
            </div>
            <div className="border-t border-border py-3 lg:border-s lg:border-t-0 lg:ps-8">
              <TodaySeder
                num={2}
                date={date}
                existing={e2}
                learningDay={learningDay}
                notApplicable={noSederB ? `היום ${fastName ?? "יום צום"} — אין סדר ב׳.` : undefined}
              />
            </div>
          </div>
        </PageSection>

        {showReminders && <PhoneReportCard />}

        {showReminders && overLate && (
          <Notice
            tone="warning"
            title={`${summary.lateCount} איחורים החודש — המכסה היא ${settings.goals.maxLatePerMonth}`}
            action={
              <Link
                to="/statistics"
                onClick={selectCurrentMonth}
                className="text-sm text-primary hover:underline"
              >
                לפירוט האיחורים
              </Link>
            }
          />
        )}
        {showReminders && overMissing && (
          <Notice
            tone="warning"
            title={`חסר נטו החודש ${fmtDur(summary.netMissing)} — מעל סף ההתראה (${fmtDur(settings.seder.alertMissingMinPerMonth)})`}
            action={
              <Link
                to="/statistics"
                onClick={selectCurrentMonth}
                className="text-sm text-primary hover:underline"
              >
                לפירוט החסר
              </Link>
            }
          />
        )}

        <PageSection title="החודש עד כה" aside={monthLink}>
          {hasMonthData ? (
            <dl className="flex flex-wrap gap-x-8 gap-y-3">
              <MonthFigure
                label="ציון נוכחות"
                value={score}
                note={`יעד ${settings.goals.monthlyTarget}`}
              />
              <MonthFigure label="סדרים שנרשמו" value={summary.entries} />
              <MonthFigure
                label="חסר נטו"
                value={fmtDur(summary.netMissing)}
                note="אחרי מוצדק ובונוס"
              />
              <MonthFigure label="איחורים" value={summary.lateCount} />
              <MonthFigure label="היעדרויות" value={summary.absenceCount} />
              <MonthFigure
                label="רצף ימים"
                value={streak}
                note={streak > 0 ? "ללא חיסור" : "אין רצף כרגע"}
              />
            </dl>
          ) : (
            <p className="text-sm text-muted-foreground">אין עדיין רישומים החודש.</p>
          )}
          <p className="mt-3 flex flex-wrap items-baseline justify-between gap-2 text-sm text-muted-foreground">
            <span>
              לימוד נוסף החודש (זמן בפועל):{" "}
              <b className="figure text-foreground">{fmtDur(learningTotalMin)}</b>
            </span>
            <Link to="/learning" className="text-primary hover:underline">
              לפרטים ←
            </Link>
          </p>
        </PageSection>
      </div>
    </AppShell>
  );
}

function MonthFigure({
  label,
  value,
  note,
}: {
  label: string;
  value: string | number;
  note?: string;
}) {
  return (
    <div className="min-w-0">
      <dt className="eyebrow">{label}</dt>
      <dd className="figure text-xl font-semibold">
        <bdi dir="ltr">{value}</bdi>
      </dd>
      {note && <dd className="text-xs text-muted-foreground">{note}</dd>}
    </div>
  );
}
/**
 * דיווח למערכת הטלפונית — the one card on this screen about something the app
 * cannot check for itself.
 *
 * It shows for the first five days of the month, about the month that ended,
 * and disappears the moment it is marked as reported. The two days after
 * being marked it stays, showing what it recorded, with an undo — otherwise
 * a mis-click has no way back and the card is gone.
 */
function PhoneReportCard() {
  const state = usePhoneReport();
  const now = new Date();
  const month = reportedMonthFor(now);
  const done = state.reported.includes(month);
  const inWindow = now.getDate() <= REPORT_WINDOW_LAST_DAY;

  if (!inWindow) return null;

  if (done) {
    return (
      <Notice
        tone="ok"
        title={`חודש ${formatMonthKey(month)} סומן כמדווח`}
        action={
          <Button variant="ghost" size="sm" onClick={() => setReported(month, false)}>
            ביטול הסימון
          </Button>
        }
      >
        לא יישלחו עוד תזכורות על החודש הזה.
      </Notice>
    );
  }

  const daysLeft = REPORT_WINDOW_LAST_DAY - now.getDate();
  return (
    <Notice
      tone="warning"
      title={`דיווח למערכת הטלפונית — חודש ${formatMonthKey(month)}`}
      action={
        <Button size="sm" onClick={() => setReported(month, true)}>
          דיווחתי
        </Button>
      }
    >
      {daysLeft === 0
        ? "היום היום האחרון לדווח."
        : `נשארו ${daysLeft + 1} ימים לדווח (עד ה־${REPORT_WINDOW_LAST_DAY} בחודש).`}
    </Notice>
  );
}
