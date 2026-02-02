import { describe, expect, it } from "vitest";
import { normalizeStooqSymbol } from "@/lib/market/symbols";

describe("normalizeStooqSymbol", () => {
  it("미국 주식은 소문자 + .us로 변환한다", () => {
    expect(normalizeStooqSymbol("RKLB")).toBe("rklb.us");
    expect(normalizeStooqSymbol("gld")).toBe("gld.us");
  });

  it("이미 확장자가 있으면 유지한다", () => {
    expect(normalizeStooqSymbol("uup.us")).toBe("uup.us");
  });

  it("DXY는 UUP로 매핑한다", () => {
    expect(normalizeStooqSymbol("DXY")).toBe("uup.us");
  });
});
