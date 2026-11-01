// Settings, grouped by what a person is trying to do.
//
// Five groups, each one a decision area:
//
//   שעות וכללי נוכחות · יעדים ותזכורות · מראה ופרופיל · נתונים וגיבוי · תחזוקה ואודות
//
// Each setting is one ruled row: the name and a one-line explanation at the
// start, the control at the end, as wide as its value needs (a time, a small
// number, a name). Two kinds of control live here and the screen says which is
// which:
//   - preferences that save the moment they change flash "נשמר";
//   - the seder-hours form, which needs an effective date: it shows "טיוטה"
//     while it differs from what it started as, saves on "שמור שינוי", can be
//     cancelled, and warns before a draft would be lost by leaving the screen.
//
// Search matches names and keywords. Rows that do not match are hidden with
// the `hidden` attribute rather than unmounted, and so are collapsed groups —
// and every row keeps the same shape whether hidden or shown — so a half-typed
// draft survives searching, folding a group and clearing the query. The hours
// draft itself lives in this page component, above all of that.
//
// Version updates are deliberately absent from this screen: the check runs
// silently in the background and the only thing anyone ever sees is the dialog
// asking whether to install a new version (see src/lib/updater.ts).
import { createFileRoute, Link, useBlocker } from "@tanstack/react-router";
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import {
  ChevronDown,
  ChevronLeft,
  Search,
  RotateCcw,
  Clock,
  Target,
  Palette,
  DatabaseBackup,
  Wrench,
  BellRing,
  Loader2,
  FolderOpen,
  Trash2,
  RefreshCw,
  Check,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  useSettings,
  DEFAULT_SETTINGS,
  getSettings,
  resetOnboarding,
  type FontSize,
  type ColorTheme,
  type BgTheme,
  type Settings,
  updateSettings,
  getSederTimesFor,
  setSederTimesFromTodayChecked,
  removeSederScheduleEntry,
  addSederOverride,
  removeSederOverride,
  sederTimesError,
  SHAS_ARRIVAL_DEADLINE,
  type SederTimes,
} from "@/lib/settings-store";
import {
  hoursDraftState,
  hoursSavedMessage,
  SAVE_STATE_TEXT,
  type HoursDraft,
  type SaveState,
} from "@/lib/settings-hours";
import { todayISO, useToday } from "@/lib/today";
import { tokensOf, visibleItems } from "@/lib/settings-search";
import { COLOR_THEMES, BG_THEMES } from "@/lib/theme-colors";
import {
  announce,
  useNotificationLearning,
  resetNotificationLearning,
  NOTIFICATION_KINDS,
  type NotificationKind,
} from "@/lib/notifications";
import type { KindMemory } from "@/lib/notification-learning";
import { isRegisteredToStartWithWindows, setBackgroundEnabled } from "@/lib/background";
import { readLog, openLogFolder, clearLog } from "@/lib/diagnostics";
import { isDesktop } from "@/lib/tauri";
import {
  Field,
  NumberField,
  SelectField,
  StackedField,
  TimeField,
  Toggle,
} from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { EmptyNote } from "@/components/ui/ledger";
import { toastUndo } from "@/lib/undo";
import { toast } from "sonner";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "הגדרות — סדר פלוס" }] }),
  component: SettingsPage,
});

type Patch = Partial<Settings>;

type Item = {
  id: string;
  /** What the row is called on screen — searched. */
  label: string;
  /** Extra words a person might type that the label does not contain. */
  keywords?: string;
  /** A small caption shown above the row, when it starts a sub-block. */
  heading?: string;
  node: ReactNode;
};

type Group = {
  id: string;
  label: string;
  icon: LucideIcon;
  hint: string;
  items: Item[];
};

/**
 * "נשמר" feedback for the preferences that save on change. Returns a wrapped
 * update plus the text for a polite live region.
 */
function useSavedFlash(update: (patch: Patch) => void) {
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const timer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );
  const save = useCallback(
    (patch: Patch) => {
      if (timer.current) window.clearTimeout(timer.current);
      try {
        update(patch);
      } catch {
        // The store applies a change synchronously, so a throw means it was
        // not applied. (A later disk-write failure is not observable here:
        // the store writes fire-and-forget and reconciles on its next poll.)
        setFailed(true);
        setSavedAt(null);
        return;
      }
      setFailed(false);
      setSavedAt(Date.now());
      timer.current = window.setTimeout(() => setSavedAt(null), 2500);
    },
    [update],
  );
  return { save, saved: savedAt !== null, failed };
}

/** "סדר א׳ 09:00–12:00 · סדר ב׳ 16:00–19:00" */
function describeTimes(t: SederTimes) {
  return `סדר א׳ ${t.s1Start}–${t.s1End} · סדר ב׳ ${t.s2Start}–${t.s2End}`;
}

/**
 * The hours draft, kept above the search and the folding so neither can reach
 * it. It is compared with a baseline — what it started as — and not with
 * today's hours: saving a change that starts next week must leave the form
 * looking saved, because it is.
 */
function useSederDraft() {
  const { settings } = useSettings();
  const today = useToday();
  const todayTimes = getSederTimesFor(today);
  const todayKey = JSON.stringify(todayTimes);
  const [draft, setDraft] = useState<SederTimes>(todayTimes);
  const [baseline, setBaseline] = useState<HoursDraft>({ times: todayTimes, from: today });
  const [from, setFrom] = useState(today);
  // The draft is hours + the date they start. What it must differ from to be
  // worth saving is what is in force on that date, not the starting point.
  const state = hoursDraftState({ times: draft, from }, baseline, getSederTimesFor(from));
  const dirty = state.needsSave;
  const cancellable = state.status === "draft";

  // Today's hours (or today itself, after midnight) changed: follow them,
  // unless there is a draft that must not be overwritten.
  const [seenKey, setSeenKey] = useState(todayKey + today);
  if (seenKey !== todayKey + today) {
    setSeenKey(todayKey + today);
    if (!cancellable) {
      setDraft(todayTimes);
      setBaseline({ times: todayTimes, from: today });
      setFrom(today);
    }
  }

  const [saveState, setSaveState] = useState<SaveState>("saved");
  const save = async () => {
    if (saveState === "saving") return;
    // A cleared date field must not become a schedule entry with no date.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) {
      toast.error("בחרו תאריך תחולה תקין לפני השמירה");
      return;
    }
    const saved = { times: draft, from };
    setSaveState("saving");
    try {
      // "Saved" is said only once the shared file has the new hours.
      await setSederTimesFromTodayChecked(saved.times, saved.from);
      setBaseline(saved);
      setSaveState("saved");
      toast.success(hoursSavedMessage(saved.from, today));
    } catch {
      setSaveState("failed");
      toast.error("שמירת השעות נכשלה — לא בוצע שינוי");
    }
  };
  // Cancel returns the whole action — hours and date — to the reference point.
  const cancel = () => {
    setDraft(baseline.times);
    setFrom(baseline.from);
    setSaveState("saved");
  };
  const failed = saveState === "failed" && dirty;

  return {
    settings,
    today,
    todayTimes,
    draft,
    setDraft,
    from,
    setFrom,
    dirty,
    cancellable,
    failed,
    save,
    cancel,
  };
}

type SederDraft = ReturnType<typeof useSederDraft>;

function SubLink({ to, title, desc }: { to: "/backup" | "/about"; title: string; desc: string }) {
  return (
    <Link
      to={to}
      className="pressable-lg flex items-center justify-between gap-4 rounded-md py-1.5 hover:bg-accent/40"
    >
      <span className="min-w-0">
        <span className="block text-sm font-medium">{title}</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">{desc}</span>
      </span>
      <ChevronLeft className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </Link>
  );
}

/** A row whose control is a button: the name and note at the start, the action at the end. */
function ActionRow({
  title,
  note,
  children,
}: {
  title: string;
  note: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <div className="min-w-0 flex-1 basis-48">
        <div className="text-sm">{title}</div>
        <div className="mt-0.5 text-xs text-muted-foreground">{note}</div>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">{children}</div>
    </div>
  );
}

function SettingsPage() {
  const { settings, update } = useSettings();
  const { save, saved, failed: saveFailed } = useSavedFlash(update);
  const [open, setOpen] = useState<string | null>("hours");
  const [q, setQ] = useState("");
  const searchId = useId();
  const hours = useSederDraft();
  const sederDirty = hours.dirty;

  // The one place in the app where leaving costs typed-in work.
  useBlocker({
    shouldBlockFn: () =>
      sederDirty ? !window.confirm("שעות הסדרים שערכת עדיין לא נשמרו. לעזוב ולוותר עליהן?") : false,
    enableBeforeUnload: () => sederDirty,
  });

  const groups: Group[] = [
    {
      id: "hours",
      label: "שעות וכללי נוכחות",
      icon: Clock,
      hint: "מתי מתחיל ומסתיים כל סדר, בונוס הגעה וחבורת ש״ס",
      items: [
        {
          id: "seder-hours",
          label: "שעות הסדרים",
          keywords:
            "תחילה סיום סדר א סדר ב תאריך תחולה בתוקף מתאריך היסטוריית שעות שינוי זמני טווח תאריכים חופשה חג",
          node: <SederHoursManager hours={hours} />,
        },
        {
          id: "bonus",
          label: "סף בונוס להגעה מוקדמת",
          keywords: "דקות הגעה מוקדמת בונוס חסר",
          node: (
            <NumberField
              label="סף בונוס להגעה מוקדמת"
              note="הגעה לפני תחילת הסדר מקטינה את החסר, עד המספר הזה של דקות בכל סדר."
              unit="דק׳"
              min={0}
              max={60}
              value={settings.seder.bonusThresholdMin}
              onChange={(v) => save({ seder: { ...settings.seder, bonusThresholdMin: v } })}
            />
          ),
        },
        {
          id: "shas",
          label: "חבורת ש״ס",
          keywords: "שס חבורה הגעה סדר ב מלגה ספירה",
          node: (
            <Toggle
              label="אני נמנה על חבורת ש״ס"
              note={`כל הגעה לסדר ב׳ עד ${SHAS_ARRIVAL_DEADLINE} נספרת ומוצגת בסיכומים, בדוחות ובמחשבון המלגה. הספירה נעשית מהרישומים הקיימים, בלי להזין דבר מחדש.`}
              on={settings.seder.shasChavura}
              onChange={(v) => save({ seder: { ...settings.seder, shasChavura: v } })}
            />
          ),
        },
      ],
    },
    {
      id: "goals",
      label: "יעדים ותזכורות",
      icon: Target,
      hint: "יעד חודשי, מכסת איחורים, ואילו תזכורות להציג ואיפה",
      items: [
        {
          id: "monthly-target",
          label: "יעד ציון נוכחות חודשי",
          keywords: "יעד אחוז ציון",
          node: (
            <NumberField
              label="יעד ציון נוכחות חודשי"
              unit="%"
              min={50}
              max={100}
              value={settings.goals.monthlyTarget}
              onChange={(v) => save({ goals: { ...settings.goals, monthlyTarget: v } })}
            />
          ),
        },
        {
          id: "max-late",
          label: "מקסימום איחורים בחודש",
          keywords: "מכסה איחור",
          node: (
            <NumberField
              label="מקסימום איחורים בחודש"
              min={0}
              max={31}
              value={settings.goals.maxLatePerMonth}
              onChange={(v) => save({ goals: { ...settings.goals, maxLatePerMonth: v } })}
            />
          ),
        },
        {
          id: "alert-missing",
          label: "סף התראה לדקות חסרות בחודש",
          keywords: "דקות חסרות חסר התראה",
          node: (
            <NumberField
              label="סף התראה לדקות חסרות בחודש"
              unit="דק׳"
              min={0}
              max={1440}
              value={settings.seder.alertMissingMinPerMonth}
              onChange={(v) => save({ seder: { ...settings.seder, alertMissingMinPerMonth: v } })}
            />
          ),
        },
        {
          id: "popups",
          label: "הודעות קופצות בתוך התוכנה",
          heading: "איך להציג את התזכורות",
          keywords: "תזכורות התראות פופאפ",
          node: (
            <Toggle
              label="הודעות קופצות בתוך התוכנה"
              note="מופיעות כשהתוכנה פתוחה."
              on={settings.notifications.popups}
              onChange={(v) => save({ notifications: { ...settings.notifications, popups: v } })}
            />
          ),
        },
        {
          id: "desktop",
          label: "התראות בשולחן העבודה",
          keywords: "windows וינדוס הודעות מערכת",
          node: (
            <Toggle
              label="התראות בשולחן העבודה"
              note="הודעות Windows — מופיעות גם כשהתוכנה מוסתרת מאחורי חלון אחר."
              on={settings.notifications.desktop}
              onChange={(v) => save({ notifications: { ...settings.notifications, desktop: v } })}
            />
          ),
        },
        {
          id: "daily-reminder",
          label: "תזכורת יומית — כשלא נרשם סדר עד תחילת סדר א׳",
          heading: "אילו תזכורות",
          keywords: "תזכורת יומית רישום",
          node: (
            <Toggle
              label="תזכורת יומית"
              note="כשעד תחילת סדר א׳ עוד לא נרשם דבר."
              on={settings.notifications.dailyReminder}
              onChange={(v) =>
                save({ notifications: { ...settings.notifications, dailyReminder: v } })
              }
            />
          ),
        },
        {
          id: "lateness-alert",
          label: "התראה בחריגה ממכסת האיחורים החודשית",
          keywords: "איחורים מכסה חריגה",
          node: (
            <Toggle
              label="התראה בחריגה ממכסת האיחורים"
              note="מופיעה כשמספר האיחורים החודשי עובר את המכסה."
              on={settings.notifications.latenessAlert}
              onChange={(v) =>
                save({ notifications: { ...settings.notifications, latenessAlert: v } })
              }
            />
          ),
        },
        {
          id: "weekly-summary",
          label: "סיכום שבועי",
          keywords: "שבוע סיכום תזכורת",
          node: (
            <Toggle
              label="סיכום שבועי"
              on={settings.notifications.weeklySummary}
              onChange={(v) =>
                save({ notifications: { ...settings.notifications, weeklySummary: v } })
              }
            />
          ),
        },
        {
          id: "forecast",
          label: "התראה מוקדמת כשהקצב חורג",
          keywords: "תחזית קצב דקות חסרות",
          node: (
            <Toggle
              label="התראה מוקדמת כשהקצב חורג"
              note="פעם בחודש, כשלפי הקצב עד כה החודש צפוי לעבור את סף הדקות החסרות — בזמן שעוד אפשר לסגור את הפער."
              on={settings.notifications.forecastWarning}
              onChange={(v) =>
                save({ notifications: { ...settings.notifications, forecastWarning: v } })
              }
            />
          ),
        },
        {
          id: "phone-report",
          label: "תזכורת לדיווח במערכת הטלפונית",
          keywords: "דיווח טלפון חודש",
          node: (
            <Toggle
              label="תזכורת לדיווח במערכת הטלפונית"
              note="בימים 1–5 בחודש, בשעה 20:00, על החודש שהסתיים. נפסקת ברגע שמסמנים שדיווחת."
              on={settings.notifications.phoneReport}
              onChange={(v) =>
                save({ notifications: { ...settings.notifications, phoneReport: v } })
              }
            />
          ),
        },
        {
          id: "background",
          label: "להזכיר גם כשהתוכנה סגורה",
          heading: "גם כשהתוכנה סגורה",
          keywords: "רקע agent תוכנית רקע windows הפעלה אוטומטית",
          node: <BackgroundToggle />,
        },
        {
          id: "adaptive",
          label: "התאם את התזכורות להרגלים שלי",
          heading: "התאמה אישית",
          keywords: "למידה הרגלים אדפטיבי השתקה",
          node: (
            <div className="space-y-2">
              <Toggle
                label="התאם את התזכורות להרגלים שלי"
                note="התזכורת היומית ממתינה לפי שעת ההגעה הממוצעת שלך, מקדימה ביום שבו הכי הרבה סדרים יוצאים חסרים, ומשתתקת לתקופה אם היא חוזרת שוב ושוב בלי שנרשם דבר."
                on={settings.notifications.adaptive}
                onChange={(v) =>
                  save({ notifications: { ...settings.notifications, adaptive: v } })
                }
              />
              <AdaptiveStatus active={settings.notifications.adaptive} />
            </div>
          ),
        },
        {
          id: "tester",
          label: "בדיקת התראות",
          keywords: "שלח התראת בדיקה בדיקה",
          node: <NotificationTester />,
        },
      ],
    },
    {
      id: "look",
      label: "מראה ופרופיל",
      icon: Palette,
      hint: "השם בדוחות, צבעים, רקע, גודל גופן והתזכורות במסך היום",
      items: [
        {
          id: "profile-name",
          label: "שם תצוגה",
          keywords: "פרופיל שם דוח",
          node: (
            <Field
              label="שם תצוגה"
              note="מופיע בכותרת כל דוח שמופק."
              value={settings.profile.name}
              onChange={(v) => save({ profile: { ...settings.profile, name: v } })}
            />
          ),
        },
        {
          id: "profile-classroom",
          label: "כולל / קבוצה",
          keywords: "פרופיל כולל קבוצה דוח",
          node: (
            <Field
              label="כולל / קבוצה"
              note="מופיע בכותרת כל דוח שמופק."
              value={settings.profile.classroom}
              onChange={(v) => save({ profile: { ...settings.profile, classroom: v } })}
            />
          ),
        },
        {
          id: "color-theme",
          label: "ערכת צבעים",
          heading: "מראה",
          keywords: "צבע סרגל צד עיצוב ירוק דיו",
          node: (
            <ColorThemePicker
              value={settings.appearance.colorTheme}
              onChange={(v) => save({ appearance: { ...settings.appearance, colorTheme: v } })}
            />
          ),
        },
        {
          id: "background-theme",
          label: "רקע מסך",
          keywords: "רקע צבע בהיר נייר",
          node: (
            <BackgroundPicker
              value={settings.appearance.background}
              onChange={(v) => save({ appearance: { ...settings.appearance, background: v } })}
            />
          ),
        },
        {
          id: "font-size",
          label: "גודל גופן",
          keywords: "טקסט קטן גדול הגדלה נגישות",
          node: (
            <SelectField
              label="גודל גופן"
              value={settings.appearance.fontSize}
              options={[
                { v: "small", l: "קטן" },
                { v: "normal", l: "רגיל" },
                { v: "large", l: "גדול" },
                { v: "xlarge", l: "גדול מאוד" },
              ]}
              onChange={(v) =>
                save({ appearance: { ...settings.appearance, fontSize: v as FontSize } })
              }
            />
          ),
        },
        {
          id: "high-contrast",
          label: "ניגודיות גבוהה",
          keywords: "נגישות ראייה קונטרסט",
          node: (
            <Toggle
              label="ניגודיות גבוהה"
              note="קווים וטקסט חדים יותר."
              on={settings.appearance.highContrast}
              onChange={(v) => save({ appearance: { ...settings.appearance, highContrast: v } })}
            />
          ),
        },
        {
          id: "compact",
          label: "תצוגה צפופה",
          keywords: "צפוף מרווחים קומפקטי",
          node: (
            <Toggle
              label="תצוגה צפופה"
              note="פחות רווח בין שורות ובין אזורים, כדי שיותר נתונים ייכנסו למסך."
              on={settings.appearance.compactMode}
              onChange={(v) => save({ appearance: { ...settings.appearance, compactMode: v } })}
            />
          ),
        },
        {
          id: "dash-reminders",
          label: "הצג תזכורות",
          heading: "מה מוצג במסך היום",
          keywords: "לוח בקרה מסך ראשי היום",
          node: (
            <Toggle
              label="הצג תזכורות במסך היום"
              on={settings.dashboard.showReminders}
              onChange={(v) => save({ dashboard: { ...settings.dashboard, showReminders: v } })}
            />
          ),
        },
      ],
    },
    {
      id: "data",
      label: "נתונים וגיבוי",
      icon: DatabaseBackup,
      hint: "גיבוי אוטומטי, כמה עותקים לשמור, וקישור לשמירת קובץ ולשחזור",
      items: [
        {
          id: "auto-backup",
          label: "תדירות גיבוי אוטומטי",
          keywords: "גיבוי יומי שבועי כבוי תמונת מצב",
          node: (
            <SelectField
              label="תדירות גיבוי אוטומטי"
              note="נשמרות תמונות מצב בתוך התוכנה. קובץ במחשב נשמר ממסך הגיבוי."
              value={settings.data.autoBackup}
              options={[
                { v: "off", l: "כבוי" },
                { v: "daily", l: "יומי" },
                { v: "weekly", l: "שבועי" },
              ]}
              onChange={(v) =>
                save({ data: { ...settings.data, autoBackup: v as "off" | "daily" | "weekly" } })
              }
            />
          ),
        },
        {
          id: "retention",
          label: "מספר גיבויים לשמור",
          keywords: "גיבוי גרסאות שמירת עותקים",
          node: (
            <NumberField
              label="מספר גיבויים לשמור"
              note="כשמגיעים למספר הזה, העותק הישן ביותר נמחק."
              min={1}
              max={20}
              value={settings.data.backupRetention}
              onChange={(v) => save({ data: { ...settings.data, backupRetention: v } })}
            />
          ),
        },
        {
          id: "before-ops",
          label: "גיבוי לפני פעולות גדולות",
          keywords: "גיבוי שחזור מחיקה ייבוא",
          node: (
            <Toggle
              label="גיבוי לפני פעולות גדולות"
              note="נוצרת תמונת מצב לפני שחזור או מחיקה."
              on={settings.data.autoBackupBeforeOps}
              onChange={(v) => save({ data: { ...settings.data, autoBackupBeforeOps: v } })}
            />
          ),
        },
        {
          id: "backup-link",
          label: "נתונים וגיבוי — שמירת קובץ ושחזור",
          keywords: "ייצוא ייבוא שחזור קובץ תמונות מצב מחיקת נתונים",
          node: (
            <SubLink
              to="/backup"
              title="נתונים וגיבוי"
              desc="שמירת קובץ גיבוי במחשב, שחזור והיסטוריית עותקים"
            />
          ),
        },
      ],
    },
    {
      id: "maintenance",
      label: "תחזוקה ואודות",
      icon: Wrench,
      hint: "יומן תקלות, איפוס הגדרות, אשף ההיכרות וגרסת התוכנה",
      items: [
        {
          id: "about-link",
          label: "אודות ותחזוקה — גרסה ויכולות",
          keywords: "אודות גרסה עדכון מידע build",
          node: (
            <SubLink
              to="/about"
              title="אודות ותחזוקה"
              desc="גרסת התוכנה, עדכונים ומה התוכנה יודעת לעשות"
            />
          ),
        },
        {
          id: "problem-log",
          label: "יומן תקלות",
          keywords: "תקלה שגיאה לוג log נכשל",
          node: <ProblemLog />,
        },
        {
          id: "reset",
          label: "איפוס הגדרות ואשף היכרות",
          keywords: "איפוס ברירת מחדל אשף הגדרה התחלה מחדש",
          node: <MaintenanceActions />,
        },
      ],
    },
  ];

  const tokens = tokensOf(q);
  const searching = tokens.length > 0;

  // Per group: which items show. A group whose title/hint matches shows whole.
  const view = groups.map((g) => {
    const shown = visibleItems(g, tokens);
    return { g, shown, any: shown.some(Boolean) };
  });
  const anyResult = view.some((v) => v.any);
  const resultCount = view.reduce((n, v) => n + v.shown.filter(Boolean).length, 0);

  return (
    <AppShell
      title="הגדרות"
      subtitle="מה שמשתנה כאן נשמר מיד. שעות הסדרים נשמרות בנפרד, בלחיצה על ״שמור שינוי״."
    >
      <div className="relative mb-2 max-w-xl">
        <label htmlFor={searchId} className="sr-only">
          חיפוש בהגדרות
        </label>
        <Search
          className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <input
          id={searchId}
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setQ("");
          }}
          placeholder="חיפוש בהגדרות: למשל ״בונוס״, ״גיבוי״, ״גופן״"
          className="field-input w-full ps-9 pe-9 [&::-webkit-search-cancel-button]:hidden"
        />
        {q && (
          <button
            type="button"
            aria-label="נקה חיפוש"
            onClick={() => setQ("")}
            className="absolute end-1.5 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        )}
      </div>
      <div className="mb-4 min-h-5 text-sm" role="status" aria-live="polite">
        {saveFailed ? (
          <span className="inline-flex items-center gap-1 text-destructive">
            {SAVE_STATE_TEXT.failed} — ההגדרה לא שונתה
          </span>
        ) : saved ? (
          <span className="inline-flex items-center gap-1 text-success">
            <Check className="size-4" aria-hidden="true" /> {SAVE_STATE_TEXT.saved}
          </span>
        ) : sederDirty ? (
          <span className="inline-flex items-center gap-1.5 text-warning-fg">
            <span className="size-2 rounded-full bg-warning" aria-hidden="true" />
            טיוטה — שעות הסדרים טרם נשמרו, בקבוצה ״שעות וכללי נוכחות״
          </span>
        ) : searching && anyResult ? (
          <span className="text-muted-foreground">
            {resultCount === 1 ? "הגדרה אחת נמצאה" : `${resultCount} הגדרות נמצאו`}
          </span>
        ) : null}
      </div>

      {searching && !anyResult && (
        <EmptyNote title={`לא נמצאו הגדרות עבור ״${q.trim()}״`}>
          נסה מילה אחרת, כמו ״גיבוי״, ״שעות״ או ״תזכורת״.
        </EmptyNote>
      )}

      <div className="stack-gap">
        {view.map(({ g, shown, any }) => {
          // A search opens whatever it found; otherwise the person's own choice.
          const isOpen = searching ? any : open === g.id;
          const panelId = `settings-panel-${g.id}`;
          const dirtyHere = g.id === "hours" && sederDirty;
          const GroupIcon = g.icon;
          return (
            <section key={g.id} className="section-rule" hidden={searching && !any}>
              <h2>
                <button
                  type="button"
                  onClick={() => setOpen(open === g.id ? null : g.id)}
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  disabled={searching}
                  className="pressable-lg flex w-full items-center gap-3 rounded-md py-1.5 text-start hover:bg-accent/40 disabled:cursor-default disabled:hover:bg-transparent"
                >
                  <GroupIcon className="size-4 shrink-0 text-primary" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-base font-semibold">
                      {g.label}
                      {dirtyHere && (
                        <span className="ms-2 inline-flex items-center gap-1 text-xs font-medium text-warning-fg">
                          <span className="size-2 rounded-full bg-warning" aria-hidden="true" />
                          טיוטה
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 block text-sm font-normal text-muted-foreground">
                      {g.hint}
                    </span>
                  </span>
                  {!searching && (
                    <ChevronDown
                      aria-hidden="true"
                      className={`size-4 shrink-0 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`}
                    />
                  )}
                </button>
              </h2>

              {/* Always mounted, only hidden: closing a group or searching must
                  not throw away what was typed inside it. Every item has the
                  same two children whether it shows or not (the heading is
                  hidden, never removed), so React never sees its tree change
                  shape and never remounts it. */}
              <div id={panelId} hidden={!isOpen} className="mt-2">
                {g.items.map((it, i) => {
                  const showHeading = !!it.heading && !searching;
                  return (
                    <div key={it.id} hidden={!shown[i]} className="border-t border-border">
                      <div className="eyebrow pt-3" hidden={!showHeading}>
                        {it.heading}
                      </div>
                      <div className="row-pad">{it.node}</div>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </AppShell>
  );
}

/** Reset-to-defaults and re-run-the-wizard, with an undo for the reset. */
function MaintenanceActions() {
  return (
    <div className="space-y-3">
      <ActionRow
        title="איפוס הגדרות לברירת מחדל"
        note="כולל שעות הסדרים והיסטוריית השעות. אפשר לבטל מיד אחרי הפעולה."
      >
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            // Everything, including the seder schedule — so it is undoable.
            const before = getSettings();
            updateSettings(DEFAULT_SETTINGS);
            toastUndo("ההגדרות אופסו לברירת המחדל", () => updateSettings(before));
          }}
        >
          <RotateCcw aria-hidden="true" /> אפס הגדרות
        </Button>
      </ActionRow>
      <ActionRow title="אשף ההיכרות" note="הוא יוצג שוב בפעם הבאה שהתוכנה תיפתח.">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            resetOnboarding();
            toast("האשף יוצג בטעינה הבאה");
          }}
        >
          הצג שוב את האשף
        </Button>
      </ActionRow>
    </div>
  );
}

const KIND_LABELS: Record<NotificationKind, string> = {
  "daily-reminder": "תזכורת יומית",
  "lateness-alert": "חריגה ממכסת איחורים",
  "weekly-summary": "סיכום שבועי",
  "forecast-warning": "התראה מוקדמת על הקצב",
  "phone-report": "דיווח למערכת הטלפונית",
};

/**
 * What the adaptation has actually learned, as plain numbers.
 *
 * A reminder that goes quiet by itself is alarming unless there is somewhere
 * to see that it did and why — so this shows the whole of the state, and the
 * way to throw it away when it has got someone wrong. It is shown even while
 * the switch is off: what was learned is still stored, and a switch that looks
 * off must not be sitting on top of data nobody can see.
 */
function AdaptiveStatus({ active }: { active: boolean }) {
  const learning = useNotificationLearning();
  const rows = NOTIFICATION_KINDS.map((kind) => ({ kind, memory: learning[kind] })).filter(
    (r): r is { kind: NotificationKind; memory: KindMemory } => (r.memory?.delivered ?? 0) > 0,
  );

  if (rows.length === 0) {
    if (!active) return null;
    return (
      <p className="text-xs text-muted-foreground">
        עוד לא נשלחה תזכורת שאפשר ללמוד ממנה. ההתאמה מתחילה מהתזכורת הראשונה, ומה שנלמד יופיע כאן.
      </p>
    );
  }

  return (
    <div className="rounded-md border border-border p-4">
      <div className="text-sm font-semibold">מה נלמד עד כה</div>
      <p className="mt-1 text-xs text-muted-foreground">
        {active
          ? "תזכורת נחשבת ״נענתה״ כשנרשם סדר עבור היום שעליו היא הזכירה — לא לפי לחיצה עליה."
          : "ההתאמה כבויה, אבל מה שנלמד עד עכשיו עדיין שמור. הדלקת המתג תחזיר אותו לפעולה."}
      </p>
      <ul className="ledger mt-2">
        {rows.map(({ kind, memory }) => (
          <li key={kind} className="flex items-center justify-between gap-3 py-1.5 text-sm">
            <span>{KIND_LABELS[kind]}</span>
            <span className="figure text-muted-foreground">
              {memory.engaged}/{memory.delivered} נענו
              {memory.cooldown > 0 && ` · שקטה ב-${memory.cooldown} הפעמים הבאות`}
            </span>
          </li>
        ))}
      </ul>
      <Button
        variant="outline"
        size="sm"
        className="mt-3"
        onClick={() => {
          resetNotificationLearning();
          toast.success("ההתאמה אופסה");
        }}
      >
        <RotateCcw aria-hidden="true" /> אפס את ההתאמה
      </Button>
    </div>
  );
}

/**
 * "תזכורות גם כשהתוכנה סגורה".
 *
 * The one switch in the app that starts a process, so it says plainly what it
 * starts and what it is allowed to say — and it checks the login entry against
 * Windows rather than trusting the saved flag, because the two can disagree
 * and the difference is a morning without a reminder (or a process that is
 * still running behind a switch that looks off).
 */
function BackgroundToggle() {
  const { settings } = useSettings();
  const enabled = settings.background.enabled;
  const [busy, setBusy] = useState(false);
  const [registered, setRegistered] = useState<boolean | null>(null);

  const refreshRegistration = () => {
    void isRegisteredToStartWithWindows().then(setRegistered);
  };
  useEffect(refreshRegistration, [enabled]);

  return (
    <div>
      <Toggle
        label="להזכיר גם כשהתוכנה סגורה"
        note="תוכנית רקע קטנה (SederPlusAgent) שעולה עם Windows, בלי חלון ובלי אייקון, ותופסת כמה מגה־בייט בלבד. ברקע נשלחות שתי תזכורות: שסדר התחיל ועדיין לא נרשם, ושצריך לדווח במערכת הטלפונית על החודש שעבר."
        on={enabled}
        onChange={async (v) => {
          setBusy(true);
          try {
            const result = await setBackgroundEnabled(v);
            if (!result.ok) toast.error("הפעלת מצב הרקע נכשלה — פרטים ביומן התקלות");
            else if (v) toast.success("מצב הרקע פועל. אפשר לסגור את התוכנה.");
            else toast.success("מצב הרקע כובה");
          } finally {
            setBusy(false);
            refreshRegistration();
          }
        }}
      />
      {enabled && registered === false && (
        <p role="status" className="mt-1 text-sm text-destructive">
          לתיקון: התוכנית פועלת עכשיו, אבל היא לא רשומה לעלות עם Windows. כבה את המתג והדלק אותו
          שוב.
        </p>
      )}
      {!enabled && registered === true && (
        <p role="status" className="mt-1 text-sm text-warning-fg">
          המתג כבוי, אבל התוכנית עדיין רשומה לעלות עם Windows. כדי להסיר אותה, הדלק את המתג וכבה
          אותו שוב.
        </p>
      )}
      {busy && <p className="mt-1 text-sm text-muted-foreground">רגע…</p>}
    </div>
  );
}

// A reminder you never see is indistinguishable from one that was never sent,
// so there is a way to prove the channel works — for both channels at once.
function NotificationTester() {
  const [busy, setBusy] = useState(false);
  return (
    <ActionRow
      title="בדיקת התראות"
      note={
        <>
          נשלחת התראה לדוגמה בכל הערוצים שסימנת. אם התראת שולחן העבודה לא מופיעה, בדוק ב״הגדרות
          Windows ← מערכת ← התראות״ שההתראות של סדר פלוס מופעלות.
        </>
      }
    >
      <Button
        variant="outline"
        size="sm"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            const result = await announce("סדר פלוס", "בדיקת התראות — ההתראות פועלות כשורה.");
            if (result.desktop) toast.success("נשלחה התראת שולחן עבודה");
            else if (result.popup)
              toast.success("הודעה קופצת פועלת. התראות שולחן העבודה כבויות או חסומות.");
            else toast.error("שני ערוצי ההתראות כבויים — סמן לפחות אחד מהם");
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? (
          <Loader2 className="animate-spin" aria-hidden="true" />
        ) : (
          <BellRing aria-hidden="true" />
        )}
        שלח התראת בדיקה
      </Button>
    </ActionRow>
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
  const [confirmClear, setConfirmClear] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setText(await readLog());
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, []);

  const lines = text.split("\n").filter((l) => l.trim().length > 0);

  return (
    <div className="space-y-3">
      <div>
        <div className="text-sm">יומן תקלות</div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          התוכנה כותבת לכאן כל תקלה — שמירת קובץ שנכשלה, שמירה שלא עברה, שגיאה לא צפויה.
          {isDesktop
            ? " הקובץ נמצא בתיקיית הנתונים, תחת logs\\sederplus.log."
            : " בהרצה בדפדפן הרשומות נשמרות בזיכרון החלון בלבד."}
        </p>
      </div>

      <div
        className="max-h-72 overflow-auto rounded-md border border-border bg-muted/30 p-3"
        dir="ltr"
        tabIndex={0}
        role="region"
        aria-label="רשומות יומן התקלות"
      >
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" /> טוען...
          </div>
        ) : lines.length === 0 ? (
          <div dir="rtl" className="text-sm text-muted-foreground">
            לא נרשמו תקלות.
          </div>
        ) : (
          <ol className="space-y-1 font-mono text-xs leading-relaxed">
            {/* Newest first — a log is read from the end. */}
            {[...lines].reverse().map((line, i) => (
              <li
                key={i}
                className={
                  line.includes(" ERROR ")
                    ? "text-destructive"
                    : line.includes(" WARN ")
                      ? "text-warning-fg"
                      : "text-muted-foreground"
                }
              >
                {line}
              </li>
            ))}
          </ol>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={load}>
          <RefreshCw aria-hidden="true" /> רענן
        </Button>
        {isDesktop && (
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              if (!(await openLogFolder())) toast.error("פתיחת התיקייה נכשלה");
            }}
          >
            <FolderOpen aria-hidden="true" /> פתח את התיקייה
          </Button>
        )}
        {lines.length > 0 &&
          (confirmClear ? (
            <span className="inline-flex items-center gap-2" role="group" aria-label="אישור מחיקה">
              <span className="text-sm">למחוק את כל הרשומות?</span>
              <Button
                variant="destructive"
                size="sm"
                onClick={async () => {
                  await clearLog();
                  await load();
                  setConfirmClear(false);
                  toast.success("היומן נמחק");
                }}
              >
                מחק
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirmClear(false)}>
                ביטול
              </Button>
            </span>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-destructive"
              onClick={() => setConfirmClear(true)}
            >
              <Trash2 aria-hidden="true" /> מחק את היומן
            </Button>
          ))}
        <span className="text-xs text-muted-foreground">{lines.length} רשומות</span>
      </div>
    </div>
  );
}

/** Two times for one seder, grouped under its name so each field is read in context. */
function SederPair({
  name,
  start,
  end,
  onStart,
  onEnd,
}: {
  name: string;
  start: string;
  end: string;
  onStart: (v: string) => void;
  onEnd: (v: string) => void;
}) {
  return (
    <fieldset className="min-w-0">
      <legend className="eyebrow mb-1">{name}</legend>
      <div className="flex flex-wrap gap-3">
        <div className="w-32">
          <TimeField label="תחילה" value={start} onChange={onStart} />
        </div>
        <div className="w-32">
          <TimeField label="סיום" value={end} onChange={onEnd} />
        </div>
      </div>
    </fieldset>
  );
}

function TimesGrid({ times, onChange }: { times: SederTimes; onChange: (t: SederTimes) => void }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <SederPair
        name="סדר א׳"
        start={times.s1Start}
        end={times.s1End}
        onStart={(v) => onChange({ ...times, s1Start: v })}
        onEnd={(v) => onChange({ ...times, s1End: v })}
      />
      <SederPair
        name="סדר ב׳"
        start={times.s2Start}
        end={times.s2End}
        onStart={(v) => onChange({ ...times, s2Start: v })}
        onEnd={(v) => onChange({ ...times, s2End: v })}
      />
    </div>
  );
}

/**
 * The seder hours. Three things are shown apart: the hours in force today, the
 * hours in force on the chosen date, and the draft being typed. Only the draft
 * can be "unsaved".
 */
function SederHoursManager({ hours }: { hours: SederDraft }) {
  const {
    settings,
    today,
    todayTimes,
    draft,
    setDraft,
    from,
    setFrom,
    dirty,
    cancellable,
    failed,
    save,
    cancel,
  } = hours;
  const draftError = sederTimesError(draft);
  const fromTimes = getSederTimesFor(from);
  const futureChosen = from > today;

  // temporary override form
  const [ovOpen, setOvOpen] = useState(false);
  const [ovFrom, setOvFrom] = useState(todayISO());
  const [ovTo, setOvTo] = useState(todayISO());
  const [ovLabel, setOvLabel] = useState("");
  const [ovTimes, setOvTimes] = useState<SederTimes>(todayTimes);

  const schedule = [...(settings.sederSchedule || [])].sort((a, b) =>
    a.effectiveFrom < b.effectiveFrom ? 1 : -1,
  );
  const overrides = [...(settings.sederOverrides || [])].sort((a, b) => (a.from < b.from ? 1 : -1));

  return (
    <div className="space-y-6">
      <div>
        <div className="text-sm font-semibold">שעות הסדרים</div>
        <dl className="mt-1 space-y-0.5 text-sm">
          <div className="flex flex-wrap gap-x-2">
            <dt className="text-muted-foreground">שעות היום:</dt>
            <dd className="figure">{describeTimes(todayTimes)}</dd>
          </div>
          {from !== today && (
            <div className="flex flex-wrap gap-x-2">
              <dt className="text-muted-foreground">שעות ב־{from}:</dt>
              <dd className="figure">{describeTimes(fromTimes)}</dd>
            </div>
          )}
        </dl>
      </div>

      <form
        className="card-surface space-y-4 p-4"
        aria-label="עריכת שעות הסדרים"
        onSubmit={(e) => {
          e.preventDefault();
          if (dirty && draftError === null) save();
        }}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1 basis-56">
            <div className="text-sm font-semibold">שינוי שעות</div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              השינוי יחול מהתאריך שנבחר ואילך בלבד. רישומים קודמים ממשיכים להיחשב לפי השעות שהיו אז.
            </p>
          </div>
          <div className="w-44">
            <StackedField label="בתוקף מתאריך">
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="field-input block w-full"
              />
            </StackedField>
          </div>
        </div>
        <TimesGrid times={draft} onChange={setDraft} />
        {draftError && (
          <p role="alert" className="text-sm text-destructive">
            לתיקון: {draftError}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" size="sm" disabled={!dirty || draftError !== null}>
            שמור שינוי
          </Button>
          {cancellable && (
            <Button type="button" variant="ghost" size="sm" onClick={cancel}>
              ביטול
            </Button>
          )}
          <span className="text-sm" role="status">
            {failed ? (
              <span role="alert" className="inline-flex items-center gap-1.5 text-destructive">
                {SAVE_STATE_TEXT.failed}
              </span>
            ) : dirty ? (
              <span className="inline-flex items-center gap-1.5 text-warning-fg">
                <span className="size-2 rounded-full bg-warning" aria-hidden="true" />
                {SAVE_STATE_TEXT.draft}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-muted-foreground">
                <Check className="size-4" aria-hidden="true" />
                {SAVE_STATE_TEXT.saved}
                {futureChosen ? ` · בתוקף מ־${from}` : ""}
              </span>
            )}
          </span>
        </div>
      </form>

      {schedule.length > 0 && (
        <div>
          <div className="mb-1 text-sm font-semibold">היסטוריית שעות</div>
          <ul className="ledger">
            {schedule.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2 text-sm">
                <span className="figure w-36 shrink-0 text-muted-foreground">
                  {e.effectiveFrom === "0001-01-01"
                    ? "עד השינוי הראשון"
                    : `מ־${e.effectiveFrom}${e.effectiveFrom > today ? " (עתידי)" : ""}`}
                </span>
                <span className="figure min-w-0 flex-1">{describeTimes(e.times)}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => {
                    // Deleting a schedule entry silently re-scores every past
                    // record against different hours, so it gets an undo too.
                    const before = settings.sederSchedule || [];
                    removeSederScheduleEntry(e.id);
                    toastUndo("שינוי השעות נמחק", () => updateSettings({ sederSchedule: before }));
                  }}
                  aria-label={`מחק את שינוי השעות ${e.effectiveFrom === "0001-01-01" ? "הראשוני" : "מתאריך " + e.effectiveFrom}`}
                >
                  מחק
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 flex-1 basis-56">
            <div className="text-sm font-semibold">שינוי זמני לטווח תאריכים</div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              בתום הטווח השעות חוזרות להגדרה השמורה.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setOvOpen((v) => !v)}
            aria-expanded={ovOpen}
          >
            {ovOpen ? "סגור" : "הוסף טווח"}
          </Button>
        </div>

        {ovOpen && (
          <div className="card-surface mt-3 space-y-3 p-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <StackedField label="מתאריך">
                <input
                  type="date"
                  value={ovFrom}
                  onChange={(e) => setOvFrom(e.target.value)}
                  className="field-input w-full"
                />
              </StackedField>
              <StackedField label="עד תאריך">
                <input
                  type="date"
                  value={ovTo}
                  onChange={(e) => setOvTo(e.target.value)}
                  className="field-input w-full"
                />
              </StackedField>
              <StackedField label="תיאור (לא חובה)">
                <input
                  value={ovLabel}
                  maxLength={40}
                  onChange={(e) => setOvLabel(e.target.value)}
                  className="field-input w-full"
                />
              </StackedField>
            </div>
            <TimesGrid times={ovTimes} onChange={setOvTimes} />
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={() => {
                  if (ovTo < ovFrom) {
                    toast.error("תאריך הסיום מוקדם מתאריך ההתחלה");
                    return;
                  }
                  const err = sederTimesError(ovTimes);
                  if (err) {
                    toast.error(err);
                    return;
                  }
                  addSederOverride({
                    from: ovFrom,
                    to: ovTo,
                    label: ovLabel || undefined,
                    times: ovTimes,
                  });
                  setOvOpen(false);
                  setOvLabel("");
                  toast.success("נוסף שינוי זמני");
                }}
              >
                שמור טווח
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setOvOpen(false)}>
                ביטול
              </Button>
            </div>
          </div>
        )}

        {overrides.length > 0 && (
          <ul className="ledger mt-2">
            {overrides.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2 text-sm">
                <span className="figure w-56 max-w-full shrink-0 text-muted-foreground">
                  {o.from} ← {o.to}
                  {o.label ? ` · ${o.label}` : ""}
                </span>
                <span className="figure min-w-0 flex-1">{describeTimes(o.times)}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => {
                    const before = settings.sederOverrides || [];
                    removeSederOverride(o.id);
                    toastUndo("השינוי הזמני נמחק", () =>
                      updateSettings({ sederOverrides: before }),
                    );
                  }}
                  aria-label={`מחק את השינוי הזמני ${o.from} עד ${o.to}`}
                >
                  מחק
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/** A row of swatches. The chosen one is ringed *and* named, so colour is never the only cue. */
function SwatchPicker<T extends string>({
  label,
  note,
  value,
  options,
  onChange,
  columns,
}: {
  label: string;
  note?: string;
  value: T;
  options: { id: T; label: string; hex: string }[];
  onChange: (v: T) => void;
  columns: string;
}) {
  const current = options.find((o) => o.id === value);
  return (
    <div role="radiogroup" aria-label={label}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4">
        <div className="text-sm" aria-hidden="true">
          {label}
        </div>
        <div className="text-sm text-muted-foreground" aria-hidden="true">
          {current?.label}
        </div>
      </div>
      {note && <div className="mt-0.5 text-xs text-muted-foreground">{note}</div>}
      <div className={`mt-2 grid max-w-xl gap-2.5 ${columns}`}>
        {options.map((t) => {
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
              className={`pressable grid aspect-square place-items-center rounded-md ${
                active
                  ? "ring-2 ring-foreground ring-offset-2 ring-offset-card"
                  : "ring-1 ring-black/15 hover:ring-2 hover:ring-foreground/40"
              }`}
              style={{ backgroundColor: t.hex }}
            >
              {active && (
                <span className="grid size-4 place-items-center rounded-full bg-card text-foreground">
                  <Check className="size-3" aria-hidden="true" />
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ColorThemePicker({
  value,
  onChange,
}: {
  value: ColorTheme;
  onChange: (v: ColorTheme) => void;
}) {
  // "ירוק דיו" is first in COLOR_THEMES, and the default.
  return (
    <SwatchPicker
      label="ערכת צבעים"
      value={value}
      options={COLOR_THEMES}
      onChange={onChange}
      columns="grid-cols-6 sm:grid-cols-12"
    />
  );
}

function BackgroundPicker({ value, onChange }: { value: BgTheme; onChange: (v: BgTheme) => void }) {
  return (
    <SwatchPicker
      label="רקע מסך"
      note="פעיל במצב בהיר."
      value={value}
      options={BG_THEMES}
      onChange={onChange}
      columns="grid-cols-5 sm:grid-cols-10"
    />
  );
}
