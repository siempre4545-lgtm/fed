import type { MarketProvider } from "./types.js";
import { createTwelveDataProvider } from "./twelvedata.js";

export const getMarketProvider = (): MarketProvider | null => {
  const raw = process.env.MARKET_PROVIDER || process.env.PROVIDERX || "";
  const providerName = raw.toLowerCase();
  if (providerName === "twelvedata" || providerName === "providerx") {
    return createTwelveDataProvider();
  }
  return null;
};
