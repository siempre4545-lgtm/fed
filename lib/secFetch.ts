/**
 * SEC 문서 fetch (확장 기능 전용).
 * - 기존 lib/sec.ts 수정 없이 별도 모듈로 분리.
 */

const getUserAgent = (): string =>
  process.env.SEC_USER_AGENT ?? "fedreportsh (contact@email.com)";

const CACHE_TTL_MS = 10 * 60 * 1000;
const docCache = new Map<string, { ts: number; html: string }>();

/**
 * SEC 원문 URL에서 HTML 문자열 조회 (캐시 10분).
 */
export async function fetchSecDocument(url: string): Promise<string | null> {
  if (!url || typeof url !== "string") return null;
  const cached = docCache.get(url);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.html;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": getUserAgent() },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    docCache.set(url, { ts: Date.now(), html });
    return html;
  } catch {
    return null;
  }
}

export function buildSecDocUrl(
  cik: string,
  accessionNumber: string,
  primaryDocument: string
): string {
  const n = parseInt(String(cik).replace(/\D/g, ""), 10);
  const cikNum = Number.isFinite(n) ? n : 0;
  const noDashes = (accessionNumber || "").replace(/-/g, "");
  const doc = (primaryDocument || "").trim() || `${noDashes}-index.htm`;
  return `https://www.sec.gov/Archives/edgar/data/${cikNum}/${noDashes}/${doc}`;
}
