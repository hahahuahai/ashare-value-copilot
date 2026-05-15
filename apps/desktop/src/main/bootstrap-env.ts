/**
 * 必须最先被 import，确保 .env 在任何业务模块（如 @vc/agents 的 llm.ts）
 * 顶层求值之前就已注入 process.env。
 *
 * 路径策略（dev vs packaged）：
 *  - dev:   编译后位置 apps/desktop/out/main/index.js → 上 4 层到 repo root
 *           prompts/services 在 repo 根；reports 写到 repo 根/reports
 *  - prod:  app.asar 是只读的；打包时通过 extraResources 把 prompts/services 拷到
 *           process.resourcesPath；reports 必须写到 userData/reports
 *
 * .env 顺序：repo根/.env（dev）→ userData/.env（prod 用户配置）→ 系统已有 process.env
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { app } from "electron";

const isPackaged = app.isPackaged;

// dev：从 out/main/index.js 上溯 4 层到仓库根
const devRepoRoot = resolve(__dirname, "..", "..", "..", "..");

// prod：资源根 = process.resourcesPath（extraResources 解压到这里）
//       用户数据根 = app.getPath("userData")
const resRoot = isPackaged ? process.resourcesPath : devRepoRoot;
const userRoot = isPackaged ? app.getPath("userData") : devRepoRoot;

// === .env 加载 ===
function loadEnvFile(envPath: string) {
  if (!existsSync(envPath)) return;
  const txt = readFileSync(envPath, "utf-8");
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}

// 优先 dev 仓库根 .env（开发期）
loadEnvFile(resolve(devRepoRoot, ".env"));
// 再加载 userData/.env（生产期用户填的 key）
if (isPackaged) loadEnvFile(resolve(userRoot, ".env"));

// 暴露给业务子模块（@vc/agents/prompts.ts 会用 VC_REPO_ROOT 找 prompts/）
if (!process.env.VC_REPO_ROOT) {
  process.env.VC_REPO_ROOT = resRoot;
}

// Desktop owns its data sidecar. Use a desktop-specific default port so a stale
// sidecar from an older portable package on 9876 cannot silently shadow new APIs.
if (!process.env.DATA_SIDECAR_URL) {
  const port = process.env.DATA_SIDECAR_PORT || "9877";
  process.env.DATA_SIDECAR_PORT = port;
  process.env.DATA_SIDECAR_URL = `http://127.0.0.1:${port}`;
}
if (!process.env.STOCK_LIST_CACHE_FILE) {
  process.env.STOCK_LIST_CACHE_FILE = resolve(userRoot, "stock-list-cache.json");
}

export const IS_PACKAGED = isPackaged;
export const RES_ROOT = resRoot; // prompts/services 等只读资源
export const USER_ROOT = userRoot; // reports/.env 等可写数据
// 兼容旧名字
export const REPO_ROOT = resRoot;
