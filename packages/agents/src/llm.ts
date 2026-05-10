/**
 * OpenAI 兼容协议的极简包装。用户自带 base_url + api_key。
 * 默认走腾讯云 LKEAP Token Plan（/plan/v3）。
 *
 * 注意：Token Plan 的模型几乎全是"深度思考"模型，输出可能回填在
 * choices[0].message.reasoning_content 而非 content。我们做了兜底。
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
function currentMaxTokens(): number {
  return Number(process.env.LLM_MAX_TOKENS ?? 4096);
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

export async function complete(
  messages: ChatTurn[],
  opts?: { temperature?: number; maxTokens?: number },
): Promise<string> {
  const r = await getClient().chat.completions.create({
    model: currentModel(),
    temperature: opts?.temperature ?? 0.4,
    max_tokens: opts?.maxTokens ?? currentMaxTokens(),
    messages,
  });
  const msg = (r.choices[0]?.message ?? {}) as ThinkingMessage;
  const content = (msg.content ?? "").trim();
  if (content) return content;
  // 思考型模型可能只回填 reasoning_content
  const reasoning = (msg.reasoning_content ?? "").trim();
  if (reasoning) {
    return `[模型仅返回思考过程，未给最终回答；以下为思考内容]\n\n${reasoning}`;
  }
  return "";
}

/**
 * 流式版本：每收到一个 delta 调用 onChunk。
 * - 思考阶段（reasoning_content）会以 phase="thinking" 推送
 * - 最终回答（content）会以 phase="answer" 推送
 *
 * 容错策略（v0.1.7）：
 * 1. 优先返回 answer
 * 2. 若 answer 为空但 thinking 非空 → 自动用非流式重试一次（部分 LKEAP
 *    思考模型在 stream 模式下只回 reasoning，非流式能拿到完整 content）
 * 3. 重试仍空 → 兜底返回 thinking 文本（带降级标签，调用方可识别）
 */
export async function completeStream(
  messages: ChatTurn[],
  onChunk: (delta: string, phase: "thinking" | "answer") => void,
  opts?: { temperature?: number; maxTokens?: number },
): Promise<string> {
  const stream = await getClient().chat.completions.create({
    model: currentModel(),
    temperature: opts?.temperature ?? 0.4,
    max_tokens: opts?.maxTokens ?? currentMaxTokens(),
    messages,
    stream: true,
  });

  let answer = "";
  let thinking = "";
  for await (const part of stream) {
    const delta = (part.choices?.[0]?.delta ?? {}) as {
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
  }
  if (answer.trim()) return answer;

  // ⚠️ 流式只回 thinking，自动用非流式重试一次
  if (thinking.trim()) {
    console.warn(
      "[llm] stream returned only reasoning_content, retrying in non-stream mode...",
    );
    try {
      const retry = await complete(messages, opts);
      const retryClean = retry.replace(/^\[模型仅返回思考过程[^\]]*\]\s*\n*/, "").trim();
      // 重试拿到的不是降级 thinking 才算成功
      if (retryClean && !retry.startsWith("[模型仅返回思考过程")) {
        // 把重试结果以 answer phase 一次性推给前端，保持 UI 一致
        onChunk(retryClean, "answer");
        return retryClean;
      }
    } catch (e) {
      console.warn("[llm] non-stream retry failed:", e);
    }
    // 最终兜底：仍只有 thinking
    return `[模型仅返回思考过程，未给最终回答；以下为思考内容]\n\n${thinking}`;
  }
  return "";
}

/**
 * 大师 agent 专用包装：调用 completeStream 后校验是否为有效大师输出。
 * 如果只拿到 thinking 兜底文本，自动重试一次（最多 1 次）。
 *
 * 检测规则：返回内容必须包含至少一个三段式标题（第零步/第一步/第二步/第三步）
 * 或 PASS/FAIL/GRAY 关键词。
 */
export async function completeMasterStream(
  messages: ChatTurn[],
  onChunk: (delta: string, phase: "thinking" | "answer") => void,
  opts?: { temperature?: number; maxTokens?: number; agentName?: string },
): Promise<string> {
  const isValidMasterOutput = (text: string): boolean => {
    if (!text || text.startsWith("[模型仅返回思考过程")) return false;
    return (
      /第[零一二三零一二三]步/.test(text) ||
      /\b(PASS|FAIL|GRAY)\b/.test(text)
    );
  };

  const first = await completeStream(messages, onChunk, opts);
  if (isValidMasterOutput(first)) return first;

  console.warn(
    `[llm] ${opts?.agentName ?? "master"} agent returned invalid output, retrying once...`,
  );
  // 重试时强化 system 提示，要求模型必须给最终 markdown 而非思考
  const retryMsgs: ChatTurn[] = messages.map((m) =>
    m.role === "system"
      ? { ...m, content: m.content + "\n\n⚠️ 直接输出最终 Markdown 答案，不要只输出思考过程。" }
      : m,
  );
  const second = await completeStream(retryMsgs, onChunk, {
    ...opts,
    temperature: (opts?.temperature ?? 0.4) + 0.1,
  });
  if (isValidMasterOutput(second)) return second;

  // 两次都失败，返回首次结果（可能是 thinking 兜底，至少有内容）
  return first || second;
}
