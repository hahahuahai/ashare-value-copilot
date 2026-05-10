# Changelog

本项目所有值得被记住的改动都记在这里。

格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [SemVer](https://semver.org/lang/zh-CN/)。

桌面端版本见 `apps/desktop/package.json`；项目级里程碑以 W1 / W2 … 周为单位。

> ⚠️ 本仓库 `d25e205` 才首次提交（initial commit 即 v0.1.13），更早的 0.1.0 ~ 0.1.12 仅在本地迭代，没有公开 commit。下方仅记录有 commit 可追溯的版本。

---

## [Unreleased]

### Planned
- reviewer 结果落进 `reports/*.meta.json`（目前 meta 只存 buffett/duan/judge）
- 芒格 Agent，三方圆桌辩论
- 5 支样例批量跑（茅台 / 平安 / 福耀 / 海天 / 五粮液）
- 能力圈档案（SQLite）+ 持仓周报 + 企微推送

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
