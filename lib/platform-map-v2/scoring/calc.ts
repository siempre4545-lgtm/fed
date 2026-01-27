import type { AxisKey } from "../types";

export type ArticleScoreInput = {
  axis: AxisKey;
  confidence: number;
  weight: number;
  sourceType?: "fact" | "public" | "local" | "media";
  title?: string;
  url?: string;
  publishedAt?: string;
  dedupKey?: string;
};

export type AxisScoreCalc = {
  score: number;
  articleCount: number;
  itemsUsed: ArticleScoreInput[];
};

const MAX_AXIS_SCORE = 10;
const MAX_ITEMS = 3;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const toAxisScore = (input: ArticleScoreInput) => {
  const confidence = clamp(input.confidence ?? 0, 0, 1);
  const weight = clamp(input.weight ?? 0, 0, 1);
  return clamp(Math.round(10 * confidence * weight), 0, 10);
};

export const calcAxisScore = (articles: ArticleScoreInput[]): AxisScoreCalc => {
  const scored = articles
    .map((item) => ({ item, score: toAxisScore(item) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_ITEMS);
  const combined = 1 - scored.reduce((product, entry) => product * (1 - entry.score / 10), 1);
  const score = clamp(Math.round(combined * 10 * 10) / 10, 0, MAX_AXIS_SCORE);
  return { score, articleCount: articles.length, itemsUsed: scored.map((entry) => entry.item) };
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
