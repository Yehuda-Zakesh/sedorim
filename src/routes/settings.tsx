import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import {
  ChevronDown, User, Bell, Palette, Globe, Shield, Database, Search,
  RotateCcw, Type, Contrast, Target,
} from "lucide-react";
import { useSettings, DEFAULT_SETTINGS, type FontSize, type DateFormat } from "@/lib/settings-store";
import { resetOnboarding } from "@/lib/settings-store";
import { toast } from "sonner";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "הגדרות — המעקב שלי" }] }),
  component: SettingsPage,
});

const SECTIONS = [
  { id: "profile", label: "פרופיל אישי", icon: User },
  { id: "goals", label: "יעדים אישיים", icon: Target },
  { id: "notifications", label: "התראות", icon: Bell },
  { id: "appearance", label: "מראה ועיצוב", icon: Palette },
  { id: "dashboard", label: "לוח בקרה", icon: Type },
  { id: "language", label: "שפה ואזור", icon: Globe },
  { id: "privacy", label: "פרטיות ואבטחה", icon: Shield },
  { id: "data", label: "נתונים וגיבוי", icon: Database },
] as const;

function SettingsPage() {
  const { settings, update } = useSettings();
  const [open, setOpen] = useState<string | null>("profile");
  const [q, setQ] = useState("");
  const visible = SECTIONS.filter((s) => s.label.includes(q));

  return (
    <AppShell title="הגדרות" subtitle="העדפות אישיות נשמרות אוטומטית">
      <div className="card-surface p-3 mb-4 relative">
        <Search className="absolute right-5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="חיפוש בהגדרות..."
          className="w-full rounded-md bg-transparent pr-9 pl-3 py-1.5 text-sm focus:outline-none" />
      </div>

      <div className="space-y-3">
        {visible.map((s) => {
          const isOpen = open === s.id;
          return (
            <div key={s.id} className="card-surface overflow-hidden">
              <button onClick={() => setOpen(isOpen ? null : s.id)}
                className="w-full flex items-center gap-3 px-5 py-4 text-right hover:bg-accent/40 transition">
                <div className="size-9 rounded-md bg-primary/10 text-primary grid place-items-center">
                  <s.icon className="size-4" />
                </div>
                <span className="flex-1 text-sm font-semibold">{s.label}</span>
                <ChevronDown className={`size-4 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
              </button>

              {isOpen && (
                <div className="px-5 pb-5 border-t border-border pt-4 space-y-3">
                  {s.id === "profile" && (
                    <>
                      <Field label="שם תצוגה" value={settings.profile.name}
                        onChange={(v) => update({ profile: { ...settings.profile, name: v } })} />
                      <Field label="כיתה / קבוצה" value={settings.profile.classroom}
                        onChange={(v) => update({ profile: { ...settings.profile, classroom: v } })} />
                    </>
                  )}
                  {s.id === "goals" && (
                    <>
                      <NumberField label="יעד נוכחות חודשי (%)" min={50} max={100} value={settings.goals.monthlyTarget}
                        onChange={(v) => update({ goals: { ...settings.goals, monthlyTarget: v } })} />
                      <NumberField label="מקסימום איחורים בחודש" min={0} max={31} value={settings.goals.maxLatePerMonth}
                        onChange={(v) => update({ goals: { ...settings.goals, maxLatePerMonth: v } })} />
                    </>
                  )}
                  {s.id === "notifications" && (
                    <>
                      <Toggle label="תזכורת לרישום נוכחות יומית" on={settings.notifications.dailyReminder}
                        onChange={(v) => update({ notifications: { ...settings.notifications, dailyReminder: v } })} />
                      <Toggle label="התראה כשמתקרב למכסת איחורים" on={settings.notifications.latenessAlert}
                        onChange={(v) => update({ notifications: { ...settings.notifications, latenessAlert: v } })} />
                      <Toggle label="סיכום שבועי" on={settings.notifications.weeklySummary}
                        onChange={(v) => update({ notifications: { ...settings.notifications, weeklySummary: v } })} />
                    </>
                  )}
                  {s.id === "appearance" && (
                    <>
                      <SelectField label="גודל גופן" value={settings.appearance.fontSize}
                        options={[
                          { v: "small", l: "קטן" },
                          { v: "normal", l: "רגיל" },
                          { v: "large", l: "גדול" },
                          { v: "xlarge", l: "גדול מאוד" },
                        ]}
                        onChange={(v) => update({ appearance: { ...settings.appearance, fontSize: v as FontSize } })} />
                      <Toggle label={<span className="inline-flex items-center gap-2"><Contrast className="size-4" /> ניגודיות גבוהה (נגישות)</span>}
                        on={settings.appearance.highContrast}
                        onChange={(v) => update({ appearance: { ...settings.appearance, highContrast: v } })} />
                      <Toggle label="תצוגה צפופה (פחות מרווחים)"
                        on={settings.appearance.compactMode}
                        onChange={(v) => update({ appearance: { ...settings.appearance, compactMode: v } })} />
                    </>
                  )}
                  {s.id === "dashboard" && (
                    <>
                      <Toggle label="הצג כרטיס תובנות בלוח הבקרה" on={settings.dashboard.showInsights}
                        onChange={(v) => update({ dashboard: { ...settings.dashboard, showInsights: v } })} />
                      <Toggle label="הצג תזכורות אישיות" on={settings.dashboard.showReminders}
                        onChange={(v) => update({ dashboard: { ...settings.dashboard, showReminders: v } })} />
                      <Toggle label="הצג פעולות מהירות" on={settings.dashboard.showQuickActions}
                        onChange={(v) => update({ dashboard: { ...settings.dashboard, showQuickActions: v } })} />
                    </>
                  )}
                  {s.id === "language" && (
                    <SelectField label="פורמט תאריך" value={settings.language.dateFormat}
                      options={[
                        { v: "iso", l: "ISO (YYYY-MM-DD)" },
                        { v: "he", l: "עברי (יום שלישי, 5 ביוני)" },
                        { v: "mixed", l: "מעורב" },
                      ]}
                      onChange={(v) => update({ language: { dateFormat: v as DateFormat } })} />
                  )}
                  {s.id === "privacy" && (
                    <>
                      <Toggle label="תיעוד פעולות ביומן ביקורת" on={settings.privacy.enableAudit}
                        onChange={(v) => update({ privacy: { ...settings.privacy, enableAudit: v } })} />
                      <Toggle label="נעילת מסך באזורים רגישים" on={settings.privacy.lockScreen}
                        onChange={(v) => update({ privacy: { ...settings.privacy, lockScreen: v } })} />
                    </>
                  )}
                  {s.id === "data" && (
                    <>
                      <SelectField label="תדירות גיבוי אוטומטי" value={settings.data.autoBackup}
                        options={[
                          { v: "off", l: "כבוי" },
                          { v: "daily", l: "יומי" },
                          { v: "weekly", l: "שבועי" },
                        ]}
                        onChange={(v) => update({ data: { ...settings.data, autoBackup: v as "off" | "daily" | "weekly" } })} />
                      <NumberField label="מספר גיבויים לשמור" min={1} max={20} value={settings.data.backupRetention}
                        onChange={(v) => update({ data: { ...settings.data, backupRetention: v } })} />
                      <Toggle label="גיבוי לפני פעולות גדולות" on={settings.data.autoBackupBeforeOps}
                        onChange={(v) => update({ data: { ...settings.data, autoBackupBeforeOps: v } })} />
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        <button onClick={() => { update(DEFAULT_SETTINGS); toast.success("ההגדרות אופסו"); }}
          className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-xs hover:bg-accent">
          <RotateCcw className="size-3.5" /> אפס הגדרות לברירת מחדל
        </button>
        <button onClick={() => { resetOnboarding(); toast("האשף יוצג בטעינה הבאה"); }}
          className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-xs hover:bg-accent">
          הפעל מחדש אשף התקנה
        </button>
      </div>
    </AppShell>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="grid grid-cols-3 gap-3 items-center">
      <label className="text-xs text-muted-foreground">{label}</label>
      <input value={value} onChange={(e) => onChange(e.target.value)} maxLength={80}
        className="col-span-2 rounded-md border border-input bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
    </div>
  );
}

function NumberField({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div className="grid grid-cols-3 gap-3 items-center">
      <label className="text-xs text-muted-foreground">{label}</label>
      <input type="number" min={min} max={max} value={value}
        onChange={(e) => onChange(Math.max(min, Math.min(max, +e.target.value || 0)))}
        className="col-span-2 rounded-md border border-input bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
    </div>
  );
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: { v: string; l: string }[]; onChange: (v: string) => void }) {
  return (
    <div className="grid grid-cols-3 gap-3 items-center">
      <label className="text-xs text-muted-foreground">{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="col-span-2 rounded-md border border-input bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
        {options.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
      </select>
    </div>
  );
}

function Toggle({ label, on, onChange }: { label: React.ReactNode; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
      <span className="text-sm">{label}</span>
      <button onClick={() => onChange(!on)}
        className={`relative h-6 w-11 rounded-full transition ${on ? "bg-primary" : "bg-muted"}`}>
        <span className={`absolute top-0.5 size-5 rounded-full bg-card shadow transition-all ${on ? "right-0.5" : "right-[22px]"}`} />
      </button>
    </div>
  );
}
