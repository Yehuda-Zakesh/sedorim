// One month's totals. The History and Calendar screens both showed this, each
// with its own layout and its own partial selection of the same fields — so
// the two disagreed about what "the monthly summary" even contains. This is
// now the single answer.
import type { MonthlySummary } from "@/lib/kollel-store";
import { useSettings } from "@/lib/settings-store";
import { StatTile } from "@/components/ui/stat";

type Field = { key: keyof MonthlySummary; label: string; dot?: string };

const FIELDS: Field[] = [
  { key: "entries", label: "רישומים" },
  { key: "totalMissing", label: "חסר סה״כ" },
  { key: "excused", label: "מוצדק", dot: "var(--status-excused)" },
  { key: "nonExcused", label: "לא מוצדק" },
  { key: "netMissing", label: "חסר נטו" },
  { key: "bonus", label: "בונוס", dot: "var(--status-present)" },
  { key: "lateCount", label: "איחורים", dot: "var(--status-late)" },
  { key: "absenceCount", label: "היעדרויות", dot: "var(--status-absent)" },
  { key: "earlyDepCount", label: "יציאה מוקדמת", dot: "var(--status-late)" },
  { key: "oheveiCount", label: "אוהבי ה׳", dot: "var(--status-present)" },
];

/** Only meaningful to a member of the חבורה, so only shown to one. */
const SHAS_FIELD: Field = { key: "shasCount", label: "חבורת ש״ס", dot: "var(--status-present)" };

export function MonthSummaryCard({ title, summary }: { title: string; summary: MonthlySummary }) {
  const { settings } = useSettings();
  const fields = settings.seder.shasChavura ? [...FIELDS, SHAS_FIELD] : FIELDS;

  return (
    <div className="card-surface p-5">
      <h3 className="text-sm font-semibold mb-3">{title}</h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {fields.map((f) => (
          <StatTile key={f.key} label={f.label} value={summary[f.key]} dot={f.dot} />
        ))}
      </div>
    </div>
  );
}
