import { useSyncExternalStore } from "react";
import { DEFAULT_VIEW, sanitizeView, type JournalView } from "./journal";
import { EMPTY_SEARCH, sanitizeSearchFilter, type SearchFilter } from "./journal-search";

// Where the user was in the journal — list filters and the advanced search —
// kept at module level (and mirrored to sessionStorage) so opening a record,
// moving to another screen and coming back does not reset them. Pure UI state:
// not part of the data file or the backup, gone when the window closes.
const VIEW_KEY = "sederplus.journalView.v1";
const SEARCH_KEY = "sederplus.journalSearch.v1";

function readSession(key: string): unknown {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? JSON.parse(raw) : undefined;
  } catch {
    return undefined;
  }
}
function writeSession(key: string, value: unknown) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode / quota: the module copy still works */
  }
}

function makeStore<T>(key: string, initial: T, sanitize: (raw: unknown) => T) {
  let value: T = (() => {
    const saved = readSession(key);
    return saved === undefined ? initial : sanitize(saved);
  })();
  const listeners = new Set<() => void>();
  const subscribe = (l: () => void) => {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  };
  const get = () => value;
  const set = (next: T) => {
    value = next;
    writeSession(key, next);
    listeners.forEach((l) => l());
  };
  return { subscribe, get, set };
}

const viewStore = makeStore<JournalView>(VIEW_KEY, DEFAULT_VIEW, sanitizeView);
const searchStore = makeStore<SearchFilter>(SEARCH_KEY, EMPTY_SEARCH, sanitizeSearchFilter);

export function useJournalView(): [JournalView, (patch: Partial<JournalView>) => void] {
  const v = useSyncExternalStore(viewStore.subscribe, viewStore.get, viewStore.get);
  return [v, (patch) => viewStore.set({ ...viewStore.get(), ...patch })];
}

export function resetJournalFilters() {
  viewStore.set({ ...DEFAULT_VIEW, tab: viewStore.get().tab });
}

export function useSearchFilter(): [SearchFilter, (next: SearchFilter) => void] {
  const v = useSyncExternalStore(searchStore.subscribe, searchStore.get, searchStore.get);
  return [v, searchStore.set];
}
