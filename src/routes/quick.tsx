import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Zap, CalendarCheck, X, FileText, Check, ArrowLeft } from "lucide-react";
import { useSeder, todayISO, newId, calcSeder, type SederNum, type SederEntry } from "@/lib/kollel-store";
import { useSettings } from "@/lib/settings-store";
import { hhmmToMin } from "@/lib/kollel-store";
import { formatHebrewDate } from "@/lib/hebrew-calendar";
import { toast } from "sonner";

export const Route = createFileRoute("/quick")({
  head: () => ({ meta: [{ title: "כניסה מהירה — המעקב שלי" }] }),
  component: QuickPage,
});

function nowHHMM() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function detectSeder(timeStr: string, cfg: ReturnType<typeof useSettings>["settings"]["seder"]): SederNum {
  const t = hhmmToMin(timeStr) ?? hhmmToMin(nowHHMM())!;
  const s2 = hhmmToMin(cfg.s2Start) ?? 960;
  return t >= s2 - 30 ? 2 : 1;
}

function QuickPage() {
  const navigate = useNavigate();
  const { settings } = useSettings();
  const { upsert, entries } = useSeder();
  const [arrival, setArrival] = useState(nowHHMM());
  const date = todayISO();
  const seder = detectSeder(arrival, settings.seder);
  const startStr = seder === 1 ? settings.seder.s1Start : settings.seder.s2Start;
  const endStr = seder === 1 ? settings.seder.s1End : settings.seder.s2End;
  const existing = entries.find((e) => e.date === date && e.seder === seder);

  const buildBase = (over: Partial<SederEntry> = {}): SederEntry => ({
    id: existing?.id || newId(),
    date, seder,
    arrival, departure: endStr,
    absent: false, ohevei: false,
    excusedAll: false, excusedMinutes: 0,
    manualAdjustMin: 0, tags: [],
    ...over,
  });

  const save = (e: SederEntry, label: string) => {
    try { upsert(e); toast.success(`${label} נשמר · סדר ${seder === 1 ? "א׳" : "ב׳"}`); }
    catch (er) { toast.error(er instanceof Error ? er.message : "שגיאה"); }
  };

  const calc = calcSeder(buildBase());

  return (
    <div className="min-h-screen bg-background grid place-items-center p-6" dir="rtl">
      <div className="w-full max-w-md card-surface p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="size-10 rounded-lg bg-primary text-primary-foreground grid place-items-center">
            <Zap className="size-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">כניסה מהירה</h1>
            <p className="text-xs text-muted-foreground">{formatHebrewDate(new Date())}</p>
          </div>
        </div>

        <div className="rounded-lg border border-border p-3 mb-4 bg-muted/30">
          <div className="text-xs text-muted-foreground">זוהה כסדר</div>
          <div className="text-base font-semibold">{seder === 1 ? "א׳" : "ב׳"} ({startStr}–{endStr})</div>
        </div>

        <label className="text-xs text-muted-foreground">שעת הגעה</label>
        <input type="time" value={arrival} onChange={(e) => setArrival(e.target.value)}
          className="mt-1 w-full rounded-md border border-input bg-card px-3 py-3 text-lg tabular-nums" />

        <div className="mt-3 grid grid-cols-2 gap-2 text-center text-xs">
          <div className="rounded-md border border-border p-2">חסר: <b className="tabular-nums">{calc.missingMin}</b></div>
          <div className="rounded-md border border-border p-2">בונוס: <b className="tabular-nums">{calc.bonusMin}</b></div>
        </div>

        <button onClick={() => save(buildBase(), "סדר רגיל")}
          className="mt-4 w-full rounded-md bg-primary py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
          <CalendarCheck className="size-4 inline ml-1" /> שמור הגעה (יציאה ברירת מחדל)
        </button>

        <div className="mt-3 grid grid-cols-3 gap-2">
          <button onClick={() => save(buildBase({ excusedAll: true }), "מוצדק")}
            className="rounded-md border-2 border-status-excused bg-status-excused/10 text-status-excused py-2 text-xs font-medium">
            <FileText className="size-3.5 inline ml-1" /> מוצדק
          </button>
          <button onClick={() => save(buildBase({ ohevei: true }), "אוהבי ה׳")}
            className="rounded-md border-2 border-status-present bg-status-present/10 text-status-present py-2 text-xs font-medium">
            <Check className="size-3.5 inline ml-1" /> אוהבי ה׳
          </button>
          <button onClick={() => save(buildBase({ absent: true, arrival: undefined, departure: undefined }), "היעדרות")}
            className="rounded-md border-2 border-status-absent bg-status-absent/10 text-status-absent py-2 text-xs font-medium">
            <X className="size-3.5 inline ml-1" /> היעדרות
          </button>
        </div>

        <div className="mt-5 flex items-center justify-between">
          <Link to="/" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
            <ArrowLeft className="size-3" /> חזרה
          </Link>
          <button onClick={() => navigate({ to: "/attendance" })}
            className="text-xs text-primary hover:underline">פתח אפליקציה ראשית</button>
        </div>
      </div>
    </div>
  );
}
