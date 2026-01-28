import {
  AXIS_DEFINITIONS,
  type AxisKey,
  type AxisScore,
  type PlatformMapRating,
  type ScoreComponent,
  type ScoreStatus,
} from "../types";
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

export const buildStructuralAxis = (entry?: FactLayerEntry) => {
  const axisMap = {} as Record<AxisKey, number>;
  AXIS_DEFINITIONS.forEach((axis) => {
    axisMap[axis.key] = clamp(entry?.axisFloors?.[axis.key] ?? 0, 0, 10);
  });
  return axisMap;
};

export const sumAxisValues = (axisMap: Partial<Record<AxisKey, number>>) =>
  AXIS_DEFINITIONS.reduce((sum, axis) => sum + (axisMap[axis.key] ?? 0), 0);

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

const buildEstimatedHoldingsAxis = (score: number) => {
  const capped = clamp(score, 0, 10);
  return {
    financialization: clamp(capped * 0.45, 0, 4),
    institutional_bid: clamp(capped * 0.35, 0, 3.5),
    governance: clamp(capped * 0.2, 0, 2),
  } as Partial<Record<AxisKey, number>>;
};

const toStatus = (value: ScoreStatus) => value;

export const composeRatingScores = (params: {
  rating: PlatformMapRating;
  factEntry?: FactLayerEntry;
  holdings: CapitalHoldingMatch[];
  rssObserved?: boolean;
  holdingsEstimated?: boolean;
  rssWeight?: number;
}): {
  axisScores: AxisScore[];
  totalScore: number;
  composition: ScoreComposition;
  components: { structural: ScoreComponent; holdings: ScoreComponent; rss: ScoreComponent };
} => {
  const { rating, factEntry, holdings, rssWeight = 0.35 } = params;
  const rssObserved = params.rssObserved ?? false;
  const holdingsEstimated = params.holdingsEstimated ?? false;
  const structuralAxis = buildStructuralAxis(factEntry);
  const structuralTotal = Math.round(sumAxisValues(structuralAxis) * 10) / 10;
  const structuralStatus: ScoreStatus = factEntry ? "confirmed" : "estimated";

  let holdingsAxis: Partial<Record<AxisKey, number>> = {};
  let holdingsStatus: ScoreStatus = "not_observed";
  let holdingsTotal: number | null = null;
  if (holdings.length > 0) {
    holdingsAxis = buildHoldingsAxis(holdings);
    holdingsTotal = Math.round(sumAxisValues(holdingsAxis) * 10) / 10;
    holdingsStatus = toStatus("confirmed");
  } else if (holdingsEstimated) {
    holdingsTotal = Math.round(clamp(structuralTotal * 0.35, 0, 10) * 10) / 10;
    holdingsAxis = buildEstimatedHoldingsAxis(holdingsTotal);
    holdingsStatus = holdingsTotal > 0 ? toStatus("estimated") : toStatus("not_observed");
  }

  let rssAxis: Partial<Record<AxisKey, number>> = {};
  let rssStatus: ScoreStatus = "not_observed";
  let rssTotal: number | null = null;
  if (rssObserved) {
    rssStatus = toStatus("confirmed");
    AXIS_DEFINITIONS.forEach((axis) => {
      const raw = clamp(rating.axisScores.find((item) => item.key === axis.key)?.score ?? 0, 0, 10);
      rssAxis[axis.key] = clamp(raw * rssWeight, 0, 10);
    });
    rssTotal = Math.round(sumAxisValues(rssAxis) * 10) / 10;
  }

  const axisBreakdown = {} as Record<AxisKey, AxisScoreComponent>;
  const axisScores: AxisScore[] = AXIS_DEFINITIONS.map((axis) => {
    const structural = structuralAxis[axis.key] ?? 0;
    const holdingsScore = holdingsAxis[axis.key] ?? 0;
    const rssScore = rssStatus === "confirmed" ? (rssAxis[axis.key] ?? 0) : 0;
    const total = clamp(structural + holdingsScore + rssScore, 0, 10);
    axisBreakdown[axis.key] = {
      structural: Math.round(structural * 10) / 10,
      holdings: Math.round(holdingsScore * 10) / 10,
      rss: Math.round(rssScore * 10) / 10,
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
        structural: structuralTotal,
        holdings: holdingsTotal ?? 0,
        rss: rssTotal ?? 0,
        total: totalScore,
      },
    },
    components: {
      structural: { score: structuralTotal, status: structuralStatus },
      holdings: { score: holdingsTotal, status: holdingsStatus },
      rss: { score: rssTotal, status: rssStatus },
    },
  };
};
