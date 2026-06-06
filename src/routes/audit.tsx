import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import {
  Plus, Pencil, Trash2, Settings as Cog, Download, Upload,
  ShieldCheck, FileText, AlertTriangle, Search, Eraser,
} from "lucide-react";
import { useAudit, ACTION_LABELS, type AuditAction } from "@/lib/audit-store";

export const Route = createFileRoute("/audit")({
  head: () => ({ meta: [{ title: "יומן ביקורת — המעקב שלי" }] }),
  component: AuditPage,
});

const ICONS: Record<AuditAction, { icon: typeof Plus; tone: string }> = {
  "attendance.create": { icon: Plus, tone: "success" },
  "attendance.update": { icon: Pencil, tone: "warning" },
  "attendance.delete": { icon: Trash2, tone: "destructive" },
  "learning.create":   { icon: Plus, tone: "info" },
  "learning.delete":   { icon: Trash2, tone: "destructive" },
  "settings.update":   { icon: Cog, tone: "info" },
  "backup.export":     { icon: Download, tone: "info" },
  "backup.import":     { icon: Upload, tone: "info" },
  "backup.auto":       { icon: ShieldCheck, tone: "success" },
  "backup.restore":    { icon: Upload, tone: "warning" },
  "report.export":     { icon: FileText, tone: "info" },
  "data.validation_failed": { icon: AlertTriangle, tone: "destructive" },
};

const TONES: Record<string, string> = {
  success: "bg-success/10 text-success",
  info: "bg-info/10 text-info",
  warning: "bg-warning/10 text-warning",
  destructive: "bg-destructive/10 text-destructive",
};

function formatTs(ts: number) {
  const d = new Date(ts);
  return d.toLocaleString("he-IL", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function AuditPage() {
  const entries = useAudit();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | AuditAction>("all");

  const types = useMemo(() => {
    const set = new Set<AuditAction>();
    entries.forEach((e) => set.add(e.action));
    return [...set];
  }, [entries]);

  const filtered = entries.filter((e) =>
    (filter === "all" || e.action === filter) &&
    (q === "" ||
      ACTION_LABELS[e.action].includes(q) ||
      (e.recordId || "").includes(q) ||
      (e.detail || "").includes(q))
  );

  return (
    <AppShell title="יומן ביקורת" subtitle={`${entries.length} פעולות מתועדות · רישומים אינם ניתנים לעריכה`}>
      <div className="card-surface p-4 mb-4 space-y-3">
        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="חיפוש בפעולה, מזהה או פרטים..."
            className="w-full rounded-md border border-input bg-card pr-9 pl-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>
        <div className="flex flex-wrap gap-1">
          <button onClick={() => setFilter("all")}
            className={`px-3 py-1.5 rounded-md text-xs ${filter === "all" ? "bg-primary text-primary-foreground" : "border border-border hover:bg-accent text-muted-foreground"}`}>
            הכל
          </button>
          {types.map((t) => (
            <button key={t} onClick={() => setFilter(t)}
              className={`px-3 py-1.5 rounded-md text-xs ${filter === t ? "bg-primary text-primary-foreground" : "border border-border hover:bg-accent text-muted-foreground"}`}>
              {ACTION_LABELS[t]}
            </button>
          ))}
        </div>
      </div>

      <div className="card-surface p-6">
        {filtered.length ? (
          <ol className="relative border-r-2 border-border pr-6 space-y-5">
            {filtered.map((e) => {
              const ic = ICONS[e.action];
              return (
                <li key={e.id} className="relative">
                  <span className={`absolute -right-[34px] top-1 size-7 rounded-full grid place-items-center ${TONES[ic.tone]}`}>
                    <ic.icon className="size-3.5" />
                  </span>
                  <div className="flex items-baseline gap-3 flex-wrap">
                    <h3 className="text-sm font-semibold">{ACTION_LABELS[e.action]}</h3>
                    <span className="text-xs text-muted-foreground tabular-nums">{formatTs(e.ts)}</span>
                    {e.recordId && (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{e.recordId}</span>
                    )}
                  </div>
                  {e.detail && <p className="text-xs text-muted-foreground mt-0.5">{e.detail}</p>}
                  {(e.oldValue || e.newValue) && (
                    <details className="mt-1 text-xs text-muted-foreground">
                      <summary className="cursor-pointer select-none hover:text-foreground">פרטי שינוי</summary>
                      <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {e.oldValue !== undefined && (
                          <div className="rounded border border-border p-2 bg-muted/30">
                            <div className="text-[10px] font-medium mb-1">ערך קודם</div>
                            <pre className="text-[10px] whitespace-pre-wrap break-all">{JSON.stringify(e.oldValue, null, 1) as string}</pre>
                          </div>
                        )}
                        {e.newValue !== undefined && (
                          <div className="rounded border border-border p-2 bg-muted/30">
                            <div className="text-[10px] font-medium mb-1">ערך חדש</div>
                            <pre className="text-[10px] whitespace-pre-wrap break-all">{JSON.stringify(e.newValue, null, 1) as string}</pre>
                          </div>
                        )}
                      </div>
                    </details>
                  )}
                </li>
              );
            })}
          </ol>
        ) : (
          <div className="text-center py-12 text-sm text-muted-foreground flex flex-col items-center gap-2">
            <Eraser className="size-6 opacity-50" />
            <span>אין רישומים תואמים</span>
          </div>
        )}
      </div>
    </AppShell>
  );
}
