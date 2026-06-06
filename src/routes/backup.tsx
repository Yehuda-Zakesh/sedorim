import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { Download, Upload, Cloud, CheckCircle2, HardDrive } from "lucide-react";

export const Route = createFileRoute("/backup")({
  head: () => ({ meta: [{ title: "גיבוי ושחזור — המעקב שלי" }] }),
  component: BackupPage,
});

const backups = [
  { date: "2026-06-03 22:10", size: "1.2 MB", type: "אוטומטי" },
  { date: "2026-05-27 22:10", size: "1.1 MB", type: "אוטומטי" },
  { date: "2026-05-20 14:35", size: "1.1 MB", type: "ידני" },
  { date: "2026-05-13 22:10", size: "1.0 MB", type: "אוטומטי" },
];

function BackupPage() {
  return (
    <AppShell title="גיבוי ושחזור" subtitle="ניהול עותקי גיבוי אישיים">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
        <div className="card-surface p-5">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-lg bg-success/10 text-success grid place-items-center">
              <CheckCircle2 className="size-5" />
            </div>
            <div>
              <div className="text-xs text-muted-foreground">גיבוי אחרון</div>
              <div className="text-sm font-semibold">לפני 3 ימים</div>
            </div>
          </div>
        </div>
        <div className="card-surface p-5">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-lg bg-info/10 text-info grid place-items-center">
              <Cloud className="size-5" />
            </div>
            <div>
              <div className="text-xs text-muted-foreground">גיבוי הבא</div>
              <div className="text-sm font-semibold">בעוד 4 ימים · אוטומטי</div>
            </div>
          </div>
        </div>
        <div className="card-surface p-5">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-lg bg-primary/10 text-primary grid place-items-center">
              <HardDrive className="size-5" />
            </div>
            <div>
              <div className="text-xs text-muted-foreground">סה״כ נפח</div>
              <div className="text-sm font-semibold tabular-nums">4.4 MB</div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
        <button className="card-surface p-6 text-right hover:border-primary transition group">
          <Download className="size-6 text-primary mb-3" />
          <div className="text-sm font-semibold">צור גיבוי עכשיו</div>
          <div className="text-xs text-muted-foreground mt-1">הורד עותק מקומי של כל הנתונים שלך</div>
        </button>
        <button className="card-surface p-6 text-right hover:border-primary transition">
          <Upload className="size-6 text-primary mb-3" />
          <div className="text-sm font-semibold">שחזור מקובץ</div>
          <div className="text-xs text-muted-foreground mt-1">העלה קובץ גיבוי קודם לשחזור הנתונים</div>
        </button>
      </div>

      <div className="card-surface overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="text-sm font-semibold">גיבויים זמינים</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="text-right px-5 py-3 font-medium">תאריך</th>
              <th className="text-right px-5 py-3 font-medium">סוג</th>
              <th className="text-right px-5 py-3 font-medium">גודל</th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {backups.map((b) => (
              <tr key={b.date} className="border-t border-border hover:bg-accent/40">
                <td className="px-5 py-3 tabular-nums">{b.date}</td>
                <td className="px-5 py-3">{b.type}</td>
                <td className="px-5 py-3 tabular-nums">{b.size}</td>
                <td className="px-5 py-3 text-left">
                  <button className="text-xs text-primary hover:underline">הורדה</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
