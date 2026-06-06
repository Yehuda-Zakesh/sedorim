import { createFileRoute } from "@tanstack/react-router";
import { useRef } from "react";
import { AppShell } from "@/components/app-shell";
import {
  Download, Upload, CheckCircle2, HardDrive, FileJson, Clock, Trash2, ShieldAlert, RotateCcw,
} from "lucide-react";
import { useAttendance, useLearning } from "@/lib/tracker-store";
import { useSnapshots, createSnapshot, deleteSnapshot, verifySnapshot, getLastAutoBackupTs } from "@/lib/auto-backup";
import { logAudit } from "@/lib/audit-store";
import { useSettings } from "@/lib/settings-store";
import { toast } from "sonner";

export const Route = createFileRoute("/backup")({
  head: () => ({ meta: [{ title: "גיבוי ושחזור — המעקב שלי" }] }),
  component: BackupPage,
});

function formatTs(ts: number) {
  return new Date(ts).toLocaleString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
function formatSize(n: number) {
  return n > 1024 ? `${(n / 1024).toFixed(1)} KB` : `${n} B`;
}

function BackupPage() {
  const { records, replaceAll: replaceAtt } = useAttendance();
  const { items, replaceAll: replaceLrn } = useLearning();
  const snapshots = useSnapshots();
  const { settings } = useSettings();
  const fileRef = useRef<HTMLInputElement>(null);

  const exportData = () => {
    const payload = { version: 2, exportedAt: new Date().toISOString(), attendance: records, learning: items };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    logAudit("backup.export", { detail: `${formatSize(blob.size)}` });
    toast.success("הגיבוי הורד");
  };

  const handleImport = async (file: File) => {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!Array.isArray(data.attendance) || !Array.isArray(data.learning)) throw new Error("invalid");
      // safety snapshot before destructive replace
      createSnapshot({ attendance: records, learning: items }, "before-op");
      replaceAtt(data.attendance);
      replaceLrn(data.learning);
      logAudit("backup.import", { detail: `${data.attendance.length} נוכחות · ${data.learning.length} שיעורים` });
      toast.success("השחזור הושלם");
    } catch {
      toast.error("קובץ לא תקין");
    }
  };

  const snapshotNow = () => {
    const snap = createSnapshot({ attendance: records, learning: items }, "manual");
    logAudit("backup.export", { recordId: snap.id, detail: "תמונת מצב מקומית" });
    toast.success("נוצרה תמונת מצב");
  };

  const restoreSnap = (id: string) => {
    const snap = snapshots.find((s) => s.id === id);
    if (!snap) return;
    if (!verifySnapshot(snap)) { toast.error("גיבוי פגום — checksum לא תואם"); return; }
    createSnapshot({ attendance: records, learning: items }, "before-op");
    replaceAtt((snap.payload.attendance as any[]) || []);
    replaceLrn((snap.payload.learning as any[]) || []);
    logAudit("backup.restore", { recordId: id, detail: `שוחזר מ-${formatTs(snap.ts)}` });
    toast.success("הגיבוי שוחזר");
  };

  const totalBytes = JSON.stringify({ records, items }).length;
  const lastAuto = getLastAutoBackupTs();

  return (
    <AppShell title="גיבוי ושחזור" subtitle="ייצוא, ייבוא וגיבוי אוטומטי">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-5">
        <Kpi icon={CheckCircle2} tone="success" label="רישומי נוכחות" value={records.length.toString()} />
        <Kpi icon={FileJson} tone="info" label="שיעורי לימוד" value={items.length.toString()} />
        <Kpi icon={HardDrive} tone="primary" label="נפח נתונים" value={formatSize(totalBytes)} />
        <Kpi icon={Clock} tone="warning" label="גיבוי אחרון" value={lastAuto ? formatTs(lastAuto).split(",")[0] : "אין"} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
        <button onClick={exportData} className="card-surface p-6 text-right hover:border-primary transition">
          <Download className="size-6 text-primary mb-3" />
          <div className="text-sm font-semibold">ייצוא גיבוי</div>
          <div className="text-xs text-muted-foreground mt-1">הורדת קובץ JSON עם כל הנתונים</div>
        </button>
        <button onClick={() => fileRef.current?.click()} className="card-surface p-6 text-right hover:border-primary transition">
          <Upload className="size-6 text-primary mb-3" />
          <div className="text-sm font-semibold">שחזור מקובץ</div>
          <div className="text-xs text-muted-foreground mt-1">העלאת קובץ גיבוי קודם</div>
          <input ref={fileRef} type="file" accept="application/json" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImport(f); e.target.value = ""; }} />
        </button>
        <button onClick={snapshotNow} className="card-surface p-6 text-right hover:border-primary transition">
          <RotateCcw className="size-6 text-primary mb-3" />
          <div className="text-sm font-semibold">תמונת מצב מקומית</div>
          <div className="text-xs text-muted-foreground mt-1">שמירה זמנית לשחזור מהיר</div>
        </button>
      </div>

      <div className="card-surface p-5 mb-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold">היסטוריית גיבויים מקומיים</h2>
          <span className="text-xs text-muted-foreground">
            אוטומטי: {settings.data.autoBackup === "off" ? "כבוי" : settings.data.autoBackup === "daily" ? "יומי" : "שבועי"} · שמור {settings.data.backupRetention} גרסאות
          </span>
        </div>
        {snapshots.length ? (
          <ul className="divide-y divide-border">
            {snapshots.map((s) => {
              const valid = verifySnapshot(s);
              return (
                <li key={s.id} className="flex items-center gap-3 py-3">
                  <div className={`size-9 rounded-md grid place-items-center ${valid ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}>
                    {valid ? <CheckCircle2 className="size-4" /> : <ShieldAlert className="size-4" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium tabular-nums">{formatTs(s.ts)}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {s.trigger === "auto" ? "אוטומטי" : s.trigger === "before-op" ? "לפני פעולה" : "ידני"} · {formatSize(s.size)} · checksum: <span className="font-mono">{s.checksum}</span>
                    </div>
                  </div>
                  <button onClick={() => restoreSnap(s.id)}
                    className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-accent">שחזר</button>
                  <button onClick={() => { deleteSnapshot(s.id); toast("הגרסה נמחקה"); }}
                    className="size-8 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive grid place-items-center">
                    <Trash2 className="size-4" />
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="py-8 text-center text-sm text-muted-foreground">אין עדיין תמונות מצב</div>
        )}
      </div>

      <div className="card-surface p-5 text-xs text-muted-foreground">
        💡 הנתונים נשמרים מקומית בדפדפן. גיבויים אוטומטיים נוצרים לפי תזמון ההגדרות ולפני פעולות הרסניות.
      </div>
    </AppShell>
  );
}

function Kpi({ icon: Icon, tone, label, value }: { icon: typeof Download; tone: string; label: string; value: string }) {
  const tones: Record<string, string> = {
    success: "bg-success/10 text-success",
    info: "bg-info/10 text-info",
    primary: "bg-primary/10 text-primary",
    warning: "bg-warning/10 text-warning",
  };
  return (
    <div className="card-surface p-5">
      <div className="flex items-center gap-3">
        <div className={`size-10 rounded-lg grid place-items-center ${tones[tone]}`}>
          <Icon className="size-5" />
        </div>
        <div>
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="text-sm font-semibold tabular-nums">{value}</div>
        </div>
      </div>
    </div>
  );
}
