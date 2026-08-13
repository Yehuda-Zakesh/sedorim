import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, ExternalLink, Sparkles } from "lucide-react";
import type { UpdateInfo } from "@/lib/updater";
import { skipVersion } from "@/lib/updater";
import { openExternal } from "@/lib/open-external";

export function UpdatePrompt({ info, onClose }: { info: UpdateInfo; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-5 text-primary" />
            גרסה חדשה זמינה
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs">גרסה נוכחית: {info.current}</span>
            <span className="rounded-full bg-primary/15 text-primary px-2.5 py-0.5 text-xs font-medium">חדשה: {info.latest}</span>
          </div>
          {info.release.name && <div className="font-medium">{info.release.name}</div>}
          {info.release.body && (
            <div className="max-h-48 overflow-auto rounded-md border border-border bg-muted/40 p-3 text-xs whitespace-pre-wrap text-muted-foreground">
              {info.release.body}
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            האם ברצונך להוריד את הגרסה החדשה כעת?
          </p>
        </div>
        {/* These open in the user's real browser, not in the app window —
            a WebView ignores target="_blank", so an <a> here would do
            nothing at all. See open_external_url in src-tauri/core. */}
        <DialogFooter className="flex-row-reverse gap-2 sm:justify-start">
          {info.downloadUrl && (
            <Button onClick={() => { openExternal(info.downloadUrl!); onClose(); }}>
              <Download className="size-4" />
              הורדה
            </Button>
          )}
          <Button variant="outline" onClick={() => openExternal(info.release.html_url)}>
            <ExternalLink className="size-4" />
            פרטים
          </Button>
          <Button variant="ghost" onClick={() => { skipVersion(info.latest); onClose(); }}>
            דלג על גרסה זו
          </Button>
          <Button variant="ghost" onClick={onClose}>מאוחר יותר</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}