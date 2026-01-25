import type { BucketKey, PriceMap, QuarterKey, QuarterSeries, SectorDefinition } from "./types";

const QUARTERS: QuarterKey[] = ["Q1", "Q2", "Q3"];

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const average = (values: Array<number | null | undefined>): number | null => {
  const filtered = values.filter(isFiniteNumber);
  if (!filtered.length) return null;
  const sum = filtered.reduce((total, value) => total + value, 0);
  return Number((sum / filtered.length).toFixed(2));
};

const averageSeriesList = (seriesList: QuarterSeries[]): QuarterSeries => ({
  Q1: average(seriesList.map((series) => series.Q1)),
  Q2: average(seriesList.map((series) => series.Q2)),
  Q3: average(seriesList.map((series) => series.Q3)),
});

const getQuarterValue = (priceMap: PriceMap, key: string, quarter: QuarterKey) => {
  const entry = priceMap[key];
  if (!entry || !entry.ok) return null;
  return entry.quarters?.[quarter] ?? null;
};

const seriesFromKeys = (priceMap: PriceMap, keys: string[]): QuarterSeries => ({
  Q1: average(keys.map((key) => getQuarterValue(priceMap, key, "Q1"))),
  Q2: average(keys.map((key) => getQuarterValue(priceMap, key, "Q2"))),
  Q3: average(keys.map((key) => getQuarterValue(priceMap, key, "Q3"))),
});

export const buildSectorDefinitions = (
  base: SectorDefinition[],
  tickers: string[]
): SectorDefinition[] => {
  const known = new Set(base.flatMap((sector) => sector.tickers));
  const merged = [...base];

  tickers.forEach((ticker) => {
    if (known.has(ticker)) return;
    known.add(ticker);
    merged.push({ name: `신규-${ticker}`, tickers: [ticker] });
  });

  return merged;
};

export const computeSectorAverages = (
  priceMap: PriceMap,
  sectors: SectorDefinition[]
): Record<string, QuarterSeries> => {
  return Object.fromEntries(
    sectors.map((sector) => [sector.name, seriesFromKeys(priceMap, sector.tickers)])
  );
};

export const computeBucketAverages = (
  priceMap: PriceMap,
  sectorSeries: Record<string, QuarterSeries>,
  buckets: { safeKeys: string[]; hedgeKeys: string[] }
): Record<BucketKey, QuarterSeries> => {
  // 안전/헷징은 티커 평균, 위험자산은 섹터 평균 기반으로 계산
  const safe = seriesFromKeys(priceMap, buckets.safeKeys);
  const hedge = seriesFromKeys(priceMap, buckets.hedgeKeys);
  const risk = averageSeriesList(Object.values(sectorSeries));

  return { safe, risk, hedge };
};

export const computeIndicatorSeries = (
  priceMap: PriceMap,
  keys: string[]
): Record<string, QuarterSeries> => {
  return Object.fromEntries(keys.map((key) => [key, seriesFromKeys(priceMap, [key])]));
};

export const collectSeriesErrors = (priceMap: PriceMap, keys: string[]) =>
  keys
    .map((key) => ({ key, entry: priceMap[key] }))
    .filter(({ entry }) => entry && !entry.ok)
    .map(({ key, entry }) => ({
      key,
      error: entry?.error || "데이터 없음",
    }));
