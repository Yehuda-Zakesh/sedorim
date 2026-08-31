// Whether a reminder that is due is still worth saying.
//
// The rules in notifications.ts decide when a reminder is *due*. They cannot
// tell whether it is *wanted*: a daily nudge that has been talked past for a
// fortnight is due every single morning and useless every single morning. A
// reminder someone has learned to dismiss unread is worse than no reminder at
// all — it teaches them to ignore the next one too, including the one that
// mattered.
//
// So each kind keeps a small memory of how its recent deliveries went, and one
// that keeps going unanswered is asked to wait a period or two before speaking
// again. A single answered delivery clears the whole thing at once: the point
// is to stop nagging, not to ration reminders someone is actually using.
//
// What counts as "answered" is deliberately not "clicked the pop-up". It is
// "the thing the reminder asked for happened" — an entry was recorded for the
// day the reminder was about. That signal works on both channels (the Windows
// notification raised by src-tauri/core/src/lib.rs has no click handler to hang
// anything off), it survives the app being closed and reopened, and it measures
// the only outcome that matters. It is also why the caller has to answer "was
// the need behind *that* delivery met", not "is it met now": crediting this
// morning's entry to a reminder sent four days ago would learn the opposite of
// the truth.
//
// This module is deliberately free of imports. It is arithmetic on a handful of
// integers per kind — no model, nothing to train, nothing to load — and the
// state it produces lives in the shared data file next to `notificationsSent`
// (see notifications.ts, which owns that wiring and supplies the kind names).

/** How one reminder kind's recent deliveries went. */
export type KindMemory = {
  /** Deliveries in a row that went unanswered. Any answer resets it to 0. */
  ignoredStreak: number;
  /** Periods still owed before this kind may speak again. */
  cooldown: number;
  /**
   * The period the cooldown was last charged for.
   *
   * The rules re-run every ten minutes while a window is open, so without this
   * a single silenced morning would burn the whole cooldown by lunchtime.
   */
  cooldownToken?: string;
  /** The delivery still waiting to be judged, if any. */
  pendingToken?: string;
  /** Lifetime totals, shown in Settings so none of this is a black box. */
  delivered: number;
  engaged: number;
};

export type LearningState<K extends string = string> = Partial<Record<K, KindMemory>>;

export const EMPTY_MEMORY: KindMemory = { ignoredStreak: 0, cooldown: 0, delivered: 0, engaged: 0 };

/**
 * Unanswered deliveries in a row before a kind is asked to be quieter.
 *
 * Three, not one: a single missed day is an ordinary day — off sick, away, or
 * simply recorded from the other EXE. A run of three is a habit.
 */
export const IGNORE_THRESHOLD = 3;

/**
 * The most periods a kind is ever silenced for.
 *
 * A cap, not a curve, and a low one. Backing off without bound turns "quieter"
 * into "switched off behind the user's back", which is not a decision this
 * layer is allowed to make — that is what the switches in Settings are for.
 */
export const MAX_COOLDOWN = 3;

/** A kind's memory, with every field present. */
export function memoryFor<K extends string>(state: LearningState<K>, kind: K): KindMemory {
  return { ...EMPTY_MEMORY, ...(state[kind] ?? {}) };
}

/** Periods to stay quiet for, given how many deliveries went unanswered. */
export function cooldownFor(ignoredStreak: number): number {
  if (ignoredStreak < IGNORE_THRESHOLD) return 0;
  return Math.min(MAX_COOLDOWN, ignoredStreak - IGNORE_THRESHOLD + 1);
}

/**
 * Judges the delivery a kind is still waiting on.
 *
 * `satisfied` must answer "was the need behind the *pending* delivery met" —
 * see the note at the top of this file. `currentToken` is the period the app is
 * in now: while it still matches the pending one the delivery is simply too
 * young to judge, because the user has the rest of the day to act on it.
 */
export function settle(mem: KindMemory, satisfied: boolean, currentToken: string): KindMemory {
  if (mem.pendingToken === undefined) return mem;

  if (satisfied) {
    return {
      ...mem,
      pendingToken: undefined,
      engaged: mem.engaged + 1,
      // One answer clears the streak *and* whatever silence was outstanding.
      ignoredStreak: 0,
      cooldown: 0,
      cooldownToken: undefined,
    };
  }

  // Still inside the period it was sent for — there is time left to act on it.
  if (mem.pendingToken === currentToken) return mem;

  const ignoredStreak = mem.ignoredStreak + 1;
  return {
    ...mem,
    pendingToken: undefined,
    ignoredStreak,
    cooldown: cooldownFor(ignoredStreak),
    cooldownToken: undefined,
  };
}

/**
 * Whether a kind owes silence for this period, and the memory to keep either
 * way.
 *
 * Charging the cooldown here — at the moment a reminder is actually held back —
 * rather than counting periods off a calendar is what makes it behave sensibly
 * for an app that only runs while a window is open: a cooldown of two means the
 * next two occasions the reminder *would* have fired, whenever those are, not
 * the next two days on the wall.
 */
export function gate(mem: KindMemory, token: string): { suppressed: boolean; memory: KindMemory } {
  if (mem.cooldown <= 0) return { suppressed: false, memory: mem };
  // Already charged for this period; the ten-minute re-check must be free.
  if (mem.cooldownToken === token) return { suppressed: true, memory: mem };
  return { suppressed: true, memory: { ...mem, cooldown: mem.cooldown - 1, cooldownToken: token } };
}

/** Records that a delivery went out and is now awaiting judgement. */
export function markDelivered(mem: KindMemory, token: string): KindMemory {
  return { ...mem, pendingToken: token, delivered: mem.delivered + 1 };
}

/**
 * Reads the state back off disk.
 *
 * Everything is re-derived rather than trusted: this file is plain JSON in the
 * user's AppData folder, and a hand-edited or half-written value must not be
 * able to silence a reminder permanently — hence the clamp on `cooldown`.
 */
export function parseLearningState<K extends string>(
  raw: unknown,
  kinds: readonly K[],
): LearningState<K> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const src = raw as Record<string, unknown>;
  const out: LearningState<K> = {};
  for (const kind of kinds) {
    const value = src[kind];
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const m = value as Record<string, unknown>;
    out[kind] = {
      ignoredStreak: asCount(m.ignoredStreak),
      cooldown: Math.min(MAX_COOLDOWN, asCount(m.cooldown)),
      cooldownToken: asToken(m.cooldownToken),
      pendingToken: asToken(m.pendingToken),
      delivered: asCount(m.delivered),
      engaged: asCount(m.engaged),
    };
  }
  return out;
}

function asCount(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
}

/** Period tokens are short keys like "2026-07-08" or "2026-W28". */
function asToken(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 && v.length <= 20 ? v : undefined;
}
