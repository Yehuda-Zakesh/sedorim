//! Everything that is *not* a window.
//!
//! `store` and `logfile` used to live in `core/`, next to the Tauri commands
//! that wrap them. They moved here when SederPlusAgent.exe was added: the
//! agent has no window, no WebView and no Tauri runtime — that is the whole
//! point of it, and it is why it costs a few megabytes of memory instead of
//! the hundred and fifty a WebView2 process costs — so it cannot depend on a
//! crate that pulls Tauri in.
//!
//! `plan` is new, and is the agent's entire understanding of the world: the
//! frontend works out *when* each reminder becomes due (that needs the Hebrew
//! calendar, the seder schedule, the overrides and the user's arrival habit —
//! none of which is worth writing twice) and leaves the answer in the data
//! file. The agent only compares a clock against those numbers.

pub mod clock;
pub mod logfile;
pub mod plan;
pub mod store;
