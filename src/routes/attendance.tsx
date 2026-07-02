import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Save, CalendarDays, AlertTriangle, Check, X, FileText } from "lucide-react";
import {
  useSeder, todayISO, calcSeder, newId,
  type SederEntry, type SederNum,
} from "@/lib/kollel-store";
import { useSettings } from "@/lib/settings-store";
import { formatHebrewDate } from "@/lib/hebrew-calendar";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/attendance")({
  head: () => ({ meta: [{ title: "נוכחות סדרים — המעקב שלי" }] }),
  component: AttendancePage,
});

type SederFormState = {
  arrival: string; departure: string;
  absent: boolean; ohevei: boolean;
  excusedAll: boolean; excusedMinutes: number; excusedReason: string;
  manualAdjustMin: number; note: string;
};

function defaultsFor(seder: SederNum, sederCfg: ReturnType<typeof useSettings>["settings"]["seder"]): SederFormState {
  return {
    arrival: seder === 1 ? sederCfg.s1Start : sederCfg.s2Start,
    departure: seder === 1 ? sederCfg.s1End : sederCfg.s2End,
    absent: false, ohevei: false,
    excusedAll: false, excusedMinutes: 0, excusedReason: "",
    manualAdjustMin: 0, note: "",
  };
}

function fromEntry(e: SederEntry): SederFormState {
  return {
    arrival: e.arrival || "",
    departure: e.departure || "",
    absent: e.absent, ohevei: e.ohevei,
    excusedAll: e.excusedAll, excusedMinutes: e.excusedMinutes, excusedReason: e.excusedReason || "",
    manualAdjustMin: e.manualAdjustMin, note: e.note || "",
  };
}

function SederCard({
  num, date, existing, onSaved,
}: { num: SederNum; date: string; existing?: SederEntry; onSaved: () => void }) {
  const { settings } = useSettings();
  const { upsert, remove } = useSeder();
  const [form, setForm] = useState<SederFormState>(() =>
    existing ? fromEntry(existing) : defaultsFor(num, settings.seder));

  useEffect(() => {
    setForm(existing ? fromEntry(existing) : defaultsFor(num, settings.seder));
  }, [existing?.id, num, date]); // eslint-disable-line

  const preview: SederEntry = {
    id: existing?.id || newId(),
    date, seder: num,
    arrival: form.absent ? undefined : form.arrival || undefined,
    departure: form.absent ? undefined : form.departure || undefined,
    absent: form.absent, ohevei: form.ohevei,
    excusedAll: form.excusedAll, excusedMinutes: form.excusedMinutes,
    excusedReason: form.excusedReason || undefined,
    manualAdjustMin: form.manualAdjustMin,
    tags: existing?.tags || [],
    note: form.note || undefined,
  };
  const calc = calcSeder(preview);

  const save = () => {
    try { upsert(preview); toast.success(`סדר ${num === 1 ? "א׳" : "ב׳"} נשמר`); onSaved(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "שגיאה"); }
  };

  const startStr = num === 1 ? settings.seder.s1Start : settings.seder.s2Start;
  const endStr = num === 1 ? settings.seder.s1End : settings.seder.s2End;

  const tryOhevei = () => {
    if (!calc.isOhevei && form.ohevei) {
      toast.warning("לא ניתן לסמן אוהבי ה׳ — הסדר לא נכח מתחילתו ועד סופו");
    }
  };

  return (
    <div className="card-surface p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold">סדר {num === 1 ? "א׳" : "ב׳"} <span className="text-xs text-muted-foreground font-normal">({startStr}–{endStr})</span></h2>
        <div className="flex items-center gap-2">
          {existing && (
            <button onClick={() => { remove(existing.id); toast("הרישום נמחק"); onSaved(); }}
              className="text-xs text-muted-foreground hover:text-destructive">מחק</button>
          )}
          <button onClick={save}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90">
            <Save className="size-3.5" /> שמור
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-muted-foreground">שעת הגעה</label>
          <input type="time" disabled={form.absent} value={form.arrival}
            onChange={(e) => setForm({ ...form, arrival: e.target.value })}
            className="mt-1 w-full rounded-md border border-input bg-card px-3 py-2 text-sm disabled:opacity-50" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">שעת יציאה</label>
          <input type="time" disabled={form.absent} value={form.departure}
            onChange={(e) => setForm({ ...form, departure: e.target.value })}
            className="mt-1 w-full rounded-md border border-input bg-card px-3 py-2 text-sm disabled:opacity-50" />
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <button onClick={() => setForm({ ...form, absent: !form.absent, ohevei: false })}
          className={`rounded-md border-2 px-3 py-2 text-xs font-medium transition ${form.absent ? "bg-status-absent/15 border-status-absent text-status-absent" : "border-border hover:border-status-absent"}`}>
          <X className="size-3.5 inline ml-1" /> היעדרות
        </button>
        <button onClick={() => setForm({ ...form, excusedAll: !form.excusedAll })}
          className={`rounded-md border-2 px-3 py-2 text-xs font-medium transition ${form.excusedAll ? "bg-status-excused/15 border-status-excused text-status-excused" : "border-border hover:border-status-excused"}`}>
          <FileText className="size-3.5 inline ml-1" /> כל המוצדק
        </button>
        <button onClick={() => { const v = !form.ohevei; setForm({ ...form, ohevei: v }); setTimeout(tryOhevei, 0); }}
          disabled={form.absent}
          className={`rounded-md border-2 px-3 py-2 text-xs font-medium transition disabled:opacity-50 ${form.ohevei ? "bg-status-present/15 border-status-present text-status-present" : "border-border hover:border-status-present"}`}>
          <Check className="size-3.5 inline ml-1" /> אוהבי ה׳
        </button>
      </div>

      {!form.excusedAll && (
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground">דקות מוצדקות (חלקי)</label>
            <input type="number" min={0} value={form.excusedMinutes}
              onChange={(e) => setForm({ ...form, excusedMinutes: Math.max(0, +e.target.value || 0) })}
              className="mt-1 w-full rounded-md border border-input bg-card px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">סיבה (אופציונלי)</label>
            <input value={form.excusedReason} maxLength={100}
              onChange={(e) => setForm({ ...form, excusedReason: e.target.value })}
              className="mt-1 w-full rounded-md border border-input bg-card px-3 py-2 text-sm" />
          </div>
        </div>
      )}

      <div className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-muted-foreground">התאמה ידנית (דק׳, חתום)</label>
          <input type="number" value={form.manualAdjustMin}
            onChange={(e) => setForm({ ...form, manualAdjustMin: Math.max(-1440, Math.min(1440, +e.target.value || 0)) })}
            className="mt-1 w-full rounded-md border border-input bg-card px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">הערה</label>
          <input value={form.note} maxLength={200}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
            className="mt-1 w-full rounded-md border border-input bg-card px-3 py-2 text-sm" />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-4 gap-2 text-center">
        <Mini label="חסר" value={calc.missingMin} tone="text-destructive" />
        <Mini label="בונוס" value={calc.bonusMin} tone="text-success" />
        <Mini label="מוצדק" value={calc.excusedMin} tone="text-info" />
        <Mini label="נטו" value={calc.netMissingMin} tone="text-foreground" />
      </div>

      {form.ohevei && !calc.isOhevei && !form.absent && (
        <div className="mt-3 text-xs text-warning flex items-center gap-1">
          <AlertTriangle className="size-3.5" /> אוהבי ה׳ לא יוחל — שעת ההגעה/יציאה לא תואמות את גבולות הסדר.
        </div>
      )}
    </div>
  );
}

function Mini({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-md border border-border p-2">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className={`text-base font-bold tabular-nums ${tone}`}>{value}</div>
    </div>
  );
}

function AttendancePage() {
  const [date, setDate] = useState(todayISO());
  const { entries } = useSeder();
  const dayEntries = entries.filter((e) => e.date === date);
  const e1 = dayEntries.find((x) => x.seder === 1);
  const e2 = dayEntries.find((x) => x.seder === 2);
  const heDate = formatHebrewDate(new Date(date));

  return (
    <AppShell title="נוכחות סדרים" subtitle={heDate}>
      <div className="card-surface p-4 mb-4 flex items-center gap-3">
        <CalendarDays className="size-4 text-muted-foreground" />
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
          className="rounded-md border border-input bg-card px-3 py-1.5 text-sm" />
        <span className="text-xs text-muted-foreground">{heDate}</span>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <SederCard num={1} date={date} existing={e1} onSaved={() => {}} />
        <SederCard num={2} date={date} existing={e2} onSaved={() => {}} />
      </div>
    </AppShell>
  );
}
