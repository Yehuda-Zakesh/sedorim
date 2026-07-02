import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { Zap, LogIn, LogOut as LogOutIcon, Check, Clock } from "lucide-react";
import { useSeder, type SederEntry } from "@/lib/kollel-store";
import { getSettings, applyAppearance } from "@/lib/settings-store";
import { toHebrewDate } from "@/lib/hebrew-calendar";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";

export const Route = createFileRoute("/quick")({
  head: () => ({
    meta: [
      { title: "כניסה מהירה · מעקב כולל" },
      { name: "description", content: "רישום מהיר של הגעה ויציאה לסדרי הכולל" },
    ],
  }),
  component: QuickApp,
});

function todayISO() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}
function nowHM() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
function uid() { return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`; }

function QuickApp() {
  useEffect(() => { applyAppearance(); }, []);
  const seder = useSeder();
  const settings = getSettings();
  const date = todayISO();
  const heb = useMemo(() => {
    try { return toHebrewDate(new Date(date)); } catch { return ""; }
  }, [date]);

  const todayEntries = seder.entries.filter((e) => e.date === date);
  const findEntry = (s: 1 | 2) => todayEntries.find((e) => e.seder === s);

  function stamp(sederNum: 1 | 2, kind: "arrival" | "departure") {
    const existing = findEntry(sederNum);
    const base: SederEntry = existing ?? {
      id: uid(),
      date,
      seder: sederNum,
      arrival: undefined,
      departure: undefined,
      absent: false,
      ohevei: false,
      excusedAll: false,
      excusedMinutes: 0,
      manualAdjustMin: 0,
      tags: [],
    };
    const updated: SederEntry = { ...base, [kind]: nowHM() };
    seder.upsert(updated);
    toast.success(kind === "arrival" ? `נרשמה הגעה לסדר ${sederNum}` : `נרשמה יציאה מסדר ${sederNum}`);
  }

  return (
    <div dir="rtl" className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="border-b border-border bg-card">
        <div className="mx-auto max-w-md px-5 py-4 flex items-center gap-3">
          <div className="size-10 rounded-xl bg-primary grid place-items-center text-primary-foreground shadow-md">
            <Zap className="size-5" />
          </div>
          <div className="flex-1">
            <h1 className="text-lg font-bold leading-tight">כניסה מהירה</h1>
            <p className="text-[11px] text-muted-foreground">{heb}</p>
          </div>
          <div className="text-xs text-muted-foreground tabular-nums flex items-center gap-1">
            <Clock className="size-3.5" /><LiveClock />
          </div>
        </div>
      </header>

      <main className="flex-1 mx-auto w-full max-w-md px-5 py-6 space-y-4">
        {[1, 2].map((n) => {
          const s = n as 1 | 2;
          const cfg = s === 1 ? settings.seder1 : settings.seder2;
          const entry = findEntry(s);
          return (
            <section key={s} className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-base font-semibold">סדר {s === 1 ? "א׳" : "ב׳"}</h2>
                  <p className="text-[11px] text-muted-foreground">{cfg.start}–{cfg.end}</p>
                </div>
                {entry?.arrival && entry?.departure ? (
                  <span className="inline-flex items-center gap-1 text-[11px] rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 px-2.5 py-1 font-medium">
                    <Check className="size-3" /> הושלם
                  </span>
                ) : entry?.arrival ? (
                  <span className="text-[11px] rounded-full bg-primary/15 text-primary px-2.5 py-1 font-medium">בסדר</span>
                ) : null}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => stamp(s, "arrival")}
                  className="flex flex-col items-center gap-1 rounded-xl border-2 border-primary/30 bg-primary/5 hover:bg-primary/10 active:scale-[0.98] transition p-4"
                >
                  <LogIn className="size-6 text-primary" />
                  <span className="text-sm font-semibold">הגעתי</span>
                  <span className="text-[11px] text-muted-foreground tabular-nums">
                    {entry?.arrival || "—"}
                  </span>
                </button>
                <button
                  onClick={() => stamp(s, "departure")}
                  className="flex flex-col items-center gap-1 rounded-xl border-2 border-border bg-background hover:bg-accent active:scale-[0.98] transition p-4"
                >
                  <LogOutIcon className="size-6 text-muted-foreground" />
                  <span className="text-sm font-semibold">יצאתי</span>
                  <span className="text-[11px] text-muted-foreground tabular-nums">
                    {entry?.departure || "—"}
                  </span>
                </button>
              </div>
            </section>
          );
        })}

        <div className="rounded-xl border border-dashed border-border bg-muted/30 p-3 text-center text-[11px] text-muted-foreground">
          הרישומים נשמרים מקומית ומסתנכרנים אוטומטית עם התוכנה הראשית.
        </div>
      </main>

      <footer className="border-t border-border bg-card/40 px-5 py-3 text-center text-[11px] text-muted-foreground">
        התוכנה נוצרה ע"י יהודה זקש · כניסה מהירה
      </footer>
      <Toaster position="top-center" dir="rtl" />
    </div>
  );
}

function LiveClock() {
  const [t, setT] = useState(nowHM());
  useEffect(() => {
    const i = setInterval(() => setT(nowHM()), 15000);
    return () => clearInterval(i);
  }, []);
  return <span>{t}</span>;
}