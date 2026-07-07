import { promises as fs } from "fs";
import path from "path";

// Pure file-I/O logic behind the shared store — deliberately separated from
// store.functions.ts (the createServerFn wrappers) so it can be unit-tested
// directly without needing a live TanStack Start server request context.
//
// See store.functions.ts for the "why" (localStorage doesn't work across
// two separate EXE processes).

export type StoreShape = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  seder?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  learning?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  timer?: any;
  updatedAt?: number;
};

export function dataDir(): string {
  return process.env.SEDORIM_DATA_DIR || process.cwd();
}
export function storeFile(): string {
  return path.join(dataDir(), "sedorim-data.json");
}

export async function readStore(): Promise<StoreShape> {
  try {
    const raw = await fs.readFile(storeFile(), "utf8");
    return JSON.parse(raw) as StoreShape;
  } catch {
    return {};
  }
}

export async function fileMtime(file: string): Promise<number | null> {
  try { return (await fs.stat(file)).mtimeMs; } catch { return null; }
}

// ============ Rotating file backups ============
// Safety net for the one file all the app's data now lives in. On every
// successful save we (at most once per BACKUP_MIN_INTERVAL_MS) copy the
// whole store to backups/sedorim-data.<timestamp>.json, then prune down to
// MAX_BACKUPS. This is independent of the in-app backup/restore feature
// (which is a separate, user-facing, localStorage-based history) — this one
// protects against the underlying file itself getting corrupted, deleted,
// or a bad write, regardless of which EXE/window is open.
export const BACKUP_DIR_NAME = "backups";
export const BACKUP_MIN_INTERVAL_MS = 6 * 60 * 60 * 1000; // at most every 6 hours
export const MAX_BACKUPS = 30;

export function backupDir(): string {
  return path.join(dataDir(), BACKUP_DIR_NAME);
}
export function backupFileName(ts: number): string {
  return `sedorim-data.${ts}.json`;
}
export function backupTsFromFileName(name: string): number | null {
  const m = /^sedorim-data\.(\d+)\.json$/.exec(name);
  return m ? Number(m[1]) : null;
}

export async function maybeBackup(store: StoreShape): Promise<void> {
  try {
    const dir = backupDir();
    await fs.mkdir(dir, { recursive: true });
    const existing = (await fs.readdir(dir))
      .map((f) => backupTsFromFileName(f))
      .filter((ts): ts is number => ts !== null)
      .sort((a, b) => a - b);
    const lastTs = existing[existing.length - 1];
    if (lastTs !== undefined && Date.now() - lastTs < BACKUP_MIN_INTERVAL_MS) return;

    const ts = Date.now();
    await fs.writeFile(path.join(dir, backupFileName(ts)), JSON.stringify(store), "utf8");

    const all = [...existing, ts];
    if (all.length > MAX_BACKUPS) {
      const toDelete = all.slice(0, all.length - MAX_BACKUPS);
      await Promise.all(toDelete.map((t) => fs.unlink(path.join(dir, backupFileName(t))).catch(() => {})));
    }
  } catch {
    // Best-effort only — a failed backup must never affect the real save.
  }
}

// Writes are read-modify-write against a shared file, and two EXE processes
// (or two rapid actions in the same process) could otherwise race and clobber
// each other's key. We guard against that two ways:
//  1. A per-process promise queue serializes writes from this process.
//  2. Before renaming the temp file into place we re-check the target file's
//     mtime; if it changed since we read it (the other process wrote in the
//     meantime) we discard our attempt and retry against the fresh data.
let writeQueue: Promise<unknown> = Promise.resolve();

// Saves one or more keys in a single atomic read-modify-write. Callers that
// need to replace several keys together (e.g. restoring a backup that
// contains both seder + learning) MUST use this instead of separate
// saveKey() calls — two independent writes leave a real window where the
// shared file (and anything polling it, like the other EXE/window) can
// observe a partial state with only one of the two keys updated.
export async function saveKeys(
  partial: Partial<Pick<StoreShape, "seder" | "learning" | "timer">>,
): Promise<{ ok: true; updatedAt: number }> {
  const attempt = async (): Promise<{ ok: true; updatedAt: number }> => {
    const file = storeFile();
    for (let i = 0; i < 5; i++) {
      const before = await fileMtime(file);
      const store = await readStore();
      Object.assign(store, partial);
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
      // Fire-and-forget — never delay the actual save waiting on a backup.
      void maybeBackup(store);
      return { ok: true, updatedAt: store.updatedAt };
    }
    throw new Error("saveKeys: too much write contention, giving up");
  };
  const result = writeQueue.then(attempt, attempt) as Promise<{ ok: true; updatedAt: number }>;
  writeQueue = result.catch(() => {});
  return result;
}

export function saveKey(
  key: "seder" | "learning" | "timer",
  value: unknown,
): Promise<{ ok: true; updatedAt: number }> {
  return saveKeys({ [key]: value });
}
