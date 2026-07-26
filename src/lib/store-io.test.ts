import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import os from "os";

// Each test gets an isolated SEDORIM_DATA_DIR so runs never interfere with
// each other or with a real dev/packaged install.
let dir: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "sedorim-store-test-"));
  process.env.SEDORIM_DATA_DIR = dir;
});

afterEach(async () => {
  delete process.env.SEDORIM_DATA_DIR;
  await fs.rm(dir, { recursive: true, force: true });
});

describe("readStore / saveKey", () => {
  it("readStore returns {} when nothing has been saved yet", async () => {
    const { readStore } = await import("./store-io");
    expect(await readStore()).toEqual({});
  });

  it("saveKey persists a key, readable back via readStore", async () => {
    const { readStore, saveKey } = await import("./store-io");
    await saveKey("seder", [{ id: "a" }]);
    const store = await readStore();
    expect(store.seder).toEqual([{ id: "a" }]);
    expect(typeof store.updatedAt).toBe("number");
  });

  it("saving one key does not clobber a different, already-saved key", async () => {
    const { readStore, saveKey } = await import("./store-io");
    await saveKey("seder", [{ id: "s1" }]);
    await saveKey("learning", [{ id: "l1" }]);
    await saveKey("timer", { framework: "kollel-erev", startedAt: 1 });
    const store = await readStore();
    expect(store.seder).toEqual([{ id: "s1" }]);
    expect(store.learning).toEqual([{ id: "l1" }]);
    expect(store.timer).toEqual({ framework: "kollel-erev", startedAt: 1 });
  });

  it("survives many concurrent writes to different keys without losing any", async () => {
    const { readStore, saveKey } = await import("./store-io");
    const writes: Promise<unknown>[] = [];
    for (let i = 0; i < 10; i++) {
      writes.push(saveKey("seder", [{ id: `s${i}` }]));
      writes.push(saveKey("learning", [{ id: `l${i}` }]));
      writes.push(saveKey("timer", { i }));
    }
    await Promise.all(writes);
    const store = await readStore();
    // All three keys must be present — none silently dropped by a write race.
    expect(store.seder).toBeDefined();
    expect(store.learning).toBeDefined();
    expect(store.timer).toBeDefined();
  });

  it("a write never touches the temp files it creates after renaming", async () => {
    const { saveKey } = await import("./store-io");
    await saveKey("seder", [{ id: "a" }]);
    const files = await fs.readdir(dir);
    const tmpFiles = files.filter((f) => f.includes(".tmp"));
    expect(tmpFiles).toEqual([]);
  });
});

describe("backup rotation", () => {
  it("creates a backup on first save and throttles subsequent ones", async () => {
    const { saveKey, backupDir } = await import("./store-io");
    await saveKey("seder", [{ id: "a" }]);
    // maybeBackup is fire-and-forget; give it a tick to finish.
    await new Promise((r) => setTimeout(r, 50));
    await saveKey("seder", [{ id: "b" }]);
    await new Promise((r) => setTimeout(r, 50));

    const files = await fs.readdir(backupDir());
    // Both saves happen within milliseconds of each other, well inside the
    // 6h throttle window — only the first should have produced a backup.
    expect(files.length).toBe(1);
  });
});

describe("saveKeys (atomic multi-key write)", () => {
  it("updates seder + learning together — no window where only one is present", async () => {
    const { readStore, saveKeys } = await import("./store-io");
    await saveKeys({ seder: [{ id: "s1" }], learning: [{ id: "l1" }] });
    const store = await readStore();
    expect(store.seder).toEqual([{ id: "s1" }]);
    expect(store.learning).toEqual([{ id: "l1" }]);
  });

  it("demonstrates why two separate saveKey calls are unsafe for a combined restore", async () => {
    // This is the bug replaceAllData()/saveKeys() exists to avoid:
    // importing/restoring seder + learning via two *independent* saveKey()
    // calls leaves a real window, between the two writes landing, where a
    // concurrent reader (the 4s cross-window poll) sees seder already
    // restored but learning still at its old (pre-restore) value.
    const { readStore, saveKey } = await import("./store-io");
    await saveKey("learning", [{ id: "old-learning" }]); // pre-existing data

    await saveKey("seder", [{ id: "restored-seder" }]); // first of the two restore writes lands
    const partialSnapshot = await readStore(); // a poll landing exactly here...
    await saveKey("learning", [{ id: "restored-learning" }]); // ...before the second write lands

    // ...would see the new seder mixed with the STALE learning — a
    // genuinely inconsistent, partially-restored state.
    expect(partialSnapshot.seder).toEqual([{ id: "restored-seder" }]);
    expect(partialSnapshot.learning).toEqual([{ id: "old-learning" }]); // stale!
  });

  it("saveKeys never exposes that partial state — a reader sees old or new, never mixed", async () => {
    const { readStore, saveKey, saveKeys } = await import("./store-io");
    await saveKey("learning", [{ id: "old-learning" }]);
    await saveKeys({ seder: [{ id: "restored-seder" }], learning: [{ id: "restored-learning" }] });

    const store = await readStore();
    expect(store.seder).toEqual([{ id: "restored-seder" }]);
    expect(store.learning).toEqual([{ id: "restored-learning" }]); // never stale
  });
});
