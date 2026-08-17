import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { AppShell } from "@/components/app-shell";
import { FileDown, FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import { exportPdfReport, exportXlsxWorkbook, DEFAULT_SECTIONS, type ReportSections } from "@/lib/exporters";
import { useSeder, useLearning } from "@/lib/kollel-store";
import { StackedField } from "@/components/ui/form";
import { IconBadge } from "@/components/ui/stat";
import { toast } from "sonner";

export const Route = createFileRoute("/reports")({
  head: () => ({ meta: [{ title: "דוחות — המעקב שלי" }] }),
  component: ReportsPage,
});

const SECTION_LABELS: Record<keyof ReportSections, string> = {
  kpis: "סיכומי KPI",
  charts: "תרשימי פילוח",
  yearlyBreakdown: "סיכום חודשי",
  monthlyTable: "פירוט סדרים",
  excusedSummary: "מוצדקים",
  learning: "לימוד נוסף",
  oheveiList: "רשימת אוהבי ה׳",
};

function ReportsPage() {
  const { entries } = useSeder();
  const { items: lessons } = useLearning();
  const [busy, setBusy] = useState<string | null>(null);
  const [sections, setSections] = useState<ReportSections>(DEFAULT_SECTIONS);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [fmt, setFmt] = useState<"pdf" | "xlsx">("pdf");

  const presets = useMemo(() => [
    {
      key: "monthly", title: "דוח חודשי", desc: "סיכום מלא של החודש הנוכחי",
      icon: FileText, format: "PDF" as const,
      run: async () => {
        const now = new Date();
        const y = now.getFullYear(), m = now.getMonth();
        const last = new Date(y, m + 1, 0).getDate();
        return exportPdfReport({
          title: "דוח נוכחות חודשי — כולל", entries, lessons, sections,
          range: { from: `${y}-${String(m + 1).padStart(2, "0")}-01`, to: `${y}-${String(m + 1).padStart(2, "0")}-${String(last).padStart(2, "0")}` },
        });
      },
    },
    {
      key: "yearly", title: "דוח שנתי", desc: "סקירה שנתית עם מגמות",
      icon: FileText, format: "PDF" as const,
      run: async () => {
        const y = new Date().getFullYear();
        return exportPdfReport({
          title: `דוח שנתי ${y}`, entries, lessons, sections,
          range: { from: `${y}-01-01`, to: `${y}-12-31` },
        });
      },
    },
    {
      key: "exec", title: "תקציר מנהלים", desc: "KPI ותרשימים בלבד",
      icon: FileText, format: "PDF" as const,
      run: async () => {
        return exportPdfReport({
          title: "תקציר מנהלים", entries, lessons,
          sections: { ...DEFAULT_SECTIONS, monthlyTable: false, learning: false, excusedSummary: false, oheveiList: false },
        });
      },
    },
    {
      key: "learn", title: "דוח לימוד נוסף", desc: "כל המסגרות והשעות",
      icon: FileText, format: "PDF" as const,
      run: async () => {
        return exportPdfReport({
          title: "דוח לימוד נוסף", entries, lessons,
          sections: { kpis: false, charts: false, yearlyBreakdown: false, monthlyTable: false, excusedSummary: false, oheveiList: false, learning: true },
        });
      },
    },
    {
      key: "xlsx", title: "ייצוא לאקסל", desc: "סדרים, לימוד, סיכום חודשי",
      icon: FileSpreadsheet, format: "XLSX" as const,
      run: () => exportXlsxWorkbook({ entries, lessons }),
    },
  ], [entries, lessons, sections]);

  // The exporters resolve false when the user cancels the save dialog, which
  // must not be reported as a successful export.
  const runPreset = async (key: string, fn: () => Promise<boolean>) => {
    setBusy(key);
    try { if (await fn()) toast.success("הדוח הופק"); }
    catch (e) { toast.error("ההפקה נכשלה"); console.error(e); }
    finally { setBusy(null); }
  };

  const runCustom = async () => {
    if (from && to && from > to) { toast.error("טווח לא תקין"); return; }
    setBusy("custom");
    try {
      let exported: boolean;
      if (fmt === "xlsx") {
        const inEnts = entries.filter((e) => (!from || e.date >= from) && (!to || e.date <= to));
        const inLsn = lessons.filter((l) => (!from || l.date >= from) && (!to || l.date <= to));
        exported = await exportXlsxWorkbook({ entries: inEnts, lessons: inLsn });
      } else {
        exported = await exportPdfReport({
          title: "דוח מותאם אישית", entries, lessons, sections,
          range: from && to ? { from, to } : undefined,
        });
      }
      // False means the save dialog was cancelled, not that anything failed.
      if (exported) toast.success("הדוח הופק");
    } catch (e) { toast.error("ההפקה נכשלה"); console.error(e); }
    finally { setBusy(null); }
  };

  return (
    <AppShell title="דוחות" subtitle="הפקה וייצוא דוחות אישיים">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {presets.map((p) => (
          <div key={p.key} className="card-surface p-5 flex items-start gap-4">
            <IconBadge icon={p.icon} size="lg" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold">{p.title}</h3>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{p.format}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">{p.desc}</p>
              <button onClick={() => runPreset(p.key, p.run)} disabled={busy !== null}
                className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                {busy === p.key ? <Loader2 className="size-3.5 animate-spin" /> : <FileDown className="size-3.5" />}
                {busy === p.key ? "מפיק..." : "הורדה"}
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5 card-surface p-5">
        <h2 className="text-sm font-semibold mb-3">דוח מותאם אישית</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <StackedField label="מתאריך">
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
              className="field-input w-full" />
          </StackedField>
          <StackedField label="עד תאריך">
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
              className="field-input w-full" />
          </StackedField>
          <StackedField label="פורמט">
            <select value={fmt} onChange={(e) => setFmt(e.target.value as "pdf" | "xlsx")}
              className="field-input w-full">
              <option value="pdf">PDF</option>
              <option value="xlsx">Excel (XLSX)</option>
            </select>
          </StackedField>
        </div>

        <div className="mt-5">
          <div className="text-xs font-medium text-muted-foreground mb-2">סעיפים לכלול (PDF)</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {(Object.keys(SECTION_LABELS) as (keyof ReportSections)[]).map((k) => (
              <label key={k} className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm cursor-pointer hover:bg-accent">
                <input type="checkbox" checked={sections[k]}
                  onChange={(e) => setSections({ ...sections, [k]: e.target.checked })}
                  className="accent-primary" />
                <span>{SECTION_LABELS[k]}</span>
              </label>
            ))}
          </div>
        </div>

        <button onClick={runCustom} disabled={busy !== null}
          className="mt-4 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
          {busy === "custom" ? <Loader2 className="size-4 animate-spin" /> : <FileDown className="size-4" />}
          הפקת דוח
        </button>
      </div>
    </AppShell>
  );
}
