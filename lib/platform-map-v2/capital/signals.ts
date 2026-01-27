export type RegionType = "metro" | "local";

export type CapitalStage = 1 | 2 | 3 | 4 | 5;

export type CapitalSignalType = "policy" | "public" | "finance" | "reit" | "private";

export type CapitalSignal = {
  stage: CapitalStage;
  type: CapitalSignalType;
  reason: string;
  reliability: "A" | "B" | "C";
};

const CONFIRMED_KEYWORDS = [
  "확정",
  "지정",
  "착공",
  "승인",
  "고시",
  "시행",
  "통과",
  "준공",
  "완료",
  "예산확정",
  "예산확보",
  "계약",
  "설립",
  "인수",
  "매입",
  "투입",
];

const SOFT_KEYWORDS = ["검토", "논의", "예정", "추진", "계획", "가능성", "제안", "용역", "입찰", "협의"];

const STAGE_KEYWORDS: Record<CapitalStage, Array<{ keyword: string; type: CapitalSignalType }>> = {
  1: [
    { keyword: "특구", type: "policy" },
    { keyword: "규제", type: "policy" },
    { keyword: "조례", type: "policy" },
    { keyword: "고시", type: "policy" },
    { keyword: "지정", type: "policy" },
    { keyword: "예산", type: "policy" },
    { keyword: "국비", type: "policy" },
    { keyword: "정책", type: "policy" },
    { keyword: "법안", type: "policy" },
    { keyword: "통과", type: "policy" },
  ],
  2: [
    { keyword: "공기업", type: "public" },
    { keyword: "공공", type: "public" },
    { keyword: "lh", type: "public" },
    { keyword: "sh", type: "public" },
    { keyword: "공사", type: "public" },
    { keyword: "공단", type: "public" },
    { keyword: "공공개발", type: "public" },
    { keyword: "공공기관이전", type: "public" },
    { keyword: "이전확정", type: "public" },
    { keyword: "민관합작", type: "public" },
    { keyword: "ppp", type: "public" },
    { keyword: "spc", type: "public" },
  ],
  3: [
    { keyword: "금융지주", type: "finance" },
    { keyword: "은행", type: "finance" },
    { keyword: "보험", type: "finance" },
    { keyword: "증권", type: "finance" },
    { keyword: "자산운용", type: "finance" },
    { keyword: "pf", type: "finance" },
    { keyword: "프로젝트파이낸싱", type: "finance" },
    { keyword: "담보", type: "finance" },
    { keyword: "평가", type: "finance" },
    { keyword: "신탁", type: "finance" },
  ],
  4: [
    { keyword: "리츠", type: "reit" },
    { keyword: "reit", type: "reit" },
    { keyword: "btr", type: "reit" },
    { keyword: "부동산펀드", type: "reit" },
    { keyword: "임대주택펀드", type: "reit" },
    { keyword: "편입", type: "reit" },
    { keyword: "리츠설립", type: "reit" },
  ],
  5: [
    { keyword: "민간", type: "private" },
    { keyword: "대형", type: "private" },
    { keyword: "건설사", type: "private" },
    { keyword: "컨소시엄", type: "private" },
    { keyword: "대규모투자", type: "private" },
    { keyword: "민간자본", type: "private" },
  ],
};

const normalize = (value: string) =>
  value
    .replace(/[()（）]/g, " ")
    .replace(/[\p{P}\p{S}]/gu, " ")
    .replace(/\s+/g, "")
    .trim()
    .toLowerCase();

export const getRegionType = (sigunguName: string, sigunguKey?: string | null): RegionType => {
  if (sigunguKey && /^(11|23|41)/.test(sigunguKey)) {
    return "metro";
  }
  const name = sigunguName.trim();
  if (name.startsWith("서울") || name.startsWith("경기") || name.startsWith("인천")) {
    return "metro";
  }
  return "local";
};

const hasConfirmedSignal = (normalized: string) =>
  CONFIRMED_KEYWORDS.some((keyword) => normalized.includes(keyword));

const isSoftOnly = (normalized: string) =>
  !hasConfirmedSignal(normalized) && SOFT_KEYWORDS.some((keyword) => normalized.includes(keyword));

export const extractCapitalSignal = (
  text: string,
  reliability: "A" | "B" | "C",
): CapitalSignal | null => {
  const normalized = normalize(text);
  if (!hasConfirmedSignal(normalized) || isSoftOnly(normalized)) return null;

  const matched: Array<{ stage: CapitalStage; type: CapitalSignalType; keyword: string }> = [];
  const stages: CapitalStage[] = [1, 2, 3, 4, 5];
  stages.forEach((stage) => {
    STAGE_KEYWORDS[stage].forEach((entry) => {
      if (normalized.includes(entry.keyword)) {
        matched.push({ stage, type: entry.type, keyword: entry.keyword });
      }
    });
  });

  if (matched.length === 0) return null;
  const best = matched.sort((a, b) => b.stage - a.stage)[0];
  return {
    stage: best.stage,
    type: best.type,
    reason: best.keyword,
    reliability,
  };
};
