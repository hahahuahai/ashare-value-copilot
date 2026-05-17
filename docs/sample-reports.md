# 样例报告库

这些报告是仓库里已经落盘的真实输出，用来快速判断价投合伙人的报告形态、裁判结论和可追溯元数据。HTML 文件在 GitHub 上会以源码形式展示；下载仓库后可直接用浏览器打开。

> 本页所有内容仅用于研究辅助，不构成任何买卖建议。

| 股票 | 报告 | 裁判结论 | 一句话 |
|---|---|---|---|
| 中国平安 `601318` | [HTML](../reports/601318-e2e-2026-05-10.html) · [judge](../reports/601318-e2e-2026-05-10.judge.txt) · [meta](../reports/601318-e2e-2026-05-10.meta.json) | `worth_research` | PE 8.19 处 21% 分位，金融生态稳但投资端待考。 |
| 工业富联 `601138` | [HTML](../reports/601138-e2e-2026-05-10.html) · [judge](../reports/601138-e2e-2026-05-10.judge.txt) · [meta](../reports/601138-e2e-2026-05-10.meta.json) | `pass` | PE 30.89 处 92% 分位，代工龙头毛利率仅 7%，现金流严重失配。 |
| 工业富联 `601138-v016-smoke` | [HTML](../reports/601138-v016-smoke.html) | smoke sample | 用于验证 HTML 报告渲染。 |
| 贵州茅台 `600519` | [Markdown](../reports/600519-2026-05-10.md) | markdown sample | CLI 早期 Markdown 输出样例。 |
| 五粮液 `000858` | [HTML](../reports/000858-test.html) · [Buffett](../reports/000858-test.buffett.md) · [Duan](../reports/000858-test.duan.md) · [judge](../reports/000858-test.judge.txt) | test sample | 拆分大师原文和裁判输出的测试样例。 |

## 建议补充的公开样例

下一批最适合补齐这些代表性公司，方便读者快速理解不同类型公司的结论差异：

| 类型 | 股票 |
|---|---|
| 高 ROE 消费 | 贵州茅台 `600519`、五粮液 `000858` |
| 金融低估值 | 中国平安 `601318`、招商银行 `600036` |
| 制造龙头 | 比亚迪 `002594`、宁德时代 `300750` |
| 现金流/周期压力 | 工业富联 `601138`、海康威视 `002415` |

## 如何生成新的样例

```bash
pnpm sidecar
pnpm ask 600519
```

桌面端生成的完整报告会写入用户数据目录；CLI 报告会写入仓库根目录的 `reports/`。
