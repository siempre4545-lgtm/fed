export type NewsSource = {
  id: string;
  name: string;
  url: string;
};

export const NEWS_SOURCES: NewsSource[] = [
  {
    id: "korea-policy",
    name: "정책브리핑-정책",
    url: "https://www.korea.kr/rss/policy.xml",
  },
  {
    id: "korea-press",
    name: "정책브리핑-보도자료",
    url: "https://www.korea.kr/rss/pressrelease.xml",
  },
  {
    id: "korea-insight",
    name: "정책브리핑-이슈",
    url: "https://www.korea.kr/rss/insight.xml",
  },
  {
    id: "yna",
    name: "연합뉴스",
    url: "https://www.yna.co.kr/rss/all.xml",
  },
  {
    id: "mk",
    name: "매경",
    url: "https://www.mk.co.kr/rss/",
  },
];
