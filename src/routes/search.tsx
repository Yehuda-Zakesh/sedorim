import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { AppShell } from "@/components/app-shell";
import { Search as SearchIcon, Calendar, BookOpen, Star, Save, Trash2, ChevronLeft } from "lucide-react";
import { useSeder, useLearning, calcSeder, FRAMEWORK_LABELS, allTags } from "@/lib/kollel-store";

export const Route = createFileRoute("/search")({
  head: () => ({ meta: [{ title: "חיפוש — המעקב שלי" }] }),
  component: SearchPage,
});

type Filter = {
  q: string;
  type: "all" | "seder" | "learning";
  from: string;
  to: string;
  tag: string;
};

const EMPTY: Filter = { q: "", type: "all", from: "", to: "", tag: "" };
const SAVED_KEY = "tracker.savedFilters.v2";

type SavedFilter = { id: string; name: string; filter: Filter };

function loadSaved(): SavedFilter[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(SAVED_KEY) || "[]"); } catch { return []; }
}
function persistSaved(list: SavedFilter[]) {
  try { localStorage.setItem(SAVED_KEY, JSON.stringify(list)); } catch { /* noop */ }
}

function SearchPage() {
  const { entries } = useSeder();
  const { items: lessons } = useLearning();
  const [f, setF] = useState<Filter>(EMPTY);
  const [saved, setSaved] = useState<SavedFilter[]>(loadSaved());
  const [saveName, setSaveName] = useState("");

  useEffect(() => { persistSaved(saved); }, [saved]);

  const tags = useMemo(() => allTags(), [entries]);

  const results = useMemo(() => {
    const out: { kind: "seder" | "learning"; date: string; title: string; desc: string; key: string }[] = [];
    const inRange = (d: string) => (!f.from || d >= f.from) && (!f.to || d <= f.to);
    const tagMatch = (t?: string[]) => !f.tag || (t || []).includes(f.tag);

    if (f.type === "all" || f.type === "seder") {
      for (const e of entries) {
        if (!inRange(e.date)) continue;
        if (!tagMatch(e.tags)) continue;
        const c = calcSeder(e);
        const txt = `${e.date} ${e.note || ""} ${e.excusedReason || ""} ${(e.tags || []).join(" ")}`;
        if (f.q && !txt.includes(f.q)) continue;
        out.push({
          kind: "seder", date: e.date, key: `s-${e.id}`,
          title: `סדר ${e.seder === 1 ? "א׳" : "ב׳"} · ${e.date}`,
          desc: e.absent ? "היעדרות" : `${e.arrival || "—"} → ${e.departure || "—"} · חסר ${c.netMissingMin}`,
        });
      }
    }
    if (f.type === "all" || f.type === "learning") {
      for (const l of lessons) {
        if (!inRange(l.date)) continue;
        if (f.tag) continue;
        const txt = `${FRAMEWORK_LABELS[l.framework]} ${l.date} ${l.note || ""}`;
        if (f.q && !txt.includes(f.q)) continue;
        out.push({
          kind: "learning", date: l.date, key: `l-${l.id}`,
          title: FRAMEWORK_LABELS[l.framework],
          desc: `${l.minutes} דק׳ · ${l.date}`,
        });
      }
    }
    return out.sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [entries, lessons, f]);

  const saveCurrent = () => {
    if (!saveName.trim()) return;
    setSaved((s) => [...s, { id: Date.now().toString(), name: saveName.trim(), filter: f }]);
    setSaveName("");
  };

  return (
    <AppShell title="חיפוש מתקדם" subtitle="חיפוש בכל הנתונים האישיים שלך">
      <div className="card-surface p-4 relative mb-4">
        <SearchIcon className="absolute right-7 top-7 size-5 text-muted-foreground" />
        <input autoFocus value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })}
          placeholder="חיפוש לפי מילה, תאריך, סיבה, הערה..."
          className="w-full rounded-md bg-transparent pr-10 pl-3 py-2 text-base focus:outline-none border-b border-border" />

        <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
          <select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as Filter["type"] })}
            className="rounded-md border border-input bg-card px-2 py-1.5">
            <option value="all">כל הסוגים</option>
            <option value="seder">סדרים</option>
            <option value="learning">לימוד נוסף</option>
          </select>
          <input type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })}
            className="rounded-md border border-input bg-card px-2 py-1.5" />
          <input type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })}
            className="rounded-md border border-input bg-card px-2 py-1.5" />
          <select value={f.tag} onChange={(e) => setF({ ...f, tag: e.target.value })}
            className="rounded-md border border-input bg-card px-2 py-1.5">
            <option value="">כל התגיות</option>
            {tags.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <input value={saveName} onChange={(e) => setSaveName(e.target.value)} placeholder="שם לסינון מועדף..."
            className="flex-1 rounded-md border border-input bg-card px-2 py-1.5 text-xs" />
          <button onClick={saveCurrent} disabled={!saveName.trim()}
            className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground disabled:opacity-50">
            <Save className="size-3.5" /> שמור
          </button>
          <button onClick={() => setF(EMPTY)} className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-accent">איפוס</button>
        </div>
      </div>

      {saved.length > 0 && (
        <div className="card-surface p-3 mb-4 flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground inline-flex items-center gap-1"><Star className="size-3.5" /> מועדפים:</span>
          {saved.map((s) => (
            <span key={s.id} className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs">
              <button onClick={() => setF(s.filter)} className="hover:underline">{s.name}</button>
              <button onClick={() => setSaved((list) => list.filter((x) => x.id !== s.id))}
                className="text-muted-foreground hover:text-destructive">
                <Trash2 className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="card-surface divide-y divide-border">
        {results.map((r) => (
          <Link key={r.key} to={r.kind === "seder" ? "/history" : "/learning"}
            className="flex items-center gap-3 p-4 hover:bg-accent/40 transition">
            <div className="size-10 rounded-lg bg-primary/10 text-primary grid place-items-center">
              {r.kind === "seder" ? <Calendar className="size-5" /> : <BookOpen className="size-5" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{r.title}</div>
              <div className="text-xs text-muted-foreground truncate">{r.desc}</div>
            </div>
            <ChevronLeft className="size-4 text-muted-foreground" />
          </Link>
        ))}
        {!results.length && <div className="p-12 text-center text-sm text-muted-foreground">לא נמצאו תוצאות</div>}
      </div>
    </AppShell>
  );
}
