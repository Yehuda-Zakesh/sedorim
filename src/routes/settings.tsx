import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { ChevronDown, User, Bell, Palette, Globe, Shield, Database, Search } from "lucide-react";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "הגדרות — המעקב שלי" }] }),
  component: SettingsPage,
});

const sections = [
  {
    id: "profile", label: "פרופיל אישי", icon: User,
    fields: [
      { label: "שם", type: "text", value: "ישראל ישראלי" },
      { label: "כיתה", type: "text", value: "י׳1" },
    ],
  },
  {
    id: "notifications", label: "התראות", icon: Bell,
    toggles: [
      { label: "תזכורת לרישום נוכחות יומית", on: true },
      { label: "התראה כשמתקרב למכסת איחורים", on: true },
      { label: "סיכום שבועי במייל", on: false },
    ],
  },
  {
    id: "appearance", label: "מראה ועיצוב", icon: Palette,
    options: [
      { label: "ערכת נושא", value: "אוטומטי" },
      { label: "גודל גופן", value: "רגיל" },
    ],
  },
  {
    id: "language", label: "שפה ואזור", icon: Globe,
    options: [
      { label: "שפת ממשק", value: "עברית" },
      { label: "פורמט תאריך", value: "עברי + לועזי" },
    ],
  },
  {
    id: "privacy", label: "פרטיות ואבטחה", icon: Shield,
    toggles: [
      { label: "נעילת המסך עם סיסמה", on: false },
      { label: "תיעוד פעולות ביומן ביקורת", on: true },
    ],
  },
  {
    id: "data", label: "נתונים וגיבוי", icon: Database,
    options: [
      { label: "גיבוי אוטומטי", value: "שבועי" },
    ],
  },
];

function SettingsPage() {
  const [open, setOpen] = useState<string | null>("profile");
  const [q, setQ] = useState("");

  const visible = sections.filter((s) => s.label.includes(q));

  return (
    <AppShell title="הגדרות" subtitle="העדפות אישיות וקונפיגורציה">
      <div className="card-surface p-3 mb-4 relative">
        <Search className="absolute right-5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <input
          value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="חיפוש בהגדרות..."
          className="w-full rounded-md bg-transparent pr-9 pl-3 py-1.5 text-sm focus:outline-none"
        />
      </div>

      <div className="space-y-3">
        {visible.map((s) => {
          const isOpen = open === s.id;
          return (
            <div key={s.id} className="card-surface overflow-hidden">
              <button
                onClick={() => setOpen(isOpen ? null : s.id)}
                className="w-full flex items-center gap-3 px-5 py-4 text-right hover:bg-accent/40 transition"
              >
                <div className="size-9 rounded-md bg-primary/10 text-primary grid place-items-center">
                  <s.icon className="size-4" />
                </div>
                <span className="flex-1 text-sm font-semibold">{s.label}</span>
                <ChevronDown className={`size-4 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
              </button>

              {isOpen && (
                <div className="px-5 pb-5 border-t border-border space-y-3 pt-4">
                  {s.fields?.map((f) => (
                    <div key={f.label} className="grid grid-cols-3 gap-3 items-center">
                      <label className="text-xs text-muted-foreground">{f.label}</label>
                      <input defaultValue={f.value}
                        className="col-span-2 rounded-md border border-input bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                    </div>
                  ))}
                  {s.options?.map((o) => (
                    <div key={o.label} className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
                      <span className="text-sm">{o.label}</span>
                      <span className="text-sm text-muted-foreground">{o.value}</span>
                    </div>
                  ))}
                  {s.toggles?.map((t) => <Toggle key={t.label} {...t} />)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </AppShell>
  );
}

function Toggle({ label, on }: { label: string; on: boolean }) {
  const [v, setV] = useState(on);
  return (
    <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
      <span className="text-sm">{label}</span>
      <button
        onClick={() => setV(!v)}
        className={`relative h-6 w-11 rounded-full transition ${v ? "bg-primary" : "bg-muted"}`}
      >
        <span className={`absolute top-0.5 size-5 rounded-full bg-card shadow transition-all ${v ? "right-0.5" : "right-[22px]"}`} />
      </button>
    </div>
  );
}
