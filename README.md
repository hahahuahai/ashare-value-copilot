# 价投合伙人 · A-Share Value Copilot

> 一个开源的本地 AI 投研合伙人。把"好生意 / 好公司 / 好价格"编码进价投大师 Agent，替你做尽调、出三段式报告、自我复核、桌面端一键跑。
>
> **ai-hedge-fund 教你做对冲基金，价投合伙人教你少做交易。**

[![Latest Release](https://img.shields.io/github/v/release/hahahuahai/ashare-value-copilot?label=latest%20release&color=orange)](https://github.com/hahahuahai/ashare-value-copilot/releases/latest) [![Release Date](https://img.shields.io/github/release-date/hahahuahai/ashare-value-copilot?color=blue)](https://github.com/hahahuahai/ashare-value-copilot/releases/latest) [![Downloads](https://img.shields.io/github/downloads/hahahuahai/ashare-value-copilot/total?color=brightgreen)](https://github.com/hahahuahai/ashare-value-copilot/releases) ![status](https://img.shields.io/badge/status-public--beta-brightgreen) ![license](https://img.shields.io/badge/license-MIT-green) ![platform](https://img.shields.io/badge/platform-Windows-lightgrey)

---

## 为什么做这个

市面上 AI 选股工具的三个病：

1. **黑箱**：给你一个分数，说不清是好生意还是好价格；
2. **追热点**：LLM 自己编数字，追涨杀跌；
3. **美股中心**：A 股数据要付费、要会英文。

价投合伙人反着来：

- 🇨🇳 **A 股原生**：akshare 免费数据，不依赖任何付费 API
- 🧠 **中文大师人格**：巴菲特 + 段永平双人委员会，强制 `PASS / FAIL / GRAY` 三段式输出
- 🔒 **能力圈门禁**：看不懂的生意直接拒绝分析，不装懂
- 📐 **反幻觉**：所有数字必须来自 tool call（akshare 实时查询），禁止 LLM 自算
- 🧪 **AI 复核员**：每份报告由独立的复核 Agent 对照原文扫引用、扫矛盾、扫估值跳跃，产出 issues 清单
- 🖥️ **桌面端**：Electron 打包，Windows NSIS / Portable 双发行，连 Python 都不用装
- 🔑 **自带 API Key · 12 家 LLM Provider 即选即用**：OpenAI 兼容协议，桌面端内置预设：腾讯云 LKEAP / DeepSeek / 阿里通义 / 智谱 GLM / Kimi / 豆包 / 硅基流动 / OpenRouter / Ollama / OpenAI / Grok / 自定义。思考型模型（如 glm-4.6 / qwq）的 reasoning 链很费 token，v0.1.15 起默认预算已拉到 16384 并内置截断重试

---

## 两种用法

### A. 桌面端（推荐 · 给"只想点按钮的你"）

1. 去 [Releases](https://github.com/hahahuahai/ashare-value-copilot/releases) 下载 `价投合伙人-0.1.15-x64.exe`（NSIS 安装版）或 `价投合伙人-0.1.15-portable.exe`（免安装版）
2. **本地需装 Python 3.10+**（数据边车用 akshare，桌面端会自动启 sidecar 子进程）
3. 首次启动填 `LLM_BASE_URL / API_KEY / MODEL`（支持 LKEAP / DeepSeek / 本地 Ollama）
4. 输入股票代码，点「跑」→ 得到三段式 HTML 报告 + AI 复核结论

桌面端把 prompts 和 sidecar 源码都打进了安装包，但 Python 解释器需要你自己有。

### B. CLI（给开发者）

```bash
# 1. 启动数据边车（一个终端）
cd services/data-sidecar
pip install -r requirements.txt
python main.py              # 监听 http://127.0.0.1:9876

# 2. 配置 LLM（另一个终端）
cp .env.example .env
# 编辑 .env，填 LLM_BASE_URL / LLM_API_KEY / LLM_MODEL

# 3. 装依赖 + 跑大师委员会
pnpm install
pnpm ask 600519             # 贵州茅台
pnpm ask 601318             # 中国平安
```

报告落到 `reports/{code}-{date}.md / .html`，AI 复核摘要落到 `.meta.json`。

> 更多排错技巧见 [`RUN.md`](./RUN.md)。

---

## 支持的 LLM Provider

桌面端「设置」内置 12 家预设，选完自动填好 `LLM_BASE_URL` 与可选模型。**全部走 OpenAI 兼容协议**，CLI 用户改 `.env` 三个变量即可。

| # | Provider | 推荐模型 | Base URL | 申请 Key |
|---|---|---|---|---|
| 1 | **腾讯云 LKEAP · Token Plan** ⭐推荐 | `glm-4.6` / `kimi-k2.5` / `minimax-m2.7` | `https://api.lkeap.cloud.tencent.com/plan/v3` | [控制台](https://console.cloud.tencent.com/lkeap/api-key) |
| 2 | 腾讯云 LKEAP · 按量计费 | `deepseek-v3` / `deepseek-r1` / `qwen-plus` | `https://api.lkeap.cloud.tencent.com/v1` | [控制台](https://console.cloud.tencent.com/lkeap/api-key) |
| 3 | DeepSeek 官方 | `deepseek-chat` / `deepseek-reasoner` | `https://api.deepseek.com/v1` | [DeepSeek Platform](https://platform.deepseek.com/api_keys) |
| 4 | 阿里通义千问（DashScope） | `qwen-max` / `qwen-plus` / `qwq-32b-preview` | `https://dashscope.aliyuncs.com/compatible-mode/v1` | [阿里百炼](https://bailian.console.aliyun.com/?apiKey=1) |
| 5 | 智谱 GLM | `glm-4.6` / `glm-z1-air` | `https://open.bigmodel.cn/api/paas/v4` | [智谱控制台](https://bigmodel.cn/usercenter/proj-mgmt/apikeys) |
| 6 | 月之暗面 Kimi | `moonshot-v1-128k` / `kimi-latest` | `https://api.moonshot.cn/v1` | [Moonshot Platform](https://platform.moonshot.cn/console/api-keys) |
| 7 | 字节豆包（火山方舟） | `doubao-1-5-pro-32k-250115` | `https://ark.cn-beijing.volces.com/api/v3` | [火山方舟](https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey) |
| 8 | 硅基流动 SiliconFlow | `deepseek-ai/DeepSeek-V3` / `Qwen/QwQ-32B` | `https://api.siliconflow.cn/v1` | [SiliconFlow](https://cloud.siliconflow.cn/account/ak) |
| 9 | OpenRouter（海外聚合） | `anthropic/claude-sonnet-4.5` / `google/gemini-2.5-pro` | `https://openrouter.ai/api/v1` | [OpenRouter](https://openrouter.ai/keys) |
| 10 | **Ollama 本地** 🔒离线 | `qwen2.5:14b` / `deepseek-r1:14b` | `http://127.0.0.1:11434/v1` | [Ollama 安装](https://ollama.com/download) |
| 11 | OpenAI 官方 | `gpt-4o` / `gpt-4o-mini` / `o3-mini` | `https://api.openai.com/v1` | [OpenAI Platform](https://platform.openai.com/api-keys) |
| 12 | xAI Grok | `grok-4-latest` / `grok-3` | `https://api.x.ai/v1` | [xAI Console](https://console.x.ai/) |
| 13 | 自定义 | 任意 | 任意 OpenAI 兼容端点（Azure OpenAI / 文心 V2 / vLLM 私有部署 / 其他） | — |

### 选哪个？三句话决策

- **追求性价比 + 国内直连**：腾讯云 LKEAP Token Plan（包月不限模型）或 DeepSeek 官方（V3 极便宜）
- **追求质量 + 接受海外延迟**：OpenRouter 选 `claude-sonnet-4.5`（推理质量天花板）
- **追求隐私 + 完全免费**：Ollama 本地跑 `qwen2.5:14b`（需 ≥16GB 内存）

### CLI 用户配置示例（`.env`）

```bash
# 腾讯云 LKEAP Token Plan
LLM_BASE_URL=https://api.lkeap.cloud.tencent.com/plan/v3
LLM_API_KEY=sk-tp-xxxxxxxxxxxx
LLM_MODEL=glm-4.6

# 或 DeepSeek 官方
LLM_BASE_URL=https://api.deepseek.com/v1
LLM_API_KEY=sk-xxxxxxxxxxxx
LLM_MODEL=deepseek-chat

# 或 Ollama 本地（离线）
LLM_BASE_URL=http://127.0.0.1:11434/v1
LLM_API_KEY=ollama
LLM_MODEL=qwen2.5:14b
```

> ⚠️ Anthropic Claude / Google Gemini 原生 API 协议不兼容 OpenAI，需要走 OpenRouter 或自建代理（如 [LiteLLM](https://github.com/BerriAI/litellm)）转译。原生适配将在 v0.2 评估。

### 自检：怎么知道我配的 Provider 真能用？

仓库自带一键自检脚本，用 `/chat/completions` 发一句 `ping` 探测每家：

```bash
# 1. 拷贝模板（首次运行会自动生成 .example）
cp .env.providers.test.example .env.providers.test

# 2. 把你有 key 的 provider 那行取消注释、填值（没填的会自动 skip）
#    例：DEEPSEEK_KEY=sk-xxxxxxxx

# 3. 跑！
pnpm verify:providers
```

输出示例：

```
Provider              Model                       Status   Dur     Info
-----------------------------------------------------------------------------
LKEAP · Token Plan    glm-5.1                     ✓ PASS   1024ms  → ...
DeepSeek 官方          deepseek-chat               ✓ PASS   780ms   → ping
阿里 DashScope         qwen-turbo                  ✗ FAIL   401     Invalid API-key
```

`.env.providers.test` 已加入 `.gitignore`，不会污染仓库。

---

## 架构

```
┌─────────────────────────────────────────────────────────┐
│  Desktop (Electron) │ CLI (tsx)                         │  入口层
└──────┬──────────────┴────────┬──────────────────────────┘
       │                       │
       ▼                       ▼
┌─────────────────────────────────────────────────────────┐
│  packages/agents                                        │
│    - runner        （OpenAI 兼容 LLM + tool calling）   │
│    - buffett       （巴菲特人格 prompt）                │
│    - duan          （段永平人格 prompt）                │
│    - judge         （两段合议 + verdict）               │
│    - reviewer      （AI 复核员，独立上下文）            │
└──────┬──────────────────────────────────────────────────┘
       │  HTTP
       ▼
┌─────────────────────────────────────────────────────────┐
│  services/data-sidecar  (Python + akshare)              │
│    /quote /profile /financial /valuation                │
│    /dividend /historical-pe /industry-compare /healthz  │
└─────────────────────────────────────────────────────────┘
```

### 目录速查

| 路径 | 作用 |
|---|---|
| `apps/cli` | TypeScript CLI 入口（`pnpm ask`） |
| `apps/desktop` | Electron 桌面端（electron-vite + electron-builder） |
| `packages/agents` | 大师人格 + LLM runner + 复核员 |
| `packages/data` | 数据边车 TypeScript 客户端 |
| `services/data-sidecar` | Python akshare HTTP 服务 |
| `prompts/` | `buffett.md` / `duan.md` / `judge.md` / `reviewer.md` — 产品灵魂 |
| `reports/` | 报告落盘目录（HTML + Markdown + meta.json） |
| `landing/` | 早期 Landing Page 原型（静态） |

---

## 核心设计决策

| 决策 | 为什么 |
|---|---|
| **LLM 禁止自算数字** | 幻觉是投资决策的头号敌人，数字只能来自 akshare |
| **三段式 PASS/FAIL/GRAY** | 逼 Agent 承认"看不懂"，能力圈外直接拒答 |
| **judge 只做加权不引入新论据** | 合议员的职责是裁决，不是再发明事实 |
| **reviewer 独立上下文 + 输出长度硬约束** | 防 JSON 截断、防自辩、issues ≤ 5、每条 ≤ 60 字 |
| **verdict 枚举：`worth_research / skip / out_of_competence`** | 不用"买入/卖出"——价投不替你下单，只告诉你值不值得继续研究 |

---

## 路线图

- [x] **W1** 数据边车 + 三段式 prompt + Buffett/段永平 Agent
- [x] **W1** CLI 串通本地链路
- [x] **W2** judge 合议员 + HTML 报告
- [x] **W2** Electron 桌面端（NSIS / Portable）
- [x] **W2** AI 复核员（reviewer）+ 失败自动重试 + JSON 截断抢救
- [x] **W3** 批量跑样例（茅台 600519 / 平安 601318 / 工行 601138 已验证）
- [x] **W4** reviewer 结果落 `meta.json`，payload 附 `llm_meta`（finish_reason / truncated / 预算使用）
- [x] **W6** 公开发布（v0.1.15 · 2026-05-10）
- [ ] **W3** 芒格 Agent + 三方圆桌辩论
- [ ] **W4** 能力圈档案（SQLite）+ 持仓周报 + 企微推送
- [ ] **W5** Web UI（React Flow 可视化合议链路）
- [ ] **W6** 公众号推介 + 样例报告集

详见 [`CHANGELOG.md`](./CHANGELOG.md)。

---

## 贡献

单人开发，欢迎 fork、借鉴、提 issue 和 PR。响应不一定及时，但认真的讨论都会看。

如果你打算扩展 prompt（比如加芒格、加彼得·林奇），直接在 `prompts/` 里仿照现有格式写，再到 `packages/agents/src/` 里加个 runner 就能接入委员会。

---

## 免责声明

本工具是**研究辅助**，不是投顾服务。所有输出仅用于帮你**独立思考**，不构成任何买卖建议。投资决策由你自己负责。

> "能力圈的大小不重要，知道能力圈的边界在哪里才重要。" —— 巴菲特

---

## License

[MIT](./LICENSE) © 2026 huahai
