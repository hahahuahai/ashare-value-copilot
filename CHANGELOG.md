# Changelog

本项目所有值得被记住的改动都记在这里。

格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [SemVer](https://semver.org/lang/zh-CN/)。

桌面端版本见 `apps/desktop/package.json`；项目级里程碑以 W1 / W2 … 周为单位。

---

## [Unreleased]

### Planned
- 芒格 Agent，三方圆桌辩论
- 5 支样例批量跑（茅台 / 平安 / 福耀 / 海天 / 五粮液）
- 能力圈档案（SQLite）+ 持仓周报 + 企微推送

---

## [0.1.14] - 2026-05-10

### Changed
- **prompts/judge.md**：verdict 枚举从 `pass` 改名为 `skip`（中文语义"通过"和实际"跳过"冲突），新增铁律 #4 明确枚举集合
- **prompts/reviewer.md**：新增"输出长度硬约束"段落，issues ≤ 5、每条 quote/problem/suggestion ≤ 60 字，禁 markdown，强制先 `overall` 后 `issues`，JSON 必须 `]}` 闭合
- **apps/desktop render-report.ts**：verdictBadge 映射同时接受 `skip` 和 legacy `pass`，老报告零破坏

### Added
- `.gitattributes`：默认 `* text=auto eol=lf`，`.bat/.cmd/.ps1` 保留 CRLF，二进制文件标记 `binary`，治理 Windows CRLF 警告
- `LICENSE`（MIT）+ 附加免责声明
- `CHANGELOG.md`（本文件）
- `README.md` 精修：反映桌面端 / 复核员 / verdict 枚举 / 架构图等当前真实状态

### Fixed
- `prompts/reviewer.md` 第 34-35 行遗留的废弃 verdict `fit_buy` → `worth_research`

### Chore
- 初始化 GitHub Private 仓库（`hahahuahai/ashare-value-copilot`），脱敏 `RUN.md` 中的 LKEAP 引用

---

## [0.1.13] - 2026-05-10

### Added
- **AI 复核员（reviewer）**：独立上下文 Agent，对照原文扫引用不符 / 数字矛盾 / 估值跳跃，产出 `issues[] + overall + verdict`
- 复核失败自动重试 + JSON 截断三级抢救（brace-depth 扫 overall + issues 数组）
- HTML 报告尾部嵌入复核卡片（issues 折叠 + overall 摘要 + verdict badge）
- `reports/*.meta.json` 落盘，保存 scores / verdict / OCF-NP / reviewer 结构化结果

### Changed
- Electron 桌面端一键跑流程打通：表单 → runner → judge → reviewer → HTML 渲染 → 自动打开

---

## [0.1.10] - 2026-05-09

### Added
- judge 合议员：对巴菲特 + 段永平两段输出做加权合议，产出 `verdict + scores (business/moat/price) + OCF/NetProfit 质量比`
- HTML 报告模板（三段式 + judge 卡片 + 免责声明）
- electron-builder NSIS + Portable 双发行配置

---

## [0.1.0] - 2026-05-08

### Added
- 首次端到端跑通：CLI `pnpm ask 600519` → 数据边车 → 巴菲特 + 段永平 Agent → Markdown 报告
- `services/data-sidecar`：Python + akshare，暴露 `/quote /fin /industry /capital_flow` 等接口
- `packages/agents`：OpenAI 兼容 runner + tool calling
- `prompts/buffett.md` + `prompts/duan.md`：双大师人格 v0，强制 `PASS / FAIL / GRAY` 三段式输出
- 能力圈门禁：看不懂的生意直接拒绝分析
- 反幻觉铁律：所有数字必须来自 tool call

---

## 版本号约定

- **0.0.x** — 原型期，接口随意改
- **0.1.x** — MVP 期（当前阶段），单人自用，向后兼容在"尽量不破坏老报告"范围内努力
- **0.x.y** — 公开发布前，功能迭代
- **1.0.0** — 首次公开发布，锁定 prompt 接口 + 报告 schema

桌面端 `apps/desktop/package.json` 的版本号独立演进，和项目级 CHANGELOG 条目粒度对齐。
