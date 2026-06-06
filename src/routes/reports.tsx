import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { FileDown, FileSpreadsheet, FileText, Printer } from "lucide-react";

export const Route = createFileRoute("/reports")({
  head: () => ({ meta: [{ title: "דוחות — המעקב שלי" }] }),
  component: ReportsPage,
});

const presets = [
  { title: "דוח חודשי", desc: "סיכום מלא של החודש הנוכחי", icon: FileText, format: "PDF" },
  { title: "דוח שנתי", desc: "סקירה שנתית עם מגמות", icon: FileText, format: "PDF" },
  { title: "ייצוא לאקסל", desc: "כל הרישומים כטבלה", icon: FileSpreadsheet, format: "XLSX" },
  { title: "דוח לימוד נוסף", desc: "שעות ושיעורים שהושלמו", icon: FileText, format: "PDF" },
];

function ReportsPage() {
  return (
    <AppShell title="דוחות" subtitle="הפקה וייצוא של דוחות אישיים">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {presets.map((p) => (
          <div key={p.title} className="card-surface p-5 flex items-start gap-4">
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
                <button className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90">
                  <FileDown className="size-3.5" /> הורדה
                </button>
                <button className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-accent">
                  <Printer className="size-3.5" /> הדפסה
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
            <input type="date" className="mt-1 w-full rounded-md border border-input bg-card px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">עד תאריך</label>
            <input type="date" className="mt-1 w-full rounded-md border border-input bg-card px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">פורמט</label>
            <select className="mt-1 w-full rounded-md border border-input bg-card px-3 py-2 text-sm">
              <option>PDF</option><option>Excel</option><option>CSV</option>
            </select>
          </div>
        </div>
        <button className="mt-4 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          <FileDown className="size-4" /> הפקת דוח
        </button>
      </div>
    </AppShell>
  );
}
