import { Link, useRouterState } from "@tanstack/react-router";
import { useSidebarCollapsed } from "@/lib/sidebar-state";
import {
  LayoutDashboard,
  BookMarked,
  BookOpen,
  CalendarCheck,
  Settings,
  PanelRightClose,
  PanelRightOpen,
} from "lucide-react";
import { SECTIONS, sectionForPath, type NavSection } from "@/lib/nav";

// The four working areas, then settings pinned to the bottom. The tabs inside
// each area live in src/lib/nav.ts — keep SHORTCUTS in src/lib/shortcuts.ts in
// step with it.
//
// The rail is the same colour as the page and is set off by one hairline. Open,
// it is text; the icon is there for the collapsed rail, where it is the only
// thing to point at. The current area is marked by a bar at the inline start
// and heavier type — not by a filled block.
const ICONS: Record<NavSection["id"], typeof Settings> = {
  today: LayoutDashboard,
  journal: BookMarked,
  learning: BookOpen,
  month: CalendarCheck,
  settings: Settings,
};
const MAIN = SECTIONS.filter((s) => s.id !== "settings");
const SETTINGS = SECTIONS.find((s) => s.id === "settings")!;

function NavItem({
  sec,
  active,
  collapsed,
}: {
  sec: NavSection;
  active: boolean;
  collapsed: boolean;
}) {
  const Icon = ICONS[sec.id];
  return (
    <li className="list-none">
      <Link
        to={sec.to}
        title={sec.label}
        aria-label={sec.label}
        aria-current={active ? "page" : undefined}
        className={[
          "pressable group relative flex items-center border-s-[3px] py-2.5 text-[0.9375rem]",
          collapsed ? "justify-center px-0" : "gap-3 ps-4 pe-3",
          active
            ? "border-primary font-semibold text-foreground"
            : "border-transparent text-muted-foreground hover:bg-sidebar-accent hover:text-foreground",
        ].join(" ")}
      >
        <Icon className={`size-5 shrink-0 ${collapsed ? "" : "hidden"}`} aria-hidden="true" />
        {!collapsed ? (
          <span className="truncate">{sec.label}</span>
        ) : (
          <span className="pointer-events-none absolute end-full me-2 top-1/2 -translate-y-1/2 whitespace-nowrap rounded-md border border-border bg-popover px-2 py-1 text-xs text-popover-foreground opacity-0 shadow-md transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100 z-50">
            {sec.label}
          </span>
        )}
      </Link>
    </li>
  );
}

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { collapsed, toggle } = useSidebarCollapsed();
  const activeId = sectionForPath(pathname)?.id;
  const width = collapsed ? "w-[64px]" : "w-[208px]";

  return (
    <aside
      className={`fixed inset-y-0 start-0 z-30 flex ${width} flex-col border-e border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200 ease-[var(--ease-out-soft)]`}
    >
      <div
        className={`flex items-center px-3 pt-4 pb-3 ${collapsed ? "flex-col gap-2" : "justify-between gap-2"}`}
      >
        <div className="min-w-0 px-1" title="סדר פלוס">
          <div className="title-serif truncate text-xl">{collapsed ? "ס" : "סדר פלוס"}</div>
        </div>
        <button
          onClick={toggle}
          title={collapsed ? "הרחב סרגל" : "כווץ סרגל"}
          aria-label={collapsed ? "הרחב סרגל" : "כווץ סרגל"}
          className="pressable grid size-9 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
        >
          {collapsed ? (
            <PanelRightOpen className="size-4" aria-hidden="true" />
          ) : (
            <PanelRightClose className="size-4" aria-hidden="true" />
          )}
        </button>
      </div>

      <nav aria-label="ניווט ראשי" className="flex-1 overflow-y-auto py-2">
        <ul>
          {MAIN.map((sec) => (
            <NavItem key={sec.id} sec={sec} active={activeId === sec.id} collapsed={collapsed} />
          ))}
        </ul>
      </nav>
      <div className="border-t border-sidebar-border py-2">
        <ul>
          <NavItem sec={SETTINGS} active={activeId === "settings"} collapsed={collapsed} />
        </ul>
      </div>
    </aside>
  );
}
