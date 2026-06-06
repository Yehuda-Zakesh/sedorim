import { createFileRoute } from "@tanstack/react-router";
import { useRef } from "react";
import { AppShell } from "@/components/app-shell";
import { Download, Upload, CheckCircle2, HardDrive, FileJson } from "lucide-react";
import { useAttendance, useLearning } from "@/lib/tracker-store";
import { toast } from "sonner";

export const Route = createFileRoute("/backup")({
  head: () => ({ meta: [{ title: "גיבוי ושחזור — המעקב שלי" }] }),
  component: BackupPage,
});

function BackupPage() {
  const { records, upsert: upsertA } = useAttendance();
  const { items, add: addL, remove: removeL } = useLearning();
  const fileRef = useRef<HTMLInputElement>(null);

  const exportData = () => {
    const payload = { version: 1, exportedAt: new Date().toISOString(), attendance: records, learning: items };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("הגיבוי הורד");
  };

  const handleImport = async (file: File) => {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!Array.isArray(data.attendance) || !Array.isArray(data.learning)) throw new Error("invalid");
      for (const r of data.attendance) upsertA(r);
      // replace learning
      for (const i of items) removeL(i.id);
      for (const l of data.learning) addL(l);
      toast.success("השחזור הושלם");
    } catch {
      toast.error("קובץ לא תקין");
    }
  };

  const totalBytes = JSON.stringify({ records, items }).length;
  const sizeStr = totalBytes > 1024 ? `${(totalBytes / 1024).toFixed(1)} KB` : `${totalBytes} B`;

  return (
    <AppShell title="גיבוי ושחזור" subtitle="ייצוא וייבוא של כל הנתונים שלך">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
        <div className="card-surface p-5">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-lg bg-success/10 text-success grid place-items-center">
              <CheckCircle2 className="size-5" />
            </div>
            <div>
              <div className="text-xs text-muted-foreground">רישומי נוכחות</div>
              <div className="text-sm font-semibold tabular-nums">{records.length}</div>
            </div>
          </div>
        </div>
        <div className="card-surface p-5">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-lg bg-info/10 text-info grid place-items-center">
              <FileJson className="size-5" />
            </div>
            <div>
              <div className="text-xs text-muted-foreground">שיעורי לימוד</div>
              <div className="text-sm font-semibold tabular-nums">{items.length}</div>
            </div>
          </div>
        </div>
        <div className="card-surface p-5">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-lg bg-primary/10 text-primary grid place-items-center">
              <HardDrive className="size-5" />
            </div>
            <div>
              <div className="text-xs text-muted-foreground">נפח נתונים</div>
              <div className="text-sm font-semibold tabular-nums">{sizeStr}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <button onClick={exportData} className="card-surface p-6 text-right hover:border-primary transition">
          <Download className="size-6 text-primary mb-3" />
          <div className="text-sm font-semibold">ייצוא גיבוי</div>
          <div className="text-xs text-muted-foreground mt-1">הורד קובץ JSON עם כל הנתונים שלך</div>
        </button>
        <button onClick={() => fileRef.current?.click()} className="card-surface p-6 text-right hover:border-primary transition">
          <Upload className="size-6 text-primary mb-3" />
          <div className="text-sm font-semibold">שחזור מקובץ</div>
          <div className="text-xs text-muted-foreground mt-1">העלה קובץ גיבוי קודם לשחזור</div>
          <input ref={fileRef} type="file" accept="application/json" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImport(f); e.target.value = ""; }} />
        </button>
      </div>

      <div className="mt-5 card-surface p-5 text-xs text-muted-foreground">
        💡 הנתונים נשמרים מקומית בדפדפן שלך. מומלץ לייצא גיבוי באופן קבוע.
      </div>
    </AppShell>
  );
}
