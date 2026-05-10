/**
 * v0.1.7 端到端验证脚本
 * 模拟 desktop 主进程的完整调用链：
 * buildDataPack → runMasterStream(buffett) → runMasterStream(duan) → runJudge → renderReportHTML
 *
 * 用法：
 *   pnpm tsx scripts/e2e-test.ts 601318
 *   pnpm tsx scripts/e2e-test.ts 601138
 *
 * 输出：reports/{code}-e2e-{date}.html + .judge.txt + .meta.json
 */
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// 加载 .env
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

const { buildDataPack, data } = await import("@vc/data");
const { runMasterStream, runJudge, extractJudgeJSON } = await import("@vc/agents");
// @ts-ignore — 桌面端编译产物或源码相对路径
const { renderReportHTML } = await import("../apps/desktop/src/main/render-report.js");

async function main() {
  const code = process.argv[2];
  if (!code || !/^\d{6}$/.test(code)) {
    console.error("用法：tsx scripts/e2e-test.ts <6位代码>");
    process.exit(1);
  }

  console.log(`\n=== ${code} 端到端验证开始 ===\n`);

  // 1. 探活
  if (!(await data.health())) {
    console.error("✗ sidecar 未启动");
    process.exit(1);
  }
  console.log("✓ sidecar 探活通过");

  // 2. 拉数据
  console.log("→ 拉取 DataPack...");
  const pack = await buildDataPack(code);
  console.log(`  ✓ profile._source=${(pack.profile as any)?._source}`);
  console.log(`  ✓ valuation._source=${(pack.valuation as any)?._source}`);
  console.log(`  ✓ industryCompare.matched=${(pack.industryCompare as any)?.matched?.name} (fallback=${(pack.industryCompare as any)?.matched_fallback})`);
  console.log(`  ✓ financial.rows=${(pack.financial as any)?.rows?.length ?? 0} 期`);
  console.log(`  ✓ historicalPE.series=${(pack.historicalPE as any)?.series?.length ?? 0} 点`);

  // 3. 巴菲特（流式 + completeMasterStream 容错）
  console.log("\n→ 调用巴菲特（流式 + 思考容错）...");
  let buffettAnswerLen = 0;
  let buffettThinkLen = 0;
  const buffett = await runMasterStream(
    { master: "buffett", data: pack },
    (delta, phase) => {
      if (phase === "answer") buffettAnswerLen += delta.length;
      else buffettThinkLen += delta.length;
    },
  );
  console.log(`  ✓ buffett 完成 (answer=${buffettAnswerLen} chars, thinking=${buffettThinkLen} chars)`);
  console.log(`  ✓ 输出含三段式标题: ${/第[零一二三]步/.test(buffett)}`);
  console.log(`  ✓ 输出含 PASS/FAIL/GRAY: ${/(PASS|FAIL|GRAY)/.test(buffett)}`);
  console.log(`  ✓ 是降级文本: ${buffett.startsWith("[模型仅返回思考过程")}`);

  // 4. 段永平
  console.log("\n→ 调用段永平...");
  const duan = await runMasterStream(
    { master: "duan", data: pack },
    () => {},
  );
  console.log(`  ✓ duan 完成 (${duan.length} chars)`);
  console.log(`  ✓ 输出含三段式标题: ${/第[零一二三]步/.test(duan)}`);

  // 5. Judge
  console.log("\n→ 调用 Judge...");
  const judgeRaw = await runJudge({ data: pack, buffett, duan });
  let judgeObj: any = null;
  try {
    judgeObj = extractJudgeJSON(judgeRaw);
  } catch (e) {
    console.error("  ✗ Judge JSON 解析失败:", e);
  }
  if (judgeObj) {
    console.log(`  ✓ judge.name=${judgeObj.name}`);
    console.log(`  ✓ judge.one_liner=${judgeObj.one_liner ? judgeObj.one_liner.slice(0, 50) + "..." : "(空)"}`);
    console.log(`  ✓ judge.scores: business=${judgeObj.scores?.business?.value}, company=${judgeObj.scores?.company?.value}, price=${judgeObj.scores?.price?.value}`);
    console.log(`  ✓ judge.key_metrics 字段数: ${Object.keys(judgeObj.key_metrics ?? {}).length}`);
    console.log(`  ✓ judge.key_metrics.pe_ttm=${judgeObj.key_metrics?.pe_ttm}`);
    console.log(`  ✓ judge.key_metrics.pb=${judgeObj.key_metrics?.pb}`);
    console.log(`  ✓ judge.key_metrics.roe_avg_5y=${judgeObj.key_metrics?.roe_avg_5y}`);
    console.log(`  ✓ judge.key_metrics.dividend_yield_pct=${judgeObj.key_metrics?.dividend_yield_pct}`);
    console.log(`  ✓ judge.key_metrics.industry_pe_median=${judgeObj.key_metrics?.industry_pe_median}`);
    console.log(`  ✓ judge.risks 数: ${(judgeObj.risks ?? []).length}`);
  }

  // 6. 渲染
  console.log("\n→ 渲染 HTML...");
  const html = renderReportHTML({
    judge: judgeObj ?? {},
    buffettMd: buffett,
    duanMd: duan,
    fetchedAt: pack.fetched_at,
    pe_series: (pack.historicalPE as any)?.series ?? [],
    industry_compare: pack.industryCompare,
    financial_rows: (pack.financial as any)?.rows ?? [],
    data_sources: {
      profile: (pack.profile as any)?._source,
      valuation: (pack.valuation as any)?._source,
      quote: (pack.quote as any)?._source,
      dividend: (pack.dividend as any)?._source,
      historicalPE: (pack.historicalPE as any)?._source,
      industryCompare: (pack.industryCompare as any)?._source,
      warnings: [],
    },
  });

  // 7. 保存
  const date = new Date().toISOString().slice(0, 10);
  const dir = resolve(process.cwd(), "reports");
  await mkdir(dir, { recursive: true });
  const htmlPath = resolve(dir, `${code}-e2e-${date}.html`);
  await writeFile(htmlPath, html, "utf-8");
  await writeFile(resolve(dir, `${code}-e2e-${date}.judge.txt`), judgeRaw, "utf-8");
  await writeFile(
    resolve(dir, `${code}-e2e-${date}.meta.json`),
    JSON.stringify({
      buffett_len: buffett.length,
      buffett_is_thinking_fallback: buffett.startsWith("[模型仅返回思考过程"),
      duan_len: duan.length,
      duan_is_thinking_fallback: duan.startsWith("[模型仅返回思考过程"),
      judge_obj: judgeObj,
      data_sources: {
        profile: (pack.profile as any)?._source,
        valuation: (pack.valuation as any)?._source,
        industryCompare: (pack.industryCompare as any)?._source,
        industry_matched: (pack.industryCompare as any)?.matched?.name,
        industry_fallback: (pack.industryCompare as any)?.matched_fallback,
      },
    }, null, 2),
    "utf-8",
  );
  console.log(`\n✓ 报告已保存: ${htmlPath}`);
  console.log(`✓ Judge 原文: ${code}-e2e-${date}.judge.txt`);
  console.log(`✓ 元信息: ${code}-e2e-${date}.meta.json`);
}

main().catch((e) => {
  console.error("[fatal]", e);
  process.exit(1);
});
