// The tinted-icon square and the KPI card, which between them were copied into
// the dashboard, statistics, insights and backup screens with small drifting
// differences each time. One definition, so a change to the KPI look lands
// everywhere at once.
import type { LucideIcon } from "lucide-react";
import { TrendingUp, TrendingDown } from "lucide-react";

export type Tone = "primary" | "success" | "warning" | "info" | "destructive";

const TONE_CLASSES: Record<Tone, string> = {
  primary: "bg-primary/10 text-primary",
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning-fg",
  info: "bg-info/10 text-info",
  destructive: "bg-destructive/10 text-destructive",
};

const BADGE_SIZES = {
  sm: "size-8 rounded-md",
  md: "size-9 rounded-md",
  lg: "size-10 rounded-lg",
} as const;

/** An icon in a tinted rounded square — the app's most repeated visual unit. */
export function IconBadge({
  icon: Icon,
  tone = "primary",
  size = "lg",
  className = "",
}: {
  icon: LucideIcon;
  tone?: Tone;
  size?: keyof typeof BADGE_SIZES;
  className?: string;
}) {
  const iconSize = size === "lg" ? "size-5" : "size-4";
  return (
    <div
      className={`${BADGE_SIZES[size]} grid place-items-center shrink-0 ${TONE_CLASSES[tone]} ${className}`}
    >
      <Icon className={iconSize} />
    </div>
  );
}

export function KpiCard({
  label,
  value,
  icon,
  tone = "primary",
  hint,
  trend,
  compact = false,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  tone?: Tone;
  /** Plain secondary line under the value. */
  hint?: string;
  /** Secondary line with a direction arrow, coloured by `up`. */
  trend?: { text: string; up: boolean };
  /** Icon beside the value on one line, instead of a tall card. */
  compact?: boolean;
}) {
  if (compact) {
    return (
      <div className="card-surface p-5">
        <div className="flex items-center gap-3">
          <IconBadge icon={icon} tone={tone} />
          <div className="min-w-0">
            <div className="text-xs text-muted-foreground">{label}</div>
            <div className="text-sm font-semibold tabular-nums truncate">{value}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="card-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-medium text-muted-foreground">{label}</div>
          {/* Long values (a Hebrew month name, say) would otherwise blow the
              card open at the 3xl size — so they step down a rung of the type
              scale rather than to a one-off pixel value, and keep the tracking
              and leading that belong to the size they land on.
              No `tabular-nums`: equal-width digits read loose at display size,
              and nothing here lines up in a column. */}
          <div
            className={`mt-2 font-bold break-words ${value.length > 8 ? "text-xl" : "text-3xl"}`}
          >
            {value}
          </div>
          {hint && <div className="mt-1 text-2xs text-muted-foreground">{hint}</div>}
          {trend && (
            <div
              className={`mt-1 text-2xs inline-flex items-center gap-1 ${trend.up ? "text-success" : "text-destructive"}`}
            >
              {trend.up ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}{" "}
              {trend.text}
            </div>
          )}
        </div>
        <IconBadge icon={icon} tone={tone} />
      </div>
    </div>
  );
}

/** A bordered label/number tile — the building block of the summary grids. */
export function StatTile({
  label,
  value,
  dot,
  hint,
}: {
  label: string;
  value: string | number;
  /** Colour swatch before the label, e.g. `var(--status-late)`. */
  dot?: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex items-center gap-2">
        {dot && (
          <span className="size-2.5 rounded-full shrink-0" style={{ backgroundColor: dot }} />
        )}
        <span className="text-xs text-muted-foreground truncate">{label}</span>
      </div>
      <div className="mt-2 text-2xl font-bold">{value}</div>
      {hint && <div className="text-2xs text-muted-foreground mt-0.5">{hint}</div>}
    </div>
  );
}
