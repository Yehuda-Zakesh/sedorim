import { describe, expect, it } from "vitest";
import {
  hoursDraftState,
  hoursEffect,
  hoursSavedMessage,
  hoursStatus,
  sameTimes,
} from "./settings-hours";
import type { SederTimes } from "./settings-store";

const base: SederTimes = { s1Start: "09:00", s1End: "12:00", s2Start: "16:00", s2End: "19:00" };

describe("seder-hours draft state", () => {
  it("is saved while the draft equals its baseline", () => {
    expect(sameTimes(base, { ...base })).toBe(true);
    expect(hoursStatus({ ...base }, base)).toBe("saved");
  });

  it("is a draft once any of the four times differs", () => {
    expect(hoursStatus({ ...base, s1Start: "09:20" }, base)).toBe("draft");
    expect(hoursStatus({ ...base, s2End: "19:30" }, base)).toBe("draft");
  });

  it("is saved again after a save to a future date moves the baseline", () => {
    const draft = { ...base, s1Start: "09:20" };
    expect(hoursStatus(draft, base)).toBe("draft");
    // Saving sets the baseline to the saved draft, not to today's hours.
    expect(hoursStatus(draft, draft)).toBe("saved");
  });

  it("classifies the effective date against today", () => {
    expect(hoursEffect("2026-11-01", "2026-10-31")).toBe("future");
    expect(hoursEffect("2026-10-31", "2026-10-31")).toBe("today");
    expect(hoursEffect("2026-10-01", "2026-10-31")).toBe("past");
  });

  it("says when a future change starts, not that it was lost", () => {
    expect(hoursSavedMessage("2026-11-01", "2026-10-31")).toContain("2026-11-01");
    expect(hoursSavedMessage("2026-10-31", "2026-10-31")).toBe("השעות עודכנו מהיום ואילך");
  });
});

describe("hours draft is hours + effective date", () => {
  const ten: SederTimes = { ...base, s1Start: "10:00" };
  const start = { times: base, from: "2026-10-31" };

  it("is saved at the start", () => {
    expect(hoursDraftState(start, start, base)).toEqual({
      needsSave: false,
      touched: false,
      status: "saved",
    });
  });

  it("needs saving when the chosen date has other hours in force", () => {
    // 10:00 is in force from 1.11; the draft still says 09:00 and 5.11 is picked.
    const st = hoursDraftState({ times: base, from: "2026-11-05" }, start, ten);
    expect(st.needsSave).toBe(true);
    expect(st.status).toBe("draft");
  });

  it("needs no save when the date already has the drafted hours, but stays cancellable", () => {
    const st = hoursDraftState({ times: ten, from: "2026-11-05" }, start, ten);
    expect(st.needsSave).toBe(false);
    expect(st.touched).toBe(true);
    expect(st.status).toBe("draft");
  });

  it("is saved again once the baseline moves to the saved action", () => {
    const saved = { times: base, from: "2026-11-05" };
    expect(hoursDraftState(saved, saved, base).status).toBe("saved");
  });
});
