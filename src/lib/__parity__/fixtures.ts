// Parity fixtures: one deterministic body of attendance and learning rows, and
// the function that turns it into every figure the app computes from it.
//
// The same file is run twice — once against the code of the previous release
// (v7) to write v7-golden.json, and on every test run against the current code
// — so a change to any figure, for the same rows at the same "now", is a test
// failure rather than a surprise. The rows are synthetic: no personal data.
//
// This file imports nothing from the app, so it can be copied next to old code.

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Api = {
  calcSeder: (e: any) => unknown;
  summarizeEntries: (list: any[]) => unknown;
  scoreEntries: (list: any[]) => unknown;
  monthClosing: (key: string, entries: any[], lessons: any[]) => unknown;
  effectiveLearningMin: (l: any) => unknown;
  calcStipend: (input: any) => unknown;
};

/** The instant every run pretends it is, so "month ended?" is the same for both. */
export const PARITY_NOW = "2026-11-01T12:00:00";

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

const pad = (n: number) => String(n).padStart(2, "0");
const hhmm = (min: number) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;

export function buildFixtures() {
  const r = rng(7);
  const pick = <T>(xs: T[]): T => xs[Math.floor(r() * xs.length)];
  const entries: any[] = [];
  const lessons: any[] = [];
  let id = 0;

  // March through October 2026, every calendar day — weekends and holidays
  // included, because old data can sit on them and calcSeder must not care.
  for (let m = 3; m <= 10; m++) {
    const days = new Date(2026, m, 0).getDate();
    for (let d = 1; d <= days; d++) {
      const date = `2026-${pad(m)}-${pad(d)}`;
      if (r() < 0.12) continue; // a day with nothing recorded
      for (const seder of [1, 2] as const) {
        if (r() < 0.1) continue;
        const kind = r();
        const e: any = {
          id: `e${++id}`,
          date,
          seder,
          absent: false,
          ohevei: false,
          excusedAll: false,
          excusedMinutes: 0,
          manualAdjustMin: 0,
          tags: [],
        };
        // The seder hours in force (the defaults both releases share).
        const start = seder === 1 ? 9 * 60 : 15 * 60 + 45;
        const end = seder === 1 ? 13 * 60 : 19 * 60 + 30;
        if (kind < 0.06) {
          e.absent = true;
          if (r() < 0.5) {
            e.excusedAll = true;
            e.excusedReason = "בדיקה";
          }
        } else if (kind < 0.11) {
          // No hours at all: a row that says "recorded" and nothing else.
        } else {
          const pattern = r();
          if (pattern < 0.55) {
            // On time, the whole seder — the ordinary day (and the ohevei case).
            e.arrival = hhmm(start - Math.floor(r() * 12));
            e.departure = hhmm(end + Math.floor(r() * 12));
            if (r() < 0.3) e.ohevei = true;
          } else if (pattern < 0.8) {
            e.arrival = hhmm(start + 1 + Math.floor(r() * 50)); // late
            e.departure = hhmm(end + Math.floor(r() * 8));
          } else if (pattern < 0.92) {
            e.arrival = hhmm(start - Math.floor(r() * 8));
            e.departure = hhmm(end - 5 - Math.floor(r() * 60)); // early departure
          } else {
            // Arrived long before the seder: the shas-chavura and bonus cases.
            e.arrival = hhmm(seder === 2 ? 14 * 60 + Math.floor(r() * 50) : start - 30);
            e.departure = hhmm(end + Math.floor(r() * 30));
          }
          if (r() < 0.12) e.excusedMinutes = pick([5, 10, 15, 30, 45]);
          if (r() < 0.05) e.excusedAll = true;
          if (r() < 0.06) e.manualAdjustMin = pick([-20, -5, 5, 15, 30]);
          if (r() < 0.2) e.tags = [pick(["חולה", "שמחה", "אישי"])];
          if (r() < 0.1) e.note = "הערה לדוגמה";
        }
        entries.push(e);
      }
      if (r() < 0.55) {
        const fw = pick(["kollel-erev", "torato-beyado", "bein-hazmanim"] as const);
        const l: any = {
          id: `l${++id}`,
          framework: fw,
          date,
          minutes: pick([20, 30, 45, 60, 90, 120, 150]),
          source: pick(["manual", "range", "timer"] as const),
        };
        if (fw === "kollel-erev" && r() < 0.3) l.tanitDibur = true;
        lessons.push(l);
      }
    }
  }
  return { entries, lessons };
}

export function monthKeys(): string[] {
  return ["03", "04", "05", "06", "07", "08", "09", "10"].map((m) => `2026-${m}`);
}

/** Every figure derived from the fixtures, as plain JSON-comparable data. */
export function computeAll(api: Api, fx = buildFixtures()) {
  const perEntry: Record<string, unknown> = {};
  for (const e of fx.entries) perEntry[e.id] = api.calcSeder(e);
  const perLesson: Record<string, unknown> = {};
  for (const l of fx.lessons) perLesson[l.id] = api.effectiveLearningMin(l);

  const perMonth: Record<string, unknown> = {};
  for (const key of monthKeys()) {
    const es = fx.entries.filter((e) => e.date.startsWith(key));
    const ls = fx.lessons.filter((l) => l.date.startsWith(key));
    const stipend: Record<string, unknown> = {};
    for (const shasChavura of [false, true]) {
      for (const priorApproval of [false, true]) {
        stipend[`shas=${shasChavura},approved=${priorApproval}`] = api.calcStipend({
          monthKey: key,
          entries: fx.entries,
          lessons: fx.lessons,
          shasChavura,
          priorApproval,
        });
      }
    }
    perMonth[key] = {
      summary: api.summarizeEntries(es),
      score: api.scoreEntries(es),
      closing: api.monthClosing(key, es, ls),
      stipend,
    };
  }
  // JSON round trip: what is compared is exactly what is stored in the golden.
  return JSON.parse(JSON.stringify({ perEntry, perLesson, perMonth }));
}
