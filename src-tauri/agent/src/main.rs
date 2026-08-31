//! SederPlusAgent.exe — the reminders, while the app is closed.
//!
//! It has no window, no tray icon and no WebView. That is the entire design
//! goal: SederPlus.exe costs 150MB of memory because a WebView2 process is
//! 150MB, and nobody should pay that all day so that two sentences can be
//! said. This process is a JSON read, some arithmetic and a Windows toast —
//! a few megabytes, asleep 99.9% of the time.
//!
//! What it does, once a minute:
//!
//!   1. If `settings.background.enabled` has gone false, exit. The switch in
//!      the app is the only way in and the only way out; there is nothing to
//!      right-click.
//!   2. Otherwise compare the clock against the plan the app wrote
//!      (`backgroundPlan`, see shared/src/plan.rs) and raise anything due.
//!
//! It never decides *when* a reminder is due — the app worked that out and
//! wrote it down. See shared/src/plan.rs for why.
//!
//! It is started by SederPlus.exe when the switch is turned on, and by the
//! HKCU\...\Run entry that the same switch writes, at every login.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::time::Duration as StdDuration;

use seder_plus_shared::clock::{self, Civil};
use seder_plus_shared::logfile;
use seder_plus_shared::plan::{self, Due, Facts, Kind, Plan, PlanDay};
use seder_plus_shared::store;
use serde_json::{Map, Value};
use tauri_winrt_notification::{Duration, Toast};

/// The AppUserModelID the toasts are raised under. Identical to the app's own
/// (`identifier` in src-tauri/full/tauri.conf.json), which is what
/// tauri-plugin-notification uses — so a reminder from the agent and one from
/// the app are the same "Seder Plus" as far as Windows is concerned: one
/// entry in Settings → Notifications, one group in the Action Center.
const APP_USER_MODEL_ID: &str = "il.co.9900.sederplus";

/// The full app, started when a toast is clicked. Lives next to this EXE.
const APP_EXE: &str = "SederPlus.exe";

/// Only one agent per user. Local\ rather than Global\ so a second Windows
/// account gets its own.
const SINGLE_INSTANCE_MUTEX: &str = "Local\\SederPlusAgent";

/// How often the clock is compared against the plan.
///
/// A minute is fine-grained enough that a reminder due at 09:20 arrives at
/// 09:20, and coarse enough to be free: the work is a stat() plus, only when
/// the file has actually changed, one JSON parse.
const TICK: StdDuration = StdDuration::from_secs(60);

fn main() {
    if !claim_single_instance() {
        // Another agent is already running — the app spawns one on every
        // launch without checking, and the Run entry fires at login too.
        return;
    }
    init_com();

    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(Path::to_path_buf))
        .unwrap_or_else(|| PathBuf::from("."));

    let mut state = State::default();
    loop {
        if !tick(&mut state, &exe_dir) {
            return;
        }
        std::thread::sleep(TICK);
    }
}

/// What the agent keeps between ticks: the answers it read out of the data
/// file, and the stamp they were read at. Small on purpose — this is what
/// stays resident all day.
#[derive(Default)]
struct State {
    /// The data file's mtime when `snapshot` was taken.
    stamp: String,
    snapshot: Option<Snapshot>,
}

struct Snapshot {
    /// The day it describes. A snapshot does not survive midnight: `recorded`
    /// and the plan row are both about one particular date.
    date: String,
    desktop_on: bool,
    daily_reminder_on: bool,
    phone_reminder_on: bool,
    phone_at: i64,
    plan_day: Option<PlanDay>,
    recorded: [bool; 2],
    phone_reported: bool,
    sent: HashMap<String, String>,
}

/// One pass. Returns false when the agent should exit.
fn tick(state: &mut State, exe_dir: &Path) -> bool {
    let now = clock::local_now();
    let today = now.iso_date();

    let stamp = store::file_stamp();
    if state.snapshot.is_none()
        || stamp != state.stamp
        || state.snapshot.as_ref().is_some_and(|s| s.date != today)
    {
        let raw = store::read_store();
        if !background_enabled(&raw) {
            logfile::append("info", "מצב הרקע כובה — SederPlusAgent נסגר.");
            return false;
        }
        state.stamp = stamp;
        state.snapshot = Some(read_snapshot(&raw, &now));
    }

    let Some(snapshot) = state.snapshot.as_mut() else {
        return true;
    };

    let facts = Facts {
        today: &today,
        now_min: now.minute_of_day(),
        day_of_month: now.day,
        prev_month: plan::previous_month(now.year as i32, now.month),
        plan_day: snapshot.plan_day.clone(),
        phone_at: snapshot.phone_at,
        desktop_on: snapshot.desktop_on,
        daily_reminder_on: snapshot.daily_reminder_on,
        phone_reminder_on: snapshot.phone_reminder_on,
        recorded: snapshot.recorded,
        phone_reported: snapshot.phone_reported,
        sent: snapshot.sent.clone(),
    };

    for due in plan::decide(&facts) {
        if let Err(err) = show(&due, exe_dir) {
            // A toast that could not be shown must not be marked as sent, or
            // the day's reminder is lost to a transient failure. Try again on
            // the next tick instead.
            logfile::append("error", &format!("התראת רקע נכשלה: {err}"));
            continue;
        }
        // Remembered in the file — which is also how the app knows not to
        // repeat it — and in the snapshot, so the next tick a minute from now
        // does not say it again before the file has been re-read.
        snapshot.sent.insert(due.kind.sent_key().to_string(), today.clone());
        mark_sent(due.kind.sent_key(), &today);
    }

    true
}

// ============ the data file ============

fn background_enabled(store: &Map<String, Value>) -> bool {
    store
        .get("settings")
        .and_then(|s| s.get("background"))
        .and_then(|b| b.get("enabled"))
        .and_then(Value::as_bool)
        .unwrap_or(false)
}

fn flag(store: &Map<String, Value>, section: &str, name: &str, default: bool) -> bool {
    store
        .get("settings")
        .and_then(|s| s.get(section))
        .and_then(|s| s.get(name))
        .and_then(Value::as_bool)
        .unwrap_or(default)
}

fn read_snapshot(store: &Map<String, Value>, now: &Civil) -> Snapshot {
    let today = now.iso_date();
    let plan = Plan::from_store(store);

    // Which sedarim already have an entry today. The entries are the same
    // array the app writes; only today's rows matter here.
    let mut recorded = [false, false];
    if let Some(Value::Array(entries)) = store.get("seder") {
        for entry in entries {
            if entry.get("date").and_then(Value::as_str) != Some(today.as_str()) {
                continue;
            }
            match entry.get("seder").and_then(Value::as_i64) {
                Some(1) => recorded[0] = true,
                Some(2) => recorded[1] = true,
                _ => {}
            }
        }
    }

    let prev_month = plan::previous_month(now.year as i32, now.month);
    let phone_reported = store
        .get("phoneReport")
        .and_then(|p| p.get("reported"))
        .and_then(Value::as_array)
        .map(|months| months.iter().any(|m| m.as_str() == Some(prev_month.as_str())))
        .unwrap_or(false);

    let mut sent = HashMap::new();
    if let Some(Value::Object(map)) = store.get("notificationsSent") {
        for (key, value) in map {
            if let Some(token) = value.as_str() {
                sent.insert(key.clone(), token.to_string());
            }
        }
    }

    Snapshot {
        date: today.clone(),
        desktop_on: flag(store, "notifications", "desktop", false),
        daily_reminder_on: flag(store, "notifications", "dailyReminder", true),
        phone_reminder_on: flag(store, "notifications", "phoneReport", true),
        // 20:00 if the plan does not say — the same default the app writes.
        phone_at: plan.as_ref().map(|p| p.phone_at).filter(|m| *m > 0).unwrap_or(20 * 60),
        plan_day: plan.as_ref().and_then(|p| p.day(&today)).cloned(),
        recorded,
        phone_reported,
        sent,
    }
}

/// Records that a reminder went out, in the same key the app uses.
///
/// Read-modify-write of the one key: the app may be running and may have
/// written other kinds into it, and `save_keys` replaces whole top-level keys.
fn mark_sent(key: &str, token: &str) {
    let mut sent = match store::read_store().get("notificationsSent") {
        Some(Value::Object(map)) => map.clone(),
        _ => Map::new(),
    };
    sent.insert(key.to_string(), Value::from(token));
    let mut patch = Map::new();
    patch.insert("notificationsSent".to_string(), Value::Object(sent));
    if let Err(err) = store::save_keys(&patch) {
        logfile::append("error", &format!("שמירת סימון ההתראה נכשלה: {err}"));
    }
}

/// Marks a month as reported, from the toast's button.
fn mark_phone_reported(month: &str) {
    let store_now = store::read_store();
    let mut months: Vec<Value> = store_now
        .get("phoneReport")
        .and_then(|p| p.get("reported"))
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    if months.iter().any(|m| m.as_str() == Some(month)) {
        return;
    }
    months.push(Value::from(month));

    let mut report = Map::new();
    report.insert("reported".to_string(), Value::Array(months));
    let mut patch = Map::new();
    patch.insert("phoneReport".to_string(), Value::Object(report));
    match store::save_keys(&patch) {
        Ok(_) => logfile::append("info", &format!("דווח למערכת הטלפונית סומן מההתראה — חודש {month}.")),
        Err(err) => logfile::append("error", &format!("סימון הדיווח מההתראה נכשל: {err}")),
    }
}

// ============ the toast ============

fn show(due: &Due, exe_dir: &Path) -> Result<(), String> {
    let app = exe_dir.join(APP_EXE);
    let mut toast = Toast::new(APP_USER_MODEL_ID)
        .title(&due.title)
        .text1(&due.body);

    match &due.kind {
        Kind::PhoneReport(month) => {
            let month = month.clone();
            // The button is the whole point of raising this one as a toast
            // rather than leaving it to the dashboard: the answer to "did you
            // report last month" is one click, from wherever the user is.
            toast = toast
                .duration(Duration::Long)
                .add_button("סמנתי שדיווחתי", "mark-phone")
                .on_activated(move |action| {
                    match action.as_deref() {
                        Some("mark-phone") => mark_phone_reported(&month),
                        // Anywhere else on the toast: open the app.
                        _ => open_app(&app),
                    }
                    Ok(())
                });
        }
        Kind::Seder(_) => {
            toast = toast
                .duration(Duration::Short)
                .on_activated(move |_| {
                    open_app(&app);
                    Ok(())
                });
        }
    }

    toast.show().map_err(|e| e.to_string())
}

/// Opens the full app. Used when a toast is clicked — the reminder says
/// something is unrecorded, so the next thing wanted is the screen to record
/// it on.
///
/// Does nothing if it is already open. The app is not single-instance (it
/// cannot be: SederPlus.exe and SederPlusQuick.exe are meant to run side by
/// side), so without this check a click while the app is already up would
/// leave the user looking at two identical windows.
fn open_app(app: &Path) {
    if !app.exists() || is_running(APP_EXE) {
        return;
    }
    if let Err(err) = std::process::Command::new(app).spawn() {
        logfile::append("error", &format!("פתיחת התוכנה מההתראה נכשלה: {err}"));
    }
}

/// Whether a process with this image name is running in this session.
///
/// `tasklist` rather than a process-enumeration crate: this runs at most once
/// per click on a toast, and the alternative is a dependency and an unsafe
/// block for something Windows already answers on the command line. It
/// reports only the current user's session, which is the right scope — the
/// app it would open is this user's.
#[cfg(windows)]
fn is_running(exe: &str) -> bool {
    use std::os::windows::process::CommandExt;
    let Ok(out) = std::process::Command::new("tasklist")
        .args(["/FI", &format!("IMAGENAME eq {exe}"), "/NH", "/FO", "CSV"])
        .creation_flags(0x0800_0000) // CREATE_NO_WINDOW
        .output()
    else {
        // Cannot tell. Opening a second window is a smaller failure than a
        // toast that does nothing when clicked.
        return false;
    };
    // With no match tasklist prints "INFO: No tasks are running..." — so this
    // looks for the name rather than for any output at all.
    String::from_utf8_lossy(&out.stdout).contains(exe)
}

#[cfg(not(windows))]
fn is_running(_exe: &str) -> bool {
    false
}

// ============ Windows ============

/// True if this process is the one agent. The handle is deliberately leaked:
/// the mutex must live exactly as long as the process.
#[cfg(windows)]
fn claim_single_instance() -> bool {
    use windows_sys::Win32::Foundation::{GetLastError, ERROR_ALREADY_EXISTS};
    use windows_sys::Win32::System::Threading::CreateMutexW;

    let name: Vec<u16> = SINGLE_INSTANCE_MUTEX.encode_utf16().chain(Some(0)).collect();
    // Safety: `name` is a valid null-terminated wide string that outlives the
    // call, and a null SECURITY_ATTRIBUTES is the documented default.
    unsafe {
        let handle = CreateMutexW(std::ptr::null(), 1, name.as_ptr());
        if handle.is_null() {
            // Cannot tell — better to run than to leave the user with no
            // reminders at all.
            return true;
        }
        GetLastError() != ERROR_ALREADY_EXISTS
    }
}

/// The WinRT toast API needs an initialised apartment on the calling thread.
#[cfg(windows)]
fn init_com() {
    use windows_sys::Win32::System::Com::{CoInitializeEx, COINIT_MULTITHREADED};
    // Safety: no reserved pointer, and a second call from an already
    // initialised thread only returns S_FALSE.
    unsafe {
        CoInitializeEx(std::ptr::null(), COINIT_MULTITHREADED as u32);
    }
}

#[cfg(not(windows))]
fn claim_single_instance() -> bool {
    true
}

#[cfg(not(windows))]
fn init_com() {}
