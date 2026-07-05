// SederPlusQuick.exe — minimal companion window. App data now lives in a
// shared JSON file written by the Nitro server (src/lib/store.functions.ts),
// read/written by whichever server instance the two EXEs attach to — not in
// Chromium's per-process localStorage (see main.cjs for why that broke).
// If SederPlus.exe is running, we just attach to its server; otherwise we
// boot the bundled server ourselves on the same port.
const { app, BrowserWindow, Menu, shell, ipcMain } = require("electron");
const path = require("path");
const net = require("net");

const SHARED_USER_DATA = path.join(app.getPath("appData"), "SederPlus");
app.setPath("userData", SHARED_USER_DATA);
// Same shared data folder used by SederPlus.exe — see main.cjs and
// src/lib/store.functions.ts for why data now lives here instead of
// Chromium's per-process localStorage.
process.env.SEDORIM_DATA_DIR = SHARED_USER_DATA;

const FIXED_PORT = 47821;

function resolveServerEntry() {
  const candidates = [
    path.join(__dirname, "..", "dist-node", "server", "index.mjs"),
    path.join(process.resourcesPath || "", "app", "dist-node", "server", "index.mjs"),
  ];
  for (const c of candidates) {
    try { require("fs").accessSync(c); return c; } catch {}
  }
  throw new Error("Server bundle not found.");
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
  await new Promise((r) => setTimeout(r, 300));
  return FIXED_PORT;
}

function attachWindowOpenHandler(win) {
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
}

function createSplash() {
  const splash = new BrowserWindow({
    width: 260,
    height: 260,
    frame: false,
    resizable: false,
    movable: false,
    alwaysOnTop: true,
    show: false,
    backgroundColor: "#0f172a",
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  splash.loadFile(path.join(__dirname, "splash.html"));
  splash.once("ready-to-show", () => splash.show());
  return splash;
}

// The full app, opened as a second window IN THIS SAME PROCESS (same
// session/localStorage — no cross-process storage race like launching a
// separate SederPlus.exe would have). Reused/focused on repeat clicks.
let mainAppWin = null;

async function openMainApp() {
  if (mainAppWin && !mainAppWin.isDestroyed()) {
    mainAppWin.focus();
    return;
  }
  const splash = createSplash();
  const port = await ensureServer();
  mainAppWin = new BrowserWindow({
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
  attachWindowOpenHandler(mainAppWin);
  mainAppWin.once("ready-to-show", () => {
    mainAppWin.show();
    if (!splash.isDestroyed()) splash.destroy();
  });
  setTimeout(() => {
    if (mainAppWin && !mainAppWin.isDestroyed() && !mainAppWin.isVisible()) mainAppWin.show();
    if (!splash.isDestroyed()) splash.destroy();
  }, 20_000);
  mainAppWin.on("closed", () => { mainAppWin = null; });
  mainAppWin.loadURL(`http://127.0.0.1:${port}/`);
}

ipcMain.handle("open-main-app", () => openMainApp());

async function createWindow() {
  const splash = createSplash();
  const port = await ensureServer();
  const win = new BrowserWindow({
    width: 480,
    height: 680,
    title: "כניסה מהירה — סדר פלוס",
    autoHideMenuBar: true,
    resizable: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, "preload-quick.cjs"),
    },
  });
  attachWindowOpenHandler(win);
  win.once("ready-to-show", () => {
    win.show();
    if (!splash.isDestroyed()) splash.destroy();
  });
  setTimeout(() => {
    if (!win.isDestroyed() && !win.isVisible()) win.show();
    if (!splash.isDestroyed()) splash.destroy();
  }, 20_000);
  Menu.setApplicationMenu(null);
  win.loadURL(`http://127.0.0.1:${port}/quick`);
}

app.whenReady().then(createWindow);
app.on("window-all-closed", () => app.quit());
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});