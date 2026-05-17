import { completeWithMeta, type CompletionMeta } from "./llm.js";

export type WorkbenchTaskKind =
  | "daily-brief"
  | "watchlist-organize"
  | "screener-explain"
  | "risk-explain"
  | "archive-summary"
  | "compare-explain"
  | "principles-coach"
  | "report-editor";

export interface WorkbenchTaskResult {
  title: string;
  summary: string;
  bullets: string[];
  actions: string[];
  warnings: string[];
  meta?: CompletionMeta;
}

const TASK_LABEL: Record<WorkbenchTaskKind, string> = {
  "daily-brief": "今日研究简报",
  "watchlist-organize": "自选股管家",
  "screener-explain": "筛选解释器",
  "risk-explain": "风险解释",
  "archive-summary": "公司档案总结",
  "compare-explain": "公司对比助手",
  "principles-coach": "投资原则教练",
  "report-editor": "报告编辑器",
};

function extractJson(text: string): any {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const raw = fenced ?? text.match(/\{[\s\S]*\}/)?.[0] ?? text;
  return JSON.parse(raw);
}

function fallback(kind: WorkbenchTaskKind, error: unknown): WorkbenchTaskResult {
  return {
    title: TASK_LABEL[kind],
    summary: "AI 助手暂时无法生成结构化结果。",
    bullets: [],
    actions: ["检查 LLM 配置和网络连接后重试。"],
    warnings: [error instanceof Error ? error.message : String(error)],
  };
}

export async function runWorkbenchTask(
  kind: WorkbenchTaskKind,
  context: unknown,
): Promise<WorkbenchTaskResult> {
  const system = [
    "你是一个本地 A 股价值投资研究助理。",
    "你只能基于用户提供的 JSON 上下文做整理、解释和建议，不能发明任何数字、日期、公司事实或数据来源。",
    "你不提供买入、卖出、持有建议；只能判断是否值得继续研究、需要复核什么、下一步看什么。",
    "如果数据不足，必须明确写入 warnings。",
    "输出必须是严格 JSON，不要 Markdown，不要代码块。",
    "JSON schema: {\"title\": string, \"summary\": string, \"bullets\": string[], \"actions\": string[], \"warnings\": string[]}",
    "bullets 最多 5 条，actions 最多 5 条，warnings 最多 3 条。每条尽量短。",
  ].join("\n");

  const user = [
    `任务：${TASK_LABEL[kind]} (${kind})`,
    "",
    "上下文 JSON：",
    JSON.stringify(context, null, 2).slice(0, 24000),
  ].join("\n");

  try {
    const { text, meta } = await completeWithMeta(
      [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      { temperature: 0.2, maxTokens: 4096 },
    );
    const parsed = extractJson(text);
    return {
      title: String(parsed.title ?? TASK_LABEL[kind]),
      summary: String(parsed.summary ?? ""),
      bullets: Array.isArray(parsed.bullets) ? parsed.bullets.slice(0, 5).map(String) : [],
      actions: Array.isArray(parsed.actions) ? parsed.actions.slice(0, 5).map(String) : [],
      warnings: Array.isArray(parsed.warnings) ? parsed.warnings.slice(0, 3).map(String) : [],
      meta,
    };
  } catch (error) {
    return fallback(kind, error);
  }
}
