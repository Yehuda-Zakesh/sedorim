import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildV7StoreFile } from "./v7-store-fixture";

describe("the v7 store fixture", () => {
  const file = buildV7StoreFile();

  it("holds every kind of data an upgrade has to keep", () => {
    for (const key of [
      "seder",
      "learning",
      "timer",
      "settings",
      "theme",
      "onboarded",
      "snapshots",
      "lastAutoBackupAt",
      "notificationsSent",
      "notificationLearning",
      "backgroundPlan",
      "phoneReport",
      "someFutureKey",
      "updatedAt",
    ]) {
      expect(file).toHaveProperty(key);
    }
    expect((file.seder as unknown[]).length).toBeGreaterThan(300);
    expect((file.learning as unknown[]).length).toBeGreaterThan(100);
    expect(file.onboarded).toBe(true);
  });

  it("is reproducible", () => {
    expect(JSON.stringify(buildV7StoreFile())).toBe(JSON.stringify(file));
  });

  // Lays the file down for a test of the real EXE. Off unless asked for, and it
  // writes only where it is told — never to %APPDATA%.
  const out = process.env.SEDORIM_FIXTURE_OUT;
  it.skipIf(!out)("writes the fixture to SEDORIM_FIXTURE_OUT", () => {
    const dir = path.resolve(out!);
    expect(dir.toLowerCase()).not.toContain("appdata\\roaming\\sederplus");
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, "sedorim-data.json"), JSON.stringify(file));
  });
});
