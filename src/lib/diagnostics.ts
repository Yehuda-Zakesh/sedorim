// The log file that replaced the audit log.
//
// The audit log recorded what the *user* did — every saved seder, every
// settings change — and showed it back to them on a screen of its own. That
// was a lot of machinery for something nobody needs to read, and it recorded
// the one thing that never goes wrong. What was missing was the opposite: when
// something does fail inside a packaged EXE there is no console to look at and
// no way to tell what happened.
//
// So: one plain-text file, on disk, next to the data.
//
//   %APPDATA%\SederPlus\logs\sederplus.log
//
// Settings → "יומן תקלות" shows the tail of it and opens the folder. Rust
// owns the file (see src-tauri/core/src/logfile.rs) so both EXEs can append to
// it safely and it survives a crash.
import { invoke, isDesktop } from "./tauri";

export type LogLevel = "info" | "warn" | "error";

/** Kept for `npm run dev` in a browser, where there is no Rust side. */
const memory: string[] = [];
const MEMORY_MAX = 400;

function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** Human-readable one-liner for anything that might be thrown. */
export function describeError(err: unknown): string {
  if (err instanceof Error) return err.stack || `${err.name}: ${err.message}`;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

function write(level: LogLevel, message: string) {
  const line = `[${stamp()}] ${level.toUpperCase()} ${message}`;
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);

  if (isDesktop) {
    // Fire and forget: a logger that can itself fail loudly is worse than no
    // logger at all.
    invoke("append_log", { level, message }).catch(() => {});
    return;
  }
  memory.push(line);
  if (memory.length > MEMORY_MAX) memory.splice(0, memory.length - MEMORY_MAX);
}

export function logInfo(message: string) {
  write("info", message);
}
export function logWarn(message: string) {
  write("warn", message);
}

/**
 * Records a failure, tagged with where it happened.
 *
 * `where` should read like a place in the program — "ייצוא PDF",
 * "שמירת נתונים" — because this file is meant to be readable by the person
 * using the app, not only by whoever wrote it.
 */
export function logProblem(where: string, err: unknown) {
  write("error", `${where}: ${describeError(err)}`);
}

/** The tail of the log, newest last. Empty string when there is nothing yet. */
export async function readLog(): Promise<string> {
  if (!isDesktop) return memory.join("\n");
  try {
    return await invoke<string>("read_log", { maxBytes: 200_000 });
  } catch (err) {
    return `לא ניתן לקרוא את קובץ הלוג: ${describeError(err)}`;
  }
}

/** Opens the folder holding the log in Windows Explorer. */
export async function openLogFolder(): Promise<boolean> {
  if (!isDesktop) return false;
  try {
    await invoke<void>("open_log_folder");
    return true;
  } catch (err) {
    logProblem("פתיחת תיקיית הלוג", err);
    return false;
  }
}

export async function clearLog(): Promise<boolean> {
  if (!isDesktop) {
    memory.length = 0;
    return true;
  }
  try {
    await invoke<void>("clear_log");
    return true;
  } catch (err) {
    logProblem("מחיקת קובץ הלוג", err);
    return false;
  }
}

/**
 * Catches what would otherwise vanish: an unhandled rejection, a script
 * error, a React render that threw past every boundary. Installed once, from
 * the app entry point.
 */
export function installGlobalErrorLogging() {
  if (typeof window === "undefined") return;
  const w = window as Window & { __sederPlusErrorLogging?: boolean };
  if (w.__sederPlusErrorLogging) return;
  w.__sederPlusErrorLogging = true;

  window.addEventListener("error", (e) => {
    logProblem("שגיאה לא מטופלת", e.error ?? e.message);
  });
  window.addEventListener("unhandledrejection", (e) => {
    logProblem("דחייה לא מטופלת", e.reason);
  });
}
