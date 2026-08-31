//! Turning the background agent on and off.
//!
//! Two things make "the app reminds me even when it is closed" true, and the
//! switch in Settings → "יעדים והתראות" does both:
//!
//!   * a value under `HKCU\...\Run`, so SederPlusAgent.exe starts at login.
//!     Per-user, like the install itself — no administrator, no service, no
//!     scheduled task;
//!   * starting it now, so switching it on does not mean "next time you log
//!     in".
//!
//! Switching it off removes the registry value; the running agent notices
//! within a minute (it re-reads `settings.background.enabled` on every tick)
//! and exits by itself. Nothing kills it from here — a process that stops
//! when its own switch says to is easier to reason about than one that gets
//! shot, and the worst case is a minute of an idle few-megabyte process.

use std::path::PathBuf;

use seder_plus_shared::logfile;

/// The EXE this starts, sitting next to the app's own.
pub const AGENT_EXE: &str = "SederPlusAgent.exe";

/// The value name under Run. Also removed by the uninstaller — see
/// installer/SederPlus.iss, which must keep using this exact name.
const RUN_VALUE_NAME: &str = "SederPlusAgent";
const RUN_KEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";

/// Where SederPlusAgent.exe is, or None when it was not shipped alongside
/// (a `cargo run` from the workspace, say).
pub fn agent_path() -> Option<PathBuf> {
    let exe = std::env::current_exe().ok()?;
    let path = exe.parent()?.join(AGENT_EXE);
    path.exists().then_some(path)
}

/// Starts the agent if it is not already running.
///
/// Nothing here checks whether it is: the agent holds a named mutex and a
/// second copy exits immediately (see agent/src/main.rs). That check belongs
/// in the one process that can make it atomically.
pub fn start() {
    let Some(path) = agent_path() else {
        logfile::append("warn", &format!("{AGENT_EXE} לא נמצא לצד התוכנה — מצב הרקע לא הופעל."));
        return;
    };
    let mut command = std::process::Command::new(path);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        // CREATE_NO_WINDOW. The agent is a windows-subsystem binary and shows
        // nothing anyway; this also covers a debug build, which is a console
        // binary and would otherwise flash one up at every login.
        command.creation_flags(0x0800_0000);
    }
    if let Err(err) = command.spawn() {
        logfile::append("error", &format!("הפעלת {AGENT_EXE} נכשלה: {err}"));
    }
}

/// Writes or removes the Run entry, and starts the agent when switching on.
#[cfg(windows)]
pub fn set_enabled(enabled: bool) -> Result<(), String> {
    use winreg::enums::{HKEY_CURRENT_USER, KEY_SET_VALUE};
    use winreg::RegKey;

    let key = RegKey::predef(HKEY_CURRENT_USER)
        .open_subkey_with_flags(RUN_KEY, KEY_SET_VALUE)
        .map_err(|e| format!("could not open the Run key: {e}"))?;

    if enabled {
        let path = agent_path().ok_or_else(|| format!("{AGENT_EXE} is not installed next to the app"))?;
        // Quoted: the install path contains the user's name, which can
        // contain spaces, and Run splits an unquoted value on them.
        key.set_value(RUN_VALUE_NAME, &format!("\"{}\"", path.display()))
            .map_err(|e| format!("could not write the Run value: {e}"))?;
        start();
    } else if let Err(err) = key.delete_value(RUN_VALUE_NAME) {
        // Already absent is the state we wanted.
        if err.kind() != std::io::ErrorKind::NotFound {
            return Err(format!("could not remove the Run value: {err}"));
        }
    }
    Ok(())
}

#[cfg(not(windows))]
pub fn set_enabled(_enabled: bool) -> Result<(), String> {
    Err("the background agent is Windows-only".to_string())
}

/// Whether the Run entry is currently there. The app asks on the Settings
/// screen, so what it shows is the state of the machine rather than the state
/// of a saved preference that may have been overwritten by hand.
#[cfg(windows)]
pub fn is_registered() -> bool {
    use winreg::enums::{HKEY_CURRENT_USER, KEY_READ};
    use winreg::RegKey;

    RegKey::predef(HKEY_CURRENT_USER)
        .open_subkey_with_flags(RUN_KEY, KEY_READ)
        .and_then(|key| key.get_value::<String, _>(RUN_VALUE_NAME))
        .is_ok()
}

#[cfg(not(windows))]
pub fn is_registered() -> bool {
    false
}
