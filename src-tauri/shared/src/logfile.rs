//! The problem log.
//!
//! `%APPDATA%\SederPlus\logs\sederplus.log`, plain UTF-8 text, newest last.
//!
//! This replaced the in-app audit log, which recorded every ordinary action
//! the user took and showed it on a screen of its own. What was actually
//! missing was the opposite: inside a packaged EXE there is no console, so a
//! failure left no trace at all. Now there is one file to look at — Settings
//! shows its tail and can open the folder.
//!
//! Rust owns the file rather than the frontend because both EXEs append to it
//! and because a line has to survive the crash that produced it. Appends are
//! serialized through a mutex and opened with `append(true)`, which on Windows
//! is a single atomic write per call.

use std::fs::{self, OpenOptions};
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use crate::store::data_dir;

pub const LOG_DIR_NAME: &str = "logs";
pub const LOG_FILE_NAME: &str = "sederplus.log";
/// Rotated (to `.1`) once past this, so the file can never grow without bound.
pub const MAX_LOG_BYTES: u64 = 512 * 1024;

static APPEND_LOCK: Mutex<()> = Mutex::new(());

pub fn log_dir() -> PathBuf {
    data_dir().join(LOG_DIR_NAME)
}

fn rotate_if_needed(path: &Path) {
    let Ok(meta) = fs::metadata(path) else { return };
    if meta.len() <= MAX_LOG_BYTES {
        return;
    }
    // One generation back is enough: this is a diagnostic aid, not an archive.
    let _ = fs::rename(path, path.with_extension("log.1"));
}

/// Appends one line. Never returns an error to the caller's face — a logger
/// that can fail loudly is worse than no logger — but does report it so the
/// command layer can decide.
pub fn append_in(dir: &Path, level: &str, message: &str) -> Result<(), String> {
    let _guard = APPEND_LOCK.lock().map_err(|e| e.to_string())?;
    fs::create_dir_all(dir).map_err(|e| format!("could not create {}: {e}", dir.display()))?;
    let path = dir.join(LOG_FILE_NAME);
    rotate_if_needed(&path);

    // Written by Rust rather than taken from the frontend so every line is
    // stamped by the same clock, including the ones Rust writes itself.
    let line = format!(
        "[{}] {} {}\n",
        timestamp(),
        level.to_uppercase(),
        message.replace('\n', " | ")
    );
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|e| format!("could not open {}: {e}", path.display()))?;
    file.write_all(line.as_bytes())
        .map_err(|e| format!("could not write {}: {e}", path.display()))
}

pub fn append(level: &str, message: &str) {
    let _ = append_in(&log_dir(), level, message);
}

/// The last `max_bytes` of the log, cut back to a line boundary so the first
/// line shown is a whole one.
pub fn tail_in(dir: &Path, max_bytes: u64) -> String {
    let path = dir.join(LOG_FILE_NAME);
    let Ok(mut file) = fs::File::open(&path) else {
        return String::new();
    };
    let len = file.metadata().map(|m| m.len()).unwrap_or(0);
    let from = len.saturating_sub(max_bytes);
    if file.seek(SeekFrom::Start(from)).is_err() {
        return String::new();
    }
    let mut buf = Vec::new();
    if file.read_to_end(&mut buf).is_err() {
        return String::new();
    }
    let text = String::from_utf8_lossy(&buf).into_owned();
    if from == 0 {
        return text;
    }
    match text.find('\n') {
        Some(i) => text[i + 1..].to_string(),
        None => text,
    }
}

pub fn clear_in(dir: &Path) -> Result<(), String> {
    let path = dir.join(LOG_FILE_NAME);
    match fs::remove_file(&path) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(format!("could not delete {}: {e}", path.display())),
    }
}

/// `2026-08-21 14:32:07` in local time — the log is read by the person using
/// the app, so it is stamped in their clock, not UTC.
fn timestamp() -> String {
    let now = crate::clock::local_now();
    format!(
        "{:04}-{:02}-{:02} {:02}:{:02}:{:02}",
        now.year, now.month, now.day, now.hour, now.minute, now.second
    )
}


#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("sederplus-log-test-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).expect("temp dir");
        dir
    }

    #[test]
    fn an_appended_line_can_be_read_back() {
        let dir = temp_dir("append");
        append_in(&dir, "error", "ייצוא PDF נכשל").expect("append");
        let text = tail_in(&dir, 10_000);
        assert!(text.contains("ERROR"), "{text}");
        assert!(text.contains("ייצוא PDF נכשל"), "{text}");
    }

    #[test]
    fn lines_accumulate_in_order() {
        let dir = temp_dir("order");
        append_in(&dir, "info", "first").unwrap();
        append_in(&dir, "info", "second").unwrap();
        let text = tail_in(&dir, 10_000);
        let first = text.find("first").expect("first");
        let second = text.find("second").expect("second");
        assert!(first < second, "newest should be last: {text}");
    }

    #[test]
    fn a_multiline_message_stays_on_one_line() {
        let dir = temp_dir("multiline");
        append_in(&dir, "error", "boom\n  at somewhere\n  at elsewhere").unwrap();
        let text = tail_in(&dir, 10_000);
        assert_eq!(text.lines().count(), 1, "{text}");
        assert!(text.contains("at elsewhere"), "{text}");
    }

    #[test]
    fn the_tail_starts_on_a_whole_line() {
        let dir = temp_dir("tail");
        for i in 0..200 {
            append_in(&dir, "info", &format!("line number {i}")).unwrap();
        }
        let text = tail_in(&dir, 200);
        assert!(text.len() <= 200, "{}", text.len());
        for line in text.lines() {
            assert!(line.starts_with('['), "partial line: {line}");
        }
    }

    #[test]
    fn a_missing_log_reads_as_empty() {
        let dir = temp_dir("missing");
        assert_eq!(tail_in(&dir, 1000), "");
    }

    #[test]
    fn clearing_a_missing_log_is_not_an_error() {
        let dir = temp_dir("clear-missing");
        clear_in(&dir).expect("clear");
    }

    #[test]
    fn clearing_removes_what_was_written() {
        let dir = temp_dir("clear");
        append_in(&dir, "info", "something").unwrap();
        clear_in(&dir).expect("clear");
        assert_eq!(tail_in(&dir, 1000), "");
    }

    #[test]
    fn the_log_rotates_once_it_grows_too_large() {
        let dir = temp_dir("rotate");
        let big = "x".repeat(4096);
        for _ in 0..((MAX_LOG_BYTES / 4096) + 2) {
            append_in(&dir, "info", &big).unwrap();
        }
        assert!(dir.join("sederplus.log.1").exists(), "no rotated file");
        let live = fs::metadata(dir.join(LOG_FILE_NAME)).expect("live log").len();
        assert!(live <= MAX_LOG_BYTES + 8192, "live log not truncated: {live}");
    }

    #[test]
    fn the_timestamp_looks_like_a_date_and_time() {
        let stamp = timestamp();
        assert_eq!(stamp.len(), 19, "{stamp}");
        assert_eq!(&stamp[4..5], "-", "{stamp}");
        assert_eq!(&stamp[10..11], " ", "{stamp}");
        assert_eq!(&stamp[13..14], ":", "{stamp}");
    }

    #[test]
    fn the_calendar_conversion_matches_known_dates() {
        assert_eq!(crate::clock::civil_from_days(0), (1970, 1, 1));
        assert_eq!(crate::clock::civil_from_days(19_000), (2022, 1, 8));
        // A leap day, and the day after it.
        assert_eq!(crate::clock::civil_from_days(18_321), (2020, 2, 29));
        assert_eq!(crate::clock::civil_from_days(18_322), (2020, 3, 1));
    }

    #[test]
    fn the_log_lives_in_a_logs_folder_next_to_the_data() {
        assert!(log_dir().ends_with(LOG_DIR_NAME));
        assert_eq!(log_dir().parent().unwrap(), crate::store::data_dir());
    }
}
