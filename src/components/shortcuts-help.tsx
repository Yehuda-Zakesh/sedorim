// The keyboard-shortcut list, as a real dialog: Radix supplies role="dialog",
// the focus trap, Escape, focus return to whatever opened it, and the scroll
// lock. The rows are read from SHORTCUTS, so the list cannot drift from what
// the shortcuts actually do.
import { SHORTCUTS } from "@/lib/shortcuts";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function ShortcutsHelp({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle className="title-serif text-xl">קיצורי מקלדת</DialogTitle>
          <DialogDescription>
            הקיצורים פועלים כשאין שדה טקסט בפוקוס. Escape סוגר חלון זה.
          </DialogDescription>
        </DialogHeader>
        <ul className="ledger text-sm">
          {SHORTCUTS.map((s) => (
            <li key={s.keys} className="row-pad flex items-center justify-between gap-3">
              <span>{s.label}</span>
              <kbd
                className="figure rounded-sm border border-border bg-secondary px-2 py-0.5 font-mono text-xs text-foreground"
                dir="ltr"
              >
                {s.keys}
              </kbd>
            </li>
          ))}
        </ul>
        <p className="text-sm text-muted-foreground">
          קיצור בשני חלקים (כמו <span className="font-mono">g d</span>): מקישים את שני המקשים זה אחר
          זה, תוך שנייה.
        </p>
      </DialogContent>
    </Dialog>
  );
}
