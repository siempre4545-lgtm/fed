/**
 * SEC EDGAR 공개 API 헬퍼 (서버 전용).
 * - company_tickers.json 기반 CIK 검색
 * - submissions JSON 기반 13D/13G/13F 공시 목록
 */

const SEC_TICKERS_URL = "https://www.sec.gov/files/company_tickers.json";
const SEC_SUBMISSIONS_BASE = "https://data.sec.gov/submissions";

const TARGET_FORMS = new Set([
  "13D",
  "13D/A",
  "13G",
  "13G/A",
  "13F-HR",
  "13F-HR/A",
]);

const CACHE_TTL_MS = 10 * 60 * 1000; // 10분

export type CompanyTickerEntry = {
  cik_str: number;
  ticker: string;
  title: string;
};

export type CompanyTickersMap = Record<string, CompanyTickerEntry>;

let tickersCache: { ts: number; data: CompanyTickersMap | null } | null = null;

const getUserAgent = (): string =>
  process.env.SEC_USER_AGENT ?? "fedreportsh (contact@email.com)";

export function padCik(cik: number | string): string {
  const n = typeof cik === "string" ? parseInt(cik, 10) : cik;
  if (!Number.isFinite(n)) return "";
  return String(n).padStart(10, "0");
}

/**
 * SEC company_tickers.json 조회 (캐시 10분).
 */
export async function fetchCompanyTickers(): Promise<CompanyTickersMap | null> {
  if (tickersCache && Date.now() - tickersCache.ts < CACHE_TTL_MS) {
    return tickersCache.data;
  }
  try {
    const res = await fetch(SEC_TICKERS_URL, {
      headers: { "User-Agent": getUserAgent() },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as CompanyTickersMap;
    tickersCache = { ts: Date.now(), data };
    return data;
  } catch {
    return null;
  }
}

/**
 * 이름 키워드로 CIK 검색 (title 포함 매칭, 대소문자 무시).
 * 첫 매칭 1건 반환.
 */
export function searchCikByKeyword(
  tickers: CompanyTickersMap | null,
  keyword: string
): { cik: string; title: string } | null {
  if (!tickers || !keyword || typeof keyword !== "string") return null;
  const q = keyword.trim().toLowerCase();
  if (!q) return null;
  for (const key of Object.keys(tickers)) {
    const entry = tickers[key];
    if (!entry?.title) continue;
    if (String(entry.title).toLowerCase().includes(q)) {
      return {
        cik: padCik(entry.cik_str),
        title: entry.title,
      };
    }
  }
  return null;
}

export type SecFilingItem = {
  filingDate: string;
  formType: string;
  accessionNumber: string;
  accessionNumberShort: string;
  primaryDocument: string;
  note: string;
};

export type SecSubmissionsRecent = {
  form?: string[];
  accessionNumber?: string[];
  filingDate?: string[];
  primaryDocument?: string[];
};

const filingsCache = new Map<
  string,
  { ts: number; items: SecFilingItem[] }
>();

/**
 * CIK에 대한 submissions JSON 조회 후 13D/13G/13F 필터링 (캐시 10분).
 */
export async function fetchFilingsForCik(
  cik: string
): Promise<{ ok: true; filings: SecFilingItem[] } | { ok: false; error: string }> {
  const padded = padCik(cik);
  if (!padded) return { ok: false, error: "invalid_cik" };

  const cacheKey = `cik:${padded}`;
  const cached = filingsCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return { ok: true, filings: cached.items };
  }

  const url = `${SEC_SUBMISSIONS_BASE}/CIK${padded}.json`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": getUserAgent() },
      signal: AbortSignal.timeout(15000),
    });
    if (res.status === 403) return { ok: false, error: "forbidden" };
    if (res.status === 429) return { ok: false, error: "rate_limit" };
    if (!res.ok) return { ok: false, error: "fetch_failed" };

    const json = (await res.json()) as {
      filings?: { recent?: SecSubmissionsRecent };
    };
    const recent = json?.filings?.recent;
    if (!recent || !Array.isArray(recent.form)) {
      filingsCache.set(cacheKey, { ts: Date.now(), items: [] });
      return { ok: true, filings: [] };
    }

    const forms = recent.form as string[];
    const accessionNumbers = (recent.accessionNumber ?? []) as string[];
    const filingDates = (recent.filingDate ?? []) as string[];
    const primaryDocs = (recent.primaryDocument ?? []) as string[];

    const items: SecFilingItem[] = [];
    for (let i = 0; i < forms.length; i++) {
      const form = forms[i];
      if (!form || !TARGET_FORMS.has(form)) continue;
      const acc = accessionNumbers[i];
      const date = filingDates[i];
      const primary = primaryDocs[i];
      const short = acc
        ? acc.replace(/-/g, "").slice(-20)
        : "";
      const note = form.includes("/A") ? "A (Amendment)" : "";
      items.push({
        filingDate: date ?? "",
        formType: form,
        accessionNumber: acc ?? "",
        accessionNumberShort: short,
        primaryDocument: primary ?? "",
        note,
      });
    }
    items.sort((a, b) => (b.filingDate || "").localeCompare(a.filingDate || ""));
    filingsCache.set(cacheKey, { ts: Date.now(), items });
    return { ok: true, filings: items };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("timeout") || msg.includes("abort")) {
      return { ok: false, error: "timeout" };
    }
    return { ok: false, error: "fetch_failed" };
  }
}

/**
 * 요약: 최근 90일 건수, 최근 제출일, Form 비중, 최근 이벤트 라벨.
 */
export function summarizeFilings(filings: SecFilingItem[]): {
  count90d: number;
  latestFilingDate: string | null;
  formCounts: { "13D": number; "13G": number; "13F": number };
  latestEventLabel: string | null;
} {
  const now = new Date();
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const toDate = (s: string) => (s ? new Date(s) : null);

  let count90d = 0;
  let latestFilingDate: string | null = null;
  const formCounts = { "13D": 0, "13G": 0, "13F": 0 };

  for (const f of filings) {
    const d = toDate(f.filingDate);
    if (d && d >= ninetyDaysAgo) count90d++;
    if (f.filingDate && (!latestFilingDate || f.filingDate > latestFilingDate)) {
      latestFilingDate = f.filingDate;
    }
    if (f.formType?.startsWith("13D")) formCounts["13D"]++;
    else if (f.formType?.startsWith("13G")) formCounts["13G"]++;
    else if (f.formType?.startsWith("13F")) formCounts["13F"]++;
  }

  const latest = filings[0];
  const latestEventLabel = latest
    ? `${latest.formType}${latest.note ? " " + latest.note : ""}`
    : null;

  return {
    count90d,
    latestFilingDate,
    formCounts,
    latestEventLabel,
  };
}
