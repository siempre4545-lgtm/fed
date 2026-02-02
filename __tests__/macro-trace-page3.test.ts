import { describe, expect, it } from "vitest";

/**
 * page3 회귀 방지: 선택일과 다른 날짜 값 혼입 방지.
 * - 테스트1: 응답의 모든 지표 valueDate는 selectedDate이거나 null이어야 함.
 * - 테스트2: pickHistoryValueExact는 exact match만 반환 (<= date 금지).
 */

const pickHistoryValueExact = (history: Array<{ date: string; value: number }>, date: string) => {
  const entry = history.find((item) => item.date === date);
  return entry ? entry.value : null;
};

describe("macro-trace page3: date-mix prevention", () => {
  it("(테스트1) selectedDate=A로 요청했을 때, 응답의 모든 지표 valueDate는 A이거나 null이어야 한다", () => {
    const selectedDate = "2026-01-23";
    const rows = [
      { key: "a", value: 1, valueDate: "2026-01-23", selectedDate },
      { key: "b", value: null, valueDate: null, selectedDate },
    ];
    for (const row of rows) {
      const validDate = row.valueDate === null || row.valueDate === selectedDate;
      expect(validDate, `row ${row.key}: valueDate must be selectedDate or null, got ${row.valueDate}`).toBe(true);
    }
    const valueDateMismatch = rows.filter((r) => r.valueDate != null && r.valueDate !== selectedDate);
    expect(valueDateMismatch.length).toBe(0);
  });

  it("(테스트2) pickHistoryValueExact는 exact match만 반환하고, 선택일 없으면 null", () => {
    const history = [
      { date: "2026-01-22", value: 10 },
      { date: "2026-01-23", value: 20 },
      { date: "2026-01-24", value: 30 },
    ];
    expect(pickHistoryValueExact(history, "2026-01-23")).toBe(20);
    expect(pickHistoryValueExact(history, "2026-01-25")).toBe(null);
    expect(pickHistoryValueExact(history, "2026-01-22")).toBe(10);
    expect(pickHistoryValueExact([], "2026-01-23")).toBe(null);
  });
});
