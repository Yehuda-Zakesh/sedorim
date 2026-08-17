import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  LayoutDashboard, ClipboardCheck, History, BookOpen, CalendarDays,
  BarChart3, FileText, Settings, Info, Sparkles, DatabaseBackup, ShieldCheck,
  PanelRightClose, PanelRightOpen,
} from "lucide-react";

// Every screen the app has, grouped. Calendar, insights, backup and the audit
// log used to be reachable only by keyboard shortcut or by being embedded as a
// tab inside another screen — so pressing `g c` landed on a page that no
// sidebar item claimed, and the same content existed twice under two different
// layouts. Each screen now lives in exactly one place, and this list is the
// place it lives. Keep it in step with SHORTCUTS in src/lib/shortcuts.ts.
const NAV_GROUPS = [
  {
    label: "מעקב",
    items: [
      { to: "/", label: "לוח בקרה", icon: LayoutDashboard },
      { to: "/attendance", label: "נוכחות סדרים", icon: ClipboardCheck },
      { to: "/calendar", label: "לוח שנה", icon: CalendarDays },
      { to: "/history", label: "היסטוריה", icon: History },
      { to: "/learning", label: "לימוד נוסף", icon: BookOpen },
    ],
  },
  {
    label: "ניתוח",
    items: [
      { to: "/statistics", label: "סטטיסטיקות", icon: BarChart3 },
      { to: "/insights", label: "תובנות חכמות", icon: Sparkles },
      { to: "/reports", label: "דוחות", icon: FileText },
    ],
  },
  {
    label: "מערכת",
    items: [
      { to: "/backup", label: "גיבוי ושחזור", icon: DatabaseBackup },
      { to: "/audit", label: "יומן ביקורת", icon: ShieldCheck },
      { to: "/settings", label: "הגדרות", icon: Settings },
      { to: "/about", label: "אודות", icon: Info },
    ],
  },
] as const;

const SB_KEY = "sederplus.sidebar.collapsed.v1";
const SB_LEGACY_KEY = "kollel.sidebar.collapsed.v1";

export function getSidebarCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  // Pre-rename installs still carry the old key; read it once as a fallback.
  const v = localStorage.getItem(SB_KEY) ?? localStorage.getItem(SB_LEGACY_KEY);
  return v === "1";
}
export function useSidebarCollapsed() {
  const [c, setC] = useState<boolean>(() => getSidebarCollapsed());
  useEffect(() => {
    const h = () => setC(getSidebarCollapsed());
    window.addEventListener("kollel:sidebar", h);
    return () => window.removeEventListener("kollel:sidebar", h);
  }, []);
  const toggle = () => {
    const next = !getSidebarCollapsed();
    localStorage.setItem(SB_KEY, next ? "1" : "0");
    window.dispatchEvent(new Event("kollel:sidebar"));
  };
  return { collapsed: c, toggle };
}

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { collapsed, toggle } = useSidebarCollapsed();
  const width = collapsed ? "w-[64px]" : "w-[220px]";

  return (
    <aside className={`fixed inset-y-0 right-0 z-30 flex ${width} flex-col bg-sidebar text-sidebar-foreground border-l border-sidebar-border transition-[width] duration-200`}>
      <div className={`px-2 py-3 border-b border-sidebar-border flex items-center ${collapsed ? "justify-center" : "justify-between gap-2"}`}>
        {!collapsed && (
          <div className="flex items-center gap-2 px-1 min-w-0">
            <div className="size-9 rounded-lg bg-sidebar-primary grid place-items-center text-sidebar-primary-foreground font-bold shrink-0">ס</div>
            <div className="text-sm font-semibold truncate">סדר פלוס</div>
          </div>
        )}
        {collapsed && (
          <div className="size-9 rounded-lg bg-sidebar-primary grid place-items-center text-sidebar-primary-foreground font-bold" title="סדר פלוס">ס</div>
        )}
        <button
          onClick={toggle}
          title={collapsed ? "הרחב סרגל" : "כווץ סרגל"}
          aria-label={collapsed ? "הרחב סרגל" : "כווץ סרגל"}
          className={`${collapsed ? "mt-2" : ""} rounded-md p-1.5 text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground`}
        >
          {collapsed ? <PanelRightOpen className="size-4" /> : <PanelRightClose className="size-4" />}
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-1.5 py-3">
        {NAV_GROUPS.map((group, gi) => (
          <div key={group.label} className={gi > 0 ? "mt-4" : ""}>
            {collapsed
              ? gi > 0 && <div className="mx-2 mb-2 border-t border-sidebar-border" />
              : (
                <div className="px-2.5 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/45">
                  {group.label}
                </div>
              )}
            <ul className="space-y-1">
              {group.items.map(({ to, label, icon: Icon }) => {
                const active = to === "/" ? pathname === "/" : pathname.startsWith(to);
                return (
                  <li key={to}>
                    <Link
                      to={to}
                      title={label}
                      aria-label={label}
                      aria-current={active ? "page" : undefined}
                      className={[
                        "group relative flex items-center rounded-md p-2.5 text-sm transition-colors",
                        collapsed ? "justify-center" : "gap-3",
                        active
                          ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                          : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                      ].join(" ")}
                    >
                      <Icon className="size-5 shrink-0" />
                      {!collapsed ? (
                        <span className="truncate">{label}</span>
                      ) : (
                        <span className="pointer-events-none absolute right-full mr-2 top-1/2 -translate-y-1/2 whitespace-nowrap rounded-md bg-popover text-popover-foreground border border-border px-2 py-1 text-xs opacity-0 group-hover:opacity-100 transition shadow-md z-50">
                          {label}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}
