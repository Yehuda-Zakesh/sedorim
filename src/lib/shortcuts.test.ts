// The shortcut table itself. useGlobalShortcuts needs a DOM and a router, so
// what is checked here is that the table stays consistent with the routes that
// actually exist — the failure mode being a shortcut that silently goes nowhere.
import { describe, it, expect } from "vitest";
import { readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { SHORTCUTS } from "./shortcuts";

const routesDir = resolve(dirname(fileURLToPath(import.meta.url)), "../routes");

/** Every path the file-based router serves, derived from src/routes. */
const ROUTE_PATHS = new Set(
  readdirSync(routesDir)
    .filter((name) => name.endsWith(".tsx") && !name.startsWith("__"))
    .map((name) => {
      const base = name.replace(/\.tsx$/, "");
      return base === "index" ? "/" : `/${base}`;
    }),
);

describe("SHORTCUTS", () => {
  it("is not empty", () => {
    expect(SHORTCUTS.length).toBeGreaterThan(5);
  });

  it("gives every entry a key and a label", () => {
    for (const s of SHORTCUTS) {
      expect(s.keys, JSON.stringify(s)).toBeTruthy();
      expect(s.label, JSON.stringify(s)).toBeTruthy();
    }
  });

  it("uses each key combination only once", () => {
    const keys = SHORTCUTS.map((s) => s.keys);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("uses each label only once", () => {
    const labels = SHORTCUTS.map((s) => s.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("labels everything in Hebrew", () => {
    for (const s of SHORTCUTS) {
      expect(s.label, s.keys).toMatch(/[֐-׿]/);
    }
  });

  it("points every destination at a route that exists", () => {
    for (const s of SHORTCUTS) {
      if (!s.to) continue;
      expect(ROUTE_PATHS, `${s.keys} → ${s.to}`).toContain(s.to);
    }
  });

  it("writes chords as 'g x' — a single space and one following key", () => {
    for (const s of SHORTCUTS) {
      if (!s.keys.includes(" ")) continue;
      expect(s.keys, s.keys).toMatch(/^g .$/);
    }
  });

  it("uses single characters for the non-chord shortcuts", () => {
    for (const s of SHORTCUTS) {
      if (s.keys.includes(" ")) continue;
      expect(s.keys.length, s.keys).toBe(1);
    }
  });

  it("gives the help shortcut no destination", () => {
    const help = SHORTCUTS.find((s) => s.keys === "?");
    expect(help).toBeDefined();
    expect(help!.to).toBeUndefined();
    expect(help!.action).toBeUndefined();
  });

  it("has a chord for the dashboard and for search", () => {
    expect(SHORTCUTS.find((s) => s.to === "/")).toBeDefined();
    expect(SHORTCUTS.find((s) => s.to === "/search")).toBeDefined();
  });

  it("does not advertise a shortcut with neither a destination nor an action, except help", () => {
    for (const s of SHORTCUTS) {
      if (s.keys === "?") continue;
      expect(Boolean(s.to || s.action), s.keys).toBe(true);
    }
  });

  it("covers the main navigation routes", () => {
    // The quick window and the About screen are reached other ways; everything
    // else in the sidebar should be one chord away.
    const expected = [
      "/",
      "/attendance",
      "/calendar",
      "/history",
      "/learning",
      "/statistics",
      "/insights",
      "/reports",
      "/backup",
      "/audit",
      "/settings",
      "/search",
    ];
    const covered = SHORTCUTS.map((s) => s.to);
    for (const path of expected) expect(covered, path).toContain(path);
  });
});

describe("the routes directory", () => {
  it("was actually found — otherwise the route check above proves nothing", () => {
    expect(ROUTE_PATHS.size).toBeGreaterThan(10);
    expect(ROUTE_PATHS).toContain("/");
  });
});
