import { describe, it, expect } from "vitest";
import {
  isWeekend,
  isYomTov,
  isErevYomTov,
  isLearningDay,
  isHebrewLeap,
  hebrewMonthsInYear,
  hebrewLastDayOfMonth,
  hebrewFromGregorian,
  hebrewDayLetters,
  hebrewYearLetters,
  hebrewMonthName,
  formatHebrewDate,
  formatHebrewMonthYear,
  isBeinHazmanim,
  fastDayName,
  isFastDay,
  hasNoSederB,
  type HebrewDate,
} from "./hebrew-calendar";

// `new Date("YYYY-MM-DD")` parses as UTC, which shifts the day in negative
// offsets — every date here is built from local components instead.
function d(iso: string): Date {
  const [y, m, day] = iso.split("-").map(Number);
  return new Date(y, m - 1, day);
}
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const SUN = 0,
  MON = 1,
  TUE = 2,
  WED = 3,
  THU = 4,
  FRI = 5,
  SAT = 6;

// Hebrew month numbers, as used throughout the module.
const NISAN = 1,
  IYAR = 2,
  SIVAN = 3,
  TAMMUZ = 4,
  AV = 5,
  ELUL = 6,
  TISHREI = 7,
  CHESHVAN = 8,
  KISLEV = 9,
  TEVET = 10,
  SHVAT = 11,
  ADAR = 12,
  ADAR_II = 13;

/** The Hebrew date that must follow `h`, derived from the module's own month lengths. */
function nextHebrew(h: HebrewDate): HebrewDate {
  if (h.day < hebrewLastDayOfMonth(h.month, h.year)) return { ...h, day: h.day + 1 };
  if (h.month === ELUL) return { year: h.year + 1, month: TISHREI, day: 1 };
  if (h.month === hebrewMonthsInYear(h.year)) return { year: h.year, month: NISAN, day: 1 };
  return { year: h.year, month: h.month + 1, day: 1 };
}

/** Walks forward from 1 Jan `fromYear` to find the Gregorian date of a Hebrew one. */
function gregorianOf(year: number, month: number, day: number, fromYear: number): Date {
  const cur = d(`${fromYear}-01-01`);
  for (let i = 0; i < 1400; i++) {
    const h = hebrewFromGregorian(cur);
    if (h.year === year && h.month === month && h.day === day) return new Date(cur);
    cur.setDate(cur.getDate() + 1);
  }
  throw new Error(`no Gregorian date found for ${day}/${month}/${year}`);
}

const iso = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

// ============================================================================
// Structure of the Hebrew year
// ============================================================================

describe("isHebrewLeap / hebrewMonthsInYear", () => {
  it("marks exactly the 7 leap years of the 19-year cycle", () => {
    // Positions 3, 6, 8, 11, 14, 17 and 19 of each cycle are leap years.
    const leaps: number[] = [];
    for (let y = 5782; y < 5782 + 19; y++) if (isHebrewLeap(y)) leaps.push(y);
    expect(leaps).toHaveLength(7);
  });

  it("matches the known leap years of the current cycle", () => {
    const leaps: number[] = [];
    for (let y = 5780; y <= 5800; y++) if (isHebrewLeap(y)) leaps.push(y);
    expect(leaps).toEqual([5782, 5784, 5787, 5790, 5793, 5795, 5798]);
  });

  it("repeats with a period of 19 years", () => {
    for (let y = 5700; y <= 5900; y++) {
      expect(isHebrewLeap(y)).toBe(isHebrewLeap(y + 19));
    }
  });

  it("gives 13 months to a leap year and 12 to a plain one", () => {
    expect(hebrewMonthsInYear(5786)).toBe(12);
    expect(hebrewMonthsInYear(5787)).toBe(13);
    for (let y = 5700; y <= 5900; y++) {
      expect(hebrewMonthsInYear(y)).toBe(isHebrewLeap(y) ? 13 : 12);
    }
  });
});

describe("hebrewLastDayOfMonth", () => {
  it("gives 29 days to the always-short months", () => {
    for (const y of [5785, 5786, 5787, 5788]) {
      for (const m of [IYAR, TAMMUZ, ELUL, TEVET]) {
        expect(hebrewLastDayOfMonth(m, y)).toBe(29);
      }
    }
  });

  it("gives 30 days to the always-long months", () => {
    for (const y of [5785, 5786, 5787, 5788]) {
      for (const m of [NISAN, SIVAN, AV, TISHREI, SHVAT]) {
        expect(hebrewLastDayOfMonth(m, y)).toBe(30);
      }
    }
  });

  it("splits Adar into a 30-day Adar I and a 29-day Adar II in a leap year", () => {
    expect(isHebrewLeap(5787)).toBe(true);
    expect(hebrewLastDayOfMonth(ADAR, 5787)).toBe(30);
    expect(hebrewLastDayOfMonth(ADAR_II, 5787)).toBe(29);
  });

  it("gives a plain year a single 29-day Adar", () => {
    expect(isHebrewLeap(5786)).toBe(false);
    expect(hebrewLastDayOfMonth(ADAR, 5786)).toBe(29);
  });

  it("varies Cheshvan and Kislev between 29 and 30 days", () => {
    const cheshvan = new Set<number>();
    const kislev = new Set<number>();
    for (let y = 5780; y <= 5820; y++) {
      cheshvan.add(hebrewLastDayOfMonth(CHESHVAN, y));
      kislev.add(hebrewLastDayOfMonth(KISLEV, y));
    }
    expect([...cheshvan].sort()).toEqual([29, 30]);
    expect([...kislev].sort()).toEqual([29, 30]);
  });

  it("never reports a month outside 29–30 days", () => {
    for (let y = 5700; y <= 5900; y++) {
      for (let m = 1; m <= hebrewMonthsInYear(y); m++) {
        const len = hebrewLastDayOfMonth(m, y);
        expect(len === 29 || len === 30).toBe(true);
      }
    }
  });

  it("adds up to one of the six legal Hebrew year lengths", () => {
    // 353/354/355 for a plain year, 383/384/385 for a leap year — no others exist.
    const seen = new Set<number>();
    for (let y = 5700; y <= 5900; y++) {
      let total = 0;
      for (let m = 1; m <= hebrewMonthsInYear(y); m++) total += hebrewLastDayOfMonth(m, y);
      expect(isHebrewLeap(y) ? [383, 384, 385] : [353, 354, 355]).toContain(total);
      seen.add(total);
    }
    expect([...seen].sort((a, b) => a - b)).toEqual([353, 354, 355, 383, 384, 385]);
  });
});

// ============================================================================
// Gregorian <-> Hebrew conversion
// ============================================================================

describe("hebrewFromGregorian", () => {
  // Anchors cross-checked against the real Hebrew calendar, not against this
  // implementation. An epoch that is off by a day — which this module shipped
  // with until the constant was corrected — breaks every one of these.
  const ANCHORS: Array<[string, number, number, number]> = [
    ["2024-10-03", 5785, TISHREI, 1], // ר״ה תשפ״ה, Thursday
    ["2024-10-12", 5785, TISHREI, 10], // יו״כ תשפ״ה, Shabbat
    ["2025-09-23", 5786, TISHREI, 1], // ר״ה תשפ״ו, Tuesday
    ["2025-10-02", 5786, TISHREI, 10], // יו״כ תשפ״ו, Thursday
    ["2025-10-07", 5786, TISHREI, 15], // סוכות תשפ״ו, Tuesday
    ["2025-12-30", 5786, TEVET, 10], // עשרה בטבת
    ["2026-03-02", 5786, ADAR, 13], // תענית אסתר
    ["2026-03-03", 5786, ADAR, 14], // פורים
    ["2026-04-02", 5786, NISAN, 15], // פסח תשפ״ו, Thursday
    ["2026-05-22", 5786, SIVAN, 6], // שבועות תשפ״ו
    ["2026-07-02", 5786, TAMMUZ, 17], // י״ז בתמוז
    ["2026-07-23", 5786, AV, 9], // ט׳ באב
    ["2026-09-11", 5786, ELUL, 29], // ערב ר״ה
    ["2026-09-12", 5787, TISHREI, 1], // ר״ה תשפ״ז, Shabbat
    ["2026-09-21", 5787, TISHREI, 10], // יו״כ תשפ״ז, Monday
    ["2026-12-20", 5787, TEVET, 10],
  ];

  it.each(ANCHORS)("maps %s to %i-%i-%i", (gregorian, year, month, day) => {
    expect(hebrewFromGregorian(d(gregorian))).toEqual({ year, month, day });
  });

  it("advances by exactly one Hebrew day per Gregorian day, 2000–2050", () => {
    const cur = d("2000-01-01");
    const end = d("2050-12-31");
    let prev = hebrewFromGregorian(cur);
    let days = 0;
    while (cur < end) {
      cur.setDate(cur.getDate() + 1);
      const expected = nextHebrew(prev);
      const actual = hebrewFromGregorian(cur);
      if (
        actual.year !== expected.year ||
        actual.month !== expected.month ||
        actual.day !== expected.day
      ) {
        throw new Error(
          `${iso(cur)}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
        );
      }
      prev = actual;
      days++;
    }
    expect(days).toBeGreaterThan(18_000);
  });

  it("never returns a day or month outside the year's own bounds", () => {
    const cur = d("2020-01-01");
    const end = d("2035-12-31");
    while (cur <= end) {
      const h = hebrewFromGregorian(cur);
      expect(h.month).toBeGreaterThanOrEqual(1);
      expect(h.month).toBeLessThanOrEqual(hebrewMonthsInYear(h.year));
      expect(h.day).toBeGreaterThanOrEqual(1);
      expect(h.day).toBeLessThanOrEqual(hebrewLastDayOfMonth(h.month, h.year));
      cur.setDate(cur.getDate() + 1);
    }
  });

  it("ignores the time of day", () => {
    const morning = new Date(2026, 6, 8, 0, 1);
    const night = new Date(2026, 6, 8, 23, 59);
    expect(hebrewFromGregorian(morning)).toEqual(hebrewFromGregorian(night));
  });
});

describe("weekday rules of the fixed calendar", () => {
  // These are the dehiyyot — the postponement rules that decide which weekdays
  // each festival can fall on. They hold for every year, so a calendar that
  // breaks any of them is wrong regardless of which anchor you spot-check.
  it("never puts Rosh Hashana on Sunday, Wednesday or Friday (לא אד״ו ראש)", () => {
    const violations: string[] = [];
    for (let y = 5750; y <= 5850; y++) {
      const date = gregorianOf(y, TISHREI, 1, y - 3762);
      if ([SUN, WED, FRI].includes(date.getDay())) {
        violations.push(`${y}: ${iso(date)} ${DOW[date.getDay()]}`);
      }
    }
    expect(violations).toEqual([]);
  });

  it("never puts Yom Kippur on Friday or Sunday", () => {
    for (let y = 5750; y <= 5850; y++) {
      const date = gregorianOf(y, TISHREI, 10, y - 3762);
      expect([FRI, SUN]).not.toContain(date.getDay());
    }
  });

  it("never puts the first day of Pesach on Monday, Wednesday or Friday", () => {
    for (let y = 5750; y <= 5850; y++) {
      const date = gregorianOf(y, NISAN, 15, y - 3761);
      expect([MON, WED, FRI]).not.toContain(date.getDay());
    }
  });

  it("never puts Shavuot on Tuesday, Thursday or Shabbat", () => {
    for (let y = 5750; y <= 5850; y++) {
      const date = gregorianOf(y, SIVAN, 6, y - 3761);
      expect([TUE, THU, SAT]).not.toContain(date.getDay());
    }
  });

  it("puts the first day of Pesach two weekdays after Purim", () => {
    // 14 Adar (or Adar II) to 15 Nisan is always 30 days, whichever kind of
    // year it is — so the weekday gap is fixed at two.
    for (let y = 5784; y <= 5800; y++) {
      const adar = isHebrewLeap(y) ? ADAR_II : ADAR;
      const purim = gregorianOf(y, adar, 14, y - 3762);
      const pesach = gregorianOf(y, NISAN, 15, y - 3762);
      expect(DOW[pesach.getDay()]).toBe(DOW[(purim.getDay() + 2) % 7]);
    }
  });

  it("keeps Purim and Lag BaOmer on the same weekday", () => {
    // 14 Adar to 18 Iyar is 63 days — exactly nine weeks.
    for (let y = 5784; y <= 5800; y++) {
      const adar = isHebrewLeap(y) ? ADAR_II : ADAR;
      const purim = gregorianOf(y, adar, 14, y - 3762);
      const lagBaomer = gregorianOf(y, IYAR, 18, y - 3762);
      expect(DOW[lagBaomer.getDay()]).toBe(DOW[purim.getDay()]);
    }
  });

  it("puts Yom Kippur two weekdays after Rosh Hashana", () => {
    for (let y = 5750; y <= 5850; y++) {
      const rh = gregorianOf(y, TISHREI, 1, y - 3762);
      const yk = gregorianOf(y, TISHREI, 10, y - 3762);
      expect(DOW[yk.getDay()]).toBe(DOW[(rh.getDay() + 2) % 7]);
    }
  });
});

// ============================================================================
// Hebrew-letter formatting
// ============================================================================

describe("hebrewDayLetters", () => {
  it("formats single-letter days with a geresh", () => {
    expect(hebrewDayLetters(1)).toBe("א׳");
    expect(hebrewDayLetters(9)).toBe("ט׳");
    expect(hebrewDayLetters(10)).toBe("י׳");
    expect(hebrewDayLetters(20)).toBe("כ׳");
    expect(hebrewDayLetters(30)).toBe("ל׳");
  });

  it("formats multi-letter days with a gershayim before the last letter", () => {
    expect(hebrewDayLetters(11)).toBe("י״א");
    expect(hebrewDayLetters(14)).toBe("י״ד");
    expect(hebrewDayLetters(17)).toBe("י״ז");
    expect(hebrewDayLetters(21)).toBe("כ״א");
    expect(hebrewDayLetters(29)).toBe("כ״ט");
  });

  it("writes 15 and 16 as ט״ו / ט״ז rather than spelling the Name", () => {
    expect(hebrewDayLetters(15)).toBe("ט״ו");
    expect(hebrewDayLetters(16)).toBe("ט״ז");
  });

  it("returns an empty string for a non-positive day", () => {
    expect(hebrewDayLetters(0)).toBe("");
    expect(hebrewDayLetters(-3)).toBe("");
  });

  it("produces a distinct label for every day a Hebrew month can have", () => {
    const labels = new Set<string>();
    for (let day = 1; day <= 30; day++) labels.add(hebrewDayLetters(day));
    expect(labels.size).toBe(30);
  });
});

describe("hebrewYearLetters", () => {
  it("drops the thousands and formats the remainder", () => {
    expect(hebrewYearLetters(5786)).toBe("תשפ״ו");
    expect(hebrewYearLetters(5787)).toBe("תשפ״ז");
    expect(hebrewYearLetters(5785)).toBe("תשפ״ה");
  });

  it("handles hundreds without a tens or units part", () => {
    expect(hebrewYearLetters(5400)).toBe("ת׳");
    expect(hebrewYearLetters(5100)).toBe("ק׳");
  });

  it("keeps the 15/16 substitution inside a larger number", () => {
    expect(hebrewYearLetters(5115)).toBe("קט״ו");
    expect(hebrewYearLetters(5116)).toBe("קט״ז");
  });
});

describe("hebrewMonthName", () => {
  it("names the twelve months of a plain year", () => {
    expect(isHebrewLeap(5786)).toBe(false);
    const names = [];
    for (let m = 1; m <= 12; m++) names.push(hebrewMonthName(m, 5786));
    expect(names).toEqual([
      "ניסן",
      "אייר",
      "סיון",
      "תמוז",
      "אב",
      "אלול",
      "תשרי",
      "חשון",
      "כסלו",
      "טבת",
      "שבט",
      "אדר",
    ]);
  });

  it("splits Adar in a leap year", () => {
    expect(isHebrewLeap(5787)).toBe(true);
    expect(hebrewMonthName(ADAR, 5787)).toBe("אדר א׳");
    expect(hebrewMonthName(ADAR_II, 5787)).toBe("אדר ב׳");
  });

  it("keeps a plain year's Adar unqualified", () => {
    expect(hebrewMonthName(ADAR, 5786)).toBe("אדר");
  });
});

describe("formatHebrewDate / formatHebrewMonthYear", () => {
  it("renders day, month and year in Hebrew letters", () => {
    expect(formatHebrewDate(d("2026-07-08"))).toBe("כ״ג תמוז תשפ״ו");
    expect(formatHebrewDate(d("2026-09-12"))).toBe("א׳ תשרי תשפ״ז");
    expect(formatHebrewDate(d("2025-10-07"))).toBe("ט״ו תשרי תשפ״ו");
  });

  it("renders a month/year heading without a day", () => {
    expect(formatHebrewMonthYear({ year: 5786, month: TAMMUZ, day: 1 })).toBe("תמוז תשפ״ו");
    expect(formatHebrewMonthYear({ year: 5787, month: ADAR, day: 20 })).toBe("אדר א׳ תשפ״ז");
  });

  it("never emits an empty component for a real date", () => {
    const cur = d("2026-01-01");
    while (cur.getFullYear() === 2026) {
      const parts = formatHebrewDate(cur).split(" ");
      expect(parts.length).toBeGreaterThanOrEqual(3);
      for (const p of parts) expect(p.length).toBeGreaterThan(0);
      cur.setDate(cur.getDate() + 1);
    }
  });
});

// ============================================================================
// Kollel schedule predicates
// ============================================================================

describe("isWeekend", () => {
  it("treats Friday and Saturday as weekend", () => {
    expect(isWeekend(d("2026-07-10"))).toBe(true); // Friday
    expect(isWeekend(d("2026-07-11"))).toBe(true); // Saturday
  });

  it("does not treat Sunday–Thursday as weekend", () => {
    for (const day of ["2026-07-05", "2026-07-06", "2026-07-07", "2026-07-08", "2026-07-09"]) {
      expect(isWeekend(d(day))).toBe(false);
    }
  });

  it("flags exactly two days of every week", () => {
    const cur = d("2026-01-04"); // a Sunday
    for (let week = 0; week < 52; week++) {
      let count = 0;
      for (let i = 0; i < 7; i++) {
        if (isWeekend(cur)) count++;
        cur.setDate(cur.getDate() + 1);
      }
      expect(count).toBe(2);
    }
  });
});

describe("isYomTov", () => {
  const YOM_TOV = [
    ["2026-09-12", "ראש השנה א׳"],
    ["2026-09-13", "ראש השנה ב׳"],
    ["2026-09-21", "יום כיפור"],
    ["2026-09-26", "סוכות א׳"],
    ["2026-10-03", "שמיני עצרת"],
    ["2026-04-02", "פסח א׳"],
    ["2026-04-08", "שביעי של פסח"],
    ["2026-05-22", "שבועות"],
  ] as const;

  it.each(YOM_TOV)("recognizes %s (%s)", (date) => {
    expect(isYomTov(d(date))).toBe(true);
    expect(isErevYomTov(d(date))).toBe(false);
  });

  it("does not flag Chol HaMoed as Yom Tov", () => {
    // 17–20 Nisan 5786 — the intermediate days of Pesach.
    for (const date of ["2026-04-04", "2026-04-05", "2026-04-06", "2026-04-07"]) {
      expect(isYomTov(d(date))).toBe(false);
    }
  });

  it("does not flag Purim or Chanuka as Yom Tov", () => {
    expect(isYomTov(d("2026-03-03"))).toBe(false); // פורים
    expect(isYomTov(d("2025-12-15"))).toBe(false); // חנוכה
  });

  it("does not flag an ordinary midweek day", () => {
    expect(isYomTov(d("2026-07-08"))).toBe(false);
    expect(isErevYomTov(d("2026-07-08"))).toBe(false);
  });

  it("counts 8 Yom Tov days in every Hebrew year", () => {
    // 2 × ר״ה, יו״כ, סוכות א׳, שמיני עצרת, פסח א׳, שביעי של פסח, שבועות.
    const perYear = new Map<number, number>();
    const cur = d("2025-01-01");
    while (cur.getFullYear() <= 2035) {
      if (isYomTov(cur)) {
        const y = hebrewFromGregorian(cur).year;
        perYear.set(y, (perYear.get(y) ?? 0) + 1);
      }
      cur.setDate(cur.getDate() + 1);
    }
    // Trim the partial years at either end of the scan.
    const complete = [...perYear.entries()].slice(1, -1);
    expect(complete.length).toBeGreaterThan(8);
    for (const [, count] of complete) expect(count).toBe(8);
  });
});

describe("isErevYomTov", () => {
  const EREV = [
    ["2026-09-11", "ערב ראש השנה"],
    ["2026-09-20", "ערב יום כיפור"],
    ["2026-09-25", "ערב סוכות"],
    ["2026-04-01", "ערב פסח"],
    ["2026-05-21", "ערב שבועות"],
  ] as const;

  it.each(EREV)("recognizes %s (%s)", (date) => {
    expect(isErevYomTov(d(date))).toBe(true);
    expect(isYomTov(d(date))).toBe(false);
  });

  it("always sits the day before a Yom Tov", () => {
    const cur = d("2025-01-01");
    while (cur.getFullYear() <= 2032) {
      if (isErevYomTov(cur)) {
        const next = new Date(cur);
        next.setDate(next.getDate() + 1);
        expect(isYomTov(next)).toBe(true);
      }
      cur.setDate(cur.getDate() + 1);
    }
  });

  it("counts 5 Erev Yom Tov days in every Hebrew year", () => {
    const perYear = new Map<number, number>();
    const cur = d("2025-01-01");
    while (cur.getFullYear() <= 2035) {
      if (isErevYomTov(cur)) {
        const y = hebrewFromGregorian(cur).year;
        perYear.set(y, (perYear.get(y) ?? 0) + 1);
      }
      cur.setDate(cur.getDate() + 1);
    }
    const complete = [...perYear.entries()].slice(1, -1);
    expect(complete.length).toBeGreaterThan(8);
    for (const [, count] of complete) expect(count).toBe(5);
  });

  it("does not treat Erev Shabbat as Erev Yom Tov", () => {
    expect(isErevYomTov(d("2026-07-10"))).toBe(false); // an ordinary Friday
  });
});

describe("isLearningDay", () => {
  it("is false on weekends", () => {
    expect(isLearningDay(d("2026-07-10"))).toBe(false); // Friday
    expect(isLearningDay(d("2026-07-11"))).toBe(false); // Saturday
  });

  it("is false on Yom Tov and Erev Yom Tov", () => {
    expect(isLearningDay(d("2026-09-21"))).toBe(false); // יום כיפור
    expect(isLearningDay(d("2026-09-20"))).toBe(false); // ערב יום כיפור
  });

  it("is true on an ordinary weekday", () => {
    expect(isLearningDay(d("2026-07-08"))).toBe(true); // Wednesday, nothing special
  });

  it("stays true on Chol HaMoed and during Bein HaZmanim", () => {
    // Deliberate: those are reduced-schedule days, not days off.
    expect(isLearningDay(d("2026-04-06"))).toBe(true); // חול המועד פסח, Monday
    expect(isBeinHazmanim(d("2026-04-06"))).toBe(true);
    expect(isLearningDay(d("2026-08-03"))).toBe(true); // בין הזמנים אב, Monday
    expect(isBeinHazmanim(d("2026-08-03"))).toBe(true);
  });

  it("stays true on a fast day", () => {
    // Only Seder ב׳ drops — see hasNoSederB.
    expect(isLearningDay(d("2026-07-02"))).toBe(true); // י״ז בתמוז, Thursday
    expect(isFastDay(d("2026-07-02"))).toBe(true);
  });

  it("agrees with its three components on every day of a year", () => {
    const cur = d("2026-01-01");
    while (cur.getFullYear() === 2026) {
      expect(isLearningDay(cur)).toBe(!isWeekend(cur) && !isYomTov(cur) && !isErevYomTov(cur));
      cur.setDate(cur.getDate() + 1);
    }
  });
});

// ============================================================================
// Bein HaZmanim
// ============================================================================

describe("isBeinHazmanim", () => {
  it("covers Nisan in full", () => {
    expect(isBeinHazmanim(d("2026-03-19"))).toBe(true); // א׳ ניסן
    expect(isBeinHazmanim(d("2026-04-17"))).toBe(true); // ל׳ ניסן
    expect(isBeinHazmanim(d("2026-03-18"))).toBe(false); // כ״ט אדר
    expect(isBeinHazmanim(d("2026-04-18"))).toBe(false); // א׳ אייר
  });

  it("covers Av from the 10th onwards", () => {
    expect(isBeinHazmanim(d("2026-07-23"))).toBe(false); // ט׳ באב
    expect(isBeinHazmanim(d("2026-07-24"))).toBe(true); // י׳ באב
    expect(isBeinHazmanim(d("2026-08-13"))).toBe(true); // ל׳ אב
    expect(isBeinHazmanim(d("2026-08-14"))).toBe(false); // א׳ אלול
  });

  it("covers Tishrei from the 11th onwards", () => {
    expect(isBeinHazmanim(d("2026-09-21"))).toBe(false); // י׳ תשרי — יו״כ
    expect(isBeinHazmanim(d("2026-09-22"))).toBe(true); // י״א תשרי
    expect(isBeinHazmanim(d("2026-10-11"))).toBe(true); // ל׳ תשרי
    expect(isBeinHazmanim(d("2026-10-12"))).toBe(false); // א׳ חשון
  });

  it("is false through the months of the regular zman", () => {
    for (const date of ["2026-05-10", "2026-06-10", "2026-11-10", "2026-12-10", "2026-02-10"]) {
      expect(isBeinHazmanim(d(date))).toBe(false);
    }
  });

  it("only ever covers Nisan, Av and Tishrei", () => {
    const months = new Set<number>();
    const cur = d("2025-01-01");
    while (cur.getFullYear() <= 2030) {
      if (isBeinHazmanim(cur)) months.add(hebrewFromGregorian(cur).month);
      cur.setDate(cur.getDate() + 1);
    }
    expect([...months].sort((a, b) => a - b)).toEqual([NISAN, AV, TISHREI]);
  });
});

// ============================================================================
// Fast days
// ============================================================================

describe("fastDayName", () => {
  const FASTS_5786: Array<[string, string]> = [
    ["2025-12-30", "עשרה בטבת"],
    ["2026-03-02", "תענית אסתר"],
    ["2026-04-01", "תענית בכורות"],
    ["2026-07-02", "שבעה עשר בתמוז"],
    ["2026-07-23", "תשעה באב"],
  ];

  it.each(FASTS_5786)("names the fast on %s", (date, name) => {
    expect(fastDayName(d(date))).toBe(name);
    expect(isFastDay(d(date))).toBe(true);
  });

  it("names צום גדליה on 3 Tishrei", () => {
    expect(fastDayName(d("2026-09-14"))).toBe("צום גדליה");
  });

  it("returns null on an ordinary day", () => {
    expect(fastDayName(d("2026-07-08"))).toBe(null);
    expect(isFastDay(d("2026-07-08"))).toBe(false);
  });

  it("never places a fast on Shabbat", () => {
    // Yom Kippur is the one fast kept on Shabbat, and it is not in this list.
    const onShabbat: string[] = [];
    const cur = d("2024-01-01");
    while (cur.getFullYear() <= 2044) {
      if (cur.getDay() === SAT && fastDayName(cur))
        onShabbat.push(`${iso(cur)} ${fastDayName(cur)}`);
      cur.setDate(cur.getDate() + 1);
    }
    expect(onShabbat).toEqual([]);
  });

  it("marks exactly 6 fast days in every Hebrew year", () => {
    const perYear = new Map<number, number>();
    const cur = d("2024-01-01");
    while (cur.getFullYear() <= 2044) {
      if (fastDayName(cur)) {
        const y = hebrewFromGregorian(cur).year;
        perYear.set(y, (perYear.get(y) ?? 0) + 1);
      }
      cur.setDate(cur.getDate() + 1);
    }
    const complete = [...perYear.entries()].slice(1, -1);
    expect(complete.length).toBeGreaterThan(15);
    for (const [year, count] of complete) {
      expect(count, `Hebrew year ${year}`).toBe(6);
    }
  });

  describe("postponements", () => {
    it("moves צום גדליה to Sunday when 3 Tishrei is Shabbat", () => {
      expect(d("2024-10-05").getDay()).toBe(SAT);
      expect(hebrewFromGregorian(d("2024-10-05"))).toEqual({ year: 5785, month: TISHREI, day: 3 });
      expect(fastDayName(d("2024-10-05"))).toBe(null);
      expect(fastDayName(d("2024-10-06"))).toBe("צום גדליה (נדחה)");
    });

    it("moves י״ז בתמוז to Sunday when it is Shabbat", () => {
      expect(hebrewFromGregorian(d("2029-06-30"))).toEqual({ year: 5789, month: TAMMUZ, day: 17 });
      expect(d("2029-06-30").getDay()).toBe(SAT);
      expect(fastDayName(d("2029-06-30"))).toBe(null);
      expect(fastDayName(d("2029-07-01"))).toBe("שבעה עשר בתמוז (נדחה)");
    });

    it("moves תשעה באב to Sunday when it is Shabbat", () => {
      expect(hebrewFromGregorian(d("2029-07-21"))).toEqual({ year: 5789, month: AV, day: 9 });
      expect(d("2029-07-21").getDay()).toBe(SAT);
      expect(fastDayName(d("2029-07-21"))).toBe(null);
      expect(fastDayName(d("2029-07-22"))).toBe("תשעה באב (נדחה)");
    });

    it("brings תענית אסתר forward to Thursday when 13 Adar is Shabbat", () => {
      expect(hebrewFromGregorian(d("2024-03-23"))).toEqual({ year: 5784, month: ADAR_II, day: 13 });
      expect(d("2024-03-23").getDay()).toBe(SAT);
      expect(fastDayName(d("2024-03-23"))).toBe(null);
      expect(fastDayName(d("2024-03-21"))).toBe("תענית אסתר (מוקדם)");
      expect(d("2024-03-21").getDay()).toBe(THU);
    });

    it("brings תענית בכורות forward to Thursday when 14 Nisan is Shabbat", () => {
      expect(hebrewFromGregorian(d("2025-04-12"))).toEqual({ year: 5785, month: NISAN, day: 14 });
      expect(d("2025-04-12").getDay()).toBe(SAT);
      expect(fastDayName(d("2025-04-12"))).toBe(null);
      expect(fastDayName(d("2025-04-10"))).toBe("תענית בכורות (מוקדם)");
    });

    it("keeps עשרה בטבת on its own day even on Friday — it is never postponed", () => {
      expect(hebrewFromGregorian(d("2025-01-10"))).toEqual({ year: 5785, month: TEVET, day: 10 });
      expect(d("2025-01-10").getDay()).toBe(FRI);
      expect(fastDayName(d("2025-01-10"))).toBe("עשרה בטבת");
    });

    it("reads תענית אסתר off Adar II in a leap year", () => {
      expect(isHebrewLeap(5787)).toBe(true);
      const adarI13 = gregorianOf(5787, ADAR, 13, 2027);
      const adarII13 = gregorianOf(5787, ADAR_II, 13, 2027);
      expect(fastDayName(adarI13)).toBe(null);
      expect(fastDayName(adarII13)).toBe("תענית אסתר");
    });
  });
});

describe("hasNoSederB", () => {
  it("drops Seder ב׳ on a fast day", () => {
    expect(hasNoSederB(d("2026-07-23"))).toBe(true); // ט׳ באב
    expect(hasNoSederB(d("2025-12-30"))).toBe(true); // עשרה בטבת
  });

  it("keeps Seder ב׳ on an ordinary day", () => {
    expect(hasNoSederB(d("2026-07-08"))).toBe(false);
  });

  it("tracks isFastDay exactly", () => {
    const cur = d("2026-01-01");
    while (cur.getFullYear() === 2026) {
      expect(hasNoSederB(cur)).toBe(isFastDay(cur));
      cur.setDate(cur.getDate() + 1);
    }
  });
});

describe("defaults to today", () => {
  it("accepts no argument", () => {
    // Only that they run and return the right type — the value depends on when
    // the suite happens to be run.
    expect(typeof isWeekend()).toBe("boolean");
    expect(typeof isYomTov()).toBe("boolean");
    expect(typeof isErevYomTov()).toBe("boolean");
    expect(typeof isLearningDay()).toBe("boolean");
    expect(typeof isBeinHazmanim()).toBe("boolean");
    expect(typeof isFastDay()).toBe("boolean");
    expect(typeof hasNoSederB()).toBe("boolean");
    const name = fastDayName();
    expect(name === null || typeof name === "string").toBe(true);
  });
});
