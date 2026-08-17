// Form controls shared by Settings, the onboarding wizard and the record
// screens. The raw look lives in the `field-input` utility in styles.css so
// that plain <input>s elsewhere match these without importing anything.
import type { ReactNode } from "react";

/** Label on the right, control filling the rest — the Settings row layout. */
export function Field({
  label, value, onChange, maxLength = 80, placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  maxLength?: number;
  placeholder?: string;
}) {
  return (
    <div className="grid grid-cols-3 gap-3 items-center">
      <label className="text-xs text-muted-foreground">{label}</label>
      <input
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
  label, value, min, max, onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-3 items-center">
      <label className="text-xs text-muted-foreground">{label}</label>
      <input
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
  label, value, options, onChange,
}: {
  label: string;
  value: string;
  options: { v: string; l: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-3 items-center">
      <label className="text-xs text-muted-foreground">{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="field-input col-span-2 w-full">
        {options.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
      </select>
    </div>
  );
}

/** Label above the control — used where fields sit side by side in a grid. */
export function StackedField({
  label, children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label className="text-xs text-muted-foreground">{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

export function TimeField({
  label, value, onChange, disabled = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <StackedField label={label}>
      <input type="time" value={value} disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="field-input w-full tabular-nums" />
    </StackedField>
  );
}

export function Toggle({
  label, on, onChange,
}: {
  label: ReactNode;
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
      <span className="text-sm">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={() => onChange(!on)}
        className={`relative h-6 w-11 rounded-full transition shrink-0 ${on ? "bg-primary" : "bg-muted"}`}
      >
        <span className={`absolute top-0.5 size-5 rounded-full bg-card shadow transition-all ${on ? "right-0.5" : "right-[22px]"}`} />
      </button>
    </div>
  );
}
