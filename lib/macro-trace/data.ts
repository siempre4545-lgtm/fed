import type { PriceEntry, PriceMap, QuarterSeries } from "./types";

type PricePayload =
  | {
      ok: true;
      price: number;
      prevClose: number | null;
      changePct: number | null;
      quarters?: QuarterSeries;
      source?: string;
      ts?: string;
      usedLastGood?: boolean;
    }
  | {
      ok: false;
      error: string;
      source?: string;
    };

export type PricesResponse = {
  ok: boolean;
  asOf?: string;
  prices: Record<string, PricePayload>;
  fx?: Record<string, unknown>;
  meta?: { warnings?: string[]; sourcesUsed?: string[]; cache?: string };
  error?: string;
};

export const fetchPrices = async (keys: string[], date: string) => {
  const params = new URLSearchParams();
  if (keys.length) params.set("symbols", keys.join(","));
  if (date) params.set("date", date);
  params.set("quarters", "1");
  const response = await fetch(`/api/market/prices?${params.toString()}`, {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`API 오류 (${response.status})`);
  }
  return (await response.json()) as PricesResponse;
};

export const toPriceMap = (payload: PricesResponse | null): PriceMap => {
  if (!payload?.prices) return {};
  return Object.fromEntries(
    Object.entries(payload.prices).map(([key, entry]) => {
      if (!entry || !("ok" in entry)) {
        return [key, { ok: false, error: "데이터 없음" } satisfies PriceEntry];
      }
      if (entry.ok) {
        return [
          key,
          {
            ok: true,
            price: entry.price,
            changePct: entry.changePct ?? null,
            quarters: entry.quarters,
            source: entry.source,
          },
        ];
      }
      return [key, { ok: false, error: entry.error, source: entry.source }];
    })
  );
};
