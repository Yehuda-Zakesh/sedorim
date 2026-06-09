import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { AppShell } from "@/components/app-shell";
import {
  Download, Upload, CheckCircle2, HardDrive, FileJson, Clock, Trash2, ShieldAlert, RotateCcw, AlertTriangle, FileArchive,
} from "lucide-react";
import { useSeder, useLearning } from "@/lib/kollel-store";
import { useSnapshots, createSnapshot, deleteSnapshot, verifySnapshot, getLastAutoBackupTs, clearAllSnapshots } from "@/lib/auto-backup";
import { logAudit } from "@/lib/audit-store";
import { useSettings, resetSettings } from "@/lib/settings-store";
import { toast } from "sonner";
import { generateSourceZip } from "@/lib/download-source.functions";

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
  const { entries, replaceAll: replaceSeder, clearAll: clearSeder } = useSeder();
  const { items, replaceAll: replaceLrn, clearAll: clearLrn } = useLearning();
  const snapshots = useSnapshots();
  const { settings } = useSettings();
  const fileRef = useRef<HTMLInputElement>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const exportData = () => {
    const payload = { version: 3, exportedAt: new Date().toISOString(), kind: "kollel", seder: entries, learning: items };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = `kollel-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    logAudit("backup.export", { detail: formatSize(blob.size) });
    toast.success("הגיבוי הורד");
  };

  const handleImport = async (file: File) => {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const sederArr = data.seder || data.attendance || [];
      const lrnArr = data.learning || [];
      if (!Array.isArray(sederArr) || !Array.isArray(lrnArr)) throw new Error("invalid");
      createSnapshot({ attendance: entries, learning: items }, "before-op");
      replaceSeder(sederArr);
      replaceLrn(lrnArr);
      logAudit("backup.import", { detail: `${sederArr.length} סדרים · ${lrnArr.length} שיעורים` });
      toast.success("השחזור הושלם");
    } catch {
      toast.error("קובץ לא תקין");
    }
  };

  const snapshotNow = () => {
    const snap = createSnapshot({ attendance: entries, learning: items }, "manual");
    logAudit("backup.export", { recordId: snap.id, detail: "תמונת מצב מקומית" });
    toast.success("נוצרה תמונת מצב");
  };

  const restoreSnap = (id: string) => {
    const snap = snapshots.find((s) => s.id === id);
    if (!snap) return;
    if (!verifySnapshot(snap)) { toast.error("גיבוי פגום — checksum לא תואם"); return; }
    createSnapshot({ attendance: entries, learning: items }, "before-op");
    replaceSeder((snap.payload.attendance as any[]) || []);
    replaceLrn((snap.payload.learning as any[]) || []);
    logAudit("backup.restore", { recordId: id, detail: `שוחזר מ-${formatTs(snap.ts)}` });
    toast.success("הגיבוי שוחזר");
  };

  const doDelete = () => {
    createSnapshot({ attendance: entries, learning: items }, "before-op");
    clearSeder(); clearLrn();
    logAudit("backup.delete_db", { detail: "כל הנתונים נמחקו" });
    toast.success("הנתונים נמחקו");
    setConfirmDelete(false);
  };

  const doReset = () => {
    resetSettings();
    toast.success("ההגדרות אופסו");
    setConfirmReset(false);
  };

  const totalBytes = JSON.stringify({ entries, items }).length;
  const lastAuto = getLastAutoBackupTs();

  return (
    <AppShell title="גיבוי ושחזור" subtitle="ייצוא, ייבוא ופעולות מערכת">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-5">
        <Kpi icon={CheckCircle2} tone="success" label="רישומי סדרים" value={entries.length.toString()} />
        <Kpi icon={FileJson} tone="info" label="שיעורי לימוד" value={items.length.toString()} />
        <Kpi icon={HardDrive} tone="primary" label="נפח נתונים" value={formatSize(totalBytes)} />
        <Kpi icon={Clock} tone="warning" label="גיבוי אחרון" value={lastAuto ? formatTs(lastAuto).split(",")[0] : "אין"} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
        <button onClick={exportData} className="card-surface p-6 text-right hover:border-primary transition">
          <Download className="size-6 text-primary mb-3" />
          <div className="text-sm font-semibold">ייצוא גיבוי</div>
          <div className="text-xs text-muted-foreground mt-1">הורדת קובץ JSON</div>
        </button>
        <button onClick={() => fileRef.current?.click()} className="card-surface p-6 text-right hover:border-primary transition">
          <Upload className="size-6 text-primary mb-3" />
          <div className="text-sm font-semibold">שחזור מקובץ</div>
          <div className="text-xs text-muted-foreground mt-1">העלאת קובץ גיבוי</div>
          <input ref={fileRef} type="file" accept="application/json" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImport(f); e.target.value = ""; }} />
        </button>
        <button onClick={snapshotNow} className="card-surface p-6 text-right hover:border-primary transition">
          <RotateCcw className="size-6 text-primary mb-3" />
          <div className="text-sm font-semibold">תמונת מצב</div>
          <div className="text-xs text-muted-foreground mt-1">שמירה מקומית מהירה</div>
        </button>
      </div>

      <div className="card-surface p-5 mb-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold">היסטוריית גיבויים מקומיים</h2>
          <span className="text-xs text-muted-foreground">
            אוטומטי: {settings.data.autoBackup === "off" ? "כבוי" : settings.data.autoBackup === "daily" ? "יומי" : "שבועי"} · שמור {settings.data.backupRetention}
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
                      {s.trigger === "auto" ? "אוטומטי" : s.trigger === "before-op" ? "לפני פעולה" : "ידני"} · {formatSize(s.size)}
                    </div>
                  </div>
                  <button onClick={() => restoreSnap(s.id)} className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-accent">שחזר</button>
                  <button onClick={() => { deleteSnapshot(s.id); toast("נמחק"); }}
                    className="size-8 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive grid place-items-center">
                    <Trash2 className="size-4" />
                  </button>
                </li>
              );
            })}
          </ul>
        ) : <div className="py-8 text-center text-sm text-muted-foreground">אין עדיין תמונות מצב</div>}
      </div>

      <div className="card-surface p-5 border-r-4 border-r-destructive">
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle className="size-4 text-destructive" />
          <h2 className="text-sm font-semibold">פעולות הרסניות</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="rounded-lg border border-border p-4">
            <div className="text-sm font-semibold">איפוס הגדרות לברירת מחדל</div>
            <div className="text-xs text-muted-foreground mt-1">שעות סדרים, יעדים והעדפות.</div>
            {!confirmReset ? (
              <button onClick={() => setConfirmReset(true)}
                className="mt-3 rounded-md border border-warning text-warning px-3 py-1.5 text-xs hover:bg-warning/10">אפס הגדרות</button>
            ) : (
              <div className="mt-3 flex gap-2">
                <button onClick={doReset} className="rounded-md bg-warning px-3 py-1.5 text-xs text-warning-foreground">אישור איפוס</button>
                <button onClick={() => setConfirmReset(false)} className="rounded-md border border-border px-3 py-1.5 text-xs">בטל</button>
              </div>
            )}
          </div>
          <div className="rounded-lg border border-destructive/40 p-4">
            <div className="text-sm font-semibold text-destructive">מחיקת בסיס נתונים</div>
            <div className="text-xs text-muted-foreground mt-1">מוחק את כל הסדרים והשיעורים. תיווצר תמונת מצב אוטומטית לפני המחיקה.</div>
            {!confirmDelete ? (
              <button onClick={() => setConfirmDelete(true)}
                className="mt-3 rounded-md border border-destructive text-destructive px-3 py-1.5 text-xs hover:bg-destructive/10">מחק נתונים</button>
            ) : (
              <div className="mt-3 flex gap-2">
                <button onClick={doDelete} className="rounded-md bg-destructive px-3 py-1.5 text-xs text-destructive-foreground">אישור מחיקה</button>
                <button onClick={() => setConfirmDelete(false)} className="rounded-md border border-border px-3 py-1.5 text-xs">בטל</button>
              </div>
            )}
          </div>
        </div>
        <button onClick={() => { clearAllSnapshots(); toast("תמונות המצב נמחקו"); }}
          className="mt-3 text-xs text-muted-foreground hover:text-destructive">מחיקת כל תמונות המצב</button>
      </div>
    </AppShell>
  );
}

function Kpi({ icon: Icon, tone, label, value }: { icon: typeof Download; tone: string; label: string; value: string }) {
  const tones: Record<string, string> = {
    success: "bg-success/10 text-success", info: "bg-info/10 text-info",
    primary: "bg-primary/10 text-primary", warning: "bg-warning/10 text-warning",
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
