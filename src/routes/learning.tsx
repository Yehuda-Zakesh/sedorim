import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Plus, BookOpen, Clock4, Trash2 } from "lucide-react";
import { useLearning, todayISO } from "@/lib/tracker-store";
import { toast } from "sonner";

export const Route = createFileRoute("/learning")({
  head: () => ({ meta: [{ title: "לימוד נוסף — המעקב שלי" }] }),
  component: LearningPage,
});

function LearningPage() {
  const { items, add, remove } = useLearning();
  const [topic, setTopic] = useState("");
  const [minutes, setMinutes] = useState(60);

  const totalMin = items.reduce((s, i) => s + i.minutes, 0);
  const monthPrefix = todayISO().slice(0, 7);
  const thisMonth = items.filter((i) => i.date.startsWith(monthPrefix)).length;

  const handleAdd = () => {
    if (!topic.trim()) {
      toast.error("יש להזין נושא");
      return;
    }
    add({ id: Date.now().toString(), topic: topic.trim(), date: todayISO(), minutes });
    setTopic(""); setMinutes(60);
    toast.success("השיעור נוסף");
  };

  return (
    <AppShell title="לימוד נוסף" subtitle="שיעורים ותגבורים אישיים">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
        {[
          { label: "סה״כ שעות", value: (totalMin / 60).toFixed(1), icon: Clock4 },
          { label: "מספר שיעורים", value: items.length.toString(), icon: BookOpen },
          { label: "החודש", value: thisMonth.toString(), icon: BookOpen },
        ].map((k) => (
          <div key={k.label} className="card-surface p-5 flex items-center justify-between">
            <div>
              <div className="text-xs text-muted-foreground">{k.label}</div>
              <div className="mt-1 text-2xl font-bold tabular-nums">{k.value}</div>
            </div>
            <div className="size-10 rounded-lg bg-info/10 text-info grid place-items-center">
              <k.icon className="size-5" />
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card-surface p-5">
          <h2 className="text-sm font-semibold mb-4">הוספת שיעור</h2>
          <label className="text-xs text-muted-foreground">נושא</label>
          <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="למשל: תגבור אנגלית"
            className="mt-1 w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
          <label className="text-xs text-muted-foreground mt-3 block">משך (דקות)</label>
          <input type="number" min={1} value={minutes} onChange={(e) => setMinutes(Math.max(1, +e.target.value))}
            className="mt-1 w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
          <button onClick={handleAdd}
            className="mt-4 w-full inline-flex items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            <Plus className="size-4" /> הוסף
          </button>
        </div>

        <div className="card-surface p-5 lg:col-span-2">
          <h2 className="text-sm font-semibold mb-4">שיעורים אחרונים</h2>
          {items.length ? (
            <ul className="divide-y divide-border">
              {items.map((i) => (
                <li key={i.id} className="flex items-center gap-3 py-3">
                  <div className="size-10 rounded-lg bg-primary/10 text-primary grid place-items-center">
                    <BookOpen className="size-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{i.topic}</div>
                    <div className="text-[11px] text-muted-foreground tabular-nums">{i.date} · {i.minutes} דק׳</div>
                  </div>
                  <button onClick={() => { remove(i.id); toast("השיעור נמחק"); }}
                    className="size-8 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive grid place-items-center">
                    <Trash2 className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-center text-sm text-muted-foreground py-10">אין שיעורים עדיין</div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
