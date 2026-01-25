import { normalizeStooqSymbol } from "../symbols.js";

export type StooqQuote = {
  symbol: string;
  date: string;
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

const normalizeBodyHead = (text: string) => text.replace(/\s+/g, " ").slice(0, 200);

export const parseStooqCsv = (csv: string): StooqQuote => {
  const lines = csv.trim().split(/\r?\n/);
  if (lines.length < 2) {
    throw new Error("stooq csv empty");
  }
  const [, dataLine] = lines;
  const parts = dataLine.split(",");
  if (parts.length < 8) {
    throw new Error("stooq csv malformed");
  }
  const [symbol, date, time, open, high, low, close, volume] = parts;
  if (close === "N/A") {
    throw new Error("stooq close N/A");
  }
  const parsed = {
    symbol,
    date,
    time,
    open: Number(open),
    high: Number(high),
    low: Number(low),
    close: Number(close),
    volume: Number(volume),
  };
  if (!Number.isFinite(parsed.close)) {
    throw new Error("stooq close invalid");
  }
  return parsed;
};

export const fetchStooqQuote = async (
  symbol: string,
  options: {
    signal?: AbortSignal;
    log?: boolean;
    key?: string;
    onFetch?: (entry: {
      source: "stooq";
      key?: string;
      url: string;
      status?: number;
      elapsedMs: number;
      bodyHead?: string;
      ok: boolean;
      error?: string;
    }) => void;
  } = {}
): Promise<StooqQuote> => {
  const normalized = normalizeStooqSymbol(symbol);
  const url = `https://stooq.com/q/l/?s=${normalized}&f=sd2t2ohlcvn&h&e=csv`;
  const started = Date.now();
  const shouldLog = options.log !== false;
  const record = (entry: {
    url: string;
    status?: number;
    elapsedMs: number;
    bodyHead?: string;
    ok: boolean;
    error?: string;
  }) => {
    const payload = { source: "stooq" as const, key: options.key, ...entry };
    options.onFetch?.(payload);
    if (shouldLog) {
      console.log(
        JSON.stringify({
          tag: "market_fetch",
          runtime: process.env.VERCEL ? "vercel" : "local",
          ...payload,
        })
      );
    }
  };

  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; fedreportsh/1.0; +https://fedreportsh.vercel.app)",
        Accept: "*/*",
        "Accept-Language": "en-US,en;q=0.9",
        "Cache-Control": "no-cache",
        Referer: "https://stooq.com/",
      },
      cache: "no-store",
      signal: options.signal,
    });
  } catch (error: any) {
    const elapsed = Date.now() - started;
    record({
      url,
      status: undefined,
      elapsedMs: elapsed,
      bodyHead: "",
      ok: false,
      error: error?.message || "fetch failed",
    });
    throw error;
  }
  const elapsed = Date.now() - started;
  const text = await response.text();
  const bodyHead = normalizeBodyHead(text);
  if (!response.ok) {
    record({
      url,
      status: response.status,
      elapsedMs: elapsed,
      bodyHead,
      ok: false,
      error: `stooq status ${response.status}`,
    });
    throw new Error(`stooq status ${response.status}`);
  }
  try {
    const parsed = parseStooqCsv(text);
    record({
      url,
      status: response.status,
      elapsedMs: elapsed,
      bodyHead,
      ok: true,
    });
    return parsed;
  } catch (error: any) {
    record({
      url,
      status: response.status,
      elapsedMs: elapsed,
      bodyHead,
      ok: false,
      error: error?.message || "parse failed",
    });
    throw error;
  }
};

export const fetchManyStooqQuotes = async (
  symbols: string[],
  concurrency: number = 5
): Promise<Record<string, { ok: true; data: StooqQuote } | { ok: false; error: string }>> => {
  const results: Record<string, { ok: true; data: StooqQuote } | { ok: false; error: string }> = {};
  const queue = [...symbols];

  const worker = async () => {
    while (queue.length) {
      const symbol = queue.shift();
      if (!symbol) return;
      try {
        const data = await fetchStooqQuote(symbol);
        results[symbol] = { ok: true, data };
      } catch (error: any) {
        results[symbol] = { ok: false, error: error?.message || "fetch failed" };
      }
    }
  };

  const workers = Array.from({ length: Math.min(concurrency, symbols.length) }, worker);
  await Promise.all(workers);
  return results;
};
