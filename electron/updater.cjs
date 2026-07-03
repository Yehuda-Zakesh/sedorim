// Fully automatic background updates via electron-updater + GitHub Releases.
// No user interaction needed: checks in the background, downloads silently,
// and installs the next time the app restarts/quits. A native OS
// notification appears when an update has been downloaded (informational
// only — nothing to click).
const { app } = require("electron");

function initAutoUpdater(channel) {
  // electron-updater needs the packaged app's app-update.yml (embedded by
  // electron-builder at build time). In dev / unpackaged runs there's
  // nothing to check against, so skip entirely.
  if (!app.isPackaged) return;

  let autoUpdater;
  try {
    ({ autoUpdater } = require("electron-updater"));
  } catch {
    return; // dependency not present in this build — fail silently
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.channel = channel;

  const check = () => autoUpdater.checkForUpdatesAndNotify().catch(() => {});

  // First check shortly after launch (let the window paint first), then
  // periodically while the app stays open (useful for a desk that keeps
  // the app running for days at a time).
  setTimeout(check, 15_000);
  setInterval(check, 4 * 60 * 60 * 1000);
}

module.exports = { initAutoUpdater };
