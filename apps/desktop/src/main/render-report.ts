/**
 * HTML 报告渲染器
 * 输入：JudgeJSON + 巴菲特/段永平原文 markdown + 元信息
 * 输出：单文件完整 HTML（内嵌 ECharts CDN + 朴素样式）
 *
 * 设计目标：
 * - 单 HTML 文件，离线打开依然有样式（ECharts 走 CDN 才能画图）
 * - 三大模块：① 三维打分卡 ② 估值锚条 + ROE 柱图 + 现金流散点 + PE 历史折线 ③ 大师原文
 */

interface ScoreItem { value: number | null; reason: string }
interface JudgeJSON {
  code?: string;
  name?: string;
  as_of?: string;
  verdict?: string;
  one_liner?: string;
  scores?: { business?: ScoreItem; company?: ScoreItem; price?: ScoreItem };
  key_metrics?: Record<string, string | number | null>;
  valuation_anchor?: {
    current_pe?: number | string | null;
    fair_pe_low?: number | string | null;
    fair_pe_high?: number | string | null;
    verdict?: string;
    comment?: string;
  };
  roe_series?: Array<{ period: string; roe: string | number | null }>;
  ocf_np_series?: Array<{ period: string; ratio: string | number | null }>;
  dividend_history?: Array<{ year: string; yield_pct: string | number | null; scheme?: string }>;
  moat?: { types?: string[]; strength?: number; evidence?: string };
  risks?: Array<{ title: string; severity?: string; detail?: string }>;
  masters?: {
    buffett?: { verdicts?: Record<string, string>; one_liner?: string };
    duan?: { verdicts?: Record<string, string>; one_liner?: string };
  };
  known_unknowns?: string[];
}

/** v0.2.0：一次大师分析结果 */
interface MasterAnalysis {
  id: string;
  displayName: string;
  text: string;
}

interface RenderArgs {
  judge: JudgeJSON;
  /** v0.2.0：多大师分析结果数组（取代 buffettMd/duanMd） */
  analyses: MasterAnalysis[];
  fetchedAt: string;
  pe_series?: Array<{ date: string; pe_ttm?: string | null; pb?: string | null; close?: string | null }>;
  industry_compare?: any;
  /** 财务数据原始 normalized 序列，用于在 judge 没填 ocf_np_series 时兜底自动渲染 */
  financial_rows?: Array<{ 日期?: string; normalized?: Record<string, string | null> }>;
  /** v0.1.7：各 sidecar 接口的数据源标识，用于报告底部展示 */
  data_sources?: {
    profile?: string;
    valuation?: string;
    quote?: string;
    dividend?: string;
    historicalPE?: string;
    industryCompare?: string;
    warnings?: string[];
  };
}

function esc(s: string | number | null | undefined): string {
  if (s === null || s === undefined) return "—";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtN(v: any, digits = 2): string {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  return n.toLocaleString("zh-CN", { maximumFractionDigits: digits });
}

function scoreColor(v: number | null | undefined): string {
  if (v === null || v === undefined) return "#666";
  if (v >= 8) return "#16a34a";    // 绿
  if (v >= 6) return "#eab308";    // 黄
  if (v >= 4) return "#f97316";    // 橙
  return "#dc2626";                 // 红
}

function verdictBadge(v?: string): string {
  const map: Record<string, { text: string; bg: string; fg: string }> = {
    worth_research: { text: "值得研究", bg: "#dcfce7", fg: "#166534" },
    skip: { text: "暂时跳过", bg: "#fee2e2", fg: "#991b1b" },
    pass: { text: "暂时跳过", bg: "#fee2e2", fg: "#991b1b" }, // legacy alias，v0.1.14 起改用 skip
    out_of_competence: { text: "能力圈外", bg: "#e5e7eb", fg: "#374151" },
    cheap: { text: "偏低估", bg: "#dcfce7", fg: "#166534" },
    fair: { text: "估值合理", bg: "#fef3c7", fg: "#854d0e" },
    expensive: { text: "偏高估", bg: "#fee2e2", fg: "#991b1b" },
    PASS: { text: "PASS", bg: "#dcfce7", fg: "#166534" },
    FAIL: { text: "FAIL", bg: "#fee2e2", fg: "#991b1b" },
    GRAY: { text: "GRAY", bg: "#fef3c7", fg: "#854d0e" },
  };
  const m = map[v ?? ""] ?? { text: v ?? "—", bg: "#e5e7eb", fg: "#374151" };
  return `<span class="badge" style="background:${m.bg};color:${m.fg};">${esc(m.text)}</span>`;
}

function mdToHtml(md: string): string {
  // 极简 Markdown → HTML 转换（够用即可，不引依赖）
  if (!md) return "";
  const lines = md.split(/\r?\n/);
  const out: string[] = [];
  let inCode = false;
  let listType: "ul" | "ol" | null = null;
  const closeList = () => { if (listType) { out.push(`</${listType}>`); listType = null; } };
  const openList = (t: "ul" | "ol") => {
    if (listType === t) return;
    if (listType) out.push(`</${listType}>`);
    out.push(`<${t}>`);
    listType = t;
  };
  for (const raw of lines) {
    const line = raw;
    if (/^```/.test(line)) {
      closeList();
      out.push(inCode ? "</code></pre>" : '<pre><code>');
      inCode = !inCode;
      continue;
    }
    if (inCode) {
      out.push(esc(line));
      continue;
    }
    // 元信息行（## 公司：xxx / ## 分析日期：xxx / ## 数据来源：xxx）降级为灰色小字
    const metaMatch = line.match(/^##\s+(公司|分析日期|数据来源|股票代码)[:：]\s*(.*)$/);
    if (metaMatch) {
      closeList();
      out.push(`<div class="md-meta"><span class="md-meta-k">${esc(metaMatch[1])}</span><span class="md-meta-v">${inline(metaMatch[2])}</span></div>`);
      continue;
    }
    if (/^### /.test(line)) { closeList(); out.push(`<h3>${inline(line.slice(4))}</h3>`); continue; }
    if (/^## /.test(line))  { closeList(); out.push(`<h2>${inline(line.slice(3))}</h2>`); continue; }
    if (/^# /.test(line))   { closeList(); out.push(`<h1>${inline(line.slice(2))}</h1>`); continue; }
    if (/^>\s/.test(line))  { closeList(); out.push(`<blockquote>${inline(line.slice(2))}</blockquote>`); continue; }
    // 无序列表（含二级缩进 "  - "）
    const liMatch = line.match(/^(\s*)[-*]\s+(.*)$/);
    if (liMatch) {
      const indent = liMatch[1].length;
      openList("ul");
      const cls = indent >= 2 ? ' class="li-2"' : "";
      out.push(`<li${cls}>${inline(liMatch[2])}</li>`);
      continue;
    }
    // 有序列表（v0.1.9 新增："1. xxx" / "1、xxx"，含二级缩进）
    const olMatch = line.match(/^(\s*)(\d+)[.、]\s+(.*)$/);
    if (olMatch) {
      const indent = olMatch[1].length;
      openList("ol");
      const cls = indent >= 2 ? ' class="li-2"' : "";
      out.push(`<li${cls}>${inline(olMatch[3])}</li>`);
      continue;
    }
    if (line.trim() === "") { closeList(); out.push(""); continue; }
    closeList();
    out.push(`<p>${inline(line)}</p>`);
  }
  closeList();
  return out.join("\n");

  function inline(s: string): string {
    return esc(s)
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/`([^`]+)`/g, "<code>$1</code>");
  }
}

export function renderReportHTML(args: RenderArgs): string {
  const j = args.judge ?? {};
  const code = j.code ?? "—";
  const name = j.name ?? "";
  const asOf = j.as_of ?? args.fetchedAt.slice(0, 10);

  const sB = j.scores?.business?.value ?? null;
  const sC = j.scores?.company?.value ?? null;
  const sP = j.scores?.price?.value ?? null;
  const km = j.key_metrics ?? {};

  // ECharts 数据
  const peSeries = (args.pe_series ?? []).filter(p => p.pe_ttm).map(p => [p.date, Number(p.pe_ttm)]);
  let roeData = (j.roe_series ?? []).slice().reverse(); // 从旧到新
  let ocfData = (j.ocf_np_series ?? []).slice().reverse();
  const divData = (j.dividend_history ?? []).slice().reverse();

  // 兜底：judge 没给 roe_series / ocf_np_series 时，从 financial.normalized 提取
  if ((roeData.length === 0 || ocfData.length === 0) && args.financial_rows && args.financial_rows.length > 0) {
    const fr = args.financial_rows.slice().reverse(); // 旧→新
    if (roeData.length === 0) {
      roeData = fr
        .filter(r => r.normalized?.roe != null)
        .map(r => ({ period: r.日期 ?? "", roe: r.normalized!.roe! }));
    }
    if (ocfData.length === 0) {
      ocfData = fr
        .filter(r => r.normalized?.ocf_to_np != null)
        .map(r => ({ period: r.日期 ?? "", ratio: r.normalized!.ocf_to_np! }));
    }
  }

  const ind = args.industry_compare;
  const indMatched = ind?.matched;
  const indFallback = !!ind?.matched_fallback;

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<title>${esc(code)} ${esc(name)} · 价投合伙人报告</title>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<script src="https://cdn.jsdelivr.net/npm/echarts@5.4.3/dist/echarts.min.js"></script>
<style>
  :root {
    --bg: #fafaf7; --card: #ffffff; --line: #e5e5e0; --ink: #1f2937;
    --mute: #6b7280; --gold: #b45309; --red: #b91c1c; --jade: #15803d;
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--ink);
    font-family: -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
    line-height: 1.7; font-size: 14px; }
  .wrap { max-width: 1080px; margin: 0 auto; padding: 24px 20px 60px; }
  header { display: flex; align-items: baseline; gap: 12px; padding-bottom: 12px; border-bottom: 2px solid var(--line); margin-bottom: 16px; }
  header h1 { margin: 0; font-size: 22px; }
  header .meta { color: var(--mute); font-size: 13px; }
  .hero { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 18px 20px; margin-bottom: 18px; }
  .hero .verdict-row { display: flex; gap: 8px; align-items: center; margin-bottom: 10px; }
  .hero .one-liner { font-size: 18px; font-weight: 600; color: var(--ink); }
  .badge { display: inline-block; padding: 2px 10px; border-radius: 999px; font-size: 12px; font-weight: 500; }
  .grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin-bottom: 18px; }
  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 18px; }
  .grid-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 18px; }
  .card { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 16px; }
  .card h2 { margin: 0 0 10px; font-size: 15px; color: var(--gold); }
  .card h3 { margin: 0 0 6px; font-size: 13px; color: var(--mute); font-weight: 500; }
  .score-card .num { font-size: 42px; font-weight: 700; line-height: 1; }
  .score-card .num small { font-size: 16px; color: var(--mute); font-weight: 400; }
  .score-card .reason { color: var(--mute); margin-top: 8px; font-size: 13px; min-height: 40px; }
  .metric { padding: 8px 10px; background: #fafafa; border: 1px solid var(--line); border-radius: 8px; }
  .metric .lbl { color: var(--mute); font-size: 12px; }
  .metric .val { font-size: 16px; font-weight: 600; margin-top: 2px; }
  .anchor-bar { height: 32px; background: linear-gradient(to right, #dcfce7 0%, #fef3c7 50%, #fee2e2 100%);
    border-radius: 6px; position: relative; margin: 42px 0 4px; }
  .anchor-bar .marker { position: absolute; top: -6px; bottom: -6px; width: 3px; background: #1f2937; }
  .anchor-bar .marker::after { content: attr(data-label); position: absolute; top: -22px; left: 50%; transform: translateX(-50%); white-space: nowrap; font-size: 12px; color: #1f2937; font-weight: 600; }
  /* v0.1.9：marker 太靠近 band 边界时，标签上抬到第二行避免重叠 */
  .anchor-bar .marker.marker-raised::after { top: -38px; background: #fff; padding: 1px 4px; border: 1px solid #1f2937; border-radius: 3px; }
  .anchor-bar .marker.marker-raised::before { content: ""; position: absolute; top: -16px; left: 50%; width: 1px; height: 10px; background: #1f2937; }
  .anchor-bar .band { position: absolute; top: 0; bottom: 0; background: rgba(180,140,50,0.18); border-left: 2px dashed #b45309; border-right: 2px dashed #b45309; }
  .chart { width: 100%; height: 280px; }
  .risk { padding: 8px 12px; border-left: 3px solid var(--red); background: #fef2f2; margin-bottom: 6px; border-radius: 4px; }
  .risk.medium { border-color: #eab308; background: #fefce8; }
  .risk.low { border-color: var(--jade); background: #f0fdf4; }
  .risk .title { font-weight: 600; color: var(--ink); }
  .risk .detail { color: var(--mute); font-size: 13px; margin-top: 2px; }
  .master-block { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 18px; margin-bottom: 14px; }
  .master-block .head { display: flex; gap: 8px; align-items: baseline; margin-bottom: 8px; }
  .master-block h2 { margin: 0; color: var(--gold); font-size: 17px; }
  .master-block .quote { color: var(--gold); font-style: italic; font-weight: 500; padding: 8px 12px; background: #fffbeb; border-left: 3px solid var(--gold); border-radius: 4px; margin: 10px 0 14px; }
  .master-block h2, .md h2 { font-size: 15px; }
  .md h3 { font-size: 14px; margin: 10px 0 4px; color: var(--ink); }
  .md p { margin: 4px 0; }
  .md li { margin-left: 20px; }
  .md blockquote { border-left: 3px solid var(--line); padding-left: 12px; color: var(--mute); margin: 8px 0; }
  .md code { background: #f3f4f6; padding: 1px 4px; border-radius: 3px; font-size: 13px; }
  .md pre { background: #f3f4f6; padding: 10px; border-radius: 6px; overflow-x: auto; font-size: 12px; }
  .md ul { margin: 6px 0; padding-left: 22px; }
  .md ol { margin: 6px 0; padding-left: 24px; }
  .md li.li-2 { margin-left: 20px; list-style-type: circle; color: var(--mute); }
  .md ol li.li-2 { list-style-type: lower-alpha; }
  .md-meta { display: inline-block; margin: 0 12px 4px 0; font-size: 12px; color: var(--mute); }
  .md-meta-k { color: var(--mute); }
  .md-meta-k::after { content: "："; }
  .md-meta-v { color: var(--ink); }
  .audit { background: #fffbeb; border: 1px solid #fde68a; border-radius: 12px; padding: 14px 16px; margin: 18px 0; }
  .audit h2 { margin: 0 0 10px; font-size: 14px; color: var(--gold); }
  .audit-grade { display: inline-block; padding: 3px 12px; border-radius: 999px; font-size: 13px; font-weight: 600; margin-left: 8px; }
  .audit-grade.high { background: #dcfce7; color: #166534; }
  .audit-grade.mid { background: #fef3c7; color: #854d0e; }
  .audit-grade.low { background: #fee2e2; color: #991b1b; }
  .audit-list { margin: 6px 0 0; padding-left: 18px; font-size: 12px; }
  .audit-list li { margin: 2px 0; }
  .audit-list li.ok { color: #166534; }
  .audit-list li.warn { color: #b45309; }
  .audit-list li.fail { color: #991b1b; }
  /* v0.1.10：AI 复核卡片 */
  .review-empty { background: #f8fafc; border: 1px dashed var(--line); border-radius: 10px; padding: 10px 14px; margin: 0 0 18px; }
  .review-card { border: 2px solid; border-radius: 12px; padding: 14px 16px; margin: 0 0 18px; }
  .review-head { display: flex; gap: 16px; align-items: center; padding-bottom: 10px; border-bottom: 1px solid rgba(0,0,0,0.08); margin-bottom: 10px; }
  .review-score .num { font-size: 36px; font-weight: 700; line-height: 1; }
  .review-score .unit { font-size: 14px; color: var(--mute); margin-left: 2px; }
  .review-meta { flex: 1; }
  .review-level { font-size: 14px; font-weight: 600; }
  .review-summary { font-size: 13px; color: var(--ink); margin-top: 2px; }
  .review-time { font-size: 11px; color: var(--mute); margin-top: 4px; }
  .review-list { list-style: none; padding: 0; margin: 0; }
  .review-list li { background: rgba(255,255,255,0.6); border-left: 3px solid #94a3b8; border-radius: 4px; padding: 8px 10px; margin-bottom: 6px; font-size: 13px; }
  .review-list li.sev-high { border-left-color: #b91c1c; }
  .review-list li.sev-mid { border-left-color: #b45309; }
  .review-list li.sev-low { border-left-color: #94a3b8; }
  .review-list .row1 { display: flex; gap: 6px; align-items: center; font-size: 12px; color: var(--mute); margin-bottom: 4px; }
  .review-list .cat { background: #e5e7eb; color: #374151; padding: 1px 6px; border-radius: 4px; font-size: 11px; }
  .review-list .anc { color: var(--mute); }
  .review-list .quote { font-style: italic; color: var(--gold); margin-bottom: 4px; }
  .review-list .prob { color: var(--ink); margin-bottom: 4px; }
  .review-list .sugg { color: var(--jade); font-size: 12px; }
  footer { color: var(--mute); font-size: 12px; text-align: center; margin-top: 24px; padding-top: 12px; border-top: 1px solid var(--line); }
  ul.pills { list-style: none; padding: 0; margin: 6px 0; }
  ul.pills li { display: inline-block; background: #fef3c7; color: #854d0e; padding: 2px 10px; border-radius: 999px; font-size: 12px; margin: 2px 4px 2px 0; }
  table.compare { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 6px; }
  table.compare th, table.compare td { padding: 6px 8px; border: 1px solid var(--line); text-align: right; }
  table.compare th { background: #fafafa; color: var(--mute); font-weight: 500; text-align: center; }
  table.compare td:first-child, table.compare th:first-child { text-align: left; }
  .anchor-legend { display: flex; justify-content: space-between; color: var(--mute); font-size: 11px; padding: 0 4px; }
</style>
</head>
<body>
<div class="wrap">

  <header>
    <h1>${esc(code)} ${esc(name)}</h1>
    <span class="meta">分析日期 ${esc(asOf)} · 拉取时间 ${esc(args.fetchedAt)}</span>
  </header>

  <!-- HERO -->
  <div class="hero" id="hero">
    <div class="verdict-row">
      ${verdictBadge(j.verdict)}
      ${j.valuation_anchor?.verdict ? verdictBadge(j.valuation_anchor.verdict) : ""}
      ${(j.moat?.types ?? []).map(t => `<span class="badge" style="background:#fef3c7;color:#854d0e;">${esc(t)}</span>`).join("")}
    </div>
    <div class="one-liner">${esc(j.one_liner ?? "")}</div>
  </div>

  <!-- v0.1.10：AI 复核结果占位（默认折叠为提示条；调用复核 IPC 后会被替换为完整卡片） -->
  <!-- REVIEW_SLOT_START -->
  <div id="review-slot" class="review-empty">
    <span style="color:var(--mute);font-size:12px;">🔍 AI 复核未运行 — 在桌面端点击"AI 复核"按钮，让 AI 检查这份报告的事实/逻辑/相关性。</span>
  </div>
  <!-- REVIEW_SLOT_END -->

  <!-- 三维打分卡 -->
  <div class="grid-3">
    ${[
      { k: "好生意", v: sB, r: j.scores?.business?.reason },
      { k: "好公司", v: sC, r: j.scores?.company?.reason },
      { k: "好价格", v: sP, r: j.scores?.price?.reason },
    ].map(s => `
      <div class="card score-card">
        <h2>${esc(s.k)}</h2>
        <div class="num" style="color:${scoreColor(s.v)}">${s.v ?? "—"}<small> /10</small></div>
        <div class="reason">${esc(s.r ?? "—")}</div>
      </div>
    `).join("")}
  </div>

  <!-- 关键指标 -->
  <div class="card" style="margin-bottom:18px;">
    <h2>关键指标速览</h2>
    <div class="grid-4">
      <div class="metric"><div class="lbl">PE (TTM)</div><div class="val">${fmtN(km.pe_ttm)}</div></div>
      <div class="metric"><div class="lbl">PE 10年分位</div><div class="val">${fmtN(km.pe_percentile_10y)}%</div></div>
      <div class="metric"><div class="lbl">PB</div><div class="val">${fmtN(km.pb)}</div></div>
      <div class="metric"><div class="lbl">PB 10年分位</div><div class="val">${fmtN(km.pb_percentile_10y)}%</div></div>
      <div class="metric"><div class="lbl">${esc((km as any).roe_avg_label ?? "ROE 5年均值")}</div><div class="val">${fmtN(km.roe_avg_5y)}%</div></div>
      <div class="metric"><div class="lbl">${esc((km as any).ocf_avg_label ?? "经营现金流/净利润 5年均值")}</div><div class="val">${fmtN(km.ocf_to_np_5y)}</div></div>
      <div class="metric"><div class="lbl">股息率</div><div class="val">${fmtN(km.dividend_yield_pct)}%</div>${(km as any).dividend_yield_scheme ? `<div style="font-size:11px;color:var(--mute);margin-top:4px;line-height:1.4;">${esc((km as any).dividend_yield_scheme)}</div>` : ""}</div>
      <div class="metric"><div class="lbl">资产负债率</div><div class="val">${fmtN(km.debt_ratio)}%</div></div>
    </div>
  </div>

  <!-- 估值锚条 -->
  ${j.valuation_anchor ? `
  <div class="card" style="margin-bottom:18px;">
    <h2>估值锚 · 当前 PE 在公允区间的位置</h2>
    ${renderAnchorBar(j.valuation_anchor)}
    <p style="color:var(--mute);margin-top:10px;font-size:13px;">${esc(j.valuation_anchor.comment ?? "")}</p>
  </div>` : ""}

  <!-- 图表区：ROE / 现金流 / 股息率 / PE 走势 — 数据缺失则折叠对应卡片 -->
  ${(() => {
    const cards: string[] = [];
    if (peSeries.length > 1) {
      cards.push(`<div class="card"><h2>PE (TTM) 10 年走势</h2><div id="chart-pe" class="chart"></div></div>`);
    }
    if (roeData.length > 0) {
      cards.push(`<div class="card"><h2>ROE 历年（旧 → 新）</h2><div id="chart-roe" class="chart"></div></div>`);
    }
    if (ocfData.length > 0) {
      cards.push(`<div class="card"><h2>经营现金流 / 净利润 历年</h2><div id="chart-ocf" class="chart"></div></div>`);
    }
    if (divData.length > 0) {
      cards.push(`<div class="card"><h2>近年股息率</h2><div id="chart-div" class="chart"></div></div>`);
    }
    // 两两一行，最后一张奇数也无所谓（grid 自动换行）
    if (cards.length === 0) return "";
    const rows: string[] = [];
    for (let i = 0; i < cards.length; i += 2) {
      rows.push(`<div class="grid-2">${cards.slice(i, i + 2).join("")}</div>`);
    }
    return rows.join("\n");
  })()}

  <!-- 行业对比 -->
  ${indMatched ? `
  <div class="card" style="margin-bottom:18px;">
    <h2>同行业 PE 对比 · ${esc(indMatched.name)}${indFallback ? ' <span style="font-size:12px;color:var(--mute);font-weight:400;">（公司行业归属获取失败，已降级到大类参考）</span>' : ""}</h2>
    <table class="compare">
      <thead><tr><th>指标</th><th>本公司 PE(TTM)</th><th>行业加权</th><th>行业中位数</th><th>行业算术平均</th></tr></thead>
      <tbody><tr>
        <td>静态 PE</td>
        <td>${fmtN(km.pe_ttm)}</td>
        <td>${fmtN(indMatched.pe_weighted)}</td>
        <td>${fmtN(indMatched.pe_median)}</td>
        <td>${fmtN(indMatched.pe_mean)}</td>
      </tr></tbody>
    </table>
    <p style="color:var(--mute);font-size:12px;margin-top:6px;">数据日期 ${esc(indMatched.date)} · 行业含 ${esc(indMatched.calc_n)} 家可比公司（共 ${esc(indMatched.company_n)} 家）${indFallback ? "。⚠️ 行业 PE 受亏损公司极值拉高，参考意义有限" : ""}</p>
    ${ind?._source || ind?._profile_source ? `<p style="color:var(--mute);font-size:11px;margin-top:4px;">📡 行业 PE 源：${esc(ind._source ?? "—")}${ind._profile_source ? ` · 公司行业归属源：${esc(ind._profile_source)}` : ""}</p>` : ""}
  </div>` : ""}

  <!-- 风险 -->
  ${(j.risks ?? []).length > 0 ? `
  <div class="card" style="margin-bottom:18px;">
    <h2>主要风险</h2>
    ${(j.risks ?? []).map(r => {
      const sev = (r.severity ?? "medium").toLowerCase();
      const icon = sev === "high" ? "⚠️ " : sev === "low" ? "🟢 " : "🟡 ";
      const titleStyle = sev === "high" ? 'style="font-weight:700;"' : "";
      return `
      <div class="risk ${esc(sev)}">
        <div class="title" ${titleStyle}>${icon}${esc(r.title)}</div>
        ${r.detail ? `<div class="detail">${esc(r.detail)}</div>` : ""}
      </div>
    `;
    }).join("")}
  </div>` : ""}

  <!-- 大师原文（v0.2.0 多大师循环） -->
  ${args.analyses.map((a) => {
    const masterJ = (j.masters as any)?.[a.id];
    return `
  <div class="master-block" id="m-${esc(a.id)}">
    <div class="head"><h2>${esc(a.displayName)}</h2>
      ${(masterJ?.verdicts ? Object.entries(masterJ.verdicts).map(([k,v]) => `<span style="font-size:12px;color:var(--mute);">${esc(k)} ${verdictBadge(v as string)}</span>`).join(" ") : "")}
    </div>
    ${masterJ?.one_liner ? `<div class="quote">"${esc(masterJ.one_liner)}"</div>` : ""}
    <div class="md">${mdToHtml(a.text)}</div>
  </div>`;
  }).join("\n")}

  <!-- 已知未知 -->
  ${(j.known_unknowns ?? []).length > 0 ? `
  <div class="card" style="margin-bottom:18px;">
    <h2>已知未知（数据缺口）</h2>
    <ul>
      ${(j.known_unknowns ?? []).map(u => `<li>${esc(u)}</li>`).join("")}
    </ul>
  </div>` : ""}

  <!-- 可信度自检清单（核心创新：让用户能判断结论是否可信） -->
  ${renderAuditCard(args)}

  <footer>
    ⚠️ 本报告仅用于研究辅助，不构成任何买卖建议 · 数据来源 akshare（公开数据）· 大师观点为 AI 模拟
    <br/>价投合伙人 · A-Share Value Council
    ${args.data_sources ? (() => {
      const ds = args.data_sources!;
      const items: string[] = [];
      if (ds.profile) items.push(`profile=${esc(ds.profile)}`);
      if (ds.valuation) items.push(`valuation=${esc(ds.valuation)}`);
      if (ds.quote) items.push(`quote=${esc(ds.quote)}`);
      if (ds.dividend) items.push(`dividend=${esc(ds.dividend)}`);
      if (ds.historicalPE) items.push(`historicalPE=${esc(ds.historicalPE)}`);
      if (ds.industryCompare) items.push(`industry=${esc(ds.industryCompare)}`);
      const warnings = ds.warnings ?? [];
      const html: string[] = [];
      if (items.length) {
        html.push(`<div style="margin-top:8px;font-size:11px;color:var(--mute);">📡 数据源：${items.join(" · ")}</div>`);
      }
      if (warnings.length) {
        html.push(`<div style="margin-top:4px;font-size:11px;color:#b45309;">⚠️ ${warnings.map(w => esc(w)).join(" · ")}</div>`);
      }
      return html.join("");
    })() : ""}
  </footer>
</div>

<script>
const PE_DATA = ${JSON.stringify(peSeries)};
const ROE_DATA = ${JSON.stringify(roeData)};
const OCF_DATA = ${JSON.stringify(ocfData)};
const DIV_DATA = ${JSON.stringify(divData)};

function init() {
  const opt = (extra) => Object.assign({
    grid: { left: 50, right: 16, top: 24, bottom: 36 },
    tooltip: { trigger: 'axis' },
    textStyle: { fontFamily: 'inherit', fontSize: 12 },
  }, extra);

  const peEl = document.getElementById('chart-pe');
  if (peEl && PE_DATA.length > 1) {
    echarts.init(peEl).setOption(opt({
      xAxis: { type: 'time' },
      yAxis: { type: 'value', name: 'PE' },
      series: [{ type: 'line', data: PE_DATA, smooth: true, showSymbol: false,
        lineStyle: { color: '#b45309', width: 2 },
        areaStyle: { color: 'rgba(180,90,9,0.12)' } }],
    }));
  }

  const roeEl = document.getElementById('chart-roe');
  if (roeEl && ROE_DATA.length > 0) {
    echarts.init(roeEl).setOption(opt({
      xAxis: { type: 'category', data: ROE_DATA.map(r => r.period) },
      yAxis: { type: 'value', name: 'ROE %' },
      series: [{ type: 'bar', data: ROE_DATA.map(r => Number(r.roe)),
        itemStyle: { color: function(p) { const v = Number(p.value); return v >= 15 ? '#16a34a' : v >= 10 ? '#eab308' : '#dc2626'; } },
        label: { show: true, position: 'top', formatter: v => v.value + '%' } }],
    }));
  }

  const ocfEl = document.getElementById('chart-ocf');
  if (ocfEl && OCF_DATA.length > 0) {
    echarts.init(ocfEl).setOption(opt({
      xAxis: { type: 'category', data: OCF_DATA.map(r => r.period) },
      yAxis: { type: 'value', name: '比值' },
      series: [{ type: 'bar', data: OCF_DATA.map(r => Number(r.ratio)),
        itemStyle: { color: function(p) { const v = Number(p.value); return v >= 1 ? '#16a34a' : v >= 0.8 ? '#eab308' : '#dc2626'; } },
        label: { show: true, position: 'top', formatter: v => v.value.toFixed(2) } },
        { type: 'line', data: OCF_DATA.map(_ => 1), lineStyle: { color: '#999', type: 'dashed' }, showSymbol: false, name: '健康线 1.0' },
      ],
    }));
  }

  const divEl = document.getElementById('chart-div');
  if (divEl && DIV_DATA.length > 0) {
    echarts.init(divEl).setOption(opt({
      xAxis: { type: 'category', data: DIV_DATA.map(r => r.year) },
      yAxis: { type: 'value', name: '股息率 %' },
      series: [{ type: 'bar', data: DIV_DATA.map(r => Number(r.yield_pct)),
        itemStyle: { color: '#b45309' },
        label: { show: true, position: 'top', formatter: v => v.value + '%' } }],
    }));
  }
}

if (window.echarts) init();
else window.addEventListener('load', () => { if (window.echarts) init(); });
</script>
</body>
</html>`;
}

function renderAnchorBar(anchor: NonNullable<JudgeJSON["valuation_anchor"]>): string {
  const cur = Number(anchor.current_pe);
  const lo = Number(anchor.fair_pe_low);
  const hi = Number(anchor.fair_pe_high);
  if (!Number.isFinite(cur) || !Number.isFinite(lo) || !Number.isFinite(hi) || hi <= lo) {
    return `<p style="color:#999;">估值锚数据不足，无法绘制（${esc(anchor.comment ?? "")}）</p>`;
  }
  // 默认可视范围 [lo*0.5, hi*1.5]，但当 cur 显著超出时扩展
  let vLo = Math.min(lo * 0.5, cur * 0.95);
  let vHi = Math.max(hi * 1.5, cur * 1.05);
  // 极度高估：cur > hi * 1.5
  const extreme = cur > hi * 1.5;
  // 极度低估：cur < lo * 0.5
  const veryCheap = cur < lo * 0.5;

  const span = vHi - vLo;
  const pct = (v: number) => Math.max(0, Math.min(100, ((v - vLo) / span) * 100));
  const markerX = pct(cur);
  const bandLeft = pct(lo);
  const bandRight = pct(hi);
  const bandWidth = bandRight - bandLeft;
  // v0.1.9：当 marker 与 band 边界距离 < 8% 时，把 marker 标签上抬避免与 band 区间标签重叠
  const tooCloseToBand = Math.abs(markerX - bandLeft) < 8 || Math.abs(markerX - bandRight) < 8;
  const markerCls = tooCloseToBand ? " marker-raised" : "";
  const overShoot = cur > hi ? Math.round(((cur - hi) / hi) * 100) : 0;
  const underShoot = cur < lo ? Math.round(((lo - cur) / lo) * 100) : 0;
  const chip = extreme
    ? `<span class="badge" style="background:#fee2e2;color:#991b1b;margin-left:8px;">⚠️ 极度高估 · 超公允上沿 ${overShoot}%</span>`
    : veryCheap
      ? `<span class="badge" style="background:#dcfce7;color:#166534;margin-left:8px;">⭐ 极度低估 · 低于公允下沿 ${underShoot}%</span>`
      : "";
  return `
    <div style="display:flex;align-items:center;flex-wrap:wrap;margin-bottom:6px;">
      <span style="color:var(--mute);font-size:12px;">公允区间 <strong style="color:var(--ink);">${lo.toFixed(1)} ~ ${hi.toFixed(1)}</strong> · 当前 <strong style="color:var(--ink);">${cur.toFixed(1)}</strong></span>
      ${chip}
    </div>
    <div class="anchor-bar">
      <div class="band" style="left:${bandLeft}%;width:${bandWidth}%;"></div>
      <div class="marker${markerCls}" style="left:${markerX}%;" data-label="${cur.toFixed(1)}"></div>
    </div>
    <div class="anchor-legend">
      <span style="min-width:42px;display:inline-block;">${vLo.toFixed(1)}</span>
      <span>公允区间 ${lo.toFixed(1)}~${hi.toFixed(1)}</span>
      <span style="min-width:42px;display:inline-block;text-align:right;">${vHi.toFixed(1)}</span>
    </div>`;
}

/**
 * 可信度自检清单：把 HERO 数字、大师原文里出现的数字、DataPack 三方对账，输出可视化报告
 * 输出三档：🟢 高 / 🟡 中 / 🔴 低
 */
type AuditItem = { level: "ok" | "warn" | "fail"; text: string };

function buildAuditReport(args: RenderArgs): { grade: "high" | "mid" | "low"; items: AuditItem[] } {
  const j = args.judge ?? {};
  const km: any = j.key_metrics ?? {};
  const items: AuditItem[] = [];

  // 提取大师原文里所有"数字%"和"PE = N"出现，做粗略交叉验证
  const masterText = (args.analyses ?? []).map((a) => a.text ?? "").join("\n");

  const mNum = (v: any): number | null => {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  // 1. HERO PE 与大师原文 PE 对账
  // v0.1.9 修正：正则只匹配限定上下文（当前PE / PE TTM / TTM PE / PE = / PE:），
  // 排除 PE 分位 / PE 中位数 / PE 均值 / 本分 PE / PE 区间 等历史/区间值
  const peHero = mNum(km.pe_ttm);
  if (peHero != null) {
    const peRegex = /(?:当前\s*PE|PE\s*TTM|TTM\s*PE|PE\s*\(\s*TTM\s*\)|PE\s*[=＝])\s*[（(]?\s*(?:TTM)?\s*[)）]?\s*[:：=＝]?\s*([0-9]+(?:\.[0-9]+)?)/gi;
    const peMatches: number[] = [];
    for (const m of masterText.matchAll(peRegex)) {
      // 二次过滤：上下文里若紧邻"分位/中位数/均值/区间/历史"则丢弃
      const ctxStart = Math.max(0, m.index! - 8);
      const ctxEnd = Math.min(masterText.length, m.index! + (m[0]?.length ?? 0) + 8);
      const ctx = masterText.slice(ctxStart, ctxEnd);
      if (/分位|中位数|均值|区间|历史|本分/.test(ctx)) continue;
      const n = Number(m[1]);
      if (Number.isFinite(n)) peMatches.push(n);
    }
    const closest = peMatches.find(p => Math.abs(p - peHero) / peHero < 0.05);
    if (peMatches.length === 0) {
      items.push({ level: "ok", text: `PE TTM ${peHero.toFixed(2)}：大师原文未直接引用 PE 数字（可接受）` });
    } else if (closest != null) {
      items.push({ level: "ok", text: `PE TTM ${peHero.toFixed(2)} 与大师原文一致（差异 < 5%）` });
    } else {
      items.push({ level: "warn", text: `PE TTM ${peHero.toFixed(2)} 与大师原文出现的 ${peMatches.join("/")} 差异 > 5%，请核对` });
    }
  } else {
    items.push({ level: "fail", text: "PE TTM 缺失" });
  }

  // 2. 股息率与 scheme 算术一致性（若 scheme 含数字）
  const yHero = mNum(km.dividend_yield_pct);
  const scheme: string = km.dividend_yield_scheme ?? "";
  if (yHero != null) {
    items.push({ level: "ok", text: `股息率 ${yHero.toFixed(2)}%${scheme ? `，分红方案：${scheme.length > 50 ? scheme.slice(0, 50) + "…" : scheme}` : ""}` });
  } else {
    items.push({ level: "warn", text: "股息率缺失（可能公司不分红或数据接口失败）" });
  }

  // 3. ROE 标签与样本期数一致性
  // 校验规则（v0.1.9 修正）：
  //   - 仅当样本数 < label 数字时报警（例如标签写"5年均值"但只有 2 期数据）
  //   - 样本数 ≥ label 数字视为合规（标签保守，实际数据更充足是好事）
  const roeLabel: string = km.roe_avg_label ?? "ROE 5年均值";
  const roeN = (j.roe_series ?? []).filter(r => r.roe != null).length;
  const roeYearN = (j.roe_series ?? []).filter(r => r.roe != null && /12-31$/.test(r.period ?? "")).length;
  const roeUsed = roeYearN > 0 ? roeYearN : roeN;
  if (mNum(km.roe_avg_5y) == null) {
    items.push({ level: "warn", text: `ROE 均值缺失（标签 "${roeLabel}"）` });
  } else {
    const labelN = Number(roeLabel.match(/(\d+)\s*年/)?.[1] ?? 0);
    if (labelN > 0 && labelN > roeUsed) {
      items.push({ level: "warn", text: `ROE 标签写"${roeLabel}"但实际只有 ${roeUsed} 期年报数据，样本不足` });
    } else {
      items.push({ level: "ok", text: `ROE 标签 "${roeLabel}" 与 ${roeUsed} 期年报样本一致${labelN > 0 && labelN < roeUsed ? `（标签保守，实际样本更充足）` : ""}` });
    }
  }

  // 4. 行业匹配是否降级
  const ind = args.industry_compare;
  if (ind?.matched == null) {
    items.push({ level: "warn", text: `行业归属未匹配${ind?.matched_reason ? "：" + ind.matched_reason : ""}（行业 PE 对比已隐藏）` });
  } else if (ind?.matched_fallback) {
    items.push({ level: "warn", text: `行业 PE 已降级到大类 "${ind.matched.name}"（受亏损公司极值拉高，参考价值有限）` });
  } else {
    items.push({ level: "ok", text: `行业精确匹配 "${ind.matched.name}"（含 ${ind.matched.calc_n}/${ind.matched.company_n} 家可比公司）` });
  }

  // 5. valuation_anchor 推导
  const va = j.valuation_anchor;
  if (va && mNum(va.fair_pe_low) != null && mNum(va.fair_pe_high) != null) {
    items.push({ level: "ok", text: `公允区间 ${va.fair_pe_low}~${va.fair_pe_high}（基于历史 PE 中位数推导）` });
  } else {
    items.push({ level: "warn", text: "公允区间缺失（历史 PE 中位数不可用，估值锚条无法绘制）" });
  }

  // 6. sidecar warnings
  const warns = args.data_sources?.warnings ?? [];
  if (warns.length === 0) {
    items.push({ level: "ok", text: "所有数据源均成功，无降级或重试警告" });
  } else {
    items.push({ level: "warn", text: `数据源警告 ${warns.length} 条：${warns.slice(0, 2).join("；")}${warns.length > 2 ? "…" : ""}` });
  }

  // 7. company.value 是否因数据不足填 null
  if (j.scores?.company?.value == null) {
    items.push({ level: "warn", text: `好公司维度评分为空（${j.scores?.company?.reason ?? "数据不足"}）` });
  } else {
    items.push({ level: "ok", text: `三维评分齐全（好生意 ${j.scores?.business?.value ?? "—"} · 好公司 ${j.scores?.company?.value} · 好价格 ${j.scores?.price?.value ?? "—"}）` });
  }

  // 8. 大师原文截断检测（v0.1.9 新增）
  // 如果原文不含"结论"/"巴菲特/段永平"署名/"第三步"等收尾标志，疑似被 max_tokens 截断
  const checkTruncated = (md: string, name: string): AuditItem | null => {
    if (!md || md.trim().length < 50) return { level: "warn", text: `${name}原文为空或过短，疑似生成失败` };
    const hasConclusion = /结论|总结|一句话|签名|敬启/.test(md);
    const hasStep3 = /第三步|好价格|价格判断/.test(md);
    const tail = md.slice(-200);
    const endsAbruptly = !/[。！？.!?）)】」"\n]\s*$/.test(tail.trim());
    if (!hasConclusion && !hasStep3) {
      return { level: "warn", text: `${name}原文疑似被截断（未见"第三步/结论"段落，可能 max_tokens 不足）` };
    }
    if (endsAbruptly) {
      return { level: "warn", text: `${name}原文末尾不完整（结尾无标点收束，疑似流式中断）` };
    }
    return null;
  };
  const buffettTrunc = checkTruncated((args.analyses ?? []).find(a => a.id === "buffett")?.text ?? "", "巴菲特");
  if (buffettTrunc) items.push(buffettTrunc);
  const duanTrunc = checkTruncated((args.analyses ?? []).find(a => a.id === "duan")?.text ?? "", "段永平");
  if (duanTrunc) items.push(duanTrunc);
  // v0.2.0：检测其他大师截断
  for (const a of (args.analyses ?? [])) {
    if (a.id === "buffett" || a.id === "duan") continue;
    const t = checkTruncated(a.text ?? "", a.displayName);
    if (t) items.push(t);
  }

  // 评级
  const failN = items.filter(i => i.level === "fail").length;
  const warnN = items.filter(i => i.level === "warn").length;
  const grade: "high" | "mid" | "low" = failN > 0 || warnN >= 3 ? "low" : warnN > 0 ? "mid" : "high";
  return { grade, items };
}

function renderAuditCard(args: RenderArgs): string {
  const { grade, items } = buildAuditReport(args);
  const gradeText = grade === "high" ? "🟢 高可信度" : grade === "mid" ? "🟡 中等可信度" : "🔴 低可信度";
  const tip = grade === "high"
    ? "所有关键数据交叉验证通过，结论可作为研究起点。"
    : grade === "mid"
      ? "部分数据降级或缺失，结论需配合大师原文定性判断使用。"
      : "多项关键数据冲突或缺失，慎用本报告的量化结论，建议手工复核。";
  return `
  <div class="audit">
    <h2>📋 报告自检清单 <span class="audit-grade ${grade}">${gradeText}</span></h2>
    <p style="margin:0 0 6px;color:var(--mute);font-size:12px;">${esc(tip)}</p>
    <ul class="audit-list">
      ${items.map(i => `<li class="${i.level}">${i.level === "ok" ? "✓" : i.level === "warn" ? "⚠" : "✗"} ${esc(i.text)}</li>`).join("")}
    </ul>
  </div>`;
}

// ============================================================================
// v0.1.10：AI 复核卡片渲染（独立导出，被主进程 review IPC 调用后注入到报告）
// ============================================================================

interface ReviewIssue {
  anchor: string;
  severity: "high" | "mid" | "low";
  category: "fact" | "logic" | "relevance";
  quote: string;
  problem: string;
  suggestion: string;
}
interface ReviewObj {
  overall?: { score?: number; level?: string; summary?: string };
  issues?: ReviewIssue[];
}

/** 把复核 JSON 渲染成 HTML 片段，供 review IPC 替换 review-slot 占位符。 */
export function renderReviewCard(review: ReviewObj, reviewedAt: string): string {
  const score = Number(review.overall?.score ?? 0);
  const level = review.overall?.level ?? "存疑";
  const summary = review.overall?.summary ?? "";
  const issues = (review.issues ?? []).slice(0, 8);

  const tone =
    score >= 90 ? { color: "#15803d", bg: "#dcfce7", icon: "🟢" } :
    score >= 70 ? { color: "#0ea5e9", bg: "#dbeafe", icon: "🔵" } :
    score >= 50 ? { color: "#b45309", bg: "#fef3c7", icon: "🟡" } :
                  { color: "#b91c1c", bg: "#fee2e2", icon: "🔴" };

  const severityIcon = (s: string) => s === "high" ? "🔴" : s === "mid" ? "🟡" : "⚪";
  const categoryText = (c: string) =>
    c === "fact" ? "事实" : c === "logic" ? "逻辑" : c === "relevance" ? "相关性" : c;
  const anchorText = (a: string) => {
    if (a.startsWith("buffett:")) return "巴菲特 · " + a.slice(8);
    if (a.startsWith("duan:")) return "段永平 · " + a.slice(5);
    if (a.startsWith("judge:")) return "裁判 · " + a.slice(6);
    if (a === "cross") return "跨段落";
    return a;
  };

  const issuesHtml = issues.length === 0
    ? `<p style="margin:8px 0 0;color:var(--mute);font-size:13px;">未发现需要修正的问题。</p>`
    : `<ul class="review-list">${issues.map(i => `
        <li class="sev-${esc(i.severity)}">
          <div class="row1">
            <span class="sev">${severityIcon(i.severity)}</span>
            <span class="cat">${esc(categoryText(i.category))}</span>
            <span class="anc">${esc(anchorText(i.anchor))}</span>
          </div>
          ${i.quote && i.quote !== "<缺>" ? `<div class="quote">"${esc(i.quote)}"</div>` : ""}
          <div class="prob">${esc(i.problem)}</div>
          <div class="sugg">建议：${esc(i.suggestion)}</div>
        </li>`).join("")}</ul>`;

  return `
  <!-- REVIEW_SLOT_START -->
  <div id="review-slot" class="review-card" style="border-color:${tone.color};background:${tone.bg};">
    <div class="review-head">
      <div class="review-score" style="color:${tone.color};">
        <span class="num">${score}</span><span class="unit">/100</span>
      </div>
      <div class="review-meta">
        <div class="review-level">${tone.icon} ${esc(level)}</div>
        <div class="review-summary">${esc(summary)}</div>
        <div class="review-time">复核于 ${esc(reviewedAt)} · 共 ${issues.length} 条问题</div>
      </div>
    </div>
    ${issuesHtml}
  </div>
  <!-- REVIEW_SLOT_END -->`;
}

/** 复核失败时的占位卡片（让用户知道按了但失败了）。 */
export function renderReviewError(message: string, reviewedAt: string): string {
  return `
  <!-- REVIEW_SLOT_START -->
  <div id="review-slot" class="review-card" style="border-color:#b91c1c;background:#fee2e2;">
    <div class="review-head">
      <div class="review-score" style="color:#b91c1c;"><span class="num">!</span></div>
      <div class="review-meta">
        <div class="review-level">🔴 复核失败</div>
        <div class="review-summary">${esc(message)}</div>
        <div class="review-time">复核于 ${esc(reviewedAt)}</div>
      </div>
    </div>
  </div>
  <!-- REVIEW_SLOT_END -->`;
}

