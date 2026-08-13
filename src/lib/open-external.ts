import { invoke, isDesktop } from "./tauri";

/**
 * Opens a link in the user's default browser.
 *
 * The app window must never navigate to a remote site, and a WebView ignores
 * `target="_blank"` — so an `<a>` element is not an option on the desktop.
 * Rust hands the URL to the OS instead (see open_external_url in
 * src-tauri/core/src/lib.rs).
 */
export function openExternal(url: string): void {
  if (!isDesktop) {
    window.open(url, "_blank", "noreferrer");
    return;
  }
  invoke("open_external_url", { url }).catch((e) => console.error(e));
}
