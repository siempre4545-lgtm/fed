import * as cheerio from "cheerio";

export type MarginDebtResult = {
  value: number | null;
  asOf: string;
  sourceUrl: string;
  warning?: string;
};

const FINRA_URL =
  "https://www.finra.org/rules-guidance/key-topics/margin-accounts/margin-statistics";

const normalizeBodyHead = (text: string) => text.replace(/\s+/g, " ").slice(0, 200);

const parseNumber = (raw: string) => {
  const normalized = raw.replace(/[, $]/g, "");
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
};

export const fetchFinraMarginDebt = async (
  options: {
    signal?: AbortSignal;
    log?: boolean;
    key?: string;
    onFetch?: (entry: {
      source: "finra";
      key?: string;
      url: string;
      status?: number;
      elapsedMs: number;
      bodyHead?: string;
      ok: boolean;
      error?: string;
    }) => void;
  } = {}
): Promise<MarginDebtResult> => {
  const shouldLog = options.log !== false;
  let recorded = false;
  const record = (entry: {
    url: string;
    status?: number;
    elapsedMs: number;
    bodyHead?: string;
    ok: boolean;
    error?: string;
  }) => {
    recorded = true;
    const payload = { source: "finra" as const, key: options.key, ...entry };
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
  try {
    const started = Date.now();
    let response: Response;
    try {
      response = await fetch(FINRA_URL, {
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
        url: FINRA_URL,
        status: undefined,
        elapsedMs: elapsed,
        bodyHead: "",
        ok: false,
        error: error?.message || "fetch failed",
      });
      throw error;
    }
    const elapsed = Date.now() - started;
    const html = await response.text();
    const bodyHead = normalizeBodyHead(html);
    if (!response.ok) {
      record({
        url: FINRA_URL,
        status: response.status,
        elapsedMs: elapsed,
        bodyHead,
        ok: false,
        error: `finra status ${response.status}`,
      });
      return {
        value: null,
        asOf: new Date().toISOString().slice(0, 10),
        sourceUrl: FINRA_URL,
        warning: "FINRA 응답 오류",
      };
    }
    const $ = cheerio.load(html);
    let latestValue: number | null = null;
    let latestDate = "";

    $("table").each((_idx, table) => {
      const headers = $(table)
        .find("thead th")
        .map((_i, el) => $(el).text().trim())
        .get()
        .join(" ");
      if (!/margin|debit|balances/i.test(headers)) return;
      $(table)
        .find("tbody tr")
        .each((_rowIdx, row) => {
          const cells = $(row)
            .find("td")
            .map((_i, el) => $(el).text().trim())
            .get();
          if (cells.length < 2) return;
          const value = parseNumber(cells[cells.length - 1]);
          if (value === null) return;
          latestValue = value;
          latestDate = cells[0];
        });
    });

    if (latestValue === null) {
      record({
        url: FINRA_URL,
        status: response.status,
        elapsedMs: elapsed,
        bodyHead,
        ok: false,
        error: "FINRA parse failed",
      });
      return {
        value: null,
        asOf: new Date().toISOString().slice(0, 10),
        sourceUrl: FINRA_URL,
        warning: "FINRA 데이터 파싱 실패",
      };
    }

    record({
      url: FINRA_URL,
      status: response.status,
      elapsedMs: elapsed,
      bodyHead,
      ok: true,
    });
    return {
      value: latestValue,
      asOf: latestDate || new Date().toISOString().slice(0, 10),
      sourceUrl: FINRA_URL,
    };
  } catch (error: any) {
    if (!recorded) {
      record({
        url: FINRA_URL,
        status: undefined,
        elapsedMs: 0,
        bodyHead: "",
        ok: false,
        error: error?.message || "FINRA 요청 실패",
      });
    }
    return {
      value: null,
      asOf: new Date().toISOString().slice(0, 10),
      sourceUrl: FINRA_URL,
      warning: "FINRA 요청 실패",
    };
  }
};
