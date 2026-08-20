// The rules behind the quick-entry window.
//
// That window asks for one thing — a time — and works out the rest. Which
// seder it belongs to, whether "אוהבי ה׳" is even possible, what a justified
// absence looks like as a record. All of that is decided here, in plain
// functions, so it can be tested without a window and so the quick app and the
// full app cannot end up disagreeing about what a record means.
//
// One decision worth stating out loud: a quick entry records the departure as
// the end of the seder. The window deliberately has no departure field — the
// whole point is one field — so the assumption has to be "stayed to the end",
// and the missing minutes come from a late arrival alone. Anyone who left
// early can correct it on the attendance screen.
import { hhmmToMin, newId, type SederEntry, type SederNum } from "./kollel-store";
import type { SederTimes } from "./settings-store";

export type SederBounds = { start: number; end: number };

/** Start and end of one seder, in minutes past midnight. */
export function sederBounds(seder: SederNum, times: SederTimes): SederBounds {
  return seder === 1
    ? { start: hhmmToMin(times.s1Start) ?? 0, end: hhmmToMin(times.s1End) ?? 0 }
    : { start: hhmmToMin(times.s2Start) ?? 0, end: hhmmToMin(times.s2End) ?? 0 };
}

export function sederEndTime(seder: SederNum, times: SederTimes): string {
  return seder === 1 ? times.s1End : times.s2End;
}

/**
 * Which seder a time belongs to.
 *
 * Anything up to the end of seder א׳ is seder א׳; anything from the start of
 * seder ב׳ onwards is seder ב׳. In the gap between them — where an entry could
 * plausibly be a late arrival to one or an early arrival to the other — it goes
 * to whichever edge is nearer, so 14:00 with sedarim of 09:00–13:00 and
 * 15:45–19:30 lands on ב׳ and 13:20 lands on א׳.
 */
export function detectSeder(timeMin: number, times: SederTimes): SederNum {
  const s1 = sederBounds(1, times);
  const s2 = sederBounds(2, times);
  if (timeMin <= s1.end) return 1;
  if (timeMin >= s2.start) return 2;
  return timeMin - s1.end <= s2.start - timeMin ? 1 : 2;
}

/**
 * Whether "אוהבי ה׳" can be claimed for an arrival at this time.
 *
 * The full definition is "present from the start of the seder to its end", and
 * since a quick entry stays to the end by construction, the only thing left to
 * check is that the arrival was not late.
 */
export function canBeOhevei(timeMin: number, seder: SederNum, times: SederTimes): boolean {
  return timeMin <= sederBounds(seder, times).start;
}

/** A blank record for one seder of one day, before anything is filled in. */
export function blankEntry(date: string, seder: SederNum): SederEntry {
  return {
    id: newId(),
    date,
    seder,
    absent: false,
    ohevei: false,
    excusedAll: false,
    excusedMinutes: 0,
    manualAdjustMin: 0,
    tags: [],
  };
}

/**
 * The record for an arrival, built on top of whatever is already stored for
 * that seder — so pressing save twice corrects the time instead of piling up a
 * second row, and a justification entered earlier survives.
 */
export function arrivalEntry(opts: {
  existing?: SederEntry;
  date: string;
  seder: SederNum;
  time: string;
  ohevei: boolean;
  times: SederTimes;
}): SederEntry {
  const base = opts.existing ?? blankEntry(opts.date, opts.seder);
  return {
    ...base,
    date: opts.date,
    seder: opts.seder,
    arrival: opts.time,
    departure: sederEndTime(opts.seder, opts.times),
    absent: false,
    ohevei: opts.ohevei,
  };
}

export type ExcusedChoice =
  | { kind: "all" }
  | { kind: "partial"; minutes: number };

/** Applies a justification to a record without touching anything else on it. */
export function withExcused(entry: SederEntry, choice: ExcusedChoice): SederEntry {
  return choice.kind === "all"
    ? { ...entry, excusedAll: true, excusedMinutes: 0 }
    : { ...entry, excusedAll: false, excusedMinutes: Math.max(0, Math.round(choice.minutes)) };
}

/**
 * The record for a whole seder missed.
 *
 * The arrival and departure times are cleared: a row that is both absent and
 * carries times reads as a contradiction on the attendance screen, and
 * calcSeder would still count the full seder as missing.
 */
export function absenceEntry(opts: {
  existing?: SederEntry;
  date: string;
  seder: SederNum;
  excused: ExcusedChoice | null;
}): SederEntry {
  const base = opts.existing ?? blankEntry(opts.date, opts.seder);
  const entry: SederEntry = {
    ...base,
    date: opts.date,
    seder: opts.seder,
    absent: true,
    ohevei: false,
    arrival: undefined,
    departure: undefined,
    excusedAll: false,
    excusedMinutes: 0,
  };
  return opts.excused ? withExcused(entry, opts.excused) : entry;
}

/** "HH:MM" for a Date — the format every stored time uses. */
export function hhmmOf(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/**
 * A time typed however the user felt like typing it, or null if it is not a
 * time at all.
 *
 * The quick window's one field is the one thing people type every day, and
 * reaching for the colon is the slowest part of it. So `0915`, `915`, `9:15`
 * and `9.15` all mean 09:15, and a bare `9` means 09:00 — nobody typing one
 * number into a field labelled "שעת הגעה" means nine minutes past midnight.
 *
 * Deliberately strict about the *result*: 25:00 and 09:70 are rejected rather
 * than clamped, because a silently corrected time is worse than an obvious
 * refusal on a field that feeds every figure in the app.
 */
export function parseLooseTime(raw: string): string | null {
  const text = String(raw ?? "").trim();
  if (!text) return null;

  // Anything that is not a digit is treated as a separator, so ".", ":" and
  // even a stray space between the halves all work.
  const digits = text.replace(/\D/g, "");
  if (digits.length === 0 || digits.length > 4) return null;
  // "1:5" is a typo, not 01:05 — a separator means two real halves.
  const separated = /\D/.test(text);

  let hours: number;
  let minutes: number;
  if (digits.length <= 2 && !separated) {
    hours = Number(digits);
    minutes = 0;
  } else if (digits.length === 3) {
    hours = Number(digits.slice(0, 1));
    minutes = Number(digits.slice(1));
  } else if (digits.length === 4) {
    hours = Number(digits.slice(0, 2));
    minutes = Number(digits.slice(2));
  } else {
    return null;
  }

  if (hours > 23 || minutes > 59) return null;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}
