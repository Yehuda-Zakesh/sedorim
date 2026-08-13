// SederPlus.exe — the full app.
//
// `windows_subsystem = "windows"` keeps a console window from opening behind
// the app in release builds. Debug builds keep the console so panics and
// println! are visible.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // generate_context! has to be expanded here, not in core: it reads this
    // crate's tauri.conf.json and embeds this crate's icon and frontend
    // assets into the binary.
    seder_plus_core::run(tauri::generate_context!(), seder_plus_core::Mode::Full);
}
