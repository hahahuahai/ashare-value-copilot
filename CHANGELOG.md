# Changelog

本项目所有值得被记住的改动都记在这里。

格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [SemVer](https://semver.org/lang/zh-CN/)。

桌面端版本见 `apps/desktop/package.json`；项目级里程碑以 W1 / W2 … 周为单位。

> ⚠️ 本仓库 `d25e205` 才首次提交（initial commit 即 v0.1.13），更早的 0.1.0 ~ 0.1.12 仅在本地迭代，没有公开 commit。下方仅记录有 commit 可追溯的版本。

---

## [Unreleased]

### Added
- macOS 桌面端出包配置：新增 `desktop:dist:mac` / `dist:mac`，默认生成 Apple Silicon (`arm64`) 的 DMG / ZIP。
- 跨平台 sidecar 构建脚本：新增 `scripts/build-sidecar.mjs`，Windows 与 macOS 共用同一套 PyInstaller 打包入口。
- macOS 图标准备脚本：新增 `scripts/prepare-mac-icon.mjs`，在 Mac 上用系统工具生成 `resources/icon.icns`。

### Changed
- 桌面端打包脚本从 PowerShell 专用 sidecar 构建切换为 Node 跨平台脚本，降低在 MacBook 上拉仓库后出包的环境差异。

### Planned
- reviewer 结果落进 `reports/*.meta.json`（目前 meta 只存 buffett/duan/judge）
- 5 支样例批量跑（茅台 / 平安 / 福耀 / 海天 / 五粮液）
- 能力圈档案（SQLite）+ 持仓周报 + 企微推送

---

## [0.2.2] - 2026-05-16

### Added
- **免 Python 桌面发布包**：新增 `scripts/build-sidecar.ps1`，用 PyInstaller 将 `services/data-sidecar/main.py` 打包为内置 `value-copilot-sidecar`。
- **发布脚本自动打包边车**：`desktop:dist` / `desktop:portable` / `desktop:nsis` 会先构建 sidecar，再打 Electron 包。
- **GitHub Actions CI**：新增 Windows CI，覆盖 TypeScript build、sidecar executable build、desktop build。
- **样例报告库与产品备忘**：新增 `docs/sample-reports.md` 与 `docs/product-ideas.md`，方便开源展示与后续 roadmap 拆分。

### Changed
- **桌面端启动优先使用内置边车**：普通用户下载桌面包后不再需要安装 Python；源码模式仍可回退到 `pnpm sidecar`。
- **桌面 UI 改为浅色 Apple 风格**：主界面、设置弹窗、Markdown 报告区切换为浅色玻璃质感、Apple Blue 主色与更轻的层级。
- **README 首屏重写**：前置样例报告、可信度工程、快速开始和开源展示信息。
- `apps/desktop/package.json` 版本号 `0.2.1` → `0.2.2`。

---

## [0.2.1] - 2026-05-15

### Added
- **A 股公司名 / 股票代码模糊搜索**：桌面端输入 `中国`、`中国平安`、`6013` 等关键词会弹出候选，选中后输入框显示 `公司名 股票代码`。
- **CLI 同步支持模糊输入**：`pnpm ask 中国平安` / `pnpm ask 中国平安 601318` 均可解析到 6 位 A 股代码。
- **股票名录缓存与启动预热**：sidecar 将 A 股名录按天缓存到本地，并在桌面端启动后后台预热，降低首次搜索等待。

### Changed
- **报告标题统一显示公司名 + 代码**：新生成的 Markdown / HTML 报告标题改为 `中国平安 601318 · 价投合伙人报告`。
- **桌面 sidecar 默认端口改为 9877**：避免旧 portable 包残留的 `9876` sidecar 遮蔽新版 `/search` 接口。
- **搜索下拉状态更明确**：搜索中、无匹配、失败原因都会在下拉层显示，不再静默消失。
- `apps/desktop/package.json` 版本号 `0.2.0` → `0.2.1`。

---

## [0.2.0] - 2026-05-11

### Added
- **多大师体系：8 位价值投资大师可自由组合**
  - 新增 6 位大师 Agent：查理·芒格（否决视角）、彼得·林奇（成长股 PEG）、霍华德·马克斯（周期与第二层思维）、本杰明·格雷厄姆（防御性投资 7 标准）、菲利普·费雪（管理层质量 + 闲聊法）、李录（中国语境价投）
  - 每位大师拥有独立 system prompt（prompts/*.md），深度差异化人格、输出格式、思维模型
  - 默认启用 4 位（巴菲特、段永平、芒格、李录），可在设置中自由增减
- **MasterDef 注册表**（`packages/agents/src/masters.ts`）：数据驱动的大师管理，新增大师只需追加注册表 + 写 prompt 文件
- **设置面板"分析师"页签**：可视化多选启用/禁用大师，实时显示启用数量
- **settings.json 持久化**：大师选择独立于 .env，存储在用户数据目录

### Changed
- **ask 流程改为动态循环**：主进程按用户启用的大师列表顺序执行，不再硬编码 buffett→duan
- **runJudge / runReview 签名重构**：从 `{ buffett, duan }` 改为 `{ analyses: MasterAnalysis[] }`，支持任意数量大师组合
- **HTML 报告多大师渲染**：大师原文段从硬编码双块改为循环渲染，自动适配启用的大师数量
- **App.tsx 动态多卡片**：流式展示从固定双列改为 flex-wrap 自适应布局，Phase 状态从枚举改为 string
- **可信度自检**：截断检测扩展到所有启用大师（不再只检查 buffett/duan）
- **CLI 同步**：`pnpm ask` 自动跑默认启用的大师列表
- **preload API 扩展**：新增 `getMasters`/`setMasters`/`onWarn`，`onChunk` 的 master 字段从联合类型改为 string

### Compatibility
- **payload.json 向后兼容**：同时写 analyses[] 数组和 buffett/duan 平铺字段，旧版复核 IPC 仍可读
- **parseLegacyMd 保持不动**：v0.1.x 生成的旧报告仍可被复核降级模式解析
- **judge.md masters 字段动态**：裁判 prompt 要求为所有启用大师填写 verdicts，不限于 buffett/duan

---

## [0.1.16] - 2026-05-10

### Added
- **多 LLM Provider 全面扩展（4 → 13 家）**：桌面端设置面板新增 9 家 OpenAI 兼容 provider 预设
  - 中国大陆直连：阿里 DashScope（通义千问）、智谱 GLM、月之暗面 Kimi、字节豆包（火山方舟）、硅基流动 SiliconFlow
  - 海外聚合：OpenRouter（含 Claude / Gemini / GPT 等数百模型）、xAI Grok、OpenAI 官方
  - 离线本地：Ollama
  - 每家含 base_url、推荐模型清单、申请 Key 链接、使用提示
- **README 顶部动态徽章**：`Latest Release / Release Date / Total Downloads`（shields.io 实时拉 GitHub）
- **README 新增「支持的 LLM Provider」章节**：13 行表格对比 + 「选哪个」三句话决策（性价比 / 质量 / 隐私）+ CLI `.env` 三个范例
- **Provider 自检脚本**：`scripts/verify-providers.mjs` + `pnpm verify:providers` 命令
  - 13 家并发探测 `/chat/completions` 发 "ping"，15s 超时
  - 表格输出 ✓ PASS / ✗ FAIL + 耗时 + 错误片段
  - 未填 key 的 provider 自动 skip，零依赖（node 内置 fetch）
- **`.env.providers.test.example`**：自检脚本配置模板（首次运行自动生成），`.env.providers.test` 已 gitignore

### Changed
- `apps/desktop/package.json` 版本号 `0.1.15` → `0.1.16`
- `apps/desktop/src/renderer/src/SettingsModal.tsx`：`Provider` union 类型 4 → 13，`PROVIDERS` 数组扩展，`detectProvider` base_url 匹配规则同步扩展（含 ollama 三种 localhost 形式）
- `.gitignore`：新增 `apps/desktop/out/`（清理 112552 行已跟踪构建产物）+ `.env.providers.test`

### Notes
- Anthropic Claude / Google Gemini 原生协议不兼容 OpenAI，README 已明确建议走 OpenRouter 或 LiteLLM 转译；原生适配排期 v0.2

---

## [0.1.15] - 2026-05-10

### Fixed
- **巴菲特/段永平原文流式中断 bug（长期高频复现）**：根因是 `llm.ts` 全程不读 `finish_reason`，截断响应被当作成功落盘；三处 `max_tokens` 不一致（runMaster 4096 / runMasterStream 8192 / judge+reviewer 16384），思考型模型的 `reasoning_content` 与 `content` 共享预算导致 content 被吃空
- **Tier 1**：`complete` / `completeStream` 新增 `CompletionMeta`（`finish_reason` / `truncated` / `retried_on_length` / `retried_on_thinking` / `max_tokens_used`），`finish_reason === "length"` 时自动一次性翻倍预算重试（上限 32768）
- **Tier 2**：默认预算从 4096 → 16384，runMaster / runMasterStream 统一到 16384；`completeMasterStream` 截断检测强化为「结构（三段式/PASS 关键词）+ 末尾合法标点收束 + 非 length 截断」三重校验，任一不满足即重试
- **桌面端**：截断时通过 `ask:warn` IPC 推送警告；`payload.json` 新增 `llm_meta` 字段，记录每段大师原文的 `finish_reason` 等元信息，便于排错

### Changed
- `apps/desktop/package.json` 版本号 `0.1.14` → `0.1.15`

---

## [0.1.14] - 2026-05-10

### Changed
- **prompts/judge.md**：verdict 枚举从 `pass` 改名为 `skip`（中文语义"通过"和实际"跳过"冲突），新增铁律 #4 明确枚举集合
- **prompts/reviewer.md**：新增"输出长度硬约束"段落，issues ≤ 5、每条 quote/problem/suggestion ≤ 60 字，禁 markdown，强制先 `overall` 后 `issues`，JSON 必须 `]}` 闭合
- **apps/desktop render-report.ts**：verdictBadge 映射同时接受 `skip` 和 legacy `pass`，老报告零破坏

### Added
- `.gitattributes`：默认 `* text=auto eol=lf`，`.bat/.cmd/.ps1` 保留 CRLF，二进制文件标 `binary`，治理 Windows CRLF 警告
- `LICENSE`（MIT + 投资免责附加声明）
- `CHANGELOG.md`（本文件）
- `README.md` 精修：反映桌面端 / 复核员 / verdict 枚举 / 真实 sidecar endpoints

### Fixed
- `prompts/reviewer.md` 第 34-35 行遗留的废弃 verdict `fit_buy` → `worth_research`

### Chore
- 初始化 GitHub Private 仓库（`hahahuahai/ashare-value-copilot`），脱敏 `RUN.md` 中的 LKEAP 引用
- `apps/desktop/package.json` 版本号 `0.1.13` → `0.1.14`，打 NSIS + Portable 双包

---

## [0.1.13] - 2026-05-10

> 仓库的 initial commit（`d25e205`），已包含下列功能。

### Features (initial commit 已带)
- **数据边车**：Python + akshare HTTP 服务，端口 9876，暴露 `/quote /profile /financial /valuation /dividend /historical-pe /industry-compare /healthz`
- **巴菲特 + 段永平双 Agent**：强制 `PASS / FAIL / GRAY` 三段式输出，能力圈门禁，反幻觉铁律（数字必须来自 tool call）
- **judge 合议员**：对两段输出做加权合议，产出 `verdict + scores (business/moat/price) + OCF/NetProfit 质量比`
- **AI 复核员（reviewer）**：独立上下文 Agent，对照原文扫引用 / 矛盾 / 估值跳跃，产出 `issues[] + overall + verdict`，失败自动重试 + JSON 截断三级抢救
- **CLI**：`pnpm ask <code>` / `pnpm ping`
- **Electron 桌面端**：electron-vite + electron-builder，NSIS + Portable 双发行
- **HTML 报告**：三段式 + judge 卡片 + reviewer 卡片 + 免责声明
- **`reports/*.meta.json`**：保存 `buffett_len / duan_len / judge_obj`（reviewer 暂未写入）
- **prompts 单一真相源**：`prompts/{buffett,duan,judge,reviewer}.md`，桌面端通过 `extraResources` 打包

---

## 版本号约定

- **0.0.x** — 原型期，接口随意改（无 commit 留存）
- **0.1.x** — MVP 期（当前阶段），单人自用，向后兼容在"尽量不破坏老报告"范围内努力
- **0.x.y** — 公开发布前，功能迭代
- **1.0.0** — 首次公开发布，锁定 prompt 接口 + 报告 schema

桌面端 `apps/desktop/package.json` 的版本号独立演进，和项目级 CHANGELOG 条目粒度对齐。
