#!/usr/bin/env node
/**
 * value-council CLI — v0.2.0
 *   value-council ask <code>     例: value-council ask 600519
 *   value-council ping            探活边车
 *
 * 注意：.env 必须在 import @vc/agents 之前加载完毕（llm.ts 顶层会读 env）。
 * 因此我们用同步 fs + dynamic import 的两段式启动。
 */
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import kleur from "kleur";

// === Phase 1: 在 import 任何 @vc/* 之前，先把 .env 灌进 process.env ===
function loadEnvSync() {
  const path = resolve(process.cwd(), ".env");
  if (!existsSync(path)) return;
  const txt = readFileSync(path, "utf-8");
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}
loadEnvSync();

function safeFilePart(value: string): string {
  return String(value ?? "")
    .trim()
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

// === Phase 2: 现在才允许 import 业务模块 ===
const { buildDataPack, data } = await import("@vc/data");
const { runMaster } = await import("@vc/agents");
const { defaultEnabledMasterIds, getMaster } = await import("@vc/agents");

function help() {
  console.log(`
${kleur.bold("价投合伙人 · value-council")} ${kleur.dim("v0.2.0")}

${kleur.bold("用法:")}
  ${kleur.cyan("value-council ask <股票代码>")}     调用大师委员会分析一支 A 股
  ${kleur.cyan("value-council ping")}                探活数据边车

${kleur.bold("示例:")}
  pnpm ask 600519     # 贵州茅台
  pnpm ask 601318     # 中国平安
  pnpm ask 002415     # 海康威视

${kleur.bold("准备:")}
  1) ${kleur.dim("启动数据边车")}    pnpm sidecar
  2) ${kleur.dim("配置 LLM Key")}    复制 .env.example 为 .env 并填入
`);
}

async function cmdPing() {
  const ok = await data.health();
  if (ok) console.log(kleur.green("✓ 数据边车已就绪"), kleur.dim(process.env.DATA_SIDECAR_URL ?? "http://127.0.0.1:9876"));
  else console.log(kleur.red("✗ 数据边车未启动。先跑: pnpm sidecar"));
}

async function cmdAsk(code: string) {
  const input = code.trim();

  // 1. 探活
  if (!(await data.health())) {
    console.error(kleur.red("数据边车未启动。请先在另一个终端运行: pnpm sidecar"));
    process.exit(1);
  }

  const codeInInput = input.match(/\b(\d{6})\b/)?.[1];
  if (codeInInput) {
    code = codeInInput;
  } else {
    const found = await data.searchStocks(input);
    const first = found.rows?.[0];
    if (!first) {
      console.error(kleur.red(`未找到匹配的 A 股公司：${input}`));
      process.exit(1);
    }
    if ((found.rows?.length ?? 0) > 1) {
      const preview = found.rows.slice(0, 5).map((r: any) => `${r.code} ${r.name}`).join(" / ");
      console.log(kleur.dim(`匹配候选：${preview}`));
    }
    code = first.code;
    console.log(kleur.cyan(`已匹配：${first.code} ${first.name}`));
  }

  if (!/^\d{6}$/.test(code)) {
    console.error(kleur.red(`股票代码格式错误：${code}`), kleur.dim("应为 6 位数字，例如 600519"));
    process.exit(1);
  }

  // 2. 拉数据
  console.log(kleur.cyan("🔍 拉取数据..."), code);
  const pack = await buildDataPack(code);
  const directName = (pack.quote as any)?.name ?? (pack.profile as any)?.["股票简称"] ?? "";
  const name = directName || (await data.searchStocks(code).catch(() => null))?.rows?.find((r: any) => r.code === code)?.name || "";
  (pack as any).name = name;
  const displayName = name ? `${name} ${code}` : code;

  // 3. v0.2.0：循环跑所有默认启用的大师
  const enabledIds = defaultEnabledMasterIds();
  const results: { id: string; displayName: string; text: string }[] = [];

  for (const id of enabledIds) {
    const def = getMaster(id);
    const displayName = def?.displayName ?? id;
    console.log(kleur.cyan(`\n🧠 ${displayName}正在思考...`));
    const text = await runMaster({ master: id, data: pack });
    console.log("\n" + kleur.bold().yellow(`══ ${displayName} ══`));
    console.log(text);
    results.push({ id, displayName, text });
  }

  // 4. 落盘
  const date = new Date().toISOString().slice(0, 10);
  const dir = resolve(process.cwd(), "reports");
  await mkdir(dir, { recursive: true });
  const mdSections = results.map((r) => `## ${r.displayName}\n${r.text}`);
  const md = [
    `# ${displayName} · 价投合伙人报告`,
    ``,
    `> 生成于 ${pack.fetched_at}`,
    ``,
    `## 数据快照`,
    "```json",
    JSON.stringify({ valuation: pack.valuation, quote: pack.quote }, null, 2),
    "```",
    ``,
    ...mdSections,
    ``,
    `---`,
    `⚠️ 本报告仅用于研究辅助，不构成任何买卖建议。`,
  ].join("\n");
  const safeName = safeFilePart(name);
  const fileBase = safeName ? `${safeName}-${code}-${date}` : `${code}-${date}`;
  const path = resolve(dir, `${fileBase}.md`);
  await writeFile(path, md, "utf-8");
  console.log("\n" + kleur.green("✓ 报告已保存"), kleur.dim(path));
}

async function main() {
  const [, , cmd, arg] = process.argv;

  switch (cmd) {
    case "ask":
      if (!arg) { help(); process.exit(1); }
      await cmdAsk(arg);
      break;
    case "ping":
      await cmdPing();
      break;
    case undefined:
    case "-h":
    case "--help":
    case "help":
      help();
      break;
    default:
      console.error(kleur.red(`未知命令：${cmd}`));
      help();
      process.exit(1);
  }
}

main().catch((e) => {
  console.error(kleur.red("[fatal]"), e);
  process.exit(1);
});
