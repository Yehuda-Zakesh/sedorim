// Settings, reorganised.
//
// There used to be ten sections, and the same decision could be made in two of
// them: the monthly lateness quota lived under both "יעדים" and "התראות", the
// missing-minutes alert threshold under "שעות סדרים" while the alert it drives
// was under "התראות", and two whole sections — "שפה ואזור" and "פרטיות" —
// contained nothing but switches that changed nothing at all.
//
// Six sections now, each one a thing a person wants to change, with every
// setting that feeds one decision sitting together. The audit log is gone; in
// its place is the problem log — one file on disk, shown here (see
// src/lib/diagnostics.ts).
//
// Version updates are deliberately absent from this screen: the check runs
// silently in the background and the only thing anyone ever sees is the dialog
// asking whether to install a new version (see src/lib/updater.ts).
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import {
  ChevronDown, ChevronLeft, User, Bell, Palette, Database, Search,
  RotateCcw, LayoutDashboard, Contrast, Target, Clock, DatabaseBackup,
  RefreshCw, BellRing, Loader2, FileWarning, FolderOpen, Trash2,
} from "lucide-react";
import {
  useSettings, DEFAULT_SETTINGS, resetOnboarding, type FontSize, type ColorTheme, type BgTheme, updateSettings,
  getSederTimesFor, setSederTimesFromToday, removeSederScheduleEntry, addSederOverride, removeSederOverride,
  sederTimesError, type SederTimes,
} from "@/lib/settings-store";
import { COLOR_THEMES, BG_THEMES } from "@/lib/theme-colors";
import { announce } from "@/lib/notifications";
import { readLog, openLogFolder, clearLog } from "@/lib/diagnostics";
import { isDesktop } from "@/lib/tauri";
import { Field, NumberField, SelectField, StackedField, TimeField, Toggle } from "@/components/ui/form";
import { IconBadge } from "@/components/ui/stat";
import { toastUndo } from "@/lib/undo";
import { toast } from "sonner";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "הגדרות — סדר פלוס" }] }),
  component: SettingsPage,
});

const SECTIONS = [
  { id: "seder", label: "שעות הסדרים", icon: Clock, hint: "מתי מתחיל ומסתיים כל סדר, כולל שינויים לתקופה" },
  { id: "goals", label: "יעדים והתראות", icon: Target, hint: "יעד חודשי, מכסת איחורים ואיזה תזכורות להציג" },
  { id: "profile", label: "פרופיל אישי", icon: User, hint: "השם שמופיע בדוחות" },
  { id: "appearance", label: "מראה ועיצוב", icon: Palette, hint: "צבעים, רקע, גודל גופן" },
  { id: "dashboard", label: "לוח הבקרה", icon: LayoutDashboard, hint: "אילו חלקים להציג במסך הראשי" },
  { id: "data", label: "נתונים וגיבוי", icon: Database, hint: "גיבוי אוטומטי ומספר הגיבויים לשמור" },
  { id: "log", label: "יומן תקלות", icon: FileWarning, hint: "מה נכשל, אם משהו נכשל" },
] as const;

function SettingsPage() {
  const { settings, update } = useSettings();
  const [open, setOpen] = useState<string | null>("seder");
  const [q, setQ] = useState("");
  const visible = SECTIONS.filter((s) => s.label.includes(q) || s.hint.includes(q));

  return (
    <AppShell title="הגדרות" subtitle="כל שינוי נשמר מיד">
      <div className="card-surface p-3 mb-4 relative">
        <Search className="absolute start-5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="חיפוש בהגדרות..."
          className="w-full rounded-md bg-transparent ps-9 pe-3 py-1.5 text-sm focus:outline-none" />
      </div>

      <div className="space-y-3">
        {visible.map((s) => {
          const isOpen = open === s.id;
          return (
            <div key={s.id} className="card-surface overflow-hidden">
              <button onClick={() => setOpen(isOpen ? null : s.id)}
                aria-expanded={isOpen}
                className="w-full flex items-center gap-3 px-5 py-4 text-start hover:bg-accent/40 pressable transition">
                <IconBadge icon={s.icon} size="md" />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-semibold">{s.label}</span>
                  <span className="block text-xs text-muted-foreground truncate">{s.hint}</span>
                </span>
                <ChevronDown className={`size-4 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
              </button>

              {isOpen && (
                <div className="px-5 pb-5 border-t border-border pt-4 space-y-3">
                  {s.id === "seder" && (
                    <>
                      <SederHoursManager />
                      <NumberField label="סף בונוס להגעה מוקדמת (דק׳)" min={0} max={60} value={settings.seder.bonusThresholdMin}
                        onChange={(v) => update({ seder: { ...settings.seder, bonusThresholdMin: v } })} />
                      <p className="text-2xs text-muted-foreground">
                        הגעה לפני תחילת הסדר נצברת כבונוס שמקטין את החסר — עד למספר הדקות הזה בכל סדר.
                      </p>
                    </>
                  )}

                  {s.id === "goals" && (
                    <>
                      <NumberField label="יעד ציון נוכחות חודשי" min={50} max={100} value={settings.goals.monthlyTarget}
                        onChange={(v) => update({ goals: { ...settings.goals, monthlyTarget: v } })} />
                      <NumberField label="מקסימום איחורים בחודש" min={0} max={31} value={settings.goals.maxLatePerMonth}
                        onChange={(v) => update({ goals: { ...settings.goals, maxLatePerMonth: v } })} />
                      <NumberField label="סף התראה לדקות חסרות בחודש" min={0} max={1440} value={settings.seder.alertMissingMinPerMonth}
                        onChange={(v) => update({ seder: { ...settings.seder, alertMissingMinPerMonth: v } })} />

                      <div className="pt-2 text-xs font-semibold text-muted-foreground">איך להציג את התזכורות</div>
                      <Toggle label="הודעות קופצות בתוך התוכנה" on={settings.notifications.popups}
                        onChange={(v) => update({ notifications: { ...settings.notifications, popups: v } })} />
                      <Toggle
                        label={
                          <span>
                            התראות בשולחן העבודה
                            <span className="block text-2xs text-muted-foreground">
                              הודעות Windows — מופיעות גם כשהתוכנה מוסתרת מאחורי חלון אחר
                            </span>
                          </span>
                        }
                        on={settings.notifications.desktop}
                        onChange={(v) => update({ notifications: { ...settings.notifications, desktop: v } })} />

                      <div className="pt-2 text-xs font-semibold text-muted-foreground">אילו תזכורות</div>
                      <Toggle label="תזכורת יומית — כשלא נרשם סדר עד תחילת סדר א׳" on={settings.notifications.dailyReminder}
                        onChange={(v) => update({ notifications: { ...settings.notifications, dailyReminder: v } })} />
                      <Toggle label="התראה בחריגה ממכסת האיחורים החודשית" on={settings.notifications.latenessAlert}
                        onChange={(v) => update({ notifications: { ...settings.notifications, latenessAlert: v } })} />
                      <Toggle label="סיכום שבועי" on={settings.notifications.weeklySummary}
                        onChange={(v) => update({ notifications: { ...settings.notifications, weeklySummary: v } })} />
                      <NotificationTester />
                    </>
                  )}

                  {s.id === "profile" && (
                    <>
                      <Field label="שם תצוגה" value={settings.profile.name}
                        onChange={(v) => update({ profile: { ...settings.profile, name: v } })} />
                      <Field label="כולל / קבוצה" value={settings.profile.classroom}
                        onChange={(v) => update({ profile: { ...settings.profile, classroom: v } })} />
                      <p className="text-2xs text-muted-foreground">שני השדות האלה מופיעים בכותרת כל דוח שמופק.</p>
                    </>
                  )}

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
                      <Toggle label="הצג סיכום מהיר ותובנות" on={settings.dashboard.showInsights}
                        onChange={(v) => update({ dashboard: { ...settings.dashboard, showInsights: v } })} />
                      <Toggle label="הצג תזכורות" on={settings.dashboard.showReminders}
                        onChange={(v) => update({ dashboard: { ...settings.dashboard, showReminders: v } })} />
                      <Toggle label="הצג פעולות מהירות" on={settings.dashboard.showQuickActions}
                        onChange={(v) => update({ dashboard: { ...settings.dashboard, showQuickActions: v } })} />
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
                      <Link to="/backup"
                        className="mt-1 flex items-center gap-3 rounded-lg border border-border p-3 hover:border-primary pressable transition">
                        <IconBadge icon={DatabaseBackup} size="md" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold">גיבוי ושחזור</div>
                          <div className="text-xs text-muted-foreground truncate">ייצוא, ייבוא, תמונות מצב ומחיקת נתונים</div>
                        </div>
                        <ChevronLeft className="size-4 text-muted-foreground shrink-0" />
                      </Link>
                    </>
                  )}

                  {s.id === "log" && <ProblemLog />}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        <button onClick={() => { updateSettings(DEFAULT_SETTINGS); toast.success("ההגדרות אופסו"); }}
          className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-xs hover:bg-accent">
          <RotateCcw className="size-3.5" /> אפס הגדרות לברירת מחדל
        </button>
        <button onClick={() => { resetOnboarding(); toast("האשף יוצג בטעינה הבאה"); }}
          className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-xs hover:bg-accent">
          הפעל מחדש את אשף ההגדרה
        </button>
      </div>
    </AppShell>
  );
}

// A reminder you never see is indistinguishable from one that was never sent,
// so there is a way to prove the channel works — for both channels at once.
function NotificationTester() {
  const [busy, setBusy] = useState(false);
  return (
    <div className="rounded-lg border border-border p-4">
      <div className="text-sm font-semibold">בדיקת התראות</div>
      <p className="mt-1 text-2xs text-muted-foreground">
        נשלחת התראה לדוגמה בכל הערוצים שסימנת. אם התראת שולחן העבודה לא מופיעה,
        בדוק ב"הגדרות Windows ← מערכת ← התראות" שההתראות עבור סדר פלוס מופעלות.
      </p>
      <button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            const result = await announce("סדר פלוס", "בדיקת התראות — ההתראות פועלות כשורה.");
            if (result.desktop) toast.success("נשלחה התראת שולחן עבודה");
            else if (result.popup) toast.success("הודעה קופצת פועלת. התראות שולחן העבודה כבויות או חסומות.");
            else toast.error("שני ערוצי ההתראות כבויים — סמן לפחות אחד מהם");
          } finally { setBusy(false); }
        }}
        className="mt-3 inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-50">
        {busy ? <Loader2 className="size-3.5 animate-spin" /> : <BellRing className="size-3.5" />}
        שלח התראת בדיקה
      </button>
    </div>
  );
}

/**
 * The tail of the log file. This is what replaced the audit log: not a record
 * of what the user did, but of what went wrong — the thing that was genuinely
 * impossible to find out from inside a packaged EXE.
 */
function ProblemLog() {
  const [text, setText] = useState<string>("");
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try { setText(await readLog()); } finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const lines = text.split("\n").filter((l) => l.trim().length > 0);

  return (
    <>
      <p className="text-2xs text-muted-foreground">
        התוכנה כותבת לכאן כל תקלה — ייצוא שנכשל, שמירה שלא עברה, שגיאה לא צפויה.
        {isDesktop
          ? " הקובץ נמצא בתיקיית הנתונים, תחת logs\\sederplus.log."
          : " בהרצה בדפדפן הרשומות נשמרות בזיכרון החלון בלבד."}
      </p>

      <div className="rounded-lg border border-border bg-muted/30 max-h-72 overflow-auto p-3" dir="ltr">
        {loading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" /> טוען...
          </div>
        ) : lines.length === 0 ? (
          <div dir="rtl" className="text-xs text-muted-foreground">לא נרשמו תקלות. זה המצב הרצוי.</div>
        ) : (
          <ol className="space-y-1 font-mono text-2xs leading-relaxed">
            {/* Newest first — a log is read from the end. */}
            {[...lines].reverse().map((line, i) => (
              <li key={i} className={line.includes(" ERROR ") ? "text-destructive" : line.includes(" WARN ") ? "text-warning-fg" : "text-muted-foreground"}>
                {line}
              </li>
            ))}
          </ol>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button onClick={load}
          className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent">
          <RefreshCw className="size-3.5" /> רענן
        </button>
        {isDesktop && (
          <button onClick={async () => { if (!(await openLogFolder())) toast.error("פתיחת התיקייה נכשלה"); }}
            className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent">
            <FolderOpen className="size-3.5" /> פתח את התיקייה
          </button>
        )}
        {lines.length > 0 && (
          <button onClick={async () => { await clearLog(); await load(); toast.success("היומן נמחק"); }}
            className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-destructive hover:bg-accent">
            <Trash2 className="size-3.5" /> מחק את היומן
          </button>
        )}
        <span className="text-2xs text-muted-foreground">{lines.length} רשומות</span>
      </div>
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
  const draftError = sederTimesError(draft);

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
            <div className="text-2xs text-muted-foreground">
              שינוי יחול מהתאריך שנבחר ואילך בלבד — רישומים קודמים ממשיכים להיחשב לפי השעות שהיו אז.
            </div>
          </div>
          <StackedField label="בתוקף מתאריך">
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
              className="field-input block" />
          </StackedField>
        </div>
        <TimesGrid times={draft} onChange={setDraft} />
        {draftError && <p className="text-xs text-destructive">{draftError}</p>}
        <div className="flex items-center gap-2">
          <button disabled={!dirty || draftError !== null}
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
            <div className="text-2xs text-muted-foreground">בתום הטווח השעות חוזרות אוטומטית להגדרה השמורה.</div>
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
                const err = sederTimesError(ovTimes);
                if (err) { toast.error(err); return; }
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
      {/* Selection is a ring set off from the swatch, not a scale-up and a tick
          drawn on top of it: the tick was white on every swatch, so on the
          amber and lime ones it was invisible, and growing one cell of a tight
          grid pushed it over its neighbours. A ring reads on any colour and
          stays inside its own cell. */}
      <div role="radiogroup" aria-label="ערכת צבעים" className="grid grid-cols-6 sm:grid-cols-11 gap-2.5">
        {COLOR_THEMES.map((t) => {
          const active = value === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(t.id)}
              title={t.label}
              aria-label={t.label}
              className={`aspect-square rounded-lg pressable ${
                active
                  ? "ring-2 ring-foreground ring-offset-2 ring-offset-card"
                  : "ring-1 ring-black/10 hover:ring-2 hover:ring-foreground/40"
              }`}
              style={{ backgroundColor: t.hex }}
            />
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
      <div role="radiogroup" aria-label="רקע מסך" className="grid grid-cols-5 sm:grid-cols-10 gap-2.5">
        {BG_THEMES.map((t) => {
          const active = value === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(t.id)}
              title={t.label}
              aria-label={t.label}
              className={`aspect-square rounded-lg pressable ${
                active
                  ? "ring-2 ring-foreground ring-offset-2 ring-offset-card"
                  : "ring-1 ring-black/10 hover:ring-2 hover:ring-foreground/40"
              }`}
              style={{ backgroundColor: t.hex }}
            />
          );
        })}
      </div>
    </div>
  );
}
