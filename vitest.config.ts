import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dirname = path.dirname(fileURLToPath(import.meta.url));

// Deliberately minimal — the real app build goes through vite.config.ts /
// vite.electron.config.ts (TanStack Start + Nitro). Tests only need the `@`
// path alias resolved; pulling in the full app plugin chain here would slow
// tests down and isn't needed for pure-logic unit tests.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(dirname, "./src"),
      "@sedorim/auth-middleware": path.resolve(dirname, "./src/integrations/supabase/auth-attacher.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
