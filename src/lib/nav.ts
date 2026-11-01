// The app's navigation model: four working areas plus a settings area.
//
// Every route file still exists (old links and shortcuts keep working), but
// each one belongs to exactly one area, and an area shows its routes as tabs.
// The sidebar, the section tabs, the shortcuts and the help dialog all read
// this one list, so they cannot drift apart.

export type NavTab = { to: string; label: string };

export type NavSection = {
  id: "today" | "journal" | "learning" | "month" | "settings";
  label: string;
  /** Where the sidebar link goes. */
  to: string;
  tabs: NavTab[];
};

export const SECTIONS: NavSection[] = [
  {
    id: "today",
    label: "היום",
    to: "/",
    tabs: [
      { to: "/", label: "היום" },
      { to: "/attendance", label: "רישום נוכחות" },
    ],
  },
  {
    id: "journal",
    label: "היומן שלי",
    to: "/history",
    tabs: [
      { to: "/history", label: "רשימה" },
      { to: "/calendar", label: "לוח שנה" },
      { to: "/search", label: "חיפוש מתקדם" },
    ],
  },
  {
    id: "learning",
    label: "לימוד נוסף",
    to: "/learning",
    tabs: [{ to: "/learning", label: "לימוד נוסף" }],
  },
  {
    id: "month",
    label: "סיכום חודש",
    to: "/statistics",
    tabs: [
      { to: "/statistics", label: "סקירה ותובנות" },
      { to: "/stipend", label: "מלגה" },
      { to: "/reports", label: "דוחות" },
    ],
  },
  {
    id: "settings",
    label: "הגדרות",
    to: "/settings",
    tabs: [
      { to: "/settings", label: "העדפות" },
      { to: "/backup", label: "נתונים וגיבוי" },
      { to: "/about", label: "אודות ותחזוקה" },
    ],
  },
];

/** The area a pathname belongs to, or undefined for an unknown route. */
export function sectionForPath(pathname: string): NavSection | undefined {
  return SECTIONS.find((s) =>
    s.tabs.some((t) => (t.to === "/" ? pathname === "/" : pathname.startsWith(t.to))),
  );
}
