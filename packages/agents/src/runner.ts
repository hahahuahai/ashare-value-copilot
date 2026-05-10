/**
 * MVP Agent runner：单轮调用。
 * 思路：
 *   1. 工具先跑（数据已经在 DataPack 里）
 *   2. 把 DataPack 作为 user 消息塞入，明确告诉 LLM "所有数字只能用这里的"
 *   3. system prompt 从 prompts/*.md 读取
 *   4. 不做工具回调（MVP 阶段），未来 W3 加入 tool_calls 让 Agent 主动取数
 */
import type { DataPack } from "@vc/data";
import {
  complete,
  completeStream,
  completeMasterStream,
  type CompletionMeta,
} from "./llm.js";
import { loadPrompt, type Master } from "./prompts.js";

export type { CompletionMeta } from "./llm.js";

export interface MasterResult {
  text: string;
  meta: CompletionMeta;
}

export interface RunArgs {
  master: Master;
  data: DataPack;
}

function buildMessages(_master: Master, data: DataPack, system: string) {
  const userMsg = [
    `# 待分析对象`,
    `股票代码：${data.code}`,
    `数据获取时间：${data.fetched_at}`,
    `数据来源：${data.sources.join(", ")}`,
    "",
    `# 你能用的全部数据（JSON）`,
    "```json",
    JSON.stringify(
      {
        profile: data.profile,
        valuation: data.valuation,
        quote: data.quote,
        financial: data.financial,
        dividend: data.dividend,
        historicalPE: data.historicalPE,
        industryCompare: data.industryCompare,
      },
      null,
      2,
    ),
    "```",
    "",
    `# 强制约束`,
    `- 你只能引用上面 JSON 里出现过的数字。任何其他数字都视为幻觉。`,
    `- 没有的数据请明确写"我没有这个数据"，并放进"我不知道的部分"。`,
    `- 严格按 system prompt 中规定的输出格式（含三段式 PASS/FAIL/GRAY）。`,
    `- 中文输出，A 股语境，禁用"买卖建议"。`,
  ].join("\n");

  return [
    { role: "system" as const, content: system },
    { role: "user" as const, content: userMsg },
  ];
}

export async function runMaster({ master, data }: RunArgs): Promise<string> {
  const system = await loadPrompt(master);
  // v0.1.15：非流式也用 16384 统一预算（默认 currentMaxTokens 已调至 16384）
  return complete(buildMessages(master, data, system), {
    temperature: 0.3,
    maxTokens: 16384,
  });
}

/** 流式版：onChunk 收到 phase=thinking|answer 的增量。
 *  使用 completeMasterStream 以容错"流式只回 reasoning"的思考型模型。
 *  v0.1.15：
 *   - 统一 maxTokens=16384（之前 8192 仍有被 reasoning 吃爆风险）
 *   - 返回 { text, meta }，meta 携带 finish_reason/truncated/retried_* 供上层落盘 */
export async function runMasterStream(
  { master, data }: RunArgs,
  onChunk: (delta: string, phase: "thinking" | "answer") => void,
): Promise<MasterResult> {
  const system = await loadPrompt(master);
  return completeMasterStream(buildMessages(master, data, system), onChunk, {
    temperature: 0.3,
    maxTokens: 16384,
    agentName: master,
  });
}

/** 综合裁判：吃 DataPack + 巴菲特原文 + 段永平原文，吐出 JSON 打分卡。 */
export async function runJudge(args: {
  data: DataPack;
  buffett: string;
  duan: string;
}): Promise<string> {
  const system = await loadPrompt("judge");
  const userMsg = [
    `# 待汇总对象`,
    `股票代码：${args.data.code}`,
    `数据获取时间：${args.data.fetched_at}`,
    "",
    `# DataPack（唯一数字来源）`,
    "```json",
    JSON.stringify(
      {
        profile: args.data.profile,
        valuation: args.data.valuation,
        quote: args.data.quote,
        financial: args.data.financial,
        dividend: args.data.dividend,
        historicalPE: args.data.historicalPE,
        industryCompare: args.data.industryCompare,
      },
      null,
      2,
    ),
    "```",
    "",
    `# 巴菲特的论述`,
    args.buffett,
    "",
    `# 段永平的论述`,
    args.duan,
    "",
    `# 强制要求`,
    `- 严格按 system prompt 的 JSON Schema 输出，外层用 \`\`\`json 包裹。`,
    `- 不许输出 JSON 之外的任何文字。`,
    `- 数字缺失填 null。`,
  ].join("\n");

  return complete(
    [
      { role: "system" as const, content: system },
      { role: "user" as const, content: userMsg },
    ],
    { temperature: 0.1, maxTokens: 16384 },
  );
}

// ============================================================================
// v0.1.10：AI 复核员（Reviewer）—— 对已生成的报告做事实/逻辑/相关性审查
// ============================================================================

export interface ReviewIssue {
  anchor: string;
  severity: "high" | "mid" | "low";
  category: "fact" | "logic" | "relevance";
  quote: string;
  problem: string;
  suggestion: string;
}

export interface ReviewJSON {
  overall: { score: number; level: string; summary: string };
  issues: ReviewIssue[];
}

/** 复核员：吃 DataPack + 三段输出，吐出可信度评分 + 问题清单 JSON 字符串。
 *  改用流式调用：思考型模型在非流式下经常只回 reasoning_content，
 *  completeStream 内有非流式重试兜底，能拿到完整 content。 */
export async function runReview(args: {
  data: DataPack;
  buffett: string;
  duan: string;
  judgeRaw: string;
  judgeObj: any;
}): Promise<string> {
  const system = await loadPrompt("reviewer");
  const userMsg = [
    `# 待复核报告对象`,
    `股票代码：${args.data.code}`,
    `数据获取时间：${args.data.fetched_at}`,
    "",
    `# DataPack（唯一数字真相源）`,
    "```json",
    JSON.stringify(
      {
        profile: args.data.profile,
        valuation: args.data.valuation,
        quote: args.data.quote,
        financial: args.data.financial,
        dividend: args.data.dividend,
        historicalPE: args.data.historicalPE,
        industryCompare: args.data.industryCompare,
      },
      null,
      2,
    ),
    "```",
    "",
    `# 巴菲特原文（待审）`,
    args.buffett || "（空）",
    "",
    `# 段永平原文（待审）`,
    args.duan || "（空）",
    "",
    `# 裁判 JSON（待审）`,
    "```json",
    JSON.stringify(args.judgeObj ?? {}, null, 2),
    "```",
    "",
    `# 裁判原始 markdown（待审，含 JSON 之外的解释）`,
    args.judgeRaw || "（空）",
    "",
    `# 强制要求`,
    `- 直接输出 JSON，第一个字符必须是 "{"。`,
    `- 不要 \`\`\`json 围栏，不要任何前后文字。`,
    `- issues 按 severity 降序，最多 8 条。`,
    `- quote 必须是上面任一段原文里**真实存在**的文字（≤30字）；伪造即视为本次复核作废。`,
  ].join("\n");

  // 用流式（内置 thinking-only 自动重试），maxTokens 顶到 16384 防截断
  // v0.1.12：reviewer 模型经常输出 issues 时被截断，把上限拉满
  const messages = [
    { role: "system" as const, content: system },
    { role: "user" as const, content: userMsg },
  ];

  const tryOnce = (extra?: string) => {
    const msgs = extra
      ? messages.map((m, i) =>
          i === 0 ? { ...m, content: m.content + "\n\n" + extra } : m,
        )
      : messages;
    return completeStream(msgs, () => {}, { temperature: 0.2, maxTokens: 16384 });
  };

  const first = await tryOnce();
  // 快速预检：能解析就 OK
  if (canParseReview(first)) return first;

  // 解析失败：重试一次，强化"必须输出完整 JSON"指令
  console.warn("[reviewer] first attempt unparseable, retrying with stricter prompt");
  const second = await tryOnce(
    "⚠️ 上一次输出 JSON 不完整或被截断。这次必须输出**完整闭合**的 JSON：" +
      "issues 控制在 5 条以内、每条 quote/problem/suggestion 都不超过 60 字，" +
      "确保所有花括号正确闭合，第一个字符必须是 { 最后一个字符必须是 }。",
  );
  if (canParseReview(second)) return second;
  // 两次都失败也返回 second（让 extractReviewJSON 走分层兜底）
  return second || first;
}

/** 快速检测 raw 能否被 extractReviewJSON 成功解析（不抛异常） */
function canParseReview(raw: string): boolean {
  try {
    const r = extractReviewJSON(raw);
    return !!r && !!r.overall && Array.isArray(r.issues);
  } catch {
    return false;
  }
}

/** 复核 JSON 解析：复用 extractJudgeJSON 的容错逻辑。
 *  分层兜底（v0.1.12）：
 *    L1. 整体解析（含截断容错）
 *    L2. 思考型模型 "[模型仅返回思考过程..]" 文本剥壳后再解析
 *    L3. 只解析 overall 部分（即使 issues 截断，也能展示评分摘要）
 *    L4. 实在不行才抛错
 */
export function extractReviewJSON(raw: string): ReviewJSON {
  if (!raw || !raw.trim()) throw new Error("Review 输出为空");
  let obj: any = null;

  // L1
  try {
    obj = extractJudgeJSON(raw);
  } catch {
    obj = null;
  }

  // L2：思考型模型兜底
  if (!obj && raw.startsWith("[模型仅返回思考过程")) {
    const stripped = raw.replace(/^\[模型仅返回思考过程[^\]]*\]\s*/, "");
    try {
      obj = extractJudgeJSON(stripped);
    } catch {
      obj = null;
    }
  }

  // L3：只抢救 overall（抓 "overall": { ... } 块）
  if (!obj || typeof obj !== "object") {
    const overallOnly = tryParseOverallOnly(raw);
    if (overallOnly) {
      obj = {
        overall: overallOnly,
        issues: [],
      };
    }
  }

  if (!obj || typeof obj !== "object") {
    throw new Error("Review JSON parse failed");
  }
  // 兜底字段补齐，避免渲染层崩溃
  if (!obj.overall) obj.overall = { score: 60, level: "存疑", summary: "复核输出格式不全" };
  if (!Array.isArray(obj.issues)) obj.issues = [];
  return obj as ReviewJSON;
}

/** 截断兜底：只从 raw 里抢救 "overall" 块（score/level/summary）。
 *  即使后面 issues 数组被截断，至少能给用户展示"基本可信 78 分"等关键结论。 */
function tryParseOverallOnly(raw: string): { score: number; level: string; summary: string } | null {
  // 找 "overall" 后面的第一个完整 {...} 块
  const idx = raw.search(/"overall"\s*:\s*\{/);
  if (idx < 0) return null;
  const braceStart = raw.indexOf("{", idx + 9);
  if (braceStart < 0) return null;
  let depth = 0;
  let inStr = false;
  let braceEnd = -1;
  for (let i = braceStart; i < raw.length; i++) {
    const c = raw[i];
    if (c === '"' && raw[i - 1] !== "\\") inStr = !inStr;
    if (inStr) continue;
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) {
        braceEnd = i;
        break;
      }
    }
  }
  if (braceEnd < 0) return null;
  const block = raw.slice(braceStart, braceEnd + 1);
  try {
    const o = JSON.parse(block);
    if (typeof o === "object" && o) {
      return {
        score: typeof o.score === "number" ? o.score : 60,
        level: typeof o.level === "string" ? o.level : "存疑",
        summary: typeof o.summary === "string" ? o.summary : "复核输出被截断，仅保留评分",
      };
    }
  } catch {
    // 用正则硬抓
  }
  // 正则兜底：分别抓 score/level/summary
  const scoreM = block.match(/"score"\s*:\s*(\d+)/);
  const levelM = block.match(/"level"\s*:\s*"([^"]+)"/);
  const summaryM = block.match(/"summary"\s*:\s*"([^"]+)"/);
  if (scoreM || levelM || summaryM) {
    return {
      score: scoreM ? Number(scoreM[1]) : 60,
      level: levelM ? levelM[1] : "存疑",
      summary: summaryM ? summaryM[1] : "复核输出被截断",
    };
  }
  return null;
}

/** 从模型输出里抽出 JSON 块；容错处理（截断、缺尾括号）。 */
export function extractJudgeJSON(raw: string): any {
  const m = raw.match(/```json\s*([\s\S]*?)```/i);
  let text = m ? m[1] : raw;

  const tryParse = (s: string) => { try { return JSON.parse(s); } catch { return null; } };

  let r = tryParse(text);
  if (r) return r;

  // 没闭合的 ```json 块：取第一个 { 到最后字符
  if (!m) {
    const a = text.indexOf("{");
    const b = text.lastIndexOf("}");
    if (a >= 0 && b > a) {
      r = tryParse(text.slice(a, b + 1));
      if (r) return r;
    }
  }

  // 尝试自动闭合：统计未匹配的 { 和 [
  let body = text;
  const a = body.indexOf("{");
  if (a >= 0) body = body.slice(a);
  // 去掉末尾不完整字符串值（最后一个 " 之后到末尾）
  const lastQuote = body.lastIndexOf('"');
  if (lastQuote >= 0) {
    // 检查 lastQuote 前是否有奇数个未转义引号 → 处于字符串中
    let q = 0;
    for (let i = 0; i < lastQuote; i++) {
      if (body[i] === '"' && body[i - 1] !== "\\") q++;
    }
    if (q % 2 === 0) {
      // lastQuote 是开引号，截掉它之后再补
      body = body.slice(0, lastQuote);
    } else {
      // lastQuote 是闭引号，OK；保留
    }
  }
  // 截到最后一个 , 或 } 或 ]
  const cutAt = Math.max(body.lastIndexOf(","), body.lastIndexOf("}"), body.lastIndexOf("]"));
  if (cutAt > 0) body = body.slice(0, cutAt);
  // 去掉末尾的 ,
  body = body.replace(/,\s*$/, "");
  // 统计未关闭括号
  let openObj = 0, openArr = 0, inStr = false;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === '"' && body[i - 1] !== "\\") inStr = !inStr;
    if (inStr) continue;
    if (c === "{") openObj++;
    else if (c === "}") openObj--;
    else if (c === "[") openArr++;
    else if (c === "]") openArr--;
  }
  let closed = body;
  while (openArr-- > 0) closed += "]";
  while (openObj-- > 0) closed += "}";
  r = tryParse(closed);
  if (r) return r;

  throw new Error("Judge JSON parse failed");
}
