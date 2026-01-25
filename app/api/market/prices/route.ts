import { NextResponse } from "next/server";

import { getMarketPrices } from "@/lib/market/getPrices";

type QuarterSeries = { Q1: number | null; Q2: number | null; Q3: number | null };

export const runtime = "nodejs";

const QUARTER_TIMES = [
  { key: "Q1", time: "00:00:00" },
  { key: "Q2", time: "02:00:00" },
  { key: "Q3", time: "05:30:00" },
] as const;

const QUARTER_CACHE = new Map<string, { ts: number; data: QuarterSeries | null }>();
const QUARTER_TTL_MS = 5 * 60 * 1000;

const getQuarterCacheKey = (symbol: string, date: string) => `${symbol}::${date}`;

const parseMinutes = (time: string) => {
  const [h, m] = time.split(":").map((value) => Number(value));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
};

const pickClosestValue = (
  values: Array<{ datetime: string; close: string }>,
  targetMinutes: number
): number | null => {
  let bestClose: number | null = null;
  let bestDiff = Number.POSITIVE_INFINITY;
  values.forEach((item) => {
    const [, time] = item.datetime.split(" ");
    if (!time) return;
    const minutes = parseMinutes(time);
    if (minutes === null) return;
    const close = Number(item.close);
    if (!Number.isFinite(close)) return;
    const diff = Math.abs(minutes - targetMinutes);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestClose = close;
    }
  });
  return bestClose;
};

const pickFallbackBase = (values: Array<{ datetime: string; close: string }>) => {
  for (let i = values.length - 1; i >= 0; i -= 1) {
    const close = Number(values[i]?.close);
    if (Number.isFinite(close)) return close;
  }
  return null;
};

const parseYmd = (value: string) => {
  const parts = value.split("-").map((chunk) => Number(chunk));
  if (parts.length !== 3) return null;
  const [year, month, day] = parts;
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null;
  }
  return new Date(Date.UTC(year, month - 1, day));
};

const toYmd = (date: Date) => date.toISOString().slice(0, 10);

const addDays = (ymd: string, offset: number) => {
  const parsed = parseYmd(ymd);
  if (!parsed) return null;
  parsed.setUTCDate(parsed.getUTCDate() + offset);
  return toYmd(parsed);
};

const kstToUtcTimestampSeconds = (ymd: string, time: string) => {
  const parts = ymd.split("-").map((chunk) => Number(chunk));
  if (parts.length !== 3) return null;
  const [year, month, day] = parts;
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null;
  }
  const minutes = parseMinutes(time);
  if (minutes === null) return null;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const utcMs = Date.UTC(year, month - 1, day, hours - 9, mins, 0);
  return Math.floor(utcMs / 1000);
};

const toKstYmdFromEpochSeconds = (seconds: number) => {
  const kstMs = seconds * 1000 + 9 * 60 * 60 * 1000;
  return new Date(kstMs).toISOString().slice(0, 10);
};

const pickClosestByMinutes = (
  values: Array<{ minutes: number; close: number }>,
  targetMinutes: number
): number | null => {
  let bestClose: number | null = null;
  let bestDiff = Number.POSITIVE_INFINITY;
  values.forEach((item) => {
    const diff = Math.abs(item.minutes - targetMinutes);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestClose = item.close;
    }
  });
  return bestClose;
};

const pickFirstClose = (values: Array<{ minutes: number; close: number }>) => {
  for (let i = 0; i < values.length; i += 1) {
    const close = values[i]?.close;
    if (Number.isFinite(close)) return close;
  }
  return null;
};

const fetchYahooPrevClose = async (symbol: string, date: string): Promise<number | null> => {
  const startDate = addDays(date, -7);
  const endDate = addDays(date, 1);
  if (!startDate || !endDate) return null;
  const startUtc = kstToUtcTimestampSeconds(startDate, "00:00:00");
  const endUtc = kstToUtcTimestampSeconds(endDate, "00:00:00");
  if (startUtc === null || endUtc === null) return null;

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    symbol
  )}?interval=1d&period1=${startUtc}&period2=${endUtc}&events=div%2Csplit`;
  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; fedreportsh/1.0; +https://fedreportsh.vercel.app)",
        Accept: "application/json",
        "Accept-Language": "en-US,en;q=0.9",
        "Cache-Control": "no-cache",
      },
    });
  } catch {
    return null;
  }
  if (!response.ok) return null;
  let payload: any;
  try {
    payload = await response.json();
  } catch {
    return null;
  }
  const result = payload?.chart?.result?.[0];
  const timestamps = result?.timestamp;
  const closes = result?.indicators?.quote?.[0]?.close;
  if (!Array.isArray(timestamps) || !Array.isArray(closes)) return null;
  const values = timestamps
    .map((ts: number, index: number) => {
      const close = Number(closes[index]);
      if (!Number.isFinite(close)) return null;
      return { date: toKstYmdFromEpochSeconds(ts), close };
    })
    .filter(Boolean) as Array<{ date: string; close: number }>;
  const prev = values.filter((item) => item.date < date).pop();
  return prev?.close ?? null;
};

const fetchYahooQuarterSeries = async (
  symbol: string,
  date: string,
  prevClose: number | null,
  options: { skipCache?: boolean } = {}
): Promise<QuarterSeries | null> => {
  const cacheKey = getQuarterCacheKey(symbol, date);
  const cached = QUARTER_CACHE.get(cacheKey);
  if (!options.skipCache && cached && Date.now() - cached.ts < QUARTER_TTL_MS) {
    return cached.data;
  }

  const startUtc = kstToUtcTimestampSeconds(date, "00:00:00");
  const endUtc = kstToUtcTimestampSeconds(date, "06:00:00");
  if (startUtc === null || endUtc === null) {
    QUARTER_CACHE.set(cacheKey, { ts: Date.now(), data: null });
    return null;
  }

  const interval = "2m";
  const period2 = endUtc + 60;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    symbol
  )}?interval=${interval}&period1=${startUtc}&period2=${period2}&includePrePost=true&events=div%2Csplit`;
  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; fedreportsh/1.0; +https://fedreportsh.vercel.app)",
        Accept: "application/json",
        "Accept-Language": "en-US,en;q=0.9",
        "Cache-Control": "no-cache",
      },
    });
  } catch {
    QUARTER_CACHE.set(cacheKey, { ts: Date.now(), data: null });
    return null;
  }
  if (!response.ok) {
    QUARTER_CACHE.set(cacheKey, { ts: Date.now(), data: null });
    return null;
  }

  let payload: any;
  try {
    payload = await response.json();
  } catch {
    QUARTER_CACHE.set(cacheKey, { ts: Date.now(), data: null });
    return null;
  }
  if (payload?.chart?.error) {
    QUARTER_CACHE.set(cacheKey, { ts: Date.now(), data: null });
    return null;
  }
  const result = payload?.chart?.result?.[0];
  const timestamps = result?.timestamp;
  const closes = result?.indicators?.quote?.[0]?.close;
  if (!Array.isArray(timestamps) || !Array.isArray(closes)) {
    QUARTER_CACHE.set(cacheKey, { ts: Date.now(), data: null });
    return null;
  }

  const values = timestamps
    .map((ts: number, index: number) => {
      const close = Number(closes[index]);
      if (!Number.isFinite(close)) return null;
      const minutes = Math.round((ts - startUtc) / 60);
      return { minutes, close };
    })
    .filter(Boolean) as Array<{ minutes: number; close: number }>;
  if (!values.length) {
    QUARTER_CACHE.set(cacheKey, { ts: Date.now(), data: null });
    return null;
  }

  let baseValue =
    prevClose && Number.isFinite(prevClose) ? prevClose : pickFirstClose(values);
  if (baseValue === null || !Number.isFinite(baseValue) || baseValue === 0) {
    QUARTER_CACHE.set(cacheKey, { ts: Date.now(), data: null });
    return null;
  }
  const base = baseValue;

  const quarterCloses: QuarterSeries = { Q1: null, Q2: null, Q3: null };
  QUARTER_TIMES.forEach(({ key, time }) => {
    const targetMinutes = parseMinutes(time);
    if (targetMinutes === null) return;
    const close = pickClosestByMinutes(values, targetMinutes);
    if (close === null || !Number.isFinite(close)) return;
    quarterCloses[key] = close;
  });

  const resultSeries: QuarterSeries = { Q1: null, Q2: null, Q3: null };
  QUARTER_TIMES.forEach(({ key, time }) => {
    const targetMinutes = parseMinutes(time);
    if (targetMinutes === null) return;
    const close = quarterCloses[key];
    if (close === null || !Number.isFinite(close)) return;
    const pct = ((close - base) / base) * 100;
    resultSeries[key] = Number(pct.toFixed(2));
  });

  if (
    (!prevClose || !Number.isFinite(prevClose)) &&
    resultSeries.Q1 === 0 &&
    quarterCloses.Q1 !== null &&
    (resultSeries.Q2 !== null || resultSeries.Q3 !== null)
  ) {
    const yahooPrevClose = await fetchYahooPrevClose(symbol, date);
    if (Number.isFinite(yahooPrevClose) && yahooPrevClose !== 0) {
      const fallbackBase = Number(yahooPrevClose);
      QUARTER_TIMES.forEach(({ key }) => {
        const close = quarterCloses[key];
        if (close === null || !Number.isFinite(close)) return;
        const pct = ((close - fallbackBase) / fallbackBase) * 100;
        resultSeries[key] = Number(pct.toFixed(2));
      });
    }
  }

  const hasValue = Object.values(resultSeries).some((value) => value !== null);
  if (!hasValue) {
    QUARTER_CACHE.set(cacheKey, { ts: Date.now(), data: null });
    return null;
  }

  QUARTER_CACHE.set(cacheKey, { ts: Date.now(), data: resultSeries });
  return resultSeries;
};

const fetchQuarterSeries = async (
  symbol: string,
  date: string,
  prevClose: number | null,
  apiKey: string
): Promise<QuarterSeries | null> => {
  const cacheKey = getQuarterCacheKey(symbol, date);
  const cached = QUARTER_CACHE.get(cacheKey);
  if (cached && Date.now() - cached.ts < QUARTER_TTL_MS) {
    return cached.data;
  }

  const baseUrl = "https://api.twelvedata.com/time_series";
  const url = `${baseUrl}?symbol=${encodeURIComponent(
    symbol
  )}&interval=1min&start_date=${date} 00:00:00&end_date=${date} 06:00:00&timezone=Asia/Seoul&apikey=${apiKey}`;
  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; fedreportsh/1.0; +https://fedreportsh.vercel.app)",
        Accept: "application/json",
        "Accept-Language": "en-US,en;q=0.9",
        "Cache-Control": "no-cache",
      },
    });
  } catch {
    QUARTER_CACHE.set(cacheKey, { ts: Date.now(), data: null });
    return null;
  }

  const text = await response.text();
  if (!response.ok) {
    QUARTER_CACHE.set(cacheKey, { ts: Date.now(), data: null });
    return null;
  }

  let payload: any;
  try {
    payload = JSON.parse(text);
  } catch {
    QUARTER_CACHE.set(cacheKey, { ts: Date.now(), data: null });
    return null;
  }

  if (!payload?.values || !Array.isArray(payload.values)) {
    QUARTER_CACHE.set(cacheKey, { ts: Date.now(), data: null });
    return null;
  }

  // 기준값: 전일 종가(가능하면) → 없으면 당일 최초 가격
  const baseValue =
    prevClose && Number.isFinite(prevClose) ? prevClose : pickFallbackBase(payload.values);
  if (!baseValue || !Number.isFinite(baseValue)) {
    QUARTER_CACHE.set(cacheKey, { ts: Date.now(), data: null });
    return null;
  }

  const result: QuarterSeries = { Q1: null, Q2: null, Q3: null };
  QUARTER_TIMES.forEach(({ key, time }) => {
    const targetMinutes = parseMinutes(time);
    if (targetMinutes === null) return;
    const close = pickClosestValue(payload.values, targetMinutes);
    if (close === null || !Number.isFinite(close)) return;
    const pct = ((close - baseValue) / baseValue) * 100;
    result[key] = Number(pct.toFixed(2));
  });

  QUARTER_CACHE.set(cacheKey, { ts: Date.now(), data: result });
  return result;
};

export const GET = async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const symbolsRaw = searchParams.get("symbols") || searchParams.get("keys") || "";
  const date = searchParams.get("date") || undefined;
  const debugEnabled = searchParams.get("debug") === "1";
  const quartersEnabled = searchParams.get("quarters") === "1";
  const keys = symbolsRaw
    ? symbolsRaw
        .split(",")
        .map((key) => key.trim())
        .filter(Boolean)
    : [];

  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ ok: false, error: "invalid_date" }, { status: 400 });
  }

  try {
    const snapshot = await getMarketPrices(keys, date, { debug: debugEnabled });
    const warnings = [...snapshot.warnings];
    const fxItem = snapshot.items.find((item) => item.key === "USDKRW");
    const pricesItems = snapshot.items.filter((item) => item.key !== "USDKRW");
    const sourcesUsed = Array.from(
      new Set(snapshot.items.map((item) => item.source).filter(Boolean))
    );
    const today = new Date().toISOString().slice(0, 10);
    const quarterDate = date || today;
    const apiKey = process.env.TWELVEDATA_API_KEY || process.env.PROVIDERX_API_KEY;
    const quarterMap = new Map<string, QuarterSeries | null>();
    let yahooFallbackUsed = false;

    if (quartersEnabled && !apiKey) {
      warnings.push("TWELVEDATA_API_KEY 미설정: Yahoo fallback을 사용합니다.");
    }

    if (quartersEnabled) {
      const queue = [...pricesItems];
      const concurrency = 3;
      const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
        while (queue.length) {
          const item = queue.shift();
          if (!item || !item.ok) continue;
          const usePrevClose = !date || date === today;
          const prevClose = usePrevClose ? item.prevClose ?? null : null;
          const symbol =
            item.key === "DXY"
              ? "UUP"
              : item.key === "VIX"
              ? "VIXY"
              : item.key === "NQ"
              ? apiKey
                ? "NQ"
                : "NQ=F"
              : item.key;
          if (apiKey) {
            const quarters = await fetchQuarterSeries(symbol, quarterDate, prevClose, apiKey);
            if (quarters) {
              quarterMap.set(item.key, quarters);
              continue;
            }
            const fallback = await fetchYahooQuarterSeries(symbol, quarterDate, prevClose, {
              skipCache: true,
            });
            if (fallback) {
              yahooFallbackUsed = true;
              quarterMap.set(item.key, fallback);
            }
            continue;
          }
          const quarters = await fetchYahooQuarterSeries(symbol, quarterDate, prevClose);
          if (quarters) {
            quarterMap.set(item.key, quarters);
          }
        }
      });
      await Promise.all(workers);
    }

    if (yahooFallbackUsed) {
      warnings.push("TwelveData 실패로 Yahoo fallback을 사용했습니다.");
    }

    return NextResponse.json(
      {
        ok: true,
        asOf: new Date().toISOString(),
        prices: Object.fromEntries(
          pricesItems.map((item) => [
            item.key,
            item.ok
              ? {
                  ok: true,
                  price: item.price,
                  prevClose: item.prevClose ?? null,
                  changePct: item.change1dPct ?? null,
                  quarters: quarterMap.get(item.key) ?? undefined,
                  source: item.source,
                  ts: item.asOf,
                  usedLastGood: item.usedLastGood ?? false,
                }
              : { ok: false, error: item.error, source: item.source },
          ])
        ),
        fx: fxItem
          ? {
              USDKRW: fxItem.ok
                ? {
                    ok: true,
                    rate: fxItem.price,
                    source: fxItem.source,
                    ts: fxItem.asOf,
                    usedLastGood: fxItem.usedLastGood ?? false,
                  }
                : { ok: false, error: fxItem.error, source: fxItem.source },
            }
          : {},
        meta: {
          warnings,
          sourcesUsed,
          cache: snapshot.cache,
        },
        ...(debugEnabled
          ? {
              debug: {
                runtime: "nodejs",
                region: process.env.VERCEL_REGION || "local",
                fetches: snapshot.debug?.fetches || [],
              },
            }
          : {}),
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600",
        },
      }
    );
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        error: error?.message || "prices failed",
        prices: {},
        fx: {},
        meta: { warnings: [], sourcesUsed: [], cache: "MISS" },
        ...(debugEnabled
          ? {
              debug: {
                runtime: "edge",
                region: process.env.VERCEL_REGION || "local",
                fetches: [],
              },
            }
          : {}),
      },
      { status: 500 }
    );
  }
};
