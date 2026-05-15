/**
 * @vc/data — 调用 Python 边车的 TS 客户端。
 * 所有数字保持字符串格式（保持精度），由 Agent 端用 Decimal/字符串处理。
 */

const SIDECAR = process.env.DATA_SIDECAR_URL ?? "http://127.0.0.1:9876";

async function call<T = unknown>(path: string, code: string): Promise<T> {
  const url = `${SIDECAR}${path}?code=${encodeURIComponent(code)}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`[data] ${path} ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as T;
}

async function callQuery<T = unknown>(path: string, query: string): Promise<T> {
  const url = `${SIDECAR}${path}?q=${encodeURIComponent(query)}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`[data] ${path} ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as T;
}

export interface CompanyProfile {
  code: string;
  [key: string]: string | null | undefined;
}
export interface ValuationSnapshot {
  code: string;
  as_of?: string | null;
  pe_ttm?: string | null;
  pe?: string | null;
  pb?: string | null;
  ps_ttm?: string | null;
  dv_ratio?: string | null;
  dv_ttm?: string | null;
  total_mv?: string | null;
}
export interface FinancialRow {
  [key: string]: string | null;
}
export interface FinancialIndicator {
  code: string;
  rows: FinancialRow[];
  row_count: number;
  error?: string;
}
export interface QuoteSnapshot {
  code: string;
  name?: string | null;
  price?: string | null;
  change_pct?: string | null;
  pe_dynamic?: string | null;
  error?: string;
}
export interface DividendData {
  code: string;
  rows: Array<Record<string, string | null>>;
  row_count: number;
  latest_yield_pct?: string | null;
  latest_yield_year?: string | null;
  error?: string;
}
export interface HistoricalPE {
  code: string;
  as_of?: string | null;
  window?: string;
  current_pe?: string | null;
  current_pb?: string | null;
  pe_percentile?: string | null;
  pb_percentile?: string | null;
  pe_min?: string | null;
  pe_max?: string | null;
  pe_median?: string | null;
  pe_mean?: string | null;
  pb_min?: string | null;
  pb_max?: string | null;
  pb_median?: string | null;
  samples_n?: number;
  series?: Array<{ date: string; pe_ttm?: string | null; pb?: string | null; close?: string | null }>;
  error?: string;
}
export interface IndustryCompare {
  code: string;
  industry?: string | null;
  matched?: Record<string, string | null> | null;
  all_rows?: Array<Record<string, string | null>>;
  row_count?: number;
  error?: string;
}
export interface StockSearchResult {
  code: string;
  name: string;
  score?: number;
  reason?: string;
}
export interface StockSearchResponse {
  query: string;
  rows: StockSearchResult[];
  row_count: number;
  total_matches?: number;
  error?: string;
}

export const data = {
  searchStocks: (query: string) => callQuery<StockSearchResponse>("/search", query),
  profile: (code: string) => call<CompanyProfile>("/profile", code),
  financial: (code: string) => call<FinancialIndicator>("/financial", code),
  valuation: (code: string) => call<ValuationSnapshot>("/valuation", code),
  quote: (code: string) => call<QuoteSnapshot>("/quote", code),
  dividend: (code: string) => call<DividendData>("/dividend", code),
  historicalPE: (code: string) => call<HistoricalPE>("/historical-pe", code),
  industryCompare: (code: string) => call<IndustryCompare>("/industry-compare", code),
  health: async (): Promise<boolean> => {
    try {
      const r = await fetch(`${SIDECAR}/healthz`);
      return r.ok;
    } catch {
      return false;
    }
  },
};

/** 把数据打包成 Agent 上下文里的 single source of truth。 */
export async function buildDataPack(code: string) {
  const [profile, valuation, quote, financial, dividend, historicalPE, industryCompare] = await Promise.all([
    data.profile(code).catch((e) => ({ error: String(e) })),
    data.valuation(code).catch((e) => ({ error: String(e) })),
    data.quote(code).catch((e) => ({ error: String(e) })),
    data.financial(code).catch((e) => ({ error: String(e) })),
    data.dividend(code).catch((e) => ({ error: String(e) })),
    data.historicalPE(code).catch((e) => ({ error: String(e) })),
    data.industryCompare(code).catch((e) => ({ error: String(e) })),
  ]);
  return {
    code,
    fetched_at: new Date().toISOString(),
    sources: ["akshare via local sidecar"],
    profile,
    valuation,
    quote,
    financial,
    dividend,
    historicalPE,
    industryCompare,
  };
}

export type DataPack = Awaited<ReturnType<typeof buildDataPack>>;
