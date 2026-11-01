import { CalendarCheck, CalendarClock } from "lucide-react";
import { MonthPicker } from "@/components/month-picker";
import { monthClosing } from "@/lib/kollel-store";
import { monthStateLabel } from "@/lib/journal";
import { useSelectedMonth } from "@/lib/period";

/**
 * The shared month control for the journal screens. The month is the one from
 * useSelectedMonth, so list, calendar, search and the month summary agree.
 * "Ended" only says the month is over — nothing is locked.
 */
export function JournalMonthBar({ months }: { months: string[] }) {
  const [month, setMonth] = useSelectedMonth();
  const info = monthClosing(month, [], []);
  const label = monthStateLabel(info.closed);
  return (
    <MonthPicker
      value={month}
      months={months}
      onChange={setMonth}
      leading={
        info.closed ? (
          <CalendarCheck className="size-3.5 text-muted-foreground" aria-label={label} />
        ) : (
          <CalendarClock className="size-3.5 text-primary" aria-label={label} />
        )
      }
      sublabel={`${info.hebrewLabel} · ${label}`}
    />
  );
}
