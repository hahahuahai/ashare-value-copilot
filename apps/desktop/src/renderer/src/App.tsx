import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { VCApi, MasterInfo, StockSearchResult } from "../../preload";
import { SettingsModal } from "./SettingsModal";

declare global {
  interface Window {
    vc: VCApi;
  }
}

/** Phase 不再枚举所有大师 — 用 "master:<id>" 表示某大师正在跑 */
type Phase = "idle" | "fetching" | "judge" | "done" | "error" | string;

interface DataPackInfo {
  code: string;
  name: string;
  fetched_at: string;
  valuation: any;
  quote: any;
  profile: any;
  financial_rows: number;
}

interface ReportItem {
  file: string;
  path: string;
  name: string;
  code: string;
  date: string;
  type: "md" | "html";
  mtime: number;
}

/** 每位大师的流式状态 */
interface MasterState {
  thinking: string;
  answer: string;
  active: boolean;
  done: boolean;
}

type WorkspaceTab = "analysis" | "watchlist" | "screener" | "archive" | "risk" | "compare" | "principles" | "export";

interface WatchItem {
  code: string;
  name: string;
  group: string;
  verdict: string;
  note: string;
  updatedAt: string;
  price?: number | null;
  pe?: number | null;
  pb?: number | null;
  marketCap?: number | null;
  financialRows?: number;
}

interface Principle {
  id: string;
  text: string;
  enabled: boolean;
}

interface RiskSignal {
  level: "high" | "mid" | "low";
  title: string;
  detail: string;
}

interface AiTaskResult {
  title: string;
  summary: string;
  bullets: string[];
  actions: string[];
  warnings: string[];
  error?: string;
}

const workspaceTabs: Array<{ id: WorkspaceTab; label: string; hint: string }> = [
  { id: "analysis", label: "分析", hint: "单家公司报告" },
  { id: "watchlist", label: "自选", hint: "长期跟踪池" },
  { id: "screener", label: "筛选", hint: "候选研究池" },
  { id: "archive", label: "档案", hint: "公司历史" },
  { id: "risk", label: "风险", hint: "财务雷达" },
  { id: "compare", label: "对比", hint: "横向比较" },
  { id: "principles", label: "原则", hint: "个人投资清单" },
  { id: "export", label: "导出", hint: "复用摘要" },
];

function StatBadge({ phase, enabledMasters }: { phase: Phase; enabledMasters: MasterInfo[] }) {
  if (phase === "idle") return <span className="px-2 py-0.5 rounded text-xs bg-panel2 text-mute border border-line">就绪</span>;
  if (phase === "fetching") return <span className="px-2 py-0.5 rounded text-xs bg-amber/10 text-amber border border-amber/20">拉取数据中</span>;
  if (phase === "judge") return <span className="px-2 py-0.5 rounded text-xs bg-amber/10 text-amber border border-amber/20">裁判汇总中</span>;
  if (phase === "done") return <span className="px-2 py-0.5 rounded text-xs bg-jade/10 text-jade border border-jade/20">已完成</span>;
  if (phase === "error") return <span className="px-2 py-0.5 rounded text-xs bg-red/10 text-red-soft border border-red/20">出错</span>;
  // 某位大师正在跑
  const m = enabledMasters.find((x) => x.id === phase);
  const name = m?.displayName ?? phase;
  return <span className="px-2 py-0.5 rounded text-xs bg-gold/10 text-gold border border-gold/20">{name}思考中</span>;
}

function MasterCard({
  title,
  subtitle,
  thinking,
  answer,
  active,
  done,
}: {
  title: string;
  subtitle: string;
  thinking: string;
  answer: string;
  active: boolean;
  done: boolean;
}) {
  const [showThinking, setShowThinking] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current && active) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [thinking, answer, active]);

  const empty = !thinking && !answer;

  return (
    <div className="flex flex-col bg-panel rounded-lg border border-line min-h-0 flex-1 min-w-[260px] shadow-[var(--shadow-soft)] backdrop-blur-xl">
      <div className="px-4 py-3 border-b border-line flex items-center justify-between">
        <div>
          <h3 className="text-ink font-semibold text-base">{title}</h3>
          <p className="text-mute text-xs mt-0.5">{subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          {active && !answer && (
            <span className="text-xs text-mute">
              <span className="dot" /><span className="dot" /><span className="dot" />
            </span>
          )}
          {done && <span className="text-jade text-xs">✓</span>}
          {thinking && (
            <button
              onClick={() => setShowThinking((v) => !v)}
              className="text-xs text-mute hover:text-gold border border-line bg-panel2 px-2 py-0.5 rounded"
            >
              {showThinking ? "隐藏思考" : "查看思考"}
            </button>
          )}
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3">
        {empty && <p className="text-mute text-sm">等待开始...</p>}

        {showThinking && thinking && (
          <div className="mb-4 p-3 rounded bg-panel2 border border-line">
            <p className="text-xs text-mute mb-2">思考过程（不计入最终报告）</p>
            <pre className="text-xs text-mute whitespace-pre-wrap font-mono leading-relaxed">{thinking}</pre>
          </div>
        )}

        {answer && (
          <div className="md-body">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{answer}</ReactMarkdown>
          </div>
        )}

        {!answer && active && thinking && (
          <p className="text-xs text-mute italic">模型正在内部推理（已写 {thinking.length} 字），稍后会输出最终回答...</p>
        )}
      </div>
    </div>
  );
}

function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="bg-panel2 rounded px-3 py-2 border border-line shadow-[var(--shadow-hairline)]">
      <div className="text-mute text-xs">{label}</div>
      <div className="text-ink font-semibold text-base mt-0.5">{value}</div>
      {hint && <div className="text-mute text-[11px] mt-0.5">{hint}</div>}
    </div>
  );
}

function fmt(n: any, digits = 2): string {
  if (n === null || n === undefined || n === "") return "—";
  const v = Number(n);
  if (!Number.isFinite(v)) return String(n);
  return v.toLocaleString("zh-CN", { maximumFractionDigits: digits });
}

function fmtBig(n: any): string {
  if (n === null || n === undefined || n === "") return "—";
  const v = Number(n);
  if (!Number.isFinite(v)) return String(n);
  if (v >= 1e12) return `${(v / 1e12).toFixed(2)} 万亿`;
  if (v >= 1e8) return `${(v / 1e8).toFixed(2)} 亿`;
  if (v >= 1e4) return `${(v / 1e4).toFixed(2)} 万`;
  return v.toLocaleString("zh-CN");
}

function stockLabel(name?: string | null, code?: string | null): string {
  if (name && code) return `${name} ${code}`;
  return code ?? name ?? "";
}

function extractStockCode(input: string): string | null {
  return input.match(/\b(\d{6})\b/)?.[1] ?? null;
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : fallback;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T) {
  window.localStorage.setItem(key, JSON.stringify(value));
}

function watchFromPack(pack: DataPackInfo, previous?: WatchItem): WatchItem {
  const valuation = pack.valuation ?? {};
  const quote = pack.quote ?? {};
  return {
    code: pack.code,
    name: pack.name,
    group: previous?.group ?? "核心观察",
    verdict: previous?.verdict ?? "待判断",
    note: previous?.note ?? "",
    updatedAt: new Date().toISOString(),
    price: Number.isFinite(Number(quote.price)) ? Number(quote.price) : null,
    pe: Number.isFinite(Number(valuation.pe_ttm)) ? Number(valuation.pe_ttm) : null,
    pb: Number.isFinite(Number(valuation.pb)) ? Number(valuation.pb) : null,
    marketCap: Number.isFinite(Number(valuation.total_mv)) ? Number(valuation.total_mv) : null,
    financialRows: pack.financial_rows,
  };
}

function riskSignalsFromPack(pack: DataPackInfo | null): RiskSignal[] {
  if (!pack) return [];
  const v = pack.valuation ?? {};
  const rows = Array.isArray((pack as any).financial?.rows) ? (pack as any).financial.rows : [];
  const latest = rows[0] ?? {};
  const signals: RiskSignal[] = [];
  const pe = Number(v.pe_ttm);
  const pb = Number(v.pb);
  const debt = Number(latest.debt_to_assets ?? latest.asset_liability_ratio ?? latest["资产负债率"]);
  const roe = Number(latest.roe ?? latest.roe_weighted ?? latest["净资产收益率"]);

  if (Number.isFinite(pe) && pe > 35) signals.push({ level: "mid", title: "估值偏高", detail: `PE TTM ${fmt(pe)}，需要更强的增长和确定性支撑。` });
  if (Number.isFinite(pb) && pb > 6) signals.push({ level: "mid", title: "PB 偏高", detail: `PB ${fmt(pb)}，需确认 ROE 可持续性。` });
  if (Number.isFinite(debt) && debt > 65) signals.push({ level: "high", title: "杠杆较高", detail: `资产负债率约 ${fmt(debt)}%，需要检查现金流和偿债压力。` });
  if (Number.isFinite(roe) && roe < 8) signals.push({ level: "mid", title: "ROE 偏弱", detail: `最近一期 ROE ${fmt(roe)}%，股东回报质量需要复核。` });
  if (!rows.length && (pack.financial_rows ?? 0) === 0) signals.push({ level: "low", title: "财务明细不足", detail: "当前快照缺少可用于趋势判断的财务行。" });
  if (signals.length === 0) signals.push({ level: "low", title: "未发现明显红灯", detail: "当前快照未触发基础风险规则，仍需结合报告和原始财报复核。" });
  return signals;
}

function AiInsightPanel({
  result,
  busy,
  onClose,
}: {
  result: AiTaskResult | null;
  busy: boolean;
  onClose: () => void;
}) {
  if (!result && !busy) return null;
  return (
    <div className="bg-panel rounded-lg border border-line shadow-[var(--shadow-soft)] backdrop-blur-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-line flex items-center gap-3">
        <div className="w-7 h-7 rounded bg-ink text-white flex items-center justify-center text-xs font-semibold">AI</div>
        <div className="flex-1">
          <div className="text-sm font-semibold text-ink">{busy ? "AI 助手思考中..." : result?.title}</div>
          <div className="text-xs text-mute">只基于当前页面上下文整理，不新增事实或数字。</div>
        </div>
        <button onClick={onClose} className="text-mute hover:text-ink text-sm">关闭</button>
      </div>
      {busy ? (
        <div className="px-4 py-4 text-sm text-mute">正在生成结构化建议，通常需要几秒到几十秒。</div>
      ) : result && (
        <div className="px-4 py-3 grid grid-cols-[1.2fr_1fr] gap-4">
          <div>
            <div className="text-sm text-ink leading-relaxed">{result.summary || "暂无摘要。"}</div>
            {result.bullets.length > 0 && (
              <ul className="mt-3 space-y-1.5 text-xs text-mute">
                {result.bullets.map((x, i) => <li key={i}>• {x}</li>)}
              </ul>
            )}
          </div>
          <div className="space-y-2">
            {result.actions.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-ink mb-1">下一步</div>
                <ul className="space-y-1 text-xs text-mute">{result.actions.map((x, i) => <li key={i}>• {x}</li>)}</ul>
              </div>
            )}
            {result.warnings.length > 0 && (
              <div className="bg-amber/10 border border-amber/20 rounded px-3 py-2">
                <div className="text-xs font-semibold text-amber mb-1">提醒</div>
                <ul className="space-y-1 text-xs text-mute">{result.warnings.map((x, i) => <li key={i}>• {x}</li>)}</ul>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [workspace, setWorkspace] = useState<WorkspaceTab>("analysis");
  const [mode, setMode] = useState<"start" | "workbench">("start");
  const [code, setCode] = useState("600519");
  const [searchResults, setSearchResults] = useState<StockSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [statusText, setStatusText] = useState<string>("就绪 — 输入代码后回车开始");
  const [pack, setPack] = useState<DataPackInfo | null>(null);

  // v0.2.0：动态大师状态 map（key=masterId）
  const [masterStates, setMasterStates] = useState<Record<string, MasterState>>({});
  const [enabledMasters, setEnabledMasters] = useState<MasterInfo[]>([]);

  const [reports, setReports] = useState<ReportItem[]>([]);
  const [healthInfo, setHealthInfo] = useState<{ ok: boolean; sidecarUrl: string; model: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedPath, setSavedPath] = useState<string | null>(null);
  const [savedHtmlUrl, setSavedHtmlUrl] = useState<string | null>(null);
  const [viewing, setViewing] = useState<{ title: string; body?: string; htmlUrl?: string; htmlPath?: string } | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [reviewResult, setReviewResult] = useState<{ ok: boolean; score?: number; level?: string; issues?: number; error?: string } | null>(null);
  const [historyReviewing, setHistoryReviewing] = useState(false);
  const [historyReviewMsg, setHistoryReviewMsg] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [forcedSetup, setForcedSetup] = useState(false);
  const [watchlist, setWatchlist] = useState<WatchItem[]>(() => readJson<WatchItem[]>("vc.watchlist", []));
  const [principles, setPrinciples] = useState<Principle[]>(() => readJson<Principle[]>("vc.principles", [
    { id: "p1", text: "不研究无法理解商业模式的公司。", enabled: true },
    { id: "p2", text: "优先关注长期高 ROE、低杠杆、现金流健康的公司。", enabled: true },
    { id: "p3", text: "估值没有安全边际时，只观察，不行动。", enabled: true },
  ]));
  const [selectedArchiveCode, setSelectedArchiveCode] = useState("");
  const [screen, setScreen] = useState({ maxPe: "35", maxPb: "6", group: "全部" });
  const [compareCodes, setCompareCodes] = useState<[string, string]>(["", ""]);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiResult, setAiResult] = useState<AiTaskResult | null>(null);
  const searchCacheRef = useRef<Record<string, StockSearchResult[]>>({});

  useEffect(() => writeJson("vc.watchlist", watchlist), [watchlist]);
  useEffect(() => writeJson("vc.principles", principles), [principles]);

  const refreshHealth = async () => setHealthInfo(await window.vc.health());
  const refreshReports = async () => setReports(await window.vc.listReports());

  // 加载启用的大师列表
  const refreshMasters = useCallback(async () => {
    const { all, enabled } = await window.vc.getMasters();
    setEnabledMasters(all.filter((m) => enabled.includes(m.id)));
  }, []);

  useEffect(() => {
    refreshHealth();
    refreshReports();
    refreshMasters();
    const offS = window.vc.onStatus(({ phase: p, text, path }) => {
      setStatusText(text);
      // phase 可以是 "fetching" / 任意大师 id / "judge" / "done"
      if (p === "done") {
        setPhase("done");
        if (path) {
          setSavedPath(path);
          window.vc.fileUrl(path).then(setSavedHtmlUrl).catch(() => setSavedHtmlUrl(null));
        }
        refreshReports();
        // 标记所有大师为 done
        setMasterStates((prev) => {
          const next = { ...prev };
          for (const k of Object.keys(next)) {
            next[k] = { ...next[k], active: false, done: true };
          }
          return next;
        });
      } else {
        setPhase(p);
        // 标记当前大师 active，前一位 done
        setMasterStates((prev) => {
          const next = { ...prev };
          for (const k of Object.keys(next)) {
            if (k === p) {
              next[k] = { ...next[k], active: true };
            } else if (next[k].active) {
              next[k] = { ...next[k], active: false, done: true };
            }
          }
          return next;
        });
      }
    });
    const offD = window.vc.onDataPack((p: any) => {
      setPack(p);
      if (p?.code) setCode(stockLabel(p?.name, p?.code));
    });
    const offC = window.vc.onChunk(({ master, phase: chunkPhase, delta }: { master: string; phase: "thinking" | "answer"; delta: string }) => {
      setMasterStates((prev) => {
        const cur = prev[master] ?? { thinking: "", answer: "", active: false, done: false };
        if (chunkPhase === "thinking") {
          return { ...prev, [master]: { ...cur, thinking: cur.thinking + delta } };
        } else {
          return { ...prev, [master]: { ...cur, answer: cur.answer + delta } };
        }
      });
    });
    const offN = window.vc.onNeedsSetup(() => {
      setForcedSetup(true);
      setSettingsOpen(true);
    });
    return () => { offS(); offD(); offC(); offN(); };
  }, []);

  useEffect(() => {
    const q = code.trim();
    if (!q || extractStockCode(q)) {
      setSearchResults([]);
      setSearchOpen(false);
      setSearching(false);
      setSearchError(null);
      return;
    }

    let cancelled = false;
    const cached = searchCacheRef.current[q];
    if (cached) {
      setSearchResults(cached);
      setSearchOpen(true);
      setSearching(false);
      setSearchError(null);
      return;
    }

    setSearching(true);
    setSearchError(null);
    setSearchOpen(true);
    const timer = window.setTimeout(async () => {
      try {
        const rows = await window.vc.searchStocks(q);
        if (!cancelled) {
          searchCacheRef.current[q] = rows;
          setSearchResults(rows);
          setSearchOpen(true);
        }
      } catch (e: any) {
        if (!cancelled) {
          setSearchResults([]);
          setSearchError(String(e?.message ?? e));
          setSearchOpen(true);
        }
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 120);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [code]);

  const onAnalyze = async () => {
    const input = code.trim();
    if (!input) { setError("请输入股票代码或公司简称"); return; }
    setError(null);
    setSearchOpen(false);
    setPhase("fetching");
    setStatusText("启动中...");
    setPack(null);
    setSavedPath(null);
    setSavedHtmlUrl(null);
    setViewing(null);
    setReviewResult(null);
    // 初始化所有大师状态
    await refreshMasters();
    const { enabled } = await window.vc.getMasters();
    const init: Record<string, MasterState> = {};
    for (const id of enabled) {
      init[id] = { thinking: "", answer: "", active: false, done: false };
    }
    setMasterStates(init);
    try {
      await window.vc.ask(input);
    } catch (e: any) {
      setPhase("error");
      setError(String(e?.message ?? e));
    }
  };

  const onReview = async () => {
    if (!savedPath || reviewing) return;
    setReviewing(true);
    setReviewResult(null);
    try {
      const r = await window.vc.review(savedPath);
      setReviewResult(r);
      if (savedHtmlUrl) {
        const fresh = savedHtmlUrl.split("?")[0] + "?t=" + Date.now();
        setSavedHtmlUrl(fresh);
        setViewing(v => v && v.htmlUrl ? { ...v, htmlUrl: fresh } : v);
      }
    } catch (e: any) {
      setReviewResult({ ok: false, error: String(e?.message ?? e) });
    } finally {
      setReviewing(false);
    }
  };

  const valStats = useMemo(() => {
    const v = pack?.valuation ?? {};
    const q = pack?.quote ?? {};
    return [
      { label: "PE (TTM)", value: fmt(v.pe_ttm) },
      { label: "PE (静态)", value: fmt(v.pe) },
      { label: "PB", value: fmt(v.pb) },
      { label: "总市值", value: fmtBig(v.total_mv) },
      { label: "现价", value: fmt(q.price) },
      { label: "数据日期", value: v.as_of ?? "—" },
    ];
  }, [pack]);

  const activeWatch = useMemo(() => {
    const currentCode = pack?.code ?? extractStockCode(code) ?? selectedArchiveCode;
    return watchlist.find((x) => x.code === currentCode) ?? null;
  }, [watchlist, pack, code, selectedArchiveCode]);

  const groups = useMemo(() => Array.from(new Set(watchlist.map((x) => x.group || "未分组"))), [watchlist]);

  const screenedWatchlist = useMemo(() => {
    const maxPe = Number(screen.maxPe);
    const maxPb = Number(screen.maxPb);
    return watchlist.filter((item) => {
      if (screen.group !== "全部" && item.group !== screen.group) return false;
      if (Number.isFinite(maxPe) && item.pe != null && item.pe > maxPe) return false;
      if (Number.isFinite(maxPb) && item.pb != null && item.pb > maxPb) return false;
      return true;
    });
  }, [watchlist, screen]);

  const archiveCode = selectedArchiveCode || pack?.code || watchlist[0]?.code || "";
  const archiveReports = useMemo(() => reports.filter((r) => r.code === archiveCode), [reports, archiveCode]);
  const archiveWatch = watchlist.find((x) => x.code === archiveCode) ?? null;
  const riskSignals = useMemo(() => riskSignalsFromPack(pack), [pack]);
  const compareRows = compareCodes.map((c) => watchlist.find((x) => x.code === c)).filter(Boolean) as WatchItem[];
  const isAnalyzing = phase !== "idle" && phase !== "done" && phase !== "error";
  const recentReports = reports.slice(0, 4);

  const addCurrentToWatchlist = () => {
    if (!pack) return;
    setWatchlist((prev) => {
      const existing = prev.find((x) => x.code === pack.code);
      const nextItem = watchFromPack(pack, existing);
      return existing ? prev.map((x) => x.code === pack.code ? nextItem : x) : [nextItem, ...prev];
    });
    setSelectedArchiveCode(pack.code);
  };

  const updateWatchItem = (code: string, patch: Partial<WatchItem>) => {
    setWatchlist((prev) => prev.map((x) => x.code === code ? { ...x, ...patch } : x));
  };

  const removeWatchItem = (code: string) => {
    setWatchlist((prev) => prev.filter((x) => x.code !== code));
  };

  const exportText = useMemo(() => {
    const rows = watchlist.slice(0, 12).map((x) => `- ${x.name} ${x.code}: ${x.verdict}，PE ${fmt(x.pe)}，PB ${fmt(x.pb)}，${x.note || "暂无备注"}`).join("\n");
    const ps = principles.filter((p) => p.enabled).map((p) => `- ${p.text}`).join("\n");
    return [
      "# 价投合伙人 · 本地投研摘要",
      "",
      "## 我的投资原则",
      ps || "- 暂无",
      "",
      "## 自选股池",
      rows || "- 暂无",
      "",
      "## 下一步跟踪",
      "- 更新自选股数据快照",
      "- 对重点公司运行 AI 复核",
      "- 对估值偏高或财务红灯公司做人工复核",
    ].join("\n");
  }, [watchlist, principles]);

  const runAiTask = async (kind: string, extra: Record<string, any> = {}) => {
    setAiBusy(true);
    setAiResult(null);
    try {
      const usefulCurrentStats = pack
        ? valStats.filter((s) => s.value !== "—" && s.value !== "")
        : [];
      const result = await window.vc.aiTask(kind, {
        activeMode: mode,
        activeView: workspace,
        currentInput: code,
        currentStock: pack
          ? { code: pack.code, name: pack.name }
          : activeWatch
            ? { code: activeWatch.code, name: activeWatch.name, from: "watchlist" }
            : null,
        currentPack: pack,
        currentStats: usefulCurrentStats.length > 0 ? usefulCurrentStats : null,
        hasCurrentPanelData: Boolean(pack && usefulCurrentStats.length > 0),
        watchlist,
        screenedWatchlist,
        archiveCode,
        archiveWatch,
        archiveReports,
        riskSignals,
        compareRows,
        principles,
        exportText,
        contextNotes: [
          pack
            ? "currentPack/currentStats 来自当前打开的实时分析面板。"
            : "当前没有打开实时分析面板；自选、对比、档案任务请以 watchlist/archiveWatch/compareRows 为准，不要把 currentStats 缺失视为数据源异常。",
        ],
        ...extra,
      });
      setAiResult(result);
    } catch (e: any) {
      setAiResult({
        title: "AI 助手",
        summary: "AI 助手调用失败。",
        bullets: [],
        actions: ["检查设置里的 LLM Key、Base URL 和模型名。"],
        warnings: [String(e?.message ?? e)],
      });
    } finally {
      setAiBusy(false);
    }
  };

  const onPickReport = async (r: ReportItem) => {
    setHistoryReviewMsg(null);
    const reportLabel = stockLabel(r.name, r.code) || r.code || r.file;
    if (r.type === "html") {
      const url = await window.vc.fileUrl(r.path);
      setViewing({ title: `${reportLabel} · ${r.date} · HTML 报告`, htmlUrl: url, htmlPath: r.path });
    } else {
      const body = await window.vc.readReport(r.path);
      setViewing({ title: `${reportLabel} · ${r.date}`, body });
    }
  };

  const onHistoryReview = async () => {
    if (!viewing?.htmlPath || historyReviewing) return;
    setHistoryReviewing(true);
    setHistoryReviewMsg("复核中…（首次/降级模式可能 30~60 秒）");
    try {
      const r = await window.vc.review(viewing.htmlPath);
      if (r.ok) {
        const tag = r.mode === "legacy" ? " · 降级模式" : "";
        setHistoryReviewMsg(`✓ 复核 ${r.score}/100 · ${r.level} · ${r.issues} 条问题${tag}`);
        if (viewing.htmlUrl) {
          const fresh = viewing.htmlUrl.split("?")[0] + "?t=" + Date.now();
          setViewing(v => v ? { ...v, htmlUrl: fresh } : v);
        }
      } else {
        setHistoryReviewMsg(`✗ ${r.error ?? "复核失败"}`);
      }
    } catch (e: any) {
      setHistoryReviewMsg(`✗ ${String(e?.message ?? e)}`);
    } finally {
      setHistoryReviewing(false);
    }
  };

  // 大师卡片列表（按启用顺序）
  const masterCards = enabledMasters.map((m) => {
    const st = masterStates[m.id] ?? { thinking: "", answer: "", active: false, done: false };
    return { ...m, ...st };
  });

  return (
    <div className="h-screen flex flex-col bg-stage text-ink">
      {/* Top bar */}
      <header className="px-4 py-3 border-b border-line flex items-center gap-3 bg-panel/90 backdrop-blur-xl">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded bg-red flex items-center justify-center text-white font-bold text-sm shadow-sm">价</div>
          <div>
            <div className="text-sm font-semibold">价投合伙人</div>
            <div className="text-xs text-mute">A-Share Value Council · v0.2</div>
          </div>
        </div>
        <div className="flex-1" />
        <div className="flex items-center rounded-lg border border-line bg-panel2 p-0.5 text-xs">
          <button
            onClick={() => setMode("start")}
            className={"px-3 py-1.5 rounded-md font-semibold " + (mode === "start" ? "bg-ink text-white shadow-sm" : "text-mute hover:text-ink")}
          >
            开始
          </button>
          <button
            onClick={() => setMode("workbench")}
            className={"px-3 py-1.5 rounded-md font-semibold " + (mode === "workbench" ? "bg-ink text-white shadow-sm" : "text-mute hover:text-ink")}
          >
            工作台
          </button>
        </div>
        <div className="flex items-center gap-3 text-xs text-mute">
          <span>数据 {healthInfo?.ok ? <span className="text-jade">●</span> : <span className="text-red-soft">●</span>}</span>
          <span>模型 <span className="text-gold">{healthInfo?.model ?? "—"}</span></span>
          <button onClick={() => window.vc.openReportsDir()} className="text-mute hover:text-gold">📂 报告目录</button>
          <button
            onClick={() => { setForcedSetup(false); setSettingsOpen(true); }}
            className="text-mute hover:text-gold"
            title="设置"
          >
            ⚙️ 设置
          </button>
        </div>
      </header>

      <div className="flex-1 flex min-h-0">
        {/* 历史侧栏 */}
        {mode === "workbench" && <aside className="w-56 border-r border-line bg-panel/70 backdrop-blur-xl flex flex-col">
          <div className="px-3 py-3 border-b border-line">
            <div className="text-xs text-mute mb-2">投研工作台</div>
            <div className="grid grid-cols-2 gap-1">
              {workspaceTabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setWorkspace(tab.id)}
                  title={tab.hint}
                  className={
                    "px-2 py-1.5 rounded text-xs text-left border transition-colors " +
                    (workspace === tab.id
                      ? "bg-ink text-white border-ink shadow-sm"
                      : "bg-transparent text-mute border-transparent hover:bg-panel2 hover:text-ink")
                  }
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
          <div className="px-3 py-2 text-xs text-mute border-b border-line flex items-center justify-between">
            <span>历史报告</span>
            <button onClick={refreshReports} className="hover:text-gold">刷新</button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {reports.length === 0 && <p className="text-mute text-xs px-3 py-2">还没有报告</p>}
            {reports.map((r) => (
              <button
                key={r.path}
                onClick={() => onPickReport(r)}
                className="w-full text-left px-3 py-2 hover:bg-panel2 border-b border-line text-sm"
              >
                <div className="text-ink flex items-center gap-1">
                  <span className="truncate">{r.name || r.code || r.file}</span>
                  {r.type === "html" && <span className="text-[10px] text-jade border border-jade/40 rounded px-1">HTML</span>}
                </div>
                <div className="text-mute text-xs">{r.code ? `${r.code} · ${r.date}` : r.date}</div>
              </button>
            ))}
          </div>
        </aside>}

        {/* 主区 */}
        <main className="flex-1 flex flex-col min-w-0 p-4 gap-3 overflow-hidden">
          {/* 输入栏 */}
          <div className={"relative z-40 flex items-center gap-2 bg-panel/70 border border-line rounded-lg px-3 py-3 shadow-[var(--shadow-soft)] backdrop-blur-xl " + (mode === "start" ? "w-full max-w-5xl mx-auto" : "")}>
            <div className="relative z-50">
              <input
                value={code}
                onChange={(e) => {
                  setCode(e.target.value.trimStart().slice(0, 24));
                  setSearchOpen(true);
                }}
                onFocus={() => { if (searchResults.length > 0) setSearchOpen(true); }}
                onKeyDown={(e) => { if (e.key === "Enter") onAnalyze(); }}
                placeholder="600519 / 贵州茅台"
                disabled={phase !== "idle" && phase !== "done" && phase !== "error"}
                className="bg-panel2 border border-line rounded px-3 py-2 text-base w-56 focus:outline-none focus:border-gold disabled:opacity-50"
              />
              {searchOpen && (searching || searchError || searchResults.length > 0 || (code.trim() && !/^\d{6}$/.test(code.trim()))) && (
                <div className="absolute z-[60] mt-2 w-72 max-h-72 overflow-y-auto rounded border border-line bg-panel shadow-[var(--shadow-soft)] backdrop-blur-xl">
                  {searching && (
                    <div className="px-3 py-2 text-xs text-mute">搜索中...</div>
                  )}
                  {!searching && searchError && (
                    <div className="px-3 py-2 text-xs text-red-soft">搜索失败：{searchError}</div>
                  )}
                  {!searching && !searchError && searchResults.length === 0 && (
                    <div className="px-3 py-2 text-xs text-mute">没有匹配的 A 股公司</div>
                  )}
                  {searchResults.slice(0, 8).map((r) => (
                    <button
                      key={r.code}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setCode(stockLabel(r.name, r.code));
                        setSearchOpen(false);
                        setSearchResults([]);
                      }}
                      className="w-full px-3 py-2 text-left hover:bg-panel2 flex items-center justify-between gap-3"
                    >
                      <span className="text-sm text-ink">{r.name}</span>
                      <span className="text-xs text-gold font-mono">{r.code}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={onAnalyze}
              disabled={phase !== "idle" && phase !== "done" && phase !== "error"}
              className="bg-red hover:bg-red-soft text-white px-4 py-2 rounded text-sm font-semibold shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {phase === "idle" || phase === "done" || phase === "error" ? "开始分析" : "分析中..."}
            </button>
            <StatBadge phase={phase} enabledMasters={enabledMasters} />
            <span className="text-mute text-xs truncate">{statusText}</span>
            <div className="flex-1" />
            {savedPath && phase === "done" && (
              <>
                {pack && (
                  <button
                    onClick={addCurrentToWatchlist}
                    className="bg-panel2 hover:bg-white text-ink border border-line px-3 py-1 rounded text-xs font-semibold shadow-sm"
                  >
                    {activeWatch ? "更新自选" : "加入自选"}
                  </button>
                )}
                {savedHtmlUrl && (
                  <button
                    onClick={() => setViewing({ title: `${stockLabel(pack?.name, pack?.code) || code} · 最新报告`, htmlUrl: savedHtmlUrl })}
                    className="bg-gold hover:bg-red-soft text-white px-3 py-1 rounded text-xs font-semibold shadow-sm"
                  >
                    查看 HTML 报告
                  </button>
                )}
                <button
                  onClick={onReview}
                  disabled={reviewing}
                  title="让另一个 AI 复核报告里的事实/逻辑/相关性问题"
                  className="bg-ink hover:bg-[#2c2c2e] text-white border border-black/10 px-3 py-1 rounded text-xs font-semibold shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {reviewing ? "复核中…" : "AI 复核"}
                </button>
                {reviewResult && (
                  reviewResult.ok ? (
                    <span className="text-xs" title={`level: ${reviewResult.level}`}>
                      <span className={
                        (reviewResult.score ?? 0) >= 90 ? "text-jade" :
                        (reviewResult.score ?? 0) >= 70 ? "text-gold" :
                        (reviewResult.score ?? 0) >= 50 ? "text-amber" : "text-red-soft"
                      }>
                        ✓ 复核 {reviewResult.score}/100 · {reviewResult.issues} 条问题
                      </span>
                    </span>
                  ) : (
                    <span className="text-red-soft text-xs" title={reviewResult.error}>✗ 复核失败</span>
                  )
                )}
                <span className="text-jade text-xs">✓ 已保存 {savedPath.split(/[\\/]/).pop()}</span>
              </>
            )}
          </div>

          {error && <div className="bg-red/10 border border-red/20 text-red-soft px-3 py-2 rounded text-sm">{error}</div>}

          <AiInsightPanel result={aiResult} busy={aiBusy} onClose={() => { setAiResult(null); setAiBusy(false); }} />

          {mode === "start" ? (
            <div className="flex-1 min-h-0 overflow-y-auto">
              <div className="max-w-5xl mx-auto space-y-3">
                {!pack && !isAnalyzing && (
                  <section className="bg-panel rounded-lg border border-line px-6 py-8 shadow-[var(--shadow-soft)] backdrop-blur-xl">
                    <div className="max-w-2xl">
                      <h1 className="text-2xl font-semibold text-ink tracking-normal">研究一家公司</h1>
                      <p className="mt-2 text-sm text-mute leading-relaxed">输入公司名称或股票代码，生成报告后再做 AI 复核。</p>
                    </div>
                    <div className="mt-6 grid grid-cols-4 gap-2">
                      {recentReports.length === 0 ? (
                        <div className="col-span-4 text-sm text-mute bg-panel2 border border-line rounded-lg px-4 py-5">暂无历史报告。</div>
                      ) : recentReports.map((r) => (
                        <button key={r.path} onClick={() => onPickReport(r)} className="text-left bg-panel2 border border-line rounded-lg px-3 py-3 hover:bg-white">
                          <div className="text-sm font-semibold text-ink truncate">{r.name || r.code || r.file}</div>
                          <div className="text-xs text-mute mt-1">{r.code ? `${r.code} · ${r.date}` : r.date}</div>
                        </button>
                      ))}
                    </div>
                  </section>
                )}

                {(pack || isAnalyzing) && (
                  <section className="bg-panel rounded-lg border border-line px-4 py-4 shadow-[var(--shadow-soft)] backdrop-blur-xl">
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <h2 className="text-lg font-semibold text-ink truncate">{pack ? stockLabel(pack.name, pack.code) : "正在生成报告"}</h2>
                        <p className="text-xs text-mute mt-1">{pack ? `财报 ${pack.financial_rows} 期 · 拉取 ${new Date(pack.fetched_at).toLocaleTimeString("zh-CN")}` : statusText}</p>
                      </div>
                      <StatBadge phase={phase} enabledMasters={enabledMasters} />
                    </div>
                    {pack && (
                      <div className="grid grid-cols-6 gap-2 mt-4">
                        {valStats.map((s) => <StatTile key={s.label} {...s} />)}
                      </div>
                    )}
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      {savedHtmlUrl && (
                        <button onClick={() => setViewing({ title: `${stockLabel(pack?.name, pack?.code) || code} · 最新报告`, htmlUrl: savedHtmlUrl })} className="bg-gold hover:bg-red-soft text-white px-4 py-2 rounded text-sm font-semibold shadow-sm">
                          查看报告
                        </button>
                      )}
                      {savedPath && (
                        <button onClick={onReview} disabled={reviewing} className="bg-ink hover:bg-[#2c2c2e] text-white border border-black/10 px-4 py-2 rounded text-sm font-semibold shadow-sm disabled:opacity-50">
                          {reviewing ? "复核中…" : "AI 复核"}
                        </button>
                      )}
                      {pack && (
                        <button onClick={addCurrentToWatchlist} className="bg-panel2 hover:bg-white text-ink border border-line px-4 py-2 rounded text-sm font-semibold shadow-sm">
                          {activeWatch ? "更新自选" : "加入自选"}
                        </button>
                      )}
                      {pack && (
                        <button onClick={() => runAiTask("daily-brief")} disabled={aiBusy} className="bg-panel2 hover:bg-white text-ink border border-line px-4 py-2 rounded text-sm font-semibold shadow-sm disabled:opacity-50">
                          AI 摘要
                        </button>
                      )}
                      {reviewResult && (
                        <span className={(reviewResult.ok ? "text-jade" : "text-red-soft") + " text-xs"}>
                          {reviewResult.ok ? `✓ 复核 ${reviewResult.score}/100 · ${reviewResult.issues} 条问题` : "✗ 复核失败"}
                        </span>
                      )}
                    </div>
                  </section>
                )}

                {(isAnalyzing || masterCards.some((c) => c.answer || c.thinking)) && (
                  <section className="grid grid-cols-2 gap-3">
                    {masterCards.map((c) => (
                      <MasterCard
                        key={c.id}
                        title={c.displayName}
                        subtitle={c.subtitle}
                        thinking={c.thinking}
                        answer={c.answer}
                        active={c.active}
                        done={c.done}
                      />
                    ))}
                  </section>
                )}
              </div>
            </div>
          ) : workspace === "analysis" ? (
            <>
              {pack && (
                <div className="bg-panel rounded-lg border border-line px-4 py-3 shadow-[var(--shadow-soft)] backdrop-blur-xl">
                  <div className="flex items-baseline gap-2 mb-2">
                    <h2 className="text-base font-semibold text-ink">{stockLabel(pack.name, pack.code)}</h2>
                    <span className="text-mute text-xs">财报 {pack.financial_rows} 期 · 拉取 {new Date(pack.fetched_at).toLocaleTimeString("zh-CN")}</span>
                    <div className="flex-1" />
                    <button onClick={() => runAiTask("daily-brief")} disabled={aiBusy} className="bg-ink hover:bg-[#2c2c2e] text-white px-3 py-1 rounded text-xs font-semibold disabled:opacity-50">AI 今日简报</button>
                    <button onClick={() => runAiTask("report-editor")} disabled={aiBusy} className="bg-panel2 hover:bg-white text-ink border border-line px-3 py-1 rounded text-xs font-semibold disabled:opacity-50">AI 摘要</button>
                  </div>
                  <div className="grid grid-cols-6 gap-2">
                    {valStats.map((s) => <StatTile key={s.label} {...s} />)}
                  </div>
                </div>
              )}

              <div className="relative z-0 flex-1 flex flex-wrap gap-3 min-h-0 overflow-y-auto">
                {masterCards.map((c) => (
                  <MasterCard
                    key={c.id}
                    title={c.displayName}
                    subtitle={c.subtitle}
                    thinking={c.thinking}
                    answer={c.answer}
                    active={c.active}
                    done={c.done}
                  />
                ))}
              </div>
            </>
          ) : (
            <div className="flex-1 min-h-0 overflow-y-auto">
              {workspace === "watchlist" && (
                <section className="bg-panel rounded-lg border border-line shadow-[var(--shadow-soft)] backdrop-blur-xl">
                  <div className="px-4 py-3 border-b border-line flex items-center justify-between">
                    <div>
                      <h2 className="text-base font-semibold text-ink">自选股池</h2>
                      <p className="text-xs text-mute mt-0.5">把单次分析沉淀成长期跟踪对象。</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => runAiTask("watchlist-organize")} disabled={aiBusy || watchlist.length === 0} className="bg-panel2 hover:bg-white text-ink border border-line px-3 py-1.5 rounded text-xs font-semibold disabled:opacity-50">AI 整理</button>
                      {pack && <button onClick={addCurrentToWatchlist} className="bg-ink text-white hover:bg-[#2c2c2e] px-3 py-1.5 rounded text-xs font-semibold">加入当前公司</button>}
                    </div>
                  </div>
                  <div className="divide-y divide-line">
                    {watchlist.length === 0 && <div className="px-4 py-8 text-sm text-mute">暂无自选股。先完成一次分析，然后点击“加入自选”。</div>}
                    {watchlist.map((item) => (
                      <div key={item.code} className="px-4 py-3 grid grid-cols-[1.2fr_0.8fr_1.2fr_auto] gap-3 items-center hover:bg-panel2/60">
                        <button onClick={() => { setCode(stockLabel(item.name, item.code)); setSelectedArchiveCode(item.code); setWorkspace("archive"); }} className="text-left">
                          <div className="text-sm font-semibold text-ink">{item.name} <span className="font-mono text-xs text-gold">{item.code}</span></div>
                          <div className="text-xs text-mute">更新 {new Date(item.updatedAt).toLocaleString("zh-CN")}</div>
                        </button>
                        <select value={item.verdict} onChange={(e) => updateWatchItem(item.code, { verdict: e.target.value })} className="bg-panel2 border border-line rounded px-2 py-1.5 text-xs">
                          <option>待判断</option>
                          <option>值得研究</option>
                          <option>继续观察</option>
                          <option>暂不研究</option>
                        </select>
                        <input value={item.note} onChange={(e) => updateWatchItem(item.code, { note: e.target.value })} placeholder="跟踪备注" className="bg-panel2 border border-line rounded px-2 py-1.5 text-xs" />
                        <button onClick={() => removeWatchItem(item.code)} className="text-xs text-mute hover:text-red-soft">删除</button>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {workspace === "screener" && (
                <section className="bg-panel rounded-lg border border-line shadow-[var(--shadow-soft)] backdrop-blur-xl">
                  <div className="px-4 py-3 border-b border-line">
                    <div className="flex items-center gap-3">
                      <div className="flex-1">
                        <h2 className="text-base font-semibold text-ink">批量筛选器</h2>
                        <p className="text-xs text-mute mt-0.5">先基于自选股快照做本地筛选，避免把 AI 用在明显不合适的公司上。</p>
                      </div>
                      <button onClick={() => runAiTask("screener-explain")} disabled={aiBusy || screenedWatchlist.length === 0} className="bg-ink hover:bg-[#2c2c2e] text-white px-3 py-1.5 rounded text-xs font-semibold disabled:opacity-50">AI 解释筛选</button>
                    </div>
                  </div>
                  <div className="px-4 py-3 flex items-center gap-3 border-b border-line">
                    <label className="text-xs text-mute">PE 不高于 <input value={screen.maxPe} onChange={(e) => setScreen({ ...screen, maxPe: e.target.value })} className="ml-1 w-16 bg-panel2 border border-line rounded px-2 py-1 text-ink" /></label>
                    <label className="text-xs text-mute">PB 不高于 <input value={screen.maxPb} onChange={(e) => setScreen({ ...screen, maxPb: e.target.value })} className="ml-1 w-16 bg-panel2 border border-line rounded px-2 py-1 text-ink" /></label>
                    <label className="text-xs text-mute">分组
                      <select value={screen.group} onChange={(e) => setScreen({ ...screen, group: e.target.value })} className="ml-1 bg-panel2 border border-line rounded px-2 py-1 text-ink">
                        <option>全部</option>
                        {groups.map((g) => <option key={g}>{g}</option>)}
                      </select>
                    </label>
                  </div>
                  <div className="grid grid-cols-4 gap-2 p-4">
                    {screenedWatchlist.map((item) => (
                      <button key={item.code} onClick={() => { setSelectedArchiveCode(item.code); setWorkspace("archive"); }} className="text-left bg-panel2 border border-line rounded-lg px-3 py-3 hover:bg-white">
                        <div className="text-sm font-semibold">{item.name}</div>
                        <div className="text-xs text-mute font-mono">{item.code}</div>
                        <div className="text-xs text-mute mt-2">PE {fmt(item.pe)} · PB {fmt(item.pb)}</div>
                      </button>
                    ))}
                    {screenedWatchlist.length === 0 && <div className="col-span-4 text-sm text-mute">没有符合条件的公司。</div>}
                  </div>
                </section>
              )}

              {workspace === "archive" && (
                <section className="grid grid-cols-[280px_1fr] gap-3 min-h-full">
                  <div className="bg-panel rounded-lg border border-line p-3 shadow-[var(--shadow-soft)]">
                    <div className="text-xs text-mute mb-2">公司档案</div>
                    <select value={archiveCode} onChange={(e) => setSelectedArchiveCode(e.target.value)} className="w-full bg-panel2 border border-line rounded px-2 py-2 text-sm">
                      <option value="">选择公司</option>
                      {watchlist.map((x) => <option key={x.code} value={x.code}>{x.name} {x.code}</option>)}
                    </select>
                    {archiveWatch && (
                      <div className="mt-3 space-y-2 text-sm">
                        <div className="font-semibold">{archiveWatch.name} <span className="text-xs text-gold font-mono">{archiveWatch.code}</span></div>
                        <div className="text-xs text-mute">结论：{archiveWatch.verdict}</div>
                        <div className="text-xs text-mute">PE {fmt(archiveWatch.pe)} · PB {fmt(archiveWatch.pb)}</div>
                        <textarea value={archiveWatch.note} onChange={(e) => updateWatchItem(archiveWatch.code, { note: e.target.value })} className="w-full h-24 bg-panel2 border border-line rounded px-2 py-2 text-xs" placeholder="跟踪备注" />
                      </div>
                    )}
                  </div>
                  <div className="bg-panel rounded-lg border border-line shadow-[var(--shadow-soft)]">
                    <div className="px-4 py-3 border-b border-line flex items-center gap-3">
                      <div className="flex-1">
                        <h2 className="text-base font-semibold text-ink">历史报告与跟踪</h2>
                        <p className="text-xs text-mute mt-0.5">每家公司沉淀报告、复核和备注，形成长期研究主页。</p>
                      </div>
                      <button onClick={() => runAiTask("archive-summary")} disabled={aiBusy || !archiveCode} className="bg-ink hover:bg-[#2c2c2e] text-white px-3 py-1.5 rounded text-xs font-semibold disabled:opacity-50">AI 总结档案</button>
                    </div>
                    <div className="divide-y divide-line">
                      {archiveReports.length === 0 && <div className="px-4 py-8 text-sm text-mute">暂无该公司的历史报告。</div>}
                      {archiveReports.map((r) => (
                        <button key={r.path} onClick={() => onPickReport(r)} className="w-full px-4 py-3 text-left hover:bg-panel2 flex items-center justify-between">
                          <span className="text-sm text-ink">{stockLabel(r.name, r.code) || r.code} · {r.date}</span>
                          <span className="text-xs text-mute">{r.type.toUpperCase()}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </section>
              )}

              {workspace === "risk" && (
                <section className="bg-panel rounded-lg border border-line shadow-[var(--shadow-soft)]">
                  <div className="px-4 py-3 border-b border-line">
                    <div className="flex items-center gap-3">
                      <div className="flex-1">
                        <h2 className="text-base font-semibold text-ink">风险雷达</h2>
                        <p className="text-xs text-mute mt-0.5">基于当前数据快照触发红灯，不替代人工核对。</p>
                      </div>
                      <button onClick={() => runAiTask("risk-explain")} disabled={aiBusy || !pack} className="bg-ink hover:bg-[#2c2c2e] text-white px-3 py-1.5 rounded text-xs font-semibold disabled:opacity-50">AI 解释风险</button>
                    </div>
                  </div>
                  <div className="p-4 grid grid-cols-3 gap-3">
                    {riskSignals.map((risk) => (
                      <div key={risk.title} className={"rounded-lg border px-3 py-3 " + (risk.level === "high" ? "bg-red/10 border-red/20" : risk.level === "mid" ? "bg-amber/10 border-amber/20" : "bg-jade/10 border-jade/20")}>
                        <div className="text-sm font-semibold text-ink">{risk.title}</div>
                        <div className="text-xs text-mute mt-1 leading-relaxed">{risk.detail}</div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {workspace === "compare" && (
                <section className="bg-panel rounded-lg border border-line shadow-[var(--shadow-soft)]">
                  <div className="px-4 py-3 border-b border-line">
                    <div className="flex items-center gap-3">
                      <div className="flex-1">
                        <h2 className="text-base font-semibold text-ink">公司对比</h2>
                        <p className="text-xs text-mute mt-0.5">选择两家公司，快速比较估值、结论和备注。</p>
                      </div>
                      <button onClick={() => runAiTask("compare-explain")} disabled={aiBusy || compareRows.length < 2} className="bg-ink hover:bg-[#2c2c2e] text-white px-3 py-1.5 rounded text-xs font-semibold disabled:opacity-50">AI 对比结论</button>
                    </div>
                  </div>
                  <div className="p-4 flex gap-3">
                    {[0, 1].map((idx) => (
                      <select key={idx} value={compareCodes[idx]} onChange={(e) => setCompareCodes(idx === 0 ? [e.target.value, compareCodes[1]] : [compareCodes[0], e.target.value])} className="bg-panel2 border border-line rounded px-3 py-2 text-sm">
                        <option value="">选择公司</option>
                        {watchlist.map((x) => <option key={x.code} value={x.code}>{x.name} {x.code}</option>)}
                      </select>
                    ))}
                  </div>
                  <div className="px-4 pb-4 grid grid-cols-2 gap-3">
                    {compareRows.map((item) => (
                      <div key={item.code} className="bg-panel2 border border-line rounded-lg p-4">
                        <div className="text-base font-semibold">{item.name} <span className="text-xs text-gold font-mono">{item.code}</span></div>
                        <div className="grid grid-cols-3 gap-2 mt-3">
                          <StatTile label="PE" value={fmt(item.pe)} />
                          <StatTile label="PB" value={fmt(item.pb)} />
                          <StatTile label="市值" value={fmtBig(item.marketCap)} />
                        </div>
                        <div className="mt-3 text-xs text-mute">结论：{item.verdict}</div>
                        <div className="mt-1 text-xs text-mute">备注：{item.note || "暂无"}</div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {workspace === "principles" && (
                <section className="bg-panel rounded-lg border border-line shadow-[var(--shadow-soft)]">
                  <div className="px-4 py-3 border-b border-line flex items-center justify-between">
                    <div>
                      <h2 className="text-base font-semibold text-ink">我的投资原则</h2>
                      <p className="text-xs text-mute mt-0.5">把个人能力圈和排除项固定下来，减少临场摇摆。</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => runAiTask("principles-coach")} disabled={aiBusy || principles.length === 0} className="bg-panel2 hover:bg-white text-ink border border-line px-3 py-1.5 rounded text-xs font-semibold disabled:opacity-50">AI 转规则</button>
                      <button onClick={() => setPrinciples((prev) => [...prev, { id: String(Date.now()), text: "", enabled: true }])} className="bg-ink text-white hover:bg-[#2c2c2e] px-3 py-1.5 rounded text-xs font-semibold">新增原则</button>
                    </div>
                  </div>
                  <div className="divide-y divide-line">
                    {principles.map((p) => (
                      <div key={p.id} className="px-4 py-3 flex items-center gap-3">
                        <input type="checkbox" checked={p.enabled} onChange={(e) => setPrinciples((prev) => prev.map((x) => x.id === p.id ? { ...x, enabled: e.target.checked } : x))} />
                        <input value={p.text} onChange={(e) => setPrinciples((prev) => prev.map((x) => x.id === p.id ? { ...x, text: e.target.value } : x))} className="flex-1 bg-panel2 border border-line rounded px-3 py-2 text-sm" />
                        <button onClick={() => setPrinciples((prev) => prev.filter((x) => x.id !== p.id))} className="text-xs text-mute hover:text-red-soft">删除</button>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {workspace === "export" && (
                <section className="bg-panel rounded-lg border border-line shadow-[var(--shadow-soft)] h-full flex flex-col">
                  <div className="px-4 py-3 border-b border-line flex items-center justify-between">
                    <div>
                      <h2 className="text-base font-semibold text-ink">导出与分享</h2>
                      <p className="text-xs text-mute mt-0.5">生成一份可复制到 Obsidian、Notion、微信草稿的摘要。</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => runAiTask("report-editor")} disabled={aiBusy} className="bg-panel2 hover:bg-white text-ink border border-line px-3 py-1.5 rounded text-xs font-semibold disabled:opacity-50">AI 润色摘要</button>
                      <button onClick={() => navigator.clipboard.writeText(exportText)} className="bg-ink text-white hover:bg-[#2c2c2e] px-3 py-1.5 rounded text-xs font-semibold">复制摘要</button>
                    </div>
                  </div>
                  <textarea readOnly value={exportText} className="flex-1 m-4 bg-panel2 border border-line rounded-lg p-3 text-sm font-mono leading-relaxed resize-none" />
                </section>
              )}
            </div>
          )}

          {/* 历史预览 */}
          {viewing && (
            <div className="fixed inset-0 bg-black/25 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setViewing(null)}>
              <div className="bg-panel rounded-lg border border-line w-[92%] h-[92%] flex flex-col shadow-[var(--shadow-soft)] backdrop-blur-xl" onClick={(e) => e.stopPropagation()}>
                <div className="px-4 py-3 border-b border-line flex items-center gap-3">
                  <h3 className="text-ink font-semibold flex-1 truncate">{viewing.title}</h3>
                  {viewing.htmlPath && (
                    <>
                      <button
                        onClick={onHistoryReview}
                        disabled={historyReviewing}
                        title="对当前报告做 AI 复核（旧报告自动走降级模式）"
                        className="bg-ink hover:bg-[#2c2c2e] text-white border border-black/10 px-3 py-1 rounded text-xs font-semibold shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {historyReviewing ? "复核中…" : "AI 复核"}
                      </button>
                      {historyReviewMsg && (
                        <span
                          className={"text-xs " + (historyReviewMsg.startsWith("✓") ? "text-jade" : historyReviewMsg.startsWith("✗") ? "text-red-soft" : "text-mute")}
                          title={historyReviewMsg}
                        >
                          {historyReviewMsg}
                        </span>
                      )}
                    </>
                  )}
                  <button onClick={() => { setViewing(null); setHistoryReviewMsg(null); }} className="text-mute hover:text-ink">✕</button>
                </div>
                {viewing.htmlUrl ? (
                  <iframe
                    src={viewing.htmlUrl}
                    className="flex-1 w-full bg-white rounded-b-lg"
                    style={{ border: 0 }}
                    sandbox="allow-scripts allow-same-origin"
                  />
                ) : (
                  <div className="flex-1 overflow-y-auto px-6 py-4 md-body">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{viewing.body ?? ""}</ReactMarkdown>
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>

      <footer className="px-4 py-2 border-t border-line bg-panel/75 backdrop-blur-xl text-mute text-[11px] text-center">
        ⚠️ 本工具仅用于研究辅助，不构成任何买卖建议 · 数据来源：akshare（公开数据）· 大师观点为 AI 模拟，非真人代言
      </footer>

      <SettingsModal
        open={settingsOpen}
        forcedSetup={forcedSetup}
        onClose={() => { setSettingsOpen(false); setForcedSetup(false); refreshMasters(); }}
        onSaved={() => { refreshHealth(); refreshMasters(); }}
      />
    </div>
  );
}
