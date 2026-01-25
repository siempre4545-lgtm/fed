import { NextResponse } from "next/server";

import { getMarketPrices } from "@/lib/market/getPrices";
import { coerceToThursday } from "@/lib/macro-trace/date";
import { fetchAllEconomicIndicators } from "@/src/economic-indicators";
import { fetchAllSecretIndicators } from "@/src/secret-indicators";
import { fetchH41CalendarDates, ymdToIso, yyyymmddFromISO } from "@/src/h41-calendar";
import { calculateDeltas, fetchH41ArchivesBatch } from "@/src/h41-archive";

type TraceRow = {
  group: string;
  label: string;
  key: string;
  value: number | null;
  delta: { type: "wow" | "custom"; value: number; pct: number | null } | null;
  unit: string | null;
  source: { kind: "internal" | "external"; name: string; detail?: string };
  status: "ok" | "na" | "error";
  error?: string;
};

type TraceResponse = {
  ok: boolean;
  date: string;
  rows: TraceRow[];
  meta: { warnings: string[] };
};

export const runtime = "nodejs";

const TABLE_CACHE = new Map<string, { ts: number; data: TraceResponse }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const withTimeout = async <T>(task: () => Promise<T>, timeoutMs: number) => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    task().finally(() => {
      if (timer) clearTimeout(timer);
    }),
    new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(new Error("timeout")), timeoutMs);
    }),
  ]);
};

const withRetry = async <T>(
  task: () => Promise<T>,
  attempts: number,
  delayMs: number
): Promise<T> => {
  let lastError: unknown;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      if (i < attempts - 1) {
        await sleep(delayMs * (i + 1));
      }
    }
  }
  throw lastError;
};

const fetchYahooQuotes = async (symbols: string[]) => {
  if (!symbols.length) return {};
  const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(
    symbols.join(",")
  )}`;
  const response = await withRetry(
    () =>
      withTimeout(
        () =>
          fetch(url, {
            headers: { "User-Agent": "fedreportsh/1.0" },
            cache: "no-store",
          }),
        6000
      ),
    2,
    300
  );
  if (!response.ok) {
    throw new Error(`yahoo ${response.status}`);
  }
  const json = await response.json();
  const results = Array.isArray(json?.quoteResponse?.result) ? json.quoteResponse.result : [];
  const map: Record<string, number | null> = {};
  results.forEach((item: any) => {
    const symbol = String(item?.symbol || "");
    const value = Number(item?.regularMarketPrice);
    map[symbol] = Number.isFinite(value) ? value : null;
  });
  return map;
};

const fetchFredHistory = async (seriesId: string, targetDate: string) => {
  const apiKey = process.env.FRED_API_KEY || process.env.FREDAPIKEY2 || "demo";
  const start = new Date(`${targetDate}T00:00:00`);
  start.setDate(start.getDate() - 120);
  const startYmd = start.toISOString().slice(0, 10);
  const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${apiKey}&file_type=json&observation_start=${startYmd}&observation_end=${targetDate}&sort_order=desc&limit=10`;

  const response = await withRetry(
    () =>
      withTimeout(
        () =>
          fetch(url, {
            headers: { "User-Agent": "fedreportsh/1.0" },
            cache: "no-store",
          }),
        6000
      ),
    2,
    300
  );
  if (!response.ok) throw new Error(`fred ${response.status}`);
  const json = await response.json();
  const observations: Array<{ date: string; value: string }> = json.observations || [];
  const filtered = observations.filter((item) => item.value !== ".");
  if (!filtered.length) return null;
  const latest = filtered[0];
  const previous = filtered[1];
  const value = Number(latest.value);
  const prevValue = previous ? Number(previous.value) : null;
  return Number.isFinite(value)
    ? { value, prevValue, date: latest.date }
    : null;
};

const pickIndicatorValue = (
  indicators: ReturnType<typeof fetchAllEconomicIndicators> extends Promise<infer T>
    ? T
    : never,
  id: string
) => indicators.find((item) => item.id === id) || null;

const toRow = (base: Omit<TraceRow, "status" | "error">): TraceRow => {
  if (base.value === null || Number.isNaN(base.value)) {
    return {
      ...base,
      status: "na",
      value: null,
      delta: null,
      error: "N/A",
    };
  }
  return { ...base, status: "ok" };
};

const toErrorRow = (
  base: Omit<TraceRow, "status" | "error" | "value" | "delta">,
  error: string
): TraceRow => ({
  ...base,
  value: null,
  delta: null,
  status: "error",
  error,
});

export const GET = async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const dateParam = searchParams.get("date") || "";
  const date = coerceToThursday(dateParam);
  const cacheKey = date;
  const cached = TABLE_CACHE.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return NextResponse.json(cached.data, {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600",
      },
    });
  }

  const warnings: string[] = [];

  const [economicIndicators, secretIndicators, marketSnapshot] = await Promise.all([
    fetchAllEconomicIndicators().catch(() => []),
    fetchAllSecretIndicators().catch(() => []),
    getMarketPrices(["USDKRW", "MARGIN_DEBT", "DXY"]).catch(() => ({
      items: [],
      warnings: [],
      cache: "MISS",
    })),
  ]);

  const econMap = new Map(economicIndicators.map((item) => [item.id, item]));
  const secretMap = new Map(secretIndicators.map((item) => [item.id, item]));
  const marketMap = new Map(marketSnapshot.items.map((item) => [item.key, item]));

  let h41Row: Awaited<ReturnType<typeof fetchH41ArchivesBatch>>[number] | null = null;
  try {
    const ymds = await fetchH41CalendarDates();
    const sorted = [...ymds].sort((a, b) => b.localeCompare(a));
    const targetYmd = yyyymmddFromISO(date);
    const targetIndex =
      sorted.findIndex((ymd) => ymd <= targetYmd) >= 0
        ? sorted.findIndex((ymd) => ymd <= targetYmd)
        : 0;
    const target = sorted[targetIndex] || sorted[0];
    const previous = sorted[targetIndex + 1];
    const rows = await fetchH41ArchivesBatch([target, ...(previous ? [previous] : [])]);
    rows.sort((a, b) => (a.date < b.date ? 1 : -1));
    calculateDeltas(rows);
    h41Row = rows[0] || null;
  } catch (error) {
    warnings.push("H.4.1 데이터를 불러오지 못했습니다.");
  }

  const fredValue = async (seriesId: string) => {
    try {
      return await fetchFredHistory(seriesId, date);
    } catch (error) {
      warnings.push(`${seriesId} FRED 실패`);
      return null;
    }
  };

  const fredSeries = ["DGS3", "DGS2", "DGS10", "SOFR", "RRPONTSYD", "DFF", "DFII5", "DFII10"];
  const fredValues = await Promise.all(fredSeries.map((seriesId) => fredValue(seriesId)));
  const fredMap = new Map(fredSeries.map((seriesId, index) => [seriesId, fredValues[index]]));

  const yahooQuotes = await fetchYahooQuotes(["^KS11", "^N225", "JPY=X"]);
  const kospiValue = yahooQuotes["^KS11"] ?? null;
  const nikkeiValue = yahooQuotes["^N225"] ?? null;
  const usdJpyValue = yahooQuotes["JPY=X"] ?? null;

  const usdkrw = marketMap.get("USDKRW");
  const usdkrwValue = usdkrw && usdkrw.ok ? usdkrw.price : null;
  const krwJpyValue =
    usdkrwValue && usdJpyValue ? Number((usdkrwValue / usdJpyValue).toFixed(4)) : null;

  const rows: TraceRow[] = [];

  const pushRow = (row: TraceRow) => rows.push(row);

  const econ = (id: string) => econMap.get(id) || null;

  const econRow = (group: string, label: string, id: string): TraceRow => {
    const item = econ(id);
    if (!item || item.value === null || item.value === undefined) {
      return toErrorRow(
        {
          group,
          label,
          key: id.toUpperCase(),
          unit: null,
          source: { kind: "internal", name: "economic-indicators" },
        },
        "internal missing"
      );
    }
    const delta =
      item.change !== null && item.change !== undefined
        ? {
            type: "wow" as const,
            value: item.change,
            pct: item.changePercent ?? null,
          }
        : null;
    return toRow({
      group,
      label,
      key: id.toUpperCase(),
      value: item.value,
      delta,
      unit: item.unit || null,
      source: { kind: "internal", name: "economic-indicators", detail: item.source },
    });
  };

  const fredRow = (group: string, label: string, key: string, seriesId: string, unit: string) => {
    const data = fredMap.get(seriesId) || null;
    if (!data) {
      return toErrorRow(
        { group, label, key, unit, source: { kind: "external", name: "fred", detail: seriesId } },
        "fred missing"
      );
    }
    const delta =
      data.prevValue !== null
        ? {
            type: "wow" as const,
            value: Number((data.value - data.prevValue).toFixed(2)),
            pct: data.prevValue ? Number((((data.value - data.prevValue) / data.prevValue) * 100).toFixed(2)) : null,
          }
        : null;
    return toRow({
      group,
      label,
      key,
      value: data.value,
      delta,
      unit,
      source: { kind: "external", name: "fred", detail: seriesId },
    });
  };

  const h41RowValue = (
    group: string,
    label: string,
    key: string,
    field: "treasury" | "mbs" | "repo" | "loans" | "currency" | "rrp" | "tga" | "reserves"
  ): TraceRow => {
    if (!h41Row) {
      return toErrorRow(
        { group, label, key, unit: "m_usd", source: { kind: "internal", name: "h41" } },
        "h41 missing"
      );
    }
    const value = h41Row[field].value;
    const deltaValue = h41Row[field].delta;
    return toRow({
      group,
      label,
      key,
      value,
      delta:
        deltaValue !== null && deltaValue !== undefined
          ? { type: "wow", value: deltaValue, pct: null }
          : null,
      unit: "m_usd",
      source: { kind: "internal", name: "h41" },
    });
  };

  const econDxy = econ("dxy");
  const marketDxy = marketMap.get("DXY");
  const marketDxyChange =
    marketDxy && marketDxy.ok && typeof marketDxy.change1dPct === "number"
      ? marketDxy.change1dPct
      : null;
  pushRow(
    toRow({
      group: "글로벌",
      label: "(D)DXY 달러지수",
      key: "DXY",
      value: econDxy?.value ?? (marketDxy && marketDxy.ok ? marketDxy.price : null),
      delta: econDxy?.change
        ? { type: "wow", value: econDxy.change, pct: econDxy.changePercent ?? null }
        : marketDxyChange !== null
        ? { type: "wow", value: marketDxyChange, pct: null }
        : null,
      unit: econDxy?.unit ?? "index",
      source: econDxy
        ? { kind: "internal", name: "economic-indicators", detail: econDxy.source }
        : { kind: "internal", name: "market-prices", detail: marketDxy?.source },
    })
  );

  pushRow(
    toRow({
      group: "글로벌",
      label: "원/엔",
      key: "KRWJPY",
      value: krwJpyValue,
      delta: null,
      unit: "fx",
      source: { kind: "external", name: "yahoo", detail: "JPY=X" },
    })
  );

  pushRow(
    toRow({
      group: "글로벌",
      label: "달러환율 (USDKRW)",
      key: "USDKRW",
      value: usdkrw && usdkrw.ok ? usdkrw.price : null,
      delta: null,
      unit: "fx",
      source: { kind: "internal", name: "market-prices", detail: usdkrw?.source },
    })
  );

  pushRow(fredRow("금리", "미국국채 3Y", "DGS3", "DGS3", "%"));
  pushRow(fredRow("금리", "미국국채 2Y", "DGS2", "DGS2", "%"));
  pushRow(fredRow("금리", "미국국채 10Y", "DGS10", "DGS10", "%"));

  const tenY = fredMap.get("DGS10") || null;
  const twoY = fredMap.get("DGS2") || null;
  if (tenY && twoY) {
    const spread = tenY.value - twoY.value;
    pushRow(
      toRow({
        group: "금리",
        label: "장단기금리차(10Y-2Y)",
        key: "SPREAD_10Y2Y",
        value: Number(spread.toFixed(2)),
        delta: null,
        unit: "bp",
        source: { kind: "external", name: "fred", detail: "DGS10-DGS2" },
      })
    );
  } else {
    pushRow(
      toErrorRow(
        { group: "금리", label: "장단기금리차(10Y-2Y)", key: "SPREAD_10Y2Y", unit: "bp", source: { kind: "external", name: "fred" } },
        "fred missing"
      )
    );
  }

  pushRow(fredRow("시장금리", "USD SOFR", "SOFR", "SOFR", "%"));
  pushRow(fredRow("시장금리", "ON RRP", "RRPONTSYD", "RRPONTSYD", "b_usd"));
  pushRow(fredRow("시장금리", "EFFR", "DFF", "DFF", "%"));

  const bankCds = econ("korea-bank-cds") ?? econ("high-yield-spread");
  pushRow(
    bankCds
      ? toRow({
          group: "심리",
          label: "은행 CDS 프리미엄/금융기관 채권금리 동향",
          key: "BANK_CDS",
          value: bankCds.value ?? null,
          delta:
            bankCds.change !== null && bankCds.change !== undefined
              ? { type: "wow", value: bankCds.change, pct: bankCds.changePercent ?? null }
              : null,
          unit: bankCds.unit ?? null,
          source: { kind: "internal", name: "economic-indicators", detail: bankCds.source },
        })
      : toErrorRow(
          {
            group: "심리",
            label: "은행 CDS 프리미엄/금융기관 채권금리 동향",
            key: "BANK_CDS",
            unit: null,
            source: { kind: "internal", name: "economic-indicators" },
          },
          "internal missing"
        )
  );

  pushRow(econRow("심리", "VIX", "vix"));
  pushRow(econRow("심리", "Fear & Greed Index", "fear-greed-index"));

  pushRow(
    toRow({
      group: "시장",
      label: "코스피",
      key: "KOSPI",
      value: kospiValue ?? null,
      delta: null,
      unit: "index",
      source: { kind: "external", name: "yahoo", detail: "^KS11" },
    })
  );
  pushRow(
    toRow({
      group: "시장",
      label: "닛케이",
      key: "NIKKEI",
      value: nikkeiValue ?? null,
      delta: null,
      unit: "index",
      source: { kind: "external", name: "yahoo", detail: "^N225" },
    })
  );

  pushRow(econRow("시장", "다우", "dow"));
  pushRow(econRow("시장", "나스닥", "nasdaq"));
  pushRow(econRow("시장", "S&P500", "sp500"));
  pushRow(econRow("시장", "실업수당 청구건수(미국 주요)", "initial-jobless-claims"));

  pushRow(h41RowValue("연준(자산)", "국채(U.S. Treasury securities)", "H41_TREASURY", "treasury"));
  pushRow(h41RowValue("연준(자산)", "MBS(Mortgage-backed securities)", "H41_MBS", "mbs"));
  pushRow(h41RowValue("연준(자산)", "레포(Repurchase agreements)", "H41_REPO", "repo"));
  pushRow(h41RowValue("연준(자산)", "대출(Loans)", "H41_LOANS", "loans"));

  pushRow(h41RowValue("연준(부채)", "시중통화량(Currency in circulation)", "H41_CURRENCY", "currency"));
  pushRow(h41RowValue("연준(부채)", "역레포(Reverse repurchase agreements)", "H41_RRP", "rrp"));
  pushRow(h41RowValue("연준(부채)", "TGA(U.S. Treasury, General Account)", "H41_TGA", "tga"));
  pushRow(h41RowValue("연준(부채)", "지급준비금(Reserve balances with FRBs)", "H41_RESERVES", "reserves"));

  pushRow(econRow("통화량", "M2", "m2"));
  const margin = marketMap.get("MARGIN_DEBT");
  pushRow(
    toRow({
      group: "통화량",
      label: "마진데트",
      key: "MARGIN_DEBT",
      value: margin && margin.ok ? margin.price : null,
      delta: null,
      unit: "m_usd",
      source: { kind: "internal", name: "finra" },
    })
  );

  pushRow(econRow("기타", "미국 실업률", "unemployment-rate"));
  pushRow(econRow("기타", "ISM 제조업", "ism-manufacturing"));
  pushRow(econRow("기타", "리테일세일", "retail-sales"));
  pushRow(econRow("기타", "Cass Freight Index", "cass-freight-index"));
  pushRow(econRow("기타", "STLFSI4", "stlfsi4"));
  pushRow(fredRow("기타", "TIPS 실질금리 5Y", "DFII5", "DFII5", "%"));
  pushRow(fredRow("기타", "TIPS 실질금리 10Y", "DFII10", "DFII10", "%"));

  const response: TraceResponse = { ok: true, date, rows, meta: { warnings } };
  TABLE_CACHE.set(cacheKey, { ts: Date.now(), data: response });

  return NextResponse.json(response, {
    headers: {
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600",
    },
  });
};
