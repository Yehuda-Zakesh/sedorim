// Electron main process — boots the bundled Nitro server in-process,
// then opens a BrowserWindow pointing at it. Fully offline.
//
// Data persistence: app data (seder/learning/timer entries) is stored in a
// JSON file on disk via the Nitro server (src/lib/store.functions.ts), NOT
// in Chromium's localStorage. This matters because SederPlus.exe and
// SederPlusQuick.exe are separate OS processes — Chromium does not support
// two processes safely sharing one profile's localStorage at the same time
// (whichever one opens second can silently get a blank/reset storage
// partition). The file-backed store, read/written by the one shared Nitro
// server process, has no such limitation.
const { app, BrowserWindow, Menu, shell } = require("electron");
const path = require("path");
const net = require("net");

// CRITICAL: shared userData so SederPlus.exe and SederPlusQuick.exe see the
// same Chromium profile (same localStorage). Must be set BEFORE app is ready.
const SHARED_USER_DATA = path.join(app.getPath("appData"), "SederPlus");
app.setPath("userData", SHARED_USER_DATA);
// The actual seder/learning/timer data now lives in a JSON file inside this
// same shared folder, written by the Nitro server process (see
// src/lib/store.functions.ts) — not in Chromium's localStorage, since two
// separate EXEs cannot safely share one Chromium profile concurrently.
process.env.SEDORIM_DATA_DIR = SHARED_USER_DATA;

// Fixed loopback port so both EXEs share the same origin (= same localStorage
// partition). If the port is already bound (other EXE running), we skip
// starting our own server and reuse the existing one.
const FIXED_PORT = 47821;

// Resolve the bundled server entry. In a packaged build the resources
// live under process.resourcesPath/app/dist-node; in dev they live
// alongside this file.
function resolveServerEntry() {
  const candidates = [
    path.join(__dirname, "..", "dist-node", "server", "index.mjs"),
    path.join(process.resourcesPath || "", "app", "dist-node", "server", "index.mjs"),
  ];
  for (const c of candidates) {
    try { require("fs").accessSync(c); return c; } catch {}
  }
  throw new Error("Server bundle not found. Looked in:\n" + candidates.join("\n"));
}

function isPortInUse(port) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once("error", (err) => resolve(err.code === "EADDRINUSE"));
    srv.once("listening", () => srv.close(() => resolve(false)));
    srv.listen(port, "127.0.0.1");
  });
}

async function ensureServer() {
  if (await isPortInUse(FIXED_PORT)) return FIXED_PORT;
  process.env.PORT = String(FIXED_PORT);
  process.env.HOST = "127.0.0.1";
  process.env.NITRO_HOST = "127.0.0.1";
  process.env.NITRO_PORT = String(FIXED_PORT);
  const entry = resolveServerEntry();
  try {
    await import(require("url").pathToFileURL(entry).href);
  } catch (err) {
    // Lost the race: the other EXE bound the port a moment after our
    // isPortInUse() check but before our own listen() call. That's fine —
    // just attach to their server instead of crashing.
    if (!(await isPortInUse(FIXED_PORT))) throw err;
  }
  // Poll for the port instead of a blind fixed sleep — usually near-instant
  // (server is listening within a few ms of the import above resolving),
  // with a generous cap for slower machines instead of always paying a
  // flat 300ms on every launch.
  for (let i = 0; i < 100; i++) {
    if (await isPortInUse(FIXED_PORT)) break;
    await new Promise((r) => setTimeout(r, 20));
  }
  return FIXED_PORT;
}

// Splash screen removed — spinning up an extra BrowserWindow (a whole
// second Chromium renderer process) on startup was making the app open
// noticeably slower. show:false + ready-to-show already avoids a white
// flash without that cost.
async function createWindow() {
  const port = await ensureServer();
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    title: "סדר פלוס",
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.once("ready-to-show", () => win.show());
  // Safety net: never leave the window hidden forever if something goes wrong.
  setTimeout(() => {
    if (!win.isDestroyed() && !win.isVisible()) win.show();
  }, 20_000);
  // Open external links in the default browser, not a new Electron window.
  // Empty/about:blank popups (e.g. the print-to-PDF preview window used by
  // exportPdfReport) are allowed to open as a normal Electron window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) {
      shell.openExternal(url);
      return { action: "deny" };
    }
    if (url === "about:blank" || url === "" || url.startsWith("blob:")) {
      return {
        action: "allow",
        overrideBrowserWindowOptions: {
          webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
        },
      };
    }
    return { action: "deny" };
  });
  Menu.setApplicationMenu(null);
  win.loadURL(`http://127.0.0.1:${port}/`);
}

app.whenReady().then(createWindow);
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
