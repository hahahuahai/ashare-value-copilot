#!/usr/bin/env node
// 一键自检：用 .env.providers.test 中填好 key 的 provider，并发探测 /chat/completions
// 用法：
//   1. 复制 .env.providers.test.example -> .env.providers.test，按需填 key
//   2. node scripts/verify-providers.mjs
//
// 只验证 OpenAI 兼容协议的 chat/completions 最小调用，发一句 "ping" 看 200/非 200。
// Anthropic / Gemini 原生协议不在本脚本范围（README 已说明走 OpenRouter / LiteLLM）。

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const ENV_FILE = path.join(ROOT, ".env.providers.test");
const ENV_EXAMPLE = path.join(ROOT, ".env.providers.test.example");

// === 13 家 provider 元数据（与 SettingsModal.tsx PROVIDERS 保持同步）===
const PROVIDERS = [
  { id: "lkeap-plan",  name: "LKEAP · Token Plan", baseUrl: "https://api.lkeap.cloud.tencent.com/plan/v3", defaultModel: "glm-5.1" },
  { id: "lkeap-std",   name: "LKEAP · 按量",        baseUrl: "https://api.lkeap.cloud.tencent.com/v1",      defaultModel: "deepseek-v3" },
  { id: "deepseek",    name: "DeepSeek 官方",       baseUrl: "https://api.deepseek.com/v1",                 defaultModel: "deepseek-chat" },
  { id: "dashscope",   name: "阿里 DashScope",       baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", defaultModel: "qwen-turbo" },
  { id: "zhipu",       name: "智谱 GLM",            baseUrl: "https://open.bigmodel.cn/api/paas/v4",        defaultModel: "glm-4-air" },
  { id: "moonshot",    name: "Moonshot Kimi",       baseUrl: "https://api.moonshot.cn/v1",                  defaultModel: "moonshot-v1-32k" },
  { id: "doubao",      name: "字节豆包",             baseUrl: "https://ark.cn-beijing.volces.com/api/v3",    defaultModel: "" /* 必须用户填 endpoint id */ },
  { id: "siliconflow", name: "硅基流动",             baseUrl: "https://api.siliconflow.cn/v1",               defaultModel: "Qwen/Qwen2.5-7B-Instruct" },
  { id: "openrouter",  name: "OpenRouter",          baseUrl: "https://openrouter.ai/api/v1",                defaultModel: "deepseek/deepseek-chat-v3" },
  { id: "ollama",      name: "Ollama 本地",          baseUrl: "http://127.0.0.1:11434/v1",                   defaultModel: "qwen2.5:14b" },
  { id: "openai",      name: "OpenAI",              baseUrl: "https://api.openai.com/v1",                   defaultModel: "gpt-4o-mini" },
  { id: "grok",        name: "xAI Grok",            baseUrl: "https://api.x.ai/v1",                         defaultModel: "grok-3-mini" },
];

// === 解析 .env.providers.test ===
function parseEnv(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const m = t.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[m[1]] = v;
  }
  return out;
}

function envKey(id, suffix) {
  return id.toUpperCase().replace(/-/g, "_") + "_" + suffix;
}

function ensureExampleFile() {
  if (fs.existsSync(ENV_EXAMPLE)) return;
  const lines = [
    "# 自检脚本读取本文件。复制为 .env.providers.test 后按需填 key。",
    "# 留空的 provider 会自动 skip，不会报错。",
    "# 可选：覆盖 default 探测模型，写 <ID>_MODEL=xxx",
    "",
  ];
  for (const p of PROVIDERS) {
    const k = envKey(p.id, "KEY");
    const m = envKey(p.id, "MODEL");
    lines.push(`# === ${p.name} ===`);
    lines.push(`# ${k}=`);
    lines.push(`# ${m}=${p.defaultModel || "<必填 endpoint id>"}`);
    lines.push("");
  }
  fs.writeFileSync(ENV_EXAMPLE, lines.join("\n"), "utf-8");
}

// === 单个 provider 探测 ===
async function probe(p, key, model) {
  const url = p.baseUrl.replace(/\/$/, "") + "/chat/completions";
  const body = JSON.stringify({
    model,
    messages: [{ role: "user", content: "ping" }],
    max_tokens: 5,
    stream: false,
  });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  const t0 = Date.now();
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body,
      signal: ctrl.signal,
    });
    const dur = Date.now() - t0;
    const text = await resp.text();
    if (!resp.ok) {
      // 截短错误信息
      const snippet = text.slice(0, 200).replace(/\s+/g, " ");
      return { ok: false, status: resp.status, dur, error: snippet };
    }
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      return { ok: false, status: resp.status, dur, error: "非 JSON 响应：" + text.slice(0, 100) };
    }
    const content = parsed?.choices?.[0]?.message?.content ?? "";
    return { ok: true, status: 200, dur, content: String(content).slice(0, 40) };
  } catch (e) {
    const dur = Date.now() - t0;
    if (e.name === "AbortError") return { ok: false, status: 0, dur, error: "超时(15s)" };
    return { ok: false, status: 0, dur, error: e.message || String(e) };
  } finally {
    clearTimeout(timer);
  }
}

// === 主流程 ===
async function main() {
  ensureExampleFile();
  if (!fs.existsSync(ENV_FILE)) {
    console.error("\x1b[33m[skip]\x1b[0m 未找到 " + ENV_FILE);
    console.error("       请复制 .env.providers.test.example 为 .env.providers.test 后填 key 再跑。");
    process.exit(1);
  }
  const env = parseEnv(fs.readFileSync(ENV_FILE, "utf-8"));

  // 选出有 key 的 provider
  const targets = [];
  const skipped = [];
  for (const p of PROVIDERS) {
    const key = env[envKey(p.id, "KEY")];
    const model = env[envKey(p.id, "MODEL")] || p.defaultModel;
    if (!key) {
      skipped.push(p);
      continue;
    }
    if (!model) {
      targets.push({ p, key, model: "", precheck: "缺 model（豆包必须填 endpoint id）" });
      continue;
    }
    targets.push({ p, key, model, precheck: null });
  }

  if (targets.length === 0) {
    console.error("\x1b[33m[skip]\x1b[0m " + ENV_FILE + " 里没有任何 *_KEY 被填。");
    process.exit(1);
  }

  console.log(`\n开始自检 ${targets.length} 家 provider（并发，每家 15s 超时）...\n`);

  const results = await Promise.all(
    targets.map(async (t) => {
      if (t.precheck) {
        return { ...t, result: { ok: false, status: 0, dur: 0, error: t.precheck } };
      }
      const result = await probe(t.p, t.key, t.model);
      return { ...t, result };
    })
  );

  // 输出表格
  const COL = { name: 22, model: 28, status: 8, dur: 7, info: 60 };
  const pad = (s, n) => {
    s = String(s ?? "");
    // 中文字符算 2 宽度近似
    let w = 0;
    let out = "";
    for (const ch of s) {
      const cw = /[\u4e00-\u9fa5\uff00-\uffef]/.test(ch) ? 2 : 1;
      if (w + cw > n) break;
      out += ch;
      w += cw;
    }
    return out + " ".repeat(Math.max(0, n - w));
  };
  console.log(
    pad("Provider", COL.name) +
      pad("Model", COL.model) +
      pad("Status", COL.status) +
      pad("Dur", COL.dur) +
      "Info"
  );
  console.log("-".repeat(COL.name + COL.model + COL.status + COL.dur + COL.info));
  for (const r of results) {
    const ok = r.result.ok;
    const tag = ok ? "\x1b[32m✓ PASS\x1b[0m" : "\x1b[31m✗ FAIL\x1b[0m";
    const info = ok ? `→ ${r.result.content}` : `${r.result.status || "-"} ${r.result.error || ""}`;
    console.log(
      pad(r.p.name, COL.name) +
        pad(r.model || "-", COL.model) +
        tag + "  " +
        pad(`${r.result.dur}ms`, COL.dur) +
        info.slice(0, COL.info)
    );
  }

  // 跳过列表
  if (skipped.length > 0) {
    console.log(`\n跳过（未填 key）：${skipped.map((p) => p.name).join(" / ")}`);
  }

  const failed = results.filter((r) => !r.result.ok).length;
  console.log(`\n完成。${results.length - failed} 通过 / ${failed} 失败 / ${skipped.length} 跳过。`);
  process.exit(failed > 0 ? 2 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
