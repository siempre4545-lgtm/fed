import { AXIS_DEFINITIONS, type AxisKey, type AxisScore, type PlatformMapRating } from "../types";
import type { FactLayerEntry } from "../facts";
import type { CapitalHoldingMatch, CapitalHoldingConfidence, CapitalHoldingEntityType } from "../types";

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

type AxisScoreComponent = {
  structural: number;
  holdings: number;
  rss: number;
  total: number;
};

export type ScoreComposition = {
  axis: Record<AxisKey, AxisScoreComponent>;
  totals: { structural: number; holdings: number; rss: number; total: number };
};

const CONF_WEIGHT: Record<CapitalHoldingConfidence, number> = {
  HIGH: 1,
  MEDIUM: 0.7,
  LOW: 0.4,
};

const TYPE_WEIGHT: Record<CapitalHoldingEntityType, number> = {
  financial_holding: 1.4,
  reit: 1.2,
  public_reit: 1.1,
  btr_reit: 1.1,
  pension: 1.0,
  fund: 0.8,
};

const STATUS_WEIGHT: Record<NonNullable<CapitalHoldingMatch["status"]>, number> = {
  보유: 1,
  확대: 1.2,
  정리: 0.4,
};

const buildStructuralAxis = (entry?: FactLayerEntry) => {
  const axisMap = {} as Record<AxisKey, number>;
  AXIS_DEFINITIONS.forEach((axis) => {
    axisMap[axis.key] = clamp(entry?.axisFloors?.[axis.key] ?? 0, 0, 10);
  });
  return axisMap;
};

const buildHoldingsAxis = (holdings: CapitalHoldingMatch[]) => {
  const base = holdings.reduce((sum, item) => {
    const confidence = CONF_WEIGHT[item.confidence] ?? 0.4;
    const typeWeight = TYPE_WEIGHT[item.type] ?? 0.8;
    const statusWeight = item.status ? STATUS_WEIGHT[item.status] ?? 1 : 1;
    return sum + confidence * typeWeight * statusWeight;
  }, 0);
  const score = clamp(base, 0, 10);
  return {
    institutional_bid: clamp(score * 0.4, 0, 4),
    financialization: clamp(score * 0.45, 0, 4),
    governance: clamp(score * 0.15, 0, 2),
  } as Partial<Record<AxisKey, number>>;
};

export const composeRatingScores = (params: {
  rating: PlatformMapRating;
  factEntry?: FactLayerEntry;
  holdings: CapitalHoldingMatch[];
  rssWeight?: number;
}): { axisScores: AxisScore[]; totalScore: number; composition: ScoreComposition } => {
  const { rating, factEntry, holdings, rssWeight = 0.35 } = params;
  const structuralAxis = buildStructuralAxis(factEntry);
  const holdingsAxis = buildHoldingsAxis(holdings);
  const axisBreakdown = {} as Record<AxisKey, AxisScoreComponent>;
  let structuralTotal = 0;
  let holdingsTotal = 0;
  let rssTotal = 0;

  const axisScores: AxisScore[] = AXIS_DEFINITIONS.map((axis) => {
    const rss = clamp(rating.axisScores.find((item) => item.key === axis.key)?.score ?? 0, 0, 10);
    const structural = structuralAxis[axis.key] ?? 0;
    const holdingsScore = holdingsAxis[axis.key] ?? 0;
    const weightedRss = clamp(rss * rssWeight, 0, 10);
    const total = clamp(structural + holdingsScore + weightedRss, 0, 10);
    structuralTotal += structural;
    holdingsTotal += holdingsScore;
    rssTotal += weightedRss;
    axisBreakdown[axis.key] = {
      structural: Math.round(structural * 10) / 10,
      holdings: Math.round(holdingsScore * 10) / 10,
      rss: Math.round(weightedRss * 10) / 10,
      total: Math.round(total * 10) / 10,
    };
    return {
      key: axis.key,
      label: axis.label,
      score: Math.round(total * 10) / 10,
    };
  });

  const totalScore = Math.round(axisScores.reduce((sum, axis) => sum + axis.score, 0) * 10) / 10;
  return {
    axisScores,
    totalScore,
    composition: {
      axis: axisBreakdown,
      totals: {
        structural: Math.round(structuralTotal * 10) / 10,
        holdings: Math.round(holdingsTotal * 10) / 10,
        rss: Math.round(rssTotal * 10) / 10,
        total: totalScore,
      },
    },
  };
};
