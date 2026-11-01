// The advanced search: its filter shape, how a stored one is read back, and the
// matching itself (moved out of the screen unchanged so it can be tested).
import { calcSeder, FRAMEWORK_LABELS, type LearningEntry, type SederEntry } from "./kollel-store";
import { formatDayDate, hoursState, openParams, type JournalSearch } from "./journal";

export type SearchFilter = {
  q: string;
  type: "all" | "seder" | "learning";
  from: string;
  to: string;
  tag: string;
};

export const EMPTY_SEARCH: SearchFilter = { q: "", type: "all", from: "", to: "", tag: "" };

const str = (v: unknown) => (typeof v === "string" ? v.slice(0, 200) : "");

/** Reads a stored or saved filter; unknown or missing fields fall back to empty. */
export function sanitizeSearchFilter(raw: unknown): SearchFilter {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return normalizeSearchFilter({
    q: str(r.q),
    type: r.type === "seder" || r.type === "learning" ? r.type : "all",
    from: str(r.from),
    to: str(r.to),
    tag: str(r.tag),
  });
}

/**
 * Tags exist on seder records only, so a lessons-only search has no tag. Applied
 * on every way a filter can arrive (a type change, storage, a saved favourite)
 * so a disabled control never keeps narrowing the results unseen.
 */
export function normalizeSearchFilter(f: SearchFilter): SearchFilter {
  return f.type === "learning" && f.tag ? { ...f, tag: "" } : f;
}

export type SearchResult = {
  kind: "seder" | "learning";
  date: string;
  title: string;
  desc: string;
  key: string;
  /** The /history params that open exactly this record. */
  open: JournalSearch;
};

function sederDesc(e: SederEntry, net: number): string {
  const h = hoursState(e);
  if (h === "absent") return "היעדרות";
  if (h === "no-hours") return `חסר פירוט שעות · חסר ${net}`;
  if (h === "no-arrival") return `חסרה שעת הגעה · חסר ${net}`;
  return `${e.arrival || "—"} → ${e.departure || "—"} · חסר ${net}`;
}

export function runSearch(
  entries: readonly SederEntry[],
  lessons: readonly LearningEntry[],
  f: SearchFilter,
): SearchResult[] {
  const out: SearchResult[] = [];
  const inRange = (d: string) => (!f.from || d >= f.from) && (!f.to || d <= f.to);
  // Under "learning" the tag is not part of the filter at all.
  const tag = f.type === "learning" ? "" : f.tag;
  const tagMatch = (t?: string[]) => !tag || (t || []).includes(tag);

  if (f.type === "all" || f.type === "seder") {
    for (const e of entries) {
      if (!inRange(e.date)) continue;
      if (!tagMatch(e.tags)) continue;
      const c = calcSeder(e);
      const txt = `${e.date} ${e.note || ""} ${e.excusedReason || ""} ${(e.tags || []).join(" ")}`;
      if (f.q && !txt.includes(f.q)) continue;
      out.push({
        kind: "seder",
        date: e.date,
        key: `s-${e.id}`,
        title: `סדר ${e.seder === 1 ? "א׳" : "ב׳"} · ${formatDayDate(e.date)}`,
        desc: sederDesc(e, c.netMissingMin),
        open: openParams("seder", e),
      });
    }
  }
  // Under "all", a tag filter leaves lessons out (the screen says so): tags only
  // exist on seder records.
  if ((f.type === "all" || f.type === "learning") && !tag) {
    for (const l of lessons) {
      if (!inRange(l.date)) continue;
      const txt = `${FRAMEWORK_LABELS[l.framework]} ${l.date} ${l.note || ""}`;
      if (f.q && !txt.includes(f.q)) continue;
      out.push({
        kind: "learning",
        date: l.date,
        key: `l-${l.id}`,
        title: FRAMEWORK_LABELS[l.framework],
        desc: `${l.minutes} דק׳ · ${formatDayDate(l.date)}`,
        open: openParams("learning", l),
      });
    }
  }
  return out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}
