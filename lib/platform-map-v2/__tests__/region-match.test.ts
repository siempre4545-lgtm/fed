import { describe, expect, it } from "vitest";
import { buildRegionContext, matchRegionHints } from "../region/match";

const aliases = {
  "서울특별시 강남구": ["강남", "테헤란로", "역삼"],
  "경기도 성남시 분당구": ["분당", "판교"],
};

describe("region match", () => {
  it("matches alias first", () => {
    const context = buildRegionContext("서울특별시 강남구", aliases);
    const hits = matchRegionHints("강남 테헤란로 데이터센터", context);
    expect(hits.some((hit) => hit.startsWith("keyword:"))).toBe(true);
  });

  it("falls back to sido when alias miss", () => {
    const context = buildRegionContext("경기도 성남시 분당구", aliases);
    const hits = matchRegionHints("경기도 스마트시티 정책 발표", context);
    expect(hits.some((hit) => hit.startsWith("sido:"))).toBe(true);
  });

  it("misses when no region keyword", () => {
    const context = buildRegionContext("서울특별시 강남구", aliases);
    const hits = matchRegionHints("제주도 관광 활성화", context);
    expect(hits.length).toBe(0);
  });
});
