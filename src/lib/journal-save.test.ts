import { describe, expect, it } from "vitest";
import { runSave } from "./journal-save";
import { ValidationError } from "./kollel-store";
import { COMPLETE_SAVE, CONFLICT_SAVE_TEXT } from "./save-conflicts";

describe("runSave", () => {
  it("is null only after the promise resolved", async () => {
    let done = false;
    const r = await runSave(async () => {
      await Promise.resolve();
      done = true;
    });
    expect(done).toBe(true);
    expect(r).toBeNull();
  });
  it("reports a failed write instead of success", async () => {
    expect(await runSave(() => Promise.reject(new Error("disk")))).toMatch(/נכשלה/);
  });
  it("passes validation text through", async () => {
    expect(
      await runSave(() => {
        throw new ValidationError("משך לא תקין");
      }),
    ).toBe("משך לא תקין");
  });
  it("treats a conflicted outcome as not saved", async () => {
    const conflict = { key: "seder", id: "a", kind: "edit-edit", mine: {}, theirs: {} };
    const r = await runSave(async () => ({ complete: false, conflicts: [conflict] }));
    expect(r).toBe(CONFLICT_SAVE_TEXT);
  });
  it("treats a complete outcome as saved", async () => {
    expect(await runSave(async () => COMPLETE_SAVE)).toBeNull();
  });
});
