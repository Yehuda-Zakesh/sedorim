import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, ExternalLink, Loader2, Sparkles } from "lucide-react";
import type { UpdateInfo } from "@/lib/updater";
import { installUpdate, skipVersion } from "@/lib/updater";
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
    <Dialog open onOpenChange={(o) => { if (!o && !installing) onClose(); }}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-5 text-primary" />
            גרסה חדשה זמינה
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs">מותקנת: גרסה {info.current}</span>
            <span className="rounded-full bg-primary/15 text-primary px-2.5 py-0.5 text-xs font-medium">
              חדשה: {info.latest}
            </span>
          </div>
          {info.release.name && <div className="font-medium">{info.release.name}</div>}
          {info.release.body && (
            <div className="max-h-48 overflow-auto rounded-md border border-border bg-muted/40 p-3 text-xs whitespace-pre-wrap text-muted-foreground">
              {info.release.body}
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            {info.canInstall
              ? "ההתקנה מתבצעת מתוך התוכנה: הקובץ יורד, התוכנה נסגרת ונפתחת מחדש בגרסה החדשה."
              : "לא נמצא קובץ התקנה בגרסה הזו — אפשר לפתוח את דף ההורדה בדפדפן."}
          </p>
        </div>
        <DialogFooter className="flex-row-reverse gap-2 sm:justify-start">
          {info.canInstall ? (
            <Button onClick={install} disabled={installing}>
              {installing ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
              {installing ? "מתקין..." : "עדכן עכשיו"}
            </Button>
          ) : (
            info.downloadUrl && (
              /* Opens in the user's real browser, not the app window — a
                 WebView ignores target="_blank", so an <a> would do nothing.
                 See open_external_url in src-tauri/core. */
              <Button onClick={() => { openExternal(info.downloadUrl!); onClose(); }}>
                <Download className="size-4" />
                הורדה
              </Button>
            )
          )}
          <Button variant="outline" disabled={installing} onClick={() => openExternal(info.release.html_url)}>
            <ExternalLink className="size-4" />
            פרטים
          </Button>
          <Button variant="ghost" disabled={installing}
            onClick={() => { skipVersion(info.latest); onClose(); }}>
            דלג על גרסה זו
          </Button>
          <Button variant="ghost" disabled={installing} onClick={onClose}>מאוחר יותר</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
