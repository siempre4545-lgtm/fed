import { AXIS_DEFINITIONS, type AxisKey, type PlatformMapRating } from "../types";

export type NotAReasonItem = {
  axis: AxisKey;
  label: string;
  message: string;
  articleCount: number;
  aAvgArticleCount: number;
  scoreGap: number;
};

export type NotAReasonResult = {
  cutoffScore: number;
  reasons: NotAReasonItem[];
};

const formatPercent = (value: number) => `${Math.round(value)}%`;

export const buildNotAReasons = (params: {
  target: PlatformMapRating;
  ratings: PlatformMapRating[];
  axisArticleCounts: Record<string, Record<AxisKey, number>>;
}) => {
  const { target, ratings, axisArticleCounts } = params;
  if (!target || target.grade === "A") return null;

  const aRegions = ratings.filter((item) => item.grade === "A");
  if (aRegions.length === 0) return null;

  const cutoffScore = Math.min(...aRegions.map((item) => item.totalScore));
  const targetAxisMap = AXIS_DEFINITIONS.reduce(
    (acc, axis) => ({
      ...acc,
      [axis.key]: target.axisScores.find((item) => item.key === axis.key)?.score ?? 0,
    }),
    {} as Record<AxisKey, number>,
  );

  const aAxisAvg = AXIS_DEFINITIONS.reduce((acc, axis) => {
    const sum = aRegions.reduce((total, region) => {
      const score = region.axisScores.find((item) => item.key === axis.key)?.score ?? 0;
      return total + score;
    }, 0);
    return {
      ...acc,
      [axis.key]: aRegions.length > 0 ? sum / aRegions.length : 0,
    };
  }, {} as Record<AxisKey, number>);

  const aArticleAvg = AXIS_DEFINITIONS.reduce((acc, axis) => {
    const sum = aRegions.reduce((total, region) => {
      const count = axisArticleCounts[region.sigunguKey]?.[axis.key] ?? 0;
      return total + count;
    }, 0);
    return {
      ...acc,
      [axis.key]: aRegions.length > 0 ? sum / aRegions.length : 0,
    };
  }, {} as Record<AxisKey, number>);

  const targetCounts = axisArticleCounts[target.sigunguKey] ?? ({} as Record<AxisKey, number>);

  const candidates = AXIS_DEFINITIONS.map((axis) => {
    const scoreGap = Math.max(0, aAxisAvg[axis.key] - targetAxisMap[axis.key]);
    const articleCount = targetCounts[axis.key] ?? 0;
    const aAvgCount = aArticleAvg[axis.key] ?? 0;
    return {
      axis: axis.key,
      label: axis.label,
      scoreGap,
      articleCount,
      aAvgArticleCount: aAvgCount,
    };
  })
    .sort((a, b) => {
      if (b.scoreGap !== a.scoreGap) return b.scoreGap - a.scoreGap;
      return (b.aAvgArticleCount - b.articleCount) - (a.aAvgArticleCount - a.articleCount);
    })
    .slice(0, 3);

  const reasons: NotAReasonItem[] = candidates.map((item) => {
    let message = "";
    if (item.articleCount === 0) {
      message = `${item.label} 관련 정책 뉴스가 최근 한 달간 확인되지 않았습니다.`;
    } else if (item.aAvgArticleCount > 0 && item.articleCount < item.aAvgArticleCount) {
      const deficit = ((item.aAvgArticleCount - item.articleCount) / item.aAvgArticleCount) * 100;
      message = `${item.label} 관련 기사 수가 A등급 평균 대비 ${formatPercent(deficit)} 부족합니다.`;
    } else if (item.scoreGap > 0) {
      message = `${item.label} 점수가 A등급 평균 대비 ${item.scoreGap.toFixed(1)} 낮습니다.`;
    } else {
      message = `${item.label} 관련 지표가 A등급 평균 대비 약합니다.`;
    }
    return {
      axis: item.axis,
      label: item.label,
      message,
      articleCount: item.articleCount,
      aAvgArticleCount: item.aAvgArticleCount,
      scoreGap: item.scoreGap,
    };
  });

  return { cutoffScore, reasons } satisfies NotAReasonResult;
};
