// The switch behind "תזכורות גם כשהתוכנה סגורה".
//
// Three things have to line up for that sentence to be true, and this is the
// one place that does all three, so the switch in Settings and the one in the
// first-run wizard cannot end up meaning different things:
//
//   1. `settings.background.enabled` — the flag the agent itself obeys. It
//      re-reads it once a minute and exits when it goes false, which is how
//      switching off works even if the registry write below fails.
//   2. The plan (background-plan.ts) — without it the agent knows nothing
//      about today and stays silent, so it is written before the process is
//      started, not after.
//   3. The Run entry and the process, which only Rust can do
//      (src-tauri/core/src/background.rs).
//
// Desktop notifications come on with it. They are off by default because a
// Windows toast talks over whatever the user is doing and has to be asked
// for — but asking for reminders while the app is closed *is* asking for
// that, and leaving the two switches to disagree would mean turning the
// feature on and getting silence.

import { invoke, isDesktop } from "./tauri";
import { saveStoreKeys } from "./store-bridge";
import { getSettings, updateSettings } from "./settings-store";
import { clearBackgroundPlan, refreshBackgroundPlan } from "./background-plan";
import { logProblem } from "./diagnostics";

export type BackgroundResult = { ok: boolean; error?: string };

export function isBackgroundEnabled(): boolean {
  return getSettings().background.enabled;
}

export async function setBackgroundEnabled(enabled: boolean): Promise<BackgroundResult> {
  const before = getSettings();

  if (enabled) {
    updateSettings({
      background: { enabled: true },
      notifications: { ...before.notifications, desktop: true },
    });
    refreshBackgroundPlan();
  } else {
    // Flag first: this alone is enough to stop the agent, whatever happens
    // next.
    updateSettings({ background: { enabled: false } });
    clearBackgroundPlan();
  }

  // In a browser (`npm run dev`) there is no agent to start; the flag and the
  // plan are still worth writing so the rules can be exercised.
  if (!isDesktop) return { ok: true };

  // Wait for the flag to actually be on disk before starting the process that
  // reads it. updateSettings above writes fire-and-forget, and the agent's
  // first act is to read `settings.background.enabled` and exit if it is
  // false — so without this, switching the feature on could start an agent
  // that immediately quits, and nothing would say why.
  try {
    await saveStoreKeys({ settings: getSettings() });
  } catch (err) {
    logProblem("שמירת מצב הרקע", err);
    return { ok: false, error: String(err) };
  }

  try {
    await invoke<void>("set_background_agent", { enabled });
    return { ok: true };
  } catch (err) {
    logProblem("הפעלת מצב הרקע", err);
    if (enabled) {
      // Nothing is running, so the flag must not claim otherwise.
      updateSettings({ background: { enabled: false } });
      clearBackgroundPlan();
    }
    return { ok: false, error: String(err) };
  }
}

/**
 * Whether Windows is actually set to start the agent at login.
 *
 * Asked of the registry rather than of the saved flag: the two can disagree —
 * a cleanup tool, another profile, an install that was moved — and the
 * Settings screen should show what will really happen tomorrow morning.
 */
export async function isRegisteredToStartWithWindows(): Promise<boolean> {
  if (!isDesktop) return false;
  try {
    return await invoke<boolean>("background_agent_registered");
  } catch {
    return false;
  }
}
