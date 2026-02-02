/**
 * SEC EDGAR Archives 파일 탐색 (13F 정보표 후보 찾기).
 * - 기존 lib/sec.ts 수정 없음.
 */

import { fetchSecDocument } from "@/lib/secFetch";

const CACHE_TTL_MS = 10 * 60 * 1000;
const indexCache = new Map<string, { ts: number; links: string[] }>();

function buildIndexUrl(cik: string, accessionNumber: string): string {
  const n = parseInt(String(cik).replace(/\D/g, ""), 10);
  const cikNum = Number.isFinite(n) ? n : 0;
  const noDashes = (accessionNumber || "").replace(/-/g, "");
  return `https://www.sec.gov/Archives/edgar/data/${cikNum}/${noDashes}/${noDashes}-index.htm`;
}

/**
 * Index 페이지 HTML에서 문서 링크 추출 (href="파일명").
 */
function parseIndexLinks(html: string, basePath: string): string[] {
  const links: string[] = [];
  const hrefRe = /href="([^"]+)"/gi;
  let m: RegExpExecArray | null;
  while ((m = hrefRe.exec(html)) !== null) {
    const href = m[1].trim();
    if (!href || href.startsWith("#") || href.startsWith("javascript:")) continue;
    const name = href.includes("/") ? href.split("/").pop() : href;
    if (name && /\.(xml|txt|htm|html)$/i.test(name)) links.push(name);
  }
  return [...new Set(links)];
}

/** 정보표 후보 우선순위: infotable.xml > form13fInfoTable.xml > *info*.xml > *.xml */
function pickInfoTableFile(fileNames: string[]): string | null {
  const lower = fileNames.map((f) => f.toLowerCase());
  const exact = lower.find((f) => f === "infotable.xml");
  if (exact) return fileNames[lower.indexOf(exact)];
  const form13f = lower.find((f) => f.includes("form13f") && f.includes("info") && f.endsWith(".xml"));
  if (form13f) return fileNames[lower.indexOf(form13f)];
  const infoXml = lower.find((f) => f.includes("info") && f.endsWith(".xml"));
  if (infoXml) return fileNames[lower.indexOf(infoXml)];
  const anyXml = lower.find((f) => f.endsWith(".xml"));
  if (anyXml) return fileNames[lower.indexOf(anyXml)];
  return null;
}

export type InfoTableCandidate = {
  url: string;
  fileName: string;
};

/**
 * CIK + accession으로 해당 filing의 Archives index를 조회해 정보표 후보 URL 반환.
 * - 캐시 10분.
 */
export async function find13fInfoTableUrl(
  cik: string,
  accessionNumber: string
): Promise<InfoTableCandidate | null> {
  const key = `index:${cik}:${(accessionNumber || "").replace(/-/g, "")}`;
  const cached = indexCache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS && cached.links.length > 0) {
    const picked = pickInfoTableFile(cached.links);
    if (picked) {
      const n = parseInt(String(cik).replace(/\D/g, ""), 10);
      const cikNum = Number.isFinite(n) ? n : 0;
      const noDashes = (accessionNumber || "").replace(/-/g, "");
      return { url: `https://www.sec.gov/Archives/edgar/data/${cikNum}/${noDashes}/${picked}`, fileName: picked };
    }
    return null;
  }

  const indexUrl = buildIndexUrl(cik, accessionNumber);
  const html = await fetchSecDocument(indexUrl);
  if (!html) return null;

  const basePath = indexUrl.replace(/-index\.htm$/i, "");
  const links = parseIndexLinks(html, basePath);
  indexCache.set(key, { ts: Date.now(), links });

  const picked = pickInfoTableFile(links);
  if (!picked) return null;
  const n = parseInt(String(cik).replace(/\D/g, ""), 10);
  const cikNum = Number.isFinite(n) ? n : 0;
  const noDashes = (accessionNumber || "").replace(/-/g, "");
  return { url: `https://www.sec.gov/Archives/edgar/data/${cikNum}/${noDashes}/${picked}`, fileName: picked };
}
