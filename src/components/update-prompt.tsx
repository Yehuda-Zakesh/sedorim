// The only visible part of the updater: one question, asked once a new version
// exists. There is no "check for updates" button anywhere in the app and no
// setting behind this — see src/lib/updater.ts.
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, Loader2, Sparkles } from "lucide-react";
import type { UpdateInfo } from "@/lib/updater";
import { installUpdate } from "@/lib/updater";
import { openExternal } from "@/lib/open-external";
import { toast } from "sonner";

export function UpdatePrompt({ info, onClose }: { info: UpdateInfo; onClose: () => void }) {
  const [installing, setInstalling] = useState(false);

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
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-5 text-primary" />
            גרסה חדשה זמינה
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs">
              מותקנת: גרסה {info.current}
            </span>
            <span className="rounded-full bg-primary/15 text-primary px-2.5 py-0.5 text-xs font-medium">
              חדשה: {info.latest}
            </span>
          </div>
          {/* The release notes used to be printed here verbatim. They are
              written for a repository, not for this dialog, and they carry
              links — so the dialog says the one thing it exists to say: there
              is a new version, and here is the button that installs it. */}
          <p className="text-xs text-muted-foreground">
            {info.canInstall
              ? "לעדכן עכשיו? הקובץ יורד, התוכנה נסגרת ונפתחת מחדש בגרסה החדשה. אפשר גם לעדכן בפעם הבאה."
              : "לא נמצא קובץ התקנה בגרסה הזו — אפשר לפתוח את דף ההורדה בדפדפן."}
          </p>
        </div>
        <DialogFooter className="flex-row-reverse gap-2 sm:justify-start">
          {info.canInstall ? (
            <Button onClick={install} disabled={installing}>
              {installing ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Download className="size-4" />
              )}
              {installing ? "מתקין..." : "עדכן עכשיו"}
            </Button>
          ) : (
            info.downloadUrl && (
              /* Opens in the user's real browser, not the app window — a
                 WebView ignores target="_blank", so an <a> would do nothing.
                 See open_external_url in src-tauri/core. */
              <Button
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
