/**
 * 13F 기반 섹터 / ETF 분류 (간접 추정용).
 * - 정확한 수치 금지. 방향성·빈도 기준만 사용.
 */

const ETF_PATTERNS = [
  /ETF/i,
  /SPDR/i,
  /iShares/i,
  /Vanguard/i,
  /Invesco/i,
];

const SECTOR_KEYWORDS: Array<{ sector: string; keywords: string[] }> = [
  { sector: "Technology", keywords: ["tech", "software", "semiconductor", "apple", "microsoft", "google", "meta", "amazon", "nvidia", "intel", "amd", "oracle", "salesforce", "adobe", "cisco", "ibm", "qualcomm"] },
  { sector: "Energy", keywords: ["energy", "oil", "gas", "exxon", "chevron", "conocophillips", "schlumberger", "halliburton", "pioneer", "eog", "occidental"] },
  { sector: "Financials", keywords: ["bank", "financial", "insurance", "jpmorgan", "bank of america", "wells fargo", "goldman", "morgan stanley", "blackrock", "charles schwab", "berkshire", "visa", "mastercard", "american express"] },
  { sector: "Healthcare", keywords: ["health", "pharma", "biotech", "pfizer", "johnson", "merck", "abbvie", "eli lilly", "bristol", "amgen", "gilead", "moderna", "regeneron"] },
  { sector: "Industrials", keywords: ["industrial", "aerospace", "caterpillar", "boeing", "honeywell", "ge ", "3m", "union pacific", "lockheed", "general dynamics"] },
  { sector: "Consumer", keywords: ["consumer", "retail", "procter", "coca-cola", "pepsi", "walmart", "home depot", "mcdonald", "starbucks", "nike", "target", "costco"] },
  { sector: "Utilities", keywords: ["utility", "electric", "duke energy", "nextera", "dominion", "southern co"] },
  { sector: "Materials", keywords: ["material", "chemical", "mining", "dow", "dupont", "freeport", "nucor"] },
];

export function isETF(name: string): boolean {
  if (!name || typeof name !== "string") return false;
  const n = name.trim();
  if (!n) return false;
  return ETF_PATTERNS.some((re) => re.test(n));
}

export function getSector(name: string): string {
  if (!name || typeof name !== "string") return "기타 / 혼합";
  const lower = name.trim().toLowerCase();
  if (!lower) return "기타 / 혼합";
  for (const { sector, keywords } of SECTOR_KEYWORDS) {
    if (keywords.some((kw) => lower.includes(kw))) return sector;
  }
  return "기타 / 혼합";
}

export type Aggregate13F = {
  topSectors: string[];
  etfExposure: boolean;
  etfLabels: string[];
  mixLabel: string;
};

/**
 * 보유 종목명 배열을 받아 섹터 Top 3(빈도), ETF 노출 여부, 성격 추정 반환.
 * - 정확한 비중 계산 금지. 빈도만 사용.
 */
export function aggregateHoldings(holdings: { name: string }[]): Aggregate13F {
  const sectors: Record<string, number> = {};
  let etfCount = 0;
  const etfLabels: string[] = [];

  for (const { name } of holdings) {
    if (!name?.trim()) continue;
    const sector = getSector(name);
    sectors[sector] = (sectors[sector] ?? 0) + 1;
    if (isETF(name)) {
      etfCount++;
      const label = name.trim().slice(0, 30);
      if (label && !etfLabels.includes(label)) etfLabels.push(label);
    }
  }

  const topSectors = Object.entries(sectors)
    .filter(([s]) => s !== "기타 / 혼합")
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([s]) => s);

  if (topSectors.length === 0 && (sectors["기타 / 혼합"] ?? 0) > 0) {
    topSectors.push("기타 / 혼합");
  }

  const etfExposure = etfCount > 0;
  const total = holdings.length;
  const mixLabel =
    total === 0
      ? "—"
      : etfCount >= total * 0.5
        ? "패시브 성격 강함"
        : etfCount > 0
          ? "패시브 + 액티브 혼합"
          : "액티브 위주 추정";

  return { topSectors, etfExposure, etfLabels: etfLabels.slice(0, 5), mixLabel };
}
