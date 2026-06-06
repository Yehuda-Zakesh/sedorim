import { Keyboard, X } from "lucide-react";
import { SHORTCUTS } from "@/lib/shortcuts";

export function ShortcutsHelp({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-sm grid place-items-center p-4"
      onClick={onClose}>
      <div className="card-surface w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 mb-4">
          <Keyboard className="size-5 text-primary" />
          <h2 className="text-base font-semibold flex-1">קיצורי מקלדת</h2>
          <button onClick={onClose} className="size-8 rounded-md hover:bg-accent grid place-items-center">
            <X className="size-4" />
          </button>
        </div>
        <ul className="divide-y divide-border text-sm">
          {SHORTCUTS.map((s) => (
            <li key={s.keys} className="flex items-center justify-between py-2">
              <span>{s.label}</span>
              <span className="font-mono text-xs px-2 py-1 rounded bg-muted">{s.keys}</span>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-muted-foreground">
          קיצורים כפולים (כמו <span className="font-mono">g d</span>) — הקש בזה אחר זה תוך שנייה.
        </p>
      </div>
    </div>
  );
}
