import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { AppShell } from "@/components/app-shell";
import {
  Search as SearchIcon,
  Calendar,
  BookOpen,
  Star,
  Save,
  Trash2,
  ChevronLeft,
} from "lucide-react";
import { useSeder, useLearning, allTags } from "@/lib/kollel-store";
import {
  EMPTY_SEARCH,
  normalizeSearchFilter,
  runSearch,
  sanitizeSearchFilter,
  type SearchFilter,
} from "@/lib/journal-search";
import { useSearchFilter } from "@/lib/journal-state";

export const Route = createFileRoute("/search")({
  head: () => ({ meta: [{ title: "חיפוש — המעקב שלי" }] }),
  // `q` lets another screen (the calendar's search box) start a search here.
  validateSearch: (search: Record<string, unknown>): { q?: string } =>
    typeof search.q === "string" && search.q ? { q: search.q.slice(0, 200) } : {},
  component: SearchPage,
});

const SAVED_KEY = "sederplus.savedFilters.v1";
const SAVED_LEGACY_KEY = "tracker.savedFilters.v2";

type SavedFilter = { id: string; name: string; filter: SearchFilter };

function loadSaved(): SavedFilter[] {
  if (typeof window === "undefined") return [];
  // Pre-rename installs still carry the old key; read it once as a fallback so
  // saved filters survive the upgrade.
  try {
    const raw = localStorage.getItem(SAVED_KEY) ?? localStorage.getItem(SAVED_LEGACY_KEY);
    const list: unknown = JSON.parse(raw || "[]");
    if (!Array.isArray(list)) return [];
    return list
      .filter((s) => s && typeof s.id === "string" && typeof s.name === "string")
      .map((s) => ({ id: s.id, name: s.name, filter: sanitizeSearchFilter(s.filter) }));
  } catch {
    return [];
  }
}
function persistSaved(list: SavedFilter[]) {
  try {
    localStorage.setItem(SAVED_KEY, JSON.stringify(list));
  } catch {
    /* noop */
  }
}

function SearchPage() {
  const { entries } = useSeder();
  const { items: lessons } = useLearning();
  // Module-level, so the search is still there after opening a result and coming back.
  const [f, setF] = useSearchFilter();
  const [saved, setSaved] = useState<SavedFilter[]>(loadSaved);
  const [saveName, setSaveName] = useState("");
  const { q: incomingQ } = Route.useSearch();
  const navigate = useNavigate();

  useEffect(() => {
    if (incomingQ === undefined) return;
    setF({ ...EMPTY_SEARCH, q: incomingQ });
    void navigate({ to: "/search", search: {}, replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once per incoming query
  }, [incomingQ]);

  useEffect(() => {
    persistSaved(saved);
  }, [saved]);

  const tags = useMemo(() => allTags(entries), [entries]);
  const results = useMemo(() => runSearch(entries, lessons, f), [entries, lessons, f]);

  const saveCurrent = () => {
    if (!saveName.trim()) return;
    setSaved((s) => [...s, { id: Date.now().toString(), name: saveName.trim(), filter: f }]);
    setSaveName("");
  };

  return (
    <AppShell title="חיפוש מתקדם" subtitle="חיפוש בכל הנתונים האישיים שלך">
      <div className="card-surface p-4 relative mb-6">
        <SearchIcon
          className="absolute start-7 top-7 size-5 text-muted-foreground"
          aria-hidden="true"
        />
        <input
          autoFocus
          type="search"
          value={f.q}
          onChange={(e) => setF({ ...f, q: e.target.value })}
          aria-label="חיפוש לפי מילה, תאריך, סיבה או הערה"
          placeholder="חיפוש לפי מילה, תאריך, סיבה, הערה..."
          className="w-full rounded-md bg-transparent ps-10 pe-3 py-2 text-base focus:outline-none border-b border-border"
        />

        <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
          <select
            aria-label="סוג רישום"
            value={f.type}
            onChange={(e) =>
              setF(normalizeSearchFilter({ ...f, type: e.target.value as SearchFilter["type"] }))
            }
            className="field-input-sm"
          >
            <option value="all">כל הסוגים</option>
            <option value="seder">סדרים</option>
            <option value="learning">לימוד נוסף</option>
          </select>
          <input
            type="date"
            aria-label="מתאריך"
            value={f.from}
            onChange={(e) => setF({ ...f, from: e.target.value })}
            className="field-input-sm tabular-nums"
          />
          <input
            type="date"
            aria-label="עד תאריך"
            value={f.to}
            onChange={(e) => setF({ ...f, to: e.target.value })}
            className="field-input-sm tabular-nums"
          />
          <select
            aria-label="תגית"
            value={f.tag}
            disabled={f.type === "learning" || (tags.length === 0 && !f.tag)}
            title={f.type === "learning" ? "לרישומי לימוד אין תגיות" : undefined}
            onChange={(e) => setF({ ...f, tag: e.target.value })}
            className="field-input-sm disabled:opacity-50"
          >
            <option value="">כל התגיות</option>
            {tags.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        {f.tag && f.type === "all" && (
          <p className="mt-2 text-sm text-muted-foreground">
            סינון לפי תגית חל על רישומי סדרים בלבד — רישומי לימוד אינם נושאים תגיות ולכן אינם
            מוצגים.
          </p>
        )}

        <div className="mt-3 flex items-center gap-2">
          <input
            aria-label="שם לסינון מועדף"
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            placeholder="שם לסינון מועדף..."
            className="field-input-sm flex-1"
          />
          <button
            onClick={saveCurrent}
            disabled={!saveName.trim()}
            className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground disabled:opacity-50"
          >
            <Save className="size-3.5" aria-hidden="true" /> שמור
          </button>
          <button
            onClick={() => setF(EMPTY_SEARCH)}
            className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-accent"
          >
            איפוס
          </button>
        </div>
      </div>

      {saved.length > 0 && (
        <div className="section-rule mb-4 flex flex-wrap items-center gap-2 pt-3">
          <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
            <Star className="size-3.5" aria-hidden="true" /> מועדפים:
          </span>
          {saved.map((s) => (
            <span
              key={s.id}
              className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs"
            >
              <button
                onClick={() => setF(normalizeSearchFilter(s.filter))}
                className="hover:underline"
              >
                {s.name}
              </button>
              <button
                onClick={() => setSaved((list) => list.filter((x) => x.id !== s.id))}
                aria-label={`מחק סינון מועדף: ${s.name}`}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="size-3" aria-hidden="true" />
              </button>
            </span>
          ))}
        </div>
      )}

      <p className="mb-2 text-sm text-muted-foreground" aria-live="polite">
        {results.length} תוצאות
      </p>
      <div className="ledger border-y border-border">
        {results.map((r) => (
          // Opens that exact record: its month is selected and its details dialog opened.
          <Link
            key={r.key}
            to="/history"
            search={r.open}
            className="row-pad flex items-center gap-4 hover:bg-accent/40 pressable"
          >
            <div className="w-16 shrink-0 text-xs font-semibold text-muted-foreground">
              {r.kind === "seder" ? "נוכחות" : "לימוד נוסף"}
            </div>
            <div className="flex-1 min-w-0">
              <div className="truncate text-sm font-medium">{r.title}</div>
              <div className="figure truncate text-sm text-muted-foreground">{r.desc}</div>
            </div>
            <ChevronLeft className="size-4 text-muted-foreground" aria-hidden="true" />
          </Link>
        ))}
        {!results.length && (
          <div className="p-12 text-center text-sm text-muted-foreground">לא נמצאו תוצאות</div>
        )}
      </div>
    </AppShell>
  );
}
