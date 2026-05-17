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
  name: string;
  code: string;
  date: string;
  type: "md" | "html";
  mtime: number;
}
export interface StockSearchResult {
  code: string;
  name: string;
  score?: number;
  reason?: string;
}

/** v0.2.0：大师定义（从 main 传到 renderer） */
export interface MasterInfo {
  id: string;
  displayName: string;
  subtitle: string;
  defaultEnabled: boolean;
}

export interface VCApi {
  health: () => Promise<{ ok: boolean; sidecarUrl: string; model: string }>;
  ensureSidecar: () => Promise<boolean>;
  searchStocks: (query: string) => Promise<StockSearchResult[]>;
  listReports: () => Promise<ReportItem[]>;
  deleteReport: (path: string) => Promise<{ ok: boolean; deleted: string[]; trashDir?: string }>;
  deleteReports: (paths: string[]) => Promise<{ ok: boolean; deleted: string[]; results: any[] }>;
  readReport: (path: string) => Promise<string>;
  fileUrl: (path: string) => Promise<string>;
  openReportsDir: () => Promise<void>;
  getDiagnostics: () => Promise<any>;
  getAppState: () => Promise<any>;
  saveAppState: (state: any) => Promise<{ ok: boolean; path: string }>;
  refreshWatchItem: (code: string) => Promise<any>;
  ask: (code: string) => Promise<{ path: string; mdPath: string }>;
  review: (htmlPath: string) => Promise<{ ok: boolean; score?: number; level?: string; issues?: number; error?: string; mode?: "standard" | "legacy" }>;
  aiTask: (kind: string, context: any) => Promise<{ title: string; summary: string; bullets: string[]; actions: string[]; warnings: string[]; error?: string }>;
  onStatus: (cb: (p: { phase: string; text: string; path?: string; mdPath?: string }) => void) => () => void;
  onDataPack: (cb: (p: any) => void) => () => void;
  /** v0.2.0：master 字段从 "buffett"|"duan" 变成任意 string（大师 id） */
  onChunk: (cb: (p: { master: string; phase: "thinking" | "answer"; delta: string }) => void) => () => void;
  onJudge: (cb: (p: { judge: any }) => void) => () => void;
  onWarn: (cb: (p: { master: string; msg: string }) => void) => () => void;
  // 配置
  getConfig: () => Promise<AppConfig>;
  saveConfig: (cfg: Partial<Omit<AppConfig, "envPath" | "isPackaged">>) => Promise<{ ok: boolean; envPath: string }>;
  openEnvFile: () => Promise<void>;
  onNeedsSetup: (cb: () => void) => () => void;
  // v0.2.0：大师管理
  getMasters: () => Promise<{ all: MasterInfo[]; enabled: string[] }>;
  setMasters: (ids: string[]) => Promise<{ ok: boolean }>;
}

const sub = (channel: string, cb: (p: any) => void) => {
  const listener = (_e: IpcRendererEvent, p: any) => cb(p);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};

const api: VCApi = {
  health: () => ipcRenderer.invoke("health"),
  ensureSidecar: () => ipcRenderer.invoke("ensure-sidecar"),
  searchStocks: (query) => ipcRenderer.invoke("search-stocks", query),
  listReports: () => ipcRenderer.invoke("list-reports"),
  deleteReport: (path) => ipcRenderer.invoke("delete-report", path),
  deleteReports: (paths) => ipcRenderer.invoke("delete-reports", paths),
  readReport: (path) => ipcRenderer.invoke("read-report", path),
  fileUrl: (path) => ipcRenderer.invoke("file-url", path),
  openReportsDir: () => ipcRenderer.invoke("open-reports-dir"),
  getDiagnostics: () => ipcRenderer.invoke("get-diagnostics"),
  getAppState: () => ipcRenderer.invoke("get-app-state"),
  saveAppState: (state) => ipcRenderer.invoke("save-app-state", state),
  refreshWatchItem: (code) => ipcRenderer.invoke("refresh-watch-item", code),
  ask: (code) => ipcRenderer.invoke("ask", code),
  review: (htmlPath) => ipcRenderer.invoke("review", htmlPath),
  aiTask: (kind, context) => ipcRenderer.invoke("ai-task", kind, context),
  onStatus: (cb) => sub("ask:status", cb),
  onDataPack: (cb) => sub("ask:data-pack", cb),
  onChunk: (cb) => sub("ask:chunk", cb),
  onJudge: (cb) => sub("ask:judge", cb),
  onWarn: (cb) => sub("ask:warn", cb),
  getConfig: () => ipcRenderer.invoke("get-config"),
  saveConfig: (cfg) => ipcRenderer.invoke("save-config", cfg),
  openEnvFile: () => ipcRenderer.invoke("open-env-file"),
  onNeedsSetup: (cb) => sub("config:needs-setup", cb),
  getMasters: () => ipcRenderer.invoke("get-masters"),
  setMasters: (ids) => ipcRenderer.invoke("set-masters", ids),
};

contextBridge.exposeInMainWorld("vc", api);
