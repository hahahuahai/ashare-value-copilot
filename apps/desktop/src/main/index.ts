/**
 * Electron 主进程
 *  - 启动时：拉起 Python 边车（如未在跑）
 *  - 退出时：杀掉子进程
 *  - 暴露 IPC 给渲染进程：探活、跑大师、读历史
 */
// !!! bootstrap-env 必须排在所有业务 import 之前，把 .env 注入 process.env
import { RES_ROOT, USER_ROOT, IS_PACKAGED } from "./bootstrap-env";

import { app, BrowserWindow, ipcMain, shell, dialog } from "electron";
import { spawn, ChildProcess } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { resolve, dirname, join } from "node:path";

import { buildDataPack, data } from "@vc/data";
import { runMasterStream, runJudge, extractJudgeJSON, runReview, extractReviewJSON } from "@vc/agents";
import { renderReportHTML, renderReviewCard, renderReviewError } from "./render-report";

const here = __dirname;

// === Python 边车管理 ===
let sidecarProc: ChildProcess | null = null;
const SIDECAR_URL = process.env.DATA_SIDECAR_URL ?? "http://127.0.0.1:9876";

async function ensureSidecar(): Promise<boolean> {
  if (await data.health()) return true;
  const script = resolve(RES_ROOT, "services/data-sidecar/main.py");
  if (!existsSync(script)) {
    console.error("[main] sidecar script not found:", script);
    dialog.showErrorBox("数据边车缺失", `未找到 Python 边车脚本：\n${script}\n\n请重装应用或检查 resources。`);
    return false;
  }
  console.log("[main] starting sidecar:", script);
  const pythonCmd = process.env.PYTHON_BIN || (process.platform === "win32" ? "python" : "python3");
  try {
    sidecarProc = spawn(pythonCmd, [script], {
      cwd: dirname(script),
      stdio: ["ignore", "pipe", "pipe"],
      detached: false,
    });
  } catch (e: any) {
    dialog.showErrorBox(
      "未找到 Python",
      `启动数据边车失败：${e.message}\n\n` +
        `请先安装 Python 3.10+，并执行：\n` +
        `  pip install -r "${resolve(RES_ROOT, "services/data-sidecar/requirements.txt")}"\n\n` +
        `或在系统环境变量中设 PYTHON_BIN 指向你的 python.exe。`
    );
    return false;
  }
  let earlyExit = false;
  sidecarProc.on("error", (err) => {
    earlyExit = true;
    console.error("[sidecar] spawn error:", err);
  });
  sidecarProc.on("exit", (code) => {
    if (code !== 0 && code !== null) {
      earlyExit = true;
      console.error("[sidecar] exited early with code", code);
    }
  });
  sidecarProc.stdout?.on("data", (b) => process.stdout.write(`[sidecar] ${b}`));
  sidecarProc.stderr?.on("data", (b) => process.stderr.write(`[sidecar] ${b}`));
  // 等待最多 10 秒
  for (let i = 0; i < 20; i++) {
    if (earlyExit) {
      dialog.showErrorBox(
        "Python 边车启动失败",
        `Python 已找到但脚本运行异常，可能缺少依赖。\n` +
          `请打开终端执行：\n` +
          `  pip install -r "${resolve(RES_ROOT, "services/data-sidecar/requirements.txt")}"`
      );
      return false;
    }
    await new Promise((r) => setTimeout(r, 500));
    if (await data.health()) return true;
  }
  return false;
}

function killSidecar() {
  if (sidecarProc && !sidecarProc.killed) {
    try {
      sidecarProc.kill();
    } catch {}
    sidecarProc = null;
  }
}

// === 历史报告（写入用户数据目录，不污染只读资源） ===
const REPORTS_DIR = resolve(USER_ROOT, "reports");
function listReports() {
  if (!existsSync(REPORTS_DIR)) return [];
  return readdirSync(REPORTS_DIR)
    .filter((f) => f.endsWith(".md") || f.endsWith(".html"))
    .map((f) => {
      const path = join(REPORTS_DIR, f);
      const stat = statSync(path);
      const m = f.match(/^(\d{6})-(\d{4}-\d{2}-\d{2})\.(md|html)$/);
      return {
        file: f,
        path,
        code: m?.[1] ?? "",
        date: m?.[2] ?? "",
        type: (m?.[3] ?? "md") as "md" | "html",
        mtime: stat.mtime.getTime(),
      };
    })
    // 同一份报告 .html 优先，去掉对应 .md 副本以免重复显示
    .reduce((acc: any[], cur) => {
      if (cur.type === "html") {
        acc = acc.filter((x) => !(x.code === cur.code && x.date === cur.date));
        acc.push(cur);
      } else {
        if (!acc.some((x) => x.code === cur.code && x.date === cur.date && x.type === "html")) {
          acc.push(cur);
        }
      }
      return acc;
    }, [])
    .sort((a, b) => b.mtime - a.mtime);
}

function saveReport(
  code: string,
  name: string,
  fetchedAt: string,
  pack: any,
  buffett: string,
  duan: string,
  judgeRaw: string,
  judgeObj: any,
): { mdPath: string; htmlPath: string } {
  const date = new Date().toISOString().slice(0, 10);
  if (!existsSync(REPORTS_DIR)) mkdirSync(REPORTS_DIR, { recursive: true });

  // Markdown 版本（保留向后兼容）
  const md = [
    `# ${code} ${name} · 价投合伙人报告`,
    ``,
    `> 生成于 ${fetchedAt}`,
    ``,
    `## 综合裁判结论`,
    "```json",
    JSON.stringify(judgeObj, null, 2),
    "```",
    ``,
    `## 数据快照`,
    "```json",
    JSON.stringify({ valuation: pack.valuation, quote: pack.quote, dividend: pack.dividend, historicalPE: { ...pack.historicalPE, series: undefined } }, null, 2),
    "```",
    ``,
    `## 巴菲特`,
    buffett,
    ``,
    `## 段永平`,
    duan,
    ``,
    `---`,
    `⚠️ 本报告仅用于研究辅助，不构成任何买卖建议。`,
  ].join("\n");
  const mdPath = join(REPORTS_DIR, `${code}-${date}.md`);
  writeFileSync(mdPath, md, "utf-8");

  // HTML 版本（主产物）
  // v0.1.7：从各 sidecar 接口聚合 _source / _warning，透传给报告底部展示
  const collectWarnings = (): string[] => {
    const ws: string[] = [];
    const fields: Array<[string, any]> = [
      ["profile", pack?.profile],
      ["valuation", pack?.valuation],
      ["quote", pack?.quote],
      ["dividend", pack?.dividend],
      ["historicalPE", pack?.historicalPE],
      ["industryCompare", pack?.industryCompare],
    ];
    for (const [name, obj] of fields) {
      if (obj && typeof obj === "object" && obj._warning) {
        ws.push(`${name}: ${String(obj._warning)}`);
      }
    }
    return ws;
  };
  const html = renderReportHTML({
    judge: judgeObj ?? {},
    buffettMd: buffett,
    duanMd: duan,
    fetchedAt,
    pe_series: pack?.historicalPE?.series ?? [],
    industry_compare: pack?.industryCompare,
    financial_rows: pack?.financial?.rows ?? [],
    data_sources: {
      profile: (pack?.profile as any)?._source,
      valuation: (pack?.valuation as any)?._source,
      quote: (pack?.quote as any)?._source,
      dividend: (pack?.dividend as any)?._source,
      historicalPE: (pack?.historicalPE as any)?._source,
      industryCompare: (pack?.industryCompare as any)?._source,
      warnings: collectWarnings(),
    },
  });
  const htmlPath = join(REPORTS_DIR, `${code}-${date}.html`);
  writeFileSync(htmlPath, html, "utf-8");

  // 顺便把裁判原始输出也存一份，方便排错
  writeFileSync(join(REPORTS_DIR, `${code}-${date}.judge.txt`), judgeRaw, "utf-8");

  // v0.1.10：保存 review 所需的全部原料（DataPack + 三段 + judgeObj），AI 复核 IPC 直接读这个文件
  try {
    const payloadPath = join(REPORTS_DIR, `${code}-${date}.payload.json`);
    writeFileSync(
      payloadPath,
      JSON.stringify({
        code,
        name,
        fetched_at: fetchedAt,
        pack,
        buffett,
        duan,
        judgeRaw,
        judgeObj,
      }, null, 2),
      "utf-8",
    );
  } catch (e: any) {
    console.warn("[saveReport] payload.json write failed:", e?.message);
  }

  return { mdPath, htmlPath };
}

// === BrowserWindow ===
let win: BrowserWindow | null = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 980,
    minHeight: 640,
    backgroundColor: "#0f0f10",
    title: "价投合伙人 · A-Share Value Council",
    webPreferences: {
      preload: resolve(here, "..", "preload", "index.js"),
      contextIsolation: true,
      sandbox: false,
    },
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL);
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    win.loadFile(resolve(here, "..", "renderer", "index.html"));
  }
}

// === IPC ===
ipcMain.handle("health", async () => {
  const ok = await data.health();
  return { ok, sidecarUrl: SIDECAR_URL, model: process.env.LLM_MODEL ?? "(未设置)" };
});

ipcMain.handle("ensure-sidecar", async () => {
  return await ensureSidecar();
});

ipcMain.handle("list-reports", async () => listReports());

ipcMain.handle("read-report", async (_e, path: string) => {
  if (!path.startsWith(REPORTS_DIR)) throw new Error("invalid path");
  return readFileSync(path, "utf-8");
});

/** 转 file:// URI，给渲染器用 iframe 加载离线 HTML 报告 */
ipcMain.handle("file-url", async (_e, path: string) => {
  if (!path.startsWith(REPORTS_DIR)) throw new Error("invalid path");
  // Windows 路径：/C:/Users/.../xxx.html
  const norm = path.replace(/\\/g, "/");
  return norm.startsWith("/") ? `file://${norm}` : `file:///${norm}`;
});

ipcMain.handle("open-reports-dir", async () => {
  if (existsSync(REPORTS_DIR)) shell.openPath(REPORTS_DIR);
});

// === 配置读写（供"设置"弹窗使用） ===
const ENV_PATH = resolve(USER_ROOT, ".env");

// 注意：agents/llm.ts 用的是 LLM_API_KEY / LLM_BASE_URL / LLM_MODEL
const KNOWN_KEYS = ["LLM_API_KEY", "LLM_BASE_URL", "LLM_MODEL", "PYTHON_BIN"] as const;
type ConfigKey = (typeof KNOWN_KEYS)[number];
type ConfigMap = Partial<Record<ConfigKey, string>>;

// 兼容：旧版 .env 可能写成 LKEAP_API_KEY，读的时候迁移一下
const LEGACY_KEY_ALIAS: Record<string, ConfigKey> = {
  LKEAP_API_KEY: "LLM_API_KEY",
};

function readEnvFile(): ConfigMap {
  const out: ConfigMap = {};
  if (!existsSync(ENV_PATH)) return out;
  const txt = readFileSync(ENV_PATH, "utf-8");
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    let k = m[1] as string;
    if (LEGACY_KEY_ALIAS[k]) k = LEGACY_KEY_ALIAS[k];
    if ((KNOWN_KEYS as readonly string[]).includes(k)) {
      const key = k as ConfigKey;
      // 新名字优先（若两者都存在）
      if (!out[key]) out[key] = m[2].replace(/^["']|["']$/g, "");
    }
  }
  return out;
}

function writeEnvFile(cfg: ConfigMap) {
  if (!existsSync(USER_ROOT)) mkdirSync(USER_ROOT, { recursive: true });
  const lines = [
    "# 价投合伙人配置（由设置窗自动生成，可手动编辑）",
    "# 腾讯云 LKEAP 申请 API Key: https://console.cloud.tencent.com/lkeap/api-key",
    "# Token Plan（包月套餐）：BASE_URL 用 /plan/v3，KEY 是 sk-tp-xxx",
    "# 标准计费：BASE_URL 用 /v1，KEY 是 sk-xxx",
    "",
  ];
  for (const k of KNOWN_KEYS) {
    const v = cfg[k] ?? "";
    lines.push(`${k}=${v}`);
  }
  writeFileSync(ENV_PATH, lines.join("\n") + "\n", "utf-8");
}

ipcMain.handle("get-config", async () => {
  const fromFile = readEnvFile();
  // 返回当前生效值（优先 process.env，因为 bootstrap-env 已加载过）
  return {
    LLM_API_KEY:
      process.env.LLM_API_KEY ??
      process.env.LKEAP_API_KEY ?? // 兼容旧全局环境变量
      fromFile.LLM_API_KEY ??
      "",
    LLM_BASE_URL:
      process.env.LLM_BASE_URL ??
      fromFile.LLM_BASE_URL ??
      "https://api.lkeap.cloud.tencent.com/plan/v3",
    LLM_MODEL: process.env.LLM_MODEL ?? fromFile.LLM_MODEL ?? "glm-5.1",
    PYTHON_BIN: process.env.PYTHON_BIN ?? fromFile.PYTHON_BIN ?? "",
    envPath: ENV_PATH,
    isPackaged: IS_PACKAGED,
  };
});

ipcMain.handle("save-config", async (_e, cfg: ConfigMap) => {
  writeEnvFile(cfg);
  // 热更新 process.env，新的 LLM 调用立即生效
  for (const k of KNOWN_KEYS) {
    if (cfg[k] !== undefined && cfg[k] !== "") {
      process.env[k] = cfg[k]!;
    }
  }
  return { ok: true, envPath: ENV_PATH };
});

ipcMain.handle("open-env-file", async () => {
  if (!existsSync(ENV_PATH)) writeEnvFile(readEnvFile());
  shell.openPath(ENV_PATH);
});

ipcMain.handle("ask", async (event, code: string) => {
  if (!/^\d{6}$/.test(code)) throw new Error(`股票代码格式错误：${code}`);
  if (!(await ensureSidecar())) throw new Error("数据边车启动失败");

  const send = (channel: string, payload: any) => event.sender.send(channel, payload);

  send("ask:status", { phase: "fetching", text: `🔍 拉取数据 ${code}...` });
  const pack = await buildDataPack(code);
  const name = (pack.quote as any)?.name ?? (pack.profile as any)?.["股票简称"] ?? "";
  send("ask:data-pack", {
    code,
    name,
    fetched_at: pack.fetched_at,
    valuation: pack.valuation,
    quote: pack.quote,
    profile: pack.profile,
    financial_rows: (pack.financial as any)?.row_count ?? 0,
    dividend_yield_pct: (pack.dividend as any)?.latest_yield_pct ?? null,
    pe_percentile: (pack.historicalPE as any)?.pe_percentile ?? null,
  });

  send("ask:status", { phase: "buffett", text: "🧠 巴菲特正在思考..." });
  let buffett = "";
  buffett = await runMasterStream({ master: "buffett", data: pack }, (delta, phase) => {
    send("ask:chunk", { master: "buffett", phase, delta });
  });

  send("ask:status", { phase: "duan", text: "🧠 段永平正在思考..." });
  let duan = "";
  duan = await runMasterStream({ master: "duan", data: pack }, (delta, phase) => {
    send("ask:chunk", { master: "duan", phase, delta });
  });

  send("ask:status", { phase: "judge", text: "⚖️ 综合裁判汇总打分..." });
  let judgeRaw = "";
  let judgeObj: any = null;
  try {
    judgeRaw = await runJudge({ data: pack, buffett, duan });
    judgeObj = extractJudgeJSON(judgeRaw);
  } catch (e: any) {
    console.warn("[judge] failed:", e?.message);
    // 兜底：构造一份最小可渲染的 Judge JSON，避免 HTML 报告全空
    judgeObj = {
      code,
      name,
      as_of: pack.fetched_at.slice(0, 10),
      verdict: "out_of_competence",
      one_liner: "综合裁判失败，仅展示原始数据与大师论述。",
      scores: {
        business: { value: null, reason: "裁判输出解析失败" },
        company: { value: null, reason: "裁判输出解析失败" },
        price: { value: null, reason: "裁判输出解析失败" },
      },
      key_metrics: {
        pe_ttm: (pack.valuation as any)?.pe_ttm ?? null,
        pb: (pack.valuation as any)?.pb ?? null,
        pe_percentile_10y: (pack.historicalPE as any)?.pe_percentile ?? null,
        pb_percentile_10y: (pack.historicalPE as any)?.pb_percentile ?? null,
        dividend_yield_pct: (pack.dividend as any)?.latest_yield_pct ?? null,
      },
    };
  }

  const { mdPath, htmlPath } = saveReport(code, name, pack.fetched_at, pack, buffett, duan, judgeRaw, judgeObj);
  send("ask:judge", { judge: judgeObj });
  send("ask:status", { phase: "done", text: "✓ 完成", path: htmlPath, mdPath });
  return { path: htmlPath, mdPath };
});

// ============================================================================
// v0.1.10：AI 复核 IPC —— 对一份已生成的 HTML 报告做事实/逻辑/相关性审查
// v0.1.12：兼容旧 HTML —— 无 payload.json 时从 .md 反解三段（降级模式）
// ============================================================================

/** 从 .md 报告反解三段：judgeObj / buffett / duan。
 *  约定的 markdown 结构（v0.1.4+ 都满足）：
 *    ## 综合裁判结论
 *    ```json
 *    {...}
 *    ```
 *    ## 数据快照（中间一堆，可忽略）
 *    ## 巴菲特
 *    ...
 *    ## 段永平
 *    ...
 *  返回 null 表示反解失败。
 */
function parseLegacyMd(mdPath: string): { judgeObj: any; judgeRaw: string; buffett: string; duan: string } | null {
  if (!existsSync(mdPath)) return null;
  let text: string;
  try {
    text = readFileSync(mdPath, "utf-8");
  } catch {
    return null;
  }

  // 1) 抓综合裁判 JSON（首个 ```json ... ``` 块）
  const judgeMatch = text.match(/##\s*综合裁判结论[\s\S]*?```json\s*([\s\S]*?)```/);
  if (!judgeMatch) return null;
  const judgeRaw = judgeMatch[1].trim();
  let judgeObj: any;
  try {
    judgeObj = JSON.parse(judgeRaw);
  } catch {
    return null;
  }

  // 2) 抓"## 巴菲特"段（到下一个一级 ## 但不是它的子标题为止；这里取到"## 段永平"前）
  // 简化：找 "## 巴菲特" 起，"## 段永平" 止
  const buffettStart = text.search(/^##\s*巴菲特\s*$/m);
  const duanStart = text.search(/^##\s*段永平\s*$/m);
  if (buffettStart < 0 || duanStart < 0 || duanStart < buffettStart) return null;
  const buffett = text.slice(buffettStart, duanStart).trim();
  const duan = text.slice(duanStart).trim();

  return { judgeObj, judgeRaw, buffett, duan };
}

ipcMain.handle("review", async (_event, htmlPath: string): Promise<{ ok: boolean; score?: number; level?: string; issues?: number; error?: string; mode?: "standard" | "legacy" }> => {
  try {
    if (!htmlPath || !existsSync(htmlPath)) {
      return { ok: false, error: "报告文件不存在" };
    }
    // 1) 优先走标准模式：找同目录 payload.json
    const payloadPath = htmlPath.replace(/\.html$/i, ".payload.json");
    let pack: any = null, buffett = "", duan = "", judgeRaw = "", judgeObj: any = null;
    let mode: "standard" | "legacy" = "standard";

    if (existsSync(payloadPath)) {
      const payload = JSON.parse(readFileSync(payloadPath, "utf-8"));
      pack = payload.pack;
      buffett = payload.buffett ?? "";
      duan = payload.duan ?? "";
      judgeRaw = payload.judgeRaw ?? "";
      judgeObj = payload.judgeObj;
      if (!pack || !judgeObj) {
        return { ok: false, error: "原始数据不完整" };
      }
    } else {
      // 2) 降级模式：从 .md 反解三段（DataPack 留空，complaint reviewer 只做逻辑/相关性审查）
      const mdPath = htmlPath.replace(/\.html$/i, ".md");
      const parsed = parseLegacyMd(mdPath);
      if (!parsed) {
        return {
          ok: false,
          error: "缺少原始数据 (payload.json) 且无法从 .md 反解；请重新点 '开始分析' 生成完整报告。",
        };
      }
      mode = "legacy";
      judgeObj = parsed.judgeObj;
      judgeRaw = parsed.judgeRaw;
      buffett = parsed.buffett;
      duan = parsed.duan;
      // DataPack 用空骨架，告诉 reviewer 只做逻辑/相关性审查
      pack = {
        code: judgeObj?.code ?? "",
        fetched_at: judgeObj?.as_of ?? "",
        sources: ["legacy-md（无原始 DataPack）"],
        profile: null,
        valuation: null,
        quote: null,
        financial: [],
        dividend: null,
        historicalPE: null,
        industryCompare: null,
      };
    }

    // 3) 调 reviewer
    const raw = await runReview({ data: pack, buffett, duan, judgeRaw, judgeObj });
    // 无论成功与否，先把 raw 落地一份给排错
    try {
      writeFileSync(htmlPath.replace(/\.html$/i, ".review.raw.txt"), raw ?? "", "utf-8");
    } catch {}
    let reviewObj: any = null;
    try {
      reviewObj = extractReviewJSON(raw);
    } catch (e: any) {
      // 解析失败 → 注入错误卡片（如果有占位符）；否则在 </body> 前 append
      try {
        const html = readFileSync(htmlPath, "utf-8");
        const errCard = renderReviewError(`复核员输出解析失败：${e?.message ?? "unknown"}`, new Date().toLocaleString("zh-CN"));
        const replaced = html.includes("REVIEW_SLOT_START")
          ? html.replace(/<!-- REVIEW_SLOT_START -->[\s\S]*?<!-- REVIEW_SLOT_END -->/, errCard)
          : html.replace(/<\/body>/i, `${errCard}\n</body>`);
        writeFileSync(htmlPath, replaced, "utf-8");
      } catch {}
      return { ok: false, mode, error: "复核输出解析失败（已保存原始输出至 .review.raw.txt）" };
    }

    // 4) 渲染卡片，替换 review-slot 占位符；旧 HTML 没占位符就 append 到 </body> 前
    const card = renderReviewCard(reviewObj, new Date().toLocaleString("zh-CN") + (mode === "legacy" ? "（降级模式：无 DataPack，事实核对受限）" : ""));
    const html = readFileSync(htmlPath, "utf-8");
    const replaced = html.includes("REVIEW_SLOT_START")
      ? html.replace(/<!-- REVIEW_SLOT_START -->[\s\S]*?<!-- REVIEW_SLOT_END -->/, card)
      : html.replace(/<\/body>/i, `${card}\n</body>`);
    writeFileSync(htmlPath, replaced, "utf-8");

    // 5) 把原始 review JSON 也存一份
    try {
      writeFileSync(htmlPath.replace(/\.html$/i, ".review.json"), JSON.stringify(reviewObj, null, 2), "utf-8");
    } catch {}

    return {
      ok: true,
      mode,
      score: Number(reviewObj.overall?.score ?? 0),
      level: String(reviewObj.overall?.level ?? ""),
      issues: Array.isArray(reviewObj.issues) ? reviewObj.issues.length : 0,
    };
  } catch (e: any) {
    console.error("[review]", e);
    return { ok: false, error: e?.message ?? "复核失败" };
  }
});

// === Lifecycle ===
app.whenReady().then(async () => {
  ensureSidecar(); // 后台拉起，不阻塞窗口
  createWindow();
  // 窗口就绪后，若缺 key，通知渲染层自动打开设置面板（不再用原生对话框阻塞）
  win?.webContents.once("did-finish-load", () => {
    if (IS_PACKAGED && !process.env.LLM_API_KEY && !process.env.LKEAP_API_KEY) {
      win?.webContents.send("config:needs-setup");
    }
  });
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  killSidecar();
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", killSidecar);
