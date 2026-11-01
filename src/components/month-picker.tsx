import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { currentMonthKey, monthKeyLabel, shiftMonth } from "@/lib/month-nav";

const ARROW =
  "size-8 shrink-0 rounded-md grid place-items-center text-muted-foreground hover:text-foreground hover:bg-accent pressable transition disabled:opacity-30 disabled:hover:bg-transparent";

/**
 * One compact line: arrows for the month either side, the month's name (which
 * opens a short menu for anything further away), and a small link back to now.
 * It sits on the page's hairline like the rest of the notebook, not in a box.
 * Bind `value`/`onChange` to useSelectedMonth() (src/lib/period.ts) so every
 * screen shows the same month.
 */
export function MonthPicker({
  value,
  months,
  onChange,
  sublabel,
  leading,
}: {
  value: string;
  months: string[];
  onChange: (key: string) => void;
  /** Small line next to the month name, e.g. the Hebrew month. */
  sublabel?: ReactNode;
  /** Icon shown before the month name. */
  leading?: ReactNode;
}) {
  const [listOpen, setListOpen] = useState(false);
  const isCurrent = value === currentMonthKey();
  const menuId = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  // Close on a click elsewhere; on open, put focus on the selected month.
  useEffect(() => {
    if (!listOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setListOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    const items = menu.current?.querySelectorAll<HTMLButtonElement>("button");
    const current = menu.current?.querySelector<HTMLButtonElement>('[aria-pressed="true"]');
    (current ?? items?.[0])?.focus();
    return () => document.removeEventListener("mousedown", onDown);
  }, [listOpen]);

  const onMenuKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      setListOpen(false);
      trigger.current?.focus();
      return;
    }
    const step = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const items = [...(menu.current?.querySelectorAll<HTMLButtonElement>("button") ?? [])];
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    items[(at + step + items.length) % items.length]?.focus();
  };

  return (
    <div ref={root} className="relative flex flex-wrap items-center gap-x-1 gap-y-1">
      {/* Right arrow steps back in time: in an RTL layout, back is to the right. */}
      <button
        type="button"
        onClick={() => onChange(shiftMonth(value, -1))}
        title="החודש הקודם"
        aria-label="החודש הקודם"
        className={ARROW}
      >
        <ChevronRight className="size-4" aria-hidden="true" />
      </button>

      <button
        type="button"
        ref={trigger}
        onClick={() => setListOpen((v) => !v)}
        aria-expanded={listOpen}
        aria-controls={listOpen ? menuId : undefined}
        aria-haspopup="true"
        className="flex min-w-0 items-baseline gap-2 rounded-md px-2 py-1 hover:bg-accent/40 pressable transition"
      >
        {leading && <span className="self-center">{leading}</span>}
        <span className="text-base font-semibold">{monthKeyLabel(value)}</span>
        {sublabel && <span className="text-xs text-muted-foreground">{sublabel}</span>}
      </button>

      <button
        type="button"
        onClick={() => onChange(shiftMonth(value, 1))}
        disabled={isCurrent}
        title="החודש הבא"
        aria-label="החודש הבא"
        className={ARROW}
      >
        <ChevronLeft className="size-4" aria-hidden="true" />
      </button>

      {!isCurrent && (
        <button
          type="button"
          onClick={() => onChange(currentMonthKey())}
          className="ms-2 text-xs text-primary underline underline-offset-2 hover:text-foreground"
        >
          חזור לחודש הנוכחי
        </button>
      )}

      {listOpen && (
        <div
          ref={menu}
          id={menuId}
          role="group"
          aria-label="בחירת חודש"
          onKeyDown={onMenuKey}
          onBlur={(e) => {
            // Tabbing out of the menu closes it.
            if (!root.current?.contains(e.relatedTarget as Node | null)) setListOpen(false);
          }}
          className="absolute start-0 top-full z-20 mt-1 max-h-64 w-48 overflow-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md"
        >
          {months.map((key) => (
            <button
              type="button"
              key={key}
              onClick={() => {
                onChange(key);
                setListOpen(false);
                trigger.current?.focus();
              }}
              aria-pressed={key === value}
              className={`block w-full rounded px-2.5 py-1.5 text-start text-sm transition hover:bg-accent ${
                key === value ? "bg-primary/10 font-semibold text-primary" : ""
              }`}
            >
              {monthKeyLabel(key)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
