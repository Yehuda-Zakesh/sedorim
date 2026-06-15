// Electron main process — boots the bundled Nitro server in-process,
// then opens a BrowserWindow pointing at it. Fully offline.
const { app, BrowserWindow, Menu, shell } = require("electron");
const path = require("path");
const net = require("net");

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

function findFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
  });
}

async function startServer() {
  const port = await findFreePort();
  process.env.PORT = String(port);
  process.env.HOST = "127.0.0.1";
  process.env.NITRO_HOST = "127.0.0.1";
  process.env.NITRO_PORT = String(port);
  const entry = resolveServerEntry();
  // Dynamic import works in CJS for ESM modules.
  await import(require("url").pathToFileURL(entry).href);
  // Give srvx a moment to bind.
  await new Promise((r) => setTimeout(r, 300));
  return port;
}

async function createWindow() {
  const port = await startServer();
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
