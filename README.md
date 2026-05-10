# 价投合伙人 · A-Share Value Copilot

> 一个开源的本地 AI 投研合伙人。把"好生意 / 好公司 / 好价格"编码进价投大师 Agent，替你做尽调、出三段式报告、自我复核、桌面端一键跑。
>
> **ai-hedge-fund 教你做对冲基金，价投合伙人教你少做交易。**

![status](https://img.shields.io/badge/status-public--beta-brightgreen) ![version](https://img.shields.io/badge/desktop-v0.1.15-blue) ![license](https://img.shields.io/badge/license-MIT-green) ![platform](https://img.shields.io/badge/platform-Windows-lightgrey)

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
- 🔑 **自带 API Key**：OpenAI 兼容协议，支持腾讯云 LKEAP（含 Token Plan 思考型套餐）/ DeepSeek / Ollama。思考型模型（如 glm-5.1）的 reasoning 链很费 token，v0.1.15 起默认预算已拉到 16384 并内置截断重试

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
