import { createRoot } from "react-dom/client";
import { RouterProvider, createHashHistory, createRouter } from "@tanstack/react-router";

import { routeTree } from "./routeTree.gen";
import { installGlobalErrorLogging } from "./lib/diagnostics";
import "./styles.css";

// Before anything else runs: inside a packaged EXE there is no console, so an
// error that escapes React would otherwise leave no trace at all. This writes
// it to %APPDATA%\SederPlus\logs\sederplus.log, which Settings → "יומן תקלות"
// shows.
installGlobalErrorLogging();

// The EXEs open index.html with no hash at all, and SederPlusQuick.exe adds
// ?mode=quick (see src-tauri/core/src/lib.rs) — that query is all the
// frontend needs to know about which one it's running inside.
//
// Seed a real route before createHashHistory() reads the URL below. Without
// this the history starts on an empty path rather than "/", which fails to
// resolve and lands the user on the root error page until they navigate
// somewhere by hand. Setting the hash on the same document does not reload.
if (!window.location.hash.startsWith("#/")) {
  const quick = new URLSearchParams(window.location.search).get("mode") === "quick";
  window.location.hash = quick ? "#/quick" : "#/";
}

// Hash routing, deliberately: the frontend is embedded in the EXE and served
// by Tauri's asset protocol, which resolves a real path like /reports against
// the embedded files and finds nothing. With the route in the hash, every
// navigation — and every reload — stays on the one index.html that exists.
const router = createRouter({
  routeTree,
  history: createHashHistory(),
  scrollRestoration: true,
  defaultPreloadStaleTime: 0,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("#root is missing from index.html");

createRoot(rootElement).render(<RouterProvider router={router} />);
