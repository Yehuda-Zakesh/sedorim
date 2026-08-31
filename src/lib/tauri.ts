// The only place that knows whether we're inside the packaged EXE or a plain
// browser tab. `npm run dev` runs in a browser, where none of the Rust
// commands exist, so the store and file-save helpers fall back to
// localStorage and an ordinary download instead — see store-bridge.ts and
// save-file.ts. Anything that can only work on the desktop should check
// `isDesktop` rather than calling invoke() and catching the failure.

export const isDesktop = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

// Loaded on first use rather than imported at the top: the Node-based unit
// tests import modules that reach this file, and @tauri-apps/api is a
// browser-only package. Nothing calls invoke() unless isDesktop is true, so
// outside the EXE this import never happens at all.
let invokeCommand: typeof import("@tauri-apps/api/core").invoke | undefined;

/** Calls a command defined in src-tauri/core/src/lib.rs. */
export async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!invokeCommand) {
    invokeCommand = (await import("@tauri-apps/api/core")).invoke;
  }
  return invokeCommand<T>(command, args);
}
