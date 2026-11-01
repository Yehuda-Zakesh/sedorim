import type { BackupPreview, StoreSummary } from "./store-bridge";

// Plain-Hebrew description of a BackupPreview (the Rust `preview_backup`
// command): what the copy holds, what is in the file now, and — before the
// person confirms — what a restore would replace and what it would leave out.

export type PreviewText = {
  /** What the backup holds. */
  backup: string[];
  /** What the file holds today (one line), or why it is not readable. */
  current: string;
  /** Things in the current file that the restore replaces. */
  replaced: string[];
  /** Things the current file has that the backup lacks: they will be gone. */
  missing: string[];
};

function formatDate(ts: number): string {
  try {
    return new Date(ts).toLocaleString("he-IL", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return String(ts);
  }
}

function range(first: string | null, last: string | null): string {
  if (!first || !last) return "";
  return first === last ? ` (${first})` : ` (מ-${first} עד ${last})`;
}

function records(count: number, kind: string, first: string | null, last: string | null): string {
  return count === 0 ? `אין רשומות ${kind}` : `${count} רשומות ${kind}${range(first, last)}`;
}

function present(s: StoreSummary): string[] {
  const parts: string[] = [];
  parts.push(s.hasSettings ? "הגדרות: כלולות" : "הגדרות: אין");
  parts.push(
    s.hasOnboarded ? `מצב היכרות: כלול${s.onboarded ? " (הושלם)" : ""}` : "מצב היכרות: אין",
  );
  parts.push(s.hasTimer ? "טיימר פעיל: כלול" : "טיימר פעיל: אין");
  parts.push(
    s.hasSnapshots ? `גיבויים פנימיים (תמונות מצב): ${s.snapshotsCount}` : "גיבויים פנימיים: אין",
  );
  return parts;
}

export function describePreview(p: BackupPreview): PreviewText {
  const b = p.backup;
  const backup = [
    `הגיבוי נלקח ב-${formatDate(p.ts)}.`,
    `${records(b.sederCount, "נוכחות", b.attendanceFirst, b.attendanceLast)}.`,
    `${records(b.learningCount, "לימוד", b.learningFirst, b.learningLast)}.`,
    `${present(b).join(" · ")}.`,
  ];
  if (b.unknownKeys.length)
    backup.push(`מפתחות שהגרסה הזאת לא מכירה (יישמרו כמות שהם): ${b.unknownKeys.join(", ")}.`);

  const replaced: string[] = [];
  const missing: string[] = [];
  let current: string;
  if (p.currentStatus === "missing") {
    current = "אין כרגע קובץ נתונים, ולכן אין מה להחליף.";
  } else if (p.currentStatus === "unreadable" || !p.current) {
    current = `הקובץ הנוכחי פגום ולא נקרא${p.currentError ? ` (${p.currentError})` : ""}. הוא נשמר בעותק לפני ההחלפה.`;
  } else {
    const c = p.current;
    current = `בקובץ הנוכחי: ${c.sederCount} רשומות נוכחות ו-${c.learningCount} רשומות לימוד.`;
    replaced.push("כל הקובץ הנוכחי יוחלף בתוכן הגיבוי; עותק שלו נשמר לפני כן.");
    if (c.sederCount > b.sederCount)
      missing.push(
        `בקובץ הנוכחי יש ${c.sederCount} רשומות נוכחות ובגיבוי ${b.sederCount}: ${c.sederCount - b.sederCount} לפחות לא יהיו.`,
      );
    if (c.learningCount > b.learningCount)
      missing.push(
        `בקובץ הנוכחי יש ${c.learningCount} רשומות לימוד ובגיבוי ${b.learningCount}: ${c.learningCount - b.learningCount} לפחות לא יהיו.`,
      );
    if (c.hasSettings && !b.hasSettings)
      missing.push("ההגדרות הנוכחיות לא בגיבוי ויחזרו לברירת המחדל.");
    if (c.hasOnboarded && !b.hasOnboarded)
      missing.push("מצב ההיכרות לא בגיבוי (יישמר מהמחשב הזה, כדי שהאשף לא יופיע שוב).");
    if (c.hasTimer && !b.hasTimer) missing.push("טיימר שרץ כעת לא בגיבוי ולא יישאר.");
    if (c.hasSnapshots && b.snapshotsCount < c.snapshotsCount)
      missing.push(`בקובץ הנוכחי ${c.snapshotsCount} גיבויים פנימיים ובגיבוי ${b.snapshotsCount}.`);
    const lost = c.unknownKeys.filter((k) => !b.unknownKeys.includes(k));
    if (lost.length) missing.push(`מפתחות שבקובץ הנוכחי ואינם בגיבוי: ${lost.join(", ")}.`);
  }
  if (b.sederCount + b.learningCount === 0) missing.unshift("הגיבוי ריק: אין בו רשומות כלל.");
  return { backup, current, replaced, missing };
}
