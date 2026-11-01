import { describe, it, expect } from "vitest";
import type { SederCalc, SederEntry } from "@/lib/kollel-store";
import {
  completionText,
  dayCompletion,
  editStateFromForm,
  reconcileForm,
  recordState,
  statusWords,
} from "./today-utils";

const entry = (over: Partial<SederEntry> = {}): SederEntry => ({
  id: "x",
  date: "2026-10-28",
  seder: 1,
  absent: false,
  ohevei: false,
  excusedAll: false,
  excusedMinutes: 0,
  manualAdjustMin: 0,
  tags: [],
  ...over,
});
const calc = (over: Partial<SederCalc> = {}): SederCalc => ({
  sederLengthMin: 240,
  missingMin: 0,
  bonusMin: 0,
  excusedMin: 0,
  nonExcusedMin: 0,
  netMissingMin: 0,
  isLate: false,
  isEarlyDeparture: false,
  isOhevei: false,
  isShasArrival: false,
  ...over,
});

describe("statusWords", () => {
  it("does not call a row without hours full attendance", () => {
    const w = statusWords(entry(), calc({ missingMin: 240, netMissingMin: 240 }));
    expect(w).toEqual(["חסר פירוט שעות"]);
  });
  it("says the record is incomplete when there is nothing missing either", () => {
    expect(statusWords(entry(), calc())).toEqual(["רישום לא שלם"]);
  });
  it("keeps full attendance for a row with both hours", () => {
    const e = entry({ arrival: "09:00", departure: "13:00" });
    expect(statusWords(e, calc())).toEqual(["נוכח במלואו"]);
  });
  it("does not claim full attendance without a departure", () => {
    const w = statusWords(entry({ arrival: "09:00" }), calc());
    expect(w).toEqual(["יציאה טרם נרשמה"]);
  });
  it("leaves an absence as an absence", () => {
    expect(statusWords(entry({ absent: true }), calc({ missingMin: 240 }))).toEqual(["היעדרות"]);
  });
});

describe("recordState", () => {
  it("tells absent, incomplete, arrived and done apart", () => {
    expect(recordState(entry({ absent: true }))).toBe("absent");
    expect(recordState(entry())).toBe("incomplete");
    expect(recordState(entry({ arrival: "09:00" }))).toBe("arrived");
    expect(recordState(entry({ arrival: "09:00", departure: "13:00" }))).toBe("done");
  });
});

describe("dayCompletion", () => {
  it("counts only seder א׳ on a fast day", () => {
    const c = dayCompletion({ learningDay: true, noSederB: true, recorded: [1] });
    expect(c.required).toEqual([1]);
    expect(c.complete).toBe(true);
    expect(completionText(c)).toBe("נרשמו כל הסדרים הנדרשים (1)");
  });
  it("does not let a seder ב׳ record stand in for the missing seder א׳ on a fast day", () => {
    const c = dayCompletion({ learningDay: true, noSederB: true, recorded: [2] });
    expect(c.complete).toBe(false);
    expect(c.done).toEqual([]);
    expect(c.extra).toEqual([2]);
    expect(completionText(c)).toContain("לא נספר");
  });
  it("reports both records of a fast day separately from completion", () => {
    const c = dayCompletion({ learningDay: true, noSederB: true, recorded: [1, 2] });
    expect(c.done).toEqual([1]);
    expect(c.extra).toEqual([2]);
    expect(c.complete).toBe(true);
  });
  it("counts both on a regular day", () => {
    const c = dayCompletion({ learningDay: true, noSederB: false, recorded: [1] });
    expect(c.complete).toBe(false);
    expect(completionText(c)).toBe("נרשמו 1 מתוך 2 סדרים נדרשים");
  });
  it("owes nothing on a day without learning", () => {
    const c = dayCompletion({ learningDay: false, noSederB: false, recorded: [] });
    expect(c.required).toEqual([]);
    expect(c.complete).toBe(false);
    expect(completionText(c)).toBe("אין סדרים נדרשים היום");
  });
});

describe("editStateFromForm", () => {
  const f = {
    excusedAll: false,
    excusedMinutes: 0,
    excusedReason: "",
    manualAdjustMin: 0,
    note: "",
  };
  it("opens the excuse section from the data", () => {
    expect(editStateFromForm({ ...f, excusedMinutes: 5 })).toEqual({
      excuseOpen: true,
      extrasOpen: false,
    });
    expect(editStateFromForm({ ...f, excusedAll: true }).excuseOpen).toBe(true);
    expect(editStateFromForm({ ...f, excusedReason: "חולה" }).excuseOpen).toBe(true);
  });
  it("opens the extras section from the data", () => {
    expect(editStateFromForm({ ...f, note: "ש" }).extrasOpen).toBe(true);
    expect(editStateFromForm({ ...f, manualAdjustMin: -3 }).extrasOpen).toBe(true);
    expect(editStateFromForm(f)).toEqual({ excuseOpen: false, extrasOpen: false });
  });
});

describe("reconcileForm", () => {
  const base = { arrival: "09:15", note: "" };
  it("follows the stored record when the form is untouched", () => {
    expect(reconcileForm({ ...base }, base, { arrival: "10:05", note: "" })).toBe("sync");
  });
  it("flags a conflict when the form has a draft", () => {
    expect(
      reconcileForm({ arrival: "09:30", note: "" }, base, { arrival: "10:05", note: "" }),
    ).toBe("conflict");
  });
  it("does nothing when the form already matches the stored record", () => {
    expect(
      reconcileForm({ arrival: "10:05", note: "" }, base, { arrival: "10:05", note: "" }),
    ).toBe("same");
  });
});

describe("a day that takes no attendance", () => {
  it("owes no sedarim and never says nothing was recorded", () => {
    const c = dayCompletion({ learningDay: false, noSederB: false, recorded: [] });
    expect(c.required).toEqual([]);
    expect(c.complete).toBe(false);
    const text = completionText(c);
    expect(text).toBe("אין סדרים נדרשים היום");
    expect(text).not.toContain("טרם נרשם");
  });
  it("still reports a record that already sits on such a day, uncounted", () => {
    const c = dayCompletion({ learningDay: false, noSederB: false, recorded: [1] });
    expect(c.done).toEqual([]);
    expect(c.extra).toEqual([1]);
    expect(completionText(c)).toContain("לא נספר");
  });
});

import {
  attendanceSearch,
  draftBelongs,
  draftKey,
  focusFor,
  notableWords,
  parseAttendanceSearch,
  saveStatusLabel,
} from "./today-utils";

describe("today drafts and links", () => {
  it("keys a draft by date and seder", () => {
    expect(draftKey("2026-10-30", 1)).not.toBe(draftKey("2026-10-31", 1));
    expect(draftKey("2026-10-31", 1)).not.toBe(draftKey("2026-10-31", 2));
    expect(draftBelongs({ key: draftKey("2026-10-30", 1) }, draftKey("2026-10-31", 1))).toBe(false);
    expect(draftBelongs({ key: draftKey("2026-10-31", 1) }, draftKey("2026-10-31", 1))).toBe(true);
    expect(draftBelongs(null, "x")).toBe(false);
  });
  it("builds and parses attendance link params", () => {
    expect(attendanceSearch({ date: "2026-10-31", seder: 2, focus: "departure" })).toEqual({
      date: "2026-10-31",
      seder: 2,
      focus: "departure",
    });
    expect(attendanceSearch({})).toEqual({});
    expect(parseAttendanceSearch({ seder: "2", focus: "departure", date: "2026-10-31" })).toEqual({
      date: "2026-10-31",
      seder: 2,
      focus: "departure",
    });
    expect(parseAttendanceSearch({ seder: 3, focus: "x", date: "31.10" })).toEqual({});
  });
  it("sends each state to its field", () => {
    expect(focusFor("arrived")).toBe("departure");
    expect(focusFor("incomplete")).toBe("arrival");
    expect(focusFor("done")).toBe("edit");
  });
  it("keeps a regular record silent", () => {
    const e = entry({ arrival: "09:00", departure: "13:00" });
    const c = {
      isLate: false,
      isEarlyDeparture: false,
      excusedMin: 0,
      isOhevei: false,
    } as SederCalc;
    expect(notableWords(e, c)).toEqual([]);
    expect(notableWords(e, { ...c, isLate: true })).toEqual(["איחור"]);
  });
  it("labels the save states", () => {
    expect(saveStatusLabel({ kind: "saving" }, true)).toBe("שומר…");
    expect(saveStatusLabel({ kind: "failed", message: "x" }, true)).toContain("שמירה נכשלה");
    expect(saveStatusLabel({ kind: "idle" }, true)).toContain("טיוטה");
  });
});
