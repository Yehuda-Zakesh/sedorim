import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell, APP_VERSION, BUILD_COMMIT, BUILD_TIME } from "@/components/app-shell";
import {
  ClipboardCheck,
  BookOpen,
  BarChart3,
  CalendarDays,
  History,
  FileText,
  Search,
  Settings,
  Shield,
  Zap,
  Sparkles,
  Palette,
  BellRing,
  RefreshCw,
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
  {
    icon: ClipboardCheck,
    title: "נוכחות סדרים",
    desc: "רישום שעת הגעה ויציאה לשני סדרי היום עם חישוב אוטומטי של דקות חסרות, מכסת איחורים ואישורים.",
  },
  {
    icon: BookOpen,
    title: "לימוד נוסף",
    desc: "מעקב זמני לימוד במסגרות שונות (כולל ערב, תורתו בידו, בין הזמנים) לפי דקות, טווח שעות או טיימר.",
  },
  {
    icon: CalendarDays,
    title: "לוח שנה עברי",
    desc: "תצוגה חודשית צבועה לפי סטטוס יומי, כולל תאריכים עבריים ומעבר מהיר בין חודשים.",
  },
  {
    icon: BarChart3,
    title: "סטטיסטיקות",
    desc: "מסך אחד שאומר במשפט איך נראה החודש, ואחריו הנתונים והגרפים — מגמת 12 חודשים, ימי השבוע החלשים ומפת נוכחות.",
  },
  {
    icon: History,
    title: "היסטוריה לפי חודש",
    desc: "חודש אחד בכל פעם, עם מעבר בין חודשים, סינון וחיפוש, ושורת סיכום שנסגרת בסוף כל חודש.",
  },
  {
    icon: FileText,
    title: "הפקת דוחות",
    desc: "דוחות PDF וקטוריים עם גופן עברי מוטמע — טקסט אמיתי שניתן לסימון וחיפוש, טבלאות שנחתכות נכון בין עמודים, וגם ייצוא לאקסל.",
  },
  {
    icon: Search,
    title: "חיפוש מתקדם",
    desc: "חיפוש חכם על כל סוגי הרישומים לפי תאריך, תג, הערה או סטטוס.",
  },
  {
    icon: Settings,
    title: "הגדרות אישיות",
    desc: "שעות הסדרים (כולל שינוי לתקופה), יעדים חודשיים, מכסת איחורים, גיבוי אוטומטי ויומן תקלות.",
  },
  {
    icon: Palette,
    title: "מראה מותאם",
    desc: "12 ערכות צבע (ברירת המחדל: ירוק דיו), כמה ערכות רקע, מצב בהיר/כהה, שינוי גודל גופן וניגודיות גבוהה.",
  },
  {
    icon: Shield,
    title: "גיבוי ושחזור",
    desc: "גיבוי אוטומטי מקומי עם שמירת גרסאות, יצוא וייבוא ידני של כל הנתונים, ותמונות מצב לפני פעולות גדולות.",
  },
  {
    icon: Zap,
    title: "כניסה מהירה",
    desc: "תוכנה קטנה ונפרדת: שדה אחד לשעת ההגעה — הסדר מזוהה לבד — כפתורי מוצדק והיעדרות, רישום כולל ערב ותורתו בידו ונתוני החודש. הכל בלי לפתוח את התוכנה המלאה.",
  },
  {
    icon: Sparkles,
    title: "קיצורי מקלדת ונגישות",
    desc: "קיצורים למעבר מהיר בין מסכים, תמיכה בקורא מסך והתאמות ראייה.",
  },
  {
    icon: BellRing,
    title: "התראות ותזכורות",
    desc: "תזכורת יומית כשלא נרשם סדר, התראה על חריגה ממכסת האיחורים וסיכום שבועי — כהודעה קופצת בתוכנה, וגם כהתראת Windows אם תבחר בכך.",
  },
  {
    icon: RefreshCw,
    title: "עדכון מתוך התוכנה",
    desc: "בדיקה אוטומטית פעמיים ביום, והתקנה בלחיצה אחת: הקובץ יורד, התוכנה נסגרת ונפתחת מחדש בגרסה החדשה.",
  },
];

function AboutPage() {
  return (
    <AppShell title="אודות ותחזוקה" subtitle="גרסה, עדכונים ומה התוכנה יודעת לעשות">
      <div dir="rtl" className="stack-gap max-w-4xl">
        {/* Who and which version */}
        <section>
          <h2 className="title-serif text-3xl">סדר פלוס</h2>
          <p className="mt-2 max-w-2xl text-base leading-relaxed text-muted-foreground">
            תוכנה אישית לניהול הנוכחות והלימוד היומי בכולל. כל המידע נשמר במחשב שלך בלבד, ולא נשלח
            לשום מקום. מותאמת לאברכי כולל כתר תורה, עם לוח עברי ודוחות מוכנים לשליחה.
          </p>
          <dl className="mt-4 max-w-md ledger text-sm">
            <div className="row-pad flex justify-between gap-4">
              <dt className="text-muted-foreground">גרסה</dt>
              <dd className="figure font-medium">{APP_VERSION}</dd>
            </div>
            {BUILD_COMMIT !== "dev" && (
              <div className="row-pad flex justify-between gap-4">
                <dt className="text-muted-foreground">בנייה</dt>
                <dd className="figure font-mono" dir="ltr">
                  {BUILD_COMMIT}
                  {BUILD_TIME ? ` · ${BUILD_TIME}` : ""}
                </dd>
              </div>
            )}
            <div className="row-pad flex justify-between gap-4">
              <dt className="text-muted-foreground">אחסון</dt>
              <dd>מקומי, בלי הרשמה</dd>
            </div>
          </dl>
        </section>

        {/* Maintenance */}
        <section aria-labelledby="about-maintenance" className="section-rule">
          <h3 id="about-maintenance" className="mb-2 text-base font-semibold">
            תחזוקה
          </h3>
          <ul className="ledger text-sm">
            <li className="row-pad">
              <span className="font-medium">עדכונים.</span>{" "}
              <span className="text-muted-foreground">
                התוכנה בודקת בעצמה פעמיים ביום, ושואלת לפני שהיא מתקינה גרסה חדשה.
              </span>
            </li>
            <li className="row-pad">
              <span className="font-medium">תקלה?</span>{" "}
              <Link to="/settings" className="text-primary underline underline-offset-2">
                יומן התקלות
              </Link>{" "}
              <span className="text-muted-foreground">נמצא בהגדרות, תחת ״תחזוקה ואודות״.</span>
            </li>
            <li className="row-pad">
              <span className="font-medium">גיבוי ושחזור.</span>{" "}
              <Link to="/backup" className="text-primary underline underline-offset-2">
                נתונים וגיבוי
              </Link>
              <span className="text-muted-foreground"> — שמירת קובץ במחשב ושחזור.</span>
            </li>
          </ul>
        </section>

        {/* Features */}
        <section className="section-rule">
          <h3 className="mb-2 text-base font-semibold">מה התוכנה עושה</h3>
          <ul className="ledger">
            {features.map(({ icon: Icon, title, desc }) => (
              <li key={title} className="row-pad flex items-baseline gap-3">
                <Icon className="size-4 shrink-0 translate-y-0.5 text-primary" aria-hidden="true" />
                <div className="min-w-0">
                  <h4 className="text-sm font-semibold">{title}</h4>
                  <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">{desc}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* Two apps */}
        <section className="section-rule">
          <h3 className="mb-2 text-base font-semibold">שני יישומים, אותם נתונים</h3>
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
            החבילה כוללת שתי תוכנות: התוכנה הראשית (המסך הזה), לניהול מלא של הנוכחות, הלימוד, הדוחות
            וההגדרות; ו״כניסה מהירה״, לרישום זריז של שעת הגעה. שתיהן קוראות וכותבות לאותו אחסון
            מקומי במחשב, ולכן הנתונים זהים בשתיהן.
          </p>
        </section>

        <p className="text-sm text-muted-foreground">
          שימוש חופשי: מותר להעביר, להתקין ולהשתמש בחופשיות.
        </p>
      </div>
    </AppShell>
  );
}
