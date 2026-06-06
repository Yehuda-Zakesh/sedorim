import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  ClipboardCheck,
  CalendarDays,
  History,
  BookOpen,
  BarChart3,
  FileText,
  Search,
  ShieldCheck,
  Settings,
  DatabaseBackup,
} from "lucide-react";

const navItems = [
  { to: "/", label: "לוח בקרה", icon: LayoutDashboard },
  { to: "/attendance", label: "נוכחות", icon: ClipboardCheck },
  { to: "/calendar", label: "לוח שנה", icon: CalendarDays },
  { to: "/history", label: "היסטוריה", icon: History },
  { to: "/learning", label: "לימוד נוסף", icon: BookOpen },
  { to: "/statistics", label: "סטטיסטיקות", icon: BarChart3 },
  { to: "/reports", label: "דוחות", icon: FileText },
  { to: "/search", label: "חיפוש", icon: Search },
  { to: "/audit", label: "יומן ביקורת", icon: ShieldCheck },
  { to: "/settings", label: "הגדרות", icon: Settings },
  { to: "/backup", label: "גיבוי ושחזור", icon: DatabaseBackup },
] as const;

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <aside className="fixed inset-y-0 right-0 z-30 flex w-[220px] flex-col bg-sidebar text-sidebar-foreground border-l border-sidebar-border">
      <div className="px-5 py-5 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="size-9 rounded-lg bg-sidebar-primary grid place-items-center text-sidebar-primary-foreground font-bold">
            ש
          </div>
          <div>
            <div className="text-sm font-semibold leading-tight">המעקב שלי</div>
            <div className="text-[11px] text-sidebar-foreground/60 leading-tight">נוכחות אישית</div>
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-3">
        <ul className="space-y-0.5">
          {navItems.map(({ to, label, icon: Icon }) => {
            const active = to === "/" ? pathname === "/" : pathname.startsWith(to);
            return (
              <li key={to}>
                <Link
                  to={to}
                  className={[
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                    active
                      ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                      : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  ].join(" ")}
                >
                  <Icon className="size-4 shrink-0" />
                  <span className="truncate">{label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="px-4 py-3 border-t border-sidebar-border text-[11px] text-sidebar-foreground/60">
        גרסה 1.0 · Enterprise
      </div>
    </aside>
  );
}
