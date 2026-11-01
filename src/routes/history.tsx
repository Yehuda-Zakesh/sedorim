// The journal's list view — one month at a time, as a ruled ledger.
//
// The month is the app-wide one (useSelectedMonth), so it survives a trip to
// the calendar, the search or the month summary and back. Filters live in
// journal-state (module level + sessionStorage) for the same reason, and a
// record opens in a dialog on top of the list, so closing it leaves the list
// exactly where it was.
//
// /history?month=YYYY-MM&id=…&kind=… (and &date=…) selects that month and
// opens that record; /history?month=…&kind=attendance&filter=exceptions shows
// that month's attendance narrowed to the filter (see journal.ts). Every param
// is optional; a link with no kind/filter keeps the saved view.
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { EntryDrawer, type DrawerTarget } from "@/components/entry-drawer";
import { JournalMonthBar } from "@/components/journal-month-bar";
import { Button } from "@/components/ui/button";
import { EmptyNote, Figure, PageSection, StatusMark, type MarkTone } from "@/components/ui/ledger";
import {
  Search,
  Trash2,
  FileDown,
  Loader2,
  CalendarRange,
  ChevronDown,
  ChevronUp,
  SlidersHorizontal,
  X,
} from "lucide-react";
import {
  useSeder,
  useLearning,
  calcSeder,
  effectiveLearningMin,
  monthClosing,
  FRAMEWORK_LABELS,
  type MonthClosing,
  type LearningEntry,
  type SederCalc,
  type SederEntry,
} from "@/lib/kollel-store";
import { exportMonthClosingsPdf } from "@/lib/exporters";
import { formatHebrewDate } from "@/lib/hebrew-calendar";
import { monthKeyLabel, monthsWithData } from "@/lib/month-nav";
import {
  activeFilterChips,
  filterLearning,
  formatDayDate,
  incompleteCount,
  notableStatusWords,
  filterSeder,
  filtersActive,
  hoursState,
  needsAttention,
  parseJournalSearch,
  parseLocalDate,
  resolveOpenTarget,
  sederStatusWords,
  viewPatchFromSearch,
  WEEKDAYS_HE,
  type ExcusedFilter,
  type JournalView,
  type TypeFilter,
} from "@/lib/journal";
import { resetJournalFilters, useJournalView } from "@/lib/journal-state";
import { setSelectedMonth, useSelectedMonth } from "@/lib/period";
import { useSettings, SHAS_ARRIVAL_DEADLINE } from "@/lib/settings-store";
import { logProblem } from "@/lib/diagnostics";
import { toastUndo } from "@/lib/undo";
import { toast } from "sonner";
import { CONFLICT_SAVE_TEXT } from "@/lib/save-conflicts";

export const Route = createFileRoute("/history")({
  head: () => ({ meta: [{ title: "היומן שלי — סדר פלוס" }] }),
  validateSearch: (search: Record<string, unknown>) => parseJournalSearch(search),
  component: HistoryPage,
});

function HistoryPage() {
  const { entries, removeChecked, upsertChecked } = useSeder();
  const learning = useLearning();
  const [month] = useSelectedMonth();
  const [view, setView] = useJournalView();
  const [pdfBusy, setPdfBusy] = useState<string | null>(null);
  const [target, setTarget] = useState<DrawerTarget | null>(null);
  const search = Route.useSearch();
  const navigate = useNavigate();
  const monthAppliedFor = useRef("");

  // Arriving from a link (a search result, the month summary): pick the month,
  // apply an explicit kind/filter, and open the record. If the record is not
  // loaded yet the params stay put and this runs again when the data arrives.
  useEffect(() => {
    const wantsRecord = !!(search.id || search.date);
    const intent = viewPatchFromSearch(search);
    if (!search.month && !wantsRecord && !intent) return;
    const clear = () => void navigate({ to: "/history", search: {}, replace: true });
    if (!wantsRecord) {
      if (search.month) setSelectedMonth(search.month);
      // An explicit intent beats the saved tab and filters.
      if (intent) setView(intent);
      clear();
      return;
    }
    const hit = resolveOpenTarget(search, entries, learning.items);
    if (hit) {
      setSelectedMonth(hit.month);
      resetJournalFilters();
      setView({ tab: hit.kind });
      setTarget({ kind: hit.kind, id: hit.id });
      clear();
      return;
    }
    const sig = JSON.stringify(search);
    if (search.month && monthAppliedFor.current !== sig) {
      monthAppliedFor.current = sig;
      setSelectedMonth(search.month);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setView is a fresh closure each render
  }, [search, entries, learning.items, navigate]);

  const months = useMemo(() => monthsWithData(entries, learning.items), [entries, learning.items]);
  const monthEntries = useMemo(
    () => entries.filter((e) => e.date.startsWith(month)),
    [entries, month],
  );
  const monthLessons = useMemo(
    () => learning.items.filter((l) => l.date.startsWith(month)),
    [learning.items, month],
  );
  const closing = useMemo(
    () => monthClosing(month, monthEntries, monthLessons),
    [month, monthEntries, monthLessons],
  );

  const exportClosings = async (closings: MonthClosing[], busyKey: string) => {
    setPdfBusy(busyKey);
    try {
      // False means the save dialog was cancelled, not that anything failed.
      if (await exportMonthClosingsPdf({ closings })) toast.success("הסיכום יוצא ל-PDF");
    } catch (e) {
      logProblem("ייצוא סיכום חודשי", e);
      toast.error("הייצוא נכשל");
    } finally {
      setPdfBusy(null);
    }
  };

  const exportAllMonths = () => {
    const all = months
      .filter(
        (key) =>
          entries.some((e) => e.date.startsWith(key)) ||
          learning.items.some((l) => l.date.startsWith(key)),
      )
      .sort()
      .map((key) =>
        monthClosing(
          key,
          entries.filter((e) => e.date.startsWith(key)),
          learning.items.filter((l) => l.date.startsWith(key)),
        ),
      );
    if (!all.length) {
      toast.error("אין נתונים לייצוא");
      return;
    }
    void exportClosings(all, "__all");
  };

  const filteredSeder = useMemo(() => filterSeder(monthEntries, view), [monthEntries, view]);
  const filteredLessons = useMemo(() => filterLearning(monthLessons, view), [monthLessons, view]);
  const isSeder = view.tab === "seder";
  const shown = isSeder ? filteredSeder.length : filteredLessons.length;
  const total = isSeder ? monthEntries.length : monthLessons.length;
  const lessonMinutes = filteredLessons.reduce((s, i) => s + effectiveLearningMin(i), 0);

  return (
    <AppShell
      title="היומן שלי"
      subtitle={`${entries.length} רישומי סדר · ${learning.items.length} רישומי לימוד`}
      actions={
        <Button
          variant="outline"
          size="sm"
          onClick={exportAllMonths}
          disabled={pdfBusy !== null}
          title="ייצוא שורת סיכום לכל החודשים"
          aria-label="סיכום כל החודשים ל-PDF"
        >
          {pdfBusy === "__all" ? <Loader2 className="animate-spin" /> : <CalendarRange />}
          <span className="hidden lg:inline">סיכום כל החודשים</span>
        </Button>
      }
    >
      <div className="stack-gap">
        <JournalMonthBar months={months} />

        <Controls
          view={view}
          setView={setView}
          seder={monthEntries.length}
          lessons={monthLessons.length}
          incomplete={incompleteCount(monthEntries)}
        />

        <PageSection
          title={`${isSeder ? "נוכחות" : "לימוד נוסף"} · ${monthKeyLabel(month)}`}
          aside={
            <span className="flex flex-wrap items-baseline gap-x-4 gap-y-1" aria-live="polite">
              {!isSeder && (
                <span>
                  נחשב:{" "}
                  <span className="figure font-semibold text-foreground">{lessonMinutes}</span> דק׳
                </span>
              )}
              <span>
                {filtersActive(view) ? `${shown} מתוך ${total} רישומי החודש` : `${total} רישומים`}
              </span>
              {filtersActive(view) && (
                <button
                  type="button"
                  onClick={resetJournalFilters}
                  className="font-medium text-primary underline underline-offset-2"
                >
                  נקה סינון
                </button>
              )}
            </span>
          }
        >
          {isSeder ? (
            <AttendanceList
              entries={filteredSeder}
              empty={
                monthEntries.length === 0 ? (
                  <EmptyNote title="אין רישומי סדר בחודש הזה" />
                ) : (
                  <EmptyNote title="אין רישומים שתואמים לסינון">
                    <button
                      type="button"
                      onClick={resetJournalFilters}
                      className="text-primary underline underline-offset-2"
                    >
                      נקה סינון
                    </button>{" "}
                    כדי לראות את כל {monthEntries.length} רישומי החודש.
                  </EmptyNote>
                )
              }
              onOpen={(e) => setTarget({ kind: "seder", id: e.id })}
              onRemove={(e) => {
                // The notice and its undo appear only once the deletion reached storage.
                removeChecked(e.id).then(
                  (outcome) =>
                    outcome.complete
                      ? undoSederDelete(e, upsertChecked)
                      : toast.warning(CONFLICT_SAVE_TEXT),
                  (err: unknown) =>
                    toast.error(err instanceof Error ? err.message : "המחיקה נכשלה"),
                );
              }}
            />
          ) : (
            <LearningList
              items={filteredLessons}
              empty={
                monthLessons.length === 0 ? (
                  <EmptyNote title="אין רישומי לימוד בחודש הזה" />
                ) : (
                  <EmptyNote title="אין רישומים שתואמים לסינון" />
                )
              }
              onOpen={(l) => setTarget({ kind: "learning", id: l.id })}
              onRemove={(item) => {
                // The notice and its undo appear only once the deletion has reached
                // storage; a failed write leaves the record in place and says so.
                learning
                  .removeChecked(item.id)
                  .then((outcome) =>
                    outcome.complete
                      ? toastUndo("רישום הלימוד נמחק", () => learning.addChecked(item))
                      : toast.warning(CONFLICT_SAVE_TEXT),
                  )
                  .catch((e: unknown) =>
                    toast.error(e instanceof Error ? e.message : "המחיקה נכשלה"),
                  );
              }}
            />
          )}
        </PageSection>

        <MonthClosingSection
          closing={closing}
          busy={pdfBusy === month}
          disabled={pdfBusy !== null}
          onExport={() => exportClosings([closing], month)}
        />
      </div>

      <EntryDrawer target={target} onClose={() => setTarget(null)} />
    </AppShell>
  );
}

// --------------------------------------------------------------- controls

function Controls({
  view,
  setView,
  seder,
  lessons,
  incomplete,
}: {
  view: JournalView;
  setView: (patch: Partial<JournalView>) => void;
  seder: number;
  lessons: number;
  incomplete: number;
}) {
  const isSeder = view.tab === "seder";
  const [open, setOpen] = useState(false);
  const chips = activeFilterChips(view);
  const fixOn = isSeder && view.type === "incomplete";
  const tab = (on: boolean) =>
    `pressable -mb-px border-b-2 px-1 pb-1.5 text-sm ${on ? "border-primary font-semibold text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-x-5 gap-y-2 border-b border-border">
        <div className="flex gap-5" role="group" aria-label="סוג הרישומים">
          <button
            type="button"
            onClick={() => setView({ tab: "seder" })}
            aria-pressed={isSeder}
            className={tab(isSeder)}
          >
            נוכחות <span className="figure">({seder})</span>
          </button>
          <button
            type="button"
            onClick={() => setView({ tab: "learning" })}
            aria-pressed={!isSeder}
            className={tab(!isSeder)}
          >
            לימוד נוסף <span className="figure">({lessons})</span>
          </button>
        </div>
        <div className="relative mb-1.5 min-w-[160px] flex-1">
          <Search
            className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            type="search"
            value={view.q}
            onChange={(e) => setView({ q: e.target.value })}
            aria-label="חיפוש ברישומי החודש"
            placeholder={
              isSeder
                ? "חיפוש לפי תאריך, הערה, סיבה או תגית..."
                : "חיפוש לפי תאריך, מסגרת או הערה..."
            }
            className="field-input w-full ps-9"
          />
        </div>
        <div className="mb-1.5 flex items-center gap-2">
          {isSeder && (incomplete > 0 || fixOn) && (
            <button
              type="button"
              aria-pressed={fixOn}
              onClick={() => setView({ type: fixOn ? "all" : "incomplete" })}
              title="רשומות ללא שעות או ללא שעת הגעה. אין כאן הנחה שהייתה היעדרות."
              className={`pressable rounded-md border px-2.5 py-1.5 text-sm ${fixOn ? "border-primary bg-primary/10 font-medium" : "border-border text-muted-foreground hover:bg-accent"}`}
            >
              דורש תיקון <span className="figure">({incomplete})</span>
            </button>
          )}
          <button
            type="button"
            aria-expanded={open}
            aria-controls="journal-filters"
            onClick={() => setOpen((o) => !o)}
            className="pressable inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-sm hover:bg-accent"
          >
            <SlidersHorizontal className="size-3.5" aria-hidden="true" />
            סינון <span className="figure">({chips.length})</span>
          </button>
        </div>
      </div>

      {chips.length > 0 && (
        <ul className="flex flex-wrap items-center gap-1.5" aria-label="סינונים פעילים">
          {chips.map((c) => (
            <li key={c.key}>
              <button
                type="button"
                onClick={() => setView(c.clear)}
                aria-label={`הסר סינון: ${c.label}`}
                className="pressable inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-0.5 text-xs hover:bg-accent"
              >
                {c.label}
                <X className="size-3" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {open && (
        <div id="journal-filters" className="flex flex-wrap items-center gap-2">
          {isSeder ? (
            <>
              <select
                aria-label="סינון לפי סדר"
                value={view.seder}
                onChange={(e) => setView({ seder: e.target.value as JournalView["seder"] })}
                className="field-input"
              >
                <option value="all">כל הסדרים</option>
                <option value="1">סדר א׳</option>
                <option value="2">סדר ב׳</option>
              </select>
              <select
                aria-label="סינון לפי סוג"
                value={view.type}
                onChange={(e) => setView({ type: e.target.value as TypeFilter })}
                className="field-input"
              >
                <option value="all">כל הסוגים</option>
                <option value="exceptions">חריגות (איחור, היעדרות, יציאה מוקדמת)</option>
                <option value="late">איחור</option>
                <option value="absent">היעדרות</option>
                <option value="early">יציאה מוקדמת</option>
                <option value="incomplete">דורש תיקון (חסר פירוט שעות)</option>
                <option value="ohevei">אוהבי ה׳</option>
                <option value="bonus">בונוס</option>
              </select>
              <select
                aria-label="סינון לפי הצדקה"
                value={view.excused}
                onChange={(e) => setView({ excused: e.target.value as ExcusedFilter })}
                className="field-input"
              >
                <option value="all">מוצדק ולא מוצדק</option>
                <option value="excused">מוצדק בלבד</option>
                <option value="non-excused">לא מוצדק בלבד</option>
              </select>
            </>
          ) : (
            <select
              aria-label="סינון לפי מסגרת"
              value={view.framework}
              onChange={(e) => setView({ framework: e.target.value as JournalView["framework"] })}
              className="field-input"
            >
              <option value="all">כל המסגרות</option>
              <option value="kollel-erev">כולל ערב</option>
              <option value="torato-beyado">תורתו בידו</option>
              <option value="bein-hazmanim">ישיבת בין הזמנים</option>
            </select>
          )}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------- shared rows

/** Groups records by day, newest day first. */
function groupByDay<T extends { date: string }>(list: readonly T[]): [string, T[]][] {
  const map = new Map<string, T[]>();
  for (const x of list) map.set(x.date, [...(map.get(x.date) ?? []), x]);
  return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0));
}

/** One day: the date and weekday as the anchor, the day's records beside it. */
function DayGroup({ date, children }: { date: string; children: React.ReactNode }) {
  const d = parseLocalDate(date);
  return (
    <li className="row-pad grid gap-x-6 gap-y-1 md:grid-cols-[11rem_1fr]">
      <div>
        <div className="text-base font-semibold">{WEEKDAYS_HE[d.getDay()]}</div>
        <div className="text-sm text-muted-foreground">
          <span className="figure" dir="ltr">
            {formatDayDate(date)}
          </span>{" "}
          · {formatHebrewDate(d)}
        </div>
      </div>
      <div className="min-w-0">{children}</div>
    </li>
  );
}

/** Edit weighs more than delete: a labelled button against a muted icon. */
function RowActions({
  label,
  onOpen,
  onRemove,
}: {
  label: string;
  onOpen: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="ms-auto flex items-center gap-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8"
        onClick={onOpen}
        aria-label={`פרטים ועריכה: ${label}`}
      >
        פרטים
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-8 text-muted-foreground/70 hover:bg-destructive/10 hover:text-destructive"
        onClick={onRemove}
        aria-label={`מחק רישום: ${label}`}
        title="מחק רישום"
      >
        <Trash2 aria-hidden="true" />
      </Button>
    </div>
  );
}

function ExpandButton({
  open,
  onToggle,
  label,
}: {
  open: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-label={`${open ? "הסתר" : "הצג"} פרטים נוספים: ${label}`}
      className="pressable grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
    >
      {open ? (
        <ChevronUp className="size-4" aria-hidden="true" />
      ) : (
        <ChevronDown className="size-4" aria-hidden="true" />
      )}
    </button>
  );
}

const lineClass = "flex flex-wrap items-baseline gap-x-4 gap-y-1 py-[calc(var(--density-row)/3)]";

// ------------------------------------------------------------- attendance

function statusTone(e: SederEntry, c: SederCalc): MarkTone {
  const fullyExcused = c.excusedMin > 0 && c.netMissingMin === 0;
  if (fullyExcused) return "excused";
  return e.absent ? "absent" : "late";
}

/** Undo goes through the checked write: "restored" is said only once it is saved. */
function undoSederDelete(
  e: SederEntry,
  upsertChecked: (e: SederEntry, o?: { restore?: boolean }) => Promise<unknown>,
) {
  toast(`הרישום מ-${formatDayDate(e.date)} נמחק`, {
    duration: 8000,
    action: {
      label: "בטל",
      onClick: () => {
        upsertChecked(e, { restore: true }).then(
          (outcome) =>
            (outcome as { complete?: unknown } | undefined)?.complete === false
              ? toast.warning("הרישום לא שוחזר במלואו: נערך גם בחלון אחר")
              : toast.success("הרישום שוחזר"),
          (err) => toast.error(err instanceof Error ? err.message : "השחזור נכשל"),
        );
      },
    },
  });
}

function sederName(e: SederEntry) {
  return e.seder === 1 ? "סדר א׳" : "סדר ב׳";
}

function AttendanceList({
  entries,
  empty,
  onOpen,
  onRemove,
}: {
  entries: SederEntry[];
  empty: React.ReactNode;
  onOpen: (e: SederEntry) => void;
  onRemove: (e: SederEntry) => void;
}) {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const toggle = (id: string) =>
    setExpanded((s) => {
      const next = new Set(s);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const days = useMemo(
    () =>
      groupByDay(entries).map(
        ([date, list]) => [date, [...list].sort((a, b) => a.seder - b.seder)] as const,
      ),
    [entries],
  );
  if (!entries.length) return empty;

  return (
    <ul className="ledger border-y border-border">
      {days.map(([date, list]) => (
        <DayGroup key={date} date={date}>
          {list.map((e) => {
            const c = calcSeder(e);
            const words = notableStatusWords(e, c).join(" · ");
            const attention = needsAttention(e, c);
            const h = hoursState(e);
            const extras = extraDetails(e, c);
            const label = `${sederName(e)} ${formatDayDate(e.date)}`;
            const open = expanded.has(e.id);
            return (
              <div key={e.id}>
                <div className={lineClass}>
                  <span className="w-14 shrink-0 font-medium">{sederName(e)}</span>
                  <span className="figure w-36 shrink-0" dir="ltr" style={{ textAlign: "end" }}>
                    {h === "absent" ? "—" : `${e.arrival || "—"} – ${e.departure || "—"}`}
                  </span>
                  <span
                    className="figure w-24 shrink-0 text-end font-semibold"
                    title="חסר נטו, בדקות"
                  >
                    {c.netMissingMin > 0 && (
                      <>
                        {c.netMissingMin}
                        <span className="ms-1 text-xs font-normal text-muted-foreground">
                          דק׳ חסר
                        </span>
                      </>
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    {attention && words && <StatusMark tone={statusTone(e, c)}>{words}</StatusMark>}
                  </span>
                  <ExpandButton open={open} onToggle={() => toggle(e.id)} label={label} />
                  <RowActions label={label} onOpen={() => onOpen(e)} onRemove={() => onRemove(e)} />
                </div>
                {open && (
                  <ul className="mb-1 ms-[4.5rem] space-y-0.5 text-sm text-muted-foreground">
                    {extras.map((x) => (
                      <li key={x}>{x}</li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </DayGroup>
      ))}
    </ul>
  );
}

/** The detail that stays folded until asked for. */
function extraDetails(e: SederEntry, c: SederCalc): string[] {
  const out: string[] = [sederStatusWords(e, c).join(" · ")];
  out.push(`חסר נטו ${c.netMissingMin} דק׳ (גולמי ${c.missingMin}, לא מוצדק ${c.nonExcusedMin})`);
  if (c.excusedMin > 0)
    out.push(`מוצדק ${c.excusedMin} דק׳${e.excusedReason ? ` — ${e.excusedReason}` : ""}`);
  if (c.bonusMin > 0) out.push(`בונוס הגעה מוקדמת ${c.bonusMin} דק׳`);
  if (e.manualAdjustMin)
    out.push(`התאמה ידנית ${e.manualAdjustMin > 0 ? "+" : ""}${e.manualAdjustMin} דק׳`);
  if (e.tags?.length) out.push(`תגיות: ${e.tags.join(", ")}`);
  if (e.note) out.push(`הערה: ${e.note}`);
  return out;
}

// --------------------------------------------------------------- learning

function sourceLabel(l: LearningEntry) {
  return l.source === "timer" ? "טיימר" : l.source === "range" ? "טווח שעות" : "ידני";
}

function LearningList({
  items,
  empty,
  onOpen,
  onRemove,
}: {
  items: LearningEntry[];
  empty: React.ReactNode;
  onOpen: (l: LearningEntry) => void;
  onRemove: (l: LearningEntry) => void;
}) {
  const days = useMemo(() => groupByDay(items), [items]);
  if (!items.length) return empty;

  return (
    <ul className="ledger border-y border-border">
      {days.map(([date, list]) => (
        <DayGroup key={date} date={date}>
          {list.map((l) => {
            const label = `${FRAMEWORK_LABELS[l.framework]} ${formatDayDate(l.date)}`;
            return (
              <div key={l.id} className={lineClass}>
                <span className="w-36 shrink-0 font-medium">{FRAMEWORK_LABELS[l.framework]}</span>
                <span className="figure w-36 shrink-0 text-end font-semibold">
                  {effectiveLearningMin(l)}
                  <span className="ms-1 text-xs font-normal text-muted-foreground">דק׳ נחשבות</span>
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                  {l.tanitDibur && (
                    <span className="figure me-2 font-medium text-foreground">
                      ({l.minutes} ×2 תענית דיבור)
                    </span>
                  )}
                  {sourceLabel(l)}
                  {l.note ? ` · ${l.note}` : ""}
                </span>
                <RowActions label={label} onOpen={() => onOpen(l)} onRemove={() => onRemove(l)} />
              </div>
            );
          })}
        </DayGroup>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------- closing

/** The month's closing line: seder totals plus the learning minutes in it. */
function MonthClosingSection({
  closing,
  busy,
  disabled,
  onExport,
}: {
  closing: MonthClosing;
  busy: boolean;
  disabled: boolean;
  onExport: () => void;
}) {
  const { seder, learning } = closing;
  const { settings } = useSettings();
  const shasChavura = settings.seder.shasChavura;
  const erevNote =
    learning.kollelErev !== learning.kollelErevRaw
      ? `${learning.kollelErevRaw} דק׳ בפועל · תענית דיבור נספרת כפול`
      : undefined;

  return (
    <PageSection
      title={`${closing.closed ? "סיכום החודש" : "סיכום עד כה"} · ${closing.gregorianLabel}`}
      aside={
        <Button variant="outline" size="sm" onClick={onExport} disabled={disabled}>
          {busy ? <Loader2 className="animate-spin" /> : <FileDown />}
          ייצוא סיכום החודש ל-PDF
        </Button>
      }
    >
      <p className="mb-4 text-sm text-muted-foreground">
        {closing.hebrewLabel} · {seder.entries} רישומי סדר
        {!closing.closed && " · החודש טרם הסתיים"}
      </p>
      <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4 lg:grid-cols-7">
        <Figure label="חסר נטו" value={seder.netMissing} unit="דק׳" />
        <Figure label="סה״כ חסר" value={seder.totalMissing} unit="דק׳" />
        <Figure label="מוצדק" value={seder.excused} unit="דק׳" />
        <Figure label="איחורים" value={seder.lateCount} />
        <Figure label="חיסורים" value={seder.absenceCount} />
        <Figure label="אוהבי ה׳" value={seder.oheveiCount} />
        <Figure label="כולל ערב" value={learning.kollelErev} unit="דק׳" note={erevNote} />
        {learning.toratoBeyado > 0 && (
          <Figure label="תורתו בידו" value={learning.toratoBeyado} unit="דק׳" />
        )}
        {learning.beinHazmanim > 0 && (
          <Figure label="בין הזמנים" value={learning.beinHazmanim} unit="דק׳" />
        )}
        {shasChavura && (
          <Figure
            label="חבורת ש״ס"
            value={seder.shasCount}
            note={`הגעות לסדר ב׳ עד ${SHAS_ARRIVAL_DEADLINE}`}
          />
        )}
      </div>
    </PageSection>
  );
}
