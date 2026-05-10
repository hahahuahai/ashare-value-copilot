# RUN — 端到端跑通操作单

## 当前环境状态（2026-05-10 09:29）

- ✅ 数据边车在跑：`http://127.0.0.1:9876/healthz` → `{"ok": true}`，PID 5816
- ✅ pnpm 依赖已装好，esbuild 已 rebuild
- ⏳ `.env` 待填（仅缺 LLM key）
- ⏳ `reports/` 目录已建好，等首份报告落盘

---

## 三步跑通

### 1. 填 `.env`（项目根）

```bash
cp .env.example .env
# 编辑 .env，把 LLM_API_KEY=sk-xxx 换成真 key
```

腾讯云 LKEAP 推荐（申请 https://cloud.tencent.com/document/product/1772）；不想花钱可切本地 Ollama（注释里有模板）。

### 2. 健康检查

```bash
# 边车（应返回 ok）
curl http://127.0.0.1:9876/healthz

# CLI 自检
pnpm ping
```

### 3. 跑茅台

```bash
pnpm ask 600519
```

期望输出：
- 拉数据约 5–10 秒
- 巴菲特 + 段永平两份意见各占一段
- 落盘到 `reports/600519-2026-05-10.md`

---

## 边车挂了怎么办

```bash
# 找占用 9876 的 PID
netstat -ano | grep :9876

# 精准 kill（替换 <PID>）
taskkill //PID <PID> //F

# 重启
cd services/data-sidecar && python main.py &
```

不要用 `taskkill //F //IM python.exe` —— 太广，会误杀别的 Python。

---

## 已验证数据（茅台 600519，as_of 2026-05-08）

| 指标 | 值 |
|------|---|
| 收盘 | 1372.99 |
| PE_TTM | 20.79 |
| PB | 6.35 |
| 总市值 | 1.72 万亿 |
| 2025 ROE | 33.65% |
| 2026Q1 ROE | 10.06% |
| 资产负债率 | 16.4% |
| 行业 | 白酒Ⅱ |
| 上市日 | 2001-08-27 |

数据层已通，待 LLM 端到端首跑。

---

## 下一步选项（跑通后再选）

- W2-A：再压 4 支（平安 601318 / 腾讯 00700.HK 暂不做 / 福耀 600660 / 海天 603288 / 五粮液 000858），出 5 支样例报告攒发布势能
- W2-B：landing 接真实 demo（点击"试试茅台"直接展示 reports/600519-*.md）
- W2-C：建 git 仓库 + 写第一篇推介文案（公众号/知乎）
