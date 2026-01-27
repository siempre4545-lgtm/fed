import { AXIS_DEFINITIONS } from "../types";
import type { AxisKey, PisStatus, PlatformMapRating } from "../types";
import type { HistoryEntry } from "../history/types";

const PIS_AXES: AxisKey[] = [
  "data_infra",
  "institutional_bid",
  "financialization",
  "jobs_industry",
  "governance",
  "masterplan",
];

const PIS_WEIGHTS: Record<AxisKey, number> = {
  data_infra: 1.2,
  residency_mobility: 0.6,
  institutional_bid: 1.3,
  financialization: 1.2,
  city_services: 0.6,
  subscription_profit: 0.6,
  jobs_industry: 1.1,
  digital_payment_cbdc: 0.6,
  network_infra: 0.6,
  governance: 1.1,
  skilled_inflow: 0.6,
  masterplan: 1.2,
};

const buildWeeklyBuckets = (entries: HistoryEntry[]) => {
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const slice = sorted.slice(Math.max(0, sorted.length - 28));
  const buckets: HistoryEntry[][] = [[], [], [], []];
  slice.forEach((entry, index) => {
    const weekIndex = Math.min(3, Math.floor(index / 7));
    buckets[weekIndex].push(entry);
  });
  return buckets.filter((bucket) => bucket.length > 0);
};

const average = (values: number[]) =>
  values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;

const computeAxisTrend = (buckets: HistoryEntry[][], axis: AxisKey) => {
  if (buckets.length < 2) return { delta: 0, continuity: 0 };
  const weekAverages = buckets.map((bucket) => average(bucket.map((entry) => entry.axes[axis] ?? 0)));
  const deltas = weekAverages.slice(1).map((value, index) => value - weekAverages[index]);
  const continuity = deltas.filter((value) => value > 0).length;
  const delta = average(deltas);
  return { delta, continuity };
};

export type PisResult = {
  score: number;
  status: PisStatus;
  delta: number;
};

const buildPisStatus = (score: number): PisStatus => {
  if (score >= 6) return "기관 선행 구간";
  if (score >= 3) return "관찰 필요";
  return "정체";
};

export const computePisForRegion = (entries: HistoryEntry[]): PisResult => {
  const buckets = buildWeeklyBuckets(entries);
  if (buckets.length < 2) {
    return { score: 0, status: "정체", delta: 0 };
  }

  let raw = 0;
  let deltaSum = 0;
  PIS_AXES.forEach((axis) => {
    const { delta, continuity } = computeAxisTrend(buckets, axis);
    const weight = PIS_WEIGHTS[axis] ?? 1;
    const continuityBoost = 1 + continuity * 0.15;
    raw += delta * weight * continuityBoost;
    deltaSum += delta;
  });

  const score = Math.max(0, Math.min(100, Math.round(raw * 10)));
  return { score, status: buildPisStatus(score), delta: Math.round(deltaSum * 100) / 100 };
};

export const computePisMap = (
  historyBySigungu: Record<string, HistoryEntry[]>,
  ratings: PlatformMapRating[],
) => {
  const map: Record<string, PisResult> = {};
  ratings.forEach((rating) => {
    const entries = historyBySigungu[rating.name] ?? [];
    map[rating.sigunguKey] = computePisForRegion(entries);
  });
  return map;
};

export const computeScoreDeltaMap = (historyBySigungu: Record<string, HistoryEntry[]>) => {
  const map: Record<string, number> = {};
  Object.entries(historyBySigungu).forEach(([sigungu, entries]) => {
    const buckets = buildWeeklyBuckets(entries);
    if (buckets.length < 2) {
      map[sigungu] = 0;
      return;
    }
    const weekAverages = buckets.map((bucket) => average(bucket.map((entry) => entry.totalScore)));
    const deltas = weekAverages.slice(1).map((value, index) => value - weekAverages[index]);
    map[sigungu] = Math.round(average(deltas) * 100) / 100;
  });
  return map;
};

export const getPisAxesSummary = () =>
  PIS_AXES.map((axisKey) => AXIS_DEFINITIONS.find((axis) => axis.key === axisKey)?.label).filter(
    Boolean,
  );
