# סדר פלוס — Seder Plus

Kollel attendance and learning tracker. Two Windows programs, one codebase:

| EXE                  | What it is                                     |
| -------------------- | ---------------------------------------------- |
| `SederPlus.exe`      | The full app                                   |
| `SederPlusQuick.exe` | The small always-handy arrival window          |

Each is a **single self-contained file** of roughly 10MB. The UI renders
through the WebView2 runtime that comes with Windows 11 (and is present on
essentially every Windows 10 install).

Both can be open at the same time. They share one data file and pick up each
other's entries within a few seconds.

## Versions

Versions are whole numbers. This is **גרסה 1**; the next release is 2. The
manifests carry a semver string because npm, Tauri and Cargo all insist on one,
but only the major part means anything — `scripts/set-version.mjs` stamps the
number into all six of them, and the app displays the major alone.

Nothing in the repository has to be edited to cut a release: pushing to `main`
runs `.github/workflows/release.yml`, which takes the highest existing `vN` tag,
publishes `N+1`, and attaches the installer and both EXEs. No version bump is
ever committed, so a release cannot trigger another release.

## How it fits together

```
src/          React app — 14 routes, entirely client-side
public/fonts/ Heebo, shipped with the app: the UI and the PDFs use the same file
index.html    the SPA shell; routing lives in the URL hash
installer/    the Inno Setup script for SederPlusSetup.exe
src-tauri/
  core/       the shared Rust shell: window setup, the data store, the log, updates
  full/       SederPlus.exe        — ~10 lines + its own icon and config
  quick/      SederPlusQuick.exe   — ~10 lines + its own icon and config
```

The frontend is compiled to static files and embedded straight into each EXE.
It reaches the outside world through the Rust commands in
`src-tauri/core/src/lib.rs`: read/watch/write the store, save a generated file,
open the full app from the quick window, open a link in the browser, raise a
Windows notification, append to and read the log, and install an update.

## The quick window

One field: the time you arrived. Everything else is worked out —

- which seder it belongs to (`detectSeder` in `src/lib/quick-entry.ts`),
- whether אוהבי ה׳ is even possible (arrival at or before the start),
- the departure, which is recorded as the end of the seder. The window has no
  departure field on purpose; anyone who left early corrects it on the
  attendance screen.

Beside it, a "מוצדק" dialog (all of the missing time, or how much of it) and a
"היעדרות" dialog (which seder, and whether it was justified). The bar along the
bottom logs כולל ערב and תורתו בידו minutes and shows the month's figures — so a
normal day never needs the full app at all.

## Reports

PDFs are written as **real text** through `src/lib/pdf-doc.ts`: A4, right to
left, with Heebo embedded, tables that break between rows rather than through
them, and page numbers.

This replaced a screenshot. The old exporter laid the report out as hidden HTML
and rasterized it with html2canvas — which throws on any colour it cannot
parse, and Tailwind 4 writes every colour in the app as `oklch(...)`. Every
export failed. Even when it had worked it produced a picture of a report: no
selectable text, no search, fuzzy at any zoom, page breaks wherever the pixels
landed. See the header comment in `pdf-doc.ts`.

Hebrew in a PDF also has to be reordered by hand — a PDF paints glyphs in the
order given — which is what `src/lib/rtl-text.ts` does.

## Reminders

Under Settings → "יעדים והתראות" there are two channels and three rules. The
channels are in-app pop-ups (on) and real Windows notifications (off until
asked for); the rules are a nudge when nothing has been logged by the time
seder א׳ starts, a warning once the month's lateness quota is used up, and a
weekly digest. Both live in `src/lib/notifications.ts`.

There is no background service, so a reminder can only appear while a window is
open — the rules are written to ask "is this still worth saying now?" rather
than to fire at a fixed time. Each one fires at most once per day/week/month,
and that bookkeeping lives in the shared data file so two open EXEs never
raise the same reminder twice.

## Updates

Settings → "עדכוני גרסה" checks `api.github.com` twice a day and can install
what it finds: the installer is downloaded, run with `/SILENT`, and the app
closes and comes back up on the new version (`install_update` in
`src-tauri/core/src/updater.rs`). Clearing the repository field switches the
whole thing off, and then the app makes no network requests at all.

## When something goes wrong

```
%APPDATA%\SederPlus\logs\sederplus.log
```

Every failure the app notices is appended here — a failed export, a write that
did not go through, an unhandled error — and Settings → "יומן תקלות" shows the
tail of it and opens the folder. Inside a packaged EXE there is no console, so
without this a fault is invisible.

This replaced the audit log, which recorded every ordinary action the user took
and showed it on a screen of its own: a lot of machinery for the one thing that
never goes wrong.

### Where the data lives

```
%APPDATA%\SederPlus\sedorim-data.json     all seder / learning / timer entries
%APPDATA%\SederPlus\backups\              rotating copies, one per 6h, 30 kept
%APPDATA%\SederPlus\logs\                 the problem log
```

Not in the WebView's localStorage: the two EXEs are separate OS processes, and
two processes cannot safely share one WebView storage partition — whichever
opens second can come up blank. Writes are atomic (temp file + rename) and a
write whose base data went stale underneath it is retried rather than allowed
to clobber the other EXE. See `src-tauri/core/src/store.rs`.

An uninstall never touches this folder.

## Working on it

```bash
npm install
npm run dev          # the app in a browser at http://localhost:5173
```

In a browser there is no Rust side, so the data store falls back to
localStorage, file saving falls back to an ordinary download, and the log lives
in memory. Everything else behaves identically, which makes this the fastest
way to work on the UI — no Rust toolchain needed.

Add `?mode=quick` to the URL to see the quick-entry window.

```bash
npm test             # frontend unit tests
npm run test:rust    # the data store, the log and the updater
npm run test:all     # both
```

## Building

```bash
npm run exe          # -> release-win\SederPlus.exe, release-win\SederPlusQuick.exe
npm run installer    # -> release-win\SederPlusSetup.exe
npm run dist         # both, in order
```

`npm run exe` needs Node plus a [Rust toolchain](https://rustup.rs).
`npm run installer` needs [Inno Setup 6](https://jrsoftware.org/isinfo.php)
(`winget install JRSoftware.InnoSetup`); it is pre-installed on GitHub's
Windows runners, so pushing to `main` builds everything without either.

The installer puts both programs in `%LOCALAPPDATA%\SederPlus`, asks nothing,
raises no administrator prompt, and leaves a desktop shortcut for each. That is
also what makes the in-app update quiet: no UAC dialog in the way.

The About screen shows the version and the exact commit each install was built
from, so you can always tell which code is actually running.

## A note on `npm run lint`

It currently reports thousands of `prettier/prettier` errors across the whole
repository, including files nothing has touched in months. Two separate causes:
the working tree is checked out with CRLF line endings (`core.autocrlf=true`)
while Prettier wants LF, and the code's own hand-tuned JSX layout predates the
Prettier rule being wired into ESLint. Running `npm run format` would fix both
in one commit and reformat almost every file; that has deliberately been left
as its own decision rather than mixed into a feature change.
