import type { CapitalSignal, CapitalStage, RegionType } from "./signals";

export type CapitalAlignment = {
  score: number;
  bandLabel: string;
  stage: CapitalStage | 0;
  stageCounts: Record<CapitalStage, number>;
  signalCount: number;
};

const RELIABILITY_WEIGHT: Record<CapitalSignal["reliability"], number> = {
  A: 1.5,
  B: 1.2,
  C: 1.0,
};

const STAGE_BASE: Record<CapitalStage, number> = {
  1: 10,
  2: 15,
  3: 20,
  4: 25,
  5: 30,
};

const bandLabel = (score: number) => {
  if (score <= 30) return "자본 흐름 없음";
  if (score <= 60) return "정책·제도 단계";
  if (score <= 80) return "기관 관찰 구간";
  return "매집 구간 진입";
};

const regionWeight = (stage: CapitalStage, regionType: RegionType) => {
  if (regionType === "metro") {
    if (stage === 1) return 1.3;
    if (stage === 2) return 1.1;
    return 1.0;
  }
  if (stage === 2 || stage === 3) return 1.2;
  return 1.0;
};

export const computeCapitalAlignment = (signals: CapitalSignal[], regionType: RegionType): CapitalAlignment => {
  const stageCounts: Record<CapitalStage, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  signals.forEach((signal) => {
    stageCounts[signal.stage] += 1;
  });

  let total = 0;
  signals.forEach((signal) => {
    const count = stageCounts[signal.stage];
    const base = STAGE_BASE[signal.stage];
    const penalty = count > 5 ? 0.5 : 1;
    const weight = RELIABILITY_WEIGHT[signal.reliability];
    total += base * weight * regionWeight(signal.stage, regionType) * penalty;
  });

  const score = Math.max(0, Math.min(100, Math.round(total)));
  const stage =
    ([5, 4, 3, 2, 1] as CapitalStage[]).find((value) => stageCounts[value] > 0) ?? 0;

  return {
    score,
    bandLabel: bandLabel(score),
    stage,
    stageCounts,
    signalCount: signals.length,
  };
};

export const computeCapitalWarnings = (totalScore: number, alignmentScore: number) => {
  const warnings: string[] = [];
  if (totalScore >= 75 && alignmentScore <= 30) {
    warnings.push("서사 과열 가능성");
  }
  if (totalScore <= 55 && alignmentScore >= 60) {
    warnings.push("저평가 구조 가능성");
  }
  return warnings;
};
