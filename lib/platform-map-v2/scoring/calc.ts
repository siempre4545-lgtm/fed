import type { AxisKey } from "../types";

export type ArticleScoreInput = {
  axis: AxisKey;
  reliability: "A" | "B" | "C";
};

export type AxisScoreCalc = {
  score: number;
  articleCount: number;
  weightedTotal: number;
};

const BASE_SCORE = 1.5;
const MAX_AXIS_SCORE = 10;

const RELIABILITY_WEIGHT: Record<ArticleScoreInput["reliability"], number> = {
  A: 1.5,
  B: 1.2,
  C: 1.0,
};

export const calcAxisScore = (articles: ArticleScoreInput[]): AxisScoreCalc => {
  let total = 0;
  articles.forEach((article, index) => {
    const base = index < 5 ? BASE_SCORE : 0.5;
    const weight = RELIABILITY_WEIGHT[article.reliability] ?? 1.0;
    total += base * weight;
  });
  const score = Math.min(MAX_AXIS_SCORE, Math.round(total * 10) / 10);
  return { score, articleCount: articles.length, weightedTotal: total };
};

export const calcAxisScores = (
  axisMap: Record<AxisKey, ArticleScoreInput[]>,
): Record<AxisKey, AxisScoreCalc> => {
  return (Object.keys(axisMap) as AxisKey[]).reduce(
    (acc, axis) => ({
      ...acc,
      [axis]: calcAxisScore(axisMap[axis] ?? []),
    }),
    {} as Record<AxisKey, AxisScoreCalc>,
  );
};
