/**
 * 加载大师的 system prompt。从仓库根 prompts/*.md 读取，保持单一真相源。
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

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

export type Master = "buffett" | "duan" | "judge" | "reviewer";

export async function loadPrompt(master: Master): Promise<string> {
  const path = resolve(ROOT, "prompts", `${master}.md`);
  return readFile(path, "utf-8");
}
