import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { VCApi } from "../../preload";
import { SettingsModal } from "./SettingsModal";

declare global {
  interface Window {
    vc: VCApi;
  }
}

type Phase = "idle" | "fetching" | "buffett" | "duan" | "judge" | "done" | "error";

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

function StatBadge({ phase }: { phase: Phase }) {
  const map: Record<Phase, { text: string; cls: string }> = {
    idle: { text: "就绪", cls: "bg-line text-mute" },
    fetching: { text: "拉取数据中", cls: "bg-amber/20 text-amber" },
    buffett: { text: "巴菲特思考中", cls: "bg-gold/20 text-gold" },
    duan: { text: "段永平思考中", cls: "bg-gold/20 text-gold" },
    judge: { text: "裁判汇总中", cls: "bg-amber/20 text-amber" },
    done: { text: "已完成", cls: "bg-jade/20 text-jade" },
    error: { text: "出错", cls: "bg-red/20 text-red-soft" },
  };
  const { text, cls } = map[phase];
  return <span className={`px-2 py-0.5 rounded text-xs ${cls}`}>{text}</span>;
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
    <div className="flex flex-col bg-panel rounded-lg border border-line min-h-0 flex-1">
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
  const [buffettT, setBuffettT] = useState("");
  const [buffettA, setBuffettA] = useState("");
  const [duanT, setDuanT] = useState("");
  const [duanA, setDuanA] = useState("");
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [healthInfo, setHealthInfo] = useState<{ ok: boolean; sidecarUrl: string; model: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedPath, setSavedPath] = useState<string | null>(null);
  const [savedHtmlUrl, setSavedHtmlUrl] = useState<string | null>(null);
  const [viewing, setViewing] = useState<{ title: string; body?: string; htmlUrl?: string; htmlPath?: string } | null>(null);
  // v0.1.10：AI 复核状态
  const [reviewing, setReviewing] = useState(false);
  const [reviewResult, setReviewResult] = useState<{ ok: boolean; score?: number; level?: string; issues?: number; error?: string } | null>(null);
  // v0.1.12：历史预览中的复核状态（独立于主流程）
  const [historyReviewing, setHistoryReviewing] = useState(false);
  const [historyReviewMsg, setHistoryReviewMsg] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [forcedSetup, setForcedSetup] = useState(false);

  const refreshHealth = async () => setHealthInfo(await window.vc.health());
  const refreshReports = async () => setReports(await window.vc.listReports());

  useEffect(() => {
    refreshHealth();
    refreshReports();
    const offS = window.vc.onStatus(({ phase, text, path }) => {
      setStatusText(text);
      if (phase === "fetching") setPhase("fetching");
      if (phase === "buffett") setPhase("buffett");
      if (phase === "duan") setPhase("duan");
      if (phase === "judge") setPhase("judge");
      if (phase === "done") {
        setPhase("done");
        if (path) {
          setSavedPath(path);
          // 顺便把 file:// URL 拿到，给 iframe 用
          window.vc.fileUrl(path).then(setSavedHtmlUrl).catch(() => setSavedHtmlUrl(null));
        }
        refreshReports();
      }
    });
    const offD = window.vc.onDataPack((p) => setPack(p));
    const offC = window.vc.onChunk(({ master, phase, delta }) => {
      if (master === "buffett") {
        if (phase === "thinking") setBuffettT((s) => s + delta);
        else setBuffettA((s) => s + delta);
      } else {
        if (phase === "thinking") setDuanT((s) => s + delta);
        else setDuanA((s) => s + delta);
      }
    });
    // 首次运行无 key 时主进程通知弹设置
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
    setBuffettT(""); setBuffettA("");
    setDuanT(""); setDuanA("");
    setSavedPath(null);
    setSavedHtmlUrl(null);
    setViewing(null);
    setReviewResult(null);
    try {
      await window.vc.ask(code);
    } catch (e: any) {
      setPhase("error");
      setError(String(e?.message ?? e));
    }
  };

  // v0.1.10：AI 复核
  const onReview = async () => {
    if (!savedPath || reviewing) return;
    setReviewing(true);
    setReviewResult(null);
    try {
      const r = await window.vc.review(savedPath);
      setReviewResult(r);
      // 复核完成后刷新 iframe（如果当前在看这份报告）
      if (savedHtmlUrl) {
        // 加时间戳强制刷新缓存
        const fresh = savedHtmlUrl.split("?")[0] + "?t=" + Date.now();
        setSavedHtmlUrl(fresh);
        // 如果已打开预览，也同步刷新
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

  // v0.1.12：在历史预览弹窗里对任意 HTML 报告做 AI 复核
  const onHistoryReview = async () => {
    if (!viewing?.htmlPath || historyReviewing) return;
    setHistoryReviewing(true);
    setHistoryReviewMsg("复核中…（首次/降级模式可能 30~60 秒）");
    try {
      const r = await window.vc.review(viewing.htmlPath);
      if (r.ok) {
        const tag = r.mode === "legacy" ? " · 降级模式" : "";
        setHistoryReviewMsg(`✓ 复核 ${r.score}/100 · ${r.level} · ${r.issues} 条问题${tag}`);
        // 刷新 iframe，让用户看到注入后的卡片
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

  return (
    <div className="h-screen flex flex-col bg-stage text-ink">
      {/* Top bar */}
      <header className="px-4 py-3 border-b border-line flex items-center gap-3 bg-panel">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded bg-red flex items-center justify-center text-white font-bold text-sm">价</div>
          <div>
            <div className="text-sm font-semibold">价投合伙人</div>
            <div className="text-xs text-mute">A-Share Value Council · v0.1</div>
          </div>
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-3 text-xs text-mute">
          <span>边车 {healthInfo?.ok ? <span className="text-jade">●</span> : <span className="text-red-soft">●</span>}</span>
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
            <StatBadge phase={phase} />
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

          {/* 数据快照（始终可见） */}
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

          {/* 双大师卡片 */}
          <div className="flex-1 flex gap-3 min-h-0">
            <MasterCard
              title="巴菲特"
              subtitle="护城河 · ROE · 现金流 · 安全边际"
              thinking={buffettT}
              answer={buffettA}
              active={phase === "buffett"}
              done={!!buffettA && (phase === "duan" || phase === "done")}
            />
            <MasterCard
              title="段永平"
              subtitle="商业本质 · Stop Doing · 不贵就行"
              thinking={duanT}
              answer={duanA}
              active={phase === "duan"}
              done={!!duanA && phase === "done"}
            />
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
        onClose={() => { setSettingsOpen(false); setForcedSetup(false); }}
        onSaved={() => { refreshHealth(); }}
      />
    </div>
  );
}
