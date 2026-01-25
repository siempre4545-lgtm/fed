import { DEFAULT_EXTERNAL_ASSETS, MacroAssetKey, normalizeStooqSymbol } from "./symbols.js";
import { fetchStooqQuote } from "./sources/stooq.js";
import { fetchUsdKrw } from "./sources/fx.js";
import { fetchFedreportshIndicators } from "../sources/fedreportsh.js";
import { fetchFinraMarginDebt } from "../sources/finra-margin-debt.js";
import { getMarketProvider } from "./providers/index.js";

type MarketKey = MacroAssetKey | string;

export type PriceResult =
  | {
      ok: true;
      key: MarketKey;
      symbol: string;
      asOf: string;
      price: number;
      prevClose?: number | null;
      change1dPct?: number | null;
      source: string;
      usedLastGood?: boolean;
    }
  | {
      ok: false;
      key: MarketKey;
      symbol: string;
      error: string;
      source: string;
    };

type CacheEntry = {
  ts: number;
  data: { items: PriceResult[]; warnings: string[]; cache: "HIT" | "MISS" };
};

const PRIMARY_CACHE = new Map<string, CacheEntry>();
const LAST_GOOD = new Map<string, { ts: number; item: Extract<PriceResult, { ok: true }> }>();
const CACHE_TTL_MS = 5 * 60 * 1000;
const LAST_GOOD_TTL_MS = 48 * 60 * 60 * 1000;

type FetchDebugEntry = {
  source: string;
  key?: string;
  url: string;
  status?: number;
  elapsedMs: number;
  bodyHead?: string;
  ok: boolean;
  error?: string;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const withTimeout = async <T>(
  task: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number
): Promise<T> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await task(controller.signal);
  } finally {
    clearTimeout(timeout);
  }
};

const fetchStooqWithRetry = async (
  symbol: string,
  options: { key?: string; onFetch?: (entry: FetchDebugEntry) => void } = {}
) => {
  const attempts = [0, 300, 900];
  let lastError: string | null = null;
  for (let index = 0; index < attempts.length; index += 1) {
    const delay = attempts[index];
    if (delay) await sleep(delay);
    try {
      const quote = await withTimeout(
        (signal) =>
          fetchStooqQuote(symbol, {
            signal,
            log: index === 0 || index === attempts.length - 1,
            key: options.key,
            onFetch: options.onFetch,
          }),
        6000
      );
      return { ok: true as const, quote };
    } catch (error: any) {
      lastError = error?.message || "stooq failed";
    }
  }
  return { ok: false as const, error: lastError || "stooq failed" };
};

const YAHOO_OTC_SYMBOLS: Record<string, string> = {
  HESAY: "HESAY",
  PPRUY: "PPRUY",
};

const parseYahooChart = (payload: any) => {
  const result = payload?.chart?.result?.[0];
  const timestamps = result?.timestamp;
  const quote = result?.indicators?.quote?.[0];
  const meta = result?.meta;
  const closes = Array.isArray(quote?.close) ? quote.close.filter((v: any) => v !== null) : [];
  if (closes.length >= 2) {
    return {
      price: Number(closes[closes.length - 1]),
      prevClose: Number(closes[closes.length - 2]),
      asOf: meta?.regularMarketTime
        ? new Date(meta.regularMarketTime * 1000).toISOString()
        : new Date().toISOString(),
    };
  }
  if (meta?.regularMarketPrice !== null && meta?.regularMarketPrice !== undefined) {
    const price = Number(meta.regularMarketPrice);
    const prevClose = Number(meta.previousClose);
    return {
      price: Number.isFinite(price) ? price : null,
      prevClose: Number.isFinite(prevClose) ? prevClose : null,
      asOf: meta?.regularMarketTime
        ? new Date(meta.regularMarketTime * 1000).toISOString()
        : new Date().toISOString(),
    };
  }
  return null;
};

const fetchYahooQuoteWithRetry = async (
  symbol: string,
  options: { key?: string; onFetch?: (entry: FetchDebugEntry) => void } = {}
) => {
  const attempts = [0, 400];
  let lastError: string | null = null;
  for (let index = 0; index < attempts.length; index += 1) {
    const delay = attempts[index];
    if (delay) await sleep(delay);
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
      symbol
    )}?interval=1d&range=5d`;
    const started = Date.now();
    try {
      const response = await withTimeout(
        (signal) =>
          fetch(url, {
            headers: {
              "User-Agent":
                "Mozilla/5.0 (compatible; fedreportsh/1.0; +https://fedreportsh.vercel.app)",
              Accept: "application/json",
              "Accept-Language": "en-US,en;q=0.9",
              "Cache-Control": "no-cache",
            },
            signal,
          }),
        6000
      );
      const elapsedMs = Date.now() - started;
      if (!response.ok) {
        lastError = `yahoo status ${response.status}`;
        options.onFetch?.({
          source: "yahoo",
          key: options.key,
          url,
          status: response.status,
          elapsedMs,
          ok: false,
          error: lastError,
        });
        continue;
      }
      const payload = await response.json();
      const parsed = parseYahooChart(payload);
      if (!parsed || !Number.isFinite(parsed.price)) {
        lastError = "yahoo price missing";
        options.onFetch?.({
          source: "yahoo",
          key: options.key,
          url,
          status: response.status,
          elapsedMs,
          ok: false,
          error: lastError,
        });
        continue;
      }
      options.onFetch?.({
        source: "yahoo",
        key: options.key,
        url,
        status: response.status,
        elapsedMs,
        ok: true,
      });
      return { ok: true as const, quote: parsed };
    } catch (error: any) {
      lastError = error?.message || "yahoo fetch failed";
    }
  }
  return { ok: false as const, error: lastError || "yahoo failed" };
};

const fetchFxWithRetry = async (options: { onFetch?: (entry: FetchDebugEntry) => void } = {}) => {
  const attempts = [0, 300, 900];
  let lastError: string | null = null;
  for (let index = 0; index < attempts.length; index += 1) {
    const delay = attempts[index];
    if (delay) await sleep(delay);
    try {
      const fx = await withTimeout(
        (signal) =>
          fetchUsdKrw({
            signal,
            log: index === 0 || index === attempts.length - 1,
            key: "USDKRW",
            onFetch: options.onFetch,
          }),
        6000
      );
      return { ok: true as const, fx };
    } catch (error: any) {
      lastError = error?.message || "fx failed";
    }
  }
  return { ok: false as const, error: lastError || "fx failed" };
};

const fetchFinraWithRetry = async (
  options: { onFetch?: (entry: FetchDebugEntry) => void } = {}
) => {
  const attempts = [0, 300, 900];
  let lastError: string | null = null;
  for (let index = 0; index < attempts.length; index += 1) {
    const delay = attempts[index];
    if (delay) await sleep(delay);
    try {
      const result = await withTimeout(
        (signal) =>
          fetchFinraMarginDebt({
            signal,
            log: index === 0 || index === attempts.length - 1,
            key: "MARGIN_DEBT",
            onFetch: options.onFetch,
          }),
        6000
      );
      if (result && result.value !== null) {
        return { ok: true as const, result };
      }
      lastError = result?.warning || "finra missing";
    } catch (error: any) {
      lastError = error?.message || "finra failed";
    }
  }
  return { ok: false as const, error: lastError || "finra failed" };
};

const getCacheKey = (symbols: string[], date?: string) =>
  `${(date || "latest").trim()}::${symbols.map((s) => s.trim()).sort().join(",")}`;

type InternalMap = Record<
  string,
  { symbol: string; value: number | null; changePercent?: number | null; lastUpdated: string }
>;

type RequestedAsset = {
  key: string;
  label: string;
  ticker?: string;
  kind: "stock" | "etf" | "fx" | "internal";
  proxyFor?: string;
};

export const getMarketPrices = async (
  keys?: string[],
  date?: string,
  options: { debug?: boolean } = {}
): Promise<{
  items: PriceResult[];
  warnings: string[];
  cache: "HIT" | "MISS";
  debug?: { fetches: FetchDebugEntry[] };
}> => {
  const requested: RequestedAsset[] = keys?.length
    ? (() => {
        const defaultMap = new Map<string, RequestedAsset>(
          DEFAULT_EXTERNAL_ASSETS.map((asset) => [asset.key, asset])
        );
        const selected: RequestedAsset[] = [];
        const extras: RequestedAsset[] = [];
        keys.forEach((key) => {
          const asset = defaultMap.get(key);
          if (asset) {
            selected.push(asset);
          } else {
            extras.push({
              key,
              label: key,
              ticker: key,
              kind: "stock",
            });
          }
        });
        return [...selected, ...extras];
      })()
    : DEFAULT_EXTERNAL_ASSETS;
  const cacheKey = getCacheKey(requested.map((asset) => asset.key), date);
  const cached = PRIMARY_CACHE.get(cacheKey);
  const now = Date.now();
  if (!options.debug && cached && now - cached.ts < CACHE_TTL_MS) {
    return { ...cached.data, cache: "HIT" };
  }

  const items: PriceResult[] = [];
  const warnings: string[] = [];
  const debugEntries: FetchDebugEntry[] = [];
  const recordFetch = (entry: FetchDebugEntry) => {
    if (options.debug) {
      debugEntries.push(entry);
    }
  };
  const provider = getMarketProvider();
  const internalIndicators: InternalMap = await fetchFedreportshIndicators().catch(
    () => ({} as InternalMap)
  );
  const finraResult = await fetchFinraWithRetry({ onFetch: recordFetch });
  const marginDebt = finraResult.ok ? finraResult.result : null;

  const stooqKeyBySymbol = new Map<string, string>();
  const stooqTargets = requested
    .filter((item) => item.kind === "stock" || item.kind === "etf")
    .map((item) => {
      const normalized = normalizeStooqSymbol(item.ticker || item.key);
      if (!stooqKeyBySymbol.has(normalized)) {
        stooqKeyBySymbol.set(normalized, item.key);
      }
      return normalized;
    });

  const stooqResults: Record<string, Awaited<ReturnType<typeof fetchStooqWithRetry>>> = {};
  const queue = [...stooqTargets];
  const workers = Array.from({ length: Math.min(3, stooqTargets.length) }, async () => {
    while (queue.length) {
      const symbol = queue.shift();
      if (!symbol) return;
      stooqResults[symbol] = await fetchStooqWithRetry(symbol, {
        onFetch: recordFetch,
        key: stooqKeyBySymbol.get(symbol),
      });
    }
  });
  await Promise.all(workers);

  const resolveLastGood = (key: string, fallback: PriceResult): PriceResult => {
    const cached = LAST_GOOD.get(key);
    if (cached && now - cached.ts < LAST_GOOD_TTL_MS) {
      return {
        ...cached.item,
        source: `${cached.item.source} (cached_last)`,
        usedLastGood: true,
      };
    }
    return fallback;
  };

  for (const asset of requested) {
    if (asset.key === "DXY") {
      const internal = internalIndicators["DXY"];
      if (internal && typeof internal.value === "number") {
        const item: PriceResult = {
          ok: true,
          key: asset.key,
          symbol: internal.symbol,
          asOf: internal.lastUpdated,
          price: internal.value,
          change1dPct: internal.changePercent ?? null,
          source: "internal",
        };
        items.push(item);
        LAST_GOOD.set(asset.key, { ts: now, item });
        continue;
      }
    }

    if (asset.kind === "internal") {
      if (asset.key === "MARGIN_DEBT") {
        if (marginDebt && marginDebt.value) {
          const item: PriceResult = {
            ok: true,
            key: asset.key,
            symbol: asset.label,
            asOf: marginDebt.asOf,
            price: marginDebt.value,
            source: "finra",
          };
          items.push(item);
          LAST_GOOD.set(asset.key, { ts: now, item });
        } else {
          const error = marginDebt?.warning || "margin debt missing";
          const item = resolveLastGood(asset.key, {
            ok: false,
            key: asset.key,
            symbol: asset.label,
            error,
            source: "finra",
          });
          if (!item.ok) warnings.push(`${asset.label} ${error}`);
          items.push(item);
        }
        continue;
      }
      const indicatorSymbol = asset.key === "M2" ? "M2SL" : asset.key;
      const internal = internalIndicators[indicatorSymbol];
      if (internal && typeof internal.value === "number") {
        const item: PriceResult = {
          ok: true,
          key: asset.key,
          symbol: internal.symbol,
          asOf: internal.lastUpdated,
          price: internal.value,
          change1dPct: internal.changePercent ?? null,
          source: "internal",
        };
        items.push(item);
        LAST_GOOD.set(asset.key, { ts: now, item });
      } else {
        const item = resolveLastGood(asset.key, {
          ok: false,
          key: asset.key,
          symbol: indicatorSymbol,
          error: "internal missing",
          source: "internal",
        });
        if (!item.ok) warnings.push(`${asset.label} 내부 데이터 없음`);
        items.push(item);
      }
      continue;
    }

    if (asset.kind === "fx") {
      try {
        const fxResult = await fetchFxWithRetry({ onFetch: recordFetch });
        if (!fxResult.ok && provider?.getFx) {
          const providerFx = await provider.getFx("USDKRW", {
            log: true,
            key: asset.key,
            onFetch: recordFetch,
          });
          if (providerFx.ok) {
            const item: PriceResult = {
              ok: true,
              key: asset.key,
              symbol: "USDKRW",
              asOf: providerFx.ts,
              price: providerFx.rate,
              source: provider.name,
            };
            items.push(item);
            LAST_GOOD.set(asset.key, { ts: now, item });
            continue;
          }
          throw new Error(providerFx.error);
        }
        if (!fxResult.ok) throw new Error(fxResult.error);
        const fx = fxResult.fx;
        const item: PriceResult = {
          ok: true,
          key: asset.key,
          symbol: "USDKRW",
          asOf: fx.asOf,
          price: fx.rate,
          source: "fx",
        };
        items.push(item);
        LAST_GOOD.set(asset.key, { ts: now, item });
      } catch (error: any) {
        const message = error?.message || "fx failed";
        const item = resolveLastGood(asset.key, {
          ok: false,
          key: asset.key,
          symbol: "USDKRW",
          error: message,
          source: "fx",
        });
        if (!item.ok) warnings.push(`${asset.label} ${message}`);
        items.push(item);
      }
      continue;
    }

    if (YAHOO_OTC_SYMBOLS[asset.key]) {
      const yahooSymbol = YAHOO_OTC_SYMBOLS[asset.key];
      const yahooResult = await fetchYahooQuoteWithRetry(yahooSymbol, {
        key: asset.key,
        onFetch: recordFetch,
      });
      if (yahooResult.ok) {
        const quote = yahooResult.quote;
        const change1dPct =
          quote.prevClose && quote.prevClose !== 0
            ? Number((((quote.price - quote.prevClose) / quote.prevClose) * 100).toFixed(2))
            : null;
        const item: PriceResult = {
          ok: true,
          key: asset.key,
          symbol: yahooSymbol,
          asOf: quote.asOf,
          price: quote.price,
          prevClose: quote.prevClose ?? null,
          change1dPct,
          source: "yahoo:otcpk",
        };
        items.push(item);
        LAST_GOOD.set(asset.key, { ts: now, item });
        continue;
      }
    }

    const normalized = normalizeStooqSymbol(asset.ticker || asset.key);
    const quote = stooqResults[normalized];
    if (quote?.ok) {
      const prevClose = quote.quote.open;
      const change1dPct =
        prevClose !== 0
          ? Number((((quote.quote.close - prevClose) / prevClose) * 100).toFixed(2))
          : null;
      const item: PriceResult = {
        ok: true,
        key: asset.key,
        symbol: normalized,
        asOf: quote.quote.date,
        price: quote.quote.close,
        prevClose,
        change1dPct,
        source: `stooq${asset.proxyFor ? `:${asset.proxyFor}` : ""}`,
      };
      items.push(item);
      LAST_GOOD.set(asset.key, { ts: now, item });
    } else {
      const fallbackSymbol = asset.ticker || asset.key;
      if (provider?.getQuote) {
        const providerQuote = await provider.getQuote(fallbackSymbol, {
          log: true,
          key: asset.key,
          onFetch: recordFetch,
        });
        if (providerQuote.ok) {
          const item: PriceResult = {
            ok: true,
            key: asset.key,
            symbol: fallbackSymbol,
            asOf: providerQuote.ts,
            price: providerQuote.price,
            source: provider.name,
          };
          items.push(item);
          LAST_GOOD.set(asset.key, { ts: now, item });
          continue;
        }
      }
      const error = quote?.error || "stooq missing";
      const item = resolveLastGood(asset.key, {
        ok: false,
        key: asset.key,
        symbol: normalized,
        error,
        source: "stooq",
      });
      if (!item.ok) warnings.push(`${asset.label} ${error}`);
      items.push(item);
    }
  }

  const payload = { items, warnings, cache: "MISS" as const };
  PRIMARY_CACHE.set(cacheKey, { ts: now, data: payload });
  return options.debug ? { ...payload, debug: { fetches: debugEntries } } : payload;
};
