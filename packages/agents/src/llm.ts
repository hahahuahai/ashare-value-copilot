/**
 * OpenAI 兼容协议的极简包装。用户自带 base_url + api_key。
 * 默认走腾讯云 LKEAP Token Plan（/plan/v3）。
 *
 * 注意：Token Plan 的模型几乎全是"深度思考"模型，输出可能回填在
 * choices[0].message.reasoning_content 而非 content。我们做了兜底。
 *
 * v0.1.15 强化（Tier 1+2）：
 *  - 读取 finish_reason，length（预算耗尽）时自动用更大预算重试一次
 *  - 暴露 finish_reason / truncated 给上层（通过 CompletionResult）
 *  - 默认 max_tokens 从 4096 上调到 16384（思考型模型 reasoning 吃额）
 *  - completeMasterStream 增强截断检测：末尾标点 + 三段式收束
 */
import OpenAI from "openai";

// ⚠️ 不要在模块顶层读 env 并 new OpenAI(...)！
// 桌面端流程：App 启动 → 弹"设置"Modal → 用户填 key → save-config 更新 process.env。
// 如果在此之前已经把 apiKey="missing" 锁进了 OpenAI 实例，后面所有请求都会 401。
// 因此改为每次调用现取 env，并按 (key,url) 缓存实例，避免无谓重建。

export const MODEL_DEFAULT = "glm-5.1";
export function currentModel(): string {
  return process.env.LLM_MODEL ?? MODEL_DEFAULT;
}
// v0.1.15：默认预算从 4096 → 16384。理由：思考型模型 reasoning_content 与
// content 共享 max_tokens，4096 下 reasoning 吃掉大半预算后 content 必被截断。
function currentMaxTokens(): number {
  return Number(process.env.LLM_MAX_TOKENS ?? 16384);
}

let cached: { key: string; url: string; client: OpenAI } | null = null;
function getClient(): OpenAI {
  const apiKey = process.env.LLM_API_KEY ?? "";
  const baseURL =
    process.env.LLM_BASE_URL ?? "https://api.lkeap.cloud.tencent.com/plan/v3";
  if (!apiKey) {
    throw new Error(
      "LLM_API_KEY 未设置。请打开「设置」填入腾讯云 LKEAP API Key（Token Plan 是 sk-tp- 开头）。",
    );
  }
  if (!cached || cached.key !== apiKey || cached.url !== baseURL) {
    cached = { key: apiKey, url: baseURL, client: new OpenAI({ apiKey, baseURL }) };
  }
  return cached.client;
}

// 兼容旧导出名
export const MODEL = MODEL_DEFAULT;

export interface ChatTurn {
  role: "system" | "user" | "assistant";
  content: string;
}

interface ThinkingMessage {
  content?: string | null;
  reasoning_content?: string | null;
}

/** v0.1.15：完成调用元信息，供上层决策（是否重试、是否警告用户）。 */
export interface CompletionMeta {
  /** 模型返回的原始 finish_reason。length 代表预算耗尽被截断。 */
  finish_reason: string | null;
  /** 是否因 length 被截断（finish_reason === "length"）。 */
  truncated: boolean;
  /** 是否走了 length-retry（本次实际是二次更大预算的结果）。 */
  retried_on_length: boolean;
  /** 是否走了 thinking-only 降级重试（stream 只回 reasoning 的情况）。 */
  retried_on_thinking: boolean;
  /** 最后一次调用实际使用的 max_tokens。 */
  max_tokens_used: number;
  /** 使用的模型名。 */
  model: string;
}

function emptyMeta(model: string, maxTokens: number): CompletionMeta {
  return {
    finish_reason: null,
    truncated: false,
    retried_on_length: false,
    retried_on_thinking: false,
    max_tokens_used: maxTokens,
    model,
  };
}

/**
 * 非流式完成（带 meta）。v0.1.15 起：finish_reason === "length" 时自动一次性重试，
 * 预算翻倍（上限 32768）。返回 text + meta，便于上层落盘记录。
 */
export async function completeWithMeta(
  messages: ChatTurn[],
  opts?: { temperature?: number; maxTokens?: number },
): Promise<{ text: string; meta: CompletionMeta }> {
  const model = currentModel();
  const baseBudget = opts?.maxTokens ?? currentMaxTokens();

  const runOnce = async (budget: number) => {
    const r = await getClient().chat.completions.create({
      model,
      temperature: opts?.temperature ?? 0.4,
      max_tokens: budget,
      messages,
    });
    const choice = r.choices[0] ?? ({} as any);
    const msg = (choice.message ?? {}) as ThinkingMessage;
    const finishReason = (choice.finish_reason ?? null) as string | null;
    const content = (msg.content ?? "").trim();
    const reasoning = (msg.reasoning_content ?? "").trim();
    return { content, reasoning, finishReason };
  };

  const meta = emptyMeta(model, baseBudget);
  let { content, reasoning, finishReason } = await runOnce(baseBudget);
  meta.finish_reason = finishReason;
  meta.truncated = finishReason === "length";

  // length 截断：翻倍重试一次（上限 32768）
  if (meta.truncated) {
    const retryBudget = Math.min(baseBudget * 2, 32768);
    if (retryBudget > baseBudget) {
      console.warn(
        `[llm] finish_reason=length at ${baseBudget}, retrying with ${retryBudget}`,
      );
      try {
        const second = await runOnce(retryBudget);
        meta.retried_on_length = true;
        meta.max_tokens_used = retryBudget;
        meta.finish_reason = second.finishReason;
        meta.truncated = second.finishReason === "length";
        content = second.content;
        reasoning = second.reasoning;
      } catch (e) {
        console.warn("[llm] length-retry failed:", e);
      }
    }
  }

  if (content) return { text: content, meta };
  if (reasoning) {
    return {
      text: `[模型仅返回思考过程，未给最终回答；以下为思考内容]\n\n${reasoning}`,
      meta,
    };
  }
  return { text: "", meta };
}

/** 旧签名：仅返回 text（向后兼容）。新代码请用 completeWithMeta。 */
export async function complete(
  messages: ChatTurn[],
  opts?: { temperature?: number; maxTokens?: number },
): Promise<string> {
  const r = await completeWithMeta(messages, opts);
  return r.text;
}

/**
 * 流式完成（带 meta）。v0.1.15 起：
 *  - 读取每帧 finish_reason，length 时用非流式更大预算重试
 *  - thinking-only 分支也走 completeWithMeta，保留重试链路
 */
export async function completeStreamWithMeta(
  messages: ChatTurn[],
  onChunk: (delta: string, phase: "thinking" | "answer") => void,
  opts?: { temperature?: number; maxTokens?: number },
): Promise<{ text: string; meta: CompletionMeta }> {
  const model = currentModel();
  const baseBudget = opts?.maxTokens ?? currentMaxTokens();
  const meta = emptyMeta(model, baseBudget);

  const stream = await getClient().chat.completions.create({
    model,
    temperature: opts?.temperature ?? 0.4,
    max_tokens: baseBudget,
    messages,
    stream: true,
  });

  let answer = "";
  let thinking = "";
  let finishReason: string | null = null;
  for await (const part of stream) {
    const choice = part.choices?.[0] ?? ({} as any);
    const delta = (choice.delta ?? {}) as {
      content?: string | null;
      reasoning_content?: string | null;
    };
    if (delta.reasoning_content) {
      thinking += delta.reasoning_content;
      onChunk(delta.reasoning_content, "thinking");
    }
    if (delta.content) {
      answer += delta.content;
      onChunk(delta.content, "answer");
    }
    if (choice.finish_reason) finishReason = choice.finish_reason;
  }

  meta.finish_reason = finishReason;
  meta.truncated = finishReason === "length";

  // ⚠️ 场景1：拿到 answer，但被 length 截断 → 非流式更大预算重试
  if (answer.trim() && meta.truncated) {
    const retryBudget = Math.min(baseBudget * 2, 32768);
    if (retryBudget > baseBudget) {
      console.warn(
        `[llm] stream finish_reason=length, non-stream retry with ${retryBudget}`,
      );
      try {
        const r = await completeWithMeta(messages, { ...opts, maxTokens: retryBudget });
        if (r.text && !r.text.startsWith("[模型仅返回思考过程")) {
          // 把重试的"更完整"结果作为 answer phase 补发给 UI
          // 注意：这里会导致前端看到两次 answer。前端需要自行去重或替换。
          // 保守做法：只补发末尾差异（简化：整段重发，UI 层做覆盖）。
          onChunk("\n\n[已自动用更大预算重新生成完整版本]\n\n", "answer");
          onChunk(r.text, "answer");
          meta.retried_on_length = true;
          meta.max_tokens_used = r.meta.max_tokens_used;
          meta.finish_reason = r.meta.finish_reason;
          meta.truncated = r.meta.truncated;
          return { text: r.text, meta };
        }
      } catch (e) {
        console.warn("[llm] length-retry (stream) failed:", e);
      }
    }
  }

  if (answer.trim()) return { text: answer, meta };

  // ⚠️ 场景2：流式只回 thinking → 非流式重试
  if (thinking.trim()) {
    console.warn(
      "[llm] stream returned only reasoning_content, retrying in non-stream mode...",
    );
    try {
      const r = await completeWithMeta(messages, opts);
      const cleaned = r.text.replace(/^\[模型仅返回思考过程[^\]]*\]\s*\n*/, "").trim();
      if (cleaned && !r.text.startsWith("[模型仅返回思考过程")) {
        onChunk(cleaned, "answer");
        meta.retried_on_thinking = true;
        meta.finish_reason = r.meta.finish_reason;
        meta.truncated = r.meta.truncated;
        meta.max_tokens_used = r.meta.max_tokens_used;
        return { text: cleaned, meta };
      }
    } catch (e) {
      console.warn("[llm] non-stream retry failed:", e);
    }
    return {
      text: `[模型仅返回思考过程，未给最终回答；以下为思考内容]\n\n${thinking}`,
      meta,
    };
  }
  return { text: "", meta };
}

/** 旧签名：仅返回 text。新代码请用 completeStreamWithMeta。 */
export async function completeStream(
  messages: ChatTurn[],
  onChunk: (delta: string, phase: "thinking" | "answer") => void,
  opts?: { temperature?: number; maxTokens?: number },
): Promise<string> {
  const r = await completeStreamWithMeta(messages, onChunk, opts);
  return r.text;
}

/**
 * 大师 agent 专用流式包装。v0.1.15 强化截断检测：
 *  - 语义收束：末尾必须是句号/问号/感叹号/”/ }/] 之一（中英文）
 *  - 结构收束：必须同时命中三段式标题（第零/一/二/三步）或 PASS/FAIL/GRAY
 *  - finish_reason=length 强制判定截断
 * 截断则强化提示重试一次，拿更完整版本。
 */
export async function completeMasterStream(
  messages: ChatTurn[],
  onChunk: (delta: string, phase: "thinking" | "answer") => void,
  opts?: { temperature?: number; maxTokens?: number; agentName?: string },
): Promise<{ text: string; meta: CompletionMeta }> {
  const isThinkFallback = (t: string) => !t || t.startsWith("[模型仅返回思考过程");

  // 末尾是否"合法收束"
  const hasProperEnding = (text: string): boolean => {
    const trimmed = text.trim();
    if (!trimmed) return false;
    const last = trimmed.slice(-1);
    // 中英文句末标点 + 常见闭合符
    return /[。！？.!?”"）)\]\}>】～]/.test(last);
  };

  // 结构完整性：三段式或裁决关键词至少一个
  const hasStructure = (text: string): boolean => {
    return /第[零一二三]步/.test(text) || /\b(PASS|FAIL|GRAY)\b/.test(text);
  };

  const isValid = (text: string, meta: CompletionMeta): boolean => {
    if (isThinkFallback(text)) return false;
    if (meta.truncated) return false; // length 截断一律判不合格
    if (!hasStructure(text)) return false;
    if (!hasProperEnding(text)) return false;
    return true;
  };

  const first = await completeStreamWithMeta(messages, onChunk, opts);
  if (isValid(first.text, first.meta)) return first;

  const reasons: string[] = [];
  if (isThinkFallback(first.text)) reasons.push("thinking-only");
  if (first.meta.truncated) reasons.push(`finish_reason=length(${first.meta.max_tokens_used})`);
  if (first.text && !hasStructure(first.text)) reasons.push("no-structure");
  if (first.text && !isThinkFallback(first.text) && !hasProperEnding(first.text))
    reasons.push("no-proper-ending");
  console.warn(
    `[llm] ${opts?.agentName ?? "master"} invalid output [${reasons.join(",")}], retry once`,
  );

  // 重试：强化 system + 提温 0.1 + 预算翻倍（截断时）
  const retryBudget = first.meta.truncated
    ? Math.min((opts?.maxTokens ?? currentMaxTokens()) * 2, 32768)
    : opts?.maxTokens ?? currentMaxTokens();
  const retryMsgs: ChatTurn[] = messages.map((m) =>
    m.role === "system"
      ? {
          ...m,
          content:
            m.content +
            "\n\n⚠️ 直接输出最终 Markdown 答案，不要只输出思考过程。" +
            "必须完整输出三段式（第零/一/二/三步），并以明确的句末标点收束。",
        }
      : m,
  );
  const second = await completeStreamWithMeta(retryMsgs, onChunk, {
    ...opts,
    temperature: (opts?.temperature ?? 0.4) + 0.1,
    maxTokens: retryBudget,
  });
  if (isValid(second.text, second.meta)) return second;

  // 两次都不合格：返回更"长"的那个（信息量更大），meta 标记仍不合格
  const best = second.text.length >= first.text.length ? second : first;
  return best;
}
