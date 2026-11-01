// Form controls shared by Settings, the onboarding wizard and the record
// screens. The raw look lives in the `field-input` utility in styles.css so
// that plain <input>s elsewhere match these without importing anything.
import { useId, useState, type ReactNode } from "react";
import { finalNumber, liveNumber } from "@/lib/number-input";

/** How wide the control of a row is — sized to what goes in it, not to the row. */
export type ControlWidth = "time" | "number" | "select" | "text";
const WIDTHS: Record<ControlWidth, string> = {
  time: "w-32",
  number: "w-28",
  select: "w-44",
  text: "w-72",
};

/**
 * One setting: the label (and a short explanation) at the start, the control at
 * the end, at the width its value needs. Narrow windows stack the two.
 */
function FieldRow({
  id,
  label,
  note,
  width,
  children,
}: {
  id: string;
  label: string;
  note?: ReactNode;
  width: ControlWidth;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-10 flex-wrap items-center justify-between gap-x-4 gap-y-1.5">
      <div className="min-w-0 flex-1 basis-48">
        <label htmlFor={id} className="text-sm">
          {label}
        </label>
        {note && (
          <p id={`${id}-note`} className="mt-0.5 text-xs text-muted-foreground">
            {note}
          </p>
        )}
      </div>
      <div className={`max-w-full shrink-0 ${WIDTHS[width]}`}>{children}</div>
    </div>
  );
}

export function Field({
  label,
  value,
  onChange,
  maxLength = 80,
  placeholder,
  note,
  width = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  maxLength?: number;
  placeholder?: string;
  note?: ReactNode;
  width?: ControlWidth;
}) {
  const id = useId();
  return (
    <FieldRow id={id} label={label} note={note} width={width}>
      <input
        id={id}
        value={value}
        maxLength={maxLength}
        placeholder={placeholder}
        aria-describedby={note ? `${id}-note` : undefined}
        onChange={(e) => onChange(e.target.value)}
        className="field-input w-full"
      />
    </FieldRow>
  );
}

export function NumberField({
  label,
  value,
  min,
  max,
  onChange,
  note,
  unit,
  width = "number",
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  note?: ReactNode;
  /** Shown inside the box edge, e.g. "דק׳"; the label stays the accessible name. */
  unit?: string;
  width?: ControlWidth;
}) {
  const id = useId();
  // Text while the box has focus; the stored number otherwise. Valid in-range
  // values are committed as they are typed, the rest waits for blur.
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <FieldRow id={id} label={label} note={note} width={width}>
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          value={draft ?? value}
          aria-describedby={note ? `${id}-note` : undefined}
          onChange={(e) => {
            setDraft(e.target.value);
            const n = liveNumber(e.target.value, min, max);
            if (n !== null) onChange(n);
          }}
          onBlur={(e) => {
            onChange(finalNumber(e.target.value, min, max));
            setDraft(null);
          }}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            // Commit the clamped value first, then let an enclosing form submit
            // on the next tick — after the parent has re-rendered with it.
            e.preventDefault();
            const form = e.currentTarget.form;
            onChange(finalNumber(e.currentTarget.value, min, max));
            setDraft(null);
            if (form) setTimeout(() => form.requestSubmit(), 0);
          }}
          className="field-input w-full min-w-0 tabular-nums"
        />
        {unit && <span className="shrink-0 text-xs text-muted-foreground">{unit}</span>}
      </div>
    </FieldRow>
  );
}

export function SelectField({
  label,
  value,
  options,
  onChange,
  note,
  width = "select",
}: {
  label: string;
  value: string;
  options: { v: string; l: string }[];
  onChange: (v: string) => void;
  note?: ReactNode;
  width?: ControlWidth;
}) {
  const id = useId();
  return (
    <FieldRow id={id} label={label} note={note} width={width}>
      <select
        id={id}
        value={value}
        aria-describedby={note ? `${id}-note` : undefined}
        onChange={(e) => onChange(e.target.value)}
        className="field-input w-full"
      >
        {options.map((o) => (
          <option key={o.v} value={o.v}>
            {o.l}
          </option>
        ))}
      </select>
    </FieldRow>
  );
}

/** Label above the control — used where fields sit side by side in a grid. */
// The <label> wraps the control rather than pointing at it by id: children is
// an arbitrary node here, so there is nothing to hang an id on. Wrapping gives
// the same association, and every caller passes exactly one input or select.
// The caption is a <span>, not a nested <label>, which would be invalid.
export function StackedField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

export function TimeField({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <StackedField label={label}>
      <input
        type="time"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="field-input w-full tabular-nums"
      />
    </StackedField>
  );
}

/**
 * The whole row is the switch, not just the 44px track beside it.
 *
 * Two things came out of that: the label and the control are one hit target
 * (so a mis-aimed tap toggles rather than doing nothing), and the label is the
 * accessible name of the switch without an id/`aria-labelledby` pair to keep in
 * step.
 *
 * The knob travels on `transform`, not on `right`. Animating `right` re-lays
 * out the row on every frame; a transform is handed to the compositor. The
 * curve overshoots very slightly — this is a control that was *pushed*, and a
 * physical thing that was pushed settles rather than stopping dead.
 */
export function Toggle({
  label,
  note,
  on,
  onChange,
}: {
  label: ReactNode;
  /** Quiet explanation under the label — what the switch does, in one line. */
  note?: ReactNode;
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className="pressable-lg group flex min-h-11 w-full items-center justify-between gap-4 rounded-md py-1.5 text-start hover:bg-accent/40"
    >
      <span className="min-w-0">
        <span className="block text-sm">{label}</span>
        {note && <span className="mt-0.5 block text-xs text-muted-foreground">{note}</span>}
      </span>
      <span className="flex shrink-0 items-center gap-2">
        {/* The state in words as well as in the track: colour is not the only cue. */}
        <span className="text-xs text-muted-foreground" aria-hidden="true">
          {on ? "פועל" : "כבוי"}
        </span>
        <span
          aria-hidden="true"
          className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors duration-200 ${on ? "border-primary bg-primary" : "border-input bg-muted"}`}
        >
          {/* The track is RTL like the rest of the app: the knob rests at the
              inline-start edge when on, and travels 20px towards the end (which
              is leftwards here) when off. */}
          <span
            className="absolute top-[3px] start-[3px] size-4 rounded-full bg-card shadow-sm"
            style={{
              transform: on ? "translateX(0)" : "translateX(-20px)",
              transition: "transform 240ms var(--ease-spring)",
            }}
          />
        </span>
      </span>
    </button>
  );
}
