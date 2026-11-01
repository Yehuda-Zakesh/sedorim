import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { AppShell } from "@/components/app-shell";
import { EntryDrawer, type DrawerTarget } from "@/components/entry-drawer";
import { JournalMonthBar } from "@/components/journal-month-bar";
import { BookOpen, Search } from "lucide-react";
import { calendarDay, formatDayDate, hoursState, sederStatusWords } from "@/lib/journal";
import { PageSection, StatusMark } from "@/components/ui/ledger";
import {
  useSeder,
  useLearning,
  calcSeder,
  monthlySummary,
  entriesByDate,
  effectiveLearningMin,
  FRAMEWORK_LABELS,
  type LearningEntry,
  type SederEntry,
} from "@/lib/kollel-store";
import { hebrewFromGregorian, hebrewDayLetters } from "@/lib/hebrew-calendar";
import { attendanceBlockedReason } from "@/lib/attendance-day";
import { MonthSummaryCard } from "@/components/month-summary";
import { monthKeyLabel, monthsWithData } from "@/lib/month-nav";
import { useSelectedMonth } from "@/lib/period";

export const Route = createFileRoute("/calendar")({
  head: () => ({ meta: [{ title: "לוח נוכחות ולימוד — סדר פלוס" }] }),
  component: CalendarPage,
});

const weekdays = ["א", "ב", "ג", "ד", "ה", "ו", "ש"];

/** The attendance side of a day. A day with no seder records is "none". */
function dayTone(list: SederEntry[]): { color: string; label: string } {
  if (!list.length) return { color: "var(--status-none)", label: "ללא רישום נוכחות" };
  let net = 0,
    hasOhevei = false,
    hasAbsent = false,
    hasIncomplete = false;
  for (const e of list) {
    const c = calcSeder(e);
    net += c.netMissingMin;
    if (c.isOhevei) hasOhevei = true;
    if (e.absent) hasAbsent = true;
    const h = hoursState(e);
    if (h === "no-hours" || h === "no-arrival") hasIncomplete = true;
  }
  if (hasAbsent) return { color: "var(--status-absent)", label: "היעדרות" };
  // No hours is not full attendance, even when the minutes happen to net out.
  if (hasIncomplete) return { color: "var(--status-late)", label: "חסר פירוט שעות" };
  if (net === 0 && hasOhevei) return { color: "var(--status-present)", label: "אוהבי ה׳" };
  if (net === 0) return { color: "var(--status-present)", label: "נוכחות מלאה" };
  if (net < 30) return { color: "var(--status-late)", label: `${net} דק׳ חסר` };
  return { color: "var(--status-absent)", label: `${net} דק׳ חסר` };
}

/** The quiet word for a day that takes no attendance, in place of "no record". */
const BLOCKED_WORD: Record<string, string> = {
  בשבת: "שבת",
  "ביום שישי": "שישי",
  "ביום טוב": "חג",
  "בערב יום טוב": "ערב חג",
};

function CalendarPage() {
  return (
    <AppShell title="לוח נוכחות ולימוד" subtitle="לחיצה על יום פותחת את הרישום">
      <CalendarView />
    </AppShell>
  );
}

function CalendarView() {
  const today = new Date();
  const [monthKey] = useSelectedMonth();
  const [year, monthNum] = monthKey.split("-").map(Number);
  const month = monthNum - 1;
  const [pickedDate, setPickedDate] = useState<string | null>(null);
  // A day picked in another month is not "selected" in this one.
  const selectedDate = pickedDate && pickedDate.startsWith(monthKey) ? pickedDate : null;
  const [target, setTarget] = useState<DrawerTarget | null>(null);
  const [q, setQ] = useState("");
  const [showAtt, setShowAtt] = useState(true);
  const [showLearn, setShowLearn] = useState(true);
  const navigate = useNavigate();

  const { entries } = useSeder();
  const { items: lessons } = useLearning();
  const byDate = useMemo(() => entriesByDate(entries), [entries]);
  const lessonsByDate = useMemo(() => {
    const out: Record<string, LearningEntry[]> = {};
    for (const l of lessons) (out[l.date] = out[l.date] || []).push(l);
    return out;
  }, [lessons]);
  const months = useMemo(() => monthsWithData(entries, lessons), [entries, lessons]);

  const first = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(first).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7) cells.push(null);

  const summary = monthlySummary(year, month);
  const dateOf = (d: number) => `${monthKey}-${String(d).padStart(2, "0")}`;
  const show = { attendance: showAtt, learning: showLearn };
  // The drawing, the day's list and what a click opens all come from one filtered set.
  const dayOf = (dateStr: string) => calendarDay(dateStr, byDate, lessonsByDate, show);
  const selected = selectedDate ? dayOf(selectedDate) : null;
  const selectedList = selected?.seder ?? [];
  const selectedLessons = selected?.lessons ?? [];

  const pickDay = (dateStr: string) => {
    setPickedDate(dateStr);
    const t = dayOf(dateStr).target;
    if (t) setTarget(t);
  };

  return (
    <>
      <JournalMonthBar months={months} />

      <div className="mt-3 mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <form
          role="search"
          className="flex min-w-[220px] flex-1 items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void navigate({ to: "/search", search: { q: q.trim() || undefined } });
          }}
        >
          <div className="relative flex-1">
            <Search
              className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="חיפוש ביומן"
              placeholder="חיפוש בכל הרישומים..."
              className="field-input w-full ps-9"
            />
          </div>
          <button
            type="submit"
            className="pressable rounded-md border border-border px-3 py-2 text-sm hover:bg-accent"
          >
            חיפוש מתקדם
          </button>
        </form>

        <div className="flex items-center gap-2 text-sm" role="group" aria-label="מה להציג בלוח">
          <span className="text-muted-foreground">הצג:</span>
          {(
            [
              ["נוכחות", showAtt, setShowAtt],
              ["לימוד נוסף", showLearn, setShowLearn],
            ] as const
          ).map(([name, on, set]) => (
            <button
              key={name}
              type="button"
              aria-pressed={on}
              onClick={() => set(!on)}
              className={`pressable rounded-md border px-3 py-1 ${on ? "border-primary bg-primary/10 font-medium text-foreground" : "border-border text-muted-foreground"}`}
            >
              {name}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="card-surface p-5 lg:col-span-3">
          <div className="grid grid-cols-7 gap-1.5 mb-2">
            {weekdays.map((d) => (
              <div key={d} className="text-center text-2xs font-medium text-muted-foreground py-1">
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1.5">
            {cells.map((day, i) => {
              if (!day) return <div key={i} className="aspect-square" />;
              const dateStr = dateOf(day);
              const { seder: list, lessons: les } = dayOf(dateStr);
              const lessonMin = les.reduce((n, l) => n + effectiveLearningMin(l), 0);
              const t = dayTone(list);
              const blockedReason = attendanceBlockedReason(dateStr);
              const blockedWord = blockedReason
                ? (BLOCKED_WORD[blockedReason] ?? "ללא נוכחות")
                : null;
              const label =
                !list.length && !les.length && blockedWord
                  ? `${blockedWord}, אין רישום נוכחות`
                  : list.length
                    ? les.length
                      ? `${t.label}, ולימוד נוסף ${lessonMin} דק׳`
                      : t.label
                    : les.length
                      ? `לימוד בלבד, ${lessonMin} דק׳`
                      : t.label;
              const isSelected = selectedDate === dateStr;
              const isToday =
                year === today.getFullYear() &&
                month === today.getMonth() &&
                day === today.getDate();
              const heDay = hebrewDayLetters(
                hebrewFromGregorian(new Date(year, month, day, 12)).day,
              );
              return (
                <button
                  key={i}
                  onClick={() => pickDay(dateStr)}
                  aria-label={`${day} ${monthKeyLabel(monthKey)}, ${label}${isToday ? ", היום" : ""}`}
                  aria-pressed={isSelected}
                  className={[
                    "aspect-square rounded-md border p-1.5 flex flex-col items-stretch text-start pressable transition",
                    isSelected
                      ? "ring-2 ring-primary border-primary"
                      : "border-border hover:border-primary",
                  ].join(" ")}
                  style={
                    list.length
                      ? {
                          backgroundColor: `color-mix(in oklch, ${t.color} 18%, var(--color-card))`,
                          borderColor: isSelected
                            ? "var(--color-primary)"
                            : `color-mix(in oklch, ${t.color} 50%, transparent)`,
                        }
                      : les.length
                        ? {
                            backgroundColor:
                              "color-mix(in oklch, var(--color-primary) 8%, var(--color-card))",
                            borderStyle: "dashed",
                          }
                        : undefined
                  }
                >
                  <div className="flex items-center justify-between">
                    <span className="text-2xs text-muted-foreground">{heDay}</span>
                    <span
                      className={`text-xs font-semibold tabular-nums ${isToday ? "text-primary" : ""}`}
                    >
                      {day}
                    </span>
                  </div>
                  {blockedWord && list.length === 0 && les.length === 0 && (
                    <span className="mt-auto text-2xs text-muted-foreground">{blockedWord}</span>
                  )}
                  {(list.length > 0 || les.length > 0) && (
                    <div className="mt-auto flex items-center justify-end gap-1">
                      {les.length > 0 && (
                        <BookOpen className="size-3.5 text-primary" aria-hidden="true" />
                      )}
                      {list.length > 1 && (
                        <span className="text-2xs tabular-nums text-muted-foreground">
                          {list.length}
                        </span>
                      )}
                      {list.length > 0 && (
                        <div
                          className="size-2 rounded-full"
                          style={{ backgroundColor: t.color }}
                          aria-hidden="true"
                        />
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          <ul
            className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground"
            aria-label="מקרא"
          >
            {[
              ["var(--status-present)", "נוכחות מלאה"],
              ["var(--status-late)", "חסר מעט"],
              ["var(--status-absent)", "חסר הרבה או היעדרות"],
              ["var(--status-none)", "ללא רישום נוכחות"],
            ].map(([c, l]) => (
              <li key={l} className="inline-flex items-center gap-1.5">
                <span
                  className="size-2 rounded-full"
                  style={{ backgroundColor: c }}
                  aria-hidden="true"
                />{" "}
                {l}
              </li>
            ))}
            <li className="inline-flex items-center gap-1.5">
              <BookOpen className="size-3.5 text-primary" aria-hidden="true" /> לימוד נוסף (יום עם
              לימוד בלבד: מסגרת מקווקווה)
            </li>
          </ul>
        </div>

        <div>
          {selectedDate ? (
            <PageSection
              title={formatDayDate(selectedDate)}
              aside={
                selectedList.length + selectedLessons.length > 0
                  ? undefined
                  : "אין רישומים ביום הזה"
              }
            >
              {selected && selected.hiddenSeder + selected.hiddenLessons > 0 && (
                <p className="mb-2 text-sm text-muted-foreground">
                  {selected.hiddenSeder > 0 &&
                    `${selected.hiddenSeder} רישומי נוכחות מוסתרים בסינון. `}
                  {selected.hiddenLessons > 0 &&
                    `${selected.hiddenLessons} רישומי לימוד מוסתרים בסינון. `}
                  <button
                    type="button"
                    onClick={() => {
                      if (selected.hiddenSeder > 0) setShowAtt(true);
                      if (selected.hiddenLessons > 0) setShowLearn(true);
                    }}
                    className="font-medium text-primary underline underline-offset-2"
                  >
                    הצג גם רשומות מוסתרות
                  </button>
                </p>
              )}
              {selectedList.length === 0 && selectedLessons.length > 0 && (
                <p className="mb-2 text-sm text-muted-foreground">לימוד בלבד — אין רישום נוכחות.</p>
              )}
              <ul className="ledger">
                {selectedList.map((e) => {
                  const c = calcSeder(e);
                  const words = sederStatusWords(e, c).join(" · ");
                  return (
                    <li key={e.id}>
                      <button
                        type="button"
                        onClick={() => setTarget({ kind: "seder", id: e.id })}
                        className="row-pad pressable w-full text-start hover:bg-accent/40"
                      >
                        <div className="text-sm font-medium">סדר {e.seder === 1 ? "א׳" : "ב׳"}</div>
                        <div className="figure mt-0.5 text-sm text-muted-foreground">
                          {e.absent ? (
                            "היעדרות"
                          ) : (
                            <span dir="ltr">{`${e.arrival || "—"} – ${e.departure || "—"}`}</span>
                          )}
                        </div>
                        <div className="mt-0.5 text-sm">
                          {c.netMissingMin > 0 || hoursState(e) !== "ok" ? (
                            <StatusMark tone={e.absent ? "absent" : "late"}>
                              {words} · חסר <span className="figure">{c.netMissingMin}</span> דק׳
                            </StatusMark>
                          ) : (
                            <span className="text-muted-foreground">{words}</span>
                          )}
                        </div>
                      </button>
                    </li>
                  );
                })}
                {selectedLessons.map((l) => (
                  <li key={l.id}>
                    <button
                      type="button"
                      onClick={() => setTarget({ kind: "learning", id: l.id })}
                      className="row-pad pressable w-full text-start hover:bg-accent/40"
                    >
                      <div className="flex items-center gap-1.5 text-sm font-medium">
                        <BookOpen className="size-3.5 text-primary" aria-hidden="true" />
                        {FRAMEWORK_LABELS[l.framework]}
                      </div>
                      <div className="figure mt-0.5 text-sm text-muted-foreground">
                        {effectiveLearningMin(l)} דק׳ נחשבות
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </PageSection>
          ) : (
            <p className="section-rule text-sm text-muted-foreground">לחץ על יום בלוח לפרטים.</p>
          )}
        </div>
      </div>

      <div className="mt-4">
        <MonthSummaryCard
          title={`סיכום ${monthKeyLabel(monthKey)}`}
          summary={summary}
          monthKey={monthKey}
        />
      </div>

      <EntryDrawer target={target} onClose={() => setTarget(null)} />
    </>
  );
}
