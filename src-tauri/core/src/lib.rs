//! Everything both EXEs do. `full/` and `quick/` are thin wrappers that pass
//! in their own compiled-in Tauri context (which carries their own icon,
//! product name and identifier) plus the `Mode` that decides which window to
//! open.
//!
//! There is no local HTTP server and no loopback port any more: the frontend
//! is embedded in the EXE and talks to this code over Tauri's IPC. The two
//! EXEs share data purely through the JSON file in `store.rs`.

mod store;

use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine as _;
use serde_json::{Map, Value};
use tauri::{AppHandle, Manager, Url, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

const MAIN_WINDOW_LABEL: &str = "main";
const QUICK_WINDOW_LABEL: &str = "quick";

/// Which window this EXE opens on launch.
#[derive(Clone, Copy)]
pub enum Mode {
    /// SederPlus.exe — the full app.
    Full,
    /// SederPlusQuick.exe — the small quick-entry window.
    Quick,
}

#[tauri::command]
async fn load_store() -> Map<String, Value> {
    // `async` so the read happens off the main thread — the frontend polls
    // this every few seconds to pick up writes from the other EXE.
    store::read_store()
}

#[tauri::command]
async fn save_store_keys(patch: Map<String, Value>) -> Result<store::SaveResult, String> {
    store::save_keys(&patch)
}

/// Cheap "did anything change?" check — see store::file_stamp_in.
#[tauri::command]
async fn store_stamp() -> String {
    store::file_stamp()
}

/// Asks the user where to put a generated file, then writes it.
///
/// The frontend cannot save files itself: a WebView has no working
/// `<a download>`, which is what jsPDF and SheetJS reach for internally.
/// Contents arrive base64-encoded because both of those can emit base64
/// directly, and because a JSON array of byte values would be roughly four
/// times the size on the wire.
///
/// Returns false when the user cancels the dialog — that is not an error.
#[tauri::command]
async fn save_file_as(
    app: AppHandle,
    suggested_name: String,
    base64_contents: String,
) -> Result<bool, String> {
    let bytes = BASE64
        .decode(base64_contents.as_bytes())
        .map_err(|e| format!("could not decode file contents: {e}"))?;

    let mut dialog = app.dialog().file().set_file_name(suggested_name.as_str());
    // Pre-select the matching file type, so Windows doesn't append an
    // extension of its own to the name we suggested.
    if let Some(ext) = std::path::Path::new(&suggested_name)
        .extension()
        .and_then(|ext| ext.to_str())
    {
        dialog = dialog.add_filter(ext.to_uppercase(), &[ext]);
    }

    // blocking_save_file must not run on the main thread; this command is
    // async, so it runs on the async runtime instead.
    let Some(chosen) = dialog.blocking_save_file() else {
        return Ok(false);
    };
    let path = chosen.into_path().map_err(|e| e.to_string())?;
    std::fs::write(&path, &bytes).map_err(|e| format!("could not save {}: {e}", path.display()))?;
    Ok(true)
}

/// Opens the full app from the quick-entry window, in this same process and
/// the same WebView session. Reused and refocused on repeat clicks.
#[tauri::command]
async fn open_main_window(app: AppHandle) -> Result<(), String> {
    if let Some(existing) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        let _ = existing.unminimize();
        let _ = existing.show();
        return existing.set_focus().map_err(|e| e.to_string());
    }
    build_main_window(&app).map_err(|e| e.to_string())
}

/// Hands a link to the user's default browser. Used by the update prompt —
/// the app window itself must never navigate off to a remote site.
#[tauri::command]
async fn open_external_url(app: AppHandle, url: String) -> Result<(), String> {
    if !url.starts_with("https://") && !url.starts_with("http://") {
        return Err("refusing to open a non-http(s) URL".to_string());
    }
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|e| e.to_string())
}

/// True for the app's own embedded pages (and the Vite dev server).
fn is_internal_url(url: &Url) -> bool {
    match url.scheme() {
        "tauri" | "ipc" | "asset" | "blob" | "data" | "about" => true,
        "http" | "https" => matches!(
            url.host_str(),
            Some("tauri.localhost") | Some("localhost") | Some("127.0.0.1")
        ),
        _ => false,
    }
}

/// Same rule the Electron build enforced: external links go to the default
/// browser, and the app window stays on the app.
fn navigation_guard(app: &AppHandle) -> impl Fn(&Url) -> bool + Send + 'static {
    let handle = app.clone();
    move |url: &Url| {
        if is_internal_url(url) {
            return true;
        }
        if url.scheme() == "http" || url.scheme() == "https" {
            let _ = handle.opener().open_url(url.to_string(), None::<&str>);
        }
        false
    }
}

fn build_main_window(app: &AppHandle) -> tauri::Result<()> {
    WebviewWindowBuilder::new(app, MAIN_WINDOW_LABEL, WebviewUrl::App("index.html".into()))
        .title("סדר פלוס")
        .inner_size(1280.0, 820.0)
        .min_inner_size(900.0, 600.0)
        .center()
        .resizable(true)
        .on_navigation(navigation_guard(app))
        .build()?;
    Ok(())
}

fn build_quick_window(app: &AppHandle) -> tauri::Result<()> {
    // `?mode=quick` is how the frontend knows to start on the quick-entry
    // screen (see src/main.tsx). The hash is left free for the router.
    WebviewWindowBuilder::new(
        app,
        QUICK_WINDOW_LABEL,
        WebviewUrl::App("index.html?mode=quick".into()),
    )
    .title("כניסה מהירה — סדר פלוס")
    .inner_size(480.0, 680.0)
    .min_inner_size(380.0, 520.0)
    .center()
    .resizable(true)
    .on_navigation(navigation_guard(app))
    .build()?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn url(s: &str) -> Url {
        Url::parse(s).expect("test URL parses")
    }

    #[test]
    fn the_apps_own_pages_are_internal() {
        for s in [
            "tauri://localhost/index.html",
            "tauri://localhost/index.html?mode=quick",
            "ipc://localhost",
            "asset://localhost/icon.png",
            "about:blank",
        ] {
            assert!(is_internal_url(&url(s)), "{s} should be internal");
        }
    }

    #[test]
    fn generated_content_the_page_makes_itself_is_internal() {
        // html2canvas and jsPDF both produce these, and the report export would
        // break if navigating to them were blocked.
        assert!(is_internal_url(&url("blob:http://localhost/abc-123")));
        assert!(is_internal_url(&url("data:image/jpeg;base64,AAAA")));
    }

    #[test]
    fn the_vite_dev_server_is_internal() {
        for s in [
            "http://localhost:5173/",
            "http://localhost:5173/index.html?mode=quick",
            "http://127.0.0.1:5173/",
            "https://tauri.localhost/index.html",
        ] {
            assert!(is_internal_url(&url(s)), "{s} should be internal");
        }
    }

    #[test]
    fn remote_sites_are_external() {
        for s in [
            "https://github.com/",
            "https://api.github.com/repos/a/b/releases/latest",
            "http://example.com/",
            "https://localhost.evil.com/",
            "https://evil.com/?q=localhost",
            "https://notlocalhost/",
        ] {
            assert!(!is_internal_url(&url(s)), "{s} should be external");
        }
    }

    #[test]
    fn a_hostname_merely_ending_in_localhost_is_external() {
        // The check is an exact host match, not a suffix match — otherwise
        // `tauri.localhost.evil.com` would be trusted.
        assert!(!is_internal_url(&url("https://tauri.localhost.evil.com/")));
        assert!(!is_internal_url(&url("https://x-localhost/")));
    }

    #[test]
    fn other_schemes_are_external() {
        // Anything that could hand the OS something to run, or reach a
        // filesystem path, is refused rather than followed.
        for s in [
            "file:///C:/Windows/System32/cmd.exe",
            "javascript:alert(1)",
            "vbscript:msgbox",
            "ms-msdt:/id",
            "smb://server/share",
            "ftp://example.com/",
            "mailto:someone@example.com",
        ] {
            assert!(!is_internal_url(&url(s)), "{s} should be external");
        }
    }

    #[test]
    fn ipv6_loopback_is_not_on_the_list() {
        // Documenting the current rule: only the three literal hosts match, so
        // a dev server bound to [::1] would be treated as external.
        assert!(!is_internal_url(&url("http://[::1]:5173/")));
    }
}

pub fn run(context: tauri::Context, mode: Mode) {
    tauri::Builder::default()
        // Both plugins are driven from Rust only (save_file_as,
        // open_external_url), never called from the frontend — which is why
        // the capability files need no plugin permissions.
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            load_store,
            save_store_keys,
            store_stamp,
            save_file_as,
            open_main_window,
            open_external_url
        ])
        .setup(move |app| {
            let handle = app.handle();
            match mode {
                Mode::Full => build_main_window(handle)?,
                Mode::Quick => build_quick_window(handle)?,
            }
            Ok(())
        })
        .run(context)
        .expect("Seder Plus failed to start");
}
