import { useSyncExternalStore } from "react";
import { currentMonthKey } from "./month-nav";

// The month the user is looking at, shared by the journal, the month summary,
// the stipend and the reports. Pure UI state: it is not data, is never written
// to the shared data file, and resets to the current month on a fresh launch.
// It lives at module level so moving between screens (and back) keeps it.
let selected: string = currentMonthKey();
const listeners = new Set<() => void>();

export function getSelectedMonth(): string {
  return selected;
}

export function setSelectedMonth(key: string): void {
  if (key === selected) return;
  selected = key;
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** [month as YYYY-MM, setter] — the same month on every screen that uses it. */
export function useSelectedMonth(): [string, (key: string) => void] {
  const month = useSyncExternalStore(subscribe, getSelectedMonth, getSelectedMonth);
  return [month, setSelectedMonth];
}
