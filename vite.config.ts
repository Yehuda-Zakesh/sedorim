// Plain Vite SPA. The output in dist/ is embedded straight into the two EXEs
// by Tauri (see src-tauri/), so there is no server, no SSR and no Nitro build
// step any more — the app was already 100% client-side, every route included.
import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    // Must come before the React plugin: it generates src/routeTree.gen.ts
    // from the files in src/routes.
    tanstackRouter({ target: "react", autoCodeSplitting: false }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: { "@": path.resolve(dirname, "./src") },
  },
  server: {
    // Fixed, because src-tauri/*/tauri.conf.json points devUrl here.
    port: 5173,
    strictPort: true,
  },
  build: {
    // Only ever runs in WebView2 (Edge/Chromium), so there is nothing to gain
    // from transpiling down to older syntax.
    target: "chrome110",
    // The bundle ships inside the EXE and loads off local disk: one chunk is
    // faster to start than several, and sourcemaps would only bloat the
    // binary.
    sourcemap: false,
    chunkSizeWarningLimit: 2000,
  },
});
