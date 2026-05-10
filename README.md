# 价投合伙人 · A-Share Value Council

> 一个开源的本地 AI 投研合伙人。把"好生意 / 好公司 / 好价格"编码进价投大师 Agent，替你做尽调、出三段式报告、写持仓周报。
>
> **ai-hedge-fund 教你做对冲基金，价投合伙人教你少做交易。**

⚠️ **当前状态：MVP / W1-W2，本地开发期，未公开发布。**

## 这个项目是什么

- 🇨🇳 **A 股原生**：akshare 免费数据，不依赖任何付费 API
- 🧠 **中文大师人格**：巴菲特 + 段永平（W3 加芒格），强制三段式 PASS/FAIL/GRAY 输出
- 🔒 **能力圈门禁**：看不懂的生意直接拒绝分析，不装懂
- 📐 **反幻觉**：所有数字必须来自 tool call，禁止 LLM 自算
- 🔑 **自带 API Key**：OpenAI 兼容协议，支持 LKEAP / DeepSeek / Ollama

## 跑起来

### 1. 启动数据边车（一个终端）

```bash
cd services/data-sidecar
pip install -r requirements.txt
python main.py
# 监听在 http://127.0.0.1:9876
```

### 2. 配置 LLM（另一个终端）

```bash
cp .env.example .env
# 编辑 .env，填入 LLM_BASE_URL / LLM_API_KEY / LLM_MODEL
```

### 3. 安装依赖 + 调用大师委员会

```bash
pnpm install
pnpm ask 600519        # 贵州茅台
pnpm ask 601318        # 中国平安
```

报告会输出到 `reports/{code}-{date}.md`。

## 架构（MVP）

```
apps/cli                # TS CLI 入口
packages/agents         # 大师人格 + LLM runner
packages/data           # 数据边车 TS 客户端
services/data-sidecar   # Python akshare HTTP 服务
prompts/
  buffett.md            # 巴菲特 system prompt（产品灵魂）
  duan.md               # 段永平 system prompt
landing/                # Landing Page 静态原型
```

## 路线图

- [x] W1 数据边车 + 三段式 prompt
- [x] W1 Buffett / 段永平 prompt v0
- [x] W1 CLI 串通本地链路
- [ ] W2 报告样例 5 支股票（茅台/平安/腾讯/福耀/海天）
- [ ] W3 芒格 Agent + 三方圆桌辩论
- [ ] W4 能力圈档案（SQLite） + 持仓周报 + 企微推送
- [ ] W5 Web UI（React Flow 可视化）
- [ ] W6 公开发布

## 免责声明

本工具是研究辅助，不是投顾服务。所有输出仅用于帮你**独立思考**，不构成任何买卖建议。
投资决策由你自己负责。
