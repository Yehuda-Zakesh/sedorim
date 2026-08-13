import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const dirname = path.dirname(fileURLToPath(import.meta.url));

// Deliberately minimal: these are pure-logic unit tests, so all they need is
// the `@` path alias. The file-store tests live on the Rust side now
// (src-tauri/core/src/store.rs) — run them with `npm run test:rust`.
export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(dirname, "./src") },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
