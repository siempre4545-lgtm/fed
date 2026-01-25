import type { MarketProvider, ProviderFetchOptions, ProviderFxResult, ProviderQuoteResult } from "./types.js";

const normalizeBodyHead = (text: string) => text.replace(/\s+/g, " ").slice(0, 200);
const maskApiKey = (url: string) =>
  url
    .replace(/apikey=([^&]+)/i, "apikey=***")
    .replace(/api_key=([^&]+)/i, "api_key=***");

const toIso = (value?: string) => {
  if (!value) return new Date().toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
};

const recordFetch = (
  options: ProviderFetchOptions,
  payload: {
    source: string;
    key?: string;
    url: string;
    status?: number;
    elapsedMs: number;
    bodyHead?: string;
    ok: boolean;
    error?: string;
  }
) => {
  options.onFetch?.(payload);
  if (options.log !== false) {
    console.log(
      JSON.stringify({
        tag: "market_fetch",
        runtime: process.env.VERCEL ? "vercel" : "local",
        ...payload,
      })
    );
  }
};

export const createTwelveDataProvider = (): MarketProvider | null => {
  const apiKey = process.env.TWELVEDATA_API_KEY || process.env.PROVIDERX_API_KEY;
  if (!apiKey) return null;
  const baseUrl = "https://api.twelvedata.com";

  const getQuote = async (
    symbol: string,
    options: ProviderFetchOptions = {}
  ): Promise<ProviderQuoteResult> => {
    const url = `${baseUrl}/quote?symbol=${encodeURIComponent(symbol)}&apikey=${apiKey}`;
    const debugUrl = maskApiKey(url);
    const started = Date.now();
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
        signal: options.signal,
      });
    } catch (error: any) {
      recordFetch(options, {
        source: "twelvedata",
        key: options.key,
        url: debugUrl,
        status: undefined,
        elapsedMs: Date.now() - started,
        bodyHead: "",
        ok: false,
        error: error?.message || "provider fetch failed",
      });
      return { ok: false, error: error?.message || "provider fetch failed" };
    }
    const elapsed = Date.now() - started;
    const text = await response.text();
    const bodyHead = normalizeBodyHead(text);

    if (!response.ok) {
      recordFetch(options, {
        source: "twelvedata",
        key: options.key,
        url: debugUrl,
        status: response.status,
        elapsedMs: elapsed,
        bodyHead,
        ok: false,
        error: `provider status ${response.status}`,
      });
      return { ok: false, error: `provider status ${response.status}` };
    }

    let data: any;
    try {
      data = JSON.parse(text);
    } catch (error: any) {
      recordFetch(options, {
        source: "twelvedata",
        key: options.key,
        url: debugUrl,
        status: response.status,
        elapsedMs: elapsed,
        bodyHead,
        ok: false,
        error: "provider json parse failed",
      });
      return { ok: false, error: "provider json parse failed" };
    }

    if (data?.status === "error" || data?.code) {
      recordFetch(options, {
        source: "twelvedata",
        key: options.key,
        url: debugUrl,
        status: response.status,
        elapsedMs: elapsed,
        bodyHead,
        ok: false,
        error: data?.message || "provider error",
      });
      return { ok: false, error: data?.message || "provider error" };
    }

    const price = Number(data?.close ?? data?.price);
    if (!Number.isFinite(price)) {
      recordFetch(options, {
        source: "twelvedata",
        key: options.key,
        url: debugUrl,
        status: response.status,
        elapsedMs: elapsed,
        bodyHead,
        ok: false,
        error: "provider price missing",
      });
      return { ok: false, error: "provider price missing" };
    }

    recordFetch(options, {
      source: "twelvedata",
      key: options.key,
      url: debugUrl,
      status: response.status,
      elapsedMs: elapsed,
      bodyHead,
      ok: true,
    });
    return { ok: true, price, ts: toIso(data?.datetime) };
  };

  const getFx = async (
    pair: string,
    options: ProviderFetchOptions = {}
  ): Promise<ProviderFxResult> => {
    const symbol = pair === "USDKRW" ? "USD/KRW" : pair;
    const quote = await getQuote(symbol, options);
    if (!quote.ok) {
      return { ok: false, error: quote.error };
    }
    return { ok: true, rate: quote.price, ts: quote.ts };
  };

  return { name: "twelvedata", getQuote, getFx };
};
