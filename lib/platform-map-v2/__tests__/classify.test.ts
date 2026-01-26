import { describe, expect, it } from "vitest";
import { classifyText } from "../classify";

describe("platform-map-v2 classifyText", () => {
  it("classifies data_infra and network_infra keywords", () => {
    const result = classifyText("데이터센터 및 통신망 구축 사업을 발표했다.");
    expect(result.axes).toContain("data_infra");
    expect(result.axes).toContain("network_infra");
  });

  it("classifies masterplan keyword", () => {
    const result = classifyText("도시 마스터플랜 수립을 위한 기본계획을 공표했다.");
    expect(result.axes).toContain("masterplan");
  });
});
