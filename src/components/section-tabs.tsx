import { Link, useRouterState } from "@tanstack/react-router";
import { sectionForPath } from "@/lib/nav";

/**
 * The tabs of whichever area the current route belongs to — written as text on
 * a rule, with the chosen one underlined, so they read as part of the page
 * rather than as a floating control. They sit inside the header, which draws
 * the rule they rest on.
 */
export function SectionTabs() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const section = sectionForPath(pathname);
  if (!section || section.tabs.length < 2) return null;

  return (
    <nav aria-label={section.label} className="px-[var(--density-page)]">
      <ul className="-mb-px flex gap-6 overflow-x-auto">
        {section.tabs.map((t) => {
          const active = t.to === "/" ? pathname === "/" : pathname.startsWith(t.to);
          return (
            <li key={t.to}>
              <Link
                to={t.to}
                aria-current={active ? "page" : undefined}
                className={`block whitespace-nowrap border-b-2 pb-2 pt-1 text-sm transition-colors ${
                  active
                    ? "border-primary font-semibold text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
