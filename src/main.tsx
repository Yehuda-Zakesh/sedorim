import { createRoot } from "react-dom/client";
import { RouterProvider, createHashHistory, createRouter } from "@tanstack/react-router";

import { routeTree } from "./routeTree.gen";
import "./styles.css";

// SederPlusQuick.exe opens index.html?mode=quick (see
// src-tauri/core/src/lib.rs), which is all the frontend needs to know about
// which EXE it's running inside.
if (
  new URLSearchParams(window.location.search).get("mode") === "quick" &&
  !window.location.hash.startsWith("#/")
) {
  // Same document, so this is just seeding the initial route below — it does
  // not reload the page.
  window.location.hash = "#/quick";
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
