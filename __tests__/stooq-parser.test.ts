import { describe, expect, it } from "vitest";
import { parseStooqCsv } from "@/lib/market/sources/stooq";

describe("parseStooqCsv", () => {
  it("정상 CSV를 파싱한다", () => {
    const csv = [
      "Symbol,Date,Time,Open,High,Low,Close,Volume",
      "gld.us,2026-01-08,22:00:00,180.10,181.00,179.00,180.50,123456",
    ].join("\n");
    const parsed = parseStooqCsv(csv);
    expect(parsed.symbol).toBe("gld.us");
    expect(parsed.close).toBe(180.5);
    expect(parsed.open).toBe(180.1);
  });

  it("close가 N/A면 실패한다", () => {
    const csv =
      "Symbol,Date,Time,Open,High,Low,Close,Volume\nrklb.us,2026-01-08,17:00:00,10.0,11.0,9.5,N/A,0";
    expect(() => parseStooqCsv(csv)).toThrow();
  });
});
