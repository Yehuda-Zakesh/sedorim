// generateInsights and the two scores beside it. Each insight has its own
// threshold, so the tests below drive one at a time and check both that it
// fires when it should and that it stays quiet when it should not.
//
// Everything is pinned to Wednesday 15 July 2026. July 2026 has 22 learning
// days (Sun–Thu, no Yom Tov), 11 of them on or before the 15th:
//   Wed 1, Thu 2, Sun 5, Mon 6, Tue 7, Wed 8, Thu 9, Sun 12, Mon 13, Tue 14, Wed 15
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  fmtMin,
  generateInsights,
  forecastMonthlyNetMissing,
  consistencyScore,
  type Insight,
} from "./insights";
import {
  hhmmToMin,
  replaceAllData,
  getSederSnapshot,
  getLearningSnapshot,
  type SederEntry,
  type LearningEntry,
  type LearningFramework,
} from "./kollel-store";
import { DEFAULT_SETTINGS, resetSettings } from "./settings-store";

const { s1Start, s1End, s2Start, s2End, bonusThresholdMin } = DEFAULT_SETTINGS.seder;
const s1StartMin = hhmmToMin(s1Start)!;
const s1EndMin = hhmmToMin(s1End)!;
const s1LengthMin = s1EndMin - s1StartMin;

const GOALS = { monthlyTarget: 95, maxLatePerMonth: 3, alertMissingMinPerMonth: 180 };

/** Learning days of July 2026 up to and including the pinned "today". */
const JULY = ["01", "02", "05", "06", "07", "08", "09", "12", "13", "14", "15"].map(
  (d) => `2026-07-${d}`,
);
/** Learning days of June 2026, for the "previous month" comparisons. */
const JUNE = [
  "01",
  "02",
  "03",
  "04",
  "07",
  "08",
  "09",
  "10",
  "11",
  "14",
  "15",
  "16",
  "17",
  "18",
].map((d) => `2026-06-${d}`);

function hhmm(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

function entry(date: string, over: Partial<SederEntry> = {}): SederEntry {
  return {
    id: `${date}-${over.seder ?? 1}-${over.absent ? "a" : "p"}`,
    date,
    seder: 1,
    absent: false,
    ohevei: false,
    excusedAll: false,
    excusedMinutes: 0,
    manualAdjustMin: 0,
    tags: [],
    ...over,
  };
}

const perfect = (date: string, over: Partial<SederEntry> = {}) =>
  entry(date, {
    arrival: (over.seder ?? 1) === 1 ? s1Start : s2Start,
    departure: (over.seder ?? 1) === 1 ? s1End : s2End,
    ...over,
  });

const lateBy = (date: string, minutes: number, over: Partial<SederEntry> = {}) =>
  entry(date, { arrival: hhmm(s1StartMin + minutes), departure: s1End, ...over });

const absent = (date: string, over: Partial<SederEntry> = {}) =>
  entry(date, { absent: true, ...over });

function lesson(over: Partial<LearningEntry> = {}): LearningEntry {
  return {
    id: `l-${Math.random().toString(36).slice(2, 9)}`,
    framework: "kollel-erev",
    date: "2026-07-08",
    minutes: 60,
    source: "manual",
    ...over,
  };
}

/** Loads the store, then generates over exactly what the store now holds. */
function run(entries: SederEntry[], lessons: LearningEntry[] = [], goals = GOALS): Insight[] {
  replaceAllData(entries, lessons);
  return generateInsights(getSederSnapshot(), getLearningSnapshot(), goals);
}
const ids = (...args: Parameters<typeof run>) => run(...args).map((i) => i.id);

beforeEach(() => {
  resetSettings();
  replaceAllData([], []);
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 6, 15, 18, 0)); // Wed 15 July 2026
});

afterEach(() => {
  vi.useRealTimers();
});

// ============================================================================
// fmtMin
// ============================================================================

describe("fmtMin", () => {
  it("formats under an hour as minutes", () => {
    expect(fmtMin(0)).toBe("0 דק׳");
    expect(fmtMin(1)).toBe("1 דק׳");
    expect(fmtMin(45)).toBe("45 דק׳");
    expect(fmtMin(59)).toBe("59 דק׳");
  });

  it("formats exact hours without a minutes remainder", () => {
    expect(fmtMin(60)).toBe("1 שע׳");
    expect(fmtMin(120)).toBe("2 שע׳");
    expect(fmtMin(600)).toBe("10 שע׳");
  });

  it("formats hours + minutes as H:MM", () => {
    expect(fmtMin(90)).toBe("1:30 שע׳");
    expect(fmtMin(125)).toBe("2:05 שע׳");
    expect(fmtMin(61)).toBe("1:01 שע׳");
  });

  it("zero-pads the minutes so the colon form never reads as 1:5", () => {
    expect(fmtMin(65)).toBe("1:05 שע׳");
    expect(fmtMin(305)).toBe("5:05 שע׳");
  });

  it("never mixes the two units in one string", () => {
    for (let m = 0; m <= 600; m++) {
      const out = fmtMin(m);
      expect(out.includes("דק׳") && out.includes("שע׳"), String(m)).toBe(false);
    }
  });
});

// ============================================================================
// generateInsights — the empty case
// ============================================================================

describe("generateInsights with no records this month", () => {
  it("returns only the prompt to start recording", () => {
    expect(ids([], [])).toEqual(["no-data"]);
  });

  it("says so even when earlier months have records", () => {
    expect(
      ids(
        JUNE.map((d) => perfect(d)),
        [],
      ),
    ).toEqual(["no-data"]);
  });

  it("marks it as a recommendation, not a warning", () => {
    const [insight] = run([], []);
    expect(insight.category).toBe("recommendation");
    expect(insight.tone).toBe("info");
  });
});

// ============================================================================
// Goals
// ============================================================================

describe("the monthly target", () => {
  it("celebrates a score at or above the target", () => {
    const list = ids(JULY.slice(0, 6).map((d) => perfect(d)));
    expect(list).toContain("goal-met");
    expect(list).not.toContain("goal-gap");
  });

  it("reports the gap when the score falls short", () => {
    const entries = [absent(JULY[0]), ...JULY.slice(1, 6).map((d) => perfect(d))];
    const list = ids(entries);
    expect(list).toContain("goal-gap");
    expect(list).not.toContain("goal-met");
  });

  it("names the number of points still missing", () => {
    const entries = [absent(JULY[0]), ...JULY.slice(1, 6).map((d) => perfect(d))];
    const gap = run(entries).find((i) => i.id === "goal-gap")!;
    expect(gap.title).toMatch(/^\d+ נקודות עד היעד החודשי$/);
  });

  it("stays quiet about the gap until there are five records", () => {
    const entries = [absent(JULY[0]), ...JULY.slice(1, 4).map((d) => perfect(d))];
    const list = ids(entries);
    expect(list).not.toContain("goal-gap");
    expect(list).not.toContain("goal-met");
  });

  it("follows a target the user has lowered", () => {
    const entries = [absent(JULY[0]), ...JULY.slice(1, 6).map((d) => perfect(d))];
    expect(ids(entries, [], { ...GOALS, monthlyTarget: 50 })).toContain("goal-met");
  });
});

// ============================================================================
// Lateness
// ============================================================================

describe("the lateness quota", () => {
  it("warns one late arrival before the quota is reached", () => {
    const list = ids([
      lateBy(JULY[0], 10),
      lateBy(JULY[1], 10),
      ...JULY.slice(2, 6).map((d) => perfect(d)),
    ]);
    expect(list).toContain("late-warn");
    expect(list).not.toContain("late-limit");
  });

  it("reports the quota crossed once it is reached", () => {
    const list = ids([
      lateBy(JULY[0], 10),
      lateBy(JULY[1], 10),
      lateBy(JULY[2], 10),
      ...JULY.slice(3, 6).map((d) => perfect(d)),
    ]);
    expect(list).toContain("late-limit");
    expect(list).not.toContain("late-warn");
  });

  it("keeps reporting it past the quota", () => {
    expect(
      ids([
        lateBy(JULY[0], 10),
        lateBy(JULY[1], 10),
        lateBy(JULY[2], 10),
        lateBy(JULY[3], 10),
        ...JULY.slice(4, 7).map((d) => perfect(d)),
      ]),
    ).toContain("late-limit");
  });

  it("says nothing for a single late arrival", () => {
    const list = ids([lateBy(JULY[0], 10), ...JULY.slice(1, 6).map((d) => perfect(d))]);
    expect(list).not.toContain("late-warn");
    expect(list).not.toContain("late-limit");
  });

  it("marks the quota being crossed as destructive", () => {
    const insight = run([lateBy(JULY[0], 10), lateBy(JULY[1], 10), lateBy(JULY[2], 10)]).find(
      (i) => i.id === "late-limit",
    )!;
    expect(insight.tone).toBe("destructive");
  });
});

// ============================================================================
// Missing minutes
// ============================================================================

describe("the missing-minutes alert", () => {
  it("fires once net missing reaches the threshold", () => {
    // One unexcused absence is a whole seder — comfortably past 180.
    expect(s1LengthMin).toBeGreaterThanOrEqual(180);
    expect(ids([absent(JULY[0]), ...JULY.slice(1, 4).map((d) => perfect(d))])).toContain(
      "missing-alert",
    );
  });

  it("stays quiet below the threshold", () => {
    expect(ids([lateBy(JULY[0], 30), ...JULY.slice(1, 4).map((d) => perfect(d))])).not.toContain(
      "missing-alert",
    );
  });

  it("counts excused minutes as not missing", () => {
    expect(
      ids([absent(JULY[0], { excusedAll: true }), ...JULY.slice(1, 4).map((d) => perfect(d))]),
    ).not.toContain("missing-alert");
  });

  it("follows a threshold the user has tightened", () => {
    expect(
      ids([lateBy(JULY[0], 30), ...JULY.slice(1, 4).map((d) => perfect(d))], [], {
        ...GOALS,
        alertMissingMinPerMonth: 20,
      }),
    ).toContain("missing-alert");
  });
});

// ============================================================================
// Positive trends
// ============================================================================

describe("bonus minutes", () => {
  it("are called out once an hour of them has been earned", () => {
    const early = JULY.slice(0, 4).map((d) =>
      perfect(d, { arrival: hhmm(s1StartMin - bonusThresholdMin) }),
    );
    expect(bonusThresholdMin * 4).toBeGreaterThanOrEqual(60);
    expect(ids(early)).toContain("bonus-great");
  });

  it("are not called out below an hour", () => {
    expect(ids([perfect(JULY[0], { arrival: hhmm(s1StartMin - 5) })])).not.toContain("bonus-great");
  });
});

describe("אוהבי ה׳ sedarim", () => {
  it("are called out from five upwards", () => {
    const list = JULY.slice(0, 5).map((d) => perfect(d, { ohevei: true }));
    expect(ids(list)).toContain("ohevei");
  });

  it("are not called out at four", () => {
    expect(ids(JULY.slice(0, 4).map((d) => perfect(d, { ohevei: true })))).not.toContain("ohevei");
  });

  it("only counts the ones that actually qualify", () => {
    // The flag is set on all five, but three arrived late.
    const list = [
      perfect(JULY[0], { ohevei: true }),
      perfect(JULY[1], { ohevei: true }),
      lateBy(JULY[2], 10, { ohevei: true }),
      lateBy(JULY[3], 10, { ohevei: true }),
      lateBy(JULY[4], 10, { ohevei: true }),
    ];
    expect(ids(list)).not.toContain("ohevei");
  });
});

describe("the day streak", () => {
  it("is reported from three consecutive days", () => {
    expect(ids(["2026-07-15", "2026-07-14", "2026-07-13"].map((d) => perfect(d)))).toContain(
      "streak",
    );
  });

  it("is not reported at two", () => {
    expect(ids(["2026-07-15", "2026-07-14"].map((d) => perfect(d)))).not.toContain("streak");
  });

  it("is not reported when the run does not reach today", () => {
    expect(ids(["2026-07-08", "2026-07-07", "2026-07-06"].map((d) => perfect(d)))).not.toContain(
      "streak",
    );
  });
});

// ============================================================================
// Absences
// ============================================================================

describe("absences", () => {
  it("are called out from three upwards", () => {
    expect(
      ids([
        absent(JULY[0]),
        absent(JULY[1]),
        absent(JULY[2]),
        ...JULY.slice(3, 6).map((d) => perfect(d)),
      ]),
    ).toContain("absences");
  });

  it("are not called out at two", () => {
    expect(
      ids([absent(JULY[0]), absent(JULY[1]), ...JULY.slice(2, 6).map((d) => perfect(d))]),
    ).not.toContain("absences");
  });

  it("are counted even when excused", () => {
    expect(
      ids([
        absent(JULY[0], { excusedAll: true }),
        absent(JULY[1], { excusedAll: true }),
        absent(JULY[2], { excusedAll: true }),
      ]),
    ).toContain("absences");
  });
});

// ============================================================================
// Extra learning
// ============================================================================

describe("extra learning", () => {
  it("is praised past five hours in the month", () => {
    const lessons = Array.from({ length: 6 }, () => lesson({ minutes: 60 }));
    expect(
      ids(
        JULY.slice(0, 3).map((d) => perfect(d)),
        lessons,
      ),
    ).toContain("learn-good");
  });

  it("prompts when there is barely any", () => {
    expect(
      ids(
        JULY.slice(0, 3).map((d) => perfect(d)),
        [lesson({ minutes: 30 })],
      ),
    ).toContain("learn-low");
  });

  it("says nothing at all when nothing has been logged", () => {
    const list = ids(
      JULY.slice(0, 3).map((d) => perfect(d)),
      [],
    );
    expect(list).not.toContain("learn-low");
    expect(list).not.toContain("learn-good");
  });

  it("ignores lessons from other months", () => {
    const lessons = Array.from({ length: 6 }, () => lesson({ minutes: 60, date: "2026-06-10" }));
    const list = ids(
      JULY.slice(0, 3).map((d) => perfect(d)),
      lessons,
    );
    expect(list).not.toContain("learn-good");
    expect(list).toContain("learn-low");
  });

  it("names the leading framework once there are five lessons", () => {
    const lessons = [
      lesson({ framework: "torato-beyado", minutes: 120 }),
      lesson({ framework: "torato-beyado", minutes: 120 }),
      lesson({ framework: "kollel-erev", minutes: 30 }),
      lesson({ framework: "kollel-erev", minutes: 30 }),
      lesson({ framework: "bein-hazmanim", minutes: 30 }),
    ];
    const insight = run(
      JULY.slice(0, 3).map((d) => perfect(d)),
      lessons,
    ).find((i) => i.id === "learn-top-fw");
    expect(insight).toBeDefined();
    expect(insight!.title).toContain("תורתו בידו");
  });

  it("does not name a leading framework below five lessons", () => {
    const lessons = Array.from({ length: 4 }, () => lesson({ minutes: 120 }));
    expect(
      ids(
        JULY.slice(0, 3).map((d) => perfect(d)),
        lessons,
      ),
    ).not.toContain("learn-top-fw");
  });

  it("names a real framework, never a raw key", () => {
    for (const framework of [
      "kollel-erev",
      "torato-beyado",
      "bein-hazmanim",
    ] as LearningFramework[]) {
      const lessons = Array.from({ length: 5 }, () => lesson({ framework, minutes: 60 }));
      const insight = run(
        JULY.slice(0, 3).map((d) => perfect(d)),
        lessons,
      ).find((i) => i.id === "learn-top-fw")!;
      expect(insight.title, framework).not.toContain("undefined");
      expect(insight.title, framework).not.toContain(framework);
    }
  });
});

// ============================================================================
// Month-on-month trends
// ============================================================================

describe("month-on-month trend", () => {
  it("reports an improvement over last month", () => {
    const list = ids([
      ...JULY.slice(0, 6).map((d) => perfect(d)),
      ...JUNE.slice(0, 6).map((d) => absent(d)),
    ]);
    expect(list).toContain("trend-up");
    expect(list).not.toContain("trend-down");
  });

  it("reports a decline", () => {
    const list = ids([
      ...JULY.slice(0, 6).map((d) => absent(d)),
      ...JUNE.slice(0, 6).map((d) => perfect(d)),
    ]);
    expect(list).toContain("trend-down");
    expect(list).not.toContain("trend-up");
  });

  it("says nothing when last month has too little to compare against", () => {
    const list = ids([
      ...JULY.slice(0, 6).map((d) => perfect(d)),
      ...JUNE.slice(0, 4).map((d) => absent(d)),
    ]);
    expect(list).not.toContain("trend-up");
    expect(list).not.toContain("trend-down");
  });

  it("says nothing when the two months are level", () => {
    const list = ids([
      ...JULY.slice(0, 6).map((d) => perfect(d)),
      ...JUNE.slice(0, 6).map((d) => perfect(d)),
    ]);
    expect(list).not.toContain("trend-up");
    expect(list).not.toContain("trend-down");
  });

  it("reports an improvement in average lateness", () => {
    const list = ids([
      lateBy(JULY[0], 5),
      lateBy(JULY[1], 5),
      ...JULY.slice(2, 5).map((d) => perfect(d)),
      lateBy(JUNE[0], 60),
      lateBy(JUNE[1], 60),
      ...JUNE.slice(2, 7).map((d) => perfect(d)),
    ]);
    expect(list).toContain("punctual-up");
  });

  it("needs two late arrivals in each month before comparing them", () => {
    const list = ids([
      lateBy(JULY[0], 5),
      ...JULY.slice(1, 5).map((d) => perfect(d)),
      lateBy(JUNE[0], 60),
      lateBy(JUNE[1], 60),
      ...JUNE.slice(2, 7).map((d) => perfect(d)),
    ]);
    expect(list).not.toContain("punctual-up");
  });
});

// ============================================================================
// Seder א׳ vs Seder ב׳
// ============================================================================

describe("the gap between the two sedarim", () => {
  it("names the weaker seder", () => {
    const entries = [
      ...JULY.slice(0, 3).map((d) => perfect(d, { seder: 1 })),
      ...JULY.slice(0, 3).map((d) => absent(d, { seder: 2 })),
    ];
    const insight = run(entries).find((i) => i.id === "seder-gap");
    expect(insight).toBeDefined();
    expect(insight!.title).toContain("ב׳");
  });

  it("names Seder א׳ when that is the weaker one", () => {
    const entries = [
      ...JULY.slice(0, 3).map((d) => absent(d, { seder: 1 })),
      ...JULY.slice(0, 3).map((d) => perfect(d, { seder: 2 })),
    ];
    expect(run(entries).find((i) => i.id === "seder-gap")!.title).toContain("א׳");
  });

  it("says nothing when the two are close", () => {
    const entries = [
      ...JULY.slice(0, 3).map((d) => perfect(d, { seder: 1 })),
      ...JULY.slice(0, 3).map((d) => perfect(d, { seder: 2 })),
    ];
    expect(ids(entries)).not.toContain("seder-gap");
  });

  it("needs at least three of each", () => {
    const entries = [
      ...JULY.slice(0, 5).map((d) => perfect(d, { seder: 1 })),
      ...JULY.slice(0, 2).map((d) => absent(d, { seder: 2 })),
    ];
    expect(ids(entries)).not.toContain("seder-gap");
  });
});

// ============================================================================
// Excused ratio
// ============================================================================

describe("the excused ratio", () => {
  it("notes good documentation when most of the missing time is excused", () => {
    expect(
      ids([
        absent(JULY[0], { excusedAll: true }),
        absent(JULY[1], { excusedAll: true }),
        lateBy(JULY[2], 10),
        ...JULY.slice(3, 6).map((d) => perfect(d)),
      ]),
    ).toContain("excused-high");
  });

  it("prompts when almost none of it is", () => {
    expect(
      ids([absent(JULY[0]), absent(JULY[1]), ...JULY.slice(2, 9).map((d) => perfect(d))]),
    ).toContain("excused-low");
  });

  it("needs eight records before prompting", () => {
    expect(ids([absent(JULY[0]), ...JULY.slice(1, 5).map((d) => perfect(d))])).not.toContain(
      "excused-low",
    );
  });

  it("says nothing when barely any time is missing", () => {
    const list = ids([lateBy(JULY[0], 5), ...JULY.slice(1, 9).map((d) => perfect(d))]);
    expect(list).not.toContain("excused-high");
    expect(list).not.toContain("excused-low");
  });
});

// ============================================================================
// Forecast + gaps
// ============================================================================

describe("the end-of-month forecast", () => {
  it("warns when the current pace would cross the threshold", () => {
    // 60 missing minutes over 11 elapsed learning days projects to about 120
    // across the month's 22 — past a 100-minute threshold, while the 60 so far
    // is not.
    const list = ids(
      [lateBy(JULY[0], 30), lateBy(JULY[1], 30), ...JULY.slice(2, 5).map((d) => perfect(d))],
      [],
      { ...GOALS, alertMissingMinPerMonth: 100 },
    );
    expect(list).toContain("forecast-alert");
    expect(list).not.toContain("missing-alert");
  });

  it("stays quiet once the threshold has already been crossed", () => {
    // The plain missing-alert covers that case; the forecast would be noise.
    const list = ids([absent(JULY[0]), ...JULY.slice(1, 5).map((d) => perfect(d))], [], {
      ...GOALS,
      alertMissingMinPerMonth: 100,
    });
    expect(list).toContain("missing-alert");
    expect(list).not.toContain("forecast-alert");
  });

  it("stays quiet when the pace is fine", () => {
    expect(ids(JULY.slice(0, 5).map((d) => perfect(d)))).not.toContain("forecast-alert");
  });
});

describe("unrecorded sedarim", () => {
  it("are reported when several are missing", () => {
    // Four records against 22 expected for the month so far.
    expect(ids(JULY.slice(0, 4).map((d) => perfect(d)))).toContain("gaps");
  });

  it("are not reported when the month is nearly complete", () => {
    const entries = JULY.flatMap((d) => [perfect(d, { seder: 1 }), perfect(d, { seder: 2 })]);
    expect(ids(entries)).not.toContain("gaps");
  });

  it("are not reported below four records", () => {
    expect(ids(JULY.slice(0, 3).map((d) => perfect(d)))).not.toContain("gaps");
  });
});

// ============================================================================
// Shape of the output
// ============================================================================

describe("every insight produced", () => {
  const FIXTURES: Array<[string, SederEntry[], LearningEntry[]]> = [
    ["empty", [], []],
    ["a clean month", JULY.slice(0, 6).map((d) => perfect(d)), []],
    [
      "a rough month",
      [
        absent(JULY[0]),
        absent(JULY[1]),
        absent(JULY[2]),
        lateBy(JULY[3], 40),
        lateBy(JULY[4], 40),
        lateBy(JULY[5], 40),
        ...JULY.slice(6).map((d) => perfect(d)),
      ],
      Array.from({ length: 6 }, () => lesson({ minutes: 90 })),
    ],
    [
      "two months of history",
      [
        ...JULY.flatMap((d) => [perfect(d, { seder: 1 }), absent(d, { seder: 2 })]),
        ...JUNE.map((d) => perfect(d)),
      ],
      Array.from({ length: 5 }, () => lesson()),
    ],
  ];

  it.each(FIXTURES)("has a unique id — %s", (_label, entries, lessons) => {
    const list = run(entries, lessons).map((i) => i.id);
    expect(new Set(list).size).toBe(list.length);
  });

  it.each(FIXTURES)("has a non-empty title and detail — %s", (_label, entries, lessons) => {
    for (const insight of run(entries, lessons)) {
      expect(insight.title.length, insight.id).toBeGreaterThan(3);
      expect(insight.detail.length, insight.id).toBeGreaterThan(3);
      expect(insight.title, insight.id).not.toContain("undefined");
      expect(insight.detail, insight.id).not.toContain("undefined");
      expect(insight.title, insight.id).not.toContain("NaN");
      expect(insight.detail, insight.id).not.toContain("NaN");
    }
  });

  it.each(FIXTURES)("uses a tone and category the type allows — %s", (_label, entries, lessons) => {
    for (const insight of run(entries, lessons)) {
      expect(["success", "warning", "info", "destructive"], insight.id).toContain(insight.tone);
      expect(["trend", "opportunity", "recommendation"], insight.id).toContain(insight.category);
    }
  });

  it("never contradicts itself with both a goal met and a goal gap", () => {
    for (const [, entries, lessons] of FIXTURES) {
      const list = run(entries, lessons).map((i) => i.id);
      expect(list.includes("goal-met") && list.includes("goal-gap")).toBe(false);
      expect(list.includes("trend-up") && list.includes("trend-down")).toBe(false);
      expect(list.includes("late-warn") && list.includes("late-limit")).toBe(false);
      expect(list.includes("learn-good") && list.includes("learn-low")).toBe(false);
      expect(list.includes("excused-high") && list.includes("excused-low")).toBe(false);
    }
  });
});

// ============================================================================
// forecastMonthlyNetMissing
// ============================================================================

describe("forecastMonthlyNetMissing", () => {
  it("is null below three records — too little to extrapolate from", () => {
    replaceAllData(
      JULY.slice(0, 2).map((d) => perfect(d)),
      [],
    );
    expect(forecastMonthlyNetMissing()).toBe(null);
  });

  it("is null with no records at all", () => {
    replaceAllData([], []);
    expect(forecastMonthlyNetMissing()).toBe(null);
  });

  it("is 0 for a month with nothing missing", () => {
    replaceAllData(
      JULY.slice(0, 5).map((d) => perfect(d)),
      [],
    );
    expect(forecastMonthlyNetMissing()).toBe(0);
  });

  it("scales the pace so far across the whole month", () => {
    // 60 missing over the 11 elapsed learning days, projected onto 22.
    replaceAllData(
      [lateBy(JULY[0], 30), lateBy(JULY[1], 30), ...JULY.slice(2, 5).map((d) => perfect(d))],
      [],
    );
    expect(forecastMonthlyNetMissing()).toBe(120);
  });

  it("grows with the amount missing", () => {
    const forecastFor = (lateMin: number) => {
      replaceAllData(
        [lateBy(JULY[0], lateMin), lateBy(JULY[1], lateMin), lateBy(JULY[2], lateMin)],
        [],
      );
      return forecastMonthlyNetMissing()!;
    };
    expect(forecastFor(60)).toBeGreaterThan(forecastFor(30));
  });

  it("returns a whole number of minutes", () => {
    replaceAllData([lateBy(JULY[0], 7), lateBy(JULY[1], 7), lateBy(JULY[2], 7)], []);
    expect(Number.isInteger(forecastMonthlyNetMissing()!)).toBe(true);
  });

  it("ignores other months", () => {
    replaceAllData([...JULY.slice(0, 3).map((d) => perfect(d)), ...JUNE.map((d) => absent(d))], []);
    expect(forecastMonthlyNetMissing()).toBe(0);
  });
});

// ============================================================================
// consistencyScore
// ============================================================================

describe("consistencyScore", () => {
  it("is 0 below five records", () => {
    replaceAllData(
      JULY.slice(0, 4).map((d) => perfect(d)),
      [],
    );
    expect(consistencyScore()).toBe(0);
  });

  it("is 0 with only one month to go on", () => {
    replaceAllData(
      JULY.slice(0, 6).map((d) => perfect(d)),
      [],
    );
    expect(consistencyScore()).toBe(0);
  });

  it("is 100 when both months average exactly the same", () => {
    replaceAllData(
      [...JULY.slice(0, 4).map((d) => perfect(d)), ...JUNE.slice(0, 4).map((d) => perfect(d))],
      [],
    );
    expect(consistencyScore()).toBe(100);
  });

  it("falls as the months diverge", () => {
    replaceAllData(
      [...JULY.slice(0, 4).map((d) => perfect(d)), ...JUNE.slice(0, 4).map((d) => lateBy(d, 30))],
      [],
    );
    const mild = consistencyScore();

    replaceAllData(
      [...JULY.slice(0, 4).map((d) => perfect(d)), ...JUNE.slice(0, 4).map((d) => absent(d))],
      [],
    );
    expect(consistencyScore()).toBeLessThan(mild);
  });

  it("stays inside 0–100", () => {
    replaceAllData(
      [
        ...JULY.slice(0, 4).map((d) => perfect(d)),
        ...JUNE.slice(0, 4).map((d) => absent(d, { manualAdjustMin: 1400 })),
      ],
      [],
    );
    const score = consistencyScore();
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it("returns a whole number", () => {
    replaceAllData(
      [...JULY.slice(0, 4).map((d) => perfect(d)), ...JUNE.slice(0, 4).map((d) => lateBy(d, 7))],
      [],
    );
    expect(Number.isInteger(consistencyScore())).toBe(true);
  });
});
