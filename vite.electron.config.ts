// Electron-specific build: produces a Node-runnable server bundle that
// Electron will spawn locally and load via BrowserWindow.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  nitro: {
    preset: "node-server",
  },
  vite: {
    resolve: {
      alias: {
        // The packaged desktop app is fully offline/single-user and never
        // uses Supabase/Lovable sign-in — swap in a no-op stub so the whole
        // @supabase/supabase-js dependency chain (~600KB+) never enters
        // this build. The normal web/Lovable build (vite.config.ts) points
        // this same specifier at the real middleware instead.
        "@sedorim/auth-middleware": path.resolve(dirname, "src/lib/electron-stubs/auth-attacher.stub.ts"),
      },
    },
  },
});
