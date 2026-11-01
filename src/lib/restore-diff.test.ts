import { describe, it, expect } from "vitest";
import { describeRestoreDiff, diffById } from "./restore-diff";

describe("diffById", () => {
  it("counts added, replaced, removed and unchanged records by id", () => {
    const cur = [
      { id: "a", v: 1 },
      { id: "b", v: 1 },
      { id: "c", v: 1 },
    ];
    const res = [
      { id: "a", v: 1 },
      { id: "b", v: 2 },
      { id: "d", v: 1 },
    ];
    expect(diffById(cur, res)).toEqual({ same: 1, replaced: 1, removed: 1, added: 1 });
  });
  it("is the same regardless of key order", () => {
    const a = [{ id: "a", x: 1, y: 2 }];
    const b = [{ id: "a", y: 2, x: 1 }];
    expect(diffById(a, b).same).toBe(1);
  });
  it("describes both kinds in plain Hebrew", () => {
    const lines = describeRestoreDiff(
      { seder: [{ id: "a" }], learning: [] },
      { seder: [], learning: [{ id: "l" }] },
    );
    expect(lines[0]).toContain("1 יימחקו");
    expect(lines[1]).toContain("1 יתווספו");
  });
});
