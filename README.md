# סדר פלוס — Seder Plus

Kollel attendance and learning tracker. Two Windows programs, one codebase:

| EXE                    | What it is                              |
| ---------------------- | --------------------------------------- |
| `SederPlus.exe`        | The full app                            |
| `SederPlusQuick.exe`   | Small always-handy arrival/departure window |

Each is a **single self-contained file** of roughly 10MB. Nothing to install,
no folder of support files, no runtime to ship — the UI renders through the
WebView2 runtime that comes with Windows 11 (and is present on essentially
every Windows 10 install).

Both can be open at the same time. They share one data file and pick up each
other's entries within a few seconds.

## How it fits together

```
src/          React app — 15 routes, entirely client-side
index.html    the SPA shell; routing lives in the URL hash
src-tauri/
  core/       the shared Rust shell: window setup, the data store, file saving
  full/       SederPlus.exe        — ~10 lines + its own icon and config
  quick/      SederPlusQuick.exe   — ~10 lines + its own icon and config
```

The frontend is compiled to static files and embedded straight into each EXE.
It reaches the outside world through exactly seven Rust commands (see
`src-tauri/core/src/lib.rs`): read the store, check whether the store changed,
write the store, save a generated file, open the full app from the quick
window, open a link in the browser, and raise a Windows notification.

## Reminders

The three switches under Settings → "התראות" raise real Windows toasts:
a nudge when nothing has been logged by the time seder א׳ starts, a warning
once the month's lateness quota is used up, and a weekly digest. The rules
live in `src/lib/notifications.ts`.

There is no background service, so a reminder can only appear while a window
is open — the rules are written to ask "is this still worth saying now?"
rather than to fire at a fixed time. Each one fires at most once per
day/week/month, and that bookkeeping lives in the shared data file so two open
EXEs never toast the same reminder twice.

## Update checks

Settings → "עדכוני גרסה" takes a GitHub repo as `owner/repo`. With one set,
the app asks `api.github.com` twice a day whether a newer release exists and
offers to open the download in the browser. Left empty — the default — the app
makes no network requests at all.

### Where the data lives

```
%APPDATA%\SederPlus\sedorim-data.json     all seder / learning / timer entries
%APPDATA%\SederPlus\backups\              rotating copies, one per 6h, 30 kept
```

Not in the WebView's localStorage: the two EXEs are separate OS processes, and
two processes cannot safely share one WebView storage partition — whichever
opens second can come up blank. Writes are atomic (temp file + rename) and a
write whose base data went stale underneath it is retried rather than allowed
to clobber the other EXE. See `src-tauri/core/src/store.rs`.

Settings, the audit log and in-app snapshots do stay in localStorage: those
are per-window preferences, not shared records.

## Working on it

```bash
npm install
npm run dev          # the app in a browser at http://localhost:5173
```

In a browser there is no Rust side, so the data store falls back to
localStorage and file saving falls back to an ordinary download. Everything
else behaves identically, which makes this the fastest way to work on the UI —
no Rust toolchain needed.

Add `?mode=quick` to the URL to see the quick-entry window.

```bash
npm test             # frontend unit tests
npm run test:rust    # the data store's tests
npm run lint
```

## Building the EXEs

```bash
npm run exe          # -> release-win\SederPlus.exe, release-win\SederPlusQuick.exe
```

Needs Node plus a [Rust toolchain](https://rustup.rs). If you'd rather not
install Rust, push to `main` and let
`.github/workflows/build-windows.yml` do it — it runs the same command and
attaches both EXEs to the run as an artifact.

The About screen inside the app shows the exact commit it was built from, so
you can always tell which code a given install actually has.
