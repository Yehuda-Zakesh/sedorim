import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { promises as fs } from "fs";
import path from "path";

// Server-side, file-backed key/value store shared by every window/process
// that talks to this Nitro server instance. Replaces per-window localStorage
// so that SederPlus.exe and SederPlusQuick.exe (two separate OS processes
// that cannot safely share one Chromium profile/localStorage) always read
// and write the exact same data.
//
// Storage location: SEDORIM_DATA_DIR (set by the Electron main/quick process
// to the same shared userData folder already used for the app), falling
// back to the current working directory for local dev / hosted preview.

type StoreShape = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  seder?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  learning?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  timer?: any;
  updatedAt?: number;
};

function dataDir(): string {
  return process.env.SEDORIM_DATA_DIR || process.cwd();
}
function storeFile(): string {
  return path.join(dataDir(), "sedorim-data.json");
}

async function readStore(): Promise<StoreShape> {
  try {
    const raw = await fs.readFile(storeFile(), "utf8");
    return JSON.parse(raw) as StoreShape;
  } catch {
    return {};
  }
}

async function fileMtime(file: string): Promise<number | null> {
  try { return (await fs.stat(file)).mtimeMs; } catch { return null; }
}

export const loadStore = createServerFn({ method: "GET" }).handler(async () => {
  return await readStore();
});

// Writes are read-modify-write against a shared file, and two EXE processes
// (or two rapid actions in the same process) could otherwise race and clobber
// each other's key. We guard against that two ways:
//  1. A per-process promise queue serializes writes from this process.
//  2. Before renaming the temp file into place we re-check the target file's
//     mtime; if it changed since we read it (the other process wrote in the
//     meantime) we discard our attempt and retry against the fresh data.
let writeQueue: Promise<unknown> = Promise.resolve();

export const saveStoreKey = createServerFn({ method: "POST" })
  .inputValidator(z.object({
    key: z.enum(["seder", "learning", "timer"]),
    value: z.unknown(),
  }))
  .handler(async ({ data }) => {
    const attempt = async (): Promise<{ ok: true; updatedAt: number }> => {
      const file = storeFile();
      for (let i = 0; i < 5; i++) {
        const before = await fileMtime(file);
        const store = await readStore();
        store[data.key] = data.value;
        store.updatedAt = Date.now();
        const dir = dataDir();
        await fs.mkdir(dir, { recursive: true });
        const tmp = path.join(dir, `.sedorim-data.${process.pid}.${Date.now()}.tmp`);
        await fs.writeFile(tmp, JSON.stringify(store), "utf8");
        const after = await fileMtime(file);
        if (after !== before) {
          // Another writer touched the file while we were working — our
          // in-memory copy is stale; discard this attempt and retry fresh.
          await fs.unlink(tmp).catch(() => {});
          continue;
        }
        await fs.rename(tmp, file);
        return { ok: true, updatedAt: store.updatedAt };
      }
      throw new Error("saveStoreKey: too much write contention, giving up");
    };
    const result = writeQueue.then(attempt, attempt) as Promise<{ ok: true; updatedAt: number }>;
    writeQueue = result.catch(() => {});
    return result;
  });
