import { describe, it, expect } from "vitest";
import { applyMineToList, mergeRecords, mergeRecordsDetailed } from "./record-merge";

const r = (id: string | number, note = "") => ({ id, note });

describe("mergeRecords (twin of merge_records in store.rs)", () => {
  it("keeps another window's add and applies this window's edit", () => {
    const base = [r("a", "1"), r("b", "1")];
    const next = [r("a", "edited"), r("b", "1")];
    const current = [r("c", "theirs"), r("a", "1"), r("b", "1")];
    expect(mergeRecords(base, next, current)).toEqual([
      r("c", "theirs"),
      r("a", "edited"),
      r("b", "1"),
    ]);
  });

  it("applies a delete here and an add there", () => {
    const base = [r("a"), r("b")];
    const next = [r("b")];
    const current = [r("a"), r("b"), r("n")];
    expect(mergeRecords(base, next, current)).toEqual([r("b"), r("n")]);
  });

  it("untouched records take the file's version; ones deleted elsewhere stay deleted", () => {
    const base = [r("a", "1"), r("b", "1")];
    const next = [r("a", "1"), r("b", "1")];
    const current = [r("a", "theirs")];
    expect(mergeRecords(base, next, current)).toEqual([r("a", "theirs")]);
  });

  it("a same-id add with other content is an add-add conflict; identical is a no-op", () => {
    const res = mergeRecordsDetailed(
      "seder",
      [],
      [r("n", "mine"), r("m", "1")],
      [r("n", "theirs")],
    )!;
    expect(res.list).toEqual([r("n", "theirs"), r("m", "1")]);
    expect(res.conflicts).toEqual([
      { key: "seder", id: "n", kind: "add-add", mine: r("n", "mine"), theirs: r("n", "theirs") },
    ]);
    const same = mergeRecordsDetailed("seder", [], [r("n", "x")], [r("n", "x")])!;
    expect(same.list).toEqual([r("n", "x")]);
    expect(same.conflicts).toEqual([]);
  });

  it("a record edited here and deleted there stays deleted, as a conflict", () => {
    const res = mergeRecordsDetailed("seder", [r("a", "0")], [r("a", "mine")], [])!;
    expect(res.list).toEqual([]);
    expect(res.conflicts).toEqual([
      { key: "seder", id: "a", kind: "edit-deleted", mine: r("a", "mine"), theirs: null },
    ]);
  });

  it("the same id edited in both: the file's version stays, as a conflict; others still merge", () => {
    const base = [r("a", "0"), r("b", "0")];
    const next = [r("a", "mine"), r("b", "0")];
    const current = [r("a", "theirs"), r("b", "theirs-b")];
    const res = mergeRecordsDetailed("learning", base, next, current)!;
    expect(res.list).toEqual([r("a", "theirs"), r("b", "theirs-b")]);
    expect(res.conflicts).toEqual([
      {
        key: "learning",
        id: "a",
        kind: "edit-edit",
        mine: r("a", "mine"),
        theirs: r("a", "theirs"),
      },
    ]);
  });

  it("the very same edit made in both windows is not a conflict", () => {
    const res = mergeRecordsDetailed("seder", [r("a", "0")], [r("a", "x")], [r("a", "x")])!;
    expect(res.conflicts).toEqual([]);
    expect(res.list).toEqual([r("a", "x")]);
  });

  it("a record deleted here and edited there keeps the edit, as a conflict", () => {
    const base = [r("a", "0"), r("b", "0")];
    const res = mergeRecordsDetailed(
      "seder",
      base,
      [r("b", "changed")],
      [r("a", "edited"), r("b", "0")],
    )!;
    expect(res.list).toEqual([r("a", "edited"), r("b", "changed")]);
    expect(res.conflicts).toEqual([
      { key: "seder", id: "a", kind: "deleted-edited", mine: null, theirs: r("a", "edited") },
    ]);
  });

  it("a record deleted here that the file did not touch is deleted, no conflict", () => {
    const base = [r("a", "0"), r("b", "0")];
    const res = mergeRecordsDetailed("seder", base, [r("b", "0")], [r("a", "0"), r("b", "x")])!;
    expect(res.conflicts).toEqual([]);
    expect(res.list).toEqual([r("b", "x")]);
  });

  it("applyMineToList puts my side of a conflict on top, or removes the record", () => {
    const file = [r("a", "theirs"), r("b", "b")];
    expect(applyMineToList(file, { id: "a", mine: r("a", "mine") })).toEqual([
      r("a", "mine"),
      r("b", "b"),
    ]);
    expect(applyMineToList(file, { id: "a", mine: null })).toEqual([r("b", "b")]);
    expect(applyMineToList(file, { id: "z", mine: r("z", "back") })).toEqual([
      r("z", "back"),
      ...file,
    ]);
  });

  it("keeps a remote add next to its neighbour", () => {
    const base = [r("a"), r("b")];
    const next = [r("a"), r("b", "changed")];
    const current = [r("a"), r("n"), r("b")];
    expect((mergeRecords(base, next, current) as { id: string }[]).map((x) => x.id)).toEqual([
      "a",
      "n",
      "b",
    ]);
  });

  it("key order inside a record does not count as a change", () => {
    const base = [{ id: "a", x: 1, y: 2 }];
    const next = [{ y: 2, x: 1, id: "a" }];
    const current = [{ id: "a", x: 1, y: 2, z: 3 }];
    expect(mergeRecords(base, next, current)).toEqual(current);
  });

  it("returns null (= replace) for anything that is not a clean id-record array", () => {
    expect(mergeRecords({ a: 1 }, { a: 2 }, { a: 1 })).toBeNull();
    expect(mergeRecords([1], [2], [1])).toBeNull();
    expect(mergeRecords([r("d"), r("d")], [r("d")], [r("d")])).toBeNull();
    expect(mergeRecords([r("a")], [r("a")], undefined)).toBeNull();
    expect(mergeRecords([{ id: null }], [], [])).toBeNull();
  });

  it("distinguishes the number 1 from the string '1'", () => {
    expect(mergeRecords([r(1)], [r(1), r("1")], [r(1)])).toEqual([r(1), r("1")]);
  });
});
