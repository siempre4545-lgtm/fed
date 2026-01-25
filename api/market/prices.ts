import { getMarketPrices } from "../../lib/market/getPrices.js";

type QuarterSeries = { Q1: number | null; Q2: number | null; Q3: number | null };

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

export default async function handler(req: any, res: any) {
  const symbolsRaw = String(req.query.symbols || req.query.keys || "");
  const date = typeof req.query.date === "string" ? req.query.date : undefined;
  const debugEnabled = String(req.query.debug || "") === "1";
  const quartersEnabled = String(req.query.quarters || "") === "1";
  const keys = symbolsRaw
    ? symbolsRaw
        .split(",")
        .map((key) => key.trim())
        .filter(Boolean)
    : [];

  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    res.status(400).json({ ok: false, error: "invalid_date" });
    return;
  }

  try {
    const snapshot = await getMarketPrices(keys, date, { debug: debugEnabled });
    const fxItem = snapshot.items.find((item) => item.key === "USDKRW");
    const pricesItems = snapshot.items.filter((item) => item.key !== "USDKRW");
    const sourcesUsed = Array.from(
      new Set(snapshot.items.map((item) => item.source).filter(Boolean))
    );
    const today = new Date().toISOString().slice(0, 10);
    const quarterDate = date || today;
    const apiKey = process.env.TWELVEDATA_API_KEY || process.env.PROVIDERX_API_KEY;
    const quarterMap = new Map<string, QuarterSeries | null>();

    if (quartersEnabled && apiKey) {
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
              ? "NQ"
              : item.key;
          const quarters = await fetchQuarterSeries(symbol, quarterDate, prevClose, apiKey);
          if (quarters) {
            quarterMap.set(item.key, quarters);
          }
        }
      });
      await Promise.all(workers);
    }

    res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=3600");
    res.json({
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
        warnings: snapshot.warnings,
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
    });
  } catch (error: any) {
    res.status(500).json({
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
    });
  }
}
