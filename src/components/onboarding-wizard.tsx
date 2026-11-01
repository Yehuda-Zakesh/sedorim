// The first-run wizard.
//
// It used to open on a welcome screen asking for a display name, then a screen
// of goal percentages — two screens of things that have sensible defaults and
// can be changed at any time in Settings, in front of the one thing the app
// genuinely cannot guess and cannot work without: when the sedarim start and
// end. Every minute the app counts is measured against those four times.
//
// So the hours come first, then how reminders show up, then the one reminder
// that needs a background process (its own step, so it is always a deliberate
// choice, off unless asked for), then backups. One decision per step.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Check, Bell, BellRing, Database, Clock } from "lucide-react";
import {
  getSettings,
  markOnboarded,
  updateSettings,
  setSederTimesFromToday,
  getSederTimesFor,
  sederTimesError,
  type SederTimes,
} from "@/lib/settings-store";
import { NumberField, SelectField, TimeField, Toggle } from "@/components/ui/form";
import { setBackgroundEnabled } from "@/lib/background";

const STEPS = [
  { id: "seder", title: "שעות הסדרים", icon: Clock },
  { id: "notifications", title: "איך להזכיר לך", icon: Bell },
  { id: "background", title: "כשהתוכנה סגורה", icon: BellRing },
  { id: "backup", title: "גיבויים", icon: Database },
  { id: "done", title: "הכל מוכן", icon: Check },
];

const AUTO_LABEL = { off: "כבוי", daily: "יומי", weekly: "שבועי" } as const;

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function Hint({ children }: { children: ReactNode }) {
  return <p className="text-sm leading-relaxed text-muted-foreground">{children}</p>;
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
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Each step moves focus to its own heading, so a keyboard or screen-reader
  // user lands at the top of the new step rather than on a vanished button.
  useEffect(() => {
    headingRef.current?.focus();
  }, [step]);

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
  const channelsOff = !popups && !desktop;

  return (
    <div className="fixed inset-0 z-[60] bg-background grid place-items-center p-4 overflow-y-auto">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
        className="card-surface w-full max-w-lg overflow-hidden max-h-[calc(100dvh-2rem)] flex flex-col"
      >
        <div className="shrink-0 px-6 pt-6">
          <div className="eyebrow flex items-center gap-2">
            <StepIcon className="size-4 text-primary" aria-hidden="true" />
            שלב {step + 1} מתוך {STEPS.length}
          </div>
          <h2
            id="onboarding-title"
            ref={headingRef}
            tabIndex={-1}
            className="title-serif mt-1 text-2xl focus:outline-none"
          >
            {STEPS[step].title}
          </h2>
          <div
            className="mt-4 flex gap-1.5"
            role="progressbar"
            aria-label="התקדמות באשף"
            aria-valuemin={1}
            aria-valuemax={STEPS.length}
            aria-valuenow={step + 1}
          >
            {STEPS.map((_, i) => (
              <div
                key={i}
                className={`h-1 flex-1 rounded-full ${i <= step ? "bg-primary" : "bg-border"}`}
              />
            ))}
          </div>
        </div>

        <div className="min-h-[260px] overflow-y-auto p-6">
          {step === 0 && (
            <div className="space-y-4">
              <Hint>
                זה הדבר היחיד שהתוכנה לא יכולה לנחש: כל החישובים — דקות חסרות, איחורים, בונוס —
                נמדדים מול ארבע השעות האלה. אפשר לשנות אותן בכל עת בהגדרות, ושינוי יחול מאותו יום
                ואילך בלבד.
              </Hint>
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
              {timesError && (
                <p role="alert" className="text-sm text-destructive">
                  לתיקון: {timesError}
                </p>
              )}
            </div>
          )}

          {step === 1 && (
            <div className="space-y-3">
              <Hint>
                בחר איפה תופיע תזכורת, ואילו תזכורות בכלל. את השאר (סיכום שבועי, התראה מוקדמת על
                הקצב ועוד) אפשר להתאים בהגדרות.
              </Hint>
              <Toggle
                label={
                  <span>
                    הודעות קופצות בתוך התוכנה
                    <span className="block text-2xs text-muted-foreground">
                      מופיעות רק כשהתוכנה פתוחה
                    </span>
                  </span>
                }
                on={popups}
                onChange={setPopups}
              />
              <Toggle
                label={
                  <span>
                    התראות בשולחן העבודה
                    <span className="block text-2xs text-muted-foreground">
                      הודעות Windows — מופיעות גם כשהתוכנה מוסתרת מאחורי חלון אחר
                    </span>
                  </span>
                }
                on={desktop}
                onChange={setDesktop}
              />
              {channelsOff && (
                <p role="status" className="text-sm text-warning-fg">
                  שני הערוצים כבויים, ולכן לא תוצג אף תזכורת.
                </p>
              )}
              <div className="eyebrow pt-2">אילו תזכורות</div>
              <Toggle
                label={
                  <span>
                    תזכורת יומית לרישום נוכחות
                    <span className="block text-2xs text-muted-foreground">
                      כשעד תחילת סדר א׳ עוד לא נרשם דבר
                    </span>
                  </span>
                }
                on={reminder}
                onChange={setReminder}
              />
              <Toggle
                label={
                  <span>
                    התראה כשמתקרב למכסת האיחורים
                    <span className="block text-2xs text-muted-foreground">
                      כדי שעוד אפשר יהיה להגיע בזמן
                    </span>
                  </span>
                }
                on={lateAlert}
                onChange={setLateAlert}
              />
              <Toggle
                label={
                  <span>
                    תזכורת לדיווח במערכת הטלפונית
                    <span className="block text-2xs text-muted-foreground">
                      בתחילת כל חודש, על החודש שהסתיים
                    </span>
                  </span>
                }
                on={phoneReport}
                onChange={setPhoneReport}
              />
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <Hint>
                בלי זה, תזכורת מוצגת רק כשהתוכנה פתוחה. זו בחירה מפורשת: היא מפעילה תוכנית נוספת
                במחשב, ולכן היא כבויה עד שתבחר אחרת.
              </Hint>
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
              {background && (
                <p role="status" className="text-sm text-muted-foreground">
                  התראות שולחן העבודה הופעלו גם הן, כי התזכורות ברקע מגיעות כהודעות Windows.
                </p>
              )}
              <Hint>אפשר לכבות בכל רגע במסך ההגדרות, תחת "יעדים ותזכורות".</Hint>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <Hint>
                הנתונים נשמרים אצלך במחשב. גיבוי אוטומטי שומר עותקים נוספים בתוך התוכנה, כדי שגם
                טעות תהיה הפיכה. עותק כזה אינו קובץ במחשב — קובץ גיבוי אפשר לייצא בכל עת ממסך
                הגיבוי.
              </Hint>
              <SelectField
                label="תדירות גיבוי אוטומטי"
                value={auto}
                options={[
                  { v: "off", l: "כבוי" },
                  { v: "daily", l: "יומי" },
                  { v: "weekly", l: "שבועי" },
                ]}
                onChange={(v) => setAuto(v as "off" | "daily" | "weekly")}
              />
              <NumberField
                label="מספר גיבויים לשמור"
                min={1}
                max={20}
                value={retention}
                onChange={setRetention}
              />
              <Hint>כשמגיעים למספר הזה, הגיבוי הישן ביותר נמחק כדי לפנות מקום לחדש.</Hint>
            </div>
          )}

          {step === 4 && (
            <div>
              <h3 className="title-serif text-xl">הכל מוכן</h3>
              <ul className="ledger mt-3 text-sm">
                <li className="row-pad">
                  <span className="text-muted-foreground">שעות: </span>
                  <span className="figure">
                    סדר א׳ {times.s1Start}–{times.s1End} · סדר ב׳ {times.s2Start}–{times.s2End}
                  </span>
                </li>
                <li className="row-pad">
                  <span className="text-muted-foreground">תזכורות: </span>
                  {channelsOff
                    ? "כבויות"
                    : [popups && "בתוך התוכנה", desktop && "בשולחן העבודה"]
                        .filter(Boolean)
                        .join(" ו")}
                  {background ? " · גם כשהתוכנה סגורה" : ""}
                </li>
                <li className="row-pad">
                  <span className="text-muted-foreground">גיבוי אוטומטי: </span>
                  {AUTO_LABEL[auto]}
                  {auto !== "off" ? ` · נשמרים ${retention} עותקים` : ""}
                </li>
              </ul>
              <p className="mt-4 text-sm text-muted-foreground">
                את השם שיופיע בדוחות, את היעדים ואת שאר ההעדפות אפשר להגדיר בכל עת במסך ההגדרות.
              </p>
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-between border-t border-border px-6 py-4">
          <button
            type="button"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
            className="inline-flex h-10 items-center gap-1 rounded-md px-3 text-sm text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30"
          >
            <ChevronRight className="size-4" aria-hidden="true" /> חזור
          </button>
          {step < STEPS.length - 1 ? (
            <button
              type="button"
              onClick={() => setStep((s) => s + 1)}
              disabled={blocked}
              className="pressable inline-flex h-10 items-center gap-1 rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
            >
              המשך <ChevronLeft className="size-4" aria-hidden="true" />
            </button>
          ) : (
            <button
              type="button"
              onClick={finish}
              className="pressable inline-flex h-10 items-center gap-1 rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              סיום <Check className="size-4" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
