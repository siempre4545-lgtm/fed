import type { CapitalAlignment } from "../capital/score";
import type { RegionType } from "../capital/signals";

export type InstitutionSummary = {
  reasonForInterest: string;
  reasonNotYet: string;
  trigger: string;
  likelyInstitution: string;
};

const stageLabel = (stage: number) => {
  if (stage <= 1) return "정책·제도 정비 단계";
  if (stage === 2) return "공공·준공공 자본 진입 단계";
  if (stage === 3) return "금융기관 담보·평가 구조 형성 단계";
  if (stage === 4) return "REITs/BTR 구조 형성 단계";
  return "민간 자본 대량 편입 단계";
};

export const buildInstitutionSummary = (params: {
  alignment: CapitalAlignment;
  regionType: RegionType;
}): InstitutionSummary => {
  const { alignment, regionType } = params;
  const stage = alignment.stage;
  const regionLabel = regionType === "metro" ? "수도권" : "지방";
  const stageInfo = stageLabel(stage);

  if (stage <= 1) {
    return {
      reasonForInterest: `${regionLabel}에서 정책·제도 정비 신호가 누적되는 구간입니다.`,
      reasonNotYet: "공공·준공공 자본 진입 신호가 충분하지 않습니다.",
      trigger: "고시/지정/예산 확정과 착공 단계의 기정사실 확보",
      likelyInstitution: "공공·준공공 개발 주체(지자체·공기업)",
    };
  }
  if (stage === 2) {
    return {
      reasonForInterest: "공공·준공공 자본 진입 시그널이 확인됩니다.",
      reasonNotYet: "금융기관의 담보·평가 구조 형성 신호가 부족합니다.",
      trigger: "금융기관 참여(PF/신탁/담보 구조) 확정",
      likelyInstitution: "은행/보험 등 금융기관",
    };
  }
  if (stage === 3) {
    return {
      reasonForInterest: "금융기관 담보·평가 구조가 마련되는 단계입니다.",
      reasonNotYet: "REITs/BTR 구조화 신호가 아직 부족합니다.",
      trigger: "REITs/BTR 지정 또는 편입 확정",
      likelyInstitution: "리츠/부동산 펀드 운용사",
    };
  }
  if (stage === 4) {
    return {
      reasonForInterest: "REITs/BTR 구조화가 확인되는 구간입니다.",
      reasonNotYet: "민간 대형 자본 편입 시그널은 제한적입니다.",
      trigger: "대형 민간 컨소시엄 참여 확정",
      likelyInstitution: "대형 건설사·민간 컨소시엄",
    };
  }
  return {
    reasonForInterest: `${stageInfo}로 진입했으며 민간 자본 편입 가능성이 높습니다.`,
    reasonNotYet: "규모화 단계에서 행정·제도 리스크 모니터링이 필요합니다.",
    trigger: "민간 투자 확대와 실질 운영 성과의 누적",
    likelyInstitution: "민간 자본 주도 컨소시엄",
  };
};
