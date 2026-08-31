// The first-run wizard.
//
// It used to open on a welcome screen asking for a display name, then a screen
// of goal percentages — two screens of things that have sensible defaults and
// can be changed at any time in Settings, in front of the one thing the app
// genuinely cannot guess and cannot work without: when the sedarim start and
// end. Every minute the app counts is measured against those four times.
//
// So the hours come first, notifications second, backups third.
import { useState } from "react";
import { ChevronLeft, ChevronRight, Check, Bell, Database, Clock } from "lucide-react";
import {
  getSettings,
  markOnboarded,
  updateSettings,
  setSederTimesFromToday,
  getSederTimesFor,
  sederTimesError,
  type SederTimes,
} from "@/lib/settings-store";
import { StackedField, TimeField, Toggle } from "@/components/ui/form";
import { setBackgroundEnabled } from "@/lib/background";

const STEPS = [
  { id: "seder", title: "שעות הסדרים", icon: Clock },
  { id: "notifications", title: "התראות ותזכורות", icon: Bell },
  { id: "backup", title: "גיבויים", icon: Database },
  { id: "done", title: "הכל מוכן", icon: Check },
];

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function OnboardingWizard({ onComplete }: { onComplete: () => void }) {
  const initial = getSettings();
  const [step, setStep] = useState(0);
  const [times, setTimes] = useState<SederTimes>(() => getSederTimesFor(todayIso()));
  const [popups, setPopups] = useState(initial.notifications.popups);
  const [desktop, setDesktop] = useState(initial.notifications.desktop);
  const [reminder, setReminder] = useState(initial.notifications.dailyReminder);
  const [lateAlert, setLateAlert] = useState(initial.notifications.latenessAlert);
  const [phoneReport, setPhoneReport] = useState(initial.notifications.phoneReport);
  const [background, setBackground] = useState(initial.background.enabled);
  const [auto, setAuto] = useState(initial.data.autoBackup);
  const [retention, setRetention] = useState(initial.data.backupRetention);

  const timesError = sederTimesError(times);

  const finish = () => {
    // Recorded as a schedule entry from today onwards, exactly like a later
    // change in Settings, so the two paths cannot drift apart.
    setSederTimesFromToday(times, todayIso());
    updateSettings({
      notifications: {
        ...initial.notifications,
        popups,
        desktop,
        dailyReminder: reminder,
        latenessAlert: lateAlert,
        phoneReport,
      },
      data: { ...initial.data, autoBackup: auto, backupRetention: retention },
    });
    // After the settings above, not with them: this writes the flag itself,
    // and it must not be overwritten by the update it runs alongside.
    void setBackgroundEnabled(background);
    markOnboarded();
    onComplete();
  };

  const StepIcon = STEPS[step].icon;
  const blocked = step === 0 && timesError !== null;

  return (
    <div className="fixed inset-0 z-[60] bg-background grid place-items-center p-4">
      <div className="card-surface w-full max-w-lg overflow-hidden">
        <div className="bg-primary text-primary-foreground p-6">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-lg bg-primary-foreground/10 grid place-items-center">
              <StepIcon className="size-5" />
            </div>
            <div>
              <div className="text-xs opacity-80">
                שלב {step + 1} מתוך {STEPS.length}
              </div>
              <h2 className="text-lg font-semibold">{STEPS[step].title}</h2>
            </div>
          </div>
          <div className="mt-4 flex gap-1.5">
            {STEPS.map((_, i) => (
              <div
                key={i}
                className={`h-1 flex-1 rounded-full ${i <= step ? "bg-primary-foreground" : "bg-primary-foreground/20"}`}
              />
            ))}
          </div>
        </div>

        <div className="p-6 min-h-[280px]">
          {step === 0 && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                כל החישובים בתוכנה — דקות חסרות, איחורים, בונוס, אוהבי ה׳ — נמדדים מול השעות האלה.
                אפשר לשנות אותן בכל עת, ושינוי יחול מאותו יום ואילך בלבד.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <TimeField
                  label="סדר א׳ — תחילה"
                  value={times.s1Start}
                  onChange={(v) => setTimes({ ...times, s1Start: v })}
                />
                <TimeField
                  label="סדר א׳ — סיום"
                  value={times.s1End}
                  onChange={(v) => setTimes({ ...times, s1End: v })}
                />
                <TimeField
                  label="סדר ב׳ — תחילה"
                  value={times.s2Start}
                  onChange={(v) => setTimes({ ...times, s2Start: v })}
                />
                <TimeField
                  label="סדר ב׳ — סיום"
                  value={times.s2End}
                  onChange={(v) => setTimes({ ...times, s2End: v })}
                />
              </div>
              {timesError && <p className="text-xs text-destructive">{timesError}</p>}
            </div>
          )}

          {step === 1 && (
            <div className="space-y-3">
              <Toggle label="הודעות קופצות בתוך התוכנה" on={popups} onChange={setPopups} />
              <Toggle
                label={
                  <span>
                    התראות בשולחן העבודה
                    <span className="block text-2xs text-muted-foreground">
                      הודעות Windows — מופיעות גם כשהתוכנה מוסתרת
                    </span>
                  </span>
                }
                on={desktop}
                onChange={setDesktop}
              />
              <div className="pt-2 text-xs font-semibold text-muted-foreground">אילו תזכורות</div>
              <Toggle label="תזכורת יומית לרישום נוכחות" on={reminder} onChange={setReminder} />
              <Toggle label="התראה כשמתקרב למכסת האיחורים" on={lateAlert} onChange={setLateAlert} />
              <Toggle
                label="תזכורת לדיווח במערכת הטלפונית בתחילת כל חודש"
                on={phoneReport}
                onChange={setPhoneReport}
              />

              <div className="pt-2 text-xs font-semibold text-muted-foreground">
                גם כשהתוכנה סגורה
              </div>
              <Toggle
                label={
                  <span>
                    להזכיר גם כשהתוכנה סגורה
                    <span className="block text-2xs text-muted-foreground">
                      תוכנית רקע קטנה שעולה עם Windows — בלי חלון, בלי אייקון, כמה מגה־בייט בלבד.
                      שולחת שתי תזכורות: שסדר התחיל ולא נרשם, ושצריך לדווח במערכת הטלפונית.
                    </span>
                  </span>
                }
                on={background}
                onChange={(v) => {
                  setBackground(v);
                  // The reminders it raises are Windows notifications; asking
                  // for the one is asking for the other.
                  if (v) setDesktop(true);
                }}
              />
              <p className="text-xs text-muted-foreground">
                בלי זה, תזכורת מוצגת רק כשהתוכנה פתוחה. אפשר לשנות הכל בכל עת במסך ההגדרות.
              </p>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                הנתונים נשמרים אצלך במחשב. גיבוי אוטומטי שומר עותקים נוספים, כדי שגם טעות תהיה
                הפיכה.
              </p>
              <StackedField label="תדירות גיבוי אוטומטי">
                <select
                  value={auto}
                  onChange={(e) => setAuto(e.target.value as "off" | "daily" | "weekly")}
                  className="field-input w-full"
                >
                  <option value="off">כבוי</option>
                  <option value="daily">יומי</option>
                  <option value="weekly">שבועי</option>
                </select>
              </StackedField>
              <StackedField label="מספר גיבויים לשמור">
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={retention}
                  onChange={(e) => setRetention(Math.max(1, Math.min(20, +e.target.value || 1)))}
                  className="field-input w-full"
                />
              </StackedField>
            </div>
          )}

          {step === 3 && (
            <div className="text-center py-6">
              <div className="size-14 rounded-full bg-success/15 text-success grid place-items-center mx-auto">
                <Check className="size-7" />
              </div>
              <h3 className="mt-4 text-lg font-semibold">הכל מוכן</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                סדר א׳ {times.s1Start}–{times.s1End} · סדר ב׳ {times.s2Start}–{times.s2End}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                את השם שיופיע בדוחות, ואת שאר ההעדפות, אפשר להגדיר בכל עת במסך ההגדרות.
              </p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between p-5 border-t border-border bg-muted/30">
          <button
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground disabled:opacity-30"
          >
            <ChevronRight className="size-4" /> חזור
          </button>
          {step < STEPS.length - 1 ? (
            <button
              onClick={() => setStep((s) => s + 1)}
              disabled={blocked}
              className="inline-flex items-center gap-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
            >
              המשך <ChevronLeft className="size-4" />
            </button>
          ) : (
            <button
              onClick={finish}
              className="inline-flex items-center gap-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              סיום <Check className="size-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
