// Reports, as four short steps: what to produce, in which format, with which
// options, and then the button. Producing a report is an action on a period,
// so the last step states the period and the data exactly as they will be sent
// to the exporter (src/lib/report-range.ts builds both from the same plan).
// The month chosen in the "סיכום חודש" area is the default period.
import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { AppShell } from "@/components/app-shell";
import { FileDown, Loader2, CalendarRange } from "lucide-react";
import {
  exportPdfReport,
  exportXlsxWorkbook,
  DEFAULT_SECTIONS,
  type ReportSections,
} from "@/lib/exporters";
import { useSeder, useLearning } from "@/lib/kollel-store";
import { StackedField } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { PageSection, Notice } from "@/components/ui/ledger";
import { MonthPicker } from "@/components/month-picker";
import { useSelectedMonth } from "@/lib/period";
import { monthKeyLabel, monthsWithData } from "@/lib/month-nav";
import { planReport, describeContents, type ReportKind, type RangeMode } from "@/lib/report-range";
import { toast } from "sonner";

export const Route = createFileRoute("/reports")({
  head: () => ({ meta: [{ title: "דוחות — המעקב שלי" }] }),
  component: ReportsPage,
});

const SECTION_LABELS: Record<keyof ReportSections, string> = {
  kpis: "סיכומי מדדים",
  charts: "תרשימי פילוח",
  yearlyBreakdown: "סיכום חודשי",
  monthlyTable: "פירוט סדרים",
  excusedSummary: "מוצדקים",
  learning: "לימוד נוסף",
  oheveiList: "רשימת אוהבי ה׳",
};

const KINDS: {
  key: ReportKind;
  title: string;
  desc: (monthLabel: string, year: number) => string;
}[] = [
  { key: "monthly", title: "דוח חודשי", desc: (m) => `סיכום מלא של ${m}` },
  { key: "yearly", title: "דוח שנתי", desc: (_, y) => `סקירה שנתית עם מגמות, ${y}` },
  { key: "exec", title: "תקציר", desc: () => "מדדים ותרשימים בלבד, לכל התקופה" },
  { key: "learn", title: "דוח לימוד נוסף", desc: () => "כל המסגרות והשעות, לכל התקופה" },
  { key: "xlsx", title: "ייצוא לאקסל", desc: () => "סדרים, לימוד, סיכום חודשי: כל הנתונים" },
  { key: "custom", title: "דוח מותאם אישית", desc: () => "בחירת טווח, פורמט וסעיפים" },
];

function ReportsPage() {
  const { entries } = useSeder();
  const { items: lessons } = useLearning();
  const [month, setMonth] = useSelectedMonth();
  const months = useMemo(() => monthsWithData(entries, lessons), [entries, lessons]);
  const monthLabel = monthKeyLabel(month);
  const year = Number(month.slice(0, 4));

  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState<ReportKind>("monthly");
  const [sections, setSections] = useState<ReportSections>(DEFAULT_SECTIONS);
  const [rangeMode, setRangeMode] = useState<RangeMode>("month");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [fmt, setFmt] = useState<"pdf" | "xlsx">("pdf");

  // One plan: the line shown before producing and the exporter's arguments.
  const plan = planReport({ kind, fmt, rangeMode, month, from, to });
  const effectiveFmt = plan.format;
  const usesSections =
    effectiveFmt === "pdf" && (kind === "monthly" || kind === "yearly" || kind === "custom");
  const chosenSections = (Object.keys(SECTION_LABELS) as (keyof ReportSections)[])
    .filter((k) => sections[k])
    .map((k) => SECTION_LABELS[k]);
  const noSections = usesSections && chosenSections.length === 0;
  const problem = plan.problem ?? (noSections ? "בחר לפחות סעיף אחד לדוח." : null);

  const run = async (): Promise<boolean> => {
    switch (kind) {
      case "monthly":
        return exportPdfReport({
          title: "דוח נוכחות חודשי",
          entries,
          lessons,
          sections,
          range: plan.pdfRange,
        });
      case "yearly":
        return exportPdfReport({
          title: `דוח שנתי ${year}`,
          entries,
          lessons,
          sections,
          range: plan.pdfRange,
        });
      case "exec":
        return exportPdfReport({
          title: "תקציר",
          entries,
          lessons,
          sections: {
            ...DEFAULT_SECTIONS,
            monthlyTable: false,
            learning: false,
            excusedSummary: false,
            oheveiList: false,
          },
        });
      case "learn":
        return exportPdfReport({
          title: "דוח לימוד נוסף",
          entries,
          lessons,
          sections: {
            kpis: false,
            charts: false,
            yearlyBreakdown: false,
            monthlyTable: false,
            excusedSummary: false,
            oheveiList: false,
            learning: true,
          },
        });
      case "xlsx":
        return exportXlsxWorkbook({ entries, lessons });
      case "custom": {
        if (fmt === "xlsx") {
          const lo = plan.xlsxFrom;
          const hi = plan.xlsxTo;
          const inEnts = entries.filter((e) => (!lo || e.date >= lo) && (!hi || e.date <= hi));
          const inLsn = lessons.filter((l) => (!lo || l.date >= lo) && (!hi || l.date <= hi));
          return exportXlsxWorkbook({ entries: inEnts, lessons: inLsn });
        }
        return exportPdfReport({
          title: "דוח מותאם אישית",
          entries,
          lessons,
          sections,
          range: plan.pdfRange,
        });
      }
    }
  };

  const generate = async () => {
    if (problem) return;
    setBusy(true);
    try {
      // The exporters resolve false when the save dialog is cancelled, which
      // must not be reported as a successful export.
      if (await run()) toast.success("הדוח הופק");
    } catch (e) {
      toast.error("ההפקה נכשלה");
      console.error(e);
    } finally {
      setBusy(false);
    }
  };

  const kindTitle = KINDS.find((k) => k.key === kind)?.title ?? "";
  const periodText =
    plan.periodLabel === "החודש הנבחר" ? `${monthLabel} (החודש הנבחר)` : plan.periodLabel;

  return (
    <AppShell title="דוחות" subtitle="הפקה וייצוא דוחות של המעקב שלי">
      <div className="stack-gap">
        <MonthPicker
          value={month}
          months={months}
          onChange={setMonth}
          leading={<CalendarRange className="size-3.5 text-muted-foreground" aria-hidden="true" />}
        />

        <Step n={1} title="סוג הדוח">
          <div role="radiogroup" aria-label="סוג הדוח" className="ledger">
            {KINDS.map((k) => {
              const selected = kind === k.key;
              return (
                <label
                  key={k.key}
                  className={`row-pad flex items-start gap-3 px-2 cursor-pointer pressable transition ${
                    selected ? "bg-primary/10" : "hover:bg-accent/50"
                  }`}
                >
                  <input
                    type="radio"
                    name="report-kind"
                    checked={selected}
                    onChange={() => setKind(k.key)}
                    className="mt-1 accent-primary"
                  />
                  <span className="min-w-0">
                    <span className={`block text-sm ${selected ? "font-semibold" : "font-medium"}`}>
                      {k.title}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {k.desc(monthLabel, year)}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </Step>

        <Step n={2} title="פורמט">
          {kind === "custom" ? (
            <StackedField label="פורמט הקובץ">
              <select
                value={fmt}
                onChange={(e) => setFmt(e.target.value as "pdf" | "xlsx")}
                className="field-input w-full sm:w-64"
              >
                <option value="pdf">PDF</option>
                <option value="xlsx">Excel (XLSX)</option>
              </select>
            </StackedField>
          ) : (
            <p className="text-sm">
              <span className="figure me-2 rounded-sm border border-border px-1.5 py-0.5 text-xs font-semibold">
                {effectiveFmt === "pdf" ? "PDF" : "XLSX"}
              </span>
              <span className="text-xs text-muted-foreground">
                הפורמט נקבע לפי סוג הדוח. לבחירת פורמט, בחר &quot;דוח מותאם אישית&quot;.
              </span>
            </p>
          )}
        </Step>

        <Step n={3} title="אפשרויות">
          {kind === "custom" && (
            <div className="mb-4">
              <div className="eyebrow mb-2">טווח התאריכים</div>
              <div role="radiogroup" aria-label="טווח התאריכים" className="flex flex-wrap gap-2">
                {(
                  [
                    ["month", `החודש הנבחר (${monthLabel})`],
                    ["all", "כל התקופה"],
                    ["dates", "טווח תאריכים"],
                  ] as [RangeMode, string][]
                ).map(([k, label]) => (
                  <label
                    key={k}
                    className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm cursor-pointer ${
                      rangeMode === k
                        ? "border-primary bg-primary/10 font-medium"
                        : "border-border hover:bg-accent"
                    }`}
                  >
                    <input
                      type="radio"
                      name="report-range"
                      checked={rangeMode === k}
                      onChange={() => setRangeMode(k)}
                      className="accent-primary"
                    />
                    {label}
                  </label>
                ))}
              </div>
              {rangeMode === "dates" && (
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <StackedField label="מתאריך">
                    <input
                      type="date"
                      value={from}
                      onChange={(e) => setFrom(e.target.value)}
                      aria-invalid={!!plan.problem && !from}
                      className="field-input w-full"
                    />
                  </StackedField>
                  <StackedField label="עד תאריך">
                    <input
                      type="date"
                      value={to}
                      onChange={(e) => setTo(e.target.value)}
                      aria-invalid={!!plan.problem && !to}
                      className="field-input w-full"
                    />
                  </StackedField>
                  <p className="sm:col-span-2 text-xs text-muted-foreground">
                    {effectiveFmt === "pdf"
                      ? "דוח PDF דורש את שני התאריכים."
                      : "בקובץ Excel אפשר למלא תאריך אחד בלבד: הטווח פתוח בצד השני."}
                  </p>
                </div>
              )}
            </div>
          )}

          {usesSections ? (
            <div>
              <div className="eyebrow mb-2">סעיפים לכלול (PDF)</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {(Object.keys(SECTION_LABELS) as (keyof ReportSections)[]).map((k) => (
                  <label
                    key={k}
                    className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm cursor-pointer hover:bg-accent"
                  >
                    <input
                      type="checkbox"
                      checked={sections[k]}
                      onChange={(e) => setSections({ ...sections, [k]: e.target.checked })}
                      className="accent-primary"
                    />
                    <span>{SECTION_LABELS[k]}</span>
                  </label>
                ))}
              </div>
            </div>
          ) : (
            kind !== "custom" && (
              <p className="text-xs text-muted-foreground">
                אין אפשרויות נוספות לדוח זה: הסעיפים והתקופה קבועים לפי סוג הדוח.
              </p>
            )
          )}
          {kind === "custom" && !usesSections && (
            <p className="text-xs text-muted-foreground">
              בקובץ Excel נכללים תמיד כל הסעיפים; הטווח מסנן את הרישומים.
            </p>
          )}
        </Step>

        <Step n={4} title="הפקה">
          <div className="card-surface px-4 py-1">
            <div className="ledger">
              <SummaryRow label="סוג הדוח" value={kindTitle} />
              <SummaryRow label="תקופה" value={periodText} />
              <SummaryRow
                label="נתונים"
                value={describeContents(kind, effectiveFmt, chosenSections)}
              />
              <SummaryRow label="פורמט" value={effectiveFmt === "pdf" ? "PDF" : "XLSX"} />
            </div>
          </div>
          {problem && (
            <div className="mt-3">
              <Notice tone="warning" title="אי אפשר להפיק עדיין">
                {problem}
              </Notice>
            </div>
          )}
          <div className="mt-4">
            <Button onClick={generate} disabled={busy || !!problem}>
              {busy ? (
                <Loader2 className="animate-spin" aria-hidden="true" />
              ) : (
                <FileDown aria-hidden="true" />
              )}
              {busy ? "מפיק..." : "הפקת דוח"}
            </Button>
          </div>
        </Step>
      </div>
    </AppShell>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="row-pad flex items-baseline gap-4 text-sm">
      <span className="w-20 shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 font-medium">{value}</span>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <PageSection>
      <h2 className="mb-3 flex items-baseline gap-2 text-base font-semibold">
        <span className="figure text-muted-foreground" aria-hidden="true">
          {n}.
        </span>
        <span>
          <span className="sr-only">שלב {n}: </span>
          {title}
        </span>
      </h2>
      {children}
    </PageSection>
  );
}
