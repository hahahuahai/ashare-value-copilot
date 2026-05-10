import { useEffect, useState } from "react";
import type { AppConfig } from "../../preload";

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
  /** true 表示首次强制引导（不允许简单关闭） */
  forcedSetup?: boolean;
}

type Provider =
  | "lkeap-plan"
  | "lkeap-std"
  | "deepseek"
  | "dashscope"
  | "zhipu"
  | "moonshot"
  | "doubao"
  | "siliconflow"
  | "openrouter"
  | "ollama"
  | "openai"
  | "grok"
  | "custom";

interface ProviderDef {
  id: Provider;
  name: string;
  badge?: string;
  baseUrl: string;
  keyPrefix: string; // 提示前缀，不强制
  applyUrl?: string;
  models: { value: string; label: string; hint?: string }[];
  tip: string;
}

const PROVIDERS: ProviderDef[] = [
  {
    id: "lkeap-plan",
    name: "腾讯云 LKEAP · Token Plan",
    badge: "推荐",
    baseUrl: "https://api.lkeap.cloud.tencent.com/plan/v3",
    keyPrefix: "sk-tp-",
    applyUrl: "https://console.cloud.tencent.com/lkeap/api-key",
    tip: "包月套餐，所有模型均价，适合高频研究。Key 以 sk-tp- 开头。",
    models: [
      { value: "glm-5.1", label: "GLM 5.1", hint: "智谱 · 深度思考 · 默认推荐" },
      { value: "glm-5", label: "GLM 5" },
      { value: "minimax-m2.7", label: "MiniMax M2.7", hint: "深度思考 · 长上下文" },
      { value: "minimax-m2.5", label: "MiniMax M2.5" },
      { value: "kimi-k2.5", label: "Kimi K2.5", hint: "月之暗面 · 长上下文擅长" },
      { value: "tc-code-latest", label: "Auto 智能路由", hint: "自动挑选最合适模型" },
    ],
  },
  {
    id: "lkeap-std",
    name: "腾讯云 LKEAP · 按量计费",
    baseUrl: "https://api.lkeap.cloud.tencent.com/v1",
    keyPrefix: "sk-",
    applyUrl: "https://console.cloud.tencent.com/lkeap/api-key",
    tip: "按 token 计费，适合偶尔使用。Key 以 sk- 开头（不含 tp）。",
    models: [
      { value: "deepseek-v3", label: "DeepSeek V3", hint: "速度快 · 价格友好" },
      { value: "deepseek-r1", label: "DeepSeek R1", hint: "深度推理" },
      { value: "deepseek-v3-0324", label: "DeepSeek V3 0324" },
      { value: "qwen-plus", label: "通义千问 Plus" },
      { value: "qwen-max", label: "通义千问 Max" },
    ],
  },
  {
    id: "deepseek",
    name: "DeepSeek 官方",
    baseUrl: "https://api.deepseek.com/v1",
    keyPrefix: "sk-",
    applyUrl: "https://platform.deepseek.com/api_keys",
    tip: "直连 DeepSeek 官方 API。",
    models: [
      { value: "deepseek-chat", label: "DeepSeek Chat", hint: "V3 对话模型" },
      { value: "deepseek-reasoner", label: "DeepSeek Reasoner", hint: "R1 推理模型" },
    ],
  },
  {
    id: "dashscope",
    name: "阿里通义千问",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    keyPrefix: "sk-",
    applyUrl: "https://bailian.console.aliyun.com/?apiKey=1",
    tip: "DashScope 的 OpenAI 兼容入口。中文金融语料强、tool call 稳定。",
    models: [
      { value: "qwen-max", label: "Qwen Max", hint: "通义千问旗舰" },
      { value: "qwen-plus", label: "Qwen Plus", hint: "性价比平衡款" },
      { value: "qwen-turbo", label: "Qwen Turbo", hint: "极速 · 低价" },
      { value: "qwq-32b-preview", label: "QwQ 32B", hint: "深度推理 · 思考型" },
    ],
  },
  {
    id: "zhipu",
    name: "智谱 GLM",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    keyPrefix: "",
    applyUrl: "https://bigmodel.cn/usercenter/proj-mgmt/apikeys",
    tip: "智谱清言 API。GLM-4.6 性价比高，A 股研报训练料丰富。",
    models: [
      { value: "glm-4.6", label: "GLM-4.6", hint: "旗舰对话 · 推荐" },
      { value: "glm-4-plus", label: "GLM-4-Plus", hint: "高质量 · 价格略高" },
      { value: "glm-z1-air", label: "GLM-Z1-Air", hint: "深度思考 · 平价" },
      { value: "glm-4-air", label: "GLM-4-Air", hint: "极速 · 低价" },
    ],
  },
  {
    id: "moonshot",
    name: "月之暗面 Kimi",
    baseUrl: "https://api.moonshot.cn/v1",
    keyPrefix: "sk-",
    applyUrl: "https://platform.moonshot.cn/console/api-keys",
    tip: "Kimi 长上下文擅长，研报抓取与跨年度财报对比友好。",
    models: [
      { value: "moonshot-v1-128k", label: "Moonshot v1 128K", hint: "长上下文" },
      { value: "moonshot-v1-32k", label: "Moonshot v1 32K", hint: "性价比" },
      { value: "kimi-latest", label: "Kimi Latest", hint: "最新对话模型" },
    ],
  },
  {
    id: "doubao",
    name: "字节豆包（火山方舟）",
    baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    keyPrefix: "",
    applyUrl: "https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey",
    tip: "豆包速度极快、tool call 已稳。模型名需在火山方舟开通后填 endpoint id（ep-xxxxxxx）。",
    models: [
      { value: "doubao-1-5-pro-32k-250115", label: "Doubao 1.5 Pro 32K", hint: "旗舰 · 推荐" },
      { value: "doubao-1-5-pro-256k-250115", label: "Doubao 1.5 Pro 256K", hint: "长上下文" },
      { value: "doubao-1-5-lite-32k-250115", label: "Doubao 1.5 Lite", hint: "极速 · 低价" },
    ],
  },
  {
    id: "siliconflow",
    name: "硅基流动 SiliconFlow",
    baseUrl: "https://api.siliconflow.cn/v1",
    keyPrefix: "sk-",
    applyUrl: "https://cloud.siliconflow.cn/account/ak",
    tip: "一个 Key 聚合 DeepSeek/Qwen/GLM 等多家模型，国内直连。",
    models: [
      { value: "deepseek-ai/DeepSeek-V3", label: "DeepSeek V3" },
      { value: "deepseek-ai/DeepSeek-R1", label: "DeepSeek R1", hint: "深度推理" },
      { value: "Qwen/Qwen2.5-72B-Instruct", label: "Qwen2.5 72B" },
      { value: "Qwen/QwQ-32B", label: "QwQ 32B", hint: "思考型" },
      { value: "THUDM/glm-4-9b-chat", label: "GLM-4 9B" },
    ],
  },
  {
    id: "openrouter",
    name: "OpenRouter（海外聚合）",
    baseUrl: "https://openrouter.ai/api/v1",
    keyPrefix: "sk-or-",
    applyUrl: "https://openrouter.ai/keys",
    tip: "聚合 OpenAI / Anthropic / Google / Meta 等数百模型，按量付费。海外网络。",
    models: [
      { value: "anthropic/claude-sonnet-4.5", label: "Claude Sonnet 4.5", hint: "推理强 · 工具调用稳" },
      { value: "openai/gpt-4o", label: "GPT-4o" },
      { value: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro", hint: "1M 上下文" },
      { value: "deepseek/deepseek-chat-v3", label: "DeepSeek V3", hint: "便宜" },
      { value: "meta-llama/llama-3.3-70b-instruct", label: "Llama 3.3 70B" },
    ],
  },
  {
    id: "ollama",
    name: "Ollama 本地",
    baseUrl: "http://127.0.0.1:11434/v1",
    keyPrefix: "",
    applyUrl: "https://ollama.com/download",
    tip: "本机离线运行，完全免费 + 隐私。需要先 ollama pull <模型名>。Key 随便填（如 ollama）。",
    models: [
      { value: "qwen2.5:14b", label: "Qwen2.5 14B", hint: "中文均衡" },
      { value: "qwen2.5:32b", label: "Qwen2.5 32B", hint: "需要 24G+ 显存" },
      { value: "deepseek-r1:14b", label: "DeepSeek R1 14B", hint: "本地推理" },
      { value: "glm4:9b", label: "GLM4 9B" },
    ],
  },
  {
    id: "openai",
    name: "OpenAI 官方",
    baseUrl: "https://api.openai.com/v1",
    keyPrefix: "sk-",
    applyUrl: "https://platform.openai.com/api-keys",
    tip: "OpenAI 原生。中国大陆需要科学上网或代理。",
    models: [
      { value: "gpt-4o", label: "GPT-4o", hint: "旗舰多模态" },
      { value: "gpt-4o-mini", label: "GPT-4o Mini", hint: "便宜 · 适合复核员" },
      { value: "o3-mini", label: "o3-mini", hint: "深度推理" },
    ],
  },
  {
    id: "grok",
    name: "xAI Grok",
    baseUrl: "https://api.x.ai/v1",
    keyPrefix: "xai-",
    applyUrl: "https://console.x.ai/",
    tip: "Grok 接入 X 实时数据，适合舆情类研究。海外网络。",
    models: [
      { value: "grok-4-latest", label: "Grok 4", hint: "最新旗舰" },
      { value: "grok-3", label: "Grok 3" },
      { value: "grok-3-mini", label: "Grok 3 Mini" },
    ],
  },
  {
    id: "custom",
    name: "自定义（OpenAI 兼容）",
    baseUrl: "",
    keyPrefix: "",
    tip: "任何 OpenAI 兼容端点：Azure OpenAI、企业内网、文心 V2、私有部署 vLLM 等。",
    models: [],
  },
];

function detectProvider(baseUrl: string): Provider {
  if (!baseUrl) return "lkeap-plan";
  if (baseUrl.includes("lkeap.cloud.tencent.com/plan")) return "lkeap-plan";
  if (baseUrl.includes("lkeap.cloud.tencent.com/v1")) return "lkeap-std";
  if (baseUrl.includes("api.deepseek.com")) return "deepseek";
  if (baseUrl.includes("dashscope.aliyuncs.com")) return "dashscope";
  if (baseUrl.includes("open.bigmodel.cn")) return "zhipu";
  if (baseUrl.includes("api.moonshot.cn")) return "moonshot";
  if (baseUrl.includes("ark.cn-beijing.volces.com") || baseUrl.includes("ark.volces.com")) return "doubao";
  if (baseUrl.includes("api.siliconflow.cn")) return "siliconflow";
  if (baseUrl.includes("openrouter.ai")) return "openrouter";
  if (baseUrl.includes("127.0.0.1:11434") || baseUrl.includes("localhost:11434") || baseUrl.includes(":11434")) return "ollama";
  if (baseUrl.includes("api.openai.com")) return "openai";
  if (baseUrl.includes("api.x.ai")) return "grok";
  return "custom";
}

export function SettingsModal({ open, onClose, onSaved, forcedSetup }: Props) {
  const [provider, setProvider] = useState<Provider>("lkeap-plan");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("glm-5.1");
  const [customModel, setCustomModel] = useState("");
  const [pythonBin, setPythonBin] = useState("");
  const [envPath, setEnvPath] = useState("");
  const [isPackaged, setIsPackaged] = useState(false);
  const [reveal, setReveal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedTick, setSavedTick] = useState(false);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const c: AppConfig = await window.vc.getConfig();
      const detected = detectProvider(c.LLM_BASE_URL);
      setProvider(detected);
      setBaseUrl(c.LLM_BASE_URL || PROVIDERS[0].baseUrl);
      setApiKey(c.LLM_API_KEY || "");
      setModel(c.LLM_MODEL || "glm-5.1");
      setCustomModel(c.LLM_MODEL || "");
      setPythonBin(c.PYTHON_BIN || "");
      setEnvPath(c.envPath);
      setIsPackaged(c.isPackaged);
    })();
  }, [open]);

  if (!open) return null;

  const currentProvider = PROVIDERS.find((p) => p.id === provider)!;

  const onProviderChange = (id: Provider) => {
    setProvider(id);
    const def = PROVIDERS.find((p) => p.id === id)!;
    if (def.baseUrl) setBaseUrl(def.baseUrl);
    // 切 provider 自动选第一个模型（除 custom）
    if (def.models.length > 0 && !def.models.find((m) => m.value === model)) {
      setModel(def.models[0].value);
    }
  };

  const keyValid = apiKey.trim().length >= 20;
  const effectiveModel = provider === "custom" ? customModel.trim() : model;
  const baseUrlValid = baseUrl.trim().length > 0;
  const modelValid = effectiveModel.length > 0;
  const canSave = keyValid && baseUrlValid && modelValid && !saving;

  const onSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      await window.vc.saveConfig({
        LLM_API_KEY: apiKey.trim(),
        LLM_BASE_URL: baseUrl.trim(),
        LLM_MODEL: effectiveModel,
        PYTHON_BIN: pythonBin.trim(),
      });
      setSavedTick(true);
      onSaved?.();
      setTimeout(() => {
        setSavedTick(false);
        onClose();
      }, 800);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
      onClick={() => { if (!forcedSetup) onClose(); }}
    >
      <div
        className="bg-panel rounded-lg border border-line w-[580px] max-w-[92%] flex flex-col shadow-2xl max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-line flex items-center justify-between shrink-0">
          <div>
            <h3 className="text-gold font-semibold text-base flex items-center gap-2">
              ⚙️ 设置
              {forcedSetup && <span className="text-amber text-xs font-normal">首次运行 · 请先配置</span>}
            </h3>
            <p className="text-mute text-xs mt-0.5">配置保存在本地 .env 文件，保存后立即生效，无需重启</p>
          </div>
          {!forcedSetup && (
            <button onClick={onClose} className="text-mute hover:text-ink text-lg leading-none">✕</button>
          )}
        </div>

        <div className="px-5 py-4 space-y-5 overflow-y-auto">
          {/* 服务类型 */}
          <div>
            <label className="text-sm text-ink font-medium block mb-1.5">
              LLM 服务
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              {PROVIDERS.map((p) => (
                <label
                  key={p.id}
                  className={`flex items-center gap-2 px-3 py-2 rounded border cursor-pointer transition-colors ${
                    provider === p.id
                      ? "border-gold bg-gold/5"
                      : "border-line hover:border-mute bg-panel2"
                  }`}
                >
                  <input
                    type="radio"
                    name="provider"
                    value={p.id}
                    checked={provider === p.id}
                    onChange={() => onProviderChange(p.id)}
                    className="accent-gold"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-ink flex items-center gap-1.5">
                      <span className="truncate">{p.name}</span>
                      {p.badge && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-red/20 text-red-soft rounded shrink-0">{p.badge}</span>
                      )}
                    </div>
                  </div>
                </label>
              ))}
            </div>
            <p className="text-mute text-xs mt-1.5">{currentProvider.tip}</p>
          </div>

          {/* API Key */}
          <div>
            <div className="flex items-baseline justify-between mb-1.5">
              <label className="text-sm text-ink font-medium">
                API Key
                <span className="text-red-soft ml-1">*</span>
              </label>
              {currentProvider.applyUrl && (
                <a
                  href={currentProvider.applyUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-gold hover:underline"
                >
                  去申请 →
                </a>
              )}
            </div>
            <div className="flex gap-2">
              <input
                type={reveal ? "text" : "password"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={currentProvider.keyPrefix ? `${currentProvider.keyPrefix}xxxxxxxxxxxx` : "sk-..."}
                className="flex-1 bg-panel2 border border-line rounded px-3 py-2 text-sm font-mono focus:outline-none focus:border-gold"
                autoFocus
              />
              <button
                type="button"
                onClick={() => setReveal((v) => !v)}
                className="px-3 py-2 text-xs text-mute hover:text-ink border border-line rounded"
              >
                {reveal ? "隐藏" : "显示"}
              </button>
            </div>
            {apiKey && !keyValid && (
              <p className="text-amber text-xs mt-1">⚠️ Key 长度看起来不对，请检查是否完整粘贴</p>
            )}
            {apiKey && keyValid && currentProvider.keyPrefix &&
              !apiKey.trim().startsWith(currentProvider.keyPrefix) && (
              <p className="text-amber text-xs mt-1">
                ⚠️ 前缀不是 <code className="font-mono">{currentProvider.keyPrefix}</code>，请确认选对了服务类型
              </p>
            )}
          </div>

          {/* 模型 */}
          <div>
            <label className="text-sm text-ink font-medium block mb-1.5">大模型</label>
            {provider === "custom" ? (
              <input
                value={customModel}
                onChange={(e) => setCustomModel(e.target.value)}
                placeholder="例如 qwen2.5:14b / gpt-4o-mini"
                className="w-full bg-panel2 border border-line rounded px-3 py-2 text-sm font-mono focus:outline-none focus:border-gold"
              />
            ) : (
              <div className="grid grid-cols-1 gap-1.5">
                {currentProvider.models.map((m) => (
                  <label
                    key={m.value}
                    className={`flex items-center gap-3 px-3 py-2 rounded border cursor-pointer transition-colors ${
                      model === m.value
                        ? "border-gold bg-gold/5"
                        : "border-line hover:border-mute bg-panel2"
                    }`}
                  >
                    <input
                      type="radio"
                      name="model"
                      value={m.value}
                      checked={model === m.value}
                      onChange={() => setModel(m.value)}
                      className="accent-gold"
                    />
                    <div className="flex-1">
                      <div className="text-sm text-ink">{m.label}</div>
                      {m.hint && <div className="text-mute text-xs">{m.hint}</div>}
                    </div>
                    <code className="text-[11px] text-mute font-mono">{m.value}</code>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* 高级 */}
          <details className="group">
            <summary className="text-xs text-mute cursor-pointer hover:text-ink select-none">
              高级选项（端点 URL · Python 路径 · 文件位置）
            </summary>
            <div className="mt-3 space-y-3">
              <div>
                <label className="text-sm text-ink font-medium block mb-1.5">
                  Base URL <span className="text-mute text-xs font-normal">（OpenAI 兼容端点）</span>
                </label>
                <input
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="https://api.lkeap.cloud.tencent.com/plan/v3"
                  className="w-full bg-panel2 border border-line rounded px-3 py-2 text-sm font-mono focus:outline-none focus:border-gold"
                />
              </div>
              <div>
                <label className="text-sm text-ink font-medium block mb-1.5">
                  Python 路径 <span className="text-mute text-xs font-normal">（留空则用系统 python）</span>
                </label>
                <input
                  value={pythonBin}
                  onChange={(e) => setPythonBin(e.target.value)}
                  placeholder="C:\\Python312\\python.exe"
                  className="w-full bg-panel2 border border-line rounded px-3 py-2 text-sm font-mono focus:outline-none focus:border-gold"
                />
                <p className="text-mute text-xs mt-1">仅当启动数据边车报错"未找到 Python"时才需要填</p>
              </div>
              <div>
                <label className="text-sm text-ink font-medium block mb-1.5">配置文件位置</label>
                <div className="flex gap-2 items-center">
                  <code className="flex-1 bg-panel2 border border-line rounded px-3 py-2 text-xs font-mono text-mute truncate">
                    {envPath}
                  </code>
                  <button
                    type="button"
                    onClick={() => window.vc.openEnvFile()}
                    className="px-3 py-2 text-xs text-mute hover:text-gold border border-line rounded whitespace-nowrap"
                  >
                    用编辑器打开
                  </button>
                </div>
              </div>
            </div>
          </details>
        </div>

        <div className="px-5 py-3 border-t border-line flex items-center justify-between bg-panel2/50 rounded-b-lg shrink-0">
          <div className="text-xs text-mute">
            {savedTick ? (
              <span className="text-jade">✓ 已保存，立即生效</span>
            ) : (
              <span>{isPackaged ? "生产模式" : "开发模式"}</span>
            )}
          </div>
          <div className="flex gap-2">
            {!forcedSetup && (
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm text-mute hover:text-ink border border-line rounded"
              >
                取消
              </button>
            )}
            <button
              onClick={onSave}
              disabled={!canSave}
              className="px-4 py-2 text-sm bg-red hover:bg-red-soft text-white rounded font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving ? "保存中..." : "保存并应用"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
