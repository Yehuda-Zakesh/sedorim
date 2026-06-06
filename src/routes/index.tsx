import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import {
  UserCheck, Clock, TrendingUp, AlertTriangle,
  CalendarCheck, BookOpen, ChevronLeft, Sparkles, Bell,
  Flame, Target, CalendarPlus, FileDown, DatabaseBackup,
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "לוח בקרה — המעקב שלי" },
      { name: "description", content: "מעקב אישי אחר נוכחות, רצפים והתקדמות" },
    ],
  }),
  component: Dashboard,
});

const hebrewDate = "כ״ב סיון תשפ״ו · 6 ביוני 2026";

const kpis = [
  { label: "נוכחות החודש", value: "92%", delta: "+3% מהחודש שעבר", icon: UserCheck, tone: "success" as const },
  { label: "ימים רצופים", value: "14", delta: "השיא שלך: 21", icon: Flame, tone: "warning" as const },
  { label: "איחורים החודש", value: "2", delta: "מתוך יעד: עד 3", icon: Clock, tone: "info" as const },
  { label: "יעד חודשי", value: "95%", delta: "נותרו 3 ימים", icon: Target, tone: "primary" as const },
];

const toneStyles: Record<string, string> = {
  primary: "bg-primary/10 text-primary",
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  destructive: "bg-destructive/10 text-destructive",
  info: "bg-info/10 text-info",
};

function Dashboard() {
  return (
    <AppShell
      title="לוח בקרה"
      subtitle={hebrewDate}
      actions={
        <button className="inline-flex items-center gap-2 rounded-md bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition">
          <CalendarCheck className="size-4" />
          רישום נוכחות להיום
        </button>
      }
    >
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {kpis.map((k) => (
          <div key={k.label} className="card-surface p-5">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-xs font-medium text-muted-foreground">{k.label}</div>
                <div className="mt-2 text-3xl font-bold tracking-tight tabular-nums">{k.value}</div>
                <div className="mt-1 text-[11px] text-muted-foreground">{k.delta}</div>
              </div>
              <div className={`size-10 rounded-lg grid place-items-center ${toneStyles[k.tone]}`}>
                <k.icon className="size-5" />
              </div>
            </div>
          </div>
        ))}
      </section>

      <div className="mt-5 card-surface p-4 flex items-center gap-3 border-r-4 border-r-info">
        <div className="size-9 rounded-md bg-info/10 text-info grid place-items-center">
          <Bell className="size-4" />
        </div>
        <div className="flex-1">
          <div className="text-sm font-semibold">לא רשמת נוכחות להיום</div>
          <p className="text-xs text-muted-foreground mt-0.5">סמן את הסטטוס היומי שלך כדי לשמור על רצף הרישומים.</p>
        </div>
        <button className="text-xs text-info hover:underline inline-flex items-center gap-1">
          לרישום <ChevronLeft className="size-3" />
        </button>
      </div>

      <div className="mt-5 grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card-surface p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold">פילוח החודש</h2>
            <span className="text-xs text-muted-foreground">סיון תשפ״ו</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[
              { label: "נוכח", value: 18, color: "var(--status-present)" },
              { label: "איחור", value: 2, color: "var(--status-late)" },
              { label: "נעדר", value: 1, color: "var(--status-absent)" },
              { label: "מוצדק", value: 1, color: "var(--status-excused)" },
              { label: "ללא רישום", value: 0, color: "var(--status-none)" },
            ].map((s) => (
              <div key={s.label} className="rounded-lg border border-border p-3">
                <div className="flex items-center gap-2">
                  <span className="size-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                  <span className="text-xs text-muted-foreground">{s.label}</span>
                </div>
                <div className="mt-2 text-2xl font-bold tabular-nums">{s.value}</div>
              </div>
            ))}
          </div>

          <div className="mt-5">
            <div className="text-xs text-muted-foreground mb-2">אחוז נוכחות לפי שבוע</div>
            <div className="flex items-end gap-2 h-28">
              {[88, 92, 100, 90, 95].map((v, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full rounded-t-md bg-primary/80" style={{ height: `${v}%` }} />
                  <span className="text-[10px] text-muted-foreground">שבוע {i + 1}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="card-surface p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold">תזכורות אישיות</h2>
            <span className="text-xs text-info font-medium">2 פעילות</span>
          </div>
          <ul className="space-y-3">
            {[
              { icon: AlertTriangle, tone: "warning", title: "מתקרב למכסת איחורים", desc: "עוד איחור אחד יחרוג מהיעד" },
              { icon: BookOpen, tone: "info", title: "לימוד נוסף — מחר 18:00", desc: "שיעור משלים שנקבע" },
              { icon: CalendarPlus, tone: "success", title: "סיימת שבוע מלא", desc: "המשך כך לשמירה על הרצף" },
            ].map((a, i) => (
              <li key={i} className="flex gap-3">
                <div className={`size-8 rounded-md grid place-items-center shrink-0 ${toneStyles[a.tone]}`}>
                  <a.icon className="size-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{a.title}</div>
                  <div className="text-xs text-muted-foreground">{a.desc}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card-surface p-5 lg:col-span-2 bg-gradient-to-l from-primary/5 to-transparent">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="size-4 text-primary" />
            <h2 className="text-sm font-semibold">תובנות אישיות</h2>
          </div>
          <ul className="space-y-2 text-sm">
            <li className="flex items-start gap-2">
              <TrendingUp className="size-4 text-success mt-0.5 shrink-0" />
              <span>הנוכחות שלך עלתה ב־<b className="tabular-nums">3%</b> לעומת החודש הקודם.</span>
            </li>
            <li className="flex items-start gap-2">
              <AlertTriangle className="size-4 text-warning mt-0.5 shrink-0" />
              <span>רוב האיחורים שלך מתרחשים בימי ראשון — שווה לבדוק את שגרת הבוקר.</span>
            </li>
            <li className="flex items-start gap-2">
              <BookOpen className="size-4 text-info mt-0.5 shrink-0" />
              <span>השלמת <b className="tabular-nums">5</b> שעות לימוד נוסף החודש.</span>
            </li>
          </ul>
        </div>

        <div className="card-surface p-5">
          <h2 className="text-sm font-semibold mb-3">פעולות מהירות</h2>
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: "רישום נוכחות", icon: CalendarCheck },
              { label: "הוספת לימוד", icon: BookOpen },
              { label: "ייצוא דוח", icon: FileDown },
              { label: "גיבוי נתונים", icon: DatabaseBackup },
            ].map((a) => (
              <button key={a.label} className="rounded-lg border border-border bg-card hover:bg-accent transition p-3 text-right">
                <a.icon className="size-4 text-primary mb-2" />
                <div className="text-xs font-medium">{a.label}</div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
