import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard, ClipboardCheck, History, BookOpen,
  BarChart3, FileText, Search, Settings, Zap,
} from "lucide-react";

const navItems = [
  { to: "/", label: "לוח בקרה", icon: LayoutDashboard },
  { to: "/attendance", label: "נוכחות סדרים", icon: ClipboardCheck },
  { to: "/quick", label: "כניסה מהירה", icon: Zap },
  { to: "/history", label: "היסטוריה", icon: History },
  { to: "/learning", label: "לימוד נוסף", icon: BookOpen },
  { to: "/statistics", label: "סטטיסטיקות", icon: BarChart3 },
  { to: "/reports", label: "דוחות", icon: FileText },
  { to: "/search", label: "חיפוש", icon: Search },
  { to: "/settings", label: "הגדרות", icon: Settings },
] as const;

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <aside className="fixed inset-y-0 right-0 z-30 flex w-[64px] flex-col bg-sidebar text-sidebar-foreground border-l border-sidebar-border">
      <div className="px-2 py-3 border-b border-sidebar-border grid place-items-center">
        <div className="size-9 rounded-lg bg-sidebar-primary grid place-items-center text-sidebar-primary-foreground font-bold" title="המעקב שלי">כ</div>
      </div>

      <nav className="flex-1 overflow-y-auto px-1.5 py-3">
        <ul className="space-y-1">
          {navItems.map(({ to, label, icon: Icon }) => {
            const active = to === "/" ? pathname === "/" : pathname.startsWith(to);
            return (
              <li key={to}>
                <Link
                  to={to}
                  title={label}
                  aria-label={label}
                  className={[
                    "group relative flex items-center justify-center rounded-md p-2.5 text-sm transition-colors",
                    active
                      ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                      : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  ].join(" ")}
                >
                  <Icon className="size-5 shrink-0" />
                  <span className="pointer-events-none absolute right-full mr-2 top-1/2 -translate-y-1/2 whitespace-nowrap rounded-md bg-popover text-popover-foreground border border-border px-2 py-1 text-xs opacity-0 group-hover:opacity-100 transition shadow-md z-50">
                    {label}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
