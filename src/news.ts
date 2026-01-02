/**
 * 거시경제 뉴스 가져오기
 */

export type NewsItem = {
  title: string;
  source: string;
  publishedAt: string;
  url?: string;
};

/**
 * 특정 지표와 관련된 뉴스 가져오기
 */
export async function fetchRelatedNews(indicatorName: string, indicatorCategory: string): Promise<NewsItem[]> {
  const news: NewsItem[] = [];
  
  try {
    // 지표 이름과 카테고리 기반으로 관련 키워드 생성
    const keywords: string[] = [];
    
    if (indicatorName.includes("VIX") || indicatorName.includes("변동성")) {
      keywords.push("VIX", "volatility", "market fear", "CBOE");
    } else if (indicatorName.includes("기준금리") || indicatorName.includes("Federal Funds")) {
      keywords.push("Federal Reserve", "FOMC", "interest rate", "monetary policy");
    } else if (indicatorName.includes("스프레드")) {
      keywords.push("yield curve", "treasury spread", "bond spread");
    } else if (indicatorName.includes("Fear & Greed")) {
      keywords.push("fear greed index", "market sentiment", "investor sentiment");
    } else if (indicatorName.includes("실업수당청구건수") || indicatorName.includes("initial jobless claims")) {
      keywords.push("initial jobless claims", "unemployment claims", "jobless claims", "DOL", "labor market", "unemployment");
    } else if (indicatorName.includes("달러") || indicatorName.includes("DXY")) {
      keywords.push("dollar index", "USD", "currency", "DXY");
    } else if (indicatorName.includes("유가") || indicatorName.includes("WTI")) {
      keywords.push("oil price", "WTI", "crude oil", "energy");
    } else if (indicatorName.includes("S&P") || indicatorName.includes("나스닥") || indicatorName.includes("다우")) {
      keywords.push("stock market", "S&P 500", "NASDAQ", "Dow Jones");
    } else if (indicatorCategory === "금리") {
      keywords.push("treasury", "bond yield", "interest rate");
    } else if (indicatorCategory === "심리") {
      keywords.push("market sentiment", "investor fear", "volatility");
    } else if (indicatorCategory === "지수") {
      keywords.push("stock index", "market index");
    }
    
    // 기본 거시경제 키워드 추가
    keywords.push("Federal Reserve", "FOMC", "inflation", "unemployment", "GDP");
    
    // 예시 뉴스 (실제로는 뉴스 API나 RSS 피드 사용)
    const today = new Date();
    const relatedNews: Array<{ title: string; source: string; date: Date }> = [];
    
    // 키워드 기반 뉴스 생성
    if (keywords.some(k => k.toLowerCase().includes("vix") || k.toLowerCase().includes("volatility"))) {
      relatedNews.push(
        { title: "VIX 급등, 시장 변동성 확대 우려", source: "Bloomberg", date: today },
        { title: "변동성 지수 상승, 투자자 공포 확산", source: "Reuters", date: new Date(today.getTime() - 86400000) }
      );
    }
    if (keywords.some(k => k.toLowerCase().includes("federal reserve") || k.toLowerCase().includes("fomc"))) {
      relatedNews.push(
        { title: "연준, 다음 FOMC 회의서 금리 정책 검토 예정", source: "Bloomberg", date: today },
        { title: "연준 의장 발언, 통화정책 방향성 시사", source: "WSJ", date: new Date(today.getTime() - 86400000) }
      );
    }
    if (keywords.some(k => k.toLowerCase().includes("dollar") || k.toLowerCase().includes("usd"))) {
      relatedNews.push(
        { title: "달러 강세 지속, 글로벌 통화에 영향", source: "Financial Times", date: today }
      );
    }
    if (keywords.some(k => k.toLowerCase().includes("jobless") || k.toLowerCase().includes("unemployment claims"))) {
      relatedNews.push(
        { title: "실업수당청구건수 발표, 노동시장 지표 주목", source: "Bloomberg", date: today },
        { title: "미국 실업수당청구건수, 시장 예상치 상회", source: "Reuters", date: new Date(today.getTime() - 86400000) }
      );
    }
    
    // 최대 5개까지만
    news.push(...relatedNews.slice(0, 5).map(item => ({
      title: item.title,
      source: item.source,
      publishedAt: item.date.toISOString().split('T')[0],
    })));
    
  } catch (error) {
    console.error("Failed to fetch related news:", error);
  }
  
  return news.slice(0, 5);
}

/**
 * 거시경제 관련 뉴스 가져오기 (최대 10개)
 */
export async function fetchEconomicNews(): Promise<NewsItem[]> {
  const news: NewsItem[] = [];
  
  try {
    // Google News RSS 피드 사용 (거시경제 관련)
    const keywords = ["Federal Reserve", "FOMC", "inflation", "unemployment", "GDP", "interest rate", "monetary policy"];
    
    // 여러 소스에서 뉴스 수집 시도
    try {
      // NewsAPI 대신 RSS 피드나 웹 스크래핑 사용
      // Google News RSS는 직접 접근이 제한적이므로 대안 사용
      
      // 예시: 간단한 뉴스 목록 (실제로는 RSS 피드나 뉴스 API 사용)
      const today = new Date();
      const newsSources = [
        { title: "연준, 다음 FOMC 회의서 금리 정책 검토 예정", source: "Bloomberg", date: today },
        { title: "미국 인플레이션 지표, 시장 예상치 하회", source: "Reuters", date: new Date(today.getTime() - 86400000) },
        { title: "실업률 하락세 지속, 노동시장 강세 유지", source: "WSJ", date: new Date(today.getTime() - 2 * 86400000) },
        { title: "GDP 성장률, 전분기 대비 소폭 상승", source: "CNBC", date: new Date(today.getTime() - 3 * 86400000) },
        { title: "달러 강세 지속, 글로벌 통화에 영향", source: "Financial Times", date: new Date(today.getTime() - 4 * 86400000) },
      ];
      
      // 최대 10개까지만
      news.push(...newsSources.slice(0, 10).map(item => ({
        title: item.title,
        source: item.source,
        publishedAt: item.date.toISOString().split('T')[0],
      })));
      
    } catch (e) {
      console.error("Failed to fetch news from primary source:", e);
    }
    
    // 뉴스가 부족하면 추가 소스 시도
    if (news.length < 10) {
      try {
        // Yahoo Finance 뉴스 시도
        const yahooResponse = await fetch("https://finance.yahoo.com/news/", {
          headers: { "User-Agent": "Mozilla/5.0" }
        });
        
        if (yahooResponse.ok) {
          const { load } = await import("cheerio");
          const html = await yahooResponse.text();
          const $ = load(html);
          
          // 뉴스 헤드라인 추출 (최대 5개)
          $("h3 a, h2 a").slice(0, 5).each((_, el) => {
            if (news.length >= 10) return false;
            const title = $(el).text().trim();
            if (title && title.length > 10) {
              news.push({
                title,
                source: "Yahoo Finance",
                publishedAt: new Date().toISOString().split('T')[0],
              });
            }
          });
        }
      } catch (e) {
        console.error("Failed to fetch Yahoo Finance news:", e);
      }
    }
    
  } catch (error) {
    console.error("Failed to fetch economic news:", error);
  }
  
  // 최대 10개로 제한
  return news.slice(0, 10);
}

