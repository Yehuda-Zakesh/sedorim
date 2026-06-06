import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { Plus, Pencil, Trash2, Settings as Cog, Download, Upload } from "lucide-react";

export const Route = createFileRoute("/audit")({
  head: () => ({ meta: [{ title: "יומן ביקורת — המעקב שלי" }] }),
  component: AuditPage,
});

const entries = [
  { time: "06.06 09:14", action: "רישום נוכחות נוסף", detail: "סטטוס: נוכח", icon: Plus, tone: "success" },
  { time: "05.06 18:22", action: "עדכון הגדרות", detail: "התראות הופעלו", icon: Cog, tone: "info" },
  { time: "05.06 08:05", action: "רישום נוכחות נוסף", detail: "סטטוס: נוכח", icon: Plus, tone: "success" },
  { time: "04.06 17:50", action: "ייצוא דוח", detail: "דוח חודשי PDF", icon: Download, tone: "info" },
  { time: "04.06 09:01", action: "עדכון רישום", detail: "ג׳ 3.6 שונה לאיחור", icon: Pencil, tone: "warning" },
  { time: "03.06 22:10", action: "גיבוי הושלם", detail: "אוטומטי שבועי", icon: Upload, tone: "success" },
  { time: "01.06 11:30", action: "מחיקת שיעור", detail: "תגבור היסטוריה", icon: Trash2, tone: "destructive" },
];

const toneMap: Record<string, string> = {
  success: "bg-success/10 text-success",
  info: "bg-info/10 text-info",
  warning: "bg-warning/10 text-warning",
  destructive: "bg-destructive/10 text-destructive",
};

function AuditPage() {
  return (
    <AppShell title="יומן ביקורת" subtitle="תיעוד פעולות שביצעת במערכת">
      <div className="card-surface p-6">
        <ol className="relative border-r-2 border-border pr-6 space-y-5">
          {entries.map((e, i) => (
            <li key={i} className="relative">
              <span className={`absolute -right-[34px] top-1 size-7 rounded-full grid place-items-center ${toneMap[e.tone]}`}>
                <e.icon className="size-3.5" />
              </span>
              <div className="flex items-baseline gap-3 flex-wrap">
                <h3 className="text-sm font-semibold">{e.action}</h3>
                <span className="text-xs text-muted-foreground tabular-nums">{e.time}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">{e.detail}</p>
            </li>
          ))}
        </ol>
      </div>
    </AppShell>
  );
}
