// מחשבון המלגה.
//
// Everything here is pure: it is handed one month's rows and returns the
// figures, so the rules can be tested without a store, a clock or a screen.
// The screen that renders it is src/routes/stipend.tsx.
//
// The shape of the calculation, in the order the kollel's rules are written:
//
//   בסיס 2000 ₪
//   − הפחתה על הדקות החסרות, במדרגות
//   + 150 ₪ למי שחיסר פחות מ־500 דקות (כולל המוצדקות)
//   + 20 ₪ לכל סדר "אוהבי ה׳"
//   + 5 ₪ לכל הגעה לסדר ב׳ עד 15:00, לחברי חבורת ש"ס
//   + 18 ₪ לכל שעת כולל ערב, מ־10 שעות ומעלה, עד 90 דק׳ ליום
//   + 25 ₪ לכל שעת תורתו בידו, עד 20 שעות בחודש
//
// One thing runs through all of it — see `proportionalRatio` below: the
// thresholds and the tier boundaries are written for a full month, so a month
// the kollel sat fewer days scales every one of them down. The stipend itself
// never scales; it always starts from 2000 ₪.
import {
  effectiveLearningMin, summarizeEntries,
  type LearningEntry, type SederEntry,
} from "./kollel-store";
import { fullMonthLearningDays, kollelSessionDaysInMonth } from "./hebrew-calendar";
import { SHAS_ARRIVAL_DEADLINE } from "./settings-store";

export type DeductionTier = {
  /** Inclusive lower bound in chargeable minutes. */
  fromMin: number;
  /** Exclusive upper bound; Infinity for the last tier. */
  toMin: number;
  /** ₪ taken off for each whole 10 minutes falling inside this tier. */
  nisPer10Min: number;
};

/**
 * The kollel's rules, in one place.
 *
 * These are policy, not preferences: they are the same for everyone and are
 * set by the kollel, so they are deliberately not editable from inside the
 * app. Changing a rule means changing this block — and `stipend.test.ts` pins
 * every one of these figures, so a change to a rule shows up as a failing
 * test naming the rule, not as a stipend that is quietly wrong.
 */
export const STIPEND_POLICY = {
  baseNis: 2000,

  /** §1 — dividing line: nothing comes off below this many missing minutes. */
  freeMissingMin: 500,

  /** §2 — bonus for a month that stayed under §1, excused minutes included. */
  shortfallBonusNis: 150,

  /**
   * §3 — excused minutes cost nothing at all, up to this much. Past it, and
   * without prior approval from the Rosh Kollel, the excess is charged like
   * any other missing minute.
   */
  excusedFreeMin: 600,

  /** §4 */
  oheveiNisPerSeder: 20,

  /** §5 — חבורת ש"ס only. */
  shasNisPerArrival: 5,

  /** §6–§8 */
  kollelErev: { nisPerHour: 18, minMonthlyMin: 600, maxDailyMin: 90 },
  toratoBeyado: { nisPerHour: 25, minMonthlyMin: 0, maxMonthlyMin: 20 * 60 },

  /** §9 — the deduction, per whole 10 minutes, by band. */
  deductionTiers: [
    { fromMin: 500, toMin: 800, nisPer10Min: 2 },
    { fromMin: 800, toMin: 1800, nisPer10Min: 3 },
    { fromMin: 1800, toMin: Number.POSITIVE_INFINITY, nisPer10Min: 5 },
  ] as DeductionTier[],
};

/**
 * How much of a full month this month was, 0–1.
 *
 * The numerator is the days the kollel actually sat — weekdays, minus Yom
 * Tov, Erev Yom Tov and Bein HaZmanim. The denominator is every Sunday to
 * Thursday in the same month, which depends only on how the dates fall.
 *
 * That is what makes the reference fixed in the sense the rules need: an
 * ordinary month divides out to exactly 1 whether it happens to hold 21
 * working days or 22, and only a month that genuinely lost days to the
 * calendar comes out short.
 */
export function proportionalRatio(sessionDays: number, fullMonthDays: number): number {
  if (fullMonthDays <= 0) return 0;
  return Math.min(1, Math.max(0, sessionDays / fullMonthDays));
}

function scaleMinutes(min: number, ratio: number): number {
  if (!Number.isFinite(min)) return min;   // the last tier has no ceiling
  return Math.round(min * ratio);
}

export function scaleTiers(tiers: DeductionTier[], ratio: number): DeductionTier[] {
  return tiers.map((t) => ({
    ...t,
    fromMin: scaleMinutes(t.fromMin, ratio),
    toMin: scaleMinutes(t.toMin, ratio),
  }));
}

export type TierCharge = DeductionTier & {
  /** Chargeable minutes that landed in this band. */
  minutes: number;
  /** Whole 10-minute blocks of them — a part-block is not charged. */
  units: number;
  nis: number;
};

/**
 * Walks the chargeable minutes through the bands.
 *
 * Each band charges its own whole 10-minute blocks; the leftover under 10
 * inside a band is not carried into the next one. That is the literal reading
 * of "כל 10 דקות מוריד X ₪" per band, and it is the reading that favours the
 * user, which is the right way for a figure labelled "להמחשה בלבד" to err.
 */
export function tierCharges(chargeableMin: number, tiers: DeductionTier[]): TierCharge[] {
  return tiers.map((t) => {
    const minutes = Math.max(0, Math.min(chargeableMin, t.toMin) - t.fromMin);
    const units = Math.floor(minutes / 10);
    return { ...t, minutes, units, nis: units * t.nisPer10Min };
  });
}

/** Effective minutes per framework, with §8's caps applied. */
function cappedKollelErev(lessons: LearningEntry[], maxDailyMin: number) {
  const perDay = new Map<string, number>();
  for (const l of lessons) {
    if (l.framework !== "kollel-erev") continue;
    perDay.set(l.date, (perDay.get(l.date) ?? 0) + effectiveLearningMin(l));
  }
  let raw = 0, counted = 0;
  for (const minutes of perDay.values()) {
    raw += minutes;
    counted += Math.min(minutes, maxDailyMin);
  }
  return { raw, counted, daysOverCap: [...perDay.values()].filter((m) => m > maxDailyMin).length };
}

function cappedToratoBeyado(lessons: LearningEntry[], maxMonthlyMin: number) {
  let raw = 0;
  for (const l of lessons) {
    if (l.framework !== "torato-beyado") continue;
    raw += effectiveLearningMin(l);
  }
  return { raw, counted: Math.min(raw, maxMonthlyMin) };
}

/** One row of the on-screen breakdown. Positive adds, negative takes off. */
export type StipendLine = {
  id: string;
  label: string;
  detail: string;
  nis: number;
  /** Rendered as a plain figure rather than a credit or a debit. */
  kind: "base" | "credit" | "debit";
};

export type StipendBreakdown = {
  monthKey: string;
  /** ימי לימוד שהכולל ישב בהם בפועל בחודש. */
  sessionDays: number;
  /** ימי הלימוד של אותו חודש אילו היה מלא — כל ימי א׳–ה׳ שבו. */
  fullMonthDays: number;
  ratio: number;
  /** The §1/§3/§9 thresholds after the proportional scaling. */
  scaled: { freeMissingMin: number; excusedFreeMin: number; tiers: DeductionTier[] };
  missing: {
    /** כל הדקות שנשמטו, מוצדקות ולא מוצדקות. */
    total: number;
    excused: number;
    /** דקות מוצדקות מעבר לתקרה, שנחשבות כרגילות. */
    excusedCharged: number;
    /** חסר נטו — לא מוצדק, אחרי בונוס והתאמות. */
    net: number;
    /** מה שנכנס בפועל למדרגות ההפחתה. */
    chargeable: number;
  };
  charges: TierCharge[];
  deductionNis: number;
  shortfallBonusNis: number;
  oheveiCount: number;
  oheveiNis: number;
  shasCount: number;
  shasNis: number;
  learning: {
    kollelErevRawMin: number;
    kollelErevCountedMin: number;
    kollelErevDaysOverCap: number;
    kollelErevBelowMinimum: boolean;
    kollelErevNis: number;
    toratoRawMin: number;
    toratoCountedMin: number;
    toratoCapped: boolean;
    toratoNis: number;
  };
  lines: StipendLine[];
  totalNis: number;
};

export type StipendInput = {
  /** "YYYY-MM". */
  monthKey: string;
  /** Every seder row on file; filtered to the month here. */
  entries: SederEntry[];
  /** Every learning row on file; filtered to the month here. */
  lessons: LearningEntry[];
  /** Whether the user marked himself a member of חבורת ש"ס. */
  shasChavura: boolean;
  /** Overrides for tests; both are derived from the calendar otherwise. */
  sessionDays?: number;
  fullMonthDays?: number;
};

export function calcStipend(input: StipendInput): StipendBreakdown {
  const { monthKey, shasChavura } = input;
  const [year, month] = monthKey.split("-").map(Number);
  const monthIdx = month - 1;

  const entries = input.entries.filter((e) => e.date.startsWith(monthKey));
  const lessons = input.lessons.filter((l) => l.date.startsWith(monthKey));

  const sessionDays = input.sessionDays ?? kollelSessionDaysInMonth(year, monthIdx);
  const fullMonthDays = input.fullMonthDays ?? fullMonthLearningDays(year, monthIdx);
  const ratio = proportionalRatio(sessionDays, fullMonthDays);

  const p = STIPEND_POLICY;
  const scaled = {
    freeMissingMin: scaleMinutes(p.freeMissingMin, ratio),
    excusedFreeMin: scaleMinutes(p.excusedFreeMin, ratio),
    tiers: scaleTiers(p.deductionTiers, ratio),
  };

  const s = summarizeEntries(entries);

  // §3 — excused minutes are free up to the ceiling; the excess joins the
  // ordinary missing minutes. §1's own free allowance then applies to the sum,
  // which is what the first tier starting at the same threshold expresses.
  const excusedCharged = Math.max(0, s.excused - scaled.excusedFreeMin);
  const chargeable = s.netMissing + excusedCharged;

  const charges = tierCharges(chargeable, scaled.tiers);
  const deductionNis = Math.round(charges.reduce((sum, c) => sum + c.nis, 0));

  // §2 — measured against everything that was missed, excused included, and
  // against the same scaled threshold as §1.
  const shortfallBonusNis = s.totalMissing < scaled.freeMissingMin ? p.shortfallBonusNis : 0;

  const oheveiNis = s.oheveiCount * p.oheveiNisPerSeder;
  const shasCount = shasChavura ? s.shasCount : 0;
  const shasNis = shasCount * p.shasNisPerArrival;

  const erev = cappedKollelErev(lessons, p.kollelErev.maxDailyMin);
  const kollelErevBelowMinimum = erev.counted < p.kollelErev.minMonthlyMin;
  const kollelErevNis = kollelErevBelowMinimum
    ? 0
    : Math.round((erev.counted / 60) * p.kollelErev.nisPerHour);

  const torato = cappedToratoBeyado(lessons, p.toratoBeyado.maxMonthlyMin);
  const toratoNis = Math.round((torato.counted / 60) * p.toratoBeyado.nisPerHour);

  const lines: StipendLine[] = [
    {
      id: "base",
      label: "מלגת הבסיס",
      detail: "קבועה — אינה מושפעת ממספר ימי הלימוד בחודש",
      nis: p.baseNis,
      kind: "base",
    },
    {
      id: "deduction",
      label: "הפחתה על דקות חסרות",
      detail: chargeable <= scaled.freeMissingMin
        ? `${chargeable} דק׳ לחיוב — מתחת לסף ${scaled.freeMissingMin} דק׳, אין הפחתה`
        : `${chargeable} דק׳ לחיוב, מתוכן ${chargeable - scaled.freeMissingMin} דק׳ מעל הסף`,
      nis: -deductionNis,
      kind: "debit",
    },
    {
      id: "shortfall-bonus",
      label: "תוספת לחיסור נמוך",
      detail: shortfallBonusNis > 0
        ? `סה״כ ${s.totalMissing} דק׳ נשמטו — פחות מ־${scaled.freeMissingMin}`
        : `סה״כ ${s.totalMissing} דק׳ נשמטו — ${scaled.freeMissingMin} ומעלה, אין תוספת`,
      nis: shortfallBonusNis,
      kind: "credit",
    },
    {
      id: "ohevei",
      label: "סדרי אוהבי ה׳",
      detail: `${s.oheveiCount} סדרים × ${p.oheveiNisPerSeder} ₪`,
      nis: oheveiNis,
      kind: "credit",
    },
    ...(shasChavura
      ? [{
          id: "shas",
          label: 'חבורת ש"ס',
          detail: `${shasCount} הגעות לסדר ב׳ עד ${SHAS_ARRIVAL_DEADLINE} × ${p.shasNisPerArrival} ₪`,
          nis: shasNis,
          kind: "credit" as const,
        }]
      : []),
    {
      id: "kollel-erev",
      label: "כולל ערב",
      detail: kollelErevBelowMinimum
        ? `${erev.counted} דק׳ — מתחת למינימום של ${p.kollelErev.minMonthlyMin} דק׳ (10 שעות)`
        : `${erev.counted} דק׳ × ${p.kollelErev.nisPerHour} ₪ לשעה`,
      nis: kollelErevNis,
      kind: "credit",
    },
    {
      id: "torato-beyado",
      label: "תורתו בידו",
      detail: torato.counted > 0
        ? `${torato.counted} דק׳ × ${p.toratoBeyado.nisPerHour} ₪ לשעה`
        : "לא נרשמו דקות החודש",
      nis: toratoNis,
      kind: "credit",
    },
  ];

  const totalNis = Math.max(0, lines.reduce((sum, l) => sum + l.nis, 0));

  return {
    monthKey,
    sessionDays,
    fullMonthDays,
    ratio,
    scaled,
    missing: {
      total: s.totalMissing,
      excused: s.excused,
      excusedCharged,
      net: s.netMissing,
      chargeable,
    },
    charges,
    deductionNis,
    shortfallBonusNis,
    oheveiCount: s.oheveiCount,
    oheveiNis,
    shasCount,
    shasNis,
    learning: {
      kollelErevRawMin: erev.raw,
      kollelErevCountedMin: erev.counted,
      kollelErevDaysOverCap: erev.daysOverCap,
      kollelErevBelowMinimum,
      kollelErevNis,
      toratoRawMin: torato.raw,
      toratoCountedMin: torato.counted,
      toratoCapped: torato.raw > torato.counted,
      toratoNis,
    },
    lines,
    totalNis,
  };
}

