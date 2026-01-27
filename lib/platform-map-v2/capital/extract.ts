import type { CapitalHoldingRegion } from "../types";
import type { RegionContext } from "../news/match";
import { matchRegionNormalized, normalizeText } from "../news/match";

const REAL_ESTATE_KEYWORDS = [
  "부동산",
  "pf",
  "spc",
  "담보",
  "리츠",
  "btr",
  "개발",
  "사업",
  "매입",
  "매각",
  "자산",
];

const STATUS_KEYWORDS = {
  확대: ["신규", "취득", "확대", "증액", "편입", "설립", "매입"],
  정리: ["매각", "정리", "철수", "감축", "처분"],
};

const CONFIDENCE_LEVEL = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
} as const;

const countOccurrences = (text: string, token: string) => {
  if (!token) return 0;
  let count = 0;
  let index = text.indexOf(token);
  while (index !== -1) {
    count += 1;
    index = text.indexOf(token, index + token.length);
  }
  return count;
};

const detectStatus = (text: string, tokens: string[]) => {
  const normalized = normalizeText(text);
  const firstToken = tokens.find((token) => normalized.includes(token)) ?? "";
  const index = firstToken ? normalized.indexOf(firstToken) : -1;
  const window =
    index >= 0
      ? normalized.slice(Math.max(0, index - 40), Math.min(normalized.length, index + 40))
      : normalized;

  const hasStatus = (keywords: string[]) => keywords.some((keyword) => window.includes(keyword));
  if (hasStatus(STATUS_KEYWORDS.정리)) return "정리";
  if (hasStatus(STATUS_KEYWORDS.확대)) return "확대";
  return "보유";
};

const inferConfidence = (mentions: number) => {
  if (mentions >= 3) return "HIGH";
  if (mentions >= 2) return "MEDIUM";
  return "LOW";
};

export const extractHoldingsFromText = (text: string, contexts: RegionContext[]): CapitalHoldingRegion[] => {
  const normalized = normalizeText(text);
  const keywordHit = REAL_ESTATE_KEYWORDS.some((keyword) => normalized.includes(keyword));
  if (!keywordHit) return [];

  const matches = contexts.filter((context) => matchRegionNormalized(normalized, context));
  const items = matches.map((context) => {
    const tokens = context.coreTokens.length > 0 ? context.coreTokens : context.allTokens;
    const mentionCount = tokens.reduce((count, token) => count + countOccurrences(normalized, token), 0);
    return {
      sigungu: context.name,
      confidence: inferConfidence(mentionCount),
      status: detectStatus(text, tokens),
    } as CapitalHoldingRegion;
  });

  const merged = new Map<string, CapitalHoldingRegion>();
  items.forEach((item) => {
    const existing = merged.get(item.sigungu);
    if (!existing) {
      merged.set(item.sigungu, item);
      return;
    }
    const existingScore = CONFIDENCE_LEVEL[existing.confidence];
    const nextScore = CONFIDENCE_LEVEL[item.confidence];
    const confidence =
      nextScore > existingScore ? item.confidence : existing.confidence;
    const status =
      existing.status === "정리" || item.status === "정리"
        ? "정리"
        : existing.status === "확대" || item.status === "확대"
        ? "확대"
        : "보유";
    merged.set(item.sigungu, { ...existing, confidence, status });
  });

  return Array.from(merged.values());
};
