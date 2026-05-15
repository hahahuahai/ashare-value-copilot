"""
A-Share Value Council — Data Sidecar
基于 akshare 的 A 股数据微服务。
约定：
  - 所有数字以字符串形式返回（保持精度，TS 端用 Decimal 处理）
  - 缺失值返回 null，绝不填 0 / 估算 / 编造
  - 全部 GET，方便 TS 端 fetch
"""
from __future__ import annotations

import json
import datetime
import os
from decimal import Decimal
from typing import Any
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

try:
    import akshare as ak  # noqa
except ImportError:
    print("[fatal] akshare 未安装。请运行: pip install akshare pandas")
    raise

_STOCK_LIST_CACHE: dict[str, Any] = {"date": None, "rows": None}


def _to_str(v: Any) -> Any:
    """递归把 numpy/Decimal/Timestamp 转成 JSON 安全的字符串。"""
    import math
    import pandas as pd

    if v is None:
        return None
    if isinstance(v, (int,)):
        return str(v)
    if isinstance(v, float):
        if math.isnan(v) or math.isinf(v):
            return None
        return str(Decimal(repr(v)))
    if isinstance(v, Decimal):
        return str(v)
    if isinstance(v, (list, tuple)):
        return [_to_str(x) for x in v]
    if isinstance(v, dict):
        return {str(k): _to_str(val) for k, val in v.items()}
    if isinstance(v, pd.Timestamp):
        return v.strftime("%Y-%m-%d")
    # numpy types
    try:
        import numpy as np
        if isinstance(v, np.integer):
            return str(int(v))
        if isinstance(v, np.floating):
            f = float(v)
            if math.isnan(f) or math.isinf(f):
                return None
            return str(Decimal(repr(f)))
    except ImportError:
        pass
    return str(v)


def _retry(fn, attempts=3, delay=0.6):
    """简单的指数退避重试，专门兜底 akshare 偶发 RemoteDisconnected。"""
    import time
    last = None
    for i in range(attempts):
        try:
            return fn()
        except Exception as e:
            last = e
            if i < attempts - 1:
                time.sleep(delay * (2 ** i))
    raise last


def _load_stock_list_cache(today: str) -> list | None:
    cache_file = os.environ.get("STOCK_LIST_CACHE_FILE")
    if not cache_file or not os.path.exists(cache_file):
        return None
    try:
        with open(cache_file, "r", encoding="utf-8") as f:
            payload = json.load(f)
        rows = payload.get("rows")
        if payload.get("date") == today and isinstance(rows, list):
            return rows
    except Exception:
        return None
    return None


def _save_stock_list_cache(today: str, rows: list) -> None:
    cache_file = os.environ.get("STOCK_LIST_CACHE_FILE")
    if not cache_file:
        return
    try:
        parent = os.path.dirname(cache_file)
        if parent:
            os.makedirs(parent, exist_ok=True)
        with open(cache_file, "w", encoding="utf-8") as f:
            json.dump({"date": today, "rows": rows}, f, ensure_ascii=False)
    except Exception as e:
        print(f"[sidecar] stock list cache save failed: {e}")


def get_stock_search(q: str) -> dict:
    """A 股代码/名称模糊搜索。

    输入可以是 6 位完整代码、代码片段或中文公司简称片段。结果只返回 A 股代码表里的证券。
    """
    query = (q or "").strip()
    if not query:
        return {"query": query, "rows": [], "row_count": 0}

    today = datetime.date.today().isoformat()
    rows = _STOCK_LIST_CACHE.get("rows")
    if _STOCK_LIST_CACHE.get("date") != today or rows is None:
        cached_rows = _load_stock_list_cache(today)
        if cached_rows is not None:
            rows = cached_rows
            _STOCK_LIST_CACHE["date"] = today
            _STOCK_LIST_CACHE["rows"] = rows
        else:
            try:
                df = _retry(lambda: ak.stock_info_a_code_name(), attempts=3)
                rows = []
                if df is not None and not df.empty:
                    for _, r in df.iterrows():
                        code = str(r.get("code") or r.get("证券代码") or "").strip()
                        name = str(r.get("name") or r.get("证券简称") or "").strip()
                        if len(code) == 6 and code.isdigit() and name:
                            rows.append({"code": code, "name": name})
                _STOCK_LIST_CACHE["date"] = today
                _STOCK_LIST_CACHE["rows"] = rows
                _save_stock_list_cache(today, rows)
            except Exception as e:
                return {"query": query, "rows": [], "row_count": 0, "error": str(e)}

    q_lower = query.lower()
    is_digits = query.isdigit()
    matches = []
    for item in rows:
        code = item["code"]
        name = item["name"]
        score = None
        reason = ""
        if is_digits:
            if code == query:
                score, reason = 100, "code_exact"
            elif code.startswith(query):
                score, reason = 80 - max(0, len(code) - len(query)), "code_prefix"
            elif query in code:
                score, reason = 60, "code_contains"
        else:
            name_lower = name.lower()
            if name == query:
                score, reason = 100, "name_exact"
            elif name.startswith(query):
                score, reason = 85, "name_prefix"
            elif q_lower in name_lower:
                score, reason = 70, "name_contains"

        if score is not None:
            matches.append({**item, "score": score, "reason": reason})

    matches.sort(key=lambda x: (-x["score"], x["code"]))
    limited = matches[:20]
    return {"query": query, "rows": limited, "row_count": len(limited), "total_matches": len(matches)}


# ---------- handlers ----------

def get_company_profile(code: str) -> dict:
    """公司基本信息：三源兜底，只要任一源拿到名称/行业/主营就算成功。

    主源：东财 stock_individual_info_em（简洁，13 个字段，经常挂）
    备源 1：巨潮 stock_profile_cninfo（详细，26 个字段，稳定）
    备源 2：同花顺 stock_zyjs_ths（主营业务文字描述，稳定）
    """
    sources_tried: list = []
    merged: dict = {"code": code}

    # ---- 主源：东财（带重试） ----
    try:
        info = _retry(lambda: ak.stock_individual_info_em(symbol=code), attempts=3)
        if info is not None and not info.empty:
            for _, row in info.iterrows():
                item = str(row.get("item", "")).strip()
                val = row.get("value", None)
                if item:
                    merged[item] = _to_str(val)
            merged["_source"] = "em:stock_individual_info_em"
            sources_tried.append("em:OK")
            return merged
        sources_tried.append("em:EMPTY")
    except Exception as e:
        sources_tried.append(f"em:FAIL({type(e).__name__})")

    # ---- 备源 1：巨潮（字段最全） ----
    try:
        df = _retry(lambda: ak.stock_profile_cninfo(symbol=code), attempts=2)
        if df is not None and not df.empty:
            row = df.iloc[0].to_dict()
            # 字段映射：巨潮原字段 → 统一字段（对齐东财 key 便于上层复用）
            field_map = {
                "公司名称": "公司名称",
                "A股简称": "股票简称",
                "A股代码": "股票代码",
                "所属行业": "行业",           # 关键：对齐东财"行业" key
                "所属市场": "所属市场",
                "主营业务": "主营业务",
                "经营范围": "经营范围",
                "上市日期": "上市时间",
                "成立日期": "成立日期",
                "法人代表": "法人代表",
                "注册资金": "注册资本",
                "办公地址": "办公地址",
                "官方网站": "公司网址",
                "电子邮箱": "电子邮箱",
                "入选指数": "入选指数",
                "机构简介": "公司简介",
            }
            for src_k, dst_k in field_map.items():
                v = row.get(src_k)
                if v is not None and str(v).strip() and str(v).strip().lower() != "nan":
                    merged[dst_k] = _to_str(v)
            merged["_source"] = "cninfo:stock_profile_cninfo"
            sources_tried.append("cninfo:OK")
    except Exception as e:
        sources_tried.append(f"cninfo:FAIL({type(e).__name__})")

    # ---- 备源 2：同花顺主营（补主营业务文字） ----
    if "主营业务" not in merged:
        try:
            df2 = _retry(lambda: ak.stock_zyjs_ths(symbol=code), attempts=2)
            if df2 is not None and not df2.empty:
                r = df2.iloc[0].to_dict()
                for src_k in ["主营业务", "产品名称", "经营范围"]:
                    v = r.get(src_k)
                    if v is not None and str(v).strip() and str(v).strip().lower() != "nan":
                        merged[src_k] = _to_str(v)
                sources_tried.append("ths:OK")
                merged["_source"] = merged.get("_source") or "ths:stock_zyjs_ths"
        except Exception as e:
            sources_tried.append(f"ths:FAIL({type(e).__name__})")

    merged["_sources_tried"] = sources_tried
    if len(merged) <= 3:  # 只有 code / _source / _sources_tried
        return {"error": "all profile sources failed", "code": code,
                "_sources_tried": sources_tried}
    return merged


# 同花顺 stock_financial_abstract 用到的关键字段映射 → 输出字段名
_THS_KEY_FIELDS = {
    "净资产收益率(ROE)": "roe",
    "总资产报酬率(ROA)": "roa",
    "毛利率": "gross_margin",
    "销售净利率": "net_margin",
    "资产负债率": "debt_ratio",
    "经营现金流量净额": "ocf",
    "归母净利润": "np",
    "扣非净利润": "np_excl_nonrecur",
    "营业总收入": "revenue",
    "基本每股收益": "eps",
    "每股净资产": "bps",
    "每股经营现金流": "ocf_per_share",
}


def get_financial_indicator(code: str) -> dict:
    """财务指标历史。

    主源：新浪 stock_financial_analysis_indicator（频繁掉线）。
    兜底：同花顺 stock_financial_abstract（80 行指标 × 41 列日期，稳定可用）。
    返回结构兼容旧版（rows: [{日期, 净资产收益率(ROE), 资产负债率, ...}]），
    并额外提供每行 normalized 子对象供前端可视化直接用。
    """
    # ---- 主源：新浪（重试 2 次） ----
    try:
        df = _retry(
            lambda: ak.stock_financial_analysis_indicator(symbol=code, start_year="2014"),
            attempts=2,
        )
        if df is not None and not df.empty:
            if "日期" in df.columns:
                df = df.sort_values("日期", ascending=False).reset_index(drop=True)
            df = df.head(24)
            rows = []
            for _, r in df.iterrows():
                rows.append({k: _to_str(v) for k, v in r.to_dict().items()})
            return {
                "code": code,
                "rows": rows,
                "row_count": len(rows),
                "source": "sina:stock_financial_analysis_indicator",
            }
    except Exception:
        pass

    # ---- 兜底：同花顺 ----
    try:
        df = _retry(lambda: ak.stock_financial_abstract(symbol=code), attempts=3)
    except Exception as e:
        return {"error": f"both sina and ths financial endpoints failed: {e}", "code": code}

    if df is None or df.empty:
        return {"error": "empty data", "code": code}

    # 同花顺返回结构：第 1 列"选项"，第 2 列"指标"，第 3+ 列为日期 YYYYMMDD
    date_cols = [c for c in df.columns if isinstance(c, str) and len(c) == 8 and c.isdigit()]
    annual_cols = sorted([c for c in date_cols if c.endswith("1231")], reverse=True)

    rows = []
    for date_col in annual_cols[:12]:
        out_row = {"日期": f"{date_col[:4]}-{date_col[4:6]}-{date_col[6:8]}"}
        normalized: dict = {}
        for _, r in df.iterrows():
            indicator = str(r.get("指标", "")).strip()
            if not indicator:
                continue
            sval = _to_str(r.get(date_col))
            # 同名指标兼容：旧前端按中文 key 取
            if indicator in _THS_KEY_FIELDS and indicator not in out_row:
                out_row[indicator] = sval
                k = _THS_KEY_FIELDS[indicator]
                if k not in normalized:
                    normalized[k] = sval
        # 派生：经营现金流/净利润
        try:
            if normalized.get("ocf") and normalized.get("np"):
                ocf = float(normalized["ocf"])
                npv = float(normalized["np"])
                if npv != 0:
                    normalized["ocf_to_np"] = str(round(ocf / npv, 4))
        except Exception:
            pass
        out_row["normalized"] = normalized
        rows.append(out_row)

    return {
        "code": code,
        "rows": rows,
        "row_count": len(rows),
        "source": "ths:stock_financial_abstract",
    }


def get_valuation(code: str) -> dict:
    """当前估值：PE TTM / PB / PS / 总市值。

    主源：东财 stock_value_em（1918 行历史全量，数据稳定）
    备源：东财 stock_zh_a_hist（至少拿到收盘价 + 涨跌幅，PE/PB 由上层从 historical-pe 接口补充）
    """
    # ---- 主源 ----
    try:
        df = _retry(lambda: ak.stock_value_em(symbol=code), attempts=3)
        if df is not None and not df.empty:
            latest = df.iloc[-1].to_dict()
            return {
                "code": code,
                "as_of": _to_str(latest.get("数据日期")),
                "close": _to_str(latest.get("当日收盘价")),
                "change_pct": _to_str(latest.get("当日涨跌幅")),
                "pe_ttm": _to_str(latest.get("PE(TTM)")),
                "pe_static": _to_str(latest.get("PE(静)")),
                "pb": _to_str(latest.get("市净率")),
                "ps": _to_str(latest.get("市销率")),
                "peg": _to_str(latest.get("PEG值")),
                "pcf": _to_str(latest.get("市现率")),
                "total_mv": _to_str(latest.get("总市值")),
                "float_mv": _to_str(latest.get("流通市值")),
                "_source": "em:stock_value_em",
            }
    except Exception as e:
        primary_err = f"{type(e).__name__}: {str(e)[:100]}"
    else:
        primary_err = "empty"

    # ---- 备源：日 K（至少给出最新价） ----
    try:
        end = datetime.date.today().strftime("%Y%m%d")
        start = (datetime.date.today() - datetime.timedelta(days=10)).strftime("%Y%m%d")
        df2 = _retry(lambda: ak.stock_zh_a_hist(
            symbol=code, period="daily", start_date=start, end_date=end, adjust=""
        ), attempts=2)
        if df2 is not None and not df2.empty:
            last = df2.iloc[-1].to_dict()
            return {
                "code": code,
                "as_of": _to_str(last.get("日期")),
                "close": _to_str(last.get("收盘")),
                "change_pct": _to_str(last.get("涨跌幅")),
                "pe_ttm": None,
                "pe_static": None,
                "pb": None,
                "ps": None,
                "peg": None,
                "pcf": None,
                "total_mv": None,
                "float_mv": None,
                "_source": "em:stock_zh_a_hist(fallback)",
                "_warning": "PE/PB 等估值指标降级不可用，仅有收盘价",
            }
    except Exception as e:
        return {"error": f"both sources failed (primary: {primary_err}; hist: {e})", "code": code}

    return {"error": f"empty data (primary: {primary_err})", "code": code}


def get_quote(code: str) -> dict:
    """实时行情快照。双源兜底。"""
    # ---- 主源：东财 value_em ----
    try:
        df = _retry(lambda: ak.stock_value_em(symbol=code), attempts=2)
        if df is not None and not df.empty:
            r = df.iloc[-1].to_dict()
            return {
                "code": code,
                "as_of": _to_str(r.get("数据日期")),
                "price": _to_str(r.get("当日收盘价")),
                "change_pct": _to_str(r.get("当日涨跌幅")),
                "pe_ttm": _to_str(r.get("PE(TTM)")),
                "_source": "em:stock_value_em",
            }
    except Exception:
        pass

    # ---- 备源：东财日 K ----
    try:
        end = datetime.date.today().strftime("%Y%m%d")
        start = (datetime.date.today() - datetime.timedelta(days=10)).strftime("%Y%m%d")
        df2 = _retry(lambda: ak.stock_zh_a_hist(
            symbol=code, period="daily", start_date=start, end_date=end, adjust=""
        ), attempts=2)
        if df2 is not None and not df2.empty:
            last = df2.iloc[-1].to_dict()
            return {
                "code": code,
                "as_of": _to_str(last.get("日期")),
                "price": _to_str(last.get("收盘")),
                "change_pct": _to_str(last.get("涨跌幅")),
                "pe_ttm": None,
                "_source": "em:stock_zh_a_hist(fallback)",
            }
    except Exception as e:
        return {"error": f"quote both sources failed: {e}", "code": code}

    return {"error": "empty data", "code": code}


def get_dividend(code: str) -> dict:
    """近 10 年分红派息历史 + 最新股息率。双源兜底。

    主源：东财 stock_fhps_detail_em（含股息率字段，字段最全）
    备源：同花顺 stock_fhps_detail_ths（无股息率，但分红方案稳定）
    """
    # ---- 主源：东财 ----
    try:
        df = _retry(lambda: ak.stock_fhps_detail_em(symbol=code), attempts=3)
        if df is not None and not df.empty:
            return _parse_dividend_em(code, df)
    except Exception:
        pass

    # ---- 备源：同花顺（没有股息率，只有分红说明） ----
    try:
        df = _retry(lambda: ak.stock_fhps_detail_ths(symbol=code), attempts=2)
        if df is not None and not df.empty:
            return _parse_dividend_ths(code, df)
    except Exception as e:
        return {"error": f"dividend both sources failed: {e}", "code": code}

    return {"code": code, "rows": [], "row_count": 0, "_source": "empty"}


def _parse_dividend_em(code: str, df) -> dict:
    if "报告期" in df.columns:
        df = df.sort_values("报告期", ascending=False).reset_index(drop=True)
    cutoff = (datetime.date.today().year - 11)
    today_iso = datetime.date.today().isoformat()
    keep = []
    for _, r in df.iterrows():
        rp = str(r.get("报告期", ""))
        if not rp or (rp[:4].isdigit() and int(rp[:4]) < cutoff):
            continue
        # v0.1.8：过滤未来报告期（如 2026-06-30 这种"分红预案"行）
        if rp > today_iso:
            continue
        cash = r.get("现金分红-现金分红比例")
        # 现金分红为 0 / 缺失也直接跳，避免"零分红行"污染聚合
        try:
            if cash is None or float(cash) == 0:
                continue
        except Exception:
            pass
        keep.append({
            "report_date": _to_str(r.get("报告期")),
            "announce_date": _to_str(r.get("最新公告日期")),
            "cash_per_10shares": _to_str(r.get("现金分红-现金分红比例")),
            "scheme": _to_str(r.get("现金分红-现金分红比例描述")),
            "dividend_yield": _to_str(r.get("现金分红-股息率")),
            "eps": _to_str(r.get("每股收益")),
            "bps": _to_str(r.get("每股净资产")),
            "profit_yoy": _to_str(r.get("净利润同比增长")),
            "stage": _to_str(r.get("方案进度")),
        })

    # ---- v0.1.8：按"自然年"聚合中期+年末 ----
    # 同一年份多条分红（如 2025 年中期 + 2025 年末），合并 cash_per_10shares，
    # scheme 输出"中期 X + 年末 Y = 合计 Z 元"，让 yield 和 scheme 口径一致
    def _year_of(rp: str) -> str:
        return rp[:4] if rp and rp[:4].isdigit() else ""

    by_year: dict = {}
    for r in keep:
        y = _year_of(r.get("report_date") or "")
        if not y:
            continue
        by_year.setdefault(y, []).append(r)

    aggregated = []
    for y in sorted(by_year.keys(), reverse=True):
        items = by_year[y]
        # 按 report_date 升序：年中先、年末后
        items_sorted = sorted(items, key=lambda x: str(x.get("report_date") or ""))
        if len(items_sorted) == 1:
            aggregated.append(items_sorted[0])
            continue
        # 多次分红 → 合并
        try:
            total_cash = sum(
                float(it.get("cash_per_10shares") or 0)
                for it in items_sorted
                if it.get("cash_per_10shares")
            )
        except Exception:
            total_cash = None
        parts = []
        for it in items_sorted:
            rp = it.get("report_date") or ""
            cash = it.get("cash_per_10shares")
            # 06-30 / 09-30 = 中期；12-31 = 年末；其它原样
            if rp.endswith("06-30") or rp.endswith("09-30") or rp.endswith("03-31"):
                tag = "中期"
            elif rp.endswith("12-31"):
                tag = "年末"
            else:
                tag = rp
            if cash:
                parts.append(f"{tag} 10 派 {cash} 元")
        scheme_parts = " + ".join(parts)
        if total_cash is not None and len(items_sorted) > 1:
            scheme_combined = f"{scheme_parts} = 合计 10 派 {round(total_cash, 2)} 元"
        else:
            scheme_combined = scheme_parts or items_sorted[-1].get("scheme")
        # 取最后一条（年末）作为基础，覆盖 cash/scheme/yield
        merged = dict(items_sorted[-1])
        merged["report_date"] = f"{y}（合计）"
        merged["cash_per_10shares"] = (
            _to_str(round(total_cash, 4)) if total_cash is not None else merged.get("cash_per_10shares")
        )
        merged["scheme"] = scheme_combined
        # dividend_yield 重新合计：分子 cash_per_10shares 总和，分母不变（按 EM 提供的口径）
        # EM 的"现金分红-股息率"原值就是各期独立计算，加总后会偏差，所以这里不重算 yield，
        # 而是把"年中+年末" yield 直接相加（近似），如果有缺则保留最大那个
        try:
            yields = [float(it.get("dividend_yield") or 0) for it in items_sorted if it.get("dividend_yield")]
            if yields:
                merged["dividend_yield"] = _to_str(round(sum(yields), 6))
                merged["_yield_combined"] = True
        except Exception:
            pass
        merged["_aggregated_from"] = [it.get("report_date") for it in items_sorted]
        aggregated.append(merged)

    latest_yield = None
    for r in aggregated:
        if r.get("dividend_yield"):
            latest_yield = r
            break
    return {
        "code": code,
        "rows": aggregated[:30],
        "row_count": len(aggregated),
        "latest_yield_pct": (
            _to_str(round(float(latest_yield["dividend_yield"]) * 100, 4))
            if latest_yield and latest_yield.get("dividend_yield") else None
        ),
        "latest_yield_year": latest_yield.get("report_date") if latest_yield else None,
        "latest_yield_scheme": latest_yield.get("scheme") if latest_yield else None,
        "_source": "em:stock_fhps_detail_em",
        "_aggregation": "v0.1.8 中期+年末按年合并",
    }


def _parse_dividend_ths(code: str, df) -> dict:
    """同花顺兜底：没有股息率，但有分红方案。"""
    if "报告期" in df.columns:
        df = df.sort_values("报告期", ascending=False).reset_index(drop=True)
    cutoff = (datetime.date.today().year - 11)
    keep = []
    for _, r in df.iterrows():
        rp = str(r.get("报告期", ""))
        # 同花顺格式是 "2023年报"
        year_str = rp[:4] if rp[:4].isdigit() else ""
        if not year_str or int(year_str) < cutoff:
            continue
        keep.append({
            "report_date": _to_str(r.get("报告期")),
            "announce_date": _to_str(r.get("实施公告日")),
            "cash_per_10shares": None,  # 同花顺无此字段
            "scheme": _to_str(r.get("分红方案说明")),
            "dividend_yield": None,
            "eps": None,
            "bps": None,
            "profit_yoy": None,
            "stage": _to_str(r.get("方案进度")),
            "total_dividend": _to_str(r.get("分红总额")),
            "payout_ratio": _to_str(r.get("股利支付率")),
            "pretax_yield": _to_str(r.get("税前分红率")),
        })
    # 从税前分红率取最新股息率（% 字符串）
    latest_yield = None
    for r in keep:
        py = r.get("pretax_yield")
        if py and py != "--" and py is not None:
            latest_yield = r
            break
    return {
        "code": code,
        "rows": keep[:30],
        "row_count": len(keep),
        "latest_yield_pct": latest_yield.get("pretax_yield") if latest_yield else None,
        "latest_yield_year": latest_yield.get("report_date") if latest_yield else None,
        "_source": "ths:stock_fhps_detail_ths(fallback)",
        "_warning": "东财分红接口挂，降级到同花顺，部分字段（EPS/BPS/同比）不可用",
    }


def get_historical_pe(code: str) -> dict:
    """近 10 年 PE(TTM) 与 PB 历史，计算分位数。"""
    try:
        df = ak.stock_value_em(symbol=code)
    except Exception as e:
        return {"error": f"stock_value_em failed: {e}", "code": code}
    if df is None or df.empty:
        return {"error": "empty data", "code": code}

    if "数据日期" in df.columns:
        df = df.sort_values("数据日期").reset_index(drop=True)

    # 近 10 年
    today = datetime.date.today()
    cutoff = (today.replace(year=today.year - 10)).isoformat()
    df["数据日期"] = df["数据日期"].astype(str)
    df10 = df[df["数据日期"] >= cutoff].copy()
    if df10.empty:
        df10 = df

    # 抽样：每 20 个交易日取 1 个（≈月线）；最近 3 个月保留全部
    cutoff_3m = (today - datetime.timedelta(days=90)).isoformat()
    recent = df10[df10["数据日期"] >= cutoff_3m]
    older = df10[df10["数据日期"] < cutoff_3m].iloc[::20]
    sampled = pd_concat_safe(older, recent)

    series = []
    for _, r in sampled.iterrows():
        series.append({
            "date": _to_str(r.get("数据日期")),
            "pe_ttm": _to_str(r.get("PE(TTM)")),
            "pb": _to_str(r.get("市净率")),
            "close": _to_str(r.get("当日收盘价")),
        })

    # 分位数
    import numpy as np
    pe_arr = []
    pb_arr = []
    for _, r in df10.iterrows():
        pe = r.get("PE(TTM)")
        pb = r.get("市净率")
        try:
            f = float(pe)
            if 0 < f < 1000:
                pe_arr.append(f)
        except Exception:
            pass
        try:
            f = float(pb)
            if 0 < f < 100:
                pb_arr.append(f)
        except Exception:
            pass
    latest = df10.iloc[-1]
    cur_pe = float(latest.get("PE(TTM)")) if latest.get("PE(TTM)") and latest.get("PE(TTM)") == latest.get("PE(TTM)") else None
    cur_pb = float(latest.get("市净率")) if latest.get("市净率") and latest.get("市净率") == latest.get("市净率") else None

    def pct(arr, v):
        if not arr or v is None:
            return None
        a = sorted(arr)
        cnt = sum(1 for x in a if x <= v)
        return _to_str(round(cnt / len(a) * 100, 2))

    def stat(arr, fn):
        if not arr:
            return None
        return _to_str(round(float(fn(arr)), 4))

    return {
        "code": code,
        "as_of": _to_str(latest.get("数据日期")),
        "window": "近 10 年",
        "current_pe": _to_str(cur_pe),
        "current_pb": _to_str(cur_pb),
        "pe_percentile": pct(pe_arr, cur_pe),  # 0-100
        "pb_percentile": pct(pb_arr, cur_pb),
        "pe_min": stat(pe_arr, np.min),
        "pe_max": stat(pe_arr, np.max),
        "pe_median": stat(pe_arr, np.median),
        "pe_mean": stat(pe_arr, np.mean),
        "pb_min": stat(pb_arr, np.min),
        "pb_max": stat(pb_arr, np.max),
        "pb_median": stat(pb_arr, np.median),
        "samples_n": len(pe_arr),
        "series": series,  # 给前端画折线
    }


def pd_concat_safe(a, b):
    import pandas as pd
    return pd.concat([a, b], ignore_index=True)


def get_industry_compare(code: str) -> dict:
    """行业对比：拿到 profile 中的行业 → 找证监会行业 PE 中位数 → 返回对比数据。
    取上市公司协会分类的所有行业 PE，再按 profile.行业 模糊匹配。
    双源兜底：证监会分类 + 国证分类；7 天日期回溯。
    """
    today = datetime.date.today()
    df = None
    source_used = None
    err = None
    # 日期回溯 × 分类源双循环
    for delta in range(0, 8):
        d = today - datetime.timedelta(days=delta)
        for sym in ("证监会行业分类", "国证行业分类"):
            try:
                df_try = ak.stock_industry_pe_ratio_cninfo(
                    symbol=sym,
                    date=d.strftime("%Y%m%d"),
                )
                if df_try is not None and not df_try.empty:
                    df = df_try
                    source_used = f"cninfo:{sym}@{d.strftime('%Y%m%d')}"
                    break
            except Exception as e:
                err = str(e)
                continue
        if df is not None:
            break
    if df is None:
        return {"error": f"stock_industry_pe_ratio_cninfo failed for all 8 days × 2 syms: {err}", "code": code}

    # 获取本公司行业归属 —— 复用新的三源 profile
    # v0.1.8：拿到 industry 后，加上"主营业务"+"经营范围"作为关键词候选池
    # 增强匹配，避免被严格"包含"卡住（如"白酒"无法直接命中"酒饮料茶制造业"）
    industry = None
    profile_source = None
    business_text = ""
    try:
        prof = get_company_profile(code)
        for key in ("行业", "所属行业", "所属证监会行业", "行业分类", "所属板块"):
            v = prof.get(key)
            if v and str(v).strip() and str(v).strip().lower() != "nan":
                industry = str(v).strip()
                profile_source = prof.get("_source")
                break
        # 主营 / 经营范围 / 公司简介 拼成额外搜索文本
        for key in ("主营业务", "经营范围", "公司简介", "产品名称"):
            v = prof.get(key)
            if v and str(v).strip() and str(v).strip().lower() != "nan":
                business_text += " " + str(v).strip()
    except Exception:
        pass

    rows = []
    for _, r in df.iterrows():
        rows.append({
            "date": _to_str(r.get("变动日期")),
            "level": _to_str(r.get("行业层级")),
            "code": _to_str(r.get("行业编码")),
            "name": _to_str(r.get("行业名称")),
            "company_n": _to_str(r.get("公司数量")),
            "calc_n": _to_str(r.get("纳入计算公司数量")),
            "pe_weighted": _to_str(r.get("静态市盈率-加权平均")),
            "pe_median": _to_str(r.get("静态市盈率-中位数")),
            "pe_mean": _to_str(r.get("静态市盈率-算术平均")),
        })

    # ---- 鲁棒匹配 ----
    # 把行业名拆成关键词（剔除"业""制造""服务"等通用后缀），逐一匹配
    def _name_tokens(nm: str) -> list:
        if not nm:
            return []
        # "酒、饮料和精制茶制造业" -> ["酒", "饮料", "精制茶", "制造"]
        s = nm.replace("业", "").replace("及其他", "")
        for sep in ["、", "和", "及", "与", "／", "/", "，", ","]:
            s = s.replace(sep, "|")
        return [t.strip() for t in s.split("|") if t.strip() and len(t.strip()) >= 2]

    matched = None
    matched_score = 0  # 命中关键词个数，用于挑最优行业
    matched_reason = None

    if industry or business_text:
        haystack = (industry or "") + " " + business_text
        # 优先扫二级行业（level=2.0），更准
        for level_filter in ("2.0", "2", "1.0", "1"):
            best = None
            best_score = 0
            for r in rows:
                if str(r.get("level")) != level_filter:
                    continue
                tokens = _name_tokens(r["name"] or "")
                if not tokens:
                    continue
                score = sum(1 for t in tokens if t in haystack)
                # 反向：行业名整体被 industry 包含也加分
                if r["name"] and r["name"] in haystack:
                    score += 2
                if industry and r["name"] and (r["name"] in industry or industry in r["name"]):
                    score += 3
                if score > best_score:
                    best_score = score
                    best = r
            if best and best_score >= 1:
                matched = best
                matched_score = best_score
                matched_reason = f"level={level_filter} score={best_score}"
                break

    # 降级：真的匹配不到，才回退；且不再选"制造业"这种空泛大类，
    # 而是返回 null 让前端清楚展示"行业归属未知"
    fallback_used = False
    fallback_reason = None
    if not matched:
        if not industry and not business_text:
            fallback_reason = "公司 profile 与主营业务文字均缺失"
        else:
            fallback_reason = (
                f"行业关键词 '{industry or business_text[:30]}' 未在 cninfo 行业表中命中，"
                f"现有 {len(rows)} 行（level 分布：" +
                ",".join(sorted({str(r.get('level')) for r in rows if r.get('level')})) +
                "）"
            )
        # 仅当用户/上层明确接受"全市场参考"才返回；这里返回 None 由前端决策
        matched = None

    return {
        "code": code,
        "industry": industry,
        "business_text_len": len(business_text),
        "matched": matched,
        "matched_fallback": fallback_used,
        "matched_reason": matched_reason,
        "fallback_reason": fallback_reason,
        "all_rows": rows,
        "row_count": len(rows),
        "_source": source_used,
        "_profile_source": profile_source,
    }


ROUTES = {
    "/search": get_stock_search,
    "/profile": get_company_profile,
    "/financial": get_financial_indicator,
    "/valuation": get_valuation,
    "/quote": get_quote,
    "/dividend": get_dividend,
    "/historical-pe": get_historical_pe,
    "/industry-compare": get_industry_compare,
}


# ---------- http server ----------

class Handler(BaseHTTPRequestHandler):
    def _json(self, code: int, payload: Any) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        url = urlparse(self.path)
        path = url.path

        if path == "/healthz":
            self._json(200, {"ok": True, "service": "value-council-data-sidecar"})
            return

        handler = ROUTES.get(path)
        if not handler:
            self._json(404, {"error": "no such route", "path": path,
                             "routes": list(ROUTES.keys())})
            return

        qs = parse_qs(url.query)
        code = (qs.get("code", [""])[0] or "").strip()
        if path == "/search":
            code = (qs.get("q", [""])[0] or code).strip()
        if not code:
            self._json(400, {"error": "missing ?code=600519 or ?q=茅台"})
            return

        try:
            result = handler(code)
            self._json(200, result)
        except Exception as e:
            self._json(500, {"error": str(e), "path": path, "code": code})

    def log_message(self, format: str, *args: Any) -> None:
        print(f"[sidecar] {self.address_string()} - {format % args}")


def main() -> None:
    host = os.environ.get("DATA_SIDECAR_HOST", "127.0.0.1")
    port = int(os.environ.get("DATA_SIDECAR_PORT", "9876"))
    print(f"[sidecar] listening on http://{host}:{port}")
    print(f"[sidecar] routes: {list(ROUTES.keys()) + ['/healthz']}")
    ThreadingHTTPServer((host, port), Handler).serve_forever()


if __name__ == "__main__":
    main()
