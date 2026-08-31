// Form controls shared by Settings, the onboarding wizard and the record
// screens. The raw look lives in the `field-input` utility in styles.css so
// that plain <input>s elsewhere match these without importing anything.
import { useId, type ReactNode } from "react";

/** Label on the right, control filling the rest — the Settings row layout. */
export function Field({
  label,
  value,
  onChange,
  maxLength = 80,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  maxLength?: number;
  placeholder?: string;
}) {
  const id = useId();
  return (
    <div className="grid grid-cols-3 gap-3 items-center">
      <label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </label>
      <input
        id={id}
        value={value}
        maxLength={maxLength}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="field-input col-span-2 w-full"
      />
    </div>
  );
}

export function NumberField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  const id = useId();
  return (
    <div className="grid grid-cols-3 gap-3 items-center">
      <label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </label>
      <input
        id={id}
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Math.max(min, Math.min(max, +e.target.value || 0)))}
        className="field-input col-span-2 w-full"
      />
    </div>
  );
}

export function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { v: string; l: string }[];
  onChange: (v: string) => void;
}) {
  const id = useId();
  return (
    <div className="grid grid-cols-3 gap-3 items-center">
      <label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="field-input col-span-2 w-full"
      >
        {options.map((o) => (
          <option key={o.v} value={o.v}>
            {o.l}
          </option>
        ))}
      </select>
    </div>
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
  on,
  onChange,
}: {
  label: ReactNode;
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className="pressable-lg group flex w-full items-center justify-between gap-3 rounded-lg border border-border px-4 py-3 text-start hover:bg-accent/40"
    >
      <span className="text-sm">{label}</span>
      <span
        aria-hidden="true"
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200 ${on ? "bg-primary" : "bg-muted"}`}
      >
        {/* The track is RTL like the rest of the app: the knob rests at the
            inline-start edge when on, and travels 20px towards the end (which
            is leftwards here) when off. */}
        <span
          className="absolute top-0.5 start-0.5 size-5 rounded-full bg-card shadow-sm"
          style={{
            transform: on ? "translateX(0)" : "translateX(-20px)",
            transition: "transform 240ms var(--ease-spring)",
          }}
        />
      </span>
    </button>
  );
}
