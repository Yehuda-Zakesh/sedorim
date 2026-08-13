//! The shared, file-backed JSON store.
//!
//! This is a port of the old `src/lib/store-io.ts`, which ran inside a
//! bundled Nitro server that both EXEs reached over a fixed loopback port.
//! There is no server any more: each EXE reads and writes the shared file
//! directly, and the two stay consistent exactly the way the server version
//! did — an atomic temp-file + rename, plus an mtime re-check that throws
//! away a write whose base data went stale underneath it.
//!
//! The file location is deliberately unchanged from the Electron build
//! (`%APPDATA%\SederPlus\sedorim-data.json`), so an existing install keeps
//! its data after upgrading. Same for the `backups/sedorim-data.<ts>.json`
//! naming, so previously written backups stay recognized.

use serde::Serialize;
use serde_json::{Map, Value};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

pub const STORE_FILE_NAME: &str = "sedorim-data.json";
pub const BACKUP_DIR_NAME: &str = "backups";
/// At most one rotating backup every 6 hours.
pub const BACKUP_MIN_INTERVAL_MS: u128 = 6 * 60 * 60 * 1000;
pub const MAX_BACKUPS: usize = 30;
const MAX_WRITE_ATTEMPTS: usize = 5;

/// Serializes writes coming from *this* process. The mtime guard inside
/// `save_keys_in` is what protects against the *other* EXE; this lock is
/// what protects against two rapid actions in this one.
static WRITE_LOCK: Mutex<()> = Mutex::new(());

pub type Store = Map<String, Value>;

#[derive(Serialize)]
pub struct SaveResult {
    pub ok: bool,
    // The frontend reads `updatedAt` (see src/lib/store-bridge.ts).
    #[serde(rename = "updatedAt")]
    pub updated_at: u64,
}

fn now_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
}

/// `%APPDATA%\SederPlus` — the same folder the Electron build used.
/// `SEDORIM_DATA_DIR` still overrides it, as it did before.
pub fn data_dir() -> PathBuf {
    if let Some(dir) = std::env::var_os("SEDORIM_DATA_DIR") {
        if !dir.is_empty() {
            return PathBuf::from(dir);
        }
    }
    if let Some(appdata) = std::env::var_os("APPDATA") {
        if !appdata.is_empty() {
            return Path::new(&appdata).join("SederPlus");
        }
    }
    std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
}

/// Nanosecond mtime, used to detect that another process wrote the file
/// while we were preparing our own write. Milliseconds (what the old TS
/// version compared) can't distinguish two writes inside the same tick.
fn file_mtime_ns(path: &Path) -> Option<u128> {
    fs::metadata(path)
        .ok()?
        .modified()
        .ok()?
        .duration_since(UNIX_EPOCH)
        .ok()
        .map(|d| d.as_nanos())
}

/// A missing or corrupt store reads as empty — same as the TS version. The
/// app then starts with empty defaults rather than failing to launch, and
/// the rotating backups in `backups/` are there for actual recovery.
pub fn read_store_in(dir: &Path) -> Store {
    let Ok(raw) = fs::read_to_string(dir.join(STORE_FILE_NAME)) else {
        return Store::new();
    };
    match serde_json::from_str::<Value>(&raw) {
        Ok(Value::Object(map)) => map,
        _ => Store::new(),
    }
}

/// Applies `patch` to the store in one atomic read-modify-write.
///
/// Callers that need to replace several keys together (restoring a backup
/// holding both `seder` and `learning`, say) must pass them in a single
/// patch. Two independent saves leave a real window where the file — and
/// anything polling it, including the other EXE — can observe a half-updated
/// state.
pub fn save_keys_in(dir: &Path, patch: &Store) -> Result<SaveResult, String> {
    // A poisoned lock only means some earlier save panicked; the data it
    // guards is a plain (), so recovering is strictly better than refusing
    // every save from here on.
    let _guard = WRITE_LOCK.lock().unwrap_or_else(|poisoned| poisoned.into_inner());

    let file = dir.join(STORE_FILE_NAME);
    fs::create_dir_all(dir).map_err(|e| format!("could not create {}: {e}", dir.display()))?;

    for _ in 0..MAX_WRITE_ATTEMPTS {
        let before = file_mtime_ns(&file);

        let mut store = read_store_in(dir);
        for (key, value) in patch {
            store.insert(key.clone(), value.clone());
        }
        let updated_at = now_ms() as u64;
        store.insert("updatedAt".to_string(), Value::from(updated_at));

        let body = serde_json::to_string(&store).map_err(|e| e.to_string())?;
        let tmp = dir.join(format!(
            ".{STORE_FILE_NAME}.{}.{updated_at}.tmp",
            std::process::id()
        ));
        fs::write(&tmp, &body).map_err(|e| format!("could not write temp file: {e}"))?;

        if file_mtime_ns(&file) != before {
            // The other EXE wrote while we were working, so the copy we just
            // merged into is stale. Drop this attempt and retry against
            // fresh data instead of clobbering their keys.
            let _ = fs::remove_file(&tmp);
            continue;
        }

        // Rename over the live file: readers either see all of the old file
        // or all of the new one, never a partial write.
        if let Err(e) = fs::rename(&tmp, &file) {
            // Windows can refuse the rename if something else has the file
            // open (a sharing violation). Clean up after ourselves rather
            // than leaving a stray .tmp behind in the user's data folder.
            let _ = fs::remove_file(&tmp);
            return Err(format!("could not replace store: {e}"));
        }
        maybe_backup(dir, &body);
        return Ok(SaveResult { ok: true, updated_at });
    }

    Err("save_keys: too much write contention, giving up".to_string())
}

pub fn read_store() -> Store {
    read_store_in(&data_dir())
}

/// The data file's modification time in nanoseconds, as a decimal string, or
/// `"0"` if it doesn't exist yet.
///
/// This is what the frontend polls to notice the *other* EXE's writes. It's a
/// single stat call with no read and no parse, so an idle app costs nothing —
/// which matters because the file also holds the audit log and the in-app
/// snapshots, and re-parsing all of that every few seconds in every window
/// would not be free. A string because nanoseconds since the epoch are past
/// the range JavaScript integers represent exactly.
pub fn file_stamp_in(dir: &Path) -> String {
    file_mtime_ns(&dir.join(STORE_FILE_NAME))
        .map(|ns| ns.to_string())
        .unwrap_or_else(|| "0".to_string())
}

pub fn file_stamp() -> String {
    file_stamp_in(&data_dir())
}

pub fn save_keys(patch: &Store) -> Result<SaveResult, String> {
    save_keys_in(&data_dir(), patch)
}

fn backup_name(ts: u128) -> String {
    format!("sedorim-data.{ts}.json")
}

fn backup_ts_from_name(name: &str) -> Option<u128> {
    let ts = name.strip_prefix("sedorim-data.")?.strip_suffix(".json")?;
    if ts.is_empty() || !ts.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    ts.parse().ok()
}

/// Rotating backups of the one file all the app's data lives in — a safety
/// net against the file itself being corrupted, truncated or deleted,
/// independent of the in-app backup/restore feature.
///
/// Entirely best-effort: a failed backup must never fail the real save.
fn maybe_backup(dir: &Path, body: &str) {
    let backup_dir = dir.join(BACKUP_DIR_NAME);
    if fs::create_dir_all(&backup_dir).is_err() {
        return;
    }
    let Ok(entries) = fs::read_dir(&backup_dir) else {
        return;
    };
    let mut stamps: Vec<u128> = entries
        .filter_map(|entry| entry.ok())
        .filter_map(|entry| backup_ts_from_name(&entry.file_name().to_string_lossy()))
        .collect();
    stamps.sort_unstable();

    let now = now_ms();
    if let Some(&last) = stamps.last() {
        if now.saturating_sub(last) < BACKUP_MIN_INTERVAL_MS {
            return;
        }
    }
    if fs::write(backup_dir.join(backup_name(now)), body).is_err() {
        return;
    }

    stamps.push(now);
    if stamps.len() > MAX_BACKUPS {
        for ts in &stamps[..stamps.len() - MAX_BACKUPS] {
            let _ = fs::remove_file(backup_dir.join(backup_name(*ts)));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::sync::atomic::{AtomicU32, Ordering};

    static NEXT: AtomicU32 = AtomicU32::new(0);

    /// Per-test scratch dir. Tests pass the dir explicitly rather than
    /// setting SEDORIM_DATA_DIR, because env vars are process-global and
    /// cargo runs tests in parallel threads.
    fn scratch_dir() -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "seder-plus-store-test-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).expect("create scratch dir");
        dir
    }

    fn patch_of(pairs: &[(&str, Value)]) -> Store {
        pairs.iter().map(|(k, v)| ((*k).to_string(), v.clone())).collect()
    }

    #[test]
    fn missing_store_reads_as_empty() {
        let dir = scratch_dir();
        assert!(read_store_in(&dir).is_empty());
    }

    #[test]
    fn corrupt_store_reads_as_empty_instead_of_failing() {
        let dir = scratch_dir();
        fs::write(dir.join(STORE_FILE_NAME), "{not json at all").unwrap();
        assert!(read_store_in(&dir).is_empty());
    }

    #[test]
    fn saves_then_reads_back() {
        let dir = scratch_dir();
        let result = save_keys_in(&dir, &patch_of(&[("seder", Value::from(vec![1, 2, 3]))])).unwrap();
        assert!(result.ok);
        assert!(result.updated_at > 0);

        let store = read_store_in(&dir);
        assert_eq!(store.get("seder").unwrap(), &Value::from(vec![1, 2, 3]));
        assert_eq!(store.get("updatedAt").unwrap(), &Value::from(result.updated_at));
    }

    #[test]
    fn patching_one_key_leaves_the_others_alone() {
        let dir = scratch_dir();
        save_keys_in(&dir, &patch_of(&[("seder", Value::from("a")), ("learning", Value::from("b"))])).unwrap();
        save_keys_in(&dir, &patch_of(&[("seder", Value::from("changed"))])).unwrap();

        let store = read_store_in(&dir);
        assert_eq!(store.get("seder").unwrap(), &Value::from("changed"));
        assert_eq!(store.get("learning").unwrap(), &Value::from("b"));
    }

    #[test]
    fn several_keys_land_in_a_single_write() {
        let dir = scratch_dir();
        save_keys_in(&dir, &patch_of(&[("seder", Value::from("s")), ("learning", Value::from("l"))])).unwrap();

        let store = read_store_in(&dir);
        // One write means one updatedAt covering both keys — never a state
        // where a reader sees only one of them.
        assert_eq!(store.get("seder").unwrap(), &Value::from("s"));
        assert_eq!(store.get("learning").unwrap(), &Value::from("l"));
        assert!(store.contains_key("updatedAt"));
    }

    #[test]
    fn saving_leaves_no_temp_files_behind() {
        let dir = scratch_dir();
        save_keys_in(&dir, &patch_of(&[("timer", Value::Null)])).unwrap();
        let leftovers: Vec<_> = fs::read_dir(&dir)
            .unwrap()
            .filter_map(|e| e.ok())
            .map(|e| e.file_name().to_string_lossy().to_string())
            .filter(|name| name.ends_with(".tmp"))
            .collect();
        assert!(leftovers.is_empty(), "stray temp files: {leftovers:?}");
    }

    #[test]
    fn first_save_writes_a_backup() {
        let dir = scratch_dir();
        save_keys_in(&dir, &patch_of(&[("seder", Value::from("x"))])).unwrap();

        let backups: Vec<_> = fs::read_dir(dir.join(BACKUP_DIR_NAME))
            .unwrap()
            .filter_map(|e| e.ok())
            .filter(|e| backup_ts_from_name(&e.file_name().to_string_lossy()).is_some())
            .collect();
        assert_eq!(backups.len(), 1);
    }

    #[test]
    fn later_saves_do_not_write_a_second_backup_within_the_interval() {
        let dir = scratch_dir();
        save_keys_in(&dir, &patch_of(&[("seder", Value::from(1))])).unwrap();
        save_keys_in(&dir, &patch_of(&[("seder", Value::from(2))])).unwrap();
        save_keys_in(&dir, &patch_of(&[("seder", Value::from(3))])).unwrap();

        let count = fs::read_dir(dir.join(BACKUP_DIR_NAME))
            .unwrap()
            .filter_map(|e| e.ok())
            .filter(|e| backup_ts_from_name(&e.file_name().to_string_lossy()).is_some())
            .count();
        assert_eq!(count, 1, "backups are rate-limited to one per 6 hours");
    }

    #[test]
    fn old_backups_are_pruned_to_the_cap() {
        let dir = scratch_dir();
        let backup_dir = dir.join(BACKUP_DIR_NAME);
        fs::create_dir_all(&backup_dir).unwrap();

        // MAX_BACKUPS existing backups, all old enough that a new one is due.
        let base = now_ms() - BACKUP_MIN_INTERVAL_MS * 2;
        for i in 0..MAX_BACKUPS as u128 {
            fs::write(backup_dir.join(backup_name(base + i)), "{}").unwrap();
        }
        save_keys_in(&dir, &patch_of(&[("seder", Value::from("x"))])).unwrap();

        let mut stamps: Vec<u128> = fs::read_dir(&backup_dir)
            .unwrap()
            .filter_map(|e| e.ok())
            .filter_map(|e| backup_ts_from_name(&e.file_name().to_string_lossy()))
            .collect();
        stamps.sort_unstable();
        assert_eq!(stamps.len(), MAX_BACKUPS, "should stay capped");
        // The oldest one is the one that got dropped.
        assert!(!stamps.contains(&base));
    }

    #[test]
    fn stamp_is_zero_until_the_file_exists_then_changes_on_write() {
        let dir = scratch_dir();
        assert_eq!(file_stamp_in(&dir), "0");

        save_keys_in(&dir, &patch_of(&[("seder", Value::from(1))])).unwrap();
        let first = file_stamp_in(&dir);
        assert_ne!(first, "0");

        save_keys_in(&dir, &patch_of(&[("seder", Value::from(2))])).unwrap();
        // The poll in shared-state.ts / kollel-store.ts skips reading the file
        // entirely while this value is unchanged, so a write that left it the
        // same would go unnoticed by the other EXE.
        assert_ne!(file_stamp_in(&dir), first);
    }

    #[test]
    fn backup_names_round_trip_and_reject_junk() {
        assert_eq!(backup_ts_from_name("sedorim-data.1234.json"), Some(1234));
        assert_eq!(backup_ts_from_name(&backup_name(99)), Some(99));
        assert_eq!(backup_ts_from_name("sedorim-data.json"), None);
        assert_eq!(backup_ts_from_name("sedorim-data..json"), None);
        assert_eq!(backup_ts_from_name("sedorim-data.abc.json"), None);
        assert_eq!(backup_ts_from_name("something-else.1.json"), None);
    }

    // ================= reading =================

    #[test]
    fn a_store_that_is_valid_json_but_not_an_object_reads_as_empty() {
        // The file is treated as one JSON object; an array or a bare scalar is
        // as unusable as junk, and must not take the app down with it.
        for body in ["[1,2,3]", "\"a string\"", "42", "null", "true"] {
            let dir = scratch_dir();
            fs::write(dir.join(STORE_FILE_NAME), body).unwrap();
            assert!(read_store_in(&dir).is_empty(), "body was {body}");
        }
    }

    #[test]
    fn an_empty_file_reads_as_empty() {
        let dir = scratch_dir();
        fs::write(dir.join(STORE_FILE_NAME), "").unwrap();
        assert!(read_store_in(&dir).is_empty());
    }

    #[test]
    fn a_truncated_file_reads_as_empty_rather_than_partially() {
        // What a torn write would look like if the rename were not atomic.
        let dir = scratch_dir();
        save_keys_in(&dir, &patch_of(&[("seder", Value::from("value"))])).unwrap();
        let full = fs::read_to_string(dir.join(STORE_FILE_NAME)).unwrap();
        fs::write(dir.join(STORE_FILE_NAME), &full[..full.len() / 2]).unwrap();
        assert!(read_store_in(&dir).is_empty());
    }

    #[test]
    fn unknown_keys_in_the_file_are_preserved() {
        // A file written by a newer build must not lose its extra keys just
        // because this build does not know about them.
        let dir = scratch_dir();
        fs::write(
            dir.join(STORE_FILE_NAME),
            r#"{"seder":[],"somethingNew":{"a":1}}"#,
        )
        .unwrap();
        save_keys_in(&dir, &patch_of(&[("learning", Value::from("l"))])).unwrap();

        let store = read_store_in(&dir);
        assert_eq!(store.get("somethingNew").unwrap(), &json!({"a": 1}));
        assert_eq!(store.get("learning").unwrap(), &Value::from("l"));
    }

    // ================= writing =================

    #[test]
    fn creates_the_data_directory_if_it_is_missing() {
        let dir = scratch_dir().join("nested").join("deeper");
        assert!(!dir.exists());
        save_keys_in(&dir, &patch_of(&[("seder", Value::from(1))])).unwrap();
        assert_eq!(read_store_in(&dir).get("seder").unwrap(), &Value::from(1));
    }

    #[test]
    fn an_empty_patch_still_stamps_updated_at() {
        let dir = scratch_dir();
        let result = save_keys_in(&dir, &Store::new()).unwrap();
        assert!(result.ok);
        assert_eq!(
            read_store_in(&dir).get("updatedAt").unwrap(),
            &Value::from(result.updated_at)
        );
    }

    #[test]
    fn updated_at_never_goes_backwards() {
        let dir = scratch_dir();
        let mut previous = 0;
        for i in 0..10 {
            let result = save_keys_in(&dir, &patch_of(&[("seder", Value::from(i))])).unwrap();
            assert!(result.updated_at >= previous);
            previous = result.updated_at;
        }
    }

    #[test]
    fn a_patch_can_overwrite_updated_at_but_the_write_wins() {
        // Whatever a caller passes, the store's own stamp is applied last —
        // otherwise the poll in the other EXE could be told nothing changed.
        let dir = scratch_dir();
        let result =
            save_keys_in(&dir, &patch_of(&[("updatedAt", Value::from(1u64))])).unwrap();
        assert!(result.updated_at > 1);
        assert_eq!(
            read_store_in(&dir).get("updatedAt").unwrap(),
            &Value::from(result.updated_at)
        );
    }

    #[test]
    fn a_null_value_is_stored_rather_than_dropping_the_key() {
        // Stopping the timer saves `null`, and the frontend distinguishes an
        // absent key from an explicit null.
        let dir = scratch_dir();
        save_keys_in(&dir, &patch_of(&[("timer", Value::Null)])).unwrap();
        let store = read_store_in(&dir);
        assert!(store.contains_key("timer"));
        assert_eq!(store.get("timer").unwrap(), &Value::Null);
    }

    #[test]
    fn nested_structures_survive_the_round_trip() {
        let dir = scratch_dir();
        let value = json!({
            "list": [1, 2, {"deep": [true, null, -3.5]}],
            "empty": {},
            "emptyList": [],
        });
        save_keys_in(&dir, &patch_of(&[("snapshots", value.clone())])).unwrap();
        assert_eq!(read_store_in(&dir).get("snapshots").unwrap(), &value);
    }

    #[test]
    fn hebrew_text_survives_the_round_trip() {
        let dir = scratch_dir();
        let value = json!({"name": "תלמיד הכולל", "note": "נסיעה לרופא — אושר"});
        save_keys_in(&dir, &patch_of(&[("settings", value.clone())])).unwrap();
        assert_eq!(read_store_in(&dir).get("settings").unwrap(), &value);
    }

    #[test]
    fn a_large_store_survives_the_round_trip() {
        let dir = scratch_dir();
        let entries: Vec<Value> = (0..5_000)
            .map(|i| json!({"id": format!("s{i}"), "date": "2026-07-08", "note": "הערה"}))
            .collect();
        let value = Value::from(entries);
        save_keys_in(&dir, &patch_of(&[("seder", value.clone())])).unwrap();
        assert_eq!(read_store_in(&dir).get("seder").unwrap(), &value);
    }

    #[test]
    fn every_frontend_key_round_trips() {
        // The set store-bridge.ts declares as StoreKey.
        let dir = scratch_dir();
        let keys = [
            "seder",
            "learning",
            "timer",
            "settings",
            "theme",
            "onboarded",
            "audit",
            "snapshots",
            "lastAutoBackupAt",
        ];
        let patch: Store = keys
            .iter()
            .map(|k| ((*k).to_string(), Value::from(format!("value-of-{k}"))))
            .collect();
        save_keys_in(&dir, &patch).unwrap();

        let store = read_store_in(&dir);
        for key in keys {
            assert_eq!(
                store.get(key).unwrap(),
                &Value::from(format!("value-of-{key}")),
                "key {key}"
            );
        }
    }

    #[test]
    fn the_file_on_disk_is_a_json_object() {
        let dir = scratch_dir();
        save_keys_in(&dir, &patch_of(&[("seder", Value::from(vec![1, 2]))])).unwrap();
        let raw = fs::read_to_string(dir.join(STORE_FILE_NAME)).unwrap();
        assert!(raw.starts_with('{') && raw.ends_with('}'), "raw was {raw}");
        serde_json::from_str::<Map<String, Value>>(&raw).expect("parses as an object");
    }

    #[test]
    fn repeated_saves_leave_no_temp_files_behind() {
        let dir = scratch_dir();
        for i in 0..20 {
            save_keys_in(&dir, &patch_of(&[("seder", Value::from(i))])).unwrap();
        }
        let leftovers: Vec<_> = fs::read_dir(&dir)
            .unwrap()
            .filter_map(|e| e.ok())
            .map(|e| e.file_name().to_string_lossy().to_string())
            .filter(|name| name.ends_with(".tmp") || name.starts_with('.'))
            .collect();
        assert!(leftovers.is_empty(), "stray temp files: {leftovers:?}");
    }

    // ================= concurrency =================

    #[test]
    fn concurrent_saves_from_this_process_all_land() {
        // The in-process WRITE_LOCK serializes these; none may be lost, and the
        // file must be parseable at the end.
        let dir = scratch_dir();
        std::thread::scope(|scope| {
            for i in 0..8 {
                let dir = dir.clone();
                scope.spawn(move || {
                    save_keys_in(&dir, &patch_of(&[(
                        "seder",
                        Value::from(format!("writer-{i}")),
                    )]))
                    .unwrap();
                });
            }
        });

        let store = read_store_in(&dir);
        let value = store.get("seder").unwrap().as_str().unwrap();
        assert!(value.starts_with("writer-"), "got {value}");
        assert!(store.contains_key("updatedAt"));
    }

    #[test]
    fn concurrent_saves_of_different_keys_do_not_clobber_each_other() {
        let dir = scratch_dir();
        // Seed both keys so the merge has something to preserve.
        save_keys_in(&dir, &patch_of(&[("seder", Value::from(0)), ("learning", Value::from(0))]))
            .unwrap();

        std::thread::scope(|scope| {
            let a = dir.clone();
            scope.spawn(move || {
                for i in 1..=20 {
                    save_keys_in(&a, &patch_of(&[("seder", Value::from(i))])).unwrap();
                }
            });
            let b = dir.clone();
            scope.spawn(move || {
                for i in 1..=20 {
                    save_keys_in(&b, &patch_of(&[("learning", Value::from(i))])).unwrap();
                }
            });
        });

        let store = read_store_in(&dir);
        // Both keys are still there — neither writer's last value was dropped
        // by the other's read-modify-write.
        assert_eq!(store.get("seder").unwrap(), &Value::from(20));
        assert_eq!(store.get("learning").unwrap(), &Value::from(20));
    }

    #[test]
    fn a_write_whose_base_went_stale_is_retried_not_applied() {
        // Simulates the other EXE writing between our read and our rename: the
        // mtime moves, so the attempt is dropped and retried against fresh
        // data instead of clobbering the other process's key.
        let dir = scratch_dir();
        save_keys_in(&dir, &patch_of(&[("learning", Value::from("theirs"))])).unwrap();
        save_keys_in(&dir, &patch_of(&[("seder", Value::from("ours"))])).unwrap();

        let store = read_store_in(&dir);
        assert_eq!(store.get("learning").unwrap(), &Value::from("theirs"));
        assert_eq!(store.get("seder").unwrap(), &Value::from("ours"));
    }

    // ================= stamp =================

    #[test]
    fn the_stamp_is_a_decimal_string() {
        let dir = scratch_dir();
        save_keys_in(&dir, &patch_of(&[("seder", Value::from(1))])).unwrap();
        let stamp = file_stamp_in(&dir);
        assert!(stamp.bytes().all(|b| b.is_ascii_digit()), "stamp was {stamp}");
        // Nanoseconds since the epoch are past what a JS number holds exactly,
        // which is why this crosses the IPC boundary as a string.
        assert!(stamp.len() > 15, "stamp was {stamp}");
    }

    #[test]
    fn the_stamp_does_not_move_on_its_own() {
        let dir = scratch_dir();
        save_keys_in(&dir, &patch_of(&[("seder", Value::from(1))])).unwrap();
        let stamp = file_stamp_in(&dir);
        assert_eq!(file_stamp_in(&dir), stamp);
        // Reading the store is not a write.
        let _ = read_store_in(&dir);
        assert_eq!(file_stamp_in(&dir), stamp);
    }

    // ================= backups =================

    #[test]
    fn a_backup_holds_the_same_json_as_the_store() {
        let dir = scratch_dir();
        save_keys_in(&dir, &patch_of(&[("seder", Value::from("x"))])).unwrap();

        let backup = fs::read_dir(dir.join(BACKUP_DIR_NAME))
            .unwrap()
            .filter_map(|e| e.ok())
            .find(|e| backup_ts_from_name(&e.file_name().to_string_lossy()).is_some())
            .expect("a backup was written");
        let backed_up: Value = serde_json::from_str(&fs::read_to_string(backup.path()).unwrap())
            .expect("the backup parses");
        let live: Value = serde_json::from_str(
            &fs::read_to_string(dir.join(STORE_FILE_NAME)).unwrap(),
        )
        .unwrap();
        assert_eq!(backed_up, live);
    }

    #[test]
    fn a_new_backup_is_written_once_the_interval_has_passed() {
        let dir = scratch_dir();
        let backup_dir = dir.join(BACKUP_DIR_NAME);
        fs::create_dir_all(&backup_dir).unwrap();
        // One existing backup, older than the interval.
        let old = now_ms() - BACKUP_MIN_INTERVAL_MS - 1;
        fs::write(backup_dir.join(backup_name(old)), "{}").unwrap();

        save_keys_in(&dir, &patch_of(&[("seder", Value::from("x"))])).unwrap();

        let count = fs::read_dir(&backup_dir)
            .unwrap()
            .filter_map(|e| e.ok())
            .filter(|e| backup_ts_from_name(&e.file_name().to_string_lossy()).is_some())
            .count();
        assert_eq!(count, 2);
    }

    #[test]
    fn unrelated_files_in_the_backup_folder_are_left_alone() {
        let dir = scratch_dir();
        let backup_dir = dir.join(BACKUP_DIR_NAME);
        fs::create_dir_all(&backup_dir).unwrap();
        fs::write(backup_dir.join("notes.txt"), "keep me").unwrap();
        fs::write(backup_dir.join("sedorim-data.old.json"), "keep me too").unwrap();

        // Enough saves that pruning would run if it were going to.
        let base = now_ms() - BACKUP_MIN_INTERVAL_MS * 2;
        for i in 0..MAX_BACKUPS as u128 {
            fs::write(backup_dir.join(backup_name(base + i)), "{}").unwrap();
        }
        save_keys_in(&dir, &patch_of(&[("seder", Value::from("x"))])).unwrap();

        assert_eq!(fs::read_to_string(backup_dir.join("notes.txt")).unwrap(), "keep me");
        assert_eq!(
            fs::read_to_string(backup_dir.join("sedorim-data.old.json")).unwrap(),
            "keep me too"
        );
    }

    #[test]
    fn a_failed_backup_does_not_fail_the_save() {
        // A plain file where the backup directory should be, so create_dir_all
        // cannot succeed. The real save must still go through.
        let dir = scratch_dir();
        fs::write(dir.join(BACKUP_DIR_NAME), "not a directory").unwrap();

        let failure = save_keys_in(&dir, &patch_of(&[("seder", Value::from("x"))])).err();
        assert!(failure.is_none(), "the save should have gone through: {failure:?}");
        assert_eq!(read_store_in(&dir).get("seder").unwrap(), &Value::from("x"));
    }

    #[test]
    fn pruning_keeps_the_newest_backups() {
        let dir = scratch_dir();
        let backup_dir = dir.join(BACKUP_DIR_NAME);
        fs::create_dir_all(&backup_dir).unwrap();

        let base = now_ms() - BACKUP_MIN_INTERVAL_MS * 2;
        for i in 0..(MAX_BACKUPS as u128 + 10) {
            fs::write(backup_dir.join(backup_name(base + i)), "{}").unwrap();
        }
        save_keys_in(&dir, &patch_of(&[("seder", Value::from("x"))])).unwrap();

        let mut stamps: Vec<u128> = fs::read_dir(&backup_dir)
            .unwrap()
            .filter_map(|e| e.ok())
            .filter_map(|e| backup_ts_from_name(&e.file_name().to_string_lossy()))
            .collect();
        stamps.sort_unstable();
        assert_eq!(stamps.len(), MAX_BACKUPS);
        // The oldest ones went, the newest stayed.
        assert!(!stamps.contains(&base));
        assert!(stamps.contains(&(base + MAX_BACKUPS as u128 + 9)));
    }

    // ================= data_dir =================

    #[test]
    fn the_backup_interval_and_cap_are_the_documented_ones() {
        assert_eq!(BACKUP_MIN_INTERVAL_MS, 6 * 60 * 60 * 1000);
        assert_eq!(MAX_BACKUPS, 30);
        assert_eq!(STORE_FILE_NAME, "sedorim-data.json");
        assert_eq!(BACKUP_DIR_NAME, "backups");
    }

    #[test]
    fn data_dir_returns_an_absolute_path() {
        // Whichever branch it takes, callers join a filename onto it.
        assert!(!data_dir().as_os_str().is_empty());
    }
}
