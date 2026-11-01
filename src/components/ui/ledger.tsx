// The notebook kit: the handful of pieces every screen is composed from.
//
// A screen is a column of sections. A section opens with a hairline and a
// title, and holds ruled rows or a few figures — not a grid of identical boxes.
// Weight comes from size, position and a rule, not from a border around
// everything. Nothing here sets its own spacing: rows and sections take the
// density variables in styles.css, so the "צפוף" setting moves all of it.
import type { ReactNode } from "react";

/** A titled block of the page, opened by a hairline. */
export function PageSection({
  title,
  aside,
  children,
  className = "",
}: {
  title?: string;
  /** Right-hand (inline-end) detail on the title line: a count, a link, a control. */
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`section-rule ${className}`}>
      {(title || aside) && (
        <header className="mb-3 flex items-baseline justify-between gap-4">
          {title && <h2 className="text-base font-semibold">{title}</h2>}
          {aside && <div className="text-sm text-muted-foreground">{aside}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

/** One ruled line: a label at the start, its value at the end. */
export function LedgerRow({
  label,
  children,
  note,
  strong = false,
}: {
  label: ReactNode;
  children: ReactNode;
  /** Quiet explanation under the label. */
  note?: ReactNode;
  /** The total line — heavier, for the sum a column of rows leads to. */
  strong?: boolean;
}) {
  return (
    <div
      className={`row-pad flex items-baseline justify-between gap-4 ${strong ? "font-semibold" : ""}`}
    >
      <div className="min-w-0">
        <div className={strong ? "text-base" : "text-sm"}>{label}</div>
        {note && <div className="mt-0.5 text-xs text-muted-foreground">{note}</div>}
      </div>
      <div className="figure shrink-0 text-base" dir="ltr">
        {children}
      </div>
    </div>
  );
}

const MARK_TONES = {
  present: { dot: "bg-status-present", text: "text-status-present-fg" },
  late: { dot: "bg-status-late", text: "text-status-late-fg" },
  absent: { dot: "bg-status-absent", text: "text-status-absent-fg" },
  excused: { dot: "bg-status-excused", text: "text-status-excused-fg" },
  none: { dot: "bg-status-none", text: "text-status-none-fg" },
} as const;

export type MarkTone = keyof typeof MARK_TONES;

/** A state, said in words and shown with a dot — never by colour alone. */
export function StatusMark({
  tone,
  children,
  className = "",
}: {
  tone: MarkTone;
  children: ReactNode;
  className?: string;
}) {
  const t = MARK_TONES[tone];
  return (
    <span className={`inline-flex items-center gap-1.5 text-sm font-medium ${t.text} ${className}`}>
      <span className={`size-2 shrink-0 rounded-full ${t.dot}`} aria-hidden="true" />
      {children}
    </span>
  );
}

/** A number with its unit and name — the opposite of a tile in a box. */
export function Figure({
  label,
  value,
  unit,
  note,
  size = "md",
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  note?: ReactNode;
  size?: "md" | "lg";
}) {
  return (
    <div className="min-w-0">
      <div className="eyebrow">{label}</div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span
          className={`figure font-semibold ${size === "lg" ? "text-4xl" : "text-2xl"}`}
          dir="ltr"
        >
          {value}
        </span>
        {unit && <span className="text-sm text-muted-foreground">{unit}</span>}
      </div>
      {note && <div className="mt-0.5 text-xs text-muted-foreground">{note}</div>}
    </div>
  );
}

const NOTICE_TONES = {
  info: "border-s-info",
  warning: "border-s-warning",
  danger: "border-s-destructive",
  ok: "border-s-success",
} as const;

/** A message about the state of things, with the action it suggests. */
export function Notice({
  tone = "info",
  title,
  children,
  action,
}: {
  tone?: keyof typeof NOTICE_TONES;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={`flex flex-wrap items-center justify-between gap-3 border-s-4 bg-secondary/60 px-4 py-3 ${NOTICE_TONES[tone]}`}
    >
      <div className="min-w-0">
        <div className="text-sm font-semibold">{title}</div>
        {children && <div className="mt-0.5 text-sm text-muted-foreground">{children}</div>}
      </div>
      {action}
    </div>
  );
}

/** What a screen says when there is nothing in it yet. Describes the absence; never implies success. */
export function EmptyNote({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="px-2 py-10 text-center">
      <div className="text-base font-semibold">{title}</div>
      {children && (
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{children}</p>
      )}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}
