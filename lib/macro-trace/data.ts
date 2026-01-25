import type { PriceMap, QuarterSeries, SectorDefinition } from "./types";
import {
  collectErrors,
  computeBucketSeries,
  computeQuarterSeries,
  computeSectorSeries,
} from "./calculations";

export type PricesResponse = {
  ok: boolean;
  prices?: Record<
    string,
    | {
        ok: true;
        price: number;
        prevClose?: number | null;
        changePct: number | null;
        quarters?: QuarterSeries;
        source?: string;
      }
    | { ok: false; error: string; source?: string }
  >;
  meta?: { warnings?: string[] };
};

export const fetchPrices = async (keys: string[], date: string): Promise<PricesResponse> => {
  const query = new URLSearchParams();
  if (keys.length) query.set("keys", keys.join(","));
  if (date) query.set("date", date);
  const response = await fetch(`/api/market/prices?${query.toString()}`);
  const bodyText = await response.text();
  const contentType = response.headers.get("content-type") || "";
  if (!response.ok) {
    throw new Error(`API 오류 (${response.status})`);
  }
  if (!contentType.includes("application/json")) {
    throw new Error("데이터 응답 형식이 올바르지 않습니다.");
  }
  return JSON.parse(bodyText) as PricesResponse;
};

export const toPriceMap = (data: PricesResponse | null): PriceMap => {
  if (!data?.prices) return {};
  return Object.entries(data.prices).reduce<PriceMap>((acc, [key, entry]) => {
    if (entry.ok) {
      const changePct =
        entry.changePct ??
        (entry.prevClose && entry.prevClose !== 0
          ? Number((((entry.price - entry.prevClose) / entry.prevClose) * 100).toFixed(2))
          : null);
      acc[key] = {
        ok: true,
        price: entry.price,
        changePct,
        quarters: entry.quarters,
        source: entry.source,
      };
    } else {
      acc[key] = {
        ok: false,
        error: entry.error || "fetch failed",
        source: entry.source,
      };
    }
    return acc;
  }, {});
};

export const computeSectorAverages = (priceMap: PriceMap, sectors: SectorDefinition[]) =>
  computeSectorSeries(priceMap, sectors);

export const computeBucketAverages = (
  priceMap: PriceMap,
  bucketTickers: Record<string, string[]>,
  sectorSeries: Record<string, QuarterSeries>
) => computeBucketSeries(priceMap, bucketTickers, sectorSeries);

export const collectPriceErrors = (priceMap: PriceMap) => collectErrors(priceMap);

export { computeQuarterSeries };
