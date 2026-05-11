import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { VCApi, MasterInfo } from "../../preload";
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

function StatBadge({ phase, enabledMasters }: { phase: Phase; enabledMasters: MasterInfo[] }) {
  if (phase === "idle") return <span className="px-2 py-0.5 rounded text-xs bg-line text-mute">就绪</span>;
  if (phase === "fetching") return <span className="px-2 py-0.5 rounded text-xs bg-amber/20 text-amber">拉取数据中</span>;
  if (phase === "judge") return <span className="px-2 py-0.5 rounded text-xs bg-amber/20 text-amber">裁判汇总中</span>;
  if (phase === "done") return <span className="px-2 py-0.5 rounded text-xs bg-jade/20 text-jade">已完成</span>;
  if (phase === "error") return <span className="px-2 py-0.5 rounded text-xs bg-red/20 text-red-soft">出错</span>;
  // 某位大师正在跑
  const m = enabledMasters.find((x) => x.id === phase);
  const name = m?.displayName ?? phase;
  return <span className="px-2 py-0.5 rounded text-xs bg-gold/20 text-gold">{name}思考中</span>;
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
    <div className="flex flex-col bg-panel rounded-lg border border-line min-h-0 flex-1 min-w-[260px]">
      <div className="px-4 py-3 border-b border-line flex items-center justify-between">
        <div>
          <h3 className="text-gold font-semibold text-base">{title}</h3>
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
              className="text-xs text-mute hover:text-gold border border-line px-2 py-0.5 rounded"
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
            <p className="text-xs text-mute mb-2">💭 思考过程（不计入最终报告）</p>
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
    <div className="bg-panel2 rounded px-3 py-2 border border-line">
      <div className="text-mute text-xs">{label}</div>
      <div className="text-gold font-semibold text-base mt-0.5">{value}</div>
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

export default function App() {
  const [code, setCode] = useState("600519");
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
    const offD = window.vc.onDataPack((p: any) => setPack(p));
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

  const onAnalyze = async () => {
    if (!/^\d{6}$/.test(code)) { setError("股票代码须是 6 位数字"); return; }
    setError(null);
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
      await window.vc.ask(code);
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

  const onPickReport = async (r: ReportItem) => {
    setHistoryReviewMsg(null);
    if (r.type === "html") {
      const url = await window.vc.fileUrl(r.path);
      setViewing({ title: `${r.code} · ${r.date} · HTML 报告`, htmlUrl: url, htmlPath: r.path });
    } else {
      const body = await window.vc.readReport(r.path);
      setViewing({ title: `${r.code} · ${r.date}`, body });
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
      <header className="px-4 py-3 border-b border-line flex items-center gap-3 bg-panel">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded bg-red flex items-center justify-center text-white font-bold text-sm">价</div>
          <div>
            <div className="text-sm font-semibold">价投合伙人</div>
            <div className="text-xs text-mute">A-Share Value Council · v0.2</div>
          </div>
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-3 text-xs text-mute">
          <span>边车 {healthInfo?.ok ? <span className="text-jade">●</span> : <span className="text-red-soft">●</span>}</span>
          <span>模型 <span className="text-gold">{healthInfo?.model ?? "—"}</span></span>
          <span>大师 <span className="text-gold">{enabledMasters.length}/{8}</span></span>
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
        <aside className="w-56 border-r border-line bg-panel flex flex-col">
          <div className="px-3 py-2 text-xs text-mute border-b border-line flex items-center justify-between">
            <span>历史报告</span>
            <button onClick={refreshReports} className="hover:text-gold">↻</button>
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
                  {r.code}
                  {r.type === "html" && <span className="text-[10px] text-jade border border-jade/40 rounded px-1">HTML</span>}
                </div>
                <div className="text-mute text-xs">{r.date}</div>
              </button>
            ))}
          </div>
        </aside>

        {/* 主区 */}
        <main className="flex-1 flex flex-col min-w-0 p-4 gap-3 overflow-hidden">
          {/* 输入栏 */}
          <div className="flex items-center gap-2">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              onKeyDown={(e) => { if (e.key === "Enter") onAnalyze(); }}
              placeholder="600519"
              disabled={phase !== "idle" && phase !== "done" && phase !== "error"}
              className="bg-panel border border-line rounded px-3 py-2 text-base w-40 focus:outline-none focus:border-gold disabled:opacity-50 font-mono tracking-wider"
            />
            <button
              onClick={onAnalyze}
              disabled={phase !== "idle" && phase !== "done" && phase !== "error"}
              className="bg-red hover:bg-red-soft text-white px-4 py-2 rounded text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {phase === "idle" || phase === "done" || phase === "error" ? "开始分析" : "分析中..."}
            </button>
            <StatBadge phase={phase} enabledMasters={enabledMasters} />
            <span className="text-mute text-xs">{statusText}</span>
            <div className="flex-1" />
            {savedPath && phase === "done" && (
              <>
                {savedHtmlUrl && (
                  <button
                    onClick={() => setViewing({ title: `${pack?.code ?? code} · 最新报告`, htmlUrl: savedHtmlUrl })}
                    className="bg-gold hover:bg-amber text-stage px-3 py-1 rounded text-xs font-semibold"
                  >
                    📊 查看 HTML 报告
                  </button>
                )}
                <button
                  onClick={onReview}
                  disabled={reviewing}
                  title="让另一个 AI 复核报告里的事实/逻辑/相关性问题"
                  className="bg-jade/80 hover:bg-jade text-white px-3 py-1 rounded text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {reviewing ? "🔍 复核中…" : "🔍 AI 复核"}
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

          {error && <div className="bg-red/10 border border-red text-red-soft px-3 py-2 rounded text-sm">{error}</div>}

          {/* 数据快照 */}
          {pack && (
            <div className="bg-panel rounded-lg border border-line px-4 py-3">
              <div className="flex items-baseline gap-2 mb-2">
                <h2 className="text-base font-semibold text-ink">{pack.code} {pack.name}</h2>
                <span className="text-mute text-xs">财报 {pack.financial_rows} 期 · 拉取 {new Date(pack.fetched_at).toLocaleTimeString("zh-CN")}</span>
              </div>
              <div className="grid grid-cols-6 gap-2">
                {valStats.map((s) => <StatTile key={s.label} {...s} />)}
              </div>
            </div>
          )}

          {/* v0.2.0：多大师卡片 — 动态 grid，2-4 列自适应 */}
          <div className="flex-1 flex flex-wrap gap-3 min-h-0 overflow-y-auto">
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

          {/* 历史预览 */}
          {viewing && (
            <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setViewing(null)}>
              <div className="bg-panel rounded-lg border border-line w-[92%] h-[92%] flex flex-col" onClick={(e) => e.stopPropagation()}>
                <div className="px-4 py-3 border-b border-line flex items-center gap-3">
                  <h3 className="text-gold font-semibold flex-1 truncate">{viewing.title}</h3>
                  {viewing.htmlPath && (
                    <>
                      <button
                        onClick={onHistoryReview}
                        disabled={historyReviewing}
                        title="对当前报告做 AI 复核（旧报告自动走降级模式）"
                        className="bg-jade/80 hover:bg-jade text-white px-3 py-1 rounded text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {historyReviewing ? "🔍 复核中…" : "🔍 AI 复核"}
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

      <footer className="px-4 py-2 border-t border-line bg-panel text-mute text-[11px] text-center">
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
