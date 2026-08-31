import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { AppShell } from "@/components/app-shell";
import {
  Download,
  Upload,
  CheckCircle2,
  HardDrive,
  FileJson,
  Clock,
  Trash2,
  ShieldAlert,
  RotateCcw,
  AlertTriangle,
} from "lucide-react";
import {
  useSeder,
  useLearning,
  replaceAllData,
  type SederEntry,
  type LearningEntry,
} from "@/lib/kollel-store";
import {
  useSnapshots,
  createSnapshot,
  deleteSnapshot,
  verifySnapshot,
  getLastAutoBackupTs,
  clearAllSnapshots,
} from "@/lib/auto-backup";
import { useSettings } from "@/lib/settings-store";
import { saveTextFile } from "@/lib/save-file";
import { KpiCard, IconBadge } from "@/components/ui/stat";
import { toast } from "sonner";

export const Route = createFileRoute("/backup")({
  head: () => ({ meta: [{ title: "גיבוי ושחזור — המעקב שלי" }] }),
  component: BackupPage,
});

function formatTs(ts: number) {
  return new Date(ts).toLocaleString("he-IL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
function formatSize(n: number) {
  return n > 1024 ? `${(n / 1024).toFixed(1)} KB` : `${n} B`;
}

function BackupPage() {
  return (
    <AppShell title="גיבוי ושחזור" subtitle="ייצוא, ייבוא ופעולות מערכת">
      <BackupView />
    </AppShell>
  );
}

function BackupView() {
  const { entries, clearAll: clearSeder } = useSeder();
  const { items, clearAll: clearLrn } = useLearning();
  const snapshots = useSnapshots();
  const { settings } = useSettings();
  const fileRef = useRef<HTMLInputElement>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const exportData = async () => {
    const payload = {
      version: 3,
      exportedAt: new Date().toISOString(),
      kind: "kollel",
      seder: entries,
      learning: items,
    };
    const json = JSON.stringify(payload, null, 2);
    const filename = `kollel-backup-${new Date().toISOString().slice(0, 10)}.json`;
    try {
      // Goes through the native save dialog — a WebView has no working
      // <a download>. See src/lib/save-file.ts.
      if (!(await saveTextFile(filename, json))) return; // cancelled
    } catch (e) {
      console.error(e);
      toast.error("הייצוא נכשל");
      return;
    }
    toast.success("הגיבוי נשמר");
  };

  const handleImport = async (file: File) => {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const sederArr = data.seder || data.attendance || [];
      const lrnArr = data.learning || [];
      if (!Array.isArray(sederArr) || !Array.isArray(lrnArr)) throw new Error("invalid");
      createSnapshot({ attendance: entries, learning: items }, "before-op");
      replaceAllData(sederArr, lrnArr);
      toast.success("השחזור הושלם");
    } catch {
      toast.error("קובץ לא תקין");
    }
  };

  const snapshotNow = () => {
    const snap = createSnapshot({ attendance: entries, learning: items }, "manual");
    toast.success("נוצרה תמונת מצב");
  };

  const restoreSnap = (id: string) => {
    const snap = snapshots.find((s) => s.id === id);
    if (!snap) return;
    if (!verifySnapshot(snap)) {
      toast.error("גיבוי פגום — checksum לא תואם");
      return;
    }
    createSnapshot({ attendance: entries, learning: items }, "before-op");
    // payload is typed unknown (it comes off disk), and replaceAllData drops
    // anything that fails validateSeder/validateLearning. Array.isArray is
    // what "|| []" was reaching for: a payload holding a non-array would have
    // thrown inside the filter, and restoreSnap has no catch to absorb it.
    replaceAllData(
      Array.isArray(snap.payload.attendance) ? (snap.payload.attendance as SederEntry[]) : [],
      Array.isArray(snap.payload.learning) ? (snap.payload.learning as LearningEntry[]) : [],
    );
    toast.success("הגיבוי שוחזר");
  };

  const doDelete = () => {
    createSnapshot({ attendance: entries, learning: items }, "before-op");
    clearSeder();
    clearLrn();
    toast.success("הנתונים נמחקו");
    setConfirmDelete(false);
  };

  const totalBytes = JSON.stringify({ entries, items }).length;
  const lastAuto = getLastAutoBackupTs();

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-5">
        <KpiCard
          compact
          icon={CheckCircle2}
          tone="success"
          label="רישומי סדרים"
          value={entries.length.toString()}
        />
        <KpiCard
          compact
          icon={FileJson}
          tone="info"
          label="רישומי לימוד"
          value={items.length.toString()}
        />
        <KpiCard
          compact
          icon={HardDrive}
          tone="primary"
          label="נפח נתונים"
          value={formatSize(totalBytes)}
        />
        <KpiCard
          compact
          icon={Clock}
          tone="warning"
          label="גיבוי אחרון"
          value={lastAuto ? formatTs(lastAuto).split(",")[0] : "אין"}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
        <button
          onClick={exportData}
          className="card-surface p-6 text-start hover:border-primary pressable-lg"
        >
          <Download className="size-6 text-primary mb-3" />
          <div className="text-sm font-semibold">ייצוא גיבוי</div>
          <div className="text-xs text-muted-foreground mt-1">הורדת קובץ JSON</div>
        </button>
        <button
          onClick={() => fileRef.current?.click()}
          className="card-surface p-6 text-start hover:border-primary pressable-lg"
        >
          <Upload className="size-6 text-primary mb-3" />
          <div className="text-sm font-semibold">שחזור מקובץ</div>
          <div className="text-xs text-muted-foreground mt-1">העלאת קובץ גיבוי</div>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleImport(f);
              e.target.value = "";
            }}
          />
        </button>
        <button
          onClick={snapshotNow}
          className="card-surface p-6 text-start hover:border-primary pressable-lg"
        >
          <RotateCcw className="size-6 text-primary mb-3" />
          <div className="text-sm font-semibold">תמונת מצב</div>
          <div className="text-xs text-muted-foreground mt-1">שמירה מקומית מהירה</div>
        </button>
      </div>

      <div className="card-surface p-5 mb-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold">היסטוריית גיבויים מקומיים</h2>
          <span className="text-xs text-muted-foreground">
            אוטומטי:{" "}
            {settings.data.autoBackup === "off"
              ? "כבוי"
              : settings.data.autoBackup === "daily"
                ? "יומי"
                : "שבועי"}{" "}
            · שמור {settings.data.backupRetention}
          </span>
        </div>
        {snapshots.length ? (
          <ul className="divide-y divide-border">
            {snapshots.map((s) => {
              const valid = verifySnapshot(s);
              return (
                <li key={s.id} className="flex items-center gap-3 py-3">
                  <IconBadge
                    icon={valid ? CheckCircle2 : ShieldAlert}
                    tone={valid ? "success" : "destructive"}
                    size="md"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium tabular-nums">{formatTs(s.ts)}</div>
                    <div className="text-2xs text-muted-foreground">
                      {s.trigger === "auto"
                        ? "אוטומטי"
                        : s.trigger === "before-op"
                          ? "לפני פעולה"
                          : "ידני"}{" "}
                      · {formatSize(s.size)}
                    </div>
                  </div>
                  <button
                    onClick={() => restoreSnap(s.id)}
                    className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-accent"
                  >
                    שחזר
                  </button>
                  <button
                    onClick={() => {
                      deleteSnapshot(s.id);
                      toast("נמחק");
                    }}
                    className="size-8 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive grid place-items-center"
                  >
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

      <div className="card-surface p-5 border-s-4 border-s-destructive">
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle className="size-4 text-destructive" />
          <h2 className="text-sm font-semibold">פעולות הרסניות</h2>
        </div>
        <div className="rounded-lg border border-destructive/40 p-4">
          <div className="text-sm font-semibold text-destructive">מחיקת בסיס נתונים</div>
          <div className="text-xs text-muted-foreground mt-1">
            מוחק את כל הסדרים ורישומי הלימוד. תיווצר תמונת מצב אוטומטית לפני המחיקה.
          </div>
          {!confirmDelete ? (
            <button
              onClick={() => setConfirmDelete(true)}
              className="mt-3 rounded-md border border-destructive text-destructive px-3 py-1.5 text-xs hover:bg-destructive/10"
            >
              מחק נתונים
            </button>
          ) : (
            <div className="mt-3 flex gap-2">
              <button
                onClick={doDelete}
                className="rounded-md bg-destructive px-3 py-1.5 text-xs text-destructive-foreground"
              >
                אישור מחיקה
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="rounded-md border border-border px-3 py-1.5 text-xs"
              >
                בטל
              </button>
            </div>
          )}
          <p className="mt-3 text-2xs text-muted-foreground">
            לאיפוס ההגדרות (שעות סדרים, יעדים והעדפות) — מסך ההגדרות.
          </p>
        </div>
        <button
          onClick={() => {
            clearAllSnapshots();
            toast("תמונות המצב נמחקו");
          }}
          className="mt-3 text-xs text-muted-foreground hover:text-destructive"
        >
          מחיקת כל תמונות המצב
        </button>
      </div>
    </>
  );
}
