import { toast } from "sonner";

/**
 * Confirms a deletion with an "undo" button in the toast.
 *
 * Attendance records are typed once and read for months afterwards, and every
 * delete button in the app used to remove a row on a single mis-click with no
 * way back short of restoring a whole backup. The stores keep no tombstones,
 * so `restore` is simply "write the record we still hold in hand back in" —
 * pass the entry that was captured *before* the delete.
 */
export function toastUndo(message: string, restore: () => void) {
  toast(message, {
    duration: 8000,
    action: {
      label: "בטל",
      onClick: () => {
        try {
          restore();
          toast.success("הרישום שוחזר");
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "השחזור נכשל");
        }
      },
    },
  });
}
