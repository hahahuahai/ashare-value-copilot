import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const REPORT_DIR = "C:/Users/admin/AppData/Roaming/@vc/desktop/reports";
const code = "600519";
const date = "2026-05-10";

// 动态 import 让 tsx 帮我们转译
const mod: any = await import(pathToFileURL(path.resolve("apps/desktop/src/main/render-report.ts")).href);
const renderReportHTML = mod.renderReportHTML;

const judgeTxt = fs.readFileSync(path.join(REPORT_DIR, `${code}-${date}.judge.txt`), "utf-8");
const judgeJson: any = JSON.parse(judgeTxt.replace(/^```json\s*/, "").replace(/```\s*$/, ""));

// 模拟 v0.1.8 LLM 新输出字段
judgeJson.key_metrics.roe_avg_label = "ROE 6年均值";
judgeJson.key_metrics.ocf_avg_label = "经营现金流/净利润 6年均值";
judgeJson.key_metrics.dividend_yield_scheme = "中期 10 派 239.57 元 + 年末 10 派 279.93 元 = 合计 10 派 519.5 元";
judgeJson.key_metrics.dividend_yield_pct = "3.71";

const buffettMd = fs.readFileSync(path.join(REPORT_DIR, `${code}-${date}.md`), "utf-8");
// 文件里巴菲特/段永平合在一份 md 里，直接传整份给两边演示
const indResp = execSync(`curl -sS "http://127.0.0.1:9876/industry-compare?code=${code}"`, { encoding: "utf-8" });
const ind = JSON.parse(indResp);

const html = renderReportHTML({
  judge: judgeJson,
  buffettMd,
  duanMd: buffettMd,
  fetchedAt: "2026-05-10 16:26:00",
  pe_series: [],
  industry_compare: ind,
  financial_rows: [],
  data_sources: {
    profile: "em",
    valuation: "em",
    quote: "em",
    dividend: "em:stock_fhps_detail_em",
    historicalPE: "lg",
    industryCompare: "cninfo",
    warnings: [],
  },
});

const out = path.join(REPORT_DIR, `${code}-${date}-v018-test.html`);
fs.writeFileSync(out, html, "utf-8");
console.log("OUT:", out);
