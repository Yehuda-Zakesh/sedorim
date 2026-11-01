// Editing a number in a text box.
//
// NumberField used to clamp on every keystroke, so clearing the box to type a
// new value snapped it straight back to the minimum, and typing "45" in a field
// with a minimum of 30 was impossible (the "4" became 30). While the user is
// typing the text is left alone; the range is enforced when they finish.

/** The in-range value for text typed mid-edit, or null if it is not (yet) valid. */
export function liveNumber(text: string, min: number, max: number): number | null {
  if (text.trim() === "") return null;
  const n = Number(text);
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return n;
}

/** The value to commit when editing ends: anything unparseable counts as 0, then the range applies. */
export function finalNumber(text: string, min: number, max: number): number {
  const n = Number(text);
  return Math.max(min, Math.min(max, Number.isFinite(n) ? n : 0));
}
