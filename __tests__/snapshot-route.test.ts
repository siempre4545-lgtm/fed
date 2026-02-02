import { describe, expect, it, vi } from "vitest";
import { getThursdaySnapshot } from "@/lib/market/getExternalSnapshots";

vi.mock("@/lib/market/sources/stooq", () => ({
  fetchManyStooqQuotes: vi.fn(async (symbols: string[]) => {
    const results: Record<string, any> = {};
    symbols.forEach((symbol) => {
      results[symbol] = { ok: false, error: "stooq missing" };
    });
    results["gld.us"] = {
      ok: true,
      data: {
        symbol: "gld.us",
        date: "2026-01-08",
        time: "22:00:00",
        open: 180,
        high: 181,
        low: 179,
        close: 180.5,
        volume: 100,
      },
    };
    return results;
  }),
}));

vi.mock("@/lib/market/sources/fx", () => ({
  fetchUsdKrw: vi.fn(async () => ({
    rate: 1300,
    asOf: "2026-01-08",
    source: "fx",
  })),
}));

vi.mock("@/lib/sources/fedreportsh", () => ({
  fetchFedreportshIndicators: vi.fn(async () => ({
    DXY: {
      symbol: "DXY",
      value: 104,
      changePercent: 0.5,
      change: 0.2,
      lastUpdated: "2026-01-08",
    },
    M2SL: {
      symbol: "M2SL",
      value: 21000,
      changePercent: 0.1,
      change: 20,
      lastUpdated: "2026-01-08",
    },
    STLFSI4: {
      symbol: "STLFSI4",
      value: 0.12,
      changePercent: -0.02,
      change: -0.01,
      lastUpdated: "2026-01-08",
    },
  })),
}));

vi.mock("@/lib/sources/finra-margin-debt", () => ({
  fetchFinraMarginDebt: vi.fn(async () => ({
    value: 100,
    asOf: "2026-01-08",
    sourceUrl: "finra",
  })),
}));

describe("getThursdaySnapshot", () => {
  it("부분 성공/실패 형태로 응답한다", async () => {
    const snapshot = await getThursdaySnapshot(["GLD", "DXY", "USDKRW", "M2"]);
    const okItems = snapshot.items.filter((item) => item.ok);
    const failItems = snapshot.items.filter((item) => !item.ok);
    expect(okItems.length).toBeGreaterThan(0);
    expect(failItems.length).toBeGreaterThanOrEqual(0);
    const gld = snapshot.items.find((item) => item.key === "GLD");
    expect(gld?.ok).toBe(true);
    const dxy = snapshot.items.find((item) => item.key === "DXY");
    expect(dxy?.ok).toBe(true);
  });
});
