// SederPlusQuick.exe — the small quick-entry window. Shares its data with
// SederPlus.exe through %APPDATA%\SederPlus\sedorim-data.json; both can be
// open at once (see core/src/store.rs).
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    seder_plus_core::run(tauri::generate_context!(), seder_plus_core::Mode::Quick);
}
