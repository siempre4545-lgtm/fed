import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/market/sources/stooq", () => ({
  fetchStooqQuote: vi.fn(),
}));
vi.mock("@/lib/market/sources/fx", () => ({
  fetchUsdKrw: vi.fn(),
}));
vi.mock("@/lib/sources/finra-margin-debt", () => ({
  fetchFinraMarginDebt: vi.fn(),
}));
vi.mock("@/lib/sources/fedreportsh", () => ({
  fetchFedreportshIndicators: vi.fn(),
}));

import { getMarketPrices } from "@/lib/market/getPrices";
import { fetchStooqQuote } from "@/lib/market/sources/stooq";
import { fetchUsdKrw } from "@/lib/market/sources/fx";
import { fetchFinraMarginDebt } from "@/lib/sources/finra-margin-debt";
import { fetchFedreportshIndicators } from "@/lib/sources/fedreportsh";

describe("getMarketPrices", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("부분 성공/실패를 유지하고 last-good를 사용한다", async () => {
    const mockedFetchFedreportshIndicators = vi.mocked(fetchFedreportshIndicators);
    const mockedFetchFinraMarginDebt = vi.mocked(fetchFinraMarginDebt);
    const mockedFetchUsdKrw = vi.mocked(fetchUsdKrw);
    const mockedFetchStooqQuote = vi.mocked(fetchStooqQuote);

    mockedFetchFedreportshIndicators.mockResolvedValue({
      DXY: {
        symbol: "DXY",
        value: 103.5,
        changePercent: -0.2,
        lastUpdated: "2026-01-01",
      } as any,
      M2SL: {
        symbol: "M2SL",
        value: 21000,
        changePercent: 0.1,
        lastUpdated: "2026-01-01",
      } as any,
    });
    mockedFetchFinraMarginDebt.mockResolvedValue({
      value: 500000,
      asOf: "2026-01-01",
      sourceUrl: "finra",
    });
    mockedFetchUsdKrw.mockResolvedValue({ rate: 1300, asOf: "2026-01-01", source: "fx" });
    mockedFetchStooqQuote.mockImplementation(async (symbol: string) => {
      if (symbol === "gld.us") {
        return {
          symbol,
          date: "2026-01-01",
          time: "22:00:00",
          open: 180,
          high: 181,
          low: 179,
          close: 180.5,
          volume: 1234,
        };
      }
      throw new Error("stooq status 403");
    });

    const keys = ["GLD", "DXY", "USDKRW", "M2", "MARGIN_DEBT"];
    const first = await getMarketPrices(keys, "2026-01-01");
    const gldFirst = first.items.find((item) => item.key === "GLD");
    expect(gldFirst?.ok).toBe(true);

    mockedFetchStooqQuote.mockImplementation(async () => {
      throw new Error("stooq status 403");
    });
    const second = await getMarketPrices(keys, "2026-01-02");
    const gldSecond = second.items.find((item) => item.key === "GLD");
    expect(gldSecond?.ok).toBe(true);
    expect(gldSecond && "usedLastGood" in gldSecond ? gldSecond.usedLastGood : false).toBe(true);
  });
});
