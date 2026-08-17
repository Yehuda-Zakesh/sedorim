import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import {
  ChevronDown, ChevronLeft, User, Bell, Palette, Globe, Shield, Database, Search,
  RotateCcw, Type, Contrast, Target, Clock, ShieldCheck, DatabaseBackup,
  RefreshCw, BellRing, Loader2, Download,
} from "lucide-react";
import {
  useSettings, DEFAULT_SETTINGS, resetOnboarding, type FontSize, type DateFormat, type ColorTheme, type BgTheme, updateSettings,
  getSederTimesFor, setSederTimesFromToday, removeSederScheduleEntry, addSederOverride, removeSederOverride,
  type SederTimes,
} from "@/lib/settings-store";
import { COLOR_THEMES, BG_THEMES } from "@/lib/theme-colors";
import { deliverNotification } from "@/lib/notifications";
import {
  getUpdateRepo, setUpdateRepo, checkForUpdate, getLastCheck, clearSkip, type UpdateInfo,
} from "@/lib/updater";
import { openExternal } from "@/lib/open-external";
import { Field, NumberField, SelectField, StackedField, TimeField, Toggle } from "@/components/ui/form";
import { IconBadge } from "@/components/ui/stat";
import { toastUndo } from "@/lib/undo";
import { toast } from "sonner";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "הגדרות — המעקב שלי" }] }),
  component: SettingsPage,
});

// Preferences only. Backup/restore and the audit log used to be inlined here as
// two more accordion sections *and* exist as their own screens — which meant
// "delete the database" was reachable from inside a settings panel. They are
// now linked to instead; see LINKED_SCREENS below.
const SECTIONS = [
  { id: "profile", label: "פרופיל אישי", icon: User },
  { id: "seder", label: "שעות סדרים", icon: Clock },
  { id: "goals", label: "יעדים והתראות", icon: Target },
  { id: "notifications", label: "התראות", icon: Bell },
  { id: "appearance", label: "מראה ועיצוב", icon: Palette },
  { id: "dashboard", label: "לוח בקרה", icon: Type },
  { id: "language", label: "שפה ואזור", icon: Globe },
  { id: "privacy", label: "פרטיות", icon: Shield },
  { id: "data", label: "נתונים וגיבוי", icon: Database },
  { id: "updates", label: "עדכוני גרסה", icon: RefreshCw },
] as const;

const LINKED_SCREENS = [
  { to: "/backup", label: "גיבוי ושחזור", desc: "ייצוא, ייבוא, תמונות מצב ומחיקת נתונים", icon: DatabaseBackup },
  { to: "/audit", label: "יומן ביקורת", desc: "כל הפעולות שבוצעו בתוכנה", icon: ShieldCheck },
] as const;

function SettingsPage() {
  const { settings, update } = useSettings();
  const [open, setOpen] = useState<string | null>("seder");
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
                aria-expanded={isOpen}
                className="w-full flex items-center gap-3 px-5 py-4 text-right hover:bg-accent/40 transition">
                <IconBadge icon={s.icon} size="md" />
                <span className="flex-1 text-sm font-semibold">{s.label}</span>
                <ChevronDown className={`size-4 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
              </button>

              {isOpen && (
                <div className="px-5 pb-5 border-t border-border pt-4 space-y-3">
                  {s.id === "profile" && (
                    <>
                      <Field label="שם תצוגה" value={settings.profile.name}
                        onChange={(v) => update({ profile: { ...settings.profile, name: v } })} />
                      <Field label="כולל / קבוצה" value={settings.profile.classroom}
                        onChange={(v) => update({ profile: { ...settings.profile, classroom: v } })} />
                    </>
                  )}
                  {s.id === "seder" && (
                    <>
                      <SederHoursManager />
                      <NumberField label="סף בונוס להגעה מוקדמת (דק׳)" min={0} max={60} value={settings.seder.bonusThresholdMin}
                        onChange={(v) => update({ seder: { ...settings.seder, bonusThresholdMin: v } })} />
                      <NumberField label="סף התראה לדקות חסרות בחודש" min={0} max={1440} value={settings.seder.alertMissingMinPerMonth}
                        onChange={(v) => update({ seder: { ...settings.seder, alertMissingMinPerMonth: v } })} />
                      <SelectField label="ברירת מחדל לשעת יציאה" value={settings.seder.defaultDeparture}
                        options={[{ v: "seder_end", l: "סוף הסדר" }, { v: "blank", l: "ריק" }]}
                        onChange={(v) => update({ seder: { ...settings.seder, defaultDeparture: v as "seder_end" | "blank" } })} />
                    </>
                  )}
                  {s.id === "goals" && (
                    <>
                      <NumberField label="יעד ציון נוכחות חודשי" min={50} max={100} value={settings.goals.monthlyTarget}
                        onChange={(v) => update({ goals: { ...settings.goals, monthlyTarget: v } })} />
                      <NumberField label="מקסימום איחורים בחודש" min={0} max={31} value={settings.goals.maxLatePerMonth}
                        onChange={(v) => update({ goals: { ...settings.goals, maxLatePerMonth: v } })} />
                    </>
                  )}
                  {s.id === "notifications" && (
                    <>
                      <Toggle label="תזכורת יומית — כשלא נרשם סדר עד תחילת סדר א׳" on={settings.notifications.dailyReminder}
                        onChange={(v) => update({ notifications: { ...settings.notifications, dailyReminder: v } })} />
                      <Toggle label="התראה בחריגה ממכסת האיחורים החודשית" on={settings.notifications.latenessAlert}
                        onChange={(v) => update({ notifications: { ...settings.notifications, latenessAlert: v } })} />
                      <Toggle label="סיכום שבועי" on={settings.notifications.weeklySummary}
                        onChange={(v) => update({ notifications: { ...settings.notifications, weeklySummary: v } })} />
                      <NotificationTester />
                    </>
                  )}
                  {s.id === "updates" && <UpdateSettings />}
                  {s.id === "appearance" && (
                    <>
                      <ColorThemePicker
                        value={settings.appearance.colorTheme}
                        onChange={(v) => update({ appearance: { ...settings.appearance, colorTheme: v } })}
                      />
                      <BackgroundPicker
                        value={settings.appearance.background}
                        onChange={(v) => update({ appearance: { ...settings.appearance, background: v } })}
                      />
                      <SelectField label="גודל גופן" value={settings.appearance.fontSize}
                        options={[{ v: "small", l: "קטן" }, { v: "normal", l: "רגיל" }, { v: "large", l: "גדול" }, { v: "xlarge", l: "גדול מאוד" }]}
                        onChange={(v) => update({ appearance: { ...settings.appearance, fontSize: v as FontSize } })} />
                      <Toggle label={<span className="inline-flex items-center gap-2"><Contrast className="size-4" /> ניגודיות גבוהה</span>}
                        on={settings.appearance.highContrast}
                        onChange={(v) => update({ appearance: { ...settings.appearance, highContrast: v } })} />
                      <Toggle label="תצוגה צפופה" on={settings.appearance.compactMode}
                        onChange={(v) => update({ appearance: { ...settings.appearance, compactMode: v } })} />
                    </>
                  )}
                  {s.id === "dashboard" && (
                    <>
                      <Toggle label="הצג תובנות" on={settings.dashboard.showInsights}
                        onChange={(v) => update({ dashboard: { ...settings.dashboard, showInsights: v } })} />
                      <Toggle label="הצג תזכורות" on={settings.dashboard.showReminders}
                        onChange={(v) => update({ dashboard: { ...settings.dashboard, showReminders: v } })} />
                      <Toggle label="הצג פעולות מהירות" on={settings.dashboard.showQuickActions}
                        onChange={(v) => update({ dashboard: { ...settings.dashboard, showQuickActions: v } })} />
                    </>
                  )}
                  {s.id === "language" && (
                    <SelectField label="פורמט תאריך" value={settings.language.dateFormat}
                      options={[
                        { v: "iso", l: "ISO (YYYY-MM-DD)" },
                        { v: "he", l: "עברי גרגוריאני" },
                        { v: "hebrew", l: "עברי (יט סיון תשפ״ו)" },
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
                        options={[{ v: "off", l: "כבוי" }, { v: "daily", l: "יומי" }, { v: "weekly", l: "שבועי" }]}
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

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
        {LINKED_SCREENS.map((l) => (
          <Link key={l.to} to={l.to}
            className="card-surface p-4 flex items-center gap-3 hover:border-primary transition">
            <IconBadge icon={l.icon} size="md" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold">{l.label}</div>
              <div className="text-xs text-muted-foreground truncate">{l.desc}</div>
            </div>
            <ChevronLeft className="size-4 text-muted-foreground shrink-0" />
          </Link>
        ))}
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        <button onClick={() => { updateSettings(DEFAULT_SETTINGS); toast.success("ההגדרות אופסו"); }}
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

// Notifications are easy to have silently switched off at the OS level, and a
// reminder you never see is indistinguishable from one that was never sent —
// so there is a way to prove the channel works.
function NotificationTester() {
  const [busy, setBusy] = useState(false);
  return (
    <div className="rounded-lg border border-border p-4">
      <div className="text-sm font-semibold">בדיקת התראות</div>
      <p className="mt-1 text-[11px] text-muted-foreground">
        ההתראות מוצגות כהודעות מערכת של Windows, ורק כשהתוכנה פתוחה — אין שירות רקע.
        אם לא מופיעה הודעה, בדוק ב"הגדרות Windows ← מערכת ← התראות" שההתראות עבור סדר פלוס מופעלות.
      </p>
      <button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            const ok = await deliverNotification("סדר פלוס", "בדיקת התראות — ההתראות פועלות כשורה.");
            if (ok) toast.success("נשלחה התראת בדיקה");
            else toast.error("לא ניתן להציג התראה — בדוק את הגדרות ההתראות של Windows");
          } finally { setBusy(false); }
        }}
        className="mt-3 inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-50">
        {busy ? <Loader2 className="size-3.5 animate-spin" /> : <BellRing className="size-3.5" />}
        שלח התראת בדיקה
      </button>
    </div>
  );
}

// The updater has been in the codebase all along, but with no repository
// configured and no UI to configure one it could never actually run. This is
// that UI — still opt-in, so leaving the field empty means the app makes no
// network requests at all.
function UpdateSettings() {
  const [repo, setRepo] = useState(getUpdateRepo());
  const [busy, setBusy] = useState(false);
  const [found, setFound] = useState<UpdateInfo | null>(null);
  const lastCheck = getLastCheck();

  const check = async () => {
    setBusy(true);
    setFound(null);
    try {
      const info = await checkForUpdate(repo);
      if (!info) { toast.error("הזן מאגר בתבנית owner/repo"); return; }
      setFound(info);
      if (info.isNewer) { clearSkip(); toast.success(`נמצאה גרסה חדשה: ${info.latest}`); }
      else toast.success("הגרסה שלך עדכנית");
    } catch {
      toast.error("הבדיקה נכשלה — אין חיבור לאינטרנט או שהמאגר לא נמצא");
    } finally { setBusy(false); }
  };

  return (
    <>
      <Field label="מאגר GitHub לעדכונים" value={repo} onChange={setRepo}
        placeholder="owner/repo — השאר ריק כדי לכבות" />
      <p className="text-[11px] text-muted-foreground">
        כשמוגדר מאגר, התוכנה בודקת פעמיים ביום אם פורסמה גרסה חדשה ומציעה להוריד אותה.
        כשהשדה ריק — לא מתבצעת שום פנייה לאינטרנט.
        {lastCheck && ` בדיקה אחרונה: ${new Date(lastCheck).toLocaleString("he-IL")}.`}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => { setUpdateRepo(repo); toast.success(repo.trim() ? "המאגר נשמר" : "בדיקת עדכונים כובתה"); }}
          className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground">
          שמור
        </button>
        <button onClick={check} disabled={busy || !repo.trim()}
          className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-50">
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
          בדוק עכשיו
        </button>
      </div>
      {found?.isNewer && found.downloadUrl && (
        <div className="rounded-lg border border-primary/40 bg-primary/5 p-3 flex items-center gap-3">
          <div className="flex-1 text-xs">
            <b>גרסה {found.latest}</b> זמינה (מותקנת: {found.current}).
          </div>
          <button onClick={() => openExternal(found.downloadUrl!)}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground">
            <Download className="size-3.5" /> הורדה
          </button>
        </div>
      )}
    </>
  );
}

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function TimesGrid({ times, onChange }: { times: SederTimes; onChange: (t: SederTimes) => void }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <TimeField label="סדר א׳ — תחילה" value={times.s1Start} onChange={(v) => onChange({ ...times, s1Start: v })} />
      <TimeField label="סדר א׳ — סיום" value={times.s1End} onChange={(v) => onChange({ ...times, s1End: v })} />
      <TimeField label="סדר ב׳ — תחילה" value={times.s2Start} onChange={(v) => onChange({ ...times, s2Start: v })} />
      <TimeField label="סדר ב׳ — סיום" value={times.s2End} onChange={(v) => onChange({ ...times, s2End: v })} />
    </div>
  );
}

function SederHoursManager() {
  const { settings } = useSettings();
  const current = getSederTimesFor(todayIso());
  const [draft, setDraft] = useState<SederTimes>(current);
  const [from, setFrom] = useState(todayIso());

  const dirty = JSON.stringify(draft) !== JSON.stringify(current);

  // temporary override form
  const [ovOpen, setOvOpen] = useState(false);
  const [ovFrom, setOvFrom] = useState(todayIso());
  const [ovTo, setOvTo] = useState(todayIso());
  const [ovLabel, setOvLabel] = useState("");
  const [ovTimes, setOvTimes] = useState<SederTimes>(current);

  const schedule = [...(settings.sederSchedule || [])].sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1));
  const overrides = [...(settings.sederOverrides || [])].sort((a, b) => (a.from < b.from ? 1 : -1));

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border p-4 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <div className="text-sm font-semibold">שעות הסדרים הנוכחיות</div>
            <div className="text-[11px] text-muted-foreground">
              שינוי יחול מהתאריך שנבחר ואילך בלבד — רישומים קודמים ממשיכים להיחשב לפי השעות שהיו אז.
            </div>
          </div>
          <StackedField label="בתוקף מתאריך">
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
              className="field-input block" />
          </StackedField>
        </div>
        <TimesGrid times={draft} onChange={setDraft} />
        <div className="flex items-center gap-2">
          <button disabled={!dirty}
            onClick={() => { setSederTimesFromToday(draft, from); toast.success(`השעות עודכנו מתאריך ${from} ואילך`); }}
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-40">
            שמור שינוי
          </button>
          {dirty && (
            <button onClick={() => setDraft(current)} className="text-xs text-muted-foreground hover:text-foreground">ביטול</button>
          )}
        </div>
      </div>

      {schedule.length > 0 && (
        <div className="rounded-lg border border-border p-4">
          <div className="text-sm font-semibold mb-2">היסטוריית שעות</div>
          <ul className="space-y-2">
            {schedule.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3 text-xs">
                <span className="text-muted-foreground tabular-nums">
                  {e.effectiveFrom === "0001-01-01" ? "עד השינוי הראשון" : `מ־${e.effectiveFrom}`}
                </span>
                <span className="tabular-nums">{e.times.s1Start}–{e.times.s1End} · {e.times.s2Start}–{e.times.s2End}</span>
                <button
                  onClick={() => {
                    // Deleting a schedule entry silently re-scores every past
                    // record against different hours, so it gets an undo too.
                    const before = settings.sederSchedule || [];
                    removeSederScheduleEntry(e.id);
                    toastUndo("שינוי השעות נמחק", () => updateSettings({ sederSchedule: before }));
                  }}
                  className="text-muted-foreground hover:text-destructive">מחק</button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-lg border border-border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold">שינוי זמני לטווח תאריכים</div>
            <div className="text-[11px] text-muted-foreground">בתום הטווח השעות חוזרות אוטומטית להגדרה השמורה.</div>
          </div>
          <button onClick={() => setOvOpen((v) => !v)}
            className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent/40">
            {ovOpen ? "סגור" : "הוסף טווח"}
          </button>
        </div>

        {ovOpen && (
          <div className="space-y-3 border-t border-border pt-3">
            <div className="grid grid-cols-3 gap-3">
              <StackedField label="מתאריך">
                <input type="date" value={ovFrom} onChange={(e) => setOvFrom(e.target.value)}
                  className="field-input w-full" />
              </StackedField>
              <StackedField label="עד תאריך">
                <input type="date" value={ovTo} onChange={(e) => setOvTo(e.target.value)}
                  className="field-input w-full" />
              </StackedField>
              <StackedField label="תיאור (אופציונלי)">
                <input value={ovLabel} maxLength={40} onChange={(e) => setOvLabel(e.target.value)}
                  className="field-input w-full" />
              </StackedField>
            </div>
            <TimesGrid times={ovTimes} onChange={setOvTimes} />
            <button
              onClick={() => {
                if (ovTo < ovFrom) { toast.error("תאריך הסיום מוקדם מתאריך ההתחלה"); return; }
                addSederOverride({ from: ovFrom, to: ovTo, label: ovLabel || undefined, times: ovTimes });
                setOvOpen(false); setOvLabel("");
                toast.success("נוסף שינוי זמני");
              }}
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground">
              שמור טווח
            </button>
          </div>
        )}

        {overrides.length > 0 && (
          <ul className="space-y-2 border-t border-border pt-3">
            {overrides.map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-3 text-xs">
                <span className="text-muted-foreground tabular-nums">{o.from} → {o.to}{o.label ? ` · ${o.label}` : ""}</span>
                <span className="tabular-nums">{o.times.s1Start}–{o.times.s1End} · {o.times.s2Start}–{o.times.s2End}</span>
                <button
                  onClick={() => {
                    const before = settings.sederOverrides || [];
                    removeSederOverride(o.id);
                    toastUndo("השינוי הזמני נמחק", () => updateSettings({ sederOverrides: before }));
                  }}
                  className="text-muted-foreground hover:text-destructive">מחק</button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ColorThemePicker({ value, onChange }: { value: ColorTheme; onChange: (v: ColorTheme) => void }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground mb-2">ערכת צבעים</div>
      <div className="grid grid-cols-6 sm:grid-cols-11 gap-2">
        {COLOR_THEMES.map((t) => {
          const active = value === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onChange(t.id)}
              title={t.label}
              aria-label={t.label}
              className={`relative aspect-square rounded-lg border-2 transition ${active ? "border-foreground scale-105" : "border-transparent hover:scale-105"}`}
              style={{ backgroundColor: t.hex }}
            >
              {active && <span className="absolute inset-0 grid place-items-center text-white text-xs font-bold">✓</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function BackgroundPicker({ value, onChange }: { value: BgTheme; onChange: (v: BgTheme) => void }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground mb-2">רקע מסך (פעיל במצב בהיר)</div>
      <div className="grid grid-cols-5 sm:grid-cols-10 gap-2">
        {BG_THEMES.map((t) => {
          const active = value === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onChange(t.id)}
              title={t.label}
              aria-label={t.label}
              className={`relative aspect-square rounded-lg border-2 transition ${active ? "border-foreground scale-105" : "border-border hover:scale-105"}`}
              style={{ backgroundColor: t.hex }}
            >
              {active && <span className="absolute inset-0 grid place-items-center text-foreground text-xs font-bold">✓</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
