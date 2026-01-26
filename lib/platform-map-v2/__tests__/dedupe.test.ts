import { describe, expect, it } from "vitest";
import { dedupe, normalizeUrl } from "../rss/dedupe";
import type { EvidenceItem } from "../types";

const buildItem = (overrides: Partial<EvidenceItem>): EvidenceItem => ({
  id: overrides.id ?? "id",
  title: overrides.title ?? "제목",
  source: overrides.source ?? "소스",
  publishedAt: overrides.publishedAt ?? "2025-01-01T00:00:00.000Z",
  url: overrides.url ?? "https://example.com/news",
  snippet: overrides.snippet ?? "내용",
  axes: overrides.axes ?? ["data_infra"],
  regionHints: overrides.regionHints ?? ["sigungu:서울특별시 강남구"],
  reliability: overrides.reliability ?? "B",
});

describe("dedupe", () => {
  it("removes utm params from url", () => {
    const normalized = normalizeUrl("https://example.com/news?utm_source=a&utm_campaign=b&id=1");
    expect(normalized).toBe("https://example.com/news?id=1");
  });

  it("dedupes same title with different urls", () => {
    const items = [
      buildItem({ id: "a", title: "도시 개발 계획 발표", url: "https://a.com/news/1" }),
      buildItem({ id: "b", title: "도시 개발 계획 발표", url: "https://b.com/news/2" }),
    ];
    const result = dedupe(items);
    expect(result.length).toBe(1);
  });

  it("dedupes similar titles within same day", () => {
    const items = [
      buildItem({ id: "a", title: "강남 데이터센터 구축 계획", url: "https://a.com/news/1" }),
      buildItem({ id: "b", title: "강남 데이터 센터 구축 계획 발표", url: "https://b.com/news/2" }),
    ];
    const result = dedupe(items);
    expect(result.length).toBe(1);
  });
});
