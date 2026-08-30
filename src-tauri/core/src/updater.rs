//! Installing an update from inside the app.
//!
//! Until now "check for updates" could only open a browser and leave the user
//! to find the download, run it and close the app first. This does the whole
//! thing: fetch the installer, run it quietly, and quit so it can replace the
//! files it is about to replace. The installer puts the app back up when it is
//! done (see the `[Run]` entry in installer/SederPlus.iss).
//!
//! The download goes through `curl.exe`, which has shipped in
//! `%SystemRoot%\System32` since Windows 10 1803. That is deliberate: pulling
//! in an HTTP client with its own TLS stack would add megabytes to a binary
//! whose whole point is that it is one small file, for one request that
//! happens a few times a year.

use std::path::{Path, PathBuf};
use std::process::Command;

use crate::logfile;

/// Hosts a release asset may come from. GitHub redirects release downloads to
/// `objects.githubusercontent.com`, so both have to be allowed — and nothing
/// else, because whatever comes back from here is about to be executed.
fn host_is_allowed(url: &str) -> bool {
    let Some(rest) = url.strip_prefix("https://") else { return false };
    let host = rest.split(['/', '?', '#']).next().unwrap_or("");
    // An exact match or a subdomain of one of these — never a suffix match on
    // the whole string, which "evil-github.com" would pass.
    const ALLOWED: [&str; 2] = ["github.com", "githubusercontent.com"];
    ALLOWED.iter().any(|d| host == *d || host.ends_with(&format!(".{d}")))
}

/// Rejects anything that is not an installer we could sensibly run.
pub fn validate_installer_url(url: &str) -> Result<(), String> {
    if !host_is_allowed(url) {
        return Err("כתובת ההורדה אינה מ-GitHub — ההתקנה בוטלה".to_string());
    }
    let path = url.split(['?', '#']).next().unwrap_or("");
    if !path.to_ascii_lowercase().ends_with(".exe") {
        return Err("קובץ העדכון אינו קובץ התקנה (.exe)".to_string());
    }
    Ok(())
}

fn curl_path() -> PathBuf {
    match std::env::var_os("SystemRoot") {
        Some(root) if !root.is_empty() => Path::new(&root).join("System32").join("curl.exe"),
        _ => PathBuf::from("curl.exe"),
    }
}

/// True for something that at least starts like a Windows executable — a
/// captive-portal HTML page saved under an .exe name would not.
pub fn looks_like_windows_exe(bytes: &[u8]) -> bool {
    bytes.len() >= 2 && bytes[0] == b'M' && bytes[1] == b'Z'
}

fn download(url: &str, dest: &Path) -> Result<(), String> {
    let status = Command::new(curl_path())
        .args([
            "--location",           // release assets are served via a redirect
            "--fail",               // a 404 must not land as a 9-byte "file"
            "--silent",
            "--show-error",
            "--max-time",
            "600",
            "--output",
        ])
        .arg(dest)
        .arg(url)
        .status()
        .map_err(|e| format!("לא ניתן להפעיל את ההורדה: {e}"))?;
    if !status.success() {
        return Err(format!("ההורדה נכשלה (קוד {})", status.code().unwrap_or(-1)));
    }
    Ok(())
}

/// Downloads the installer and starts it. On success the caller must quit the
/// app: the installer is waiting to replace the very EXE that is running.
pub fn download_and_start(url: &str) -> Result<PathBuf, String> {
    validate_installer_url(url)?;

    let dest = std::env::temp_dir().join("SederPlusSetup-update.exe");
    // A half-finished download from a previous attempt must not be run.
    let _ = std::fs::remove_file(&dest);
    download(url, &dest)?;

    let bytes = std::fs::read(&dest).map_err(|e| format!("קובץ ההתקנה לא נקרא: {e}"))?;
    if bytes.len() < 1_000_000 || !looks_like_windows_exe(&bytes) {
        let _ = std::fs::remove_file(&dest);
        return Err("קובץ ההתקנה שהתקבל אינו תקין".to_string());
    }

    // What the log says is that an update is being installed, and no more:
    // Settings shows this file on screen (יומן תקלות), and the address the
    // installer came from is an implementation detail with no reader.
    logfile::append("info", "מתקין עדכון");

    // Inno Setup switches: a progress window and nothing to answer,
    // /CLOSEAPPLICATIONS so files in use are handled, and no reboot prompt.
    Command::new(&dest)
        .args(["/SILENT", "/NORESTART", "/CLOSEAPPLICATIONS", "/RESTARTAPPLICATIONS"])
        .spawn()
        .map_err(|e| format!("הפעלת קובץ ההתקנה נכשלה: {e}"))?;

    Ok(dest)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_github_release_asset_is_accepted() {
        for url in [
            "https://github.com/seder-plus/sedorim/releases/download/v2/SederPlusSetup.exe",
            "https://objects.githubusercontent.com/github-production-release-asset/1/2/SederPlusSetup.exe?token=abc",
        ] {
            assert!(validate_installer_url(url).is_ok(), "{url} should be accepted");
        }
    }

    #[test]
    fn anything_not_from_github_is_refused() {
        for url in [
            "https://evil.com/SederPlusSetup.exe",
            "https://github.com.evil.com/SederPlusSetup.exe",
            "https://evil-github.com/SederPlusSetup.exe",
            "http://github.com/a/b/SederPlusSetup.exe", // plain http
            "file:///C:/Windows/System32/cmd.exe",
        ] {
            assert!(validate_installer_url(url).is_err(), "{url} should be refused");
        }
    }

    #[test]
    fn only_an_exe_is_run() {
        assert!(validate_installer_url("https://github.com/a/b/notes.zip").is_err());
        assert!(validate_installer_url("https://github.com/a/b/setup.exe").is_ok());
        // The query string must not decide the extension either way.
        assert!(validate_installer_url("https://github.com/a/b/setup.exe?x=.zip").is_ok());
        assert!(validate_installer_url("https://github.com/a/b/setup.zip?x=.exe").is_err());
    }

    #[test]
    fn the_exe_check_looks_at_the_dos_header() {
        assert!(looks_like_windows_exe(b"MZ\x90\x00"));
        assert!(!looks_like_windows_exe(b"<!DOCTYPE html>"));
        assert!(!looks_like_windows_exe(b"M"));
        assert!(!looks_like_windows_exe(b""));
    }

    #[test]
    fn curl_is_looked_for_in_system32() {
        let path = curl_path();
        assert!(path.ends_with("curl.exe"), "{}", path.display());
    }
}
