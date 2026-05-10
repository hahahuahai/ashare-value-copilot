"use strict";
const electron = require("electron");
const sub = (channel, cb) => {
  const listener = (_e, p) => cb(p);
  electron.ipcRenderer.on(channel, listener);
  return () => electron.ipcRenderer.removeListener(channel, listener);
};
const api = {
  health: () => electron.ipcRenderer.invoke("health"),
  ensureSidecar: () => electron.ipcRenderer.invoke("ensure-sidecar"),
  listReports: () => electron.ipcRenderer.invoke("list-reports"),
  readReport: (path) => electron.ipcRenderer.invoke("read-report", path),
  fileUrl: (path) => electron.ipcRenderer.invoke("file-url", path),
  openReportsDir: () => electron.ipcRenderer.invoke("open-reports-dir"),
  ask: (code) => electron.ipcRenderer.invoke("ask", code),
  review: (htmlPath) => electron.ipcRenderer.invoke("review", htmlPath),
  onStatus: (cb) => sub("ask:status", cb),
  onDataPack: (cb) => sub("ask:data-pack", cb),
  onChunk: (cb) => sub("ask:chunk", cb),
  onJudge: (cb) => sub("ask:judge", cb),
  getConfig: () => electron.ipcRenderer.invoke("get-config"),
  saveConfig: (cfg) => electron.ipcRenderer.invoke("save-config", cfg),
  openEnvFile: () => electron.ipcRenderer.invoke("open-env-file"),
  onNeedsSetup: (cb) => sub("config:needs-setup", cb)
};
electron.contextBridge.exposeInMainWorld("vc", api);
