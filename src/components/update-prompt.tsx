// The only visible part of the updater: one question, asked once a new version
// exists. There is no "check for updates" button anywhere in the app and no
// setting behind this — see src/lib/updater.ts.
import { useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "lucide-react";
import type { UpdateInfo } from "@/lib/updater";
import { installUpdate } from "@/lib/updater";
import { openExternal } from "@/lib/open-external";
import { toast } from "sonner";

export function UpdatePrompt({ info, onClose }: { info: UpdateInfo; onClose: () => void }) {
  const [installing, setInstalling] = useState(false);
  const primaryRef = useRef<HTMLButtonElement>(null);

  const install = async () => {
    if (!info.downloadUrl) return;
    setInstalling(true);
    try {
      await installUpdate(info.downloadUrl);
      // The installer is running now and will close the app itself; leaving
      // the dialog up with its spinner is the honest state of things.
      toast.success("העדכון מותקן — התוכנה תיסגר ותיפתח מחדש");
    } catch (err) {
      setInstalling(false);
      toast.error(err instanceof Error ? err.message : "ההתקנה נכשלה");
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o && !installing) onClose();
      }}
    >
      <DialogContent
        dir="rtl"
        className="max-w-md"
        // While the installer runs the dialog cannot be dismissed by any route.
        onInteractOutside={(e) => installing && e.preventDefault()}
        onEscapeKeyDown={(e) => installing && e.preventDefault()}
        // Land on the question's answer, not on the corner close button.
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          primaryRef.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle className="title-serif text-xl">יש גרסה חדשה</DialogTitle>
          {/* The release notes used to be printed here verbatim. They are
              written for a repository, not for this dialog, and they carry
              links — so the dialog says the one thing it exists to say: there
              is a new version, and here is the button that installs it. */}
          <DialogDescription>
            {info.canInstall
              ? "לעדכן עכשיו? הקובץ יורד, התוכנה נסגרת ונפתחת מחדש בגרסה החדשה. אפשר גם לעדכן בפעם הבאה."
              : "לא נמצא קובץ התקנה בגרסה הזו. אפשר לפתוח את דף ההורדה בדפדפן."}
          </DialogDescription>
        </DialogHeader>
        <dl className="ledger text-sm">
          <div className="row-pad flex justify-between gap-4">
            <dt className="text-muted-foreground">מותקנת</dt>
            <dd className="figure">גרסה {info.current}</dd>
          </div>
          <div className="row-pad flex justify-between gap-4">
            <dt className="text-muted-foreground">חדשה</dt>
            <dd className="figure font-semibold">גרסה {info.latest}</dd>
          </div>
        </dl>
        <DialogFooter className="flex-row-reverse gap-2 sm:justify-start">
          {info.canInstall ? (
            <Button ref={primaryRef} onClick={install} disabled={installing} aria-busy={installing}>
              {installing ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Download className="size-4" aria-hidden="true" />
              )}
              {installing ? "מתקין..." : "עדכן עכשיו"}
            </Button>
          ) : (
            info.downloadUrl && (
              /* Opens in the user's real browser, not the app window — a
                 WebView ignores target="_blank", so an <a> would do nothing.
                 See open_external_url in src-tauri/core. */
              <Button
                ref={primaryRef}
                onClick={() => {
                  openExternal(info.downloadUrl!);
                  onClose();
                }}
              >
                <Download className="size-4" />
                הורדה
              </Button>
            )
          )}
          <Button variant="ghost" disabled={installing} onClick={onClose}>
            מאוחר יותר
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
