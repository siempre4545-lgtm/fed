import type {
  CapitalComparison,
  CapitalComparisonStatus,
  CapitalHoldingMatch,
  PlatformMapRating,
} from "../types";
import type { CapitalAlignment } from "./score";

const SCORE_HIGH = 70;
const SCORE_VERY_HIGH = 75;
const SCORE_LOW = 55;
const ALIGN_HIGH = 60;
const ALIGN_LOW = 30;

const STATUS_LABEL: Record<CapitalComparisonStatus, string> = {
  정합: "정합",
  선행: "선행",
  후행: "후행",
  불일치: "불일치",
};

const buildReason = (status: CapitalComparisonStatus, hasHoldings: boolean) => {
  if (status === "정합") return "점수 상승과 실제 보유 움직임이 동시에 확인됩니다.";
  if (status === "선행") {
    return hasHoldings
      ? "보유 데이터는 있으나 점수 상승 신호가 더 앞서 있습니다."
      : "점수는 상승했으나 보유 확대는 아직 확인되지 않았습니다.";
  }
  if (status === "후행") {
    return hasHoldings
      ? "실제 보유는 존재하나 점수·뉴스 반영이 느립니다."
      : "자본 흐름 신호 대비 점수 반영이 부족합니다.";
  }
  return "점수는 높으나 실제 보유/자본 흐름이 확인되지 않습니다.";
};

const buildSummary = (status: CapitalComparisonStatus, alignmentBand: string) => {
  if (status === "정합") return `자본 이동 지표(${alignmentBand})와 점수 상승이 일치합니다.`;
  if (status === "선행") return `점수 상승이 자본 이동 지표(${alignmentBand})보다 앞서 있습니다.`;
  if (status === "후행") return `자본 이동 지표(${alignmentBand}) 대비 점수 반영이 느립니다.`;
  return `점수 상승 대비 자본 이동 지표(${alignmentBand})는 약합니다.`;
};

export const getInstitutionTypeLabel = (type: CapitalHoldingMatch["type"]) => {
  switch (type) {
    case "financial_holding":
      return "금융지주";
    case "reit":
      return "상장 리츠";
    case "public_reit":
      return "공공 리츠";
    case "btr_reit":
      return "BTR 리츠";
    case "pension":
      return "연기금·공제회";
    case "fund":
      return "부동산 펀드";
    default:
      return "기타";
  }
};

export const buildCapitalComparison = (params: {
  rating: PlatformMapRating;
  alignment: CapitalAlignment | null;
  holdings: CapitalHoldingMatch[];
}): CapitalComparison => {
  const { rating, alignment, holdings } = params;
  const hasHoldings = holdings.length > 0;
  const alignmentScore = alignment?.score ?? 0;
  const alignmentBand = alignment?.bandLabel ?? "자본 흐름 없음";
  const scoreHigh = rating.totalScore >= SCORE_HIGH || alignmentScore >= ALIGN_HIGH;
  const scoreLow = rating.totalScore <= SCORE_LOW && alignmentScore <= ALIGN_LOW;

  let status: CapitalComparisonStatus = "선행";
  if (!hasHoldings && rating.totalScore >= SCORE_VERY_HIGH && alignmentScore <= ALIGN_LOW) {
    status = "불일치";
  } else if (hasHoldings && scoreHigh) {
    status = "정합";
  } else if (!hasHoldings && scoreHigh) {
    status = "선행";
  } else if (hasHoldings && scoreLow) {
    status = "후행";
  } else if (hasHoldings) {
    status = "후행";
  }

  const institutionTypes = Array.from(new Set(holdings.map((item) => getInstitutionTypeLabel(item.type))));
  return {
    status,
    statusLabel: STATUS_LABEL[status],
    reason: buildReason(status, hasHoldings),
    summary: buildSummary(status, alignmentBand),
    holdings,
    institutionTypes,
  };
};
