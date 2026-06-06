import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { AppShell } from "@/components/app-shell";
import { FileDown, FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import { exportPdfReport, exportXlsxWorkbook, DEFAULT_SECTIONS, type ReportSections } from "@/lib/exporters";
import { useAttendance, useLearning } from "@/lib/tracker-store";
import { toast } from "sonner";

export const Route = createFileRoute("/reports")({
  head: () => ({ meta: [{ title: "דוחות — המעקב שלי" }] }),
  component: ReportsPage,
});

const SECTION_LABELS: Record<keyof ReportSections, string> = {
  kpis: "סיכומי KPI",
  charts: "תרשימי פילוח",
  yearlyBreakdown: "פירוט חודשי שנתי",
  monthlyTable: "טבלת רישומים מפורטת",
  excusedSummary: "סיכום היעדרויות מוצדקות",
  learning: "שעות לימוד נוסף",
};

function ReportsPage() {
  const { records } = useAttendance();
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
        const from = `${y}-${String(m + 1).padStart(2, "0")}-01`;
        const last = new Date(y, m + 1, 0).getDate();
        const to = `${y}-${String(m + 1).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
        await exportPdfReport({ title: "דוח נוכחות חודשי", records, lessons, sections, range: { from, to } });
      },
    },
    {
      key: "yearly", title: "דוח שנתי", desc: "סקירה שנתית עם מגמות",
      icon: FileText, format: "PDF" as const,
      run: async () => {
        const y = new Date().getFullYear();
        await exportPdfReport({
          title: `דוח נוכחות שנתי ${y}`, records, lessons, sections,
          range: { from: `${y}-01-01`, to: `${y}-12-31` },
        });
      },
    },
    {
      key: "exec", title: "תקציר מנהלים", desc: "KPI בלבד · עמוד אחד",
      icon: FileText, format: "PDF" as const,
      run: async () => {
        await exportPdfReport({
          title: "תקציר מנהלים — סיכום אישי", records, lessons,
          sections: { ...DEFAULT_SECTIONS, monthlyTable: false, learning: false, excusedSummary: false },
        });
      },
    },
    {
      key: "learn", title: "דוח לימוד נוסף", desc: "שיעורים, שעות, ופירוט",
      icon: FileText, format: "PDF" as const,
      run: async () => {
        await exportPdfReport({
          title: "דוח לימוד נוסף", records, lessons,
          sections: { ...DEFAULT_SECTIONS, monthlyTable: false, yearlyBreakdown: false, excusedSummary: false, kpis: false, charts: false, learning: true },
        });
      },
    },
    {
      key: "xlsx", title: "ייצוא לאקסל", desc: "4 גליונות: נוכחות, לימוד, חודשי, סטטיסטיקות",
      icon: FileSpreadsheet, format: "XLSX" as const,
      run: async () => exportXlsxWorkbook({ records, lessons }),
    },
  ], [records, lessons, sections]);

  const runPreset = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try { await fn(); toast.success("הדוח הופק"); }
    catch (e) { toast.error("ההפקה נכשלה"); console.error(e); }
    finally { setBusy(null); }
  };

  const runCustom = async () => {
    if (from && to && from > to) { toast.error("טווח תאריכים לא תקין"); return; }
    setBusy("custom");
    try {
      if (fmt === "xlsx") {
        const inRange = records.filter((r) => (!from || r.date >= from) && (!to || r.date <= to));
        const lInRange = lessons.filter((l) => (!from || l.date >= from) && (!to || l.date <= to));
        exportXlsxWorkbook({ records: inRange, lessons: lInRange });
      } else {
        await exportPdfReport({
          title: "דוח מותאם אישית", records, lessons, sections,
          range: from && to ? { from, to } : undefined,
        });
      }
      toast.success("הדוח הופק");
    } catch (e) { toast.error("ההפקה נכשלה"); console.error(e); }
    finally { setBusy(null); }
  };

  return (
    <AppShell title="דוחות" subtitle="הפקה וייצוא של דוחות אישיים">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {presets.map((p) => (
          <div key={p.key} className="card-surface p-5 flex items-start gap-4">
            <div className="size-12 rounded-xl bg-primary/10 text-primary grid place-items-center shrink-0">
              <p.icon className="size-6" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold">{p.title}</h3>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{p.format}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">{p.desc}</p>
              <div className="mt-4 flex gap-2">
                <button onClick={() => runPreset(p.key, p.run)} disabled={busy !== null}
                  className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                  {busy === p.key ? <Loader2 className="size-3.5 animate-spin" /> : <FileDown className="size-3.5" />}
                  {busy === p.key ? "מפיק..." : "הורדה"}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5 card-surface p-5">
        <h2 className="text-sm font-semibold mb-3">דוח מותאם אישית</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-muted-foreground">מתאריך</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
              className="mt-1 w-full rounded-md border border-input bg-card px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">עד תאריך</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
              className="mt-1 w-full rounded-md border border-input bg-card px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">פורמט</label>
            <select value={fmt} onChange={(e) => setFmt(e.target.value as "pdf" | "xlsx")}
              className="mt-1 w-full rounded-md border border-input bg-card px-3 py-2 text-sm">
              <option value="pdf">PDF</option>
              <option value="xlsx">Excel (XLSX)</option>
            </select>
          </div>
        </div>

        <div className="mt-5">
          <div className="text-xs font-medium text-muted-foreground mb-2">מה לכלול בדוח (PDF)</div>
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
