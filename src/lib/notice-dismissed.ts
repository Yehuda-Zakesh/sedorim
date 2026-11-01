import { useSyncExternalStore } from "react";

// A notice the user has acknowledged stays dismissed for the rest of the run.
// It is kept here and not in the component's state because every screen mounts
// its own shell: with component state, the same notice came back on each screen
// the user opened and had to be confirmed again.

const dismissed = new Set<string>();
const listeners = new Set<() => void>();

export function dismissNotice(id: string): void {
  if (dismissed.has(id)) return;
  dismissed.add(id);
  listeners.forEach((fn) => fn());
}

export function isNoticeDismissed(id: string): boolean {
  return dismissed.has(id);
}

export function useNoticeDismissed(id: string): boolean {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    () => dismissed.has(id),
    () => false,
  );
}

/** Test helper. */
export function resetDismissedNotices(): void {
  dismissed.clear();
  listeners.forEach((fn) => fn());
}
