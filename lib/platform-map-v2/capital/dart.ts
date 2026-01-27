import { createCacheStore } from "../cache";
import { extractFirstXmlFromZip } from "./zip";

const DART_BASE = "https://opendart.fss.or.kr/api";
const cacheStore = createCacheStore();
const CORP_CACHE_KEY = "pmv2:dart:corpCodes";
const CORP_CACHE_TTL = 60 * 60 * 24 * 7;

const normalize = (value: string) =>
  value
    .replace(/[()（）]/g, " ")
    .replace(/[\p{P}\p{S}]/gu, " ")
    .replace(/\s+/g, "")
    .trim()
    .toLowerCase();

const fetchWithTimeout = async (url: string, timeoutMs: number) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
};

const parseCorpCodeXml = (xml: string) => {
  const map = new Map<string, string>();
  const corpRegex = /<list>([\s\S]*?)<\/list>/g;
  let match = corpRegex.exec(xml);
  while (match) {
    const block = match[1];
    const nameMatch = block.match(/<corp_name>([^<]+)<\/corp_name>/);
    const codeMatch = block.match(/<corp_code>([^<]+)<\/corp_code>/);
    if (nameMatch && codeMatch) {
      map.set(normalize(nameMatch[1]), codeMatch[1]);
    }
    match = corpRegex.exec(xml);
  }
  return map;
};

export const loadCorpCodeMap = async (apiKey: string) => {
  const cached = await cacheStore.get<Record<string, string>>(CORP_CACHE_KEY);
  if (cached && Object.keys(cached).length > 0) return cached;

  const response = await fetchWithTimeout(`${DART_BASE}/corpCode.xml?crtfc_key=${apiKey}`, 8000);
  if (!response.ok) {
    throw new Error(`corpCode ${response.status}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  const xml = extractFirstXmlFromZip(buffer);
  if (!xml) {
    throw new Error("corpCode unzip failed");
  }
  const map = parseCorpCodeXml(xml);
  const objectMap: Record<string, string> = {};
  map.forEach((value, key) => {
    objectMap[key] = value;
  });
  await cacheStore.set(CORP_CACHE_KEY, objectMap, CORP_CACHE_TTL);
  return objectMap;
};

export const resolveCorpCode = (corpName: string, corpMap: Record<string, string>) => {
  const normalized = normalize(corpName);
  if (!normalized) return null;
  if (corpMap[normalized]) return corpMap[normalized];
  const candidates = Object.entries(corpMap).filter(
    ([name]) => name.includes(normalized) || normalized.includes(name),
  );
  if (candidates.length === 0) return null;
  const sorted = candidates.sort((a, b) => b[0].length - a[0].length);
  return sorted[0]?.[1] ?? null;
};

export type DartReport = {
  rceptNo: string;
  reportName: string;
  rceptDate: string;
};

export const fetchDartReports = async (apiKey: string, corpCode: string, reportTypes: string[]) => {
  const response = await fetchWithTimeout(
    `${DART_BASE}/list.json?crtfc_key=${apiKey}&corp_code=${corpCode}&page_count=20`,
    8000,
  );
  if (!response.ok) {
    throw new Error(`list ${response.status}`);
  }
  const data = (await response.json()) as {
    status: string;
    list?: Array<{ rcept_no: string; report_nm: string; rcept_dt: string }>;
  };
  if (data.status !== "000") {
    throw new Error(`list status ${data.status}`);
  }
  const list = (data.list ?? []).filter((item) =>
    reportTypes.some((keyword) => item.report_nm.includes(keyword)),
  );
  return list.slice(0, 2).map((item) => ({
    rceptNo: item.rcept_no,
    reportName: item.report_nm,
    rceptDate: item.rcept_dt,
  }));
};

export const fetchDartReportText = async (apiKey: string, rceptNo: string) => {
  const response = await fetchWithTimeout(
    `${DART_BASE}/document.xml?crtfc_key=${apiKey}&rcept_no=${rceptNo}`,
    8000,
  );
  if (!response.ok) {
    throw new Error(`document ${response.status}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  const xml = extractFirstXmlFromZip(buffer);
  if (!xml) {
    throw new Error("document unzip failed");
  }
  return xml
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};
