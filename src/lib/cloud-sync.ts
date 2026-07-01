import { supabase } from "@/integrations/supabase/client";
import type { SederEntry, LearningEntry } from "./kollel-store";
import type { Settings } from "./settings-store";

let currentUserId: string | null = null;
let hydrating = false;
let hydrated = false;

export function getCurrentUserId() { return currentUserId; }
export function isHydrated() { return hydrated; }

// ---------- mappers ----------
function seder_to_row(e: SederEntry, uid: string) {
  return {
    id: e.id,
    user_id: uid,
    date: e.date,
    seder: e.seder,
    arrival: e.arrival ?? null,
    departure: e.departure ?? null,
    absent: e.absent,
    ohevei: e.ohevei,
    excused_all: e.excusedAll,
    excused_minutes: e.excusedMinutes,
    manual_adjust_min: e.manualAdjustMin,
    tags: e.tags || [],
    note: e.note ?? null,
  };
}
function row_to_seder(r: any): SederEntry {
  return {
    id: r.id,
    date: r.date,
    seder: r.seder as 1 | 2,
    arrival: r.arrival || undefined,
    departure: r.departure || undefined,
    absent: !!r.absent,
    ohevei: !!r.ohevei,
    excusedAll: !!r.excused_all,
    excusedMinutes: r.excused_minutes || 0,
    manualAdjustMin: r.manual_adjust_min || 0,
    tags: r.tags || [],
    note: r.note || undefined,
  };
}
function learning_to_row(l: LearningEntry, uid: string) {
  return {
    id: l.id,
    user_id: uid,
    date: l.date,
    framework: l.framework,
    minutes: l.minutes,
    note: l.note ?? null,
  };
}
function row_to_learning(r: any): LearningEntry {
  return {
    id: r.id,
    date: r.date,
    framework: r.framework,
    minutes: r.minutes,
    source: "manual",
    note: r.note || undefined,
  };
}

// ---------- push (fire-and-forget) ----------
export function pushSeder(e: SederEntry) {
  if (!currentUserId || hydrating) return;
  const uid = currentUserId;
  supabase.from("seder_entries").upsert(seder_to_row(e, uid)).then(({ error }) => {
    if (error) console.warn("[cloud] pushSeder", error.message);
  });
}
export function deleteSederCloud(id: string) {
  if (!currentUserId || hydrating) return;
  supabase.from("seder_entries").delete().eq("id", id).then(({ error }) => {
    if (error) console.warn("[cloud] deleteSeder", error.message);
  });
}
export function pushLearning(l: LearningEntry) {
  if (!currentUserId || hydrating) return;
  const uid = currentUserId;
  supabase.from("learning_entries").upsert(learning_to_row(l, uid)).then(({ error }) => {
    if (error) console.warn("[cloud] pushLearning", error.message);
  });
}
export function deleteLearningCloud(id: string) {
  if (!currentUserId || hydrating) return;
  supabase.from("learning_entries").delete().eq("id", id).then(({ error }) => {
    if (error) console.warn("[cloud] deleteLearning", error.message);
  });
}
export function pushSettings(data: Settings) {
  if (!currentUserId || hydrating) return;
  const uid = currentUserId;
  supabase.from("user_settings").upsert({ user_id: uid, data: data as any }).then(({ error }) => {
    if (error) console.warn("[cloud] pushSettings", error.message);
  });
}

// ---------- hydrate ----------
export async function hydrateFromCloud(userId: string) {
  currentUserId = userId;
  hydrating = true;
  try {
    const [{ data: seder }, { data: learning }, { data: settingsRow }] = await Promise.all([
      supabase.from("seder_entries").select("*").eq("user_id", userId),
      supabase.from("learning_entries").select("*").eq("user_id", userId),
      supabase.from("user_settings").select("*").eq("user_id", userId).maybeSingle(),
    ]);

    const kollel = await import("./kollel-store");
    const { updateSettings } = await import("./settings-store");
    kollel.__replaceSederFromCloud((seder || []).map(row_to_seder));
    kollel.__replaceLearningFromCloud((learning || []).map(row_to_learning));

    if (settingsRow?.data) {
      updateSettings(settingsRow.data as Partial<Settings>, { skipAudit: true });
    }
    hydrated = true;
  } catch (err) {
    console.warn("[cloud] hydrate failed", err);
  } finally {
    hydrating = false;
  }
}

export function clearHydrationState() {
  currentUserId = null;
  hydrated = false;
}