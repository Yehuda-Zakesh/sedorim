import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Search as SearchIcon, Calendar, BookOpen, FileText } from "lucide-react";

export const Route = createFileRoute("/search")({
  head: () => ({ meta: [{ title: "חיפוש — המעקב שלי" }] }),
  component: SearchPage,
});

const all = [
  { type: "attendance", title: "רישום נוכחות", date: "2026-06-03", desc: "איחור · תחבורה ציבורית", icon: Calendar },
  { type: "learning",   title: "תגבור מתמטיקה",  date: "2026-06-04", desc: "60 דקות",               icon: BookOpen },
  { type: "attendance", title: "רישום נוכחות", date: "2026-06-01", desc: "מוצדק · תור רפואי",      icon: Calendar },
  { type: "report",     title: "דוח חודשי מאי",  date: "2026-06-01", desc: "PDF · 4 עמודים",          icon: FileText },
  { type: "learning",   title: "סדנת כתיבה",     date: "2026-05-30", desc: "90 דקות",               icon: BookOpen },
];

const tabs = [
  { key: "all", label: "הכל" },
  { key: "attendance", label: "נוכחות" },
  { key: "learning", label: "לימוד" },
  { key: "report", label: "דוחות" },
];

function SearchPage() {
  const [q, setQ] = useState("");
  const [tab, setTab] = useState("all");

  const results = all.filter((r) =>
    (tab === "all" || r.type === tab) &&
    (q === "" || r.title.includes(q) || r.desc.includes(q) || r.date.includes(q))
  );

  return (
    <AppShell title="חיפוש" subtitle="חיפוש בכל הנתונים האישיים שלך">
      <div className="card-surface p-3 relative mb-4">
        <SearchIcon className="absolute right-5 top-1/2 -translate-y-1/2 size-5 text-muted-foreground" />
        <input
          autoFocus value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="הקלד מילה, תאריך או נושא..."
          className="w-full rounded-md bg-transparent pr-12 pl-3 py-2 text-base focus:outline-none"
        />
      </div>

      <div className="flex gap-1 mb-4">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-1.5 rounded-md text-sm transition ${tab === t.key ? "bg-primary text-primary-foreground" : "hover:bg-accent text-muted-foreground"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="card-surface divide-y divide-border">
        {results.map((r, i) => (
          <div key={i} className="flex items-center gap-3 p-4 hover:bg-accent/40">
            <div className="size-10 rounded-lg bg-primary/10 text-primary grid place-items-center">
              <r.icon className="size-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium">{r.title}</div>
              <div className="text-xs text-muted-foreground">{r.desc}</div>
            </div>
            <span className="text-xs text-muted-foreground tabular-nums">{r.date}</span>
          </div>
        ))}
        {!results.length && <div className="p-12 text-center text-sm text-muted-foreground">לא נמצאו תוצאות</div>}
      </div>
    </AppShell>
  );
}
