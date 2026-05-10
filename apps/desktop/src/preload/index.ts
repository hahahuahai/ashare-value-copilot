import { contextBridge, ipcRenderer, IpcRendererEvent } from "electron";

export interface AppConfig {
  LLM_API_KEY: string;
  LLM_BASE_URL: string;
  LLM_MODEL: string;
  PYTHON_BIN: string;
  envPath: string;
  isPackaged: boolean;
}

export interface ReportItem {
  file: string;
  path: string;
  code: string;
  date: string;
  type: "md" | "html";
  mtime: number;
}

export interface VCApi {
  health: () => Promise<{ ok: boolean; sidecarUrl: string; model: string }>;
  ensureSidecar: () => Promise<boolean>;
  listReports: () => Promise<ReportItem[]>;
  readReport: (path: string) => Promise<string>;
  fileUrl: (path: string) => Promise<string>;
  openReportsDir: () => Promise<void>;
  ask: (code: string) => Promise<{ path: string; mdPath: string }>;
  review: (htmlPath: string) => Promise<{ ok: boolean; score?: number; level?: string; issues?: number; error?: string; mode?: "standard" | "legacy" }>;
  onStatus: (cb: (p: { phase: string; text: string; path?: string; mdPath?: string }) => void) => () => void;
  onDataPack: (cb: (p: any) => void) => () => void;
  onChunk: (cb: (p: { master: "buffett" | "duan"; phase: "thinking" | "answer"; delta: string }) => void) => () => void;
  onJudge: (cb: (p: { judge: any }) => void) => () => void;
  // 配置
  getConfig: () => Promise<AppConfig>;
  saveConfig: (cfg: Partial<Omit<AppConfig, "envPath" | "isPackaged">>) => Promise<{ ok: boolean; envPath: string }>;
  openEnvFile: () => Promise<void>;
  onNeedsSetup: (cb: () => void) => () => void;
}

const sub = (channel: string, cb: (p: any) => void) => {
  const listener = (_e: IpcRendererEvent, p: any) => cb(p);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};

const api: VCApi = {
  health: () => ipcRenderer.invoke("health"),
  ensureSidecar: () => ipcRenderer.invoke("ensure-sidecar"),
  listReports: () => ipcRenderer.invoke("list-reports"),
  readReport: (path) => ipcRenderer.invoke("read-report", path),
  fileUrl: (path) => ipcRenderer.invoke("file-url", path),
  openReportsDir: () => ipcRenderer.invoke("open-reports-dir"),
  ask: (code) => ipcRenderer.invoke("ask", code),
  review: (htmlPath) => ipcRenderer.invoke("review", htmlPath),
  onStatus: (cb) => sub("ask:status", cb),
  onDataPack: (cb) => sub("ask:data-pack", cb),
  onChunk: (cb) => sub("ask:chunk", cb),
  onJudge: (cb) => sub("ask:judge", cb),
  getConfig: () => ipcRenderer.invoke("get-config"),
  saveConfig: (cfg) => ipcRenderer.invoke("save-config", cfg),
  openEnvFile: () => ipcRenderer.invoke("open-env-file"),
  onNeedsSetup: (cb) => sub("config:needs-setup", cb),
};

contextBridge.exposeInMainWorld("vc", api);
