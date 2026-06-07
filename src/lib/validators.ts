// Light helper validators kept for compatibility with existing callers.
export type ValidationResult = { ok: true } | { ok: false; error: string };

export function validateHHMM(t: string): ValidationResult {
  if (!/^\d{1,2}:\d{2}$/.test(t)) return { ok: false, error: "פורמט לא תקין (HH:MM)" };
  const [h, m] = t.split(":").map(Number);
  if (h < 0 || h > 23 || m < 0 || m > 59) return { ok: false, error: "שעה לא קיימת" };
  return { ok: true };
}

export function validateDateRange(from: string, to: string): ValidationResult {
  if (from && to && from > to) return { ok: false, error: "טווח תאריכים לא תקין" };
  return { ok: true };
}
