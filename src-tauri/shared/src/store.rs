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
//!
//! ## Damaged-file protection (commands and keys)
//!
//! `read_store_in` still reads a missing/damaged file as an empty store (for
//! the agent and other read-only callers), but `save_keys_in` never merges
//! into that stand-in: if the file exists and is not a JSON object it returns
//! `Err("STORE_CORRUPT: <reason>: <message>")` and leaves the file untouched.
//!
//! Tauri commands (core/src/lib.rs):
//! - `load_store_checked` -> tagged JSON
//!   `{"status":"missing","meta"}` |
//!   `{"status":"ok","store":{..},"meta"}` |
//!   `{"status":"corrupt","reason":"unparseable"|"not-an-object"|"unreadable",
//!     "message","preservedAs":string|null,
//!     "backups":[{"name","ts","size","valid","counts":{"seder","learning"}}],"meta"}`
//!   with `meta = {"upgradedFrom":string|null,"upgradeCopy":string|null}`.
//!   On corrupt the original bytes are copied 1:1 to
//!   `sedorim-data.corrupt.<ts>.json` (never overwriting, no duplicate copies).
//! - `preview_backup(name)` -> BackupPreview (camelCase): read-only summary of a backup
//!   (date, record counts and date ranges, settings/onboarded/timer/snapshots, unknown
//!   keys) next to the current file's summary (`currentStatus` ok/missing/unreadable).
//! - `recover_store(name)` -> SaveResult: replaces the main file (atomically)
//!   with a valid `backups/sedorim-data.<ts>.json`, saving the damaged file first, and
//!   succeeds only after reading the new file back and finding it identical to the backup.
//! - `save_store_keys(patch, bases?)` -> SaveResult; with `bases` a record changed by the
//!   caller that someone else also changed/deleted is NOT overwritten: it is listed in
//!   `conflicts: [{key,id,kind,mine,theirs}]` (kind edit-edit/edit-deleted/deleted-edited/add-add).
//! - `start_empty_store()` -> SaveResult: saves the damaged file, then creates `{updatedAt}`.
//! - `create_upgrade_copy(label, legacy?)` -> `{"files":[..]}`: raw copy
//!   `backups/sedorim-upgrade.<ts>.<label>.json` (+ `.legacy-localstorage.json`).
//!   These names do not match the rotating pattern, so pruning never touches them.
//! - `open_data_folder()`.
//!
//! Automatic upgrade copy: on the first `load_store_checked` of a process, if
//! the file exists and `backups/.last-version` differs from the build version,
//! the raw bytes go to `backups/sedorim-upgrade.<from>-to-<to>.<ts>.json` and
//! only then is `.last-version` updated. A fresh install only writes `.last-version`.

use serde::Serialize;
use serde_json::{Map, Value};
use std::fs;
use std::path::{Path, PathBuf};
use std::collections::HashMap;
use std::sync::{Mutex, MutexGuard};
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

/// Cross-process lock: a file that exists only while one process is inside a
/// read-merge-write cycle (SederPlus.exe, SederPlusQuick.exe and the agent
/// all share the data folder). Created with `create_new`, so exactly one
/// process wins. It holds the owner's pid and a nonce, and the owner refreshes
/// the file's mtime (heartbeat) while inside its cycle, so a slow write is
/// never mistaken for a crash. A lock is taken over only when its owner
/// process is gone, or (owner not checkable) its heartbeat is older than
/// `LOCK_STALE_MS`.
const LOCK_FILE_NAME: &str = ".sedorim-data.lock";
const LOCK_STALE_MS: u128 = 30_000;
const LOCK_WAIT_MS: u128 = 15_000;

pub type Store = Map<String, Value>;

#[derive(Serialize, Debug)]
pub struct SaveResult {
    pub ok: bool,
    // The frontend reads `updatedAt` (see src/lib/store-bridge.ts).
    #[serde(rename = "updatedAt")]
    pub updated_at: u64,
    /// Only for keys whose record-level merge produced something other than
    /// what the caller sent (another window's changes were kept): the final
    /// value now in the file, so the caller can adopt it.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub merged: Option<Map<String, Value>>,
    /// Records the caller changed that someone else changed or deleted since
    /// the caller's base. The file's version of each was kept (see
    /// `merge_records`); every other change was applied. Empty = a full success.
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub conflicts: Vec<RecordConflict>,
}

/// Both sides edited the same record differently.
pub const CONFLICT_EDIT_EDIT: &str = "edit-edit";
/// The caller edited a record the file no longer has.
pub const CONFLICT_EDIT_DELETED: &str = "edit-deleted";
/// The caller deleted a record the file has since edited.
pub const CONFLICT_DELETED_EDITED: &str = "deleted-edited";
/// The caller added a record whose id the file already has, with other content.
pub const CONFLICT_ADD_ADD: &str = "add-add";

/// One record that could not be applied without overwriting someone else.
#[derive(Serialize, Debug, Clone, PartialEq)]
pub struct RecordConflict {
    /// The top-level key of the file (`seder`, `learning`...).
    pub key: String,
    pub id: Value,
    /// One of the `CONFLICT_*` constants.
    pub kind: &'static str,
    /// The caller's version (`null` = the caller deleted it).
    pub mine: Option<Value>,
    /// The file's version, which was kept (`null` = deleted in the file).
    pub theirs: Option<Value>,
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

// ============ cross-process lock ============

/// A lock is abandoned (stolen) only when its holder is provably gone, or —
/// when that cannot be checked — when its heartbeat stopped for this long. A
/// holder whose process is alive is never stolen from by age alone, however
/// slow its write is; only after `ALIVE_CAP_FACTOR` times the threshold with
/// no heartbeat at all (a recycled pid, a frozen process) is it taken over.
const ALIVE_CAP_FACTOR: u128 = 10;
/// The short-lived file that serializes two processes both deciding to steal.
const STEAL_GUARD_NAME: &str = ".sedorim-data.lock.steal";
const STEAL_GUARD_STALE_MS: u128 = 5_000;

/// Held for the length of one read-merge-write cycle. The file holds
/// `<pid> <started ms> <nonce>`; while this value lives, a heartbeat thread
/// keeps the file's mtime fresh so a slow cycle is not mistaken for a dead
/// one. Dropping stops the heartbeat and removes the file — unless it was
/// meanwhile replaced by someone else's lock.
struct DirLock {
    path: PathBuf,
    nonce: String,
    stop: Option<std::sync::mpsc::Sender<()>>,
    heartbeat: Option<std::thread::JoinHandle<()>>,
}

impl Drop for DirLock {
    fn drop(&mut self) {
        drop(self.stop.take());
        if let Some(h) = self.heartbeat.take() {
            let _ = h.join();
        }
        if lock_owner_is(&self.path, &self.nonce) {
            let _ = fs::remove_file(&self.path);
        }
    }
}

fn file_age_ms(path: &Path) -> Option<u128> {
    let modified = fs::metadata(path).ok()?.modified().ok()?;
    // A clock set backwards reads as age 0: never stale, so never stolen.
    Some(
        SystemTime::now()
            .duration_since(modified)
            .map(|d| d.as_millis())
            .unwrap_or(0),
    )
}

/// `(pid, nonce)` from a lock file's text; either may be missing (a lock
/// written by an older build has no nonce, a half-written one has neither).
fn parse_lock(text: &str) -> (Option<u32>, Option<String>) {
    let mut parts = text.split_whitespace();
    let pid = parts.next().and_then(|p| p.parse().ok());
    let nonce = parts.nth(1).map(str::to_string);
    (pid, nonce)
}

fn lock_owner_is(path: &Path, nonce: &str) -> bool {
    fs::read_to_string(path)
        .map(|t| parse_lock(&t).1.as_deref() == Some(nonce))
        .unwrap_or(false)
}

/// Whether a process with this id is running: `None` when that cannot be
/// determined on this platform or for this process.
#[cfg(windows)]
fn process_alive(pid: u32) -> Option<bool> {
    #[link(name = "kernel32")]
    extern "system" {
        fn OpenProcess(access: u32, inherit: i32, pid: u32) -> isize;
        fn GetExitCodeProcess(handle: isize, code: *mut u32) -> i32;
        fn CloseHandle(handle: isize) -> i32;
        fn GetLastError() -> u32;
    }
    const PROCESS_QUERY_LIMITED_INFORMATION: u32 = 0x1000;
    const STILL_ACTIVE: u32 = 259;
    const ERROR_ACCESS_DENIED: u32 = 5;
    const ERROR_INVALID_PARAMETER: u32 = 87;
    if pid == 0 {
        return None;
    }
    // SAFETY: plain Win32 calls; the handle is closed before returning.
    unsafe {
        let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
        if handle == 0 {
            return match GetLastError() {
                // No such process id.
                ERROR_INVALID_PARAMETER => Some(false),
                // It exists; we are just not allowed to look inside.
                ERROR_ACCESS_DENIED => Some(true),
                _ => None,
            };
        }
        let mut code = 0u32;
        let ok = GetExitCodeProcess(handle, &mut code);
        CloseHandle(handle);
        if ok == 0 {
            None
        } else {
            // A process that exited still has an openable handle while
            // someone holds it, but its exit code is no longer STILL_ACTIVE.
            Some(code == STILL_ACTIVE)
        }
    }
}

#[cfg(not(windows))]
fn process_alive(pid: u32) -> Option<bool> {
    let proc_root = Path::new("/proc");
    if proc_root.join("self").exists() {
        Some(proc_root.join(pid.to_string()).exists())
    } else {
        None
    }
}

/// Is the lock at `path` left behind by a holder that is gone?
///  - holder's process not running: yes, at once;
///  - holder's process running: no (it refreshes the heartbeat), unless the
///    file has not been touched for `ALIVE_CAP_FACTOR` times the threshold;
///  - no pid, or the platform cannot tell: yes once the heartbeat is older
///    than `stale_ms`.
fn lock_is_stale(path: &Path, stale_ms: u128) -> bool {
    let Some(age) = file_age_ms(path) else {
        return false;
    };
    let pid = fs::read_to_string(path).ok().and_then(|t| parse_lock(&t).0);
    match pid.and_then(process_alive) {
        Some(false) => true,
        Some(true) => age > stale_ms.saturating_mul(ALIVE_CAP_FACTOR),
        None => age > stale_ms,
    }
}

/// Removes an abandoned lock. Two processes may both decide to do this at the
/// same moment; a plain "check, then delete" would let the slower one delete
/// the lock the faster one just took. So thieves take turns through a guard
/// file and re-check inside it. Returns false when another thief was busy.
fn try_steal(dir: &Path, lock: &Path, stale_ms: u128) -> bool {
    use std::io::Write;
    let guard = dir.join(STEAL_GUARD_NAME);
    match fs::OpenOptions::new().write(true).create_new(true).open(&guard) {
        Ok(mut f) => {
            let _ = write!(f, "{}", std::process::id());
            drop(f);
            if lock_is_stale(lock, stale_ms) {
                let _ = fs::remove_file(lock);
            }
            let _ = fs::remove_file(&guard);
            true
        }
        Err(_) => {
            // A thief that died inside its turn must not block everyone.
            if file_age_ms(&guard).is_some_and(|age| age > STEAL_GUARD_STALE_MS) {
                let _ = fs::remove_file(&guard);
            }
            false
        }
    }
}

fn new_nonce() -> String {
    use std::sync::atomic::{AtomicU64, Ordering};
    static COUNTER: AtomicU64 = AtomicU64::new(0);
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    format!(
        "{:x}-{:x}-{:x}",
        nanos,
        std::process::id(),
        COUNTER.fetch_add(1, Ordering::Relaxed)
    )
}

/// Refreshes the lock's mtime for as long as the returned sender lives.
fn start_heartbeat(
    path: PathBuf,
    nonce: String,
    every: std::time::Duration,
) -> (std::sync::mpsc::Sender<()>, std::thread::JoinHandle<()>) {
    let (tx, rx) = std::sync::mpsc::channel::<()>();
    let handle = std::thread::spawn(move || {
        while let Err(std::sync::mpsc::RecvTimeoutError::Timeout) = rx.recv_timeout(every) {
            if !lock_owner_is(&path, &nonce) {
                return;
            }
            if let Ok(f) = fs::OpenOptions::new().write(true).open(&path) {
                let _ = f.set_modified(SystemTime::now());
            }
        }
    });
    (tx, handle)
}

fn acquire_dir_lock_with(dir: &Path, stale_ms: u128, wait_ms: u128) -> Result<DirLock, String> {
    use std::io::Write;
    let path = dir.join(LOCK_FILE_NAME);
    let started = now_ms();
    let timed_out = || now_ms().saturating_sub(started) > wait_ms;
    loop {
        match fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&path)
        {
            Ok(mut f) => {
                let nonce = new_nonce();
                let _ = write!(f, "{} {} {}", std::process::id(), now_ms(), nonce);
                drop(f);
                let every = std::time::Duration::from_millis((stale_ms / 3).clamp(5, 10_000) as u64);
                let (stop, heartbeat) = start_heartbeat(path.clone(), nonce.clone(), every);
                return Ok(DirLock {
                    path,
                    nonce,
                    stop: Some(stop),
                    heartbeat: Some(heartbeat),
                });
            }
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => {
                if timed_out() {
                    return Err("could not take the data lock: another window is still writing".to_string());
                }
                if lock_is_stale(&path, stale_ms) {
                    if !try_steal(dir, &path, stale_ms) {
                        std::thread::sleep(std::time::Duration::from_millis(5));
                    }
                    continue;
                }
                std::thread::sleep(std::time::Duration::from_millis(20));
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                // The folder is gone (or not yet created): make it and retry.
                fs::create_dir_all(dir)
                    .map_err(|e| format!("could not create {}: {e}", dir.display()))?;
            }
            Err(e) => return Err(format!("could not take the data lock: {e}")),
        }
    }
}

/// Both locks of one write cycle: the in-process mutex (fields drop in
/// declaration order, so the file goes first) and the cross-process file.
struct WriteGuard {
    _dir: DirLock,
    _mem: MutexGuard<'static, ()>,
}

fn lock_for_write(dir: &Path) -> Result<WriteGuard, String> {
    // A poisoned lock only means some earlier save panicked; the data it
    // guards is a plain (), so recovering is strictly better than refusing
    // every save from here on.
    let mem = WRITE_LOCK
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    fs::create_dir_all(dir).map_err(|e| format!("could not create {}: {e}", dir.display()))?;
    let dir_lock = acquire_dir_lock_with(dir, LOCK_STALE_MS, LOCK_WAIT_MS)?;
    Ok(WriteGuard {
        _dir: dir_lock,
        _mem: mem,
    })
}

// ============ durable writes ============

/// Writes and fsyncs, so the bytes are on disk before anything is renamed
/// over a good file. Never leaves a half-written file when it fails.
fn write_synced(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    use std::io::Write;
    let result = (|| {
        let mut f = fs::File::create(path)?;
        f.write_all(bytes)?;
        f.sync_all()
    })();
    if result.is_err() {
        let _ = fs::remove_file(path);
    }
    result
}

/// Best-effort fsync of the folder after a rename. Windows cannot open a
/// directory as a file, so it is skipped there; a failure changes nothing —
/// the rename already happened and the file is intact.
fn sync_dir(dir: &Path) {
    #[cfg(unix)]
    {
        if let Ok(d) = fs::File::open(dir) {
            let _ = d.sync_all();
        }
    }
    #[cfg(not(unix))]
    {
        let _ = dir;
    }
}

/// Atomic file replace: synced temp file, rename (with retry), folder sync.
fn replace_file_atomically(dir: &Path, tmp: &Path, target: &Path, bytes: &[u8]) -> Result<(), String> {
    write_synced(tmp, bytes).map_err(|e| format!("could not write temp file: {e}"))?;
    rename_with_retry(tmp, target).map_err(|e| {
        let _ = fs::remove_file(tmp);
        format!("could not replace store: {e}")
    })?;
    sync_dir(dir);
    Ok(())
}

// ============ record-level three-way merge ============

/// `(id key, record)` for each element of an array of objects that all carry
/// a string or number `id`, none repeated. `None` for anything else — such a
/// key is not a list of records and is replaced wholesale.
fn records_by_id(v: &Value) -> Option<Vec<(String, &Value)>> {
    let items = v.as_array()?;
    let mut seen = std::collections::HashSet::new();
    let mut out = Vec::with_capacity(items.len());
    for item in items {
        let id = item.as_object()?.get("id")?;
        if !(id.is_string() || id.is_number()) {
            return None;
        }
        let key = id.to_string();
        if !seen.insert(key.clone()) {
            return None;
        }
        out.push((key, item));
    }
    Some(out)
}

/// Applies what the caller changed (`new` against `base`, matched by id) onto
/// `current`, the array now in the file:
///  - removed (in base, not in new): removed from current — unless the file's
///    version was edited since base: then it stays and is a conflict;
///  - added (in new, not in base): added; a same-id record in the file with
///    other content is an add-add conflict (the file's stays), identical is fine;
///  - modified (differs from base): replaces the current record when the file
///    still has the base version (or already has the same edit). When the file
///    has a different version, or no longer has it, the file wins and the
///    record is reported as a conflict (nothing is merged field by field);
///  - untouched records keep the file's version, and records another window
///    added meanwhile (in current, in neither base nor new) are kept.
/// Every non-conflicting change is applied regardless of conflicts elsewhere.
/// `None` when any of the three is not a clean list of id records (including
/// an absent `current`): the caller then replaces, as before.
fn merge_records(
    key_name: &str,
    base: &Value,
    new: &Value,
    current: Option<&Value>,
) -> Option<(Vec<Value>, Vec<RecordConflict>)> {
    let base_l = records_by_id(base)?;
    let new_l = records_by_id(new)?;
    let cur_l = records_by_id(current?)?;
    let base_m: HashMap<&str, &Value> = base_l.iter().map(|(k, v)| (k.as_str(), *v)).collect();
    let cur_m: HashMap<&str, &Value> = cur_l.iter().map(|(k, v)| (k.as_str(), *v)).collect();
    let new_keys: std::collections::HashSet<&str> = new_l.iter().map(|(k, _)| k.as_str()).collect();
    let id_of = |item: &Value| item.get("id").cloned().unwrap_or(Value::Null);

    let mut out: Vec<Value> = Vec::with_capacity(new_l.len());
    let mut out_keys: Vec<&str> = Vec::with_capacity(new_l.len());
    let mut conflicts: Vec<RecordConflict> = Vec::new();
    for (key, item) in &new_l {
        let key = key.as_str();
        match base_m.get(key) {
            Some(old) if *old == *item => {
                // Not touched by this caller: whatever the file has is current
                // (and if it is gone, someone else deleted it — stays deleted).
                if let Some(c) = cur_m.get(key) {
                    out.push((*c).clone());
                    out_keys.push(key);
                }
            }
            Some(old) => match cur_m.get(key) {
                // The file still has what the caller started from: apply.
                Some(c) if *c == *old => {
                    out.push((*item).clone());
                    out_keys.push(key);
                }
                // Someone made the very same edit: nothing to resolve.
                Some(c) if *c == *item => {
                    out.push((*c).clone());
                    out_keys.push(key);
                }
                Some(c) => {
                    conflicts.push(RecordConflict {
                        key: key_name.to_string(),
                        id: id_of(item),
                        kind: CONFLICT_EDIT_EDIT,
                        mine: Some((*item).clone()),
                        theirs: Some((*c).clone()),
                    });
                    out.push((*c).clone());
                    out_keys.push(key);
                }
                None => conflicts.push(RecordConflict {
                    key: key_name.to_string(),
                    id: id_of(item),
                    kind: CONFLICT_EDIT_DELETED,
                    mine: Some((*item).clone()),
                    theirs: None,
                }),
            },
            None => match cur_m.get(key) {
                // Same id already in the file with other content: never a
                // silent overwrite. The file's version stays.
                Some(c) if *c != *item => {
                    conflicts.push(RecordConflict {
                        key: key_name.to_string(),
                        id: id_of(item),
                        kind: CONFLICT_ADD_ADD,
                        mine: Some((*item).clone()),
                        theirs: Some((*c).clone()),
                    });
                    out.push((*c).clone());
                    out_keys.push(key);
                }
                // Identical (a retried write) or genuinely new.
                _ => {
                    out.push((*item).clone());
                    out_keys.push(key);
                }
            },
        }
    }
    for (idx, (key, item)) in cur_l.iter().enumerate() {
        let key = key.as_str();
        if new_keys.contains(key) {
            continue;
        }
        if let Some(old) = base_m.get(key) {
            // The caller deleted it. Fine if the file still has what the
            // caller saw; if the file edited it meanwhile, that edit stays.
            if *old == *item {
                continue;
            }
            conflicts.push(RecordConflict {
                key: key_name.to_string(),
                id: id_of(item),
                kind: CONFLICT_DELETED_EDITED,
                mine: None,
                theirs: Some((*item).clone()),
            });
        }
        // Added by someone else (or kept after a conflict): after its nearest
        // earlier neighbour that made it into the result, else at the front.
        let at = cur_l[..idx]
            .iter()
            .rev()
            .find_map(|(k, _)| out_keys.iter().position(|o| *o == k.as_str()))
            .map(|p| p + 1)
            .unwrap_or(0);
        out.insert(at, (*item).clone());
        out_keys.insert(at, key);
    }
    Some((out, conflicts))
}

/// A missing or corrupt store reads as empty — same as the TS version. The
/// app then starts with empty defaults rather than failing to launch, and
/// the rotating backups in `backups/` are there for actual recovery.
pub fn read_store_in(dir: &Path) -> Store {
    let Ok(raw) = fs::read_to_string(dir.join(STORE_FILE_NAME)) else {
        return Store::new();
    };
    // A UTF-8 byte-order mark (what Windows editors and PowerShell add) is not
    // damage: the same JSON with a BOM in front of it is still the user's data.
    match serde_json::from_str::<Value>(raw.trim_start_matches('﻿')) {
        Ok(Value::Object(map)) => map,
        _ => Store::new(),
    }
}

pub const STORE_CORRUPT_PREFIX: &str = "STORE_CORRUPT:";
const LAST_VERSION_FILE: &str = ".last-version";

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
pub enum CorruptReason {
    #[serde(rename = "unparseable")]
    Unparseable,
    #[serde(rename = "not-an-object")]
    NotAnObject,
    #[serde(rename = "unreadable")]
    Unreadable,
    /// The file is gone although backups exist: not a fresh install.
    #[serde(rename = "missing")]
    Missing,
}

impl CorruptReason {
    pub fn as_str(self) -> &'static str {
        match self {
            CorruptReason::Unparseable => "unparseable",
            CorruptReason::NotAnObject => "not-an-object",
            CorruptReason::Unreadable => "unreadable",
            CorruptReason::Missing => "missing",
        }
    }
}

#[derive(Serialize, Clone, Debug, Default, PartialEq)]
pub struct Meta {
    #[serde(rename = "upgradedFrom")]
    pub upgraded_from: Option<String>,
    #[serde(rename = "upgradeCopy")]
    pub upgrade_copy: Option<String>,
}

#[derive(Serialize, Debug)]
pub struct BackupCounts {
    pub seder: usize,
    pub learning: usize,
}

#[derive(Serialize, Debug)]
pub struct BackupInfo {
    pub name: String,
    pub ts: u64,
    pub size: u64,
    pub valid: bool,
    pub counts: BackupCounts,
}

#[derive(Serialize, Debug)]
#[serde(tag = "status")]
pub enum StoreLoad {
    #[serde(rename = "missing")]
    Missing { meta: Meta },
    #[serde(rename = "ok")]
    Loaded { store: Store, meta: Meta },
    #[serde(rename = "corrupt")]
    Corrupt {
        reason: CorruptReason,
        message: String,
        #[serde(rename = "preservedAs")]
        preserved_as: Option<String>,
        backups: Vec<BackupInfo>,
        meta: Meta,
    },
}

/// `Ok(None)` = the file does not exist.
fn read_raw(file: &Path) -> Result<Option<Vec<u8>>, std::io::Error> {
    // A virus scanner or sync client can hold the file for a moment; a
    // transient sharing violation must not look like a damaged file.
    let mut attempt = 0;
    loop {
        match fs::read(file) {
            Ok(bytes) => return Ok(Some(bytes)),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
            Err(e) if attempt < 4 => {
                let _ = e;
                attempt += 1;
                std::thread::sleep(std::time::Duration::from_millis(60));
            }
            Err(e) => return Err(e),
        }
    }
}

fn classify(bytes: &[u8]) -> Result<Store, (CorruptReason, String)> {
    if bytes.is_empty() {
        return Err((
            CorruptReason::Unparseable,
            "the data file is empty".to_string(),
        ));
    }
    let bytes = bytes.strip_prefix(&[0xEF, 0xBB, 0xBF][..]).unwrap_or(bytes);
    match serde_json::from_slice::<Value>(bytes) {
        Ok(Value::Object(map)) => Ok(map),
        Ok(_) => Err((
            CorruptReason::NotAnObject,
            "the data file is not a JSON object".to_string(),
        )),
        Err(e) => Err((
            CorruptReason::Unparseable,
            format!("the data file is not valid JSON: {e}"),
        )),
    }
}

/// `Ok(None)` = missing; `Err` = exists but unusable.
fn read_store_strict_in(dir: &Path) -> Result<Option<Store>, (CorruptReason, String)> {
    match read_raw(&dir.join(STORE_FILE_NAME)) {
        Ok(None) => Ok(None),
        Ok(Some(bytes)) => classify(&bytes).map(Some),
        Err(e) => Err((
            CorruptReason::Unreadable,
            format!("could not read the data file: {e}"),
        )),
    }
}

/// Copies damaged bytes 1:1 to `sedorim-data.corrupt.<ts>.json`, unless an
/// identical copy already exists. Returns the name of the copy.
fn preserve_corrupt_in(dir: &Path, bytes: &[u8]) -> Option<String> {
    const PREFIX: &str = "sedorim-data.corrupt.";
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if name.starts_with(PREFIX) && name.ends_with(".json") {
                if let Ok(existing) = fs::read(entry.path()) {
                    if existing == bytes {
                        return Some(name);
                    }
                }
            }
        }
    }
    let mut ts = now_ms();
    for _ in 0..1000 {
        let name = format!("{PREFIX}{ts}.json");
        match fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(dir.join(&name))
        {
            Ok(mut f) => {
                use std::io::Write;
                if f.write_all(bytes).is_err() {
                    return None;
                }
                let _ = f.sync_all();
                return Some(name);
            }
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => ts += 1,
            Err(_) => return None,
        }
    }
    None
}

fn count_array(map: &Store, keys: &[&str]) -> usize {
    keys.iter()
        .find_map(|k| map.get(*k).and_then(Value::as_array))
        .map(Vec::len)
        .unwrap_or(0)
}

fn list_backups_in(dir: &Path) -> Vec<BackupInfo> {
    let backup_dir = dir.join(BACKUP_DIR_NAME);
    let Ok(entries) = fs::read_dir(&backup_dir) else {
        return Vec::new();
    };
    let mut out: Vec<BackupInfo> = entries
        .flatten()
        .filter_map(|entry| {
            let name = entry.file_name().to_string_lossy().to_string();
            let ts = backup_ts_from_name(&name)?;
            let bytes = fs::read(entry.path()).unwrap_or_default();
            let parsed = classify(&bytes);
            let (valid, counts) = match &parsed {
                Ok(map) => (
                    true,
                    BackupCounts {
                        seder: count_array(map, &["seder", "attendance"]),
                        learning: count_array(map, &["learning"]),
                    },
                ),
                Err(_) => (
                    false,
                    BackupCounts {
                        seder: 0,
                        learning: 0,
                    },
                ),
            };
            Some(BackupInfo {
                name,
                ts: ts as u64,
                size: bytes.len() as u64,
                valid,
                counts,
            })
        })
        .collect();
    out.sort_by(|a, b| b.ts.cmp(&a.ts));
    out
}

fn sanitize_part(s: &str) -> String {
    let cleaned: String = s
        .chars()
        .take(40)
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.' {
                c
            } else {
                '_'
            }
        })
        .collect();
    if cleaned.is_empty() {
        "manual".to_string()
    } else {
        cleaned
    }
}

/// (dir, version) pairs whose copy was made but whose `.last-version` marker
/// could not be written: without this memory every launch would make another
/// copy of the same file.
static MARKER_FAILED: Mutex<Vec<(PathBuf, String)>> = Mutex::new(Vec::new());

fn log_error_in(dir: &Path, message: &str) {
    crate::logfile::append_in(&dir.join(crate::logfile::LOG_DIR_NAME), "error", message).ok();
}

/// `.last-version` is replaced atomically (synced temp + rename), never
/// written in place, so a crash cannot leave it half-written.
fn write_marker_atomically(backup_dir: &Path, marker: &Path, version: &str) -> Result<(), String> {
    let tmp = backup_dir.join(format!("{LAST_VERSION_FILE}.{}.tmp", std::process::id()));
    replace_file_atomically(backup_dir, &tmp, marker, version.as_bytes())
}

/// Runs the automatic once-per-version raw copy. Failures are logged, never
/// returned. The whole check-copy-mark sequence runs under the cross-process
/// lock, so two windows opened together make ONE copy (the second finds the
/// marker). `.last-version` only advances after the copy was written, synced
/// and read back byte for byte.
pub fn ensure_upgrade_copy_in(dir: &Path, version: &str) -> Meta {
    let backup_dir = dir.join(BACKUP_DIR_NAME);
    let marker = backup_dir.join(LAST_VERSION_FILE);
    let file = dir.join(STORE_FILE_NAME);
    let quick_previous = fs::read_to_string(&marker)
        .ok()
        .map(|s| s.trim().to_string());
    if quick_previous.as_deref() == Some(version) {
        return Meta::default();
    }
    let remembered = |m: &Vec<(PathBuf, String)>| {
        m.iter().any(|(d, v)| d == dir && v == version)
    };
    if remembered(&MARKER_FAILED.lock().unwrap_or_else(|p| p.into_inner())) {
        return Meta::default();
    }

    let _guard = match lock_for_write(dir) {
        Ok(g) => g,
        Err(e) => {
            log_error_in(dir, &format!("עותק שדרוג נכשל (נעילה): {e}"));
            return Meta::default();
        }
    };
    // Again, now that no other process can be between its check and its mark.
    let previous = fs::read_to_string(&marker)
        .ok()
        .map(|s| s.trim().to_string());
    if previous.as_deref() == Some(version) {
        return Meta::default();
    }
    let bytes = match read_raw(&file) {
        Ok(Some(b)) => b,
        Ok(None) => {
            // Fresh install: nothing to protect, just remember the version.
            if fs::create_dir_all(&backup_dir).is_ok() {
                if let Err(e) = write_marker_atomically(&backup_dir, &marker, version) {
                    log_error_in(dir, &format!("סימון גרסה נכשל: {e}"));
                }
            }
            return Meta::default();
        }
        Err(e) => {
            log_error_in(dir, &format!("עותק שדרוג נכשל (קריאה): {e}"));
            return Meta::default();
        }
    };
    let from = previous.unwrap_or_else(|| "unknown".to_string());
    let name = format!(
        "sedorim-upgrade.{}-to-{}.{}.json",
        sanitize_part(&from),
        sanitize_part(version),
        now_ms()
    );
    let copy = backup_dir.join(&name);
    let copied = fs::create_dir_all(&backup_dir)
        .and_then(|_| write_synced(&copy, &bytes))
        .and_then(|_| match fs::read(&copy) {
            Ok(back) if back == bytes => Ok(()),
            Ok(_) => Err(std::io::Error::other("the copy does not match the original")),
            Err(e) => Err(e),
        });
    if let Err(e) = copied {
        let _ = fs::remove_file(&copy);
        log_error_in(dir, &format!("עותק שדרוג נכשל: {e}"));
        return Meta::default();
    }
    if let Err(e) = write_marker_atomically(&backup_dir, &marker, version) {
        // The copy is good; only the marker failed. Remember in this process
        // so the next call does not copy the same file again.
        MARKER_FAILED
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .push((dir.to_path_buf(), version.to_string()));
        log_error_in(dir, &format!("עותק שדרוג נשמר אך סימון הגרסה נכשל: {e}"));
    }
    Meta {
        upgraded_from: Some(from),
        upgrade_copy: Some(name),
    }
}

/// The safe loader. `meta` is supplied by the caller (see `load_store_checked`).
pub fn read_store_checked_with_meta(dir: &Path, meta: Meta) -> StoreLoad {
    let file = dir.join(STORE_FILE_NAME);
    let bytes = match read_raw(&file) {
        Ok(None) => {
            // No file but a history of backups: the file was deleted, not
            // never created. Offer the backups instead of a silent fresh start.
            let backups = list_backups_in(dir);
            if backups.iter().any(|b| b.valid) {
                return StoreLoad::Corrupt {
                    reason: CorruptReason::Missing,
                    message: "קובץ הנתונים חסר, אך נמצאו גיבויים".to_string(),
                    preserved_as: None,
                    backups,
                    meta,
                };
            }
            return StoreLoad::Missing { meta };
        }
        Ok(Some(b)) => b,
        Err(e) => {
            return StoreLoad::Corrupt {
                reason: CorruptReason::Unreadable,
                message: format!("could not read the data file: {e}"),
                preserved_as: None,
                backups: list_backups_in(dir),
                meta,
            }
        }
    };
    match classify(&bytes) {
        Ok(store) => StoreLoad::Loaded { store, meta },
        Err((reason, message)) => StoreLoad::Corrupt {
            reason,
            message,
            preserved_as: preserve_corrupt_in(dir, &bytes),
            backups: list_backups_in(dir),
            meta,
        },
    }
}

/// Loads with the automatic upgrade copy evaluated for this crate's version.
pub fn read_store_checked_in(dir: &Path) -> StoreLoad {
    let meta = ensure_upgrade_copy_in(dir, env!("CARGO_PKG_VERSION"));
    read_store_checked_with_meta(dir, meta)
}

static PROCESS_META: Mutex<Option<Meta>> = Mutex::new(None);

/// Process-level upgrade copy: runs on the first call only, its meta is
/// repeated on later calls. Everything that writes the data file from a
/// process (the app's load, the agent before its first write) goes through
/// here, so the file is copied once per version no matter who starts first.
pub fn ensure_upgrade_copy(version: &str) -> Meta {
    let dir = data_dir();
    let mut guard = PROCESS_META.lock().unwrap_or_else(|p| p.into_inner());
    guard
        .get_or_insert_with(|| ensure_upgrade_copy_in(&dir, version))
        .clone()
}

/// True when some version of the app has already run against this folder.
/// The background agent is built from a crate with its own version number, so
/// it must not advance the marker (it would flip between the two numbers and
/// make a copy at every launch); it only asks for a copy when nobody has yet.
pub fn upgrade_marker_exists() -> bool {
    data_dir().join(BACKUP_DIR_NAME).join(LAST_VERSION_FILE).exists()
}

/// Process-level entry point for the Tauri command.
pub fn load_store_checked(version: &str) -> StoreLoad {
    let meta = ensure_upgrade_copy(version);
    read_store_checked_with_meta(&data_dir(), meta)
}

/// Windows refuses a rename while another process has the target open.
fn rename_with_retry(from: &Path, to: &Path) -> std::io::Result<()> {
    let mut attempt = 0;
    loop {
        match fs::rename(from, to) {
            Ok(()) => return Ok(()),
            Err(e) if attempt < 5 => {
                let _ = e;
                attempt += 1;
                std::thread::sleep(std::time::Duration::from_millis(50));
            }
            Err(e) => return Err(e),
        }
    }
}

fn atomic_write_in(dir: &Path, body: &str, updated_at: u64) -> Result<(), String> {
    let file = dir.join(STORE_FILE_NAME);
    let tmp = dir.join(format!(
        ".{STORE_FILE_NAME}.{}.{updated_at}.recover.tmp",
        std::process::id()
    ));
    replace_file_atomically(dir, &tmp, &file, body.as_bytes())
}

fn write_object_in(dir: &Path, mut map: Store) -> Result<SaveResult, String> {
    let updated_at = now_ms() as u64;
    map.insert("updatedAt".to_string(), Value::from(updated_at));
    let body = serde_json::to_string(&map).map_err(|e| e.to_string())?;
    atomic_write_in(dir, &body, updated_at)?;
    Ok(SaveResult {
        ok: true,
        updated_at,
        merged: None,
        conflicts: Vec::new(),
    })
}

/// Saves whatever is in the main file (if anything) before it is replaced.
/// Fails (so the caller must not overwrite) when a file exists but no copy of
/// it could be made.
fn preserve_current_in(dir: &Path) -> Result<(), String> {
    match read_raw(&dir.join(STORE_FILE_NAME)) {
        Ok(None) => Ok(()),
        Ok(Some(bytes)) => preserve_corrupt_in(dir, &bytes)
            .map(|_| ())
            .ok_or_else(|| "could not keep a copy of the current file; nothing was changed".to_string()),
        Err(e) => Err(format!(
            "could not read the current file to keep a copy; nothing was changed: {e}"
        )),
    }
}

/// The top-level keys this version of the app knows. Anything else in a file is
/// reported by `preview_backup` as an unknown key (kept on restore, never lost).
const KNOWN_KEYS: &[&str] = &[
    "seder",
    "learning",
    "timer",
    "settings",
    "theme",
    "onboarded",
    "snapshots",
    "lastAutoBackupAt",
    "notificationsSent",
    "notificationLearning",
    "backgroundPlan",
    "phoneReport",
    "updatedAt",
];

/// What one data file holds, for the "what will be replaced" preview.
#[derive(Serialize, Debug, Clone, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct StoreSummary {
    pub seder_count: usize,
    pub learning_count: usize,
    /// Earliest / latest `date` among the attendance records.
    pub attendance_first: Option<String>,
    pub attendance_last: Option<String>,
    /// Earliest / latest `date` among the learning records.
    pub learning_first: Option<String>,
    pub learning_last: Option<String>,
    pub has_settings: bool,
    pub has_onboarded: bool,
    /// `onboarded` is present and true.
    pub onboarded: bool,
    /// A timer session is running (the `timer` key is not null).
    pub has_timer: bool,
    pub has_snapshots: bool,
    pub snapshots_count: usize,
    /// Names of top-level keys this version does not know.
    pub unknown_keys: Vec<String>,
    pub updated_at: Option<u64>,
}

fn date_range(list: Option<&Value>) -> (usize, Option<String>, Option<String>) {
    let Some(items) = list.and_then(Value::as_array) else {
        return (0, None, None);
    };
    let mut first: Option<&str> = None;
    let mut last: Option<&str> = None;
    for date in items.iter().filter_map(|i| i.get("date").and_then(Value::as_str)) {
        if first.map_or(true, |f| date < f) {
            first = Some(date);
        }
        if last.map_or(true, |l| date > l) {
            last = Some(date);
        }
    }
    (items.len(), first.map(str::to_string), last.map(str::to_string))
}

fn summarize_store(map: &Store) -> StoreSummary {
    let (seder_count, attendance_first, attendance_last) = date_range(map.get("seder"));
    let (learning_count, learning_first, learning_last) = date_range(map.get("learning"));
    let present = |k: &str| map.get(k).is_some_and(|v| !v.is_null());
    let snapshots_count = map
        .get("snapshots")
        .and_then(Value::as_array)
        .map_or(0, Vec::len);
    let mut unknown_keys: Vec<String> = map
        .keys()
        .filter(|k| !KNOWN_KEYS.contains(&k.as_str()))
        .cloned()
        .collect();
    unknown_keys.sort();
    StoreSummary {
        seder_count,
        learning_count,
        attendance_first,
        attendance_last,
        learning_first,
        learning_last,
        has_settings: present("settings"),
        has_onboarded: present("onboarded"),
        onboarded: map.get("onboarded").is_some_and(|v| {
            v == &Value::Bool(true) || v.as_str() == Some("1")
        }),
        has_timer: present("timer"),
        has_snapshots: snapshots_count > 0,
        snapshots_count,
        unknown_keys,
        updated_at: map.get("updatedAt").and_then(Value::as_u64),
    }
}

/// What `preview_backup` returns: the backup next to what is in the data file
/// now, so the screen can say what a restore would replace and what it would
/// leave out.
#[derive(Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BackupPreview {
    pub name: String,
    /// When the backup was taken (ms since the epoch, from its file name).
    pub ts: u64,
    pub size: u64,
    pub backup: StoreSummary,
    /// `"ok"` (current file read), `"missing"` or `"unreadable"` (damaged).
    pub current_status: &'static str,
    pub current: Option<StoreSummary>,
    pub current_error: Option<String>,
}

/// Read-only look at a backup (and at the current file) before a restore.
/// Rejects anything that is not a rotating-backup file name, and a backup that
/// would not be accepted by `recover_store`.
pub fn preview_backup_in(dir: &Path, name: &str) -> Result<BackupPreview, String> {
    let ts = backup_ts_from_name(name).ok_or_else(|| "invalid backup name".to_string())?;
    let bytes = fs::read(dir.join(BACKUP_DIR_NAME).join(name))
        .map_err(|e| format!("could not read backup: {e}"))?;
    let map = classify(&bytes).map_err(|(_, m)| format!("backup is not usable: {m}"))?;
    let (current_status, current, current_error) = match read_store_strict_in(dir) {
        Ok(Some(m)) => ("ok", Some(summarize_store(&m)), None),
        Ok(None) => ("missing", None, None),
        Err((_, message)) => ("unreadable", None, Some(message)),
    };
    Ok(BackupPreview {
        name: name.to_string(),
        ts: ts as u64,
        size: bytes.len() as u64,
        backup: summarize_store(&map),
        current_status,
        current,
        current_error,
    })
}

/// Reads the main file back from disk and checks it holds exactly what was
/// restored (everything but `updatedAt`, which a write always restamps).
fn verify_restored(dir: &Path, expected: &Store) -> Result<(), String> {
    let bytes = read_raw(&dir.join(STORE_FILE_NAME))
        .map_err(|e| format!("the restore could not be verified: {e}"))?
        .ok_or_else(|| "the restore could not be verified: the file is missing".to_string())?;
    let mut written = classify(&bytes)
        .map_err(|(_, m)| format!("the restore could not be verified: {m}"))?;
    let mut want = expected.clone();
    written.remove("updatedAt");
    want.remove("updatedAt");
    if written == want {
        Ok(())
    } else {
        Err("the restore could not be verified: the file on disk differs from the backup".to_string())
    }
}

/// Replaces the main file with a valid backup. The file being replaced is
/// copied first (`sedorim-data.corrupt.<ts>.json`, never overwriting), and the
/// call succeeds only after the new file was read back from disk and found
/// identical to the backup.
pub fn recover_store_in(dir: &Path, name: &str) -> Result<SaveResult, String> {
    if backup_ts_from_name(name).is_none() {
        return Err("invalid backup name".to_string());
    }
    let _guard = lock_for_write(dir)?;
    let bytes = fs::read(dir.join(BACKUP_DIR_NAME).join(name))
        .map_err(|e| format!("could not read backup: {e}"))?;
    let map = classify(&bytes).map_err(|(_, m)| format!("backup is not usable: {m}"))?;
    preserve_current_in(dir)?;
    let result = write_object_in(dir, map.clone())?;
    verify_restored(dir, &map)?;
    Ok(result)
}

pub fn start_empty_store_in(dir: &Path) -> Result<SaveResult, String> {
    let _guard = lock_for_write(dir)?;
    preserve_current_in(dir)?;
    write_object_in(dir, Store::new())
}

pub fn create_upgrade_copy_in(
    dir: &Path,
    label: &str,
    legacy: Option<&Value>,
) -> Result<Vec<String>, String> {
    let backup_dir = dir.join(BACKUP_DIR_NAME);
    let _guard = lock_for_write(dir)?;
    fs::create_dir_all(&backup_dir)
        .map_err(|e| format!("could not create {}: {e}", backup_dir.display()))?;
    let ts = now_ms();
    let mut label = sanitize_part(label);
    let bytes = match read_raw(&dir.join(STORE_FILE_NAME)) {
        Ok(Some(b)) => b,
        Ok(None) => {
            label.push_str(".no-data-file");
            b"{}".to_vec()
        }
        Err(e) => return Err(format!("could not read the data file: {e}")),
    };
    let mut files = Vec::new();
    let main = format!("sedorim-upgrade.{ts}.{label}.json");
    write_checked(&backup_dir.join(&main), &bytes)
        .map_err(|e| format!("could not write copy: {e}"))?;
    files.push(main);
    if let Some(legacy) = legacy {
        let name = format!("sedorim-upgrade.{ts}.{label}.legacy-localstorage.json");
        let body = serde_json::to_vec(legacy).map_err(|e| e.to_string())?;
        write_checked(&backup_dir.join(&name), &body)
            .map_err(|e| format!("could not write legacy copy: {e}"))?;
        files.push(name);
    }
    Ok(files)
}

/// Synced write, then read the file back and compare the bytes. A copy that
/// fails either step is removed rather than left looking like a good one.
fn write_checked(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    write_synced(path, bytes)?;
    match fs::read(path) {
        Ok(back) if back == bytes => Ok(()),
        other => {
            let _ = fs::remove_file(path);
            match other {
                Err(e) => Err(e),
                Ok(_) => Err(std::io::Error::other("the copy does not match what was written")),
            }
        }
    }
}

/// One locked read-modify-write of the data file; the single place that
/// reads, lets `mutate` change the object, and replaces the file.
///
/// `mutate` returns `Ok(false)` for "nothing to write" (the file is then left
/// alone). It may run more than once: when an older build wrote without the
/// lock and moved the file under us, the attempt is thrown away and redone
/// against fresh data.
fn modify_store_in(
    dir: &Path,
    mutate: &mut dyn FnMut(&mut Store) -> Result<bool, String>,
) -> Result<SaveResult, String> {
    let _guard = lock_for_write(dir)?;
    let file = dir.join(STORE_FILE_NAME);

    for _ in 0..MAX_WRITE_ATTEMPTS {
        let before = file_mtime_ns(&file);

        // Never merge into an empty stand-in for a file that exists but is
        // damaged: that would overwrite the only copy of the user's data.
        let mut store = match read_store_strict_in(dir) {
            Ok(Some(map)) => map,
            Ok(None) => Store::new(),
            Err((reason, message)) => {
                if let Ok(Some(bytes)) = read_raw(&file) {
                    let _ = preserve_corrupt_in(dir, &bytes);
                }
                return Err(format!(
                    "{STORE_CORRUPT_PREFIX} {}: {message}",
                    reason.as_str()
                ));
            }
        };
        if !mutate(&mut store)? {
            let updated_at = store.get("updatedAt").and_then(Value::as_u64).unwrap_or(0);
            return Ok(SaveResult {
                ok: true,
                updated_at,
                merged: None,
                conflicts: Vec::new(),
            });
        }
        let updated_at = now_ms() as u64;
        store.insert("updatedAt".to_string(), Value::from(updated_at));

        let body = serde_json::to_string(&store).map_err(|e| e.to_string())?;
        let tmp = dir.join(format!(
            ".{STORE_FILE_NAME}.{}.{updated_at}.tmp",
            std::process::id()
        ));
        write_synced(&tmp, body.as_bytes())
            .map_err(|e| format!("could not write temp file: {e}"))?;

        if file_mtime_ns(&file) != before {
            // Something wrote without taking the lock, so the copy we just
            // merged into is stale. Drop this attempt and retry against
            // fresh data instead of clobbering their keys.
            let _ = fs::remove_file(&tmp);
            continue;
        }

        // Rename over the live file: readers either see all of the old file
        // or all of the new one, never a partial write. The temp file is
        // already synced, so a power cut cannot leave an empty new file.
        if let Err(e) = rename_with_retry(&tmp, &file) {
            // Windows can refuse the rename if something else has the file
            // open (a sharing violation). Clean up after ourselves rather
            // than leaving a stray .tmp behind in the user's data folder.
            let _ = fs::remove_file(&tmp);
            return Err(format!("could not replace store: {e}"));
        }
        sync_dir(dir);
        maybe_backup(dir, &body);
        return Ok(SaveResult {
            ok: true,
            updated_at,
            merged: None,
            conflicts: Vec::new(),
        });
    }

    Err("save_keys: too much write contention, giving up".to_string())
}

/// Applies `patch` to the store in one atomic read-modify-write, each key
/// replaced as a whole. See `save_keys_merging_in` for the record-level form.
///
/// Callers that need to replace several keys together (restoring a backup
/// holding both `seder` and `learning`, say) must pass them in a single
/// patch. Two independent saves leave a real window where the file — and
/// anything polling it, including the other EXE — can observe a half-updated
/// state.
pub fn save_keys_in(dir: &Path, patch: &Store) -> Result<SaveResult, String> {
    save_keys_merging_in(dir, patch, None)
}

/// Like `save_keys_in`, but for every patched key that also has an entry in
/// `bases`, and where base, new value and the file's current value are all
/// arrays of records with unique `id`s, the change is applied record by
/// record (see `merge_records`) instead of replacing the array, so a record
/// another window added or edited since `base` was loaded survives. Keys
/// without a base (or not id-record arrays: settings, timer...) are replaced,
/// exactly as before. When a merge kept something the caller did not send,
/// the final array comes back in `SaveResult.merged`; a record the caller
/// changed that another window also changed or deleted is NOT overwritten:
/// the file keeps its version and the record is listed in `SaveResult.conflicts`.
pub fn save_keys_merging_in(
    dir: &Path,
    patch: &Store,
    bases: Option<&Store>,
) -> Result<SaveResult, String> {
    let mut merged = Store::new();
    let mut conflicts: Vec<RecordConflict> = Vec::new();
    let mut result = modify_store_in(dir, &mut |store| {
        merged.clear();
        conflicts.clear();
        for (key, value) in patch {
            let combined = bases
                .and_then(|b| b.get(key))
                .and_then(|base| merge_records(key, base, value, store.get(key)));
            match combined {
                Some((list, found)) => {
                    let list = Value::Array(list);
                    if &list != value {
                        merged.insert(key.clone(), list.clone());
                    }
                    conflicts.extend(found);
                    store.insert(key.clone(), list);
                }
                None => {
                    store.insert(key.clone(), value.clone());
                }
            }
        }
        Ok(true)
    })?;
    if !merged.is_empty() {
        result.merged = Some(merged);
    }
    result.conflicts = conflicts;
    Ok(result)
}

/// Locked read-modify-write of ONE top-level key: `change` gets the file's
/// current value for it and returns the new one (`None` = leave as is). Used
/// by the agent, whose writes are small edits of a shared object that must
/// not be rebuilt from a stale or failed read.
pub fn update_key_in(
    dir: &Path,
    key: &str,
    change: &mut dyn FnMut(Option<&Value>) -> Option<Value>,
) -> Result<SaveResult, String> {
    modify_store_in(dir, &mut |store| match change(store.get(key)) {
        Some(next) => {
            store.insert(key.to_string(), next);
            Ok(true)
        }
        None => Ok(false),
    })
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

pub fn save_keys_merging(patch: &Store, bases: Option<&Store>) -> Result<SaveResult, String> {
    save_keys_merging_in(&data_dir(), patch, bases)
}

pub fn update_key(
    key: &str,
    change: &mut dyn FnMut(Option<&Value>) -> Option<Value>,
) -> Result<SaveResult, String> {
    update_key_in(&data_dir(), key, change)
}

/// The checking read for callers that must tell "the file says X" from "the
/// read failed": a missing file is `Ok` (empty store), a damaged or
/// unreadable one is `Err`. Unlike `read_store`, never an empty stand-in
/// for a failure.
pub fn read_store_verified_in(dir: &Path) -> Result<Store, String> {
    match read_store_strict_in(dir) {
        Ok(Some(map)) => Ok(map),
        Ok(None) => Ok(Store::new()),
        Err((reason, message)) => Err(format!("{}: {message}", reason.as_str())),
    }
}

pub fn read_store_verified() -> Result<Store, String> {
    read_store_verified_in(&data_dir())
}

pub fn recover_store(name: &str) -> Result<SaveResult, String> {
    recover_store_in(&data_dir(), name)
}

pub fn preview_backup(name: &str) -> Result<BackupPreview, String> {
    preview_backup_in(&data_dir(), name)
}

pub fn start_empty_store() -> Result<SaveResult, String> {
    start_empty_store_in(&data_dir())
}

pub fn create_upgrade_copy(label: &str, legacy: Option<&Value>) -> Result<Vec<String>, String> {
    create_upgrade_copy_in(&data_dir(), label, legacy)
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
    if write_synced(&backup_dir.join(backup_name(now)), body.as_bytes()).is_err() {
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
        pairs
            .iter()
            .map(|(k, v)| ((*k).to_string(), v.clone()))
            .collect()
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
        let result =
            save_keys_in(&dir, &patch_of(&[("seder", Value::from(vec![1, 2, 3]))])).unwrap();
        assert!(result.ok);
        assert!(result.updated_at > 0);

        let store = read_store_in(&dir);
        assert_eq!(store.get("seder").unwrap(), &Value::from(vec![1, 2, 3]));
        assert_eq!(
            store.get("updatedAt").unwrap(),
            &Value::from(result.updated_at)
        );
    }

    #[test]
    fn patching_one_key_leaves_the_others_alone() {
        let dir = scratch_dir();
        save_keys_in(
            &dir,
            &patch_of(&[("seder", Value::from("a")), ("learning", Value::from("b"))]),
        )
        .unwrap();
        save_keys_in(&dir, &patch_of(&[("seder", Value::from("changed"))])).unwrap();

        let store = read_store_in(&dir);
        assert_eq!(store.get("seder").unwrap(), &Value::from("changed"));
        assert_eq!(store.get("learning").unwrap(), &Value::from("b"));
    }

    #[test]
    fn several_keys_land_in_a_single_write() {
        let dir = scratch_dir();
        save_keys_in(
            &dir,
            &patch_of(&[("seder", Value::from("s")), ("learning", Value::from("l"))]),
        )
        .unwrap();

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
        let result = save_keys_in(&dir, &patch_of(&[("updatedAt", Value::from(1u64))])).unwrap();
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
    fn a_store_with_a_utf8_byte_order_mark_is_read_not_called_corrupt() {
        let dir = scratch_dir();
        fs::create_dir_all(&dir).unwrap();
        let mut bytes = vec![0xEF, 0xBB, 0xBF];
        bytes.extend_from_slice(br#"{"seder":[{"id":"a"}]}"#);
        fs::write(dir.join(STORE_FILE_NAME), &bytes).unwrap();
        assert_eq!(read_store_in(&dir).get("seder").unwrap().as_array().unwrap().len(), 1);
        match read_store_checked_in(&dir) {
            StoreLoad::Loaded { store, .. } => assert!(store.contains_key("seder")),
            _ => panic!("a BOM-prefixed store must load as ok"),
        }
        // And a save works on top of it, keeping the data.
        save_keys_in(&dir, &patch_of(&[("timer", Value::Null)])).unwrap();
        assert!(read_store_in(&dir).contains_key("seder"));
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
                    save_keys_in(
                        &dir,
                        &patch_of(&[("seder", Value::from(format!("writer-{i}")))]),
                    )
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
        save_keys_in(
            &dir,
            &patch_of(&[("seder", Value::from(0)), ("learning", Value::from(0))]),
        )
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
        assert!(
            stamp.bytes().all(|b| b.is_ascii_digit()),
            "stamp was {stamp}"
        );
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
        let live: Value =
            serde_json::from_str(&fs::read_to_string(dir.join(STORE_FILE_NAME)).unwrap()).unwrap();
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

        assert_eq!(
            fs::read_to_string(backup_dir.join("notes.txt")).unwrap(),
            "keep me"
        );
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
        assert!(
            failure.is_none(),
            "the save should have gone through: {failure:?}"
        );
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

    // ================= damaged-file protection =================

    fn names_in(dir: &Path, prefix: &str) -> Vec<String> {
        let mut v: Vec<String> = fs::read_dir(dir)
            .map(|rd| {
                rd.flatten()
                    .map(|e| e.file_name().to_string_lossy().to_string())
                    .collect()
            })
            .unwrap_or_default();
        v.retain(|n| n.starts_with(prefix));
        v
    }

    fn corrupt_of(load: StoreLoad) -> (CorruptReason, Option<String>, Vec<BackupInfo>) {
        match load {
            StoreLoad::Corrupt {
                reason,
                preserved_as,
                backups,
                ..
            } => (reason, preserved_as, backups),
            other => panic!("expected corrupt, got {other:?}"),
        }
    }

    #[test]
    fn checked_missing_is_a_fresh_install() {
        let dir = scratch_dir();
        assert!(matches!(
            read_store_checked_in(&dir),
            StoreLoad::Missing { .. }
        ));
        // A fresh install only records the version.
        assert!(dir.join(BACKUP_DIR_NAME).join(LAST_VERSION_FILE).exists());
        assert!(names_in(&dir.join(BACKUP_DIR_NAME), "sedorim-upgrade.").is_empty());
    }

    #[test]
    fn checked_valid_file_loads() {
        let dir = scratch_dir();
        save_keys_in(&dir, &patch_of(&[("seder", json!([1]))])).unwrap();
        match read_store_checked_in(&dir) {
            StoreLoad::Loaded { store, .. } => assert_eq!(store.get("seder").unwrap(), &json!([1])),
            other => panic!("{other:?}"),
        }
    }

    #[test]
    fn checked_damaged_files_are_preserved_byte_for_byte() {
        let cases: [(&[u8], CorruptReason); 5] = [
            (b"", CorruptReason::Unparseable),
            (b"{\"seder\":[1,2,", CorruptReason::Unparseable),
            (b"[1,2,3]", CorruptReason::NotAnObject),
            (b"\"x\"", CorruptReason::NotAnObject),
            (&[0xff, 0xfe, 0x00, 0x7b], CorruptReason::Unparseable),
        ];
        for (bytes, expected) in cases {
            let dir = scratch_dir();
            fs::write(dir.join(STORE_FILE_NAME), bytes).unwrap();
            let (reason, preserved, _) = corrupt_of(read_store_checked_in(&dir));
            assert_eq!(reason, expected);
            let name = preserved.expect("preserved");
            assert!(name.starts_with("sedorim-data.corrupt.") && name.ends_with(".json"));
            assert_eq!(fs::read(dir.join(&name)).unwrap(), bytes);
            assert_eq!(
                fs::read(dir.join(STORE_FILE_NAME)).unwrap(),
                bytes,
                "original untouched"
            );
            // Loading again does not create a duplicate copy.
            let (_, again, _) = corrupt_of(read_store_checked_in(&dir));
            assert_eq!(again.as_deref(), Some(name.as_str()));
            assert_eq!(names_in(&dir, "sedorim-data.corrupt.").len(), 1);
        }
    }

    #[test]
    fn checked_unreadable_is_corrupt_not_missing() {
        // A directory where the file should be cannot be read as a file.
        let dir = scratch_dir();
        fs::create_dir_all(dir.join(STORE_FILE_NAME)).unwrap();
        let (reason, preserved, _) = corrupt_of(read_store_checked_in(&dir));
        assert_eq!(reason, CorruptReason::Unreadable);
        assert!(preserved.is_none());
        let err = save_keys_in(&dir, &patch_of(&[("seder", json!(1))])).unwrap_err();
        assert!(err.starts_with("STORE_CORRUPT:"), "{err}");
    }

    #[test]
    fn save_refuses_on_a_damaged_file_and_leaves_it_alone() {
        for bytes in [&b""[..], b"{bad", b"[1]", b"null"] {
            let dir = scratch_dir();
            fs::write(dir.join(STORE_FILE_NAME), bytes).unwrap();
            let err = save_keys_in(&dir, &patch_of(&[("seder", json!([1]))])).unwrap_err();
            assert!(err.starts_with("STORE_CORRUPT:"), "{err}");
            assert_eq!(fs::read(dir.join(STORE_FILE_NAME)).unwrap(), bytes);
            assert!(
                names_in(&dir, ".sedorim-data.json").is_empty(),
                "no temp left"
            );
        }
    }

    #[test]
    fn checked_lists_backups_newest_first_with_counts() {
        let dir = scratch_dir();
        let bd = dir.join(BACKUP_DIR_NAME);
        fs::create_dir_all(&bd).unwrap();
        fs::write(
            bd.join(backup_name(100)),
            r#"{"seder":[1,2],"learning":[1]}"#,
        )
        .unwrap();
        fs::write(bd.join(backup_name(300)), r#"{"attendance":[1,2,3]}"#).unwrap();
        fs::write(bd.join(backup_name(200)), "{broken").unwrap();
        fs::write(bd.join("notes.txt"), "x").unwrap();
        fs::write(dir.join(STORE_FILE_NAME), "{broken").unwrap();
        let (_, _, backups) = corrupt_of(read_store_checked_in(&dir));
        let ts: Vec<u64> = backups.iter().map(|b| b.ts).collect();
        assert_eq!(ts, vec![300, 200, 100]);
        assert_eq!(
            (
                backups[0].valid,
                backups[0].counts.seder,
                backups[0].counts.learning
            ),
            (true, 3, 0)
        );
        assert!(!backups[1].valid);
        assert_eq!(
            (backups[2].counts.seder, backups[2].counts.learning),
            (2, 1)
        );
        assert_eq!(
            backups[2].size,
            r#"{"seder":[1,2],"learning":[1]}"#.len() as u64
        );
    }

    #[test]
    fn checked_json_has_the_agreed_shape() {
        let dir = scratch_dir();
        let v = serde_json::to_value(read_store_checked_in(&dir)).unwrap();
        assert_eq!(v["status"], "missing");
        assert!(v["meta"]["upgradedFrom"].is_null() && v["meta"]["upgradeCopy"].is_null());
        fs::write(dir.join(STORE_FILE_NAME), "[]").unwrap();
        let v = serde_json::to_value(read_store_checked_in(&dir)).unwrap();
        assert_eq!(v["status"], "corrupt");
        assert_eq!(v["reason"], "not-an-object");
        assert!(
            v["preservedAs"].is_string() && v["backups"].is_array() && v["message"].is_string()
        );
    }

    #[test]
    fn recover_store_restores_a_valid_backup_and_keeps_the_damaged_file() {
        let dir = scratch_dir();
        let bd = dir.join(BACKUP_DIR_NAME);
        fs::create_dir_all(&bd).unwrap();
        fs::write(bd.join(backup_name(5)), r#"{"seder":[9],"weird":{"a":1}}"#).unwrap();
        fs::write(dir.join(STORE_FILE_NAME), b"{trunc").unwrap();
        let r = recover_store_in(&dir, &backup_name(5)).unwrap();
        assert!(r.ok);
        let s = read_store_in(&dir);
        assert_eq!(s.get("seder").unwrap(), &json!([9]));
        assert_eq!(s.get("weird").unwrap(), &json!({"a":1}));
        assert_eq!(s.get("updatedAt").unwrap(), &Value::from(r.updated_at));
        let kept = names_in(&dir, "sedorim-data.corrupt.");
        assert_eq!(kept.len(), 1);
        assert_eq!(fs::read(dir.join(&kept[0])).unwrap(), b"{trunc");
        // Saving works again.
        save_keys_in(&dir, &patch_of(&[("learning", json!([]))])).unwrap();
    }

    #[test]
    fn recover_store_rejects_bad_names_and_invalid_backups() {
        let dir = scratch_dir();
        let bd = dir.join(BACKUP_DIR_NAME);
        fs::create_dir_all(&bd).unwrap();
        fs::write(dir.join("evil.json"), r#"{"x":1}"#).unwrap();
        fs::write(dir.join(STORE_FILE_NAME), b"{trunc").unwrap();
        for name in [
            "../evil.json",
            "..\\sedorim-data.1.json",
            "sedorim-data.json",
            "sedorim-data.1/../../x.json",
            "",
            "sedorim-data.1.json",
        ] {
            assert!(recover_store_in(&dir, name).is_err(), "{name}");
        }
        fs::write(bd.join(backup_name(7)), "[1]").unwrap();
        assert!(recover_store_in(&dir, &backup_name(7)).is_err());
        assert_eq!(fs::read(dir.join(STORE_FILE_NAME)).unwrap(), b"{trunc");
        assert!(names_in(&dir, "sedorim-data.corrupt.").is_empty());
    }

    #[test]
    fn start_empty_store_preserves_the_damaged_file_then_starts_fresh() {
        let dir = scratch_dir();
        fs::write(dir.join(STORE_FILE_NAME), b"garbage").unwrap();
        let r = start_empty_store_in(&dir).unwrap();
        let s = read_store_in(&dir);
        assert_eq!(s.len(), 1);
        assert_eq!(s.get("updatedAt").unwrap(), &Value::from(r.updated_at));
        let kept = names_in(&dir, "sedorim-data.corrupt.");
        assert_eq!(fs::read(dir.join(&kept[0])).unwrap(), b"garbage");
        assert!(matches!(
            read_store_checked_in(&dir),
            StoreLoad::Loaded { .. }
        ));
    }

    #[test]
    fn a_missing_file_with_backups_is_not_a_fresh_install() {
        let dir = scratch_dir();
        assert!(matches!(
            read_store_checked_with_meta(&dir, Meta::default()),
            StoreLoad::Missing { .. }
        ));
        let bd = dir.join(BACKUP_DIR_NAME);
        fs::create_dir_all(&bd).unwrap();
        fs::write(bd.join(backup_name(now_ms())), r#"{"seder":[]}"#).unwrap();
        match read_store_checked_with_meta(&dir, Meta::default()) {
            StoreLoad::Corrupt { reason, backups, .. } => {
                assert_eq!(reason, CorruptReason::Missing);
                assert_eq!(backups.len(), 1);
            }
            other => panic!("expected the recovery offer, got {other:?}"),
        }
    }

    #[test]
    fn start_empty_refuses_when_the_current_file_cannot_be_copied() {
        let dir = scratch_dir();
        // A directory where the file should be: exists, cannot be read as a file.
        fs::create_dir_all(dir.join(STORE_FILE_NAME)).unwrap();
        assert!(start_empty_store_in(&dir).is_err());
        assert!(dir.join(STORE_FILE_NAME).is_dir());
    }

    #[test]
    fn upgrade_copy_is_raw_includes_unknown_keys_and_is_never_pruned() {
        let dir = scratch_dir();
        let raw = r#"{ "seder": [1], "futureKey": {"z": [1,2]} }"#;
        fs::write(dir.join(STORE_FILE_NAME), raw).unwrap();
        let files = create_upgrade_copy_in(&dir, "v1/..\\x", Some(&json!({"ls": 1}))).unwrap();
        assert_eq!(files.len(), 2);
        let bd = dir.join(BACKUP_DIR_NAME);
        assert_eq!(fs::read_to_string(bd.join(&files[0])).unwrap(), raw);
        assert!(files[1].ends_with(".legacy-localstorage.json"));
        assert!(files
            .iter()
            .all(|f| f.starts_with("sedorim-upgrade.") && !f.contains('/') && !f.contains('\\')));
        assert!(files.iter().all(|f| backup_ts_from_name(f).is_none()));

        // Fill the rotation and force pruning: upgrade files must survive.
        let base = now_ms() - BACKUP_MIN_INTERVAL_MS * 2;
        for i in 0..(MAX_BACKUPS as u128 + 5) {
            fs::write(bd.join(backup_name(base + i)), "{}").unwrap();
        }
        save_keys_in(&dir, &patch_of(&[("seder", json!(2))])).unwrap();
        for f in &files {
            assert!(bd.join(f).exists(), "{f} was pruned");
        }
    }

    #[test]
    fn upgrade_copy_without_a_data_file_is_an_empty_object_with_a_note() {
        let dir = scratch_dir();
        let files = create_upgrade_copy_in(&dir, "x", None).unwrap();
        assert_eq!(files.len(), 1);
        assert!(files[0].contains("no-data-file"));
        assert_eq!(
            fs::read_to_string(dir.join(BACKUP_DIR_NAME).join(&files[0])).unwrap(),
            "{}"
        );
    }

    #[test]
    fn automatic_upgrade_copy_happens_once_per_version() {
        let dir = scratch_dir();
        let raw = r#"{"seder":[1],"extra":true}"#;
        fs::write(dir.join(STORE_FILE_NAME), raw).unwrap();
        let bd = dir.join(BACKUP_DIR_NAME);

        let m1 = ensure_upgrade_copy_in(&dir, "1.0.0");
        assert_eq!(m1.upgraded_from.as_deref(), Some("unknown"));
        let copy = m1.upgrade_copy.clone().unwrap();
        assert!(copy.starts_with("sedorim-upgrade.unknown-to-1.0.0."));
        assert_eq!(fs::read_to_string(bd.join(&copy)).unwrap(), raw);
        assert_eq!(
            fs::read_to_string(bd.join(LAST_VERSION_FILE)).unwrap(),
            "1.0.0"
        );

        assert_eq!(ensure_upgrade_copy_in(&dir, "1.0.0"), Meta::default());
        assert_eq!(names_in(&bd, "sedorim-upgrade.").len(), 1);

        let m2 = ensure_upgrade_copy_in(&dir, "1.1.0");
        assert_eq!(m2.upgraded_from.as_deref(), Some("1.0.0"));
        assert!(m2.upgrade_copy.unwrap().contains("1.0.0-to-1.1.0"));
        assert_eq!(names_in(&bd, "sedorim-upgrade.").len(), 2);
    }

    #[test]
    fn a_failed_upgrade_copy_does_not_advance_the_version_marker() {
        let dir = scratch_dir();
        fs::write(dir.join(STORE_FILE_NAME), "{}").unwrap();
        // A file named "backups" makes the copy impossible.
        fs::write(dir.join(BACKUP_DIR_NAME), "in the way").unwrap();
        assert_eq!(ensure_upgrade_copy_in(&dir, "9.9.9"), Meta::default());
        assert!(matches!(
            read_store_checked_with_meta(&dir, Meta::default()),
            StoreLoad::Loaded { .. }
        ));
    }

    // ================= record-level merge =================

    fn rec(id: &str, note: &str) -> Value {
        json!({"id": id, "note": note})
    }

    fn ids_of(store: &Store, key: &str) -> Vec<String> {
        store
            .get(key)
            .and_then(Value::as_array)
            .unwrap()
            .iter()
            .map(|r| r["id"].as_str().unwrap().to_string())
            .collect()
    }

    fn save_with_base(
        dir: &Path,
        key: &str,
        base: &Value,
        new: Value,
    ) -> Result<SaveResult, String> {
        let bases = patch_of(&[(key, base.clone())]);
        save_keys_merging_in(dir, &patch_of(&[(key, new)]), Some(&bases))
    }

    #[test]
    fn an_add_and_an_edit_from_two_stale_windows_both_survive() {
        let dir = scratch_dir();
        let base = json!([rec("a", "1"), rec("b", "1")]);
        save_keys_in(&dir, &patch_of(&[("seder", base.clone())])).unwrap();

        // Window 1 edits "a"; window 2, which loaded the same base, adds "c".
        save_with_base(&dir, "seder", &base, json!([rec("a", "edited"), rec("b", "1")])).unwrap();
        let r = save_with_base(
            &dir,
            "seder",
            &base,
            json!([rec("a", "1"), rec("b", "1"), rec("c", "new")]),
        )
        .unwrap();

        let store = read_store_in(&dir);
        let list = store["seder"].as_array().unwrap();
        assert_eq!(list.len(), 3);
        assert!(list.contains(&rec("a", "edited")), "the other window's edit survived");
        assert!(list.contains(&rec("c", "new")));
        // The second writer is told what the file really holds now.
        assert_eq!(r.merged.unwrap()["seder"], store["seder"]);
    }

    #[test]
    fn a_delete_in_one_window_and_an_add_in_the_other_both_apply() {
        let dir = scratch_dir();
        let base = json!([rec("a", "1"), rec("b", "1")]);
        save_keys_in(&dir, &patch_of(&[("learning", base.clone())])).unwrap();

        save_with_base(&dir, "learning", &base, json!([rec("b", "1")])).unwrap();
        save_with_base(
            &dir,
            "learning",
            &base,
            json!([rec("a", "1"), rec("b", "1"), rec("n", "x")]),
        )
        .unwrap();

        let store = read_store_in(&dir);
        let mut ids = ids_of(&store, "learning");
        ids.sort();
        // "a" stays deleted: the second window never touched it.
        assert_eq!(ids, vec!["b", "n"]);
    }

    #[test]
    fn two_windows_editing_the_same_record_is_a_conflict_the_file_version_stays() {
        let dir = scratch_dir();
        let base = json!([rec("a", "0"), rec("b", "0")]);
        save_keys_in(&dir, &patch_of(&[("seder", base.clone())])).unwrap();

        let first =
            save_with_base(&dir, "seder", &base, json!([rec("a", "first"), rec("b", "theirs")])).unwrap();
        assert!(first.conflicts.is_empty());
        let second =
            save_with_base(&dir, "seder", &base, json!([rec("a", "second"), rec("b", "0")])).unwrap();

        let store = read_store_in(&dir);
        let list = store["seder"].as_array().unwrap();
        assert!(list.contains(&rec("a", "first")), "the file's version of the contested record stays");
        assert!(!list.contains(&rec("a", "second")), "nothing is overwritten");
        assert!(list.contains(&rec("b", "theirs")), "other record untouched by the later write");
        assert_eq!(
            second.conflicts,
            vec![RecordConflict {
                key: "seder".into(),
                id: json!("a"),
                kind: CONFLICT_EDIT_EDIT,
                mine: Some(rec("a", "second")),
                theirs: Some(rec("a", "first")),
            }]
        );
        // The caller is told what the file really holds so it can adopt it.
        assert_eq!(second.merged.unwrap()["seder"], store["seder"]);
    }

    #[test]
    fn the_same_edit_made_in_both_windows_is_not_a_conflict() {
        let dir = scratch_dir();
        let base = json!([rec("a", "0")]);
        save_keys_in(&dir, &patch_of(&[("seder", base.clone())])).unwrap();
        save_with_base(&dir, "seder", &base, json!([rec("a", "same")])).unwrap();
        let r = save_with_base(&dir, "seder", &base, json!([rec("a", "same")])).unwrap();
        assert!(r.conflicts.is_empty());
        assert_eq!(read_store_in(&dir)["seder"], json!([rec("a", "same")]));
    }

    #[test]
    fn editing_a_record_the_other_window_deleted_is_a_conflict_and_stays_deleted() {
        let dir = scratch_dir();
        let base = json!([rec("a", "0"), rec("b", "0")]);
        save_keys_in(&dir, &patch_of(&[("seder", base.clone())])).unwrap();
        save_with_base(&dir, "seder", &base, json!([rec("b", "0")])).unwrap();
        let r = save_with_base(
            &dir,
            "seder",
            &base,
            json!([rec("a", "edit"), rec("b", "0"), rec("c", "new")]),
        )
        .unwrap();
        let store = read_store_in(&dir);
        assert_eq!(ids_of(&store, "seder"), vec!["b", "c"], "the deletion stands, the add is applied");
        assert_eq!(r.conflicts.len(), 1);
        let c = &r.conflicts[0];
        assert_eq!((c.id.clone(), c.kind), (json!("a"), CONFLICT_EDIT_DELETED));
        assert_eq!(c.mine, Some(rec("a", "edit")));
        assert_eq!(c.theirs, None);
    }

    #[test]
    fn deleting_a_record_the_other_window_edited_is_a_conflict_and_the_edit_stays() {
        let dir = scratch_dir();
        let base = json!([rec("a", "0"), rec("b", "0")]);
        save_keys_in(&dir, &patch_of(&[("learning", base.clone())])).unwrap();
        save_with_base(&dir, "learning", &base, json!([rec("a", "edited"), rec("b", "0")])).unwrap();
        let r = save_with_base(&dir, "learning", &base, json!([rec("b", "changed")])).unwrap();
        let store = read_store_in(&dir);
        let list = store["learning"].as_array().unwrap();
        assert!(list.contains(&rec("a", "edited")), "the other window's edit survives my delete");
        assert!(list.contains(&rec("b", "changed")), "the unrelated change still applies");
        assert_eq!(r.conflicts.len(), 1);
        let c = &r.conflicts[0];
        assert_eq!((c.id.clone(), c.kind), (json!("a"), CONFLICT_DELETED_EDITED));
        assert_eq!(c.mine, None);
        assert_eq!(c.theirs, Some(rec("a", "edited")));
    }

    #[test]
    fn deleting_a_record_the_other_window_did_not_touch_is_not_a_conflict() {
        let dir = scratch_dir();
        let base = json!([rec("a", "0"), rec("b", "0")]);
        save_keys_in(&dir, &patch_of(&[("seder", base.clone())])).unwrap();
        save_with_base(&dir, "seder", &base, json!([rec("a", "0"), rec("b", "x")])).unwrap();
        let r = save_with_base(&dir, "seder", &base, json!([rec("b", "0")])).unwrap();
        assert!(r.conflicts.is_empty());
        assert_eq!(read_store_in(&dir)["seder"], json!([rec("b", "x")]));
    }

    #[test]
    fn conflicts_do_not_block_changes_to_other_records_or_keys() {
        let dir = scratch_dir();
        let base = json!([rec("a", "0"), rec("b", "0")]);
        save_keys_in(
            &dir,
            &patch_of(&[("seder", base.clone()), ("learning", base.clone())]),
        )
        .unwrap();
        save_with_base(&dir, "seder", &base, json!([rec("a", "theirs"), rec("b", "0")])).unwrap();
        let bases = patch_of(&[("seder", base.clone()), ("learning", base.clone())]);
        let r = save_keys_merging_in(
            &dir,
            &patch_of(&[
                ("seder", json!([rec("a", "mine"), rec("b", "mine-b")])),
                ("learning", json!([rec("a", "0"), rec("b", "0"), rec("n", "n")])),
                ("settings", json!({"x": 1})),
            ]),
            Some(&bases),
        )
        .unwrap();
        assert_eq!(r.conflicts.len(), 1);
        assert_eq!(r.conflicts[0].key, "seder");
        let store = read_store_in(&dir);
        assert_eq!(store["seder"], json!([rec("a", "theirs"), rec("b", "mine-b")]));
        assert_eq!(ids_of(&store, "learning"), vec!["a", "b", "n"]);
        assert_eq!(store["settings"], json!({"x": 1}));
    }

    #[test]
    fn an_explicit_replace_with_a_refreshed_base_overwrites_without_a_conflict() {
        let dir = scratch_dir();
        let base = json!([rec("a", "0")]);
        save_keys_in(&dir, &patch_of(&[("seder", base.clone())])).unwrap();
        save_with_base(&dir, "seder", &base, json!([rec("a", "first")])).unwrap();
        let lost = save_with_base(&dir, "seder", &base, json!([rec("a", "second")])).unwrap();
        assert_eq!(lost.conflicts.len(), 1);
        // "Replace": base = what the file holds now, new = my version on top.
        let file_now = read_store_in(&dir)["seder"].clone();
        let r = save_with_base(&dir, "seder", &file_now, json!([rec("a", "second")])).unwrap();
        assert!(r.conflicts.is_empty());
        assert_eq!(read_store_in(&dir)["seder"], json!([rec("a", "second")]));
    }

    #[test]
    fn a_conflict_serializes_with_the_agreed_shape_and_is_omitted_when_empty() {
        let dir = scratch_dir();
        let base = json!([rec("a", "0")]);
        save_keys_in(&dir, &patch_of(&[("seder", base.clone())])).unwrap();
        let clean = save_with_base(&dir, "seder", &base, json!([rec("a", "x")])).unwrap();
        assert!(serde_json::to_value(&clean).unwrap().get("conflicts").is_none());
        let r = save_with_base(&dir, "seder", &base, json!([rec("a", "y")])).unwrap();
        let v = serde_json::to_value(&r).unwrap();
        assert_eq!(
            v["conflicts"],
            json!([{"key": "seder", "id": "a", "kind": "edit-edit",
                    "mine": rec("a", "y"), "theirs": rec("a", "x")}])
        );
    }

    #[test]
    fn the_same_id_added_in_both_windows_with_other_content_is_an_add_add_conflict() {
        let dir = scratch_dir();
        let base = json!([]);
        save_keys_in(&dir, &patch_of(&[("seder", base.clone())])).unwrap();
        save_with_base(&dir, "seder", &base, json!([rec("x", "one")])).unwrap();
        let r = save_with_base(&dir, "seder", &base, json!([rec("x", "two"), rec("y", "y")])).unwrap();
        let store = read_store_in(&dir);
        assert_eq!(ids_of(&store, "seder"), vec!["x", "y"], "other changes still apply");
        assert!(store["seder"].as_array().unwrap().contains(&rec("x", "one")), "file version kept");
        assert_eq!(
            r.conflicts,
            vec![RecordConflict {
                key: "seder".into(),
                id: json!("x"),
                kind: CONFLICT_ADD_ADD,
                mine: Some(rec("x", "two")),
                theirs: Some(rec("x", "one")),
            }]
        );
        // "Replace": base = what the file holds, my version on top: no conflict.
        let file_now = read_store_in(&dir)["seder"].clone();
        let mut mine = file_now.as_array().unwrap().clone();
        mine[0] = rec("x", "two");
        let r2 = save_with_base(&dir, "seder", &file_now, Value::Array(mine)).unwrap();
        assert!(r2.conflicts.is_empty());
        assert!(read_store_in(&dir)["seder"].as_array().unwrap().contains(&rec("x", "two")));
    }

    #[test]
    fn adding_the_identical_record_again_is_idempotent_not_a_conflict() {
        let dir = scratch_dir();
        let base = json!([]);
        save_keys_in(&dir, &patch_of(&[("seder", base.clone())])).unwrap();
        save_with_base(&dir, "seder", &base, json!([rec("x", "one")])).unwrap();
        let r = save_with_base(&dir, "seder", &base, json!([rec("x", "one")])).unwrap();
        assert!(r.conflicts.is_empty());
        assert_eq!(read_store_in(&dir)["seder"], json!([rec("x", "one")]));
    }

    #[test]
    fn without_a_base_a_save_replaces_the_array_as_before() {
        let dir = scratch_dir();
        save_keys_in(&dir, &patch_of(&[("seder", json!([rec("a", "1"), rec("z", "1")]))])).unwrap();
        let r = save_keys_in(&dir, &patch_of(&[("seder", json!([rec("a", "1")]))])).unwrap();
        assert!(r.merged.is_none());
        assert_eq!(read_store_in(&dir)["seder"], json!([rec("a", "1")]));
    }

    #[test]
    fn keys_that_are_not_id_record_arrays_are_replaced_even_with_a_base() {
        let dir = scratch_dir();
        // An object (settings), an array without ids, and an array with a duplicate id.
        for (old, new) in [
            (json!({"a": 1, "b": 2}), json!({"a": 5})),
            (json!([1, 2, 3]), json!([4])),
            (json!([rec("d", "1"), rec("d", "2")]), json!([rec("d", "3")])),
        ] {
            save_keys_in(&dir, &patch_of(&[("k", old.clone())])).unwrap();
            let r = save_with_base(&dir, "k", &old, new.clone()).unwrap();
            assert!(r.merged.is_none());
            assert_eq!(read_store_in(&dir)["k"], new);
        }
    }

    #[test]
    fn a_base_for_a_key_the_file_does_not_have_just_writes_the_value() {
        let dir = scratch_dir();
        let r = save_with_base(&dir, "seder", &json!([rec("a", "1")]), json!([rec("a", "1")])).unwrap();
        assert!(r.merged.is_none());
        assert_eq!(read_store_in(&dir)["seder"], json!([rec("a", "1")]));
    }

    #[test]
    fn a_merging_save_keeps_unknown_keys_and_the_other_arrays() {
        let dir = scratch_dir();
        let base = json!([rec("a", "1")]);
        fs::write(
            dir.join(STORE_FILE_NAME),
            r#"{"seder":[{"id":"a","note":"1"}],"learning":[{"id":"l","note":"x"}],"future":{"z":[1]}}"#,
        )
        .unwrap();
        save_with_base(&dir, "seder", &base, json!([rec("a", "1"), rec("b", "2")])).unwrap();
        let store = read_store_in(&dir);
        assert_eq!(store["future"], json!({"z": [1]}));
        assert_eq!(store["learning"], json!([rec("l", "x")]));
        assert_eq!(ids_of(&store, "seder"), vec!["a", "b"]);
    }

    #[test]
    fn a_record_added_elsewhere_keeps_its_place_next_to_its_neighbour() {
        let dir = scratch_dir();
        let base = json!([rec("a", "1"), rec("b", "1")]);
        save_keys_in(&dir, &patch_of(&[("seder", base.clone())])).unwrap();
        // The other window put "n" between a and b.
        save_keys_in(
            &dir,
            &patch_of(&[("seder", json!([rec("a", "1"), rec("n", "1"), rec("b", "1")]))]),
        )
        .unwrap();
        save_with_base(&dir, "seder", &base, json!([rec("a", "1"), rec("b", "changed")])).unwrap();
        assert_eq!(ids_of(&read_store_in(&dir), "seder"), vec!["a", "n", "b"]);
    }

    #[test]
    fn many_threads_adding_records_with_stale_bases_lose_nothing() {
        let dir = scratch_dir();
        let base = json!([]);
        save_keys_in(&dir, &patch_of(&[("seder", base.clone())])).unwrap();
        std::thread::scope(|scope| {
            for i in 0..8 {
                let dir = dir.clone();
                let base = base.clone();
                scope.spawn(move || {
                    save_with_base(&dir, "seder", &base, json!([rec(&format!("w{i}"), "x")])).unwrap();
                });
            }
        });
        assert_eq!(ids_of(&read_store_in(&dir), "seder").len(), 8);
    }

    // ================= cross-process lock =================

    #[test]
    fn the_lock_file_is_gone_after_a_save() {
        let dir = scratch_dir();
        save_keys_in(&dir, &patch_of(&[("seder", json!(1))])).unwrap();
        assert!(!dir.join(LOCK_FILE_NAME).exists());
    }

    #[test]
    fn a_held_lock_blocks_until_it_is_released() {
        let dir = scratch_dir();
        let held = acquire_dir_lock_with(&dir, LOCK_STALE_MS, LOCK_WAIT_MS).unwrap();
        // Another "process" cannot take it...
        assert!(acquire_dir_lock_with(&dir, LOCK_STALE_MS, 80).is_err());
        // ...and a real save waits for it rather than racing.
        std::thread::scope(|scope| {
            let d = dir.clone();
            let saver = scope.spawn(move || {
                save_keys_in(&d, &patch_of(&[("seder", json!(7))])).unwrap();
            });
            std::thread::sleep(std::time::Duration::from_millis(150));
            assert!(!dir.join(STORE_FILE_NAME).exists(), "must not write while locked");
            drop(held);
            saver.join().unwrap();
        });
        assert_eq!(read_store_in(&dir)["seder"], json!(7));
    }

    /// A real child process that does nothing for a minute. Always killed by
    /// its own `Child` handle (i.e. by the pid this test created), never by name.
    fn spawn_sleeper() -> std::process::Child {
        use std::process::{Command, Stdio};
        #[cfg(windows)]
        let mut cmd = {
            let mut c = Command::new("ping");
            c.args(["-n", "60", "127.0.0.1"]);
            c
        };
        #[cfg(not(windows))]
        let mut cmd = {
            let mut c = Command::new("sleep");
            c.arg("60");
            c
        };
        cmd.stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .expect("start a child process")
    }

    /// The pid of a process that has already ended.
    fn dead_pid() -> u32 {
        let mut child = spawn_sleeper();
        let pid = child.id();
        child.kill().unwrap();
        child.wait().unwrap();
        pid
    }

    fn write_lock(dir: &Path, pid: u32) {
        fs::write(dir.join(LOCK_FILE_NAME), format!("{pid} 0 test-nonce")).unwrap();
    }

    /// Makes the lock file look untouched for `ms`.
    fn backdate_lock(dir: &Path, ms: u64) {
        let f = fs::OpenOptions::new()
            .write(true)
            .open(dir.join(LOCK_FILE_NAME))
            .unwrap();
        f.set_modified(SystemTime::now() - std::time::Duration::from_millis(ms))
            .unwrap();
    }

    #[test]
    fn process_alive_tells_a_running_process_from_an_ended_one() {
        assert_eq!(process_alive(std::process::id()), Some(true));
        assert_eq!(process_alive(dead_pid()), Some(false));
    }

    #[test]
    fn the_lock_records_the_pid_and_a_nonce() {
        let dir = scratch_dir();
        let lock = acquire_dir_lock_with(&dir, LOCK_STALE_MS, LOCK_WAIT_MS).unwrap();
        let text = fs::read_to_string(dir.join(LOCK_FILE_NAME)).unwrap();
        let (pid, nonce) = parse_lock(&text);
        assert_eq!(pid, Some(std::process::id()));
        assert_eq!(nonce.as_deref(), Some(lock.nonce.as_str()));
    }

    #[test]
    fn a_lock_whose_process_does_not_exist_is_stolen_at_once() {
        let dir = scratch_dir();
        write_lock(&dir, dead_pid());
        // A fresh file and a huge threshold: only the dead owner makes it stale.
        let started = std::time::Instant::now();
        let lock = acquire_dir_lock_with(&dir, 3_600_000, 5_000).unwrap();
        assert!(started.elapsed() < std::time::Duration::from_secs(2));
        drop(lock);
        assert!(!dir.join(LOCK_FILE_NAME).exists());
    }

    #[test]
    fn a_lock_of_a_live_process_is_not_stolen_just_for_being_old() {
        let dir = scratch_dir();
        write_lock(&dir, std::process::id());
        // Older than the threshold (100ms) but inside the live-owner cap (1s).
        backdate_lock(&dir, 500);
        assert!(acquire_dir_lock_with(&dir, 100, 150).is_err());
        assert!(dir.join(LOCK_FILE_NAME).exists());
        // With no heartbeat at all for far longer than the cap, even a "live"
        // pid (it may be a recycled one) is taken over.
        backdate_lock(&dir, 3_600_000);
        drop(acquire_dir_lock_with(&dir, 100, 1_000).unwrap());
    }

    #[test]
    fn a_lock_without_a_readable_pid_goes_stale_only_by_heartbeat_age() {
        let dir = scratch_dir();
        fs::write(dir.join(LOCK_FILE_NAME), "garbage").unwrap();
        assert!(acquire_dir_lock_with(&dir, 60_000, 100).is_err(), "fresh: kept");
        backdate_lock(&dir, 120_000);
        drop(acquire_dir_lock_with(&dir, 60_000, 1_000).unwrap());
    }

    #[test]
    fn a_real_process_that_took_the_lock_and_died_is_released() {
        let dir = scratch_dir();
        let mut child = spawn_sleeper();
        write_lock(&dir, child.id());
        // Alive: kept, even past the threshold.
        backdate_lock(&dir, 500);
        assert!(acquire_dir_lock_with(&dir, 100, 150).is_err());
        // Killed (by the pid this test started): the next taker gets it at once.
        child.kill().unwrap();
        child.wait().unwrap();
        let started = std::time::Instant::now();
        let lock = acquire_dir_lock_with(&dir, 3_600_000, 5_000).unwrap();
        assert!(started.elapsed() < std::time::Duration::from_secs(2));
        drop(lock);
        assert!(!dir.join(LOCK_FILE_NAME).exists());
    }

    #[test]
    fn a_slow_holder_keeps_its_lock_because_it_keeps_the_heartbeat_going() {
        let dir = scratch_dir();
        // Threshold 60ms: the holder below stays inside its cycle ~7 times longer.
        let held = acquire_dir_lock_with(&dir, 60, 1_000).unwrap();
        let lock_path = dir.join(LOCK_FILE_NAME);
        // The holder's mtime is made old; the heartbeat must bring it back.
        backdate_lock(&dir, 10_000);
        std::thread::sleep(std::time::Duration::from_millis(400));
        let age = file_age_ms(&lock_path).unwrap();
        assert!(age < 300, "heartbeat should have refreshed the lock, age was {age}ms");
        // Nobody else gets in meanwhile, and the file is still ours.
        assert!(acquire_dir_lock_with(&dir, 60, 100).is_err());
        assert!(lock_owner_is(&lock_path, &held.nonce));
        drop(held);
        assert!(!lock_path.exists());
    }

    #[test]
    fn a_slow_save_is_not_interrupted_by_another_writer() {
        let dir = scratch_dir();
        let held = acquire_dir_lock_with(&dir, 40, 1_000).unwrap();
        let d = dir.clone();
        let taker = std::thread::spawn(move || acquire_dir_lock_with(&d, 40, 3_000).map(drop));
        // Far longer than the 40ms threshold.
        std::thread::sleep(std::time::Duration::from_millis(500));
        assert!(!taker.is_finished(), "the second writer must still be waiting");
        drop(held);
        taker.join().unwrap().unwrap();
    }

    #[test]
    fn two_thieves_at_once_only_one_gets_the_lock() {
        let dir = scratch_dir();
        write_lock(&dir, dead_pid());
        let inside = std::sync::atomic::AtomicUsize::new(0);
        let entered = std::sync::atomic::AtomicUsize::new(0);
        std::thread::scope(|scope| {
            for _ in 0..8 {
                scope.spawn(|| {
                    use std::sync::atomic::Ordering::SeqCst;
                    let lock = acquire_dir_lock_with(&dir, 3_600_000, 10_000).unwrap();
                    assert_eq!(inside.fetch_add(1, SeqCst), 0, "two holders at once");
                    entered.fetch_add(1, SeqCst);
                    std::thread::sleep(std::time::Duration::from_millis(15));
                    inside.fetch_sub(1, SeqCst);
                    drop(lock);
                });
            }
        });
        assert_eq!(entered.load(std::sync::atomic::Ordering::SeqCst), 8);
        assert!(!dir.join(LOCK_FILE_NAME).exists());
        assert!(!dir.join(STEAL_GUARD_NAME).exists());
    }

    #[test]
    fn dropping_a_lock_never_deletes_one_that_replaced_it() {
        let dir = scratch_dir();
        let held = acquire_dir_lock_with(&dir, LOCK_STALE_MS, LOCK_WAIT_MS).unwrap();
        // Someone else took over (say, after a long freeze) and now owns the file.
        fs::write(dir.join(LOCK_FILE_NAME), format!("{} 0 other-owner", std::process::id())).unwrap();
        drop(held);
        assert!(dir.join(LOCK_FILE_NAME).exists());
    }

    #[test]
    fn a_stale_lock_from_a_dead_process_is_taken_over() {
        let dir = scratch_dir();
        // The old two-field format an earlier build wrote, with a pid that is gone.
        fs::write(dir.join(LOCK_FILE_NAME), format!("{} 0", dead_pid())).unwrap();
        let lock = acquire_dir_lock_with(&dir, 10, 1000).unwrap();
        drop(lock);
        assert!(!dir.join(LOCK_FILE_NAME).exists());
    }

    #[test]
    fn a_fresh_lock_is_not_stolen() {
        let dir = scratch_dir();
        write_lock(&dir, std::process::id());
        assert!(acquire_dir_lock_with(&dir, 60_000, 100).is_err());
        assert!(dir.join(LOCK_FILE_NAME).exists());
    }

    #[test]
    fn recover_and_start_empty_respect_the_lock() {
        let dir = scratch_dir();
        fs::create_dir_all(dir.join(BACKUP_DIR_NAME)).unwrap();
        fs::write(dir.join(BACKUP_DIR_NAME).join(backup_name(1)), r#"{"seder":[]}"#).unwrap();
        write_lock(&dir, std::process::id());
        // A live foreign lock: recover must wait; release it from a thread.
        let lock_path = dir.join(LOCK_FILE_NAME);
        std::thread::scope(|scope| {
            scope.spawn(|| {
                std::thread::sleep(std::time::Duration::from_millis(100));
                fs::remove_file(&lock_path).unwrap();
            });
            let r = recover_store_in(&dir, &backup_name(1)).unwrap();
            assert!(r.ok);
        });
        assert!(!dir.join(LOCK_FILE_NAME).exists());
        start_empty_store_in(&dir).unwrap();
        assert!(!dir.join(LOCK_FILE_NAME).exists());
    }

    // ================= preview and verified recovery =================

    fn write_backup(dir: &Path, ts: u128, body: &str) -> String {
        fs::create_dir_all(dir.join(BACKUP_DIR_NAME)).unwrap();
        let name = backup_name(ts);
        fs::write(dir.join(BACKUP_DIR_NAME).join(&name), body).unwrap();
        name
    }

    #[test]
    fn a_preview_summarizes_the_backup_and_the_current_file() {
        let dir = scratch_dir();
        let name = write_backup(
            &dir,
            1_700_000_000_000,
            &json!({
                "seder": [{"id": "1", "date": "2024-03-05"}, {"id": "2", "date": "2024-01-02"}],
                "learning": [{"id": "l", "date": "2024-02-10"}],
                "settings": {"a": 1},
                "onboarded": true,
                "timer": {"startedAt": 1},
                "snapshots": [{"id": "s1"}, {"id": "s2"}],
                "futureThing": 1,
                "alsoNew": [],
                "updatedAt": 5
            })
            .to_string(),
        );
        fs::write(
            dir.join(STORE_FILE_NAME),
            json!({"seder": [{"id": "9", "date": "2025-01-01"}], "timer": null}).to_string(),
        )
        .unwrap();

        let p = preview_backup_in(&dir, &name).unwrap();
        assert_eq!(p.name, name);
        assert_eq!(p.ts, 1_700_000_000_000);
        assert_eq!(p.current_status, "ok");
        let b = &p.backup;
        assert_eq!((b.seder_count, b.learning_count), (2, 1));
        assert_eq!(b.attendance_first.as_deref(), Some("2024-01-02"));
        assert_eq!(b.attendance_last.as_deref(), Some("2024-03-05"));
        assert_eq!(b.learning_first.as_deref(), Some("2024-02-10"));
        assert_eq!(b.learning_last.as_deref(), Some("2024-02-10"));
        assert!(b.has_settings && b.has_onboarded && b.onboarded && b.has_timer && b.has_snapshots);
        assert_eq!(b.snapshots_count, 2);
        assert_eq!(b.unknown_keys, vec!["alsoNew", "futureThing"]);
        assert_eq!(b.updated_at, Some(5));
        let cur = p.current.as_ref().unwrap();
        assert_eq!((cur.seder_count, cur.learning_count), (1, 0));
        assert!(!cur.has_settings && !cur.has_timer && !cur.has_snapshots);
        assert_eq!(cur.attendance_last.as_deref(), Some("2025-01-01"));
        // The camelCase shape the frontend reads.
        let v = serde_json::to_value(&p).unwrap();
        assert_eq!(v["currentStatus"], "ok");
        assert_eq!(v["backup"]["sederCount"], 2);
        assert_eq!(v["backup"]["unknownKeys"], json!(["alsoNew", "futureThing"]));
        // Reading a preview changes nothing.
        assert!(names_in(&dir, "sedorim-data.corrupt.").is_empty());
    }

    #[test]
    fn a_preview_says_when_the_current_file_is_missing_or_unreadable() {
        let dir = scratch_dir();
        let name = write_backup(&dir, 10, r#"{"seder":[]}"#);
        let p = preview_backup_in(&dir, &name).unwrap();
        assert_eq!((p.current_status, p.current.is_none()), ("missing", true));
        fs::write(dir.join(STORE_FILE_NAME), "{broken").unwrap();
        let p = preview_backup_in(&dir, &name).unwrap();
        assert_eq!(p.current_status, "unreadable");
        assert!(p.current_error.is_some());
        assert_eq!(fs::read_to_string(dir.join(STORE_FILE_NAME)).unwrap(), "{broken", "untouched");
    }

    #[test]
    fn a_preview_rejects_unsafe_names_and_unusable_backups() {
        let dir = scratch_dir();
        write_backup(&dir, 3, "not json");
        fs::write(dir.join("secret.json"), "{}").unwrap();
        for name in [
            "../secret.json",
            "..\\secret.json",
            "sedorim-data.json",
            "sedorim-data.abc.json",
            "sedorim-data.1/../../secret.json",
            "",
        ] {
            assert!(preview_backup_in(&dir, name).is_err(), "{name}");
        }
        assert!(preview_backup_in(&dir, &backup_name(3)).is_err(), "unusable backup");
        assert!(preview_backup_in(&dir, &backup_name(99)).is_err(), "missing backup");
    }

    #[test]
    fn recovery_is_verified_by_reading_the_file_back() {
        let dir = scratch_dir();
        let body = json!({"seder": [{"id": "1", "date": "2024-01-01"}], "future": {"k": [1, 2]}});
        let name = write_backup(&dir, 20, &body.to_string());
        fs::write(dir.join(STORE_FILE_NAME), "{broken").unwrap();
        let r = recover_store_in(&dir, &name).unwrap();
        assert!(r.ok);
        // The replaced file was kept, the new one is exactly the backup.
        assert_eq!(names_in(&dir, "sedorim-data.corrupt.").len(), 1);
        let mut on_disk = read_store_verified_in(&dir).unwrap();
        on_disk.remove("updatedAt");
        assert_eq!(Value::Object(on_disk), body);
    }

    #[test]
    fn verification_fails_when_the_file_does_not_match_the_backup() {
        let dir = scratch_dir();
        fs::write(dir.join(STORE_FILE_NAME), r#"{"seder":[1],"updatedAt":9}"#).unwrap();
        let same = patch_of(&[("seder", json!([1])), ("updatedAt", json!(1))]);
        assert!(verify_restored(&dir, &same).is_ok(), "updatedAt is restamped, not compared");
        let other = patch_of(&[("seder", json!([2]))]);
        assert!(verify_restored(&dir, &other).unwrap_err().contains("could not be verified"));
        fs::write(dir.join(STORE_FILE_NAME), "{broken").unwrap();
        assert!(verify_restored(&dir, &same).is_err());
        fs::remove_file(dir.join(STORE_FILE_NAME)).unwrap();
        assert!(verify_restored(&dir, &same).is_err());
    }

    // ================= upgrade copy: once, verified, marker =================

    fn upgrade_copies(dir: &Path) -> usize {
        names_in(&dir.join(BACKUP_DIR_NAME), "sedorim-upgrade.").len()
    }

    #[test]
    fn two_windows_starting_together_make_one_upgrade_copy() {
        let dir = scratch_dir();
        fs::write(dir.join(STORE_FILE_NAME), r#"{"seder":[1]}"#).unwrap();
        let metas: Vec<Meta> = std::thread::scope(|scope| {
            let handles: Vec<_> = (0..4)
                .map(|_| scope.spawn(|| ensure_upgrade_copy_in(&dir, "2.0.0")))
                .collect();
            handles.into_iter().map(|h| h.join().unwrap()).collect()
        });
        assert_eq!(upgrade_copies(&dir), 1);
        assert_eq!(metas.iter().filter(|m| m.upgrade_copy.is_some()).count(), 1);
    }

    #[test]
    fn a_second_process_waits_for_the_first_and_then_finds_the_marker() {
        let dir = scratch_dir();
        fs::write(dir.join(STORE_FILE_NAME), r#"{"seder":[1]}"#).unwrap();
        // Another process is mid-cycle: hold the file lock without the in-process mutex.
        let held = acquire_dir_lock_with(&dir, LOCK_STALE_MS, LOCK_WAIT_MS).unwrap();
        std::thread::scope(|scope| {
            let h = scope.spawn(|| ensure_upgrade_copy_in(&dir, "3.0.0"));
            std::thread::sleep(std::time::Duration::from_millis(100));
            assert_eq!(upgrade_copies(&dir), 0, "nothing is copied while the lock is held");
            // The "other process" finishes its copy and marker, then lets go.
            fs::create_dir_all(dir.join(BACKUP_DIR_NAME)).unwrap();
            fs::write(dir.join(BACKUP_DIR_NAME).join(LAST_VERSION_FILE), "3.0.0").unwrap();
            drop(held);
            assert_eq!(h.join().unwrap(), Meta::default());
        });
        assert_eq!(upgrade_copies(&dir), 0);
    }

    #[test]
    fn the_marker_is_written_atomically_after_the_verified_copy() {
        let dir = scratch_dir();
        let raw = r#"{"seder":[1]}"#;
        fs::write(dir.join(STORE_FILE_NAME), raw).unwrap();
        let meta = ensure_upgrade_copy_in(&dir, "4.0.0");
        let bd = dir.join(BACKUP_DIR_NAME);
        assert_eq!(fs::read_to_string(bd.join(meta.upgrade_copy.unwrap())).unwrap(), raw);
        assert_eq!(fs::read_to_string(bd.join(LAST_VERSION_FILE)).unwrap(), "4.0.0");
        assert!(names_in(&bd, ".last-version.").is_empty(), "no temp marker left");
    }

    #[test]
    fn a_failing_marker_write_does_not_make_a_new_copy_every_launch() {
        let dir = scratch_dir();
        fs::write(dir.join(STORE_FILE_NAME), r#"{"seder":[1]}"#).unwrap();
        // A directory where the marker file should be: it can be neither read nor replaced.
        fs::create_dir_all(dir.join(BACKUP_DIR_NAME).join(LAST_VERSION_FILE)).unwrap();
        let first = ensure_upgrade_copy_in(&dir, "5.0.0");
        assert!(first.upgrade_copy.is_some(), "the copy itself succeeded");
        assert_eq!(ensure_upgrade_copy_in(&dir, "5.0.0"), Meta::default());
        assert_eq!(ensure_upgrade_copy_in(&dir, "5.0.0"), Meta::default());
        assert_eq!(upgrade_copies(&dir), 1);
        // The failure is on record in the problem log.
        let log = crate::logfile::tail_in(&dir.join(crate::logfile::LOG_DIR_NAME), 100_000);
        assert!(log.contains("סימון הגרסה"), "log was: {log}");
    }

    #[test]
    fn a_synced_copy_is_read_back_and_a_failed_write_leaves_nothing() {
        let dir = scratch_dir();
        let target = dir.join("probe.json");
        write_checked(&target, b"abc").unwrap();
        assert_eq!(fs::read(&target).unwrap(), b"abc");
        // Writing into a path that cannot be created fails and leaves nothing behind.
        let bad = dir.join("no-such-folder").join("x.json");
        assert!(write_checked(&bad, b"abc").is_err());
        assert!(!bad.exists());
    }

    #[test]
    fn update_key_changes_one_key_under_the_lock_and_skips_a_no_op() {
        let dir = scratch_dir();
        save_keys_in(&dir, &patch_of(&[("notificationsSent", json!({"a": "d1"})), ("seder", json!([1]))])).unwrap();
        let stamp = file_stamp_in(&dir);
        update_key_in(&dir, "notificationsSent", &mut |cur| {
            let mut m = cur.and_then(Value::as_object).cloned().unwrap_or_default();
            m.insert("b".into(), json!("d2"));
            Some(Value::Object(m))
        })
        .unwrap();
        let store = read_store_in(&dir);
        assert_eq!(store["notificationsSent"], json!({"a": "d1", "b": "d2"}));
        assert_eq!(store["seder"], json!([1]));
        let after = file_stamp_in(&dir);
        assert_ne!(after, stamp);
        update_key_in(&dir, "notificationsSent", &mut |_| None).unwrap();
        assert_eq!(file_stamp_in(&dir), after, "nothing written");
        // A damaged file is an error, never a fresh start.
        fs::write(dir.join(STORE_FILE_NAME), "{bad").unwrap();
        assert!(update_key_in(&dir, "notificationsSent", &mut |_| Some(json!(1))).is_err());
        assert!(read_store_verified_in(&dir).is_err());
    }
}
