import { createFileRoute } from "@tanstack/react-router";
import { AppShell, APP_VERSION, BUILD_COMMIT, BUILD_TIME } from "@/components/app-shell";
import {
  ClipboardCheck, BookOpen, BarChart3, CalendarDays, History, FileText,
  Search, Settings, Shield, Zap, Sparkles, Info, HeartHandshake, Palette,
  BellRing, RefreshCw,
} from "lucide-react";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "אודות · מעקב כולל" },
      { name: "description", content: "מידע על תוכנת מעקב הכולל — פעילות, יכולות וגרסה" },
    ],
  }),
  component: AboutPage,
});

const features = [
  { icon: ClipboardCheck, title: "נוכחות סדרים", desc: "רישום שעת הגעה ויציאה לשני סדרי היום עם חישוב אוטומטי של דקות חסרות, מכסת איחורים ואישורים." },
  { icon: BookOpen, title: "לימוד נוסף", desc: "מעקב זמני לימוד במסגרות שונות (כולל ערב, תורתו בידו, בין הזמנים) לפי דקות, טווח שעות או טיימר." },
  { icon: CalendarDays, title: "לוח שנה עברי", desc: "תצוגה חודשית צבועה לפי סטטוס יומי, כולל תאריכים עבריים ומעבר מהיר בין חודשים." },
  { icon: BarChart3, title: "סטטיסטיקות ותובנות", desc: "מסך אחד שאומר במשפט איך נראה החודש, ואחריו המדדים, ההמלצות והגרפים — מגמת 12 חודשים, ימי השבוע החלשים ומפת נוכחות." },
  { icon: History, title: "היסטוריה לפי חודש", desc: "חודש אחד בכל פעם, עם מעבר בין חודשים, סינון וחיפוש, ושורת סיכום שנסגרת בסוף כל חודש." },
  { icon: FileText, title: "הפקת דוחות", desc: "דוחות PDF וקטוריים עם גופן עברי מוטמע — טקסט אמיתי שניתן לסימון וחיפוש, טבלאות שנחתכות נכון בין עמודים, וגם ייצוא לאקסל." },
  { icon: Search, title: "חיפוש מתקדם", desc: "חיפוש חכם על כל סוגי הרישומים לפי תאריך, תג, הערה או סטטוס." },
  { icon: Settings, title: "הגדרות אישיות", desc: "שעות הסדרים (כולל שינוי לתקופה), יעדים חודשיים, מכסת איחורים, גיבוי אוטומטי ויומן תקלות." },
  { icon: Palette, title: "עיצוב מותאם", desc: "11 ערכות צבע לסרגל הצד, ערכות רקע מרובות, מצב בהיר/כהה, שינוי גודל גופן וניגודיות גבוהה." },
  { icon: Shield, title: "גיבוי ושחזור", desc: "גיבוי אוטומטי מקומי עם שמירת גרסאות, יצוא וייבוא ידני של כל הנתונים, ותמונות מצב לפני פעולות גדולות." },
  { icon: Zap, title: "כניסה מהירה", desc: "תוכנה קטנה ונפרדת: שדה אחד לשעת ההגעה — הסדר מזוהה לבד — כפתורי מוצדק והיעדרות, רישום כולל ערב ותורתו בידו ונתוני החודש. הכל בלי לפתוח את התוכנה המלאה." },
  { icon: Sparkles, title: "קיצורי מקלדת ונגישות", desc: "קיצורים למעבר מהיר בין מסכים, תמיכה בקורא מסך והתאמות ראייה." },
  { icon: BellRing, title: "התראות ותזכורות", desc: "תזכורת יומית כשלא נרשם סדר, התראה על חריגה ממכסת האיחורים וסיכום שבועי — כהודעה קופצת בתוכנה, וגם כהתראת Windows אם תבחר בכך." },
  { icon: RefreshCw, title: "עדכון מתוך התוכנה", desc: "בדיקה אוטומטית פעמיים ביום, והתקנה בלחיצה אחת: הקובץ יורד, התוכנה נסגרת ונפתחת מחדש בגרסה החדשה." },
];

function AboutPage() {
  return (
    <AppShell title="אודות" subtitle="מידע על התוכנה והפעילות שלה">
      <div dir="rtl" className="mx-auto max-w-5xl space-y-6">
        {/* Hero */}
        <section className="rounded-2xl border border-border bg-gradient-to-l from-primary/10 via-card to-card p-8 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="size-14 rounded-xl bg-primary grid place-items-center text-primary-foreground shadow-md">
              <Info className="size-7" />
            </div>
            <div className="flex-1">
              <h2 className="text-2xl font-bold">סדר פלוס</h2>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                תוכנה אישית ומקצועית לניהול הנוכחות והלימוד היומי בכולל. כל המידע נשמר מקומית במחשב שלך —
                שקוף, פרטי ותמיד זמין. מותאמת במיוחד לאברכי כולל כתר תורה, לוח עברי ודוחות מוכנים לשליחה.
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-full bg-primary/15 text-primary px-3 py-1 font-medium">גרסה {APP_VERSION}</span>
                <span className="rounded-full bg-muted px-3 py-1">עדכון אוטומטי</span>
                {BUILD_COMMIT !== "dev" && (
                  <span className="rounded-full bg-muted px-3 py-1 font-mono" title="השוו מול הקומיט האחרון ב-GitHub כדי לוודא שהחבילה עדכנית">
                    build {BUILD_COMMIT}{BUILD_TIME ? ` · ${BUILD_TIME}` : ""}
                  </span>
                )}
                <span className="rounded-full bg-muted px-3 py-1">עברית · RTL</span>
                <span className="rounded-full bg-muted px-3 py-1">אחסון מקומי</span>
                <span className="rounded-full bg-muted px-3 py-1">ללא הרשמה</span>
              </div>
            </div>
          </div>
        </section>

        {/* Features grid */}
        <section>
          <h3 className="mb-3 text-xs font-semibold text-muted-foreground">
            מה התוכנה עושה
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {features.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="rounded-xl border border-border bg-card p-4 hover:shadow-sm transition-shadow">
                <div className="flex items-center gap-2 mb-2">
                  <div className="size-8 rounded-lg bg-primary/10 text-primary grid place-items-center shrink-0">
                    <Icon className="size-4" />
                  </div>
                  <h4 className="text-sm font-semibold">{title}</h4>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Two apps */}
        <section className="rounded-2xl border border-border bg-card p-6">
          <div className="flex items-center gap-2 mb-3">
            <Zap className="size-5 text-primary" />
            <h3 className="text-base font-semibold">שני יישומים · אותו מסד נתונים</h3>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">
            החבילה כוללת שני יישומים נפרדים לחלוטין: התוכנה הראשית (המסך הזה) לניהול מלא של הנוכחות, הלימוד, הדוחות וההגדרות;
            ויישום "כניסה מהירה" לרישום זריז של שעות הגעה ויציאה. שני היישומים חולקים את אותו אחסון מקומי במחשב, כך שהנתונים מסתנכרנים אוטומטית ביניהם.
          </p>
        </section>

        {/* Credit */}
        <section className="rounded-2xl border border-border bg-card p-6 text-center">
          <div className="flex items-center justify-center gap-2 mb-2 text-primary">
            <HeartHandshake className="size-5" />
            <h3 className="text-base font-semibold">קרדיט</h3>
          </div>
          <p className="text-sm text-muted-foreground">
            התוכנה נוצרה ע"י <span className="font-semibold text-foreground">יהודה זקש</span>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            כל הזכויות לא שמורות · שימוש חופשי · גרסה {APP_VERSION}
          </p>
        </section>
      </div>
    </AppShell>
  );
}