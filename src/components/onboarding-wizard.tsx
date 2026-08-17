import { useState } from "react";
import { ChevronLeft, ChevronRight, Check, Target, Bell, Database, User } from "lucide-react";
import { getSettings, markOnboarded, updateSettings } from "@/lib/settings-store";
import { StackedField, Toggle } from "@/components/ui/form";

const STEPS = [
  { id: "welcome", title: "ברוכים הבאים", icon: User },
  { id: "goals", title: "יעדים אישיים", icon: Target },
  { id: "notifications", title: "התראות", icon: Bell },
  { id: "backup", title: "גיבויים", icon: Database },
  { id: "done", title: "הכל מוכן", icon: Check },
];

export function OnboardingWizard({ onComplete }: { onComplete: () => void }) {
  const initial = getSettings();
  const [step, setStep] = useState(0);
  const [name, setName] = useState(initial.profile.name);
  const [classroom, setClassroom] = useState(initial.profile.classroom);
  const [target, setTarget] = useState(initial.goals.monthlyTarget);
  const [maxLate, setMaxLate] = useState(initial.goals.maxLatePerMonth);
  const [reminder, setReminder] = useState(initial.notifications.dailyReminder);
  const [lateAlert, setLateAlert] = useState(initial.notifications.latenessAlert);
  const [auto, setAuto] = useState(initial.data.autoBackup);
  const [retention, setRetention] = useState(initial.data.backupRetention);

  const finish = () => {
    updateSettings({
      profile: { name: name.trim() || "המשתמש שלי", classroom: classroom.trim() },
      goals: { monthlyTarget: target, maxLatePerMonth: maxLate },
      notifications: { dailyReminder: reminder, latenessAlert: lateAlert, weeklySummary: initial.notifications.weeklySummary },
      data: { autoBackup: auto, backupRetention: retention, autoBackupBeforeOps: initial.data.autoBackupBeforeOps },
    });
    markOnboarded();
    onComplete();
  };

  const StepIcon = STEPS[step].icon;

  return (
    <div className="fixed inset-0 z-[60] bg-background grid place-items-center p-4">
      <div className="card-surface w-full max-w-lg overflow-hidden">
        <div className="bg-primary text-primary-foreground p-6">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-lg bg-primary-foreground/10 grid place-items-center">
              <StepIcon className="size-5" />
            </div>
            <div>
              <div className="text-xs opacity-80">שלב {step + 1} מתוך {STEPS.length}</div>
              <h2 className="text-lg font-semibold">{STEPS[step].title}</h2>
            </div>
          </div>
          <div className="mt-4 flex gap-1.5">
            {STEPS.map((_, i) => (
              <div key={i} className={`h-1 flex-1 rounded-full ${i <= step ? "bg-primary-foreground" : "bg-primary-foreground/20"}`} />
            ))}
          </div>
        </div>

        <div className="p-6 min-h-[260px]">
          {step === 0 && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                ברוכים הבאים ל"המעקב שלי" — כלי אישי לניהול נוכחות ולימוד.
                נגדיר יחד מספר העדפות בסיסיות. תוכל לשנות הכל מאוחר יותר בהגדרות.
              </p>
              <StackedField label="שם תצוגה">
                <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60}
                  className="field-input w-full" />
              </StackedField>
              <StackedField label="כולל / קבוצה (אופציונלי)">
                <input value={classroom} onChange={(e) => setClassroom(e.target.value)} maxLength={40}
                  className="field-input w-full" />
              </StackedField>
            </div>
          )}
          {step === 1 && (
            <div className="space-y-4">
              <StackedField label="יעד נוכחות חודשי (%)">
                <input type="number" min={50} max={100} value={target}
                  onChange={(e) => setTarget(Math.max(50, Math.min(100, +e.target.value || 0)))}
                  className="field-input w-full" />
              </StackedField>
              <StackedField label="מקסימום איחורים בחודש">
                <input type="number" min={0} max={31} value={maxLate}
                  onChange={(e) => setMaxLate(Math.max(0, Math.min(31, +e.target.value || 0)))}
                  className="field-input w-full" />
              </StackedField>
            </div>
          )}
          {step === 2 && (
            <div className="space-y-3">
              <Toggle label="תזכורת יומית לרישום נוכחות" on={reminder} onChange={setReminder} />
              <Toggle label="התראה כשמתקרב למכסת איחורים" on={lateAlert} onChange={setLateAlert} />
              <p className="text-xs text-muted-foreground">
                ההתראות מוצגות כהודעות מערכת של Windows — אך רק כשהתוכנה פתוחה, שכן אין שירות רקע.
              </p>
            </div>
          )}
          {step === 3 && (
            <div className="space-y-4">
              <StackedField label="תדירות גיבוי אוטומטי">
                <select value={auto} onChange={(e) => setAuto(e.target.value as "off" | "daily" | "weekly")}
                  className="field-input w-full">
                  <option value="off">כבוי</option>
                  <option value="daily">יומי</option>
                  <option value="weekly">שבועי</option>
                </select>
              </StackedField>
              <StackedField label="מספר גיבויים לשמור">
                <input type="number" min={1} max={20} value={retention}
                  onChange={(e) => setRetention(Math.max(1, Math.min(20, +e.target.value || 1)))}
                  className="field-input w-full" />
              </StackedField>
            </div>
          )}
          {step === 4 && (
            <div className="text-center py-6">
              <div className="size-14 rounded-full bg-success/15 text-success grid place-items-center mx-auto">
                <Check className="size-7" />
              </div>
              <h3 className="mt-4 text-lg font-semibold">הגדרת ראשונית הושלמה</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                הכל מוכן. המעקב שלך מתחיל עכשיו.
              </p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between p-5 border-t border-border bg-muted/30">
          <button onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground disabled:opacity-30">
            <ChevronRight className="size-4" /> חזור
          </button>
          {step < STEPS.length - 1 ? (
            <button onClick={() => setStep((s) => s + 1)}
              className="inline-flex items-center gap-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
              המשך <ChevronLeft className="size-4" />
            </button>
          ) : (
            <button onClick={finish}
              className="inline-flex items-center gap-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
              סיום <Check className="size-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
