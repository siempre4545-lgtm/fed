import type {
  PlatformMapRating,
  PlatformMapReport,
  PlatformMapReportPeriod,
  PlatformMapReportRegion,
  CapitalComparison,
} from "../types";
import type { CapitalAlignment } from "../capital/score";
import { loadHistoryByDate } from "../history/store";
import { buildCapitalComparison } from "../capital/compare";
import { getRegionType } from "../capital/signals";

const buildDateKey = (offsetDays = 0) => {
  const date = new Date(Date.now() - offsetDays * 24 * 60 * 60 * 1000);
  return date.toISOString().slice(0, 10);
};

const getPeriodOffset = (period: PlatformMapReportPeriod) => {
  if (period === "weekly") return 7;
  if (period === "monthly") return 30;
  return 7;
};

const buildRegionRow = (
  rating: PlatformMapRating,
  comparison: CapitalComparison,
  delta?: number | null,
): PlatformMapReportRegion => ({
  sigungu: rating.name,
  totalScore: rating.totalScore,
  capitalAlignmentScore: rating.capitalAlignmentScore,
  status: comparison.status,
  delta,
});

const average = (values: number[]) =>
  values.length === 0 ? 0 : Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;

export const generateCapitalReport = async (params: {
  ratings: PlatformMapRating[];
  capitalMap: Record<string, CapitalAlignment>;
  holdingsMap: Record<string, CapitalComparison["holdings"]>;
  period: PlatformMapReportPeriod;
}): Promise<PlatformMapReport> => {
  const { ratings, capitalMap, holdingsMap, period } = params;
  const reportId = `pmv2-${Date.now()}`;
  const warnings: string[] = [];
  const periodOffset = getPeriodOffset(period);

  const currentKey = buildDateKey(0);
  const previousKey = buildDateKey(periodOffset);
  const currentSnapshot = await loadHistoryByDate(currentKey);
  const previousSnapshot = await loadHistoryByDate(previousKey);

  if (!currentSnapshot || !previousSnapshot) {
    warnings.push("스냅샷 데이터가 부족해 점수 변화 계산이 제한됩니다.");
  }

  const deltaMap: Record<string, number | null> = {};
  if (currentSnapshot && previousSnapshot) {
    currentSnapshot.forEach((entry) => {
      const prev = previousSnapshot.find((item) => item.sigungu === entry.sigungu);
      deltaMap[entry.sigungu] = prev ? Math.round((entry.totalScore - prev.totalScore) * 10) / 10 : null;
    });
  }

  const comparisonByKey: Record<string, CapitalComparison> = {};
  ratings.forEach((rating) => {
    const comparison = buildCapitalComparison({
      rating,
      alignment: capitalMap[rating.sigunguKey] ?? null,
      holdings: holdingsMap[rating.sigunguKey] ?? [],
    });
    comparisonByKey[rating.sigunguKey] = comparison;
  });

  const rows = ratings.map((rating) => {
    const comparison = comparisonByKey[rating.sigunguKey];
    const delta = deltaMap[rating.name] ?? null;
    return buildRegionRow(rating, comparison, delta);
  });

  const hasDelta = rows.some((item) => typeof item.delta === "number");
  const sortedByDelta = [...rows].sort((a, b) => (b.delta ?? -999) - (a.delta ?? -999));
  const sortedByScore = [...rows].sort((a, b) => b.totalScore - a.totalScore);

  const top = (hasDelta ? sortedByDelta : sortedByScore).slice(0, 5);
  const bottom = (hasDelta ? [...sortedByDelta].reverse() : [...sortedByScore].reverse()).slice(0, 5);

  const aligned = rows.filter((row) => row.status === "정합").slice(0, 6);
  const leading = rows.filter((row) => row.status === "선행").slice(0, 6);
  const lagging = rows.filter((row) => row.status === "후행").slice(0, 6);
  const mismatch = rows.filter((row) => row.status === "불일치").slice(0, 6);

  const metroCount = ratings.filter((rating) => getRegionType(rating.name, rating.sigunguKey) === "metro").length;
  const metroShare = ratings.length === 0 ? 0 : Math.round((metroCount / ratings.length) * 100);
  const avgAlignment = average(ratings.map((rating) => rating.capitalAlignmentScore));

  const summary = [
    `정합 ${aligned.length} · 선행 ${leading.length} · 후행 ${lagging.length} · 불일치 ${mismatch.length}`,
    `수도권 비중 ${metroShare}% · 평균 자본 일치도 ${avgAlignment}`,
    period === "monthly" ? "월간 누적 변화 기준으로 신호를 비교했습니다." : "주간 스냅샷 기준으로 신호를 비교했습니다.",
  ];

  const institutionView = {
    reasons: [
      "정책·제도 확정 이후 공공·준공공 자본 신호가 이어지는 지역에서 정합도가 높습니다.",
      "금융기관 담보·평가 구조가 확인되는 지역은 점수 반영 속도가 빠른 편입니다.",
    ],
    notYet: [
      "지정·고시 이전 단계는 자본 진입보다 뉴스 노출이 앞설 수 있습니다.",
      "기관 보유가 확인되어도 지역 뉴스 반영이 느린 경우 후행으로 분류됩니다.",
    ],
  };

  const watchPoints = {
    policy: ["지정/고시/예산 확정 여부", "착공 단계 진입 여부"],
    institution: ["금융기관 PF·담보 구조 공개", "리츠/BTR 편입 공시"],
    governance: ["지자체-공기업 협력 구조", "규제 완화·특례 적용"],
  };

  const title =
    period === "monthly"
      ? `${new Date().getFullYear()}년 ${new Date().getMonth() + 1}월 플랫폼 자본 흐름 관찰 리포트`
      : `${new Date().getFullYear()}년 ${new Date().getMonth() + 1}월 주간 플랫폼 자본 흐름 관찰 리포트`;

  return {
    id: reportId,
    title,
    period,
    generatedAt: new Date().toISOString(),
    summary,
    scoreChanges: { top, bottom },
    crossChecks: { aligned, leading, lagging, mismatch },
    institutionView,
    watchPoints,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
};
