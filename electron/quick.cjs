// KollelQuick.exe — minimal companion window that shares localStorage with
// the main app by pointing at the same Chromium userData folder and the same
// loopback origin. If KollelTracker.exe is running, we just attach to its
// server; otherwise we boot the bundled server ourselves on the same port.
const { app, BrowserWindow, Menu, shell } = require("electron");
const path = require("path");
const net = require("net");

const SHARED_USER_DATA = path.join(app.getPath("appData"), "KollelTracker");
app.setPath("userData", SHARED_USER_DATA);

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
  await import(require("url").pathToFileURL(entry).href);
  await new Promise((r) => setTimeout(r, 300));
  return FIXED_PORT;
}

async function createWindow() {
  const port = await ensureServer();
  const win = new BrowserWindow({
    width: 480,
    height: 680,
    title: "כניסה מהירה — כולל",
    autoHideMenuBar: true,
    resizable: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  Menu.setApplicationMenu(null);
  win.loadURL(`http://127.0.0.1:${port}/quick`);
}

app.whenReady().then(createWindow);
app.on("window-all-closed", () => app.quit());
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});