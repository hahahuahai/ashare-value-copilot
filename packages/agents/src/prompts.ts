/**
 * 加载大师/裁判/复核员的 system prompt。从仓库根 prompts/*.md 读取，保持单一真相源。
 *
 * v0.2.0 重构：
 *  - `Master` 由"buffett|duan|judge|reviewer" 联合类型，改成宽 string
 *    （任意 id 只要 prompts/<id>.md 存在就能加载），用 masters.ts 注册表做白名单
 *  - 新增 `loadMasterPrompt(id)` 别名，语义更清晰；`loadPrompt(id)` 保留以兼容已有调用
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { isMasterId } from "./masters.js";

// 优先使用宿主注入的 VC_REPO_ROOT（桌面端把本模块打进了 bundle，
// 用 import.meta.url 反推仓库根会失真）；否则回退到相对路径。
function resolveRoot(): string {
  if (process.env.VC_REPO_ROOT) return process.env.VC_REPO_ROOT;
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    // packages/agents/src -> 仓库根
    return resolve(__dirname, "..", "..", "..");
  } catch {
    return process.cwd();
  }
}

const ROOT = resolveRoot();

/**
 * Master 类型：任意大师 id（如 "buffett" / "lynch" / "marks"）+ 系统角色（"judge" / "reviewer"）。
 * 用 string 取代联合类型，避免每加一位大师都要改类型。校验由 isMasterId/系统角色白名单负责。
 */
export type Master = string;

const SYSTEM_ROLES = new Set(["judge", "reviewer"]);

export async function loadPrompt(id: Master): Promise<string> {
  if (!SYSTEM_ROLES.has(id) && !isMasterId(id)) {
    // 仍然尝试读文件（保留向后兼容/便于 ad-hoc 试新角色），但打印一条警告
    console.warn(`[prompts] loading unregistered prompt id "${id}"; consider adding it to masters.ts`);
  }
  const path = resolve(ROOT, "prompts", `${id}.md`);
  return readFile(path, "utf-8");
}

/** 语义更清晰的别名，与 loadPrompt 等价。 */
export const loadMasterPrompt = loadPrompt;
