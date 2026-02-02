import { fetchAllEconomicIndicators, getIndicatorDetail } from "../../src/economic-indicators.js";
import { fetchH41Report } from "../../src/h41.js";
import { fetchFRED } from "../../src/secret-indicators.js";
import { getMarketPrices } from "../../lib/market/getPrices.js";
import { fetchFinraMarginDebt } from "../../lib/sources/finra-margin-debt.js";

type FetchMode = "exact" | "latest_before" | "latest_after" | "fallback" | "cache" | "internal";

type TableRow = {
  group: string;
  label: string;
  key: string;
  value: number | null;
  source: "internal" | "external";
  status: "ok" | "na";
  error?: string;
  /** 요청한 날짜 (YYYY-MM-DD) */
  selectedDate: string;
  /** 실제 값이 속한 날짜. null이면 미확인(표시 시 N/A) */
  valueDate: string | null;
  fetchMode: FetchMode;
  cacheKey?: string;
  reasonIfMismatch?: string;
};

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const toUtcSeconds = (ymd: string, hour: number, minute: number) => {
  const [year, month, day] = ymd.split("-").map((v) => Number(v));
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  return Math.floor(Date.UTC(year, month - 1, day, hour, minute, 0) / 1000);
};

const fetchJsonWithRetry = async (url: string, retries: number = 1, timeoutMs: number = 6000) => {
  let lastError: string | null = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; fedreportsh/1.0; +https://fedreportsh.vercel.app)",
          Accept: "application/json",
          "Accept-Language": "en-US,en;q=0.9",
          "Cache-Control": "no-cache",
        },
        signal: controller.signal,
      });
      if (!response.ok) {
        lastError = `status ${response.status}`;
        continue;
      }
      const data = await response.json();
      clearTimeout(timeout);
      return { ok: true as const, data };
    } catch (error: any) {
      lastError = error?.message || "fetch failed";
    } finally {
      clearTimeout(timeout);
    }
  }
  return { ok: false as const, error: lastError || "fetch failed" };
};

const fetchYahooDailyValue = async (symbol: string, date: string) => {
  const start = toUtcSeconds(date, 0, 0);
  const end = toUtcSeconds(date, 23, 59);
  if (start === null || end === null) {
    return { value: null, error: "invalid date" };
  }
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    symbol
  )}?interval=1d&period1=${start}&period2=${end + 60}`;
  const result = await fetchJsonWithRetry(url);
  if (!result.ok) {
    return { value: null, error: result.error };
  }
  const payload = result.data;
  const data = payload?.chart?.result?.[0];
  const closes = data?.indicators?.quote?.[0]?.close || [];
  const valid = closes.filter((v: number | null) => typeof v === "number");
  if (!valid.length) {
    return { value: null, error: "no data" };
  }
  return { value: Number(valid[valid.length - 1]), error: null };
};

/** Yahoo: 선택일 포함 과거 기간에서 가장 최근 거래일 종가. 값 아래 관측일 표기용 */
const fetchYahooLatestBefore = async (symbol: string, date: string) => {
  const end = toUtcSeconds(date, 23, 59);
  const start = toUtcSeconds(date, 0, 0);
  if (start === null || end === null) return { value: null, valueDate: null, error: "invalid date" };
  const startPast = start - 14 * 24 * 3600;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    symbol
  )}?interval=1d&period1=${startPast}&period2=${end + 60}`;
  const result = await fetchJsonWithRetry(url);
  if (!result.ok) return { value: null, valueDate: null, error: result.error };
  const data = result.data?.chart?.result?.[0];
  const timestamps = data?.timestamp || [];
  const closes = data?.indicators?.quote?.[0]?.close || [];
  const valid: { ts: number; close: number }[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const c = closes[i];
    if (typeof c === "number" && Number.isFinite(c) && timestamps[i] != null) {
      valid.push({ ts: timestamps[i], close: c });
    }
  }
  if (!valid.length) return { value: null, valueDate: null, error: "no data" };
  const last = valid[valid.length - 1];
  const d = new Date(last.ts * 1000);
  const valueDate = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  return { value: last.close, valueDate, error: null };
};

/** FRED: observation_end=date, limit=1 desc → 해당일 또는 그 이전 최신 1건. valueDate로 exact 검사 */
const fetchFredValue = async (seriesId: string, date: string) => {
  const apiKey = process.env.FRED_API_KEY || "demo";
  const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${apiKey}&file_type=json&limit=1&sort_order=desc&observation_end=${date}`;
  const result = await fetchJsonWithRetry(url);
  if (!result.ok) {
    return { value: null, valueDate: null, error: result.error };
  }
  const observations = result.data?.observations || [];
  if (!observations.length) {
    return { value: null, valueDate: null, error: "no data" };
  }
  const latest = observations[0];
  const obsDate = typeof latest?.date === "string" ? latest.date : null;
  if (!latest || latest.value === "." || latest.value === null) {
    return { value: null, valueDate: obsDate, error: "no data" };
  }
  const value = Number(latest.value);
  return Number.isFinite(value)
    ? { value, valueDate: obsDate, error: null }
    : { value: null, valueDate: obsDate, error: "invalid" };
};

/** page3: 선택일 exact match만 허용. 해당일 데이터 없으면 null */
const pickHistoryValueExact = (history: Array<{ date: string; value: number }>, date: string) => {
  const entry = history.find((item) => item.date === date);
  return entry ? entry.value : null;
};

const resolveRow = (
  group: string,
  label: string,
  key: string,
  selectedDate: string,
  payload: {
    value: number | null;
    source: "internal" | "external";
    error?: string;
    valueDate?: string | null;
    fetchMode?: FetchMode;
    reasonIfMismatch?: string;
  } | null
): TableRow => {
  const valueDate = payload?.valueDate ?? null;
  const fetchMode = payload?.fetchMode ?? "internal";
  /** valueDate가 selectedDate와 정확히 일치할 때만 값 표시. null이면 미확인 → N/A */
  const exactMatch = valueDate === selectedDate;
  const displayValue = exactMatch ? (payload?.value ?? null) : null;
  const status = displayValue !== null && displayValue !== undefined ? "ok" : "na";
  const reasonIfMismatch = !exactMatch ? (payload?.reasonIfMismatch ?? (valueDate ? "no_exact_data_for_date" : "no_date_from_source")) : undefined;
  return {
    group,
    label,
    key,
    value: displayValue,
    source: payload?.source ?? "external",
    status,
    error: status === "na" ? payload?.error : undefined,
    selectedDate,
    valueDate,
    fetchMode,
    reasonIfMismatch,
  };
};

/** 1~5번 지표: N/A일 때 근처 값/다른 소스 허용. 값 표시 + valueDate는 클라이언트에서 "값 아래(날짜)" 표기 */
const FALLBACK_ALLOWED_KEYS = new Set([
  "SOFR", "RRPONTSYD", "EFFR", "HIGH_YIELD",
  "VIX", "FEAR_GREED",
  "DOW", "NASDAQ", "SP500", "ICSA",
  "M2", "MARGIN_DEBT",
  "UNRATE", "ISM", "RRSFS", "CASS", "STLFSI4",
]);

const resolveRowFallback = (
  group: string,
  label: string,
  key: string,
  selectedDate: string,
  payload: {
    value: number | null;
    source: "internal" | "external";
    valueDate?: string | null;
    fetchMode?: FetchMode;
  } | null
): TableRow => {
  const valueDate = payload?.valueDate ?? null;
  const fetchMode = payload?.fetchMode ?? "fallback";
  const displayValue = payload?.value ?? null;
  const status = displayValue !== null && displayValue !== undefined ? "ok" : "na";
  return {
    group,
    label,
    key,
    value: displayValue,
    source: payload?.source ?? "external",
    status,
    error: status === "na" ? undefined : undefined,
    selectedDate,
    valueDate,
    fetchMode,
    reasonIfMismatch: valueDate && valueDate !== selectedDate ? "nearest_before" : undefined,
  };
};

export default async function handler(req: any, res: any) {
  const dateParam = typeof req.query?.date === "string" ? req.query.date : "";
  const selectedDate = DATE_REGEX.test(dateParam)
    ? dateParam
    : new Date().toISOString().slice(0, 10);

  const warnings: string[] = [];
  const rows: TableRow[] = [];

  const [economicIndicators, h41Report, marketSnapshot, yieldSpreadDetail] = await Promise.all([
    fetchAllEconomicIndicators().catch(() => {
      warnings.push("경제지표 데이터를 불러오지 못했습니다.");
      return [];
    }),
    fetchH41Report(selectedDate).catch(() => {
      warnings.push("H.4.1 데이터를 불러오지 못했습니다.");
      return null;
    }),
    getMarketPrices(["USDKRW", "MARGIN_DEBT"]).catch(() => null),
    getIndicatorDetail("yield-spread", "1Y").catch(() => {
      warnings.push("금리스프레드 데이터를 불러오지 못했습니다.");
      return null;
    }),
  ]);

  const econByName = (needle: string) =>
    economicIndicators.find((item) => item.name.includes(needle));

  const econValue = (needle: string) => {
    const found = econByName(needle);
    if (!found) return null;
    return {
      value: found.value ?? null,
      source: "internal" as const,
      valueDate: null,
      fetchMode: "internal" as const,
    };
  };

  const h41Value = (fedLabel: string) => {
    const card = h41Report?.cards?.find((item) => item.fedLabel === fedLabel);
    if (!card) return null;
    return {
      value: Number(card.balance_okeusd),
      source: "internal" as const,
      valueDate: selectedDate,
      fetchMode: "exact" as const,
    };
  };

  const marketValue = (key: string) => {
    const item = marketSnapshot?.items?.find((entry: any) => entry.key === key);
    if (!item || !item.ok) return null;
    return {
      value: item.price ?? null,
      source: "internal" as const,
      valueDate: null,
      fetchMode: "internal" as const,
    };
  };

  // 글로벌 — Yahoo는 해당일 요청이므로 valueDate = selectedDate
  const dxyValue = await fetchYahooDailyValue("DX-Y.NYB", selectedDate);
  rows.push(
    resolveRow("글로벌", "(D)DXY 달러지수", "DXY", selectedDate, {
      value: dxyValue.value,
      source: "external",
      error: dxyValue.error || undefined,
      valueDate: selectedDate,
      fetchMode: "exact",
    }),
    resolveRow("글로벌", "(D)DXY 달러환율", "USDKRW", selectedDate, marketValue("USDKRW") ?? { value: null, source: "internal", valueDate: null, fetchMode: "internal" })
  );
  if (rows[rows.length - 1].value === null) {
    const usdkrw = await fetchYahooDailyValue("USDKRW=X", selectedDate);
    rows[rows.length - 1] = resolveRow("글로벌", "(D)DXY 달러환율", "USDKRW", selectedDate, {
      value: usdkrw.value,
      source: "external",
      error: usdkrw.error || undefined,
      valueDate: selectedDate,
      fetchMode: "exact",
    });
  }
  const yenValue = await fetchYahooDailyValue("JPYKRW=X", selectedDate);
  rows.push(
    resolveRow("글로벌", "원/엔", "JPYKRW", selectedDate, {
      value: yenValue.value,
      source: "external",
      error: yenValue.error || undefined,
      valueDate: selectedDate,
      fetchMode: "exact",
    })
  );

  // 금리 — 2Y/10Y는 economic-indicators(미국 2년물·10년물) 값 우선 표시
  const dgs3 = await fetchFredValue("DGS3", selectedDate);
  const econ2y = econValue("미국 2년물");
  const econ10y = econValue("미국 10년물");
  rows.push(
    resolveRow("금리", "미국국채 3Y", "DGS3", selectedDate, {
      value: dgs3.value,
      source: "external",
      error: dgs3.error || undefined,
      valueDate: dgs3.valueDate,
      fetchMode: "exact",
    }),
    resolveRow("금리", "미국국채 2Y", "DGS2", selectedDate, econ2y ?? { value: null, source: "internal", valueDate: null, fetchMode: "internal" }),
    resolveRow("금리", "미국국채 10Y", "DGS10", selectedDate, econ10y ?? { value: null, source: "internal", valueDate: null, fetchMode: "internal" })
  );
  // economic-indicators 값이 있으면 표시 (날짜 미표기). /economic-indicators 와 동일 소스
  if (rows[rows.findIndex((r) => r.key === "DGS2")]?.status === "na" && econ2y?.value != null) {
    rows[rows.findIndex((r) => r.key === "DGS2")] = resolveRowFallback("금리", "미국국채 2Y", "DGS2", selectedDate, { value: econ2y.value, valueDate: null, source: "internal", fetchMode: "fallback" });
  }
  if (rows[rows.findIndex((r) => r.key === "DGS10")]?.status === "na" && econ10y?.value != null) {
    rows[rows.findIndex((r) => r.key === "DGS10")] = resolveRowFallback("금리", "미국국채 10Y", "DGS10", selectedDate, { value: econ10y.value, valueDate: null, source: "internal", fetchMode: "fallback" });
  }

  // 금리스프레드(10Y-2Y) — economic-indicators 금리스프레드(10Y-2Y) 값 우선
  const econYieldSpread = econValue("금리스프레드");
  const yieldSpreadValue =
    yieldSpreadDetail?.history?.length
      ? pickHistoryValueExact(yieldSpreadDetail.history, selectedDate)
      : null;
  rows.push(
    resolveRow("금리", "금리스프레드 (10Y-2Y)", "YIELD_SPREAD_10Y_2Y", selectedDate, {
      value: typeof yieldSpreadValue === "number" ? yieldSpreadValue : (econYieldSpread?.value ?? null),
      source: "internal",
      error: yieldSpreadValue === null && !econYieldSpread?.value ? "not available" : undefined,
      valueDate: yieldSpreadValue !== null ? selectedDate : null,
      fetchMode: "exact",
    })
  );
  if (rows[rows.findIndex((r) => r.key === "YIELD_SPREAD_10Y_2Y")]?.status === "na" && econYieldSpread?.value != null) {
    rows[rows.findIndex((r) => r.key === "YIELD_SPREAD_10Y_2Y")] = resolveRowFallback(
      "금리",
      "금리스프레드 (10Y-2Y)",
      "YIELD_SPREAD_10Y_2Y",
      selectedDate,
      { value: econYieldSpread.value, valueDate: null, source: "internal", fetchMode: "fallback" }
    );
  } else if (rows[rows.findIndex((r) => r.key === "YIELD_SPREAD_10Y_2Y")]?.status === "na") {
    const tenYearValue = await fetchFredValue("DGS10", selectedDate);
    const twoYearValue = await fetchFredValue("DGS2", selectedDate);
    const fallbackValue =
      typeof tenYearValue.value === "number" && typeof twoYearValue.value === "number" &&
      tenYearValue.valueDate === selectedDate && twoYearValue.valueDate === selectedDate
        ? tenYearValue.value - twoYearValue.value
        : null;
    rows[rows.findIndex((row) => row.key === "YIELD_SPREAD_10Y_2Y")] = resolveRow(
      "금리",
      "금리스프레드 (10Y-2Y)",
      "YIELD_SPREAD_10Y_2Y",
      selectedDate,
      {
        value: fallbackValue,
        source: "external",
        error: fallbackValue === null ? "not available" : undefined,
        valueDate: tenYearValue.valueDate === selectedDate ? selectedDate : null,
        fetchMode: "exact",
      }
    );
  }

  // 시장금리 — SOFR, ON RRP, 하이일드스프레드는 economic-indicators 값 우선
  const econSofr = econValue("USD SOFR");
  const econOnRrp = econValue("ON RRP");
  const econHighYield = econValue("하이일드");
  rows.push(
    resolveRow("시장금리", "USD SOFR (미국 달러 SOFR 금리)", "SOFR", selectedDate, econSofr ?? { value: null, source: "internal", valueDate: null, fetchMode: "internal" }),
    resolveRow("시장금리", "ON RRP", "RRPONTSYD", selectedDate, econOnRrp ?? { value: null, source: "internal", valueDate: null, fetchMode: "internal" }),
    resolveRow("시장금리", "EFFR", "EFFR", selectedDate, econValue("기준금리") ?? { value: null, source: "internal", valueDate: null, fetchMode: "internal" }),
    resolveRow("시장금리", "하이일드스프레드", "HIGH_YIELD", selectedDate, econHighYield ?? { value: null, source: "internal", valueDate: null, fetchMode: "internal" })
  );
  if (rows[rows.findIndex((r) => r.key === "SOFR")]?.status === "na" && econSofr?.value != null) {
    rows[rows.findIndex((r) => r.key === "SOFR")] = resolveRowFallback("시장금리", "USD SOFR (미국 달러 SOFR 금리)", "SOFR", selectedDate, { value: econSofr.value, valueDate: null, source: "internal", fetchMode: "fallback" });
  }
  if (rows[rows.findIndex((r) => r.key === "RRPONTSYD")]?.status === "na" && econOnRrp?.value != null) {
    rows[rows.findIndex((r) => r.key === "RRPONTSYD")] = resolveRowFallback("시장금리", "ON RRP", "RRPONTSYD", selectedDate, { value: econOnRrp.value, valueDate: null, source: "internal", fetchMode: "fallback" });
  }
  if (rows[rows.findIndex((r) => r.key === "HIGH_YIELD")]?.status === "na" && econHighYield?.value != null) {
    rows[rows.findIndex((r) => r.key === "HIGH_YIELD")] = resolveRowFallback("시장금리", "하이일드스프레드", "HIGH_YIELD", selectedDate, { value: econHighYield.value, valueDate: null, source: "internal", fetchMode: "fallback" });
  }
  const effr = await fetchFredValue("EFFR", selectedDate);
  if (effr.valueDate === selectedDate && effr.value !== null) {
    rows[rows.findIndex((row) => row.key === "EFFR")] = resolveRow("시장금리", "EFFR", "EFFR", selectedDate, {
      value: effr.value,
      source: "external",
      valueDate: effr.valueDate,
      fetchMode: "exact",
    });
  }
  // EFFR 폴백용 보관 (아래 1~5번 폴백에서 사용)
  const effrForFallback = effr;
  // 심리
  rows.push(
    resolveRow("심리", "VIX", "VIX", selectedDate, econValue("VIX") ?? { value: null, source: "internal", valueDate: null, fetchMode: "internal" }),
    resolveRow("심리", "Fear & Greed Index 지수", "FEAR_GREED", selectedDate, econValue("Fear & Greed") ?? { value: null, source: "internal", valueDate: null, fetchMode: "internal" })
  );

  // 시장
  const kospi = await fetchYahooDailyValue("^KS11", selectedDate);
  const nikkei = await fetchYahooDailyValue("^N225", selectedDate);
  rows.push(
    resolveRow("시장", "코스피", "KOSPI", selectedDate, {
      value: kospi.value,
      source: "external",
      error: kospi.error || undefined,
      valueDate: selectedDate,
      fetchMode: "exact",
    }),
    resolveRow("시장", "닛케이", "NIKKEI", selectedDate, {
      value: nikkei.value,
      source: "external",
      error: nikkei.error || undefined,
      valueDate: selectedDate,
      fetchMode: "exact",
    }),
    resolveRow("시장", "다우존스", "DOW", selectedDate, econValue("다우존스") ?? { value: null, source: "internal", valueDate: null, fetchMode: "internal" }),
    resolveRow("시장", "나스닥", "NASDAQ", selectedDate, econValue("나스닥") ?? { value: null, source: "internal", valueDate: null, fetchMode: "internal" }),
    resolveRow("시장", "S&P500", "SP500", selectedDate, econValue("S&P500") ?? { value: null, source: "internal", valueDate: null, fetchMode: "internal" }),
    resolveRow("시장", "실업수당 청구건수 (미국 주요)", "ICSA", selectedDate, econValue("실업수당청구건수") ?? { value: null, source: "internal", valueDate: null, fetchMode: "internal" })
  );

  // 연준(자산) — fed-assets-liabilities 동일 소스(H.4.1). 선택일과 가장 가까운 데이터, 값 하단에 (week ended) 표기
  const h41WeekEnded = (h41Report as { asOfWeekEndedText?: string } | null)?.asOfWeekEndedText ?? null;
  const h41ValueWithDate = (fedLabel: string) => {
    const v = h41Value(fedLabel);
    if (!v) return null;
    return { ...v, valueDate: h41WeekEnded };
  };
  rows.push(
    resolveRow("연준(자산)", "국채 (U.S. Treasury securities)", "UST", selectedDate, h41ValueWithDate("U.S. Treasury securities") ?? { value: null, source: "internal", valueDate: null, fetchMode: "internal" }),
    resolveRow("연준(자산)", "MBS (Mortgage-backed securities)", "MBS", selectedDate, h41ValueWithDate("Mortgage-backed securities") ?? { value: null, source: "internal", valueDate: null, fetchMode: "internal" }),
    resolveRow("연준(자산)", "레포 (Repurchase agreements)", "REPO", selectedDate, h41ValueWithDate("Repurchase agreements") ?? { value: null, source: "internal", valueDate: null, fetchMode: "internal" }),
    resolveRow("연준(자산)", "대출 (Loans)", "LOANS", selectedDate, h41ValueWithDate("Primary credit") ?? { value: null, source: "internal", valueDate: null, fetchMode: "internal" })
  );
  // 연준(자산): valueDate가 있으면 표시(괄호 안 날짜). exact가 아니어도 값 표시하도록 fallback 처리
  for (const key of ["UST", "MBS", "REPO", "LOANS"]) {
    const idx = rows.findIndex((r) => r.key === key);
    const row = rows[idx];
    if (row && row.value != null && h41WeekEnded && row.status === "na") {
      rows[idx] = resolveRowFallback(row.group, row.label, key, selectedDate, { value: row.value, valueDate: h41WeekEnded, source: "internal", fetchMode: "fallback" });
    }
  }

  // 연준(부채)
  rows.push(
    resolveRow("연준(부채)", "시중통화량 (Currency in circulation)", "CURRENCY", selectedDate, h41Value("Currency in circulation") ?? { value: null, source: "internal", valueDate: null, fetchMode: "internal" }),
    resolveRow("연준(부채)", "역레포 (Reverse repurchase agreements)", "RRP", selectedDate, h41Value("Reverse repurchase agreements") ?? { value: null, source: "internal", valueDate: null, fetchMode: "internal" }),
    resolveRow("연준(부채)", "TGA (U.S. Treasury, General Account)", "TGA", selectedDate, h41Value("U.S. Treasury, General Account") ?? { value: null, source: "internal", valueDate: null, fetchMode: "internal" }),
    resolveRow("연준(부채)", "지급준비금 (Reserve balances)", "RESERVE", selectedDate, h41Value("Reserve balances with Federal Reserve Banks") ?? { value: null, source: "internal", valueDate: null, fetchMode: "internal" }),
    resolveRow("연준(부채)", "현금", "CASH", selectedDate, h41Value("Currency in circulation") ?? { value: null, source: "internal", valueDate: null, fetchMode: "internal" })
  );

  // 통화량 — M2는 economic-indicators M2(통화량) 값 우선
  const econM2 = econValue("M2 (통화량)");
  rows.push(
    resolveRow("통화량", "M2", "M2", selectedDate, econM2 ?? { value: null, source: "internal", valueDate: null, fetchMode: "internal" }),
    resolveRow("통화량", "마진데트 (시장유동성)", "MARGIN_DEBT", selectedDate, marketValue("MARGIN_DEBT") ?? { value: null, source: "internal", valueDate: null, fetchMode: "internal" })
  );
  if (rows[rows.findIndex((r) => r.key === "M2")]?.status === "na" && econM2?.value != null) {
    rows[rows.findIndex((r) => r.key === "M2")] = resolveRowFallback("통화량", "M2", "M2", selectedDate, { value: econM2.value, valueDate: null, source: "internal", fetchMode: "fallback" });
  }
  const marginDebt = await fetchFinraMarginDebt().catch(() => null);
  if (marginDebt && rows.find((row) => row.key === "MARGIN_DEBT")?.value === null) {
    rows[rows.findIndex((row) => row.key === "MARGIN_DEBT")] = resolveRow(
      "통화량",
      "마진데트 (시장유동성)",
      "MARGIN_DEBT",
      selectedDate,
      {
        value: marginDebt.value ?? null,
        source: "external",
        error: marginDebt ? undefined : "not available",
        valueDate: null,
        fetchMode: "fallback",
      }
    );
  }

  // 기타 — ISM은 economic-indicators/ism-manufacturing(TradingEconomics) 값 우선 표시
  const tips5y = await fetchFredValue("DFII5", selectedDate);
  const tips10y = await fetchFredValue("DFII10", selectedDate);
  const econIsm = econValue("ISM 제조업");
  rows.push(
    resolveRow("기타", "미국 실업률 - Unemployment Rate", "UNRATE", selectedDate, econValue("실업률 - Unemployment") ?? { value: null, source: "internal", valueDate: null, fetchMode: "internal" }),
    resolveRow("기타", "미국 ISM 제조업 지수 - ISM Manufacturing PMI", "ISM", selectedDate, econIsm ?? { value: null, source: "internal", valueDate: null, fetchMode: "internal" }),
    resolveRow("기타", "소매판매 성장률 - Retail Sales", "RRSFS", selectedDate, econValue("소매판매 성장률") ?? { value: null, source: "internal", valueDate: null, fetchMode: "internal" }),
    resolveRow("기타", "운송 및 물류 지표 급락 - Cass Freight Index", "CASS", selectedDate, econValue("Cass Freight Index") ?? { value: null, source: "internal", valueDate: null, fetchMode: "internal" }),
    resolveRow("기타", "STLFSI4", "STLFSI4", selectedDate, econValue("STLFSI4") ?? { value: null, source: "internal", valueDate: null, fetchMode: "internal" }),
    resolveRow("기타", "TIPS실질금리_5Y", "DFII5", selectedDate, {
      value: tips5y.value,
      source: "external",
      error: tips5y.error || undefined,
      valueDate: tips5y.valueDate,
      fetchMode: "exact",
    }),
    resolveRow("기타", "TIPS실질금리_10Y", "DFII10", selectedDate, {
      value: tips10y.value,
      source: "external",
      error: tips10y.error || undefined,
      valueDate: tips10y.valueDate,
      fetchMode: "exact",
    })
  );
  // ISM: economic-indicators/ism-manufacturing(TradingEconomics) 값이 있으면 표시 (날짜 미표기)
  if (rows[rows.findIndex((r) => r.key === "ISM")]?.status === "na" && econIsm?.value != null) {
    rows[rows.findIndex((r) => r.key === "ISM")] = resolveRowFallback(
      "기타",
      "미국 ISM 제조업 지수 - ISM Manufacturing PMI",
      "ISM",
      selectedDate,
      { value: econIsm.value, valueDate: null, source: "internal", fetchMode: "fallback" }
    );
  }

  // 1~5번 지표: N/A일 때 FRED/Yahoo 근처 값 또는 경제지표 값으로 폴백, valueDate 표기
  const fallbackKeys = rows.filter((r) => r.status === "na" && FALLBACK_ALLOWED_KEYS.has(r.key));
  for (const row of fallbackKeys) {
    const { key, group, label } = row;
    let fallback: { value: number | null; valueDate: string | null; source: "internal" | "external"; fetchMode: FetchMode } | null = null;
    if (key === "EFFR" && effrForFallback.value != null) {
      fallback = { value: effrForFallback.value, valueDate: effrForFallback.valueDate, source: "external", fetchMode: "latest_before" };
    } else if (key === "SOFR") {
      const sofr = await fetchFredValue("SOFR", selectedDate);
      if (sofr.value != null) fallback = { value: sofr.value, valueDate: sofr.valueDate, source: "external", fetchMode: "latest_before" };
    } else if (key === "RRPONTSYD") {
      const rrp = await fetchFredValue("RRPONTSYD", selectedDate);
      if (rrp.value != null) fallback = { value: rrp.value, valueDate: rrp.valueDate, source: "external", fetchMode: "latest_before" };
    } else if (key === "HIGH_YIELD") {
      const hy = await fetchFredValue("BAMLH0A0HYM", selectedDate);
      if (hy.value != null) fallback = { value: hy.value, valueDate: hy.valueDate, source: "external", fetchMode: "latest_before" };
    } else if (key === "VIX") {
      const vix = await fetchYahooLatestBefore("^VIX", selectedDate);
      if (vix.value != null) fallback = { value: vix.value, valueDate: vix.valueDate, source: "external", fetchMode: "latest_before" };
    } else if (key === "FEAR_GREED") {
      const eg = econValue("Fear & Greed");
      if (eg?.value != null) fallback = { value: eg.value, valueDate: null, source: "internal", fetchMode: "fallback" };
    } else if (key === "DOW") {
      const dow = await fetchYahooLatestBefore("^DJI", selectedDate);
      if (dow.value != null) fallback = { value: dow.value, valueDate: dow.valueDate, source: "external", fetchMode: "latest_before" };
    } else if (key === "NASDAQ") {
      const nas = await fetchYahooLatestBefore("^IXIC", selectedDate);
      if (nas.value != null) fallback = { value: nas.value, valueDate: nas.valueDate, source: "external", fetchMode: "latest_before" };
    } else if (key === "SP500") {
      const sp = await fetchYahooLatestBefore("^GSPC", selectedDate);
      if (sp.value != null) fallback = { value: sp.value, valueDate: sp.valueDate, source: "external", fetchMode: "latest_before" };
    } else if (key === "ICSA") {
      const icsa = await fetchFredValue("ICSA", selectedDate);
      if (icsa.value != null) fallback = { value: icsa.value, valueDate: icsa.valueDate, source: "external", fetchMode: "latest_before" };
    } else if (key === "M2") {
      const m2 = await fetchFredValue("M2SL", selectedDate);
      if (m2.value != null) fallback = { value: m2.value, valueDate: m2.valueDate, source: "external", fetchMode: "latest_before" };
    } else if (key === "MARGIN_DEBT" && marginDebt?.value != null) {
      fallback = { value: marginDebt.value, valueDate: null, source: "external", fetchMode: "fallback" };
    } else if (key === "UNRATE") {
      const un = await fetchFredValue("UNRATE", selectedDate);
      if (un.value != null) fallback = { value: un.value, valueDate: un.valueDate, source: "external", fetchMode: "latest_before" };
    } else if (key === "ISM") {
      const ism = await fetchFredValue("NAPM", selectedDate);
      if (ism.value != null) fallback = { value: ism.value, valueDate: ism.valueDate, source: "external", fetchMode: "latest_before" };
    } else if (key === "RRSFS") {
      const rrs = await fetchFredValue("RRSFS", selectedDate);
      if (rrs.value != null) fallback = { value: rrs.value, valueDate: rrs.valueDate, source: "external", fetchMode: "latest_before" };
    } else if (key === "CASS") {
      const cass = econValue("Cass Freight Index");
      if (cass?.value != null) fallback = { value: cass.value, valueDate: null, source: "internal", fetchMode: "fallback" };
    } else if (key === "STLFSI4") {
      const stl = await fetchFredValue("STLFSI4", selectedDate);
      if (stl.value != null) fallback = { value: stl.value, valueDate: stl.valueDate, source: "external", fetchMode: "latest_before" };
    }
    if (fallback?.value != null) {
      const idx = rows.findIndex((r) => r.key === key);
      if (idx >= 0) rows[idx] = resolveRowFallback(group, label, key, selectedDate, fallback);
    }
  }

  res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=3600");
  return res.status(200).json({
    ok: true,
    date: selectedDate,
    selectedDate,
    rows,
    meta: { warnings },
  });
}
