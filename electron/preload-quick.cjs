const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  openMainApp: () => ipcRenderer.invoke("open-main-app"),
});
