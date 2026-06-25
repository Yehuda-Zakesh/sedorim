// Electron main process — boots the bundled Nitro server in-process,
// then opens a BrowserWindow pointing at it. Fully offline.
const { app, BrowserWindow, Menu, shell } = require("electron");
const path = require("path");
const net = require("net");

// CRITICAL: shared userData so KollelTracker.exe and KollelQuick.exe see the
// same Chromium profile (same localStorage). Must be set BEFORE app is ready.
const SHARED_USER_DATA = path.join(app.getPath("appData"), "KollelTracker");
app.setPath("userData", SHARED_USER_DATA);

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
  await import(require("url").pathToFileURL(entry).href);
  await new Promise((r) => setTimeout(r, 300));
  return FIXED_PORT;
}

async function createWindow() {
  const port = await ensureServer();
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    title: "KollelTracker",
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  // Open external links in the default browser, not a new Electron window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
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
