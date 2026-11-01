// What the seder-hours form on the Settings screen is comparing.
//
// Three different things used to be folded into one: the hours that apply
// today, the hours that apply on the date the person picked, and the draft they
// have typed but not saved. The form compared the draft with *today's* hours,
// so saving a change that starts next week left it looking unsaved forever.
//
// The draft is now compared with a baseline — the hours it was started from.
// Saving moves the baseline to what was saved, wherever on the calendar that
// lands; only a real edit makes it a draft again.
import type { SederTimes } from "./settings-store";

export function sameTimes(a: SederTimes, b: SederTimes): boolean {
  return (
    a.s1Start === b.s1Start && a.s1End === b.s1End && a.s2Start === b.s2Start && a.s2End === b.s2End
  );
}

export type HoursStatus = "saved" | "draft";

/** "טיוטה" only while the draft differs from what it started as. */
export function hoursStatus(draft: SederTimes, baseline: SederTimes): HoursStatus {
  return sameTimes(draft, baseline) ? "saved" : "draft";
}

/** Where a saved change stands relative to today: starts now, or starts later. */
export function hoursEffect(from: string, today: string): "today" | "future" | "past" {
  if (from > today) return "future";
  if (from < today) return "past";
  return "today";
}

/** The confirmation shown after saving, in plain words. */
export function hoursSavedMessage(from: string, today: string): string {
  const effect = hoursEffect(from, today);
  if (effect === "future") return `השעות החדשות ייכנסו לתוקף ב־${from}`;
  if (effect === "past") return `השעות עודכנו מ־${from} ואילך`;
  return "השעות עודכנו מהיום ואילך";
}

// ---- The draft is an action: hours AND the date they start ----

/** The whole hours action: what to set, and from when. */
export type HoursDraft = { times: SederTimes; from: string };

export type HoursDraftState = {
  /** Saving would change what is in force on the chosen date. */
  needsSave: boolean;
  /** Differs from the reference point it was started from (hours or date). */
  touched: boolean;
  /** "draft" when there is anything to save or to cancel. */
  status: HoursStatus;
};

/**
 * `baseline` is the reference point the form was started from (or last saved
 * to). `effective` is what is in force on `draft.from` right now. Saving is
 * needed when the draft differs from `effective` — not from the baseline —
 * because the same hours can be a real change on a different date: 10:00 from
 * 1.11, a draft of 09:00 on 5.11 changes 5.11 even though the hours are
 * untouched.
 */
export function hoursDraftState(
  draft: HoursDraft,
  baseline: HoursDraft,
  effective: SederTimes,
): HoursDraftState {
  const needsSave = !sameTimes(draft.times, effective);
  const touched = draft.from !== baseline.from || !sameTimes(draft.times, baseline.times);
  return { needsSave, touched, status: needsSave || touched ? "draft" : "saved" };
}

/** The shared contract of every save indicator on the settings screen. */
export type SaveState = "draft" | "saving" | "saved" | "failed";

export const SAVE_STATE_TEXT: Record<SaveState, string> = {
  draft: "טיוטה — טרם נשמר",
  saving: "שומר…",
  saved: "נשמר",
  failed: "שמירה נכשלה",
};
