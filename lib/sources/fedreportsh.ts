import { fetchAllEconomicIndicators } from "../../src/economic-indicators.js";
import type { EconomicIndicator } from "../../src/economic-indicators.js";

type InternalMap = Record<string, EconomicIndicator>;

export const fetchFedreportshIndicators = async (): Promise<InternalMap> => {
  const indicators = await fetchAllEconomicIndicators().catch(() => []);
  const map: InternalMap = {};
  indicators.forEach((indicator) => {
    if (indicator.symbol) {
      map[indicator.symbol] = indicator;
    }
  });
  return map;
};

export const getIndicatorValue = (
  map: InternalMap,
  symbol: string
): EconomicIndicator | null => {
  return map[symbol] ?? null;
};
