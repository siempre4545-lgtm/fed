export type RssSource = {
  id: string;
  title: string;
  url: string;
  category: "gov" | "thinktank" | "media" | "local" | "industry";
  reliability: "A" | "B" | "C";
  regionScope?: "national" | "seoul" | "gyeonggi" | "busan" | "incheon" | "etc";
};

export const RSS_SOURCES: RssSource[] = [
  {
    id: "kdi-press",
    title: "KDI 보도자료",
    url: "https://www.kdi.re.kr/kdi_news/press/rss",
    category: "thinktank",
    reliability: "A",
    regionScope: "national",
  },
  {
    id: "molit-press",
    title: "국토교통부 보도자료",
    url: "https://www.molit.go.kr/USR/NEWS/rss/m_71.xml",
    category: "gov",
    reliability: "A",
    regionScope: "national",
  },
  {
    id: "kostat-press",
    title: "통계청 보도자료",
    url: "https://www.kostat.go.kr/portal/korea/rss/press.xml",
    category: "gov",
    reliability: "A",
    regionScope: "national",
  },
  {
    id: "yonhap-econ",
    title: "연합뉴스 경제",
    url: "https://www.yna.co.kr/rss/economy.xml",
    category: "media",
    reliability: "B",
    regionScope: "national",
  },
  {
    id: "yonhap-local",
    title: "연합뉴스 지역",
    url: "https://www.yna.co.kr/rss/region.xml",
    category: "local",
    reliability: "B",
    regionScope: "national",
  },
  {
    id: "hankyung-econ",
    title: "한국경제 경제",
    url: "https://rss.hankyung.com/economy.xml",
    category: "media",
    reliability: "B",
    regionScope: "national",
  },
  {
    id: "seoul-gangnam-press",
    title: "서울 강남구 보도자료",
    url: "https://www.gangnam.go.kr/portal/rss/rssList.do?bbsId=B_000031&recordCountPerPage=30",
    category: "local",
    reliability: "A",
    regionScope: "seoul",
  },
];
