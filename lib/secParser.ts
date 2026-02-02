/**
 * 13D / 13G 지분율 '최소 파서'.
 * - 정규표현식 기반 패턴 매칭만 사용.
 * - 불확실하면 표시하지 않음. 실패는 정상 케이스로 간주.
 */

export type Parsed13DG = {
  percentOfClass: number | null;
  sharesOwned: number | null;
};

const PERCENT_KEYWORDS = [
  "Percent of Class",
  "Percent of class represented",
  "% of class",
];
const SHARES_KEYWORDS = [
  "Amount Beneficially Owned",
  "Aggregate amount beneficially owned",
  "Shares beneficially owned",
];

/** 지분율: 0~100 소수/정수. 문맥상 가장 가까운 1개만 사용. */
function extractPercentNearKeyword(html: string, keywords: string[]): number | null {
  const lower = html.replace(/\s+/g, " ").toLowerCase();
  for (const kw of keywords) {
    const idx = lower.indexOf(kw.toLowerCase());
    if (idx === -1) continue;
    const slice = html.slice(idx, idx + 300);
    const match = slice.match(/(\d+(?:\.\d+)?)\s*%?/);
    if (!match) continue;
    const num = parseFloat(match[1]);
    if (Number.isFinite(num) && num >= 0 && num <= 100) return num;
  }
  return null;
}

/** 보유주식: 천 단위 콤마 포함 숫자. 문맥상 가장 가까운 1개만 사용. */
function extractSharesNearKeyword(html: string, keywords: string[]): number | null {
  const lower = html.replace(/\s+/g, " ").toLowerCase();
  for (const kw of keywords) {
    const idx = lower.indexOf(kw.toLowerCase());
    if (idx === -1) continue;
    const slice = html.slice(idx, idx + 400);
    const match = slice.match(/(\d{1,3}(?:,\d{3})*(?:\.\d+)?)/);
    if (!match) continue;
    const num = parseFloat(match[1].replace(/,/g, ""));
    if (Number.isFinite(num) && num >= 0) return Math.floor(num);
  }
  return null;
}

/**
 * 13D / 13G / 13D/A / 13G/A HTML에서 지분율·보유주식만 최소 추출.
 * - 패턴 없으면 해당 필드는 null.
 * - 비정상 값(예: 100% 초과)이면 해당 필드는 무시(null).
 * - 둘 다 null이면 호출측에서 "지분 정보 미확인" 처리.
 */
export function parse13DGOwnership(html: string): Parsed13DG | null {
  if (!html || typeof html !== "string") return null;
  const percent = extractPercentNearKeyword(html, PERCENT_KEYWORDS);
  const shares = extractSharesNearKeyword(html, SHARES_KEYWORDS);
  if (percent === null && shares === null) return null;
  return { percentOfClass: percent, sharesOwned: shares };
}
