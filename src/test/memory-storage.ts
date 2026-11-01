// The unit tests run in plain Node, which has no localStorage. The data layer's
// dev path (store-bridge.ts) stores in it, and a save that cannot reach it is a
// failed save — which now rolls the in-memory value back. This gives every test
// file an in-memory localStorage so saves succeed, unless the test installs its
// own.
import { beforeEach } from "vitest";

if (typeof globalThis.localStorage === "undefined") {
  const data = new Map<string, string>();
  const memory = {
    getItem: (k: string) => (data.has(k) ? (data.get(k) as string) : null),
    setItem: (k: string, v: string) => void data.set(k, String(v)),
    removeItem: (k: string) => void data.delete(k),
    clear: () => data.clear(),
    key: (i: number) => [...data.keys()][i] ?? null,
    get length() {
      return data.size;
    },
  };
  Object.defineProperty(globalThis, "localStorage", {
    value: memory,
    configurable: true,
    writable: true,
  });
  // Every test starts with an empty store, as it did when there was none.
  beforeEach(() => data.clear());
}
