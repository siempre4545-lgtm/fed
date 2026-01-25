const normalizeBodyHead = (text: string) => text.replace(/\s+/g, " ").slice(0, 200);

export const fetchUsdKrw = async (
  options: {
    signal?: AbortSignal;
    log?: boolean;
    key?: string;
    onFetch?: (entry: {
      source: "fx";
      key?: string;
      url: string;
      status?: number;
      elapsedMs: number;
      bodyHead?: string;
      ok: boolean;
      error?: string;
    }) => void;
  } = {}
): Promise<{ rate: number; asOf: string; source: string }> => {
  const url = "https://open.er-api.com/v6/latest/USD";
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
    const payload = { source: "fx" as const, key: options.key, ...entry };
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
      },
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
      error: `fx status ${response.status}`,
    });
    throw new Error(`fx status ${response.status}`);
  }
  const data = JSON.parse(text);
  const rate = data?.rates?.KRW;
  if (!rate || typeof rate !== "number") {
    record({
      url,
      status: response.status,
      elapsedMs: elapsed,
      bodyHead,
      ok: false,
      error: "fx rate missing",
    });
    throw new Error("fx rate missing");
  }
  record({
    url,
    status: response.status,
    elapsedMs: elapsed,
    bodyHead,
    ok: true,
  });
  const asOf = data?.time_last_update_utc
    ? new Date(data.time_last_update_utc).toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10);
  return { rate, asOf, source: url };
};
