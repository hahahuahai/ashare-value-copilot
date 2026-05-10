// 用现有 judge.txt 重新渲染一次报告，验证自检卡片/ROE 标签/股息 scheme 等改动
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const ROOT = path.resolve(process.cwd());
const REPORT_DIR = "C:/Users/admin/AppData/Roaming/@vc/desktop/reports";
const code = "600519";
const date = "2026-05-10";

const judgeTxt = fs.readFileSync(path.join(REPORT_DIR, `${code}-${date}.judge.txt`), "utf-8");
const judgeJson = JSON.parse(judgeTxt.replace(/^```json\s*/, "").replace(/```\s*$/, ""));

// 给 judge 注入 v0.1.8 新字段（模拟 LLM 已经按新 prompt 输出）
judgeJson.key_metrics.roe_avg_label = "ROE 6年均值";
judgeJson.key_metrics.ocf_avg_label = "经营现金流/净利润 6年均值";
judgeJson.key_metrics.dividend_yield_scheme = "中期 10 派 239.57 元 + 年末 10 派 279.93 元 = 合计 10 派 519.5 元";
// 模拟 latest_yield 已为合并后口径 3.71%
judgeJson.key_metrics.dividend_yield_pct = "3.71";

// 用真实 sidecar 拿 industry-compare
const indResp = execSync(`curl -sS "http://127.0.0.1:9876/industry-compare?code=${code}"`, { encoding: "utf-8" });
const ind = JSON.parse(indResp);

// 通过编译产物：渲染逻辑藏在 out/main/index.js 里，但没 export
// 改用 ts-node / tsx 直接 import 源码
process.exit(0);
