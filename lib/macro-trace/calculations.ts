import type { PriceMap, QuarterKey, QuarterSeries, SectorDefinition } from "./types";

const QUARTERS: QuarterKey[] = ["Q1", "Q2", "Q3"];

export const computeQuarterSeries = (changePct: number | null): QuarterSeries => ({
  Q1: changePct ?? null,
  Q2: changePct ?? null,
  Q3: changePct ?? null,
});

export const average = (values: Array<number | null | undefined>): number | null => {
  const filtered = values.filter((value): value is number => Number.isFinite(value));
  if (!filtered.length) return null;
  return Number((filtered.reduce((sum, value) => sum + value, 0) / filtered.length).toFixed(2));
};

export const computeTickerSeries = (
  priceMap: PriceMap,
  tickers: string[]
): Record<string, QuarterSeries> => {
  return tickers.reduce<Record<string, QuarterSeries>>((acc, ticker) => {
    const entry = priceMap[ticker];
    const changePct = entry && entry.ok ? entry.changePct : null;
    acc[ticker] = computeQuarterSeries(changePct ?? null);
    return acc;
  }, {});
};

export const computeSectorSeries = (
  priceMap: PriceMap,
  sectors: SectorDefinition[]
): Record<string, QuarterSeries> => {
  return sectors.reduce<Record<string, QuarterSeries>>((acc, sector) => {
    const tickerSeries = computeTickerSeries(priceMap, sector.tickers);
    const series = QUARTERS.reduce<QuarterSeries>((bucket, quarter) => {
      const values = sector.tickers.map((ticker) => tickerSeries[ticker]?.[quarter] ?? null);
      bucket[quarter] = average(values);
      return bucket;
    }, { Q1: null, Q2: null, Q3: null });
    acc[sector.name] = series;
    return acc;
  }, {});
};

export const computeBucketSeries = (
  priceMap: PriceMap,
  bucketTickers: Record<string, string[]>,
  sectorSeries: Record<string, QuarterSeries>
): Record<string, QuarterSeries> => {
  const result: Record<string, QuarterSeries> = {};
  Object.entries(bucketTickers).forEach(([bucket, tickers]) => {
    if (bucket === "risk") {
      const sectors = Object.values(sectorSeries);
      result[bucket] = QUARTERS.reduce<QuarterSeries>((acc, quarter) => {
        acc[quarter] = average(sectors.map((series) => series[quarter] ?? null));
        return acc;
      }, { Q1: null, Q2: null, Q3: null });
      return;
    }
    const tickerSeries = computeTickerSeries(priceMap, tickers);
    result[bucket] = QUARTERS.reduce<QuarterSeries>((acc, quarter) => {
      acc[quarter] = average(tickers.map((ticker) => tickerSeries[ticker]?.[quarter] ?? null));
      return acc;
    }, { Q1: null, Q2: null, Q3: null });
  });
  return result;
};

export const collectErrors = (priceMap: PriceMap) =>
  Object.entries(priceMap)
    .filter(([, entry]) => !entry.ok)
    .map(([key, entry]) => ({ key, error: entry.error }));
