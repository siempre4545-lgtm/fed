import { afterEach, describe, expect, it, vi } from "vitest";
import geojson from "@/data/platform-map/korea_sigungu.geojson";
import { computePlatformMapRatings } from "@/lib/platform-map-v2/news/compute";
import { buildRegionContexts, matchRegionNormalizedDetailed, normalizeText } from "@/lib/platform-map-v2/news/match";

vi.mock("@/lib/platform-map-v2/rss/sources", () => ({
  RSS_SOURCES: [
    {
      id: "test",
      title: "테스트 소스",
      url: "https://example.com/rss",
      category: "gov",
      reliability: "A",
      regionScope: "national",
    },
  ],
}));

const mockFetchWithRss = (items: Array<{ title: string; description: string }>) => {
  const rssItems = items
    .map(
      (item) => `
        <item>
          <title>${item.title}</title>
          <description>${item.description}</description>
          <pubDate>${new Date().toUTCString()}</pubDate>
          <link>https://example.com/article</link>
        </item>`,
    )
    .join("");
  const body = `<?xml version="1.0" encoding="UTF-8" ?>
  <rss version="2.0">
    <channel>
      <title>테스트</title>
      ${rssItems}
    </channel>
  </rss>`;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(body, { status: 200 })) as unknown as typeof fetch,
  );
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("platform-map-v2 diagnostics", () => {
  it("geojson 시군구 수가 240 이상이다", () => {
    const features = Array.isArray(geojson.features) ? geojson.features : [];
    expect(features.length).toBeGreaterThan(240);
  });

  it("서울 시군구 수가 25 이상이다", () => {
    const features = Array.isArray(geojson.features) ? geojson.features : [];
    const seoul = features.filter((feature: any) => {
      const props = feature?.properties ?? {};
      const code = String(props.code ?? props.SIG_CD ?? "");
      if (code && code.startsWith("11")) return true;
      const values = Object.values(props).filter((value) => typeof value === "string");
      const codeLike = values.find((value) => /^\d{5}$/.test(String(value)));
      return Boolean(codeLike && String(codeLike).startsWith("11"));
    });
    expect(seoul.length).toBeGreaterThanOrEqual(25);
  });

  it("근거가 있는 지역과 없는 지역의 등급이 분리된다", async () => {
    mockFetchWithRss([
      {
        title: "서울특별시 강남구 데이터센터 특구 지정",
        description:
          "강남구 데이터센터 광통신 5G 스마트시티 교통 복지 금융 벤처 펀드 구독 멤버십 일자리 산업단지 R&D CBDC 전자지갑 간편결제 네트워크 백본 망 구축 거버넌스 위원회 정책 인재 연구원 대학 마스터플랜 종합계획",
      },
    ]);

    const rawRatings = [
      { sigunguCode: "11680", sigunguName: "서울특별시 강남구" },
      { sigunguCode: "26040", sigunguName: "부산광역시 해운대구" },
    ];

    const result = await computePlatformMapRatings(rawRatings, {});
    const grades = new Set(result.ratings.map((rating) => rating.grade));
    expect(grades.size).toBeGreaterThan(1);
  });

  it("별칭/핵심 토큰 매칭으로 시군구를 식별한다", () => {
    const contexts = buildRegionContexts(
      [{ sigunguCode: "11680", sigunguName: "서울특별시 강남구" }],
      { "서울특별시 강남구": ["강남", "테헤란로"] },
    );
    const result = matchRegionNormalizedDetailed(normalizeText("강남 테헤란로 데이터센터"), contexts[0]);
    expect(result.matched).toBe(true);
    expect(result.level).toBe("sigungu");
  });
});
