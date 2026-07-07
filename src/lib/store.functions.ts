import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { readStore, saveKey } from "./store-io";

// Server-side, file-backed key/value store shared by every window/process
// that talks to this Nitro server instance. Replaces per-window localStorage
// so that SederPlus.exe and SederPlusQuick.exe (two separate OS processes
// that cannot safely share one Chromium profile/localStorage) always read
// and write the exact same data.
//
// Storage location: SEDORIM_DATA_DIR (set by the Electron main/quick process
// to the same shared userData folder already used for the app), falling
// back to the current working directory for local dev / hosted preview.
//
// The actual file I/O (read/write/backup/concurrency-guard) lives in
// store-io.ts as plain functions, so it can be unit-tested directly without
// needing a live TanStack Start server request context — this file is just
// the createServerFn RPC wrapper around it.

export const loadStore = createServerFn({ method: "GET" }).handler(async () => {
  return await readStore();
});

export const saveStoreKey = createServerFn({ method: "POST" })
  .inputValidator(z.object({
    key: z.enum(["seder", "learning", "timer"]),
    value: z.unknown(),
  }))
  .handler(async ({ data }) => {
    return await saveKey(data.key, data.value);
  });
