/**
 * 경제 지표 데이터 수집 모듈
 * Yahoo Finance, FRED API 등을 활용하여 실시간 경제 지표를 수집합니다.
 */

import { fetchRelatedNews } from "./news.js";

export type EconomicIndicator = {
  category: string;
  name: string;
  symbol: string;
  value: number | null;
  change: number | null;
  changePercent: number | null;
  unit: string;
  lastUpdated: string;
  source: string;
  history?: Array<{ date: string; value: number }>; // 일별 히스토리 데이터
  id?: string; // 세부 페이지용 고유 ID
};

export type EconomicStatus = {
  status: "green" | "yellow" | "red";
  score: number; // 0-100, 높을수록 좋음
  summary: string;
  indicators: EconomicIndicator[];
};

// Yahoo Finance 심볼 매핑
const YAHOO_SYMBOLS: Record<string, string> = {
  // 금리
  "3M_TREASURY": "^IRX", // 3개월 국채금리
  "2Y_TREASURY": "^IRX", // 2년물은 별도 처리 필요
  "10Y_TREASURY": "^TNX", // 10년물 국채금리
  
  // 지수
  "DXY": "DX-Y.NYB", // 달러 인덱스
  "WTI": "CL=F", // WTI 유가
  "DOW": "^DJI", // 다우존스
  "SP500": "^GSPC", // S&P500
  "NASDAQ": "^IXIC", // 나스닥
  "RUSSEL2000": "^RUT", // 러셀2000
  
  // 심리
  "VIX": "^VIX", // VIX 지수
};

// FRED 시리즈 ID 매핑
const FRED_SERIES: Record<string, string> = {
  "FED_BALANCE": "WALCL", // Fed Balance Sheet
  "M2": "M2SL", // M2 Money Supply
  "CPI": "CPIAUCSL", // CPI
  "UNEMPLOYMENT": "UNRATE", // 실업률
  "INITIAL_CLAIMS": "ICSA", // 신규 실업수당 청구
  "ISM_MANUFACTURING": "NAPM", // ISM 제조업
  "FED_FUNDS_RATE": "DFF", // 미국 기준금리 (Federal Funds Effective Rate)
  "TREASURY_10Y": "DGS10", // 10년물 국채금리
  "TREASURY_2Y": "DGS2", // 2년물 국채금리
};

/**
 * Yahoo Finance에서 데이터 가져오기
 */
async function fetchYahooFinance(symbol: string): Promise<{ price: number; change: number; changePercent: number } | null> {
  try {
    // Yahoo Finance API v8 사용
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=2d`;
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0",
      },
    });
    
    if (!response.ok) {
      console.error(`Yahoo Finance API error for ${symbol}: ${response.status} ${response.statusText}`);
      return null;
    }
    
    const data = await response.json();
    const result = data.chart?.result?.[0];
    if (!result) {
      console.error(`No result data for ${symbol}`);
      return null;
    }
    
    const quote = result.indicators?.quote?.[0];
    const meta = result.meta;
    
    // VIX 같은 경우 quote.close가 아닌 다른 필드에 있을 수 있음
    let prices: number[] = [];
    if (quote && quote.close) {
      prices = quote.close.filter((p: number | null) => p !== null);
    }
    
    // quote.close가 없으면 regularMarketPrice 사용
    if (prices.length === 0 && meta) {
      if (meta.regularMarketPrice !== null && meta.regularMarketPrice !== undefined) {
        const currentPrice = meta.regularMarketPrice;
        const previousClose = meta.previousClose;
        if (previousClose !== null && previousClose !== undefined) {
          const change = currentPrice - previousClose;
          const changePercent = (change / previousClose) * 100;
          return {
            price: currentPrice,
            change,
            changePercent,
          };
        }
      }
    }
    
    if (prices.length < 2) {
      console.error(`Insufficient price data for ${symbol}: ${prices.length} prices`);
      return null;
    }
    
    const currentPrice = prices[prices.length - 1];
    const previousPrice = prices[prices.length - 2];
    const change = currentPrice - previousPrice;
    const changePercent = (change / previousPrice) * 100;
    
    return {
      price: currentPrice,
      change,
      changePercent,
    };
  } catch (error) {
    console.error(`Failed to fetch Yahoo Finance data for ${symbol}:`, error);
    return null;
  }
}

/**
 * FRED API에서 데이터 가져오기
 * API 키는 환경 변수 FRED_API_KEY에서 가져옵니다 (선택사항)
 */
async function fetchFRED(seriesId: string, limit: number = 2): Promise<{ value: number; change: number; changePercent: number; history?: Array<{ date: string; value: number }> } | null> {
  try {
    // FRED API는 무료 API 키가 필요합니다. demo 키는 제한적입니다.
    // 환경 변수에 FRED_API_KEY가 없으면 공개 데이터 소스 사용 시도
    const apiKey = process.env.FRED_API_KEY;
    
    if (!apiKey || apiKey === "demo") {
      // API 키가 없으면 Yahoo Finance나 다른 소스로 대체 시도
      // 기준금리는 Yahoo Finance에서 직접 가져올 수 없으므로 null 반환
      console.warn(`FRED API key not set for ${seriesId}, trying alternative sources...`);
      
      // 일부 지표는 Yahoo Finance로 대체 가능
      if (seriesId === "DGS10") {
        const yahooData = await fetchYahooFinance("^TNX");
        if (yahooData) {
          return {
            value: yahooData.price,
            change: yahooData.change,
            changePercent: yahooData.changePercent,
          };
        }
      } else if (seriesId === "DGS2") {
        const yahooData = await fetch2YearTreasury();
        if (yahooData) {
          return {
            value: yahooData.price,
            change: yahooData.change,
            changePercent: yahooData.changePercent,
          };
        }
      }
      
      // 기준금리(DFF)는 FRED API만 가능하므로 null 반환
      return null;
    }
    
    const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${apiKey}&file_type=json&limit=${limit}&sort_order=desc`;
    
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`FRED API error for ${seriesId}: ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    if (!data.observations || data.observations.length === 0) {
      return null;
    }
    
    // 최신 값 찾기 ('.' 값 제외)
    const validObservations = data.observations.filter((obs: any) => obs.value !== '.' && obs.value !== null && obs.value !== '');
    if (validObservations.length === 0) return null;
    
    const latest = validObservations[0];
    const previous = validObservations.length > 1 ? validObservations[1] : null;
    
    const currentValue = parseFloat(latest.value);
    if (isNaN(currentValue)) return null;
    
    let change = 0;
    let changePercent = 0;
    
    if (previous && previous.value !== '.' && previous.value !== null && previous.value !== '') {
      const prevValue = parseFloat(previous.value);
      if (!isNaN(prevValue) && prevValue !== 0) {
        change = currentValue - prevValue;
        changePercent = (change / prevValue) * 100;
      }
    }
    
    // 히스토리 데이터 (limit이 30 이상이면)
    let history: Array<{ date: string; value: number }> = [];
    if (limit >= 30) {
      history = validObservations.slice(0, Math.min(limit, validObservations.length)).map((obs: any) => ({
        date: obs.date,
        value: parseFloat(obs.value),
      })).reverse();
    }
    
    return {
      value: currentValue,
      change,
      changePercent,
      history: history.length > 0 ? history : undefined,
    };
  } catch (error) {
    console.error(`Failed to fetch FRED data for ${seriesId}:`, error);
    return null;
  }
}

/**
 * 2년물 국채금리 가져오기 (별도 처리)
 */
async function fetch2YearTreasury(): Promise<{ price: number; change: number; changePercent: number } | null> {
  try {
    // Yahoo Finance에서 ^IRX는 13주 국채이므로, 2년물은 다른 심볼 필요
    // ^FVX 또는 다른 소스 사용
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/%5EFVX?interval=1d&range=2d`;
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0",
      },
    });
    
    if (!response.ok) return null;
    
    const data = await response.json();
    const result = data.chart?.result?.[0];
    if (!result) return null;
    
    const quote = result.indicators?.quote?.[0];
    if (!quote) return null;
    
    const prices = quote.close.filter((p: number | null) => p !== null);
    if (prices.length < 2) return null;
    
    const currentPrice = prices[prices.length - 1];
    const previousPrice = prices[prices.length - 2];
    const change = currentPrice - previousPrice;
    const changePercent = (change / previousPrice) * 100;
    
    return {
      price: currentPrice,
      change,
      changePercent,
    };
  } catch (error) {
    console.error("Failed to fetch 2Y Treasury:", error);
    return null;
  }
}

/**
 * 하이일드 스프레드 계산 (HYG - TLT 스프레드)
 */
async function fetchHighYieldSpread(): Promise<{ price: number; change: number; changePercent: number } | null> {
  try {
    // 하이일드 ETF와 국채 ETF의 스프레드를 계산
    const [hyg, tlt] = await Promise.all([
      fetchYahooFinance("HYG"),
      fetchYahooFinance("TLT"),
    ]);
    
    if (!hyg || !tlt) return null;
    
    // 수익률 차이로 스프레드 근사치 계산
    // 실제로는 더 정교한 계산 필요
    const spread = hyg.price - tlt.price;
    const spreadChange = hyg.change - tlt.change;
    const spreadChangePercent = spreadChange / (spread - spreadChange) * 100;
    
    return {
      price: spread,
      change: spreadChange,
      changePercent: spreadChangePercent,
    };
  } catch (error) {
    console.error("Failed to fetch High Yield Spread:", error);
    return null;
  }
}

/**
 * 한국 CDS 지표 가져오기 (KCIF 국제금융센터 우선, 폴백: investing.com)
 * 참고: https://www.kcif.or.kr/chart/intrList
 */
async function fetchKoreaCDS(): Promise<{ value: number; change: number; changePercent: number } | null> {
  try {
    // KCIF 사이트에서 한국 CDS 데이터 가져오기 시도
    const kcifUrl = "https://www.kcif.or.kr/chart/intrList";
    const kcifResponse = await fetch(kcifUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
        "Referer": "https://www.kcif.or.kr/",
      },
    });
    
    if (kcifResponse.ok) {
      const html = await kcifResponse.text();
      const cheerio = await import("cheerio");
      const $ = cheerio.load(html);
      
      // KCIF 페이지에서 한국 CDS 데이터 찾기
      let koreaCDSValue: number | null = null;
      let previousValue: number | null = null;
      
      // 테이블에서 "한국" 또는 "Korea" 검색 (더 포괄적인 검색)
      $("table tbody tr, tbody tr, tr").each((_idx, row) => {
        const $row = $(row);
        const allText = $row.text().toLowerCase();
        const firstCell = $row.find("td").first().text().trim().toLowerCase();
        
        // 더 포괄적인 검색 조건
        if (allText.includes("한국") || 
            allText.includes("korea") ||
            allText.includes("south korea") ||
            firstCell.includes("한국") ||
            firstCell.includes("korea") ||
            firstCell.includes("south korea") ||
            firstCell.includes("kr") ||
            firstCell.includes("대한민국")) {
          const cells = $row.find("td");
          
          // 모든 셀에서 숫자 찾기
          for (let i = 0; i < cells.length; i++) {
            const cellText = cells.eq(i).text().trim();
            // 더 포괄적인 숫자 패턴 (소수점 포함, bp 포함 등)
            const numericMatch = cellText.match(/(\d+\.?\d*)\s*(bp|BP|basis|points?)?/i);
            if (numericMatch) {
              const parsed = parseFloat(numericMatch[1]);
              // CDS는 보통 0-10000bp 범위이지만, 더 넓은 범위도 허용
              if (parsed > 0 && parsed < 50000) {
                koreaCDSValue = parsed;
                
                // 변화량 찾기 (다음 셀 또는 같은 셀 내)
                const changeCell = cells.eq(i + 1);
                if (changeCell.length > 0) {
                  const changeText = changeCell.text().trim();
                  const changeMatch = changeText.match(/([+-]?\d+\.?\d*)/);
                  if (changeMatch) {
                    previousValue = koreaCDSValue - parseFloat(changeMatch[1]);
                  }
                }
                // 같은 셀에서 변화량 찾기
                if (previousValue === null) {
                  const changeInCell = cellText.match(/([+-]\d+\.?\d*)/);
                  if (changeInCell) {
                    previousValue = koreaCDSValue - parseFloat(changeInCell[1]);
                  }
                }
                break;
              }
            }
          }
        }
      });
      
      if (koreaCDSValue !== null && !isNaN(koreaCDSValue)) {
        const change = previousValue !== null ? koreaCDSValue - previousValue : 0;
        const changePercent = previousValue !== null && previousValue !== 0 
          ? (change / previousValue) * 100 
          : 0;
        
        console.log(`Korea CDS fetched from KCIF: ${koreaCDSValue}bp (change: ${change}bp)`);
        return {
          value: koreaCDSValue,
          change,
          changePercent,
        };
      }
    }
    
    // KCIF에서 못 찾으면 investing.com으로 폴백
    console.warn("Korea CDS value not found in KCIF, trying investing.com");
  } catch (error) {
    console.error("Failed to fetch Korea CDS from KCIF:", error);
  }
  
  // 폴백: investing.com 스크래핑
  try {
    const url = "https://kr.investing.com/rates-bonds/world-cds";
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
        "Referer": "https://kr.investing.com/",
      },
    });
    
    if (!response.ok) {
      console.error(`Failed to fetch Korea CDS: ${response.status}`);
      return null;
    }
    
    const html = await response.text();
    
    // cheerio를 사용하여 HTML 파싱
    const cheerio = await import("cheerio");
    const $ = cheerio.load(html);
    
    // 한국 CDS 데이터 찾기 (다양한 선택자 시도)
    let koreaCDSValue: number | null = null;
    let previousValue: number | null = null;
    
    // 방법 1: 테이블에서 직접 찾기 (더 포괄적인 검색)
    $("table tbody tr, .js-table-wrapper tbody tr, #curr_table tbody tr, tbody tr, tr").each((_idx, row) => {
      const $row = $(row);
      const allText = $row.text().toLowerCase();
      const firstCell = $row.find("td").first().text().trim().toLowerCase();
      
      // 더 포괄적인 검색 조건
      if (allText.includes("south korea") || 
          allText.includes("대한민국") || 
          allText.includes("korea") ||
          allText.includes("한국") ||
          allText.includes("south korean") ||
          firstCell.includes("south korea") ||
          firstCell.includes("대한민국") ||
          firstCell.includes("korea") ||
          firstCell.includes("한국") ||
          firstCell.includes("kr")) {
        const cells = $row.find("td");
        
        // 모든 셀에서 숫자 찾기
        for (let i = 0; i < cells.length; i++) {
          const cellText = cells.eq(i).text().trim();
          // 더 포괄적인 숫자 패턴
          const numericMatch = cellText.match(/(\d+\.?\d*)\s*(bp|BP|basis|points?)?/i);
          if (numericMatch) {
            const parsed = parseFloat(numericMatch[1]);
            // CDS는 보통 0-10000bp 범위이지만, 더 넓은 범위도 허용
            if (parsed > 0 && parsed < 50000) {
              koreaCDSValue = parsed;
              
              // 변화량 찾기 (다음 셀 또는 같은 셀 내)
              const changeCell = cells.eq(i + 1);
              if (changeCell.length > 0) {
                const changeText = changeCell.text().trim();
                const changeMatch = changeText.match(/([+-]?\d+\.?\d*)/);
                if (changeMatch) {
                  previousValue = koreaCDSValue - parseFloat(changeMatch[1]);
                }
              }
              // 같은 셀에서 변화량 찾기
              if (previousValue === null) {
                const changeInCell = cellText.match(/([+-]\d+\.?\d*)/);
                if (changeInCell) {
                  previousValue = koreaCDSValue - parseFloat(changeInCell[1]);
                }
              }
              break;
            }
          }
        }
      }
    });
    
    // 방법 2: JavaScript 변수에서 찾기
    if (koreaCDSValue === null) {
      const scriptMatches = [
        html.match(/window\.__INITIAL_STATE__\s*=\s*({.+?});/s),
        html.match(/window\.__PRELOADED_STATE__\s*=\s*({.+?});/s),
        html.match(/var\s+pairData\s*=\s*({.+?});/s),
      ].filter(Boolean);
      
      for (const match of scriptMatches) {
        if (!match) continue;
        try {
          const data = JSON.parse(match[1]);
          // 다양한 데이터 구조 시도
          const searchInData = (obj: any): any => {
            if (Array.isArray(obj)) {
              for (const item of obj) {
                const found = searchInData(item);
                if (found) return found;
              }
            } else if (obj && typeof obj === 'object') {
              if (obj.name && (obj.name.toLowerCase().includes("korea") || obj.name.toLowerCase().includes("south korea"))) {
                return obj;
              }
              for (const key in obj) {
                const found = searchInData(obj[key]);
                if (found) return found;
              }
            }
            return null;
          };
          
          const koreaQuote = searchInData(data);
          if (koreaQuote && (koreaQuote.last || koreaQuote.value || koreaQuote.price)) {
            koreaCDSValue = parseFloat(koreaQuote.last || koreaQuote.value || koreaQuote.price);
            if (koreaQuote.change) {
              previousValue = koreaCDSValue - parseFloat(koreaQuote.change);
            }
            break;
          }
        } catch (e) {
          // JSON 파싱 실패는 무시
        }
      }
    }
    
    // 방법 3: data-pair-id 속성으로 찾기
    if (koreaCDSValue === null) {
      $("[data-pair-id]").each((_idx, elem) => {
        const $elem = $(elem);
        const pairId = $elem.attr("data-pair-id");
        const text = $elem.text().toLowerCase();
        
        if (text.includes("korea") || text.includes("south korea") || text.includes("한국")) {
          const valueText = $elem.find(".pid-price-last, .last-price, .text-right").first().text().trim();
          const numericMatch = valueText.match(/(\d+\.?\d*)/);
          if (numericMatch) {
            const parsed = parseFloat(numericMatch[1]);
            if (parsed > 0 && parsed < 10000) {
              koreaCDSValue = parsed;
            }
          }
        }
      });
    }
    
    if (koreaCDSValue !== null && !isNaN(koreaCDSValue)) {
      const change = previousValue !== null ? koreaCDSValue - previousValue : 0;
      const changePercent = previousValue !== null && previousValue !== 0 
        ? (change / previousValue) * 100 
        : 0;
      
      console.log(`Korea CDS fetched: ${koreaCDSValue}bp (change: ${change}bp)`);
      return {
        value: koreaCDSValue,
        change,
        changePercent,
      };
    }
    
    console.warn("Korea CDS value not found in HTML");
    return null;
  } catch (error) {
    console.error("Failed to fetch Korea CDS:", error);
    return null;
  }
}

/**
 * Fear & Greed Index 가져오기 (CNN API 우선 사용)
 */
async function fetchFearGreedIndex(): Promise<{ value: number; change: number; history?: Array<{ date: string; value: number }>; lastUpdated?: string } | null> {
  try {
    // CNN API 우선 시도 (https://edition.cnn.com/markets/fear-and-greed 참조)
    try {
      const cnnResponse = await fetch("https://production.dataviz.cnn.io/index/fearandgreed/graphdata", {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "Accept": "application/json",
          "Referer": "https://edition.cnn.com/",
        },
      });
      
      if (cnnResponse.ok) {
        const cnnData = await cnnResponse.json();
        console.log("CNN API Response:", JSON.stringify(cnnData).substring(0, 500));
        
        // CNN API 응답 구조 확인 및 파싱
        let currentValue: number | null = null;
        let previousValue: number | null = null;
        let history: Array<{ date: string; value: number }> = [];
        let lastUpdated: string | null = null;
        
        // 다양한 가능한 응답 구조 확인
        if (cnnData.fear_and_greed) {
          // 구조 1: fear_and_greed.score
          if (cnnData.fear_and_greed.score !== undefined && cnnData.fear_and_greed.score !== null) {
            currentValue = Number(cnnData.fear_and_greed.score);
          }
          // 구조 2: fear_and_greed.data[0].value 또는 score
          else if (cnnData.fear_and_greed.data && Array.isArray(cnnData.fear_and_greed.data) && cnnData.fear_and_greed.data.length > 0) {
            const latestData = cnnData.fear_and_greed.data[0];
            currentValue = Number(latestData.value || latestData.score || latestData.y || latestData.close);
            
            // 히스토리 데이터
            history = cnnData.fear_and_greed.data.map((item: any) => ({
              date: item.date || (item.timestamp ? new Date(item.timestamp).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]),
              value: Number(item.value || item.score || item.y || item.close || currentValue),
            })).reverse();
            
            // 이전 값
            if (cnnData.fear_and_greed.data.length > 1) {
              const prevData = cnnData.fear_and_greed.data[1];
              previousValue = Number(prevData.value || prevData.score || prevData.y || prevData.close);
            }
          }
          // 구조 3: fear_and_greed.previous_close
          if (cnnData.fear_and_greed.previous_close?.value !== undefined) {
            previousValue = Number(cnnData.fear_and_greed.previous_close.value);
          }
          
          lastUpdated = cnnData.fear_and_greed.last_updated || 
                       cnnData.fear_and_greed.data?.[0]?.date ||
                       null;
        }
        // 구조 4: 최상위 레벨
        else if (cnnData.score !== undefined) {
          currentValue = Number(cnnData.score);
          previousValue = Number(cnnData.previous_close?.value || cnnData.previous_score || currentValue);
        }
        else if (cnnData.data && Array.isArray(cnnData.data) && cnnData.data.length > 0) {
          const latestData = cnnData.data[0];
          currentValue = Number(latestData.value || latestData.score || latestData.y || latestData.close);
          
          if (cnnData.data.length > 1) {
            const prevData = cnnData.data[1];
            previousValue = Number(prevData.value || prevData.score || prevData.y || prevData.close);
          }
          
          history = cnnData.data.map((item: any) => ({
            date: item.date || (item.timestamp ? new Date(item.timestamp).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]),
            value: Number(item.value || item.score || item.y || item.close || currentValue),
          })).reverse();
        }
        
        if (currentValue !== null && !isNaN(currentValue) && currentValue >= 0 && currentValue <= 100) {
          return {
            value: Math.round(currentValue),
            change: previousValue !== null ? Math.round(currentValue) - Math.round(previousValue) : 0,
            history: history.length > 0 ? history : undefined,
            lastUpdated: lastUpdated || new Date().toISOString(),
          };
        }
      }
    } catch (e) {
      console.error("CNN API failed:", e);
    }
    
    // 대안: Alternative.me API 사용
    try {
      const response = await fetch("https://api.alternative.me/fng/?limit=2", {
        headers: {
          "User-Agent": "Mozilla/5.0",
        },
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.data && data.data.length > 0) {
          const latest = data.data[0];
          const previous = data.data[1] || latest;
          
          const currentValue = parseInt(latest.value, 10);
          const previousValue = parseInt(previous.value, 10);
          
          if (!isNaN(currentValue) && currentValue >= 0 && currentValue <= 100) {
            // 히스토리 데이터 가져오기 (최근 365일)
            let history: Array<{ date: string; value: number }> = [];
            try {
              const historyResponse = await fetch("https://api.alternative.me/fng/?limit=365");
              if (historyResponse.ok) {
                const historyData = await historyResponse.json();
                if (historyData.data) {
                  history = historyData.data.map((item: any) => ({
                    date: new Date(parseInt(item.timestamp) * 1000).toISOString().split('T')[0],
                    value: parseInt(item.value, 10),
                  })).reverse();
                }
              }
            } catch (e) {
              console.error("Failed to fetch history:", e);
            }
            
            // lastUpdated는 최신 데이터의 타임스탬프 사용
            const lastUpdated = latest.timestamp 
              ? new Date(parseInt(latest.timestamp) * 1000).toISOString()
              : new Date().toISOString();
            
            return {
              value: currentValue,
              change: currentValue - previousValue,
              history: history.length > 0 ? history : undefined,
              lastUpdated,
            };
          }
        }
      }
    } catch (e) {
      console.error("Alternative.me API failed:", e);
    }
    
    return null;
  } catch (error) {
    console.error("Failed to fetch Fear & Greed Index:", error);
    return null;
  }
}

/**
 * 모든 경제 지표 수집
 */
export async function fetchAllEconomicIndicators(): Promise<EconomicIndicator[]> {
  const indicators: EconomicIndicator[] = [];
  const now = new Date().toISOString();
  
  // 금리 지표 (Yahoo Finance)
  const [treasury3M, treasury2Y, treasury10Y] = await Promise.all([
    fetchYahooFinance("^IRX"),
    fetch2YearTreasury(),
    fetchYahooFinance("^TNX"),
  ]);
  
  // FRED 데이터는 별도로 가져오기 (API 키 필요 시)
  // 기준금리: DFF (Federal Funds Effective Rate) 또는 DFEDTARU (Target Upper Bound)
  const [fedFundsRate_DFF, fedFundsRate_TARU, treasury10Y_FRED, treasury2Y_FRED, sofr, onRrp] = await Promise.all([
    fetchFRED("DFF", 30), // 기준금리 - Effective Rate (히스토리 포함)
    fetchFRED("DFEDTARU", 30), // 기준금리 - Target Upper Bound (상단금리, 히스토리 포함)
    fetchFRED("DGS10", 30), // 10년물 (히스토리 포함)
    fetchFRED("DGS2", 30), // 2년물 (히스토리 포함)
    fetchFRED("SOFR", 30), // SOFR 금리 (히스토리 포함)
    fetchFRED("RRPONTSYD", 30), // ON RRP (히스토리 포함)
  ]);
  
  // 상단금리(Target Upper Bound) 우선, 없으면 Effective Rate 사용
  const fedFundsRate = fedFundsRate_TARU || fedFundsRate_DFF;
  
  if (treasury3M) {
    indicators.push({
      category: "금리",
      name: "미국 3개월 국채금리",
      symbol: "^IRX",
      value: treasury3M.price,
      change: treasury3M.change,
      changePercent: treasury3M.changePercent,
      unit: "%",
      lastUpdated: now,
      source: "Yahoo Finance",
      id: "treasury-3m",
    });
  }
  
  if (treasury2Y) {
    indicators.push({
      category: "금리",
      name: "미국 2년물 국채금리",
      symbol: "^FVX",
      value: treasury2Y.price,
      change: treasury2Y.change,
      changePercent: treasury2Y.changePercent,
      unit: "%",
      lastUpdated: now,
      source: "Yahoo Finance",
      id: "treasury-2y",
    });
  }
  
  if (treasury10Y) {
    indicators.push({
      category: "금리",
      name: "미국 10년물 국채금리",
      symbol: "^TNX",
      value: treasury10Y.price,
      change: treasury10Y.change,
      changePercent: treasury10Y.changePercent,
      unit: "%",
      lastUpdated: now,
      source: "Yahoo Finance",
      id: "treasury-10y",
    });
  }
  
  // 기준금리 추가
  if (fedFundsRate) {
    indicators.push({
      category: "금리",
      name: "미국 기준금리 (상단금리)",
      symbol: "DFF",
      value: fedFundsRate.value,
      change: fedFundsRate.change,
      changePercent: fedFundsRate.changePercent,
      unit: "%",
      lastUpdated: now,
      source: "FRED",
      history: fedFundsRate.history,
      id: "fed-funds-rate",
    });
  }
  
  // SOFR 추가
  if (sofr) {
    indicators.push({
      category: "금리",
      name: "USD SOFR (미국 달러 SOFR 금리)",
      symbol: "SOFR",
      value: sofr.value,
      change: sofr.change,
      changePercent: sofr.changePercent,
      unit: "%",
      lastUpdated: now,
      source: "FRED",
      history: sofr.history,
      id: "sofr",
    });
  }
  
  // ON RRP 추가
  if (onRrp) {
    indicators.push({
      category: "금리",
      name: "ON RRP",
      symbol: "RRPONTSYD",
      value: onRrp.value,
      change: onRrp.change,
      changePercent: onRrp.changePercent,
      unit: "십억 달러",
      lastUpdated: now,
      source: "FRED",
      history: onRrp.history,
      id: "on-rrp",
    });
  }
  
  // 금리스프레드 (10Y - 2Y) 계산
  // FRED 데이터가 있으면 사용, 없으면 Yahoo Finance 데이터 사용
  const val10Y = treasury10Y_FRED?.value ?? treasury10Y?.price;
  const val2Y = treasury2Y_FRED?.value ?? treasury2Y?.price;
  
  if (val10Y !== null && val10Y !== undefined && val2Y !== null && val2Y !== undefined) {
    const spread = val10Y - val2Y;
    const change10Y = treasury10Y_FRED?.change ?? treasury10Y?.change ?? 0;
    const change2Y = treasury2Y_FRED?.change ?? treasury2Y?.change ?? 0;
    const spreadChange = change10Y - change2Y;
    const spreadChangePercent = val2Y !== 0 ? (spreadChange / val2Y) * 100 : 0;
    
    // 히스토리 데이터 병합
    const spreadHistory: Array<{ date: string; value: number }> = [];
    if (treasury10Y_FRED?.history && treasury2Y_FRED?.history) {
      const dates = new Set([...treasury10Y_FRED.history.map(h => h.date), ...treasury2Y_FRED.history.map(h => h.date)]);
      dates.forEach(date => {
        const val10Y_hist = treasury10Y_FRED.history!.find(h => h.date === date)?.value;
        const val2Y_hist = treasury2Y_FRED.history!.find(h => h.date === date)?.value;
        if (val10Y_hist !== undefined && val2Y_hist !== undefined) {
          spreadHistory.push({ date, value: val10Y_hist - val2Y_hist });
        }
      });
      spreadHistory.sort((a, b) => a.date.localeCompare(b.date));
    }
    
    indicators.push({
      category: "금리",
      name: "금리스프레드 (10Y-2Y)",
      symbol: "DGS10-DGS2",
      value: spread,
      change: spreadChange,
      changePercent: spreadChangePercent,
      unit: "%p",
      lastUpdated: now,
      source: treasury10Y_FRED && treasury2Y_FRED ? "FRED" : "Yahoo Finance",
      history: spreadHistory.length > 0 ? spreadHistory : undefined,
      id: "yield-spread",
    });
  }
  
  // 지수 지표
  const [dxy, wti, dow, sp500, nasdaq, russel] = await Promise.all([
    fetchYahooFinance("DX-Y.NYB"),
    fetchYahooFinance("CL=F"),
    fetchYahooFinance("^DJI"),
    fetchYahooFinance("^GSPC"),
    fetchYahooFinance("^IXIC"),
    fetchYahooFinance("^RUT"),
  ]);
  
  if (dxy) {
    indicators.push({
      category: "지수",
      name: "달러 인덱스 (DXY)",
      symbol: "DX-Y.NYB",
      value: dxy.price,
      change: dxy.change,
      changePercent: dxy.changePercent,
      unit: "점",
      lastUpdated: now,
      source: "Yahoo Finance",
      id: "dxy",
    });
  }
  
  if (wti) {
    indicators.push({
      category: "지수",
      name: "WTI 유가",
      symbol: "CL=F",
      value: wti.price,
      change: wti.change,
      changePercent: wti.changePercent,
      unit: "$/배럴",
      lastUpdated: now,
      source: "Yahoo Finance",
      id: "wti",
    });
  }
  
  if (dow) {
    indicators.push({
      category: "지수",
      name: "다우존스",
      symbol: "^DJI",
      value: dow.price,
      change: dow.change,
      changePercent: dow.changePercent,
      unit: "점",
      lastUpdated: now,
      source: "Yahoo Finance",
      id: "dow",
    });
  }
  
  if (sp500) {
    indicators.push({
      category: "지수",
      name: "S&P500",
      symbol: "^GSPC",
      value: sp500.price,
      change: sp500.change,
      changePercent: sp500.changePercent,
      unit: "점",
      lastUpdated: now,
      source: "Yahoo Finance",
      id: "sp500",
    });
  }
  
  if (nasdaq) {
    indicators.push({
      category: "지수",
      name: "나스닥",
      symbol: "^IXIC",
      value: nasdaq.price,
      change: nasdaq.change,
      changePercent: nasdaq.changePercent,
      unit: "점",
      lastUpdated: now,
      source: "Yahoo Finance",
      id: "nasdaq",
    });
  }
  
  if (russel) {
    indicators.push({
      category: "지수",
      name: "러셀2000",
      symbol: "^RUT",
      value: russel.price,
      change: russel.change,
      changePercent: russel.changePercent,
      unit: "점",
      lastUpdated: now,
      source: "Yahoo Finance",
      id: "russell2000",
    });
  }
  
  // 심리 지표
  // VIX는 별도로 처리 (더 안정적인 방법)
  let vix = null;
  try {
    // VIX 직접 API 호출 (여러 방법 시도)
    const vixUrls = [
      `https://query1.finance.yahoo.com/v8/finance/chart/%5EVIX?interval=1d&range=5d`,
      `https://query2.finance.yahoo.com/v8/finance/chart/%5EVIX?interval=1d&range=5d`,
    ];
    
    for (const vixUrl of vixUrls) {
      try {
        const vixResponse = await fetch(vixUrl, {
          headers: { 
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "application/json",
          },
        });
        
        if (vixResponse.ok) {
          const vixData = await vixResponse.json();
          const vixResult = vixData.chart?.result?.[0];
          if (vixResult) {
            const vixMeta = vixResult.meta;
            const vixQuote = vixResult.indicators?.quote?.[0];
            
            // 여러 방법으로 VIX 값 찾기
            let vixPrice: number | null = null;
            let vixPrev: number | null = null;
            
            // 1. meta에서 찾기
            if (vixMeta) {
              if (vixMeta.regularMarketPrice !== null && vixMeta.regularMarketPrice !== undefined) {
                vixPrice = vixMeta.regularMarketPrice;
              }
              if (vixMeta.previousClose !== null && vixMeta.previousClose !== undefined) {
                vixPrev = vixMeta.previousClose;
              }
              // chartPreviousClose도 시도
              if (!vixPrev && vixMeta.chartPreviousClose !== null && vixMeta.chartPreviousClose !== undefined) {
                vixPrev = vixMeta.chartPreviousClose;
              }
            }
            
            // 2. quote에서 찾기
            if ((!vixPrice || !vixPrev) && vixQuote && vixQuote.close) {
              const prices = vixQuote.close.filter((p: number | null) => p !== null);
              if (prices.length >= 2) {
                if (!vixPrice) vixPrice = prices[prices.length - 1];
                if (!vixPrev) vixPrev = prices[prices.length - 2];
              } else if (prices.length === 1 && !vixPrice) {
                vixPrice = prices[0];
              }
            }
            
            if (vixPrice !== null) {
              // vixPrev가 없으면 vixPrice를 사용 (변화량 0)
              if (vixPrev === null) vixPrev = vixPrice;
              
              vix = {
                price: vixPrice,
                change: vixPrice - vixPrev,
                changePercent: vixPrev !== 0 ? ((vixPrice - vixPrev) / vixPrev) * 100 : 0,
              };
              console.log(`VIX fetched successfully: ${vixPrice} (prev: ${vixPrev})`);
              break; // 성공하면 루프 종료
            }
          }
        }
      } catch (e) {
        console.error(`VIX fetch failed for ${vixUrl}:`, e);
        continue; // 다음 URL 시도
      }
    }
    
    // 여전히 실패하면 fetchYahooFinance 시도
    if (!vix) {
      vix = await fetchYahooFinance("^VIX");
      if (vix) {
        console.log(`VIX fetched via fetchYahooFinance: ${vix.price}`);
      }
    }
  } catch (err) {
    console.error("Error fetching VIX:", err);
  }
  
  let fearGreed = null;
  try {
    fearGreed = await fetchFearGreedIndex();
  } catch (err) {
    console.error("Error fetching Fear & Greed Index:", err);
  }
  
  let koreaCDS = null;
  try {
    koreaCDS = await fetchKoreaCDS();
    if (koreaCDS) {
      console.log(`Korea CDS fetched successfully: ${koreaCDS.value}bp (change: ${koreaCDS.change}bp)`);
    } else {
      console.warn("Korea CDS fetch returned null - all methods failed");
      // 한국 CDS가 없어도 계속 진행 (다른 지표에 영향 없음)
    }
  } catch (err) {
    console.error("Error fetching Korea CDS:", err);
    // 에러가 발생해도 계속 진행
  }
  
  if (vix) {
    indicators.push({
      category: "심리",
      name: "VIX 지수",
      symbol: "^VIX",
      value: vix.price,
      change: vix.change,
      changePercent: vix.changePercent,
      unit: "점",
      lastUpdated: now,
      source: "Yahoo Finance",
      id: "vix",
    });
    console.log("VIX indicator added to list");
  } else {
    console.warn("VIX data not available - all methods failed");
  }
  
  if (fearGreed) {
    indicators.push({
      category: "심리",
      name: "Fear & Greed Index",
      symbol: "FNG",
      value: fearGreed.value,
      change: fearGreed.change,
      changePercent: fearGreed.value !== 0 ? (fearGreed.change / fearGreed.value) * 100 : null,
      unit: "점",
      lastUpdated: fearGreed.lastUpdated || now,
      source: "CNN Fear & Greed Index",
      history: fearGreed.history,
      id: "fear-greed-index",
    });
  }
  
  // 실업수당청구건수 (FRED ICSA)
  const initialClaims = await fetchFRED("ICSA", 30);
  if (initialClaims) {
    indicators.push({
      category: "심리",
      name: "실업수당청구건수",
      symbol: "ICSA",
      value: initialClaims.value,
      change: initialClaims.change,
      changePercent: initialClaims.changePercent,
      unit: "천 명",
      lastUpdated: now,
      source: "FRED (DOL)",
      history: initialClaims.history,
      id: "initial-jobless-claims",
    });
  }
  
  // 신용 지표
  const highYieldSpread = await fetchHighYieldSpread();
  
  // 한국 CDS를 신용 카테고리에 추가
  if (koreaCDS) {
    indicators.push({
      category: "신용",
      name: "한국 CDS 프리미엄",
      symbol: "KRW-CDS",
      value: koreaCDS.value,
      change: koreaCDS.change,
      changePercent: koreaCDS.changePercent,
      unit: "bp",
      lastUpdated: now,
      source: "KCIF",
      id: "korea-cds",
    });
  } else {
    console.warn("Korea CDS data not available");
  }
  if (highYieldSpread) {
    indicators.push({
      category: "신용",
      name: "하이일드 스프레드",
      symbol: "HYG-TLT",
      value: highYieldSpread.price,
      change: highYieldSpread.change,
      changePercent: highYieldSpread.changePercent,
      unit: "bp",
      lastUpdated: now,
      source: "Yahoo Finance",
      id: "high-yield-spread",
    });
  }
  
  // FRED 데이터는 API 키가 필요하므로 주석 처리
  // 실제 구현 시 FRED API 키를 환경 변수로 설정 필요
  
  return indicators;
}

/**
 * 경제 상태 진단 (초록/주황/빨강)
 */
export function diagnoseEconomicStatus(indicators: EconomicIndicator[]): EconomicStatus {
  let score = 50; // 기본 점수
  const reasons: string[] = [];
  
  // 각 지표별 점수 계산
  indicators.forEach((ind) => {
    if (ind.value === null || ind.changePercent === null) return;
    
    switch (ind.category) {
      case "금리":
        // 금리 상승은 경제 압박 신호 (점수 감소)
        if (ind.changePercent > 5) {
          score -= 5;
          reasons.push(`${ind.name} 급등`);
        } else if (ind.changePercent > 2) {
          score -= 2;
        } else if (ind.changePercent < -2) {
          score += 2;
        }
        break;
        
      case "지수":
        // 주가지수 상승은 긍정 신호
        if (ind.name.includes("다우") || ind.name.includes("S&P") || ind.name.includes("나스닥")) {
          if (ind.changePercent > 2) {
            score += 3;
            reasons.push(`${ind.name} 상승`);
          } else if (ind.changePercent < -2) {
            score -= 3;
            reasons.push(`${ind.name} 하락`);
          }
        }
        // 달러 강세는 복합적
        if (ind.name.includes("달러")) {
          if (ind.changePercent > 2) {
            score -= 2;
          }
        }
        // 유가 상승은 인플레이션 압력
        if (ind.name.includes("WTI")) {
          if (ind.changePercent > 5) {
            score -= 3;
            reasons.push("유가 급등");
          }
        }
        break;
        
      case "심리":
        // VIX 상승은 공포 신호
        if (ind.name.includes("VIX")) {
          if (ind.changePercent > 10) {
            score -= 5;
            reasons.push("VIX 급등 (공포 확산)");
          } else if (ind.changePercent > 5) {
            score -= 2;
          } else if (ind.changePercent < -10) {
            score += 3;
            reasons.push("VIX 하락 (공포 완화)");
          }
        }
        // Fear & Greed Index
        if (ind.name.includes("Fear")) {
          if (ind.value !== null) {
            if (ind.value < 25) {
              score -= 5;
              reasons.push("극도의 공포");
            } else if (ind.value > 75) {
              score += 3;
              reasons.push("과도한 탐욕");
            }
          }
        }
        // 실업수당청구건수
        if (ind.name.includes("실업수당청구건수")) {
          if (ind.value !== null) {
            if (ind.value > 300) {
              score -= 5;
              reasons.push("실업수당청구건수 급증 (노동시장 약화)");
            } else if (ind.value > 250) {
              score -= 2;
            } else if (ind.value < 200) {
              score += 3;
              reasons.push("실업수당청구건수 감소 (노동시장 강세)");
            }
            // 변화율도 고려
            if (ind.changePercent !== null) {
              if (ind.changePercent > 10) {
                score -= 3;
                reasons.push("실업수당청구건수 급증");
              } else if (ind.changePercent < -10) {
                score += 2;
              }
            }
          }
        }
        break;
        
      case "신용":
        // 하이일드 스프레드 확대는 신용 경색 신호
        if (ind.name.includes("하이일드")) {
          if (ind.changePercent !== null && ind.changePercent > 10) {
            score -= 5;
            reasons.push("신용 스프레드 확대");
          }
        }
        break;
    }
  });
  
  // 점수 범위 제한
  score = Math.max(0, Math.min(100, score));
  
  // 상태 결정
  let status: "green" | "yellow" | "red";
  let summary: string;
  
  if (score >= 70) {
    status = "green";
    summary = "경제 지표가 안정적입니다. 성장 지표가 양호하고 시장 심리가 긍정적입니다.";
  } else if (score >= 40) {
    status = "yellow";
    summary = "경제 지표에 일부 우려 신호가 있습니다. 주의 깊은 관찰이 필요합니다.";
  } else {
    status = "red";
    summary = "경제 지표에 위험 신호가 다수 관측됩니다. 방어적 자산 배분을 고려하세요.";
  }
  
  if (reasons.length > 0) {
    summary += ` 주요 요인: ${reasons.slice(0, 3).join(", ")}`;
  }
  
  return {
    status,
    score,
    summary,
    indicators,
  };
}

/**
 * 특정 지표의 상세 데이터 가져오기
 */
export async function getIndicatorDetail(indicatorId: string, period: '1D' | '1M' | '1Y' | '5Y' | 'MAX' = '1M'): Promise<{
  indicator: EconomicIndicator | null;
  history: Array<{ date: string; value: number }>;
  analysis: string; // 통합된 자연스러운 분석 문장
  relatedNews?: Array<{ title: string; source: string; publishedAt: string }>;
  newsComment?: string;
}> {
  const indicators = await fetchAllEconomicIndicators();
  const indicator = indicators.find(ind => ind.id === indicatorId) || null;
  
  let history: Array<{ date: string; value: number }> = [];
  
  // 기간에 따른 데이터 범위 결정
  const now = new Date();
  let daysToFetch = 30; // 기본 1개월
  if (period === '1D') daysToFetch = 1;
  else if (period === '1M') daysToFetch = 30;
  else if (period === '1Y') daysToFetch = 365;
  else if (period === '5Y') daysToFetch = 1825;
  else if (period === 'MAX') daysToFetch = 10000; // 최대 데이터 (약 27년)
  
  // 기간에 따라 데이터를 새로 가져오기 (기존 history는 무시하고 기간에 맞게 재조회)
  if (indicator) {
    // 히스토리가 없으면 기간에 맞는 데이터 가져오기 시도
    try {
      // indicator.id 기반으로 FRED 시리즈 ID 결정
      let fredSeriesId: string | null = null;
      if (indicatorId === "fed-funds-rate") {
        fredSeriesId = "DFEDTARU"; // 상단금리 우선
      } else if (indicatorId === "yield-spread") {
        // 스프레드는 10Y와 2Y의 히스토리를 가져와서 계산
        try {
          const fredLimit = Math.min(daysToFetch, 10000);
          const [treasury10Y_FRED, treasury2Y_FRED] = await Promise.all([
            fetchFRED("DGS10", fredLimit),
            fetchFRED("DGS2", fredLimit),
          ]);
          
          if (treasury10Y_FRED?.history && treasury2Y_FRED?.history) {
            const dates = new Set([...treasury10Y_FRED.history.map(h => h.date), ...treasury2Y_FRED.history.map(h => h.date)]);
            const spreadHistory: Array<{ date: string; value: number }> = [];
            dates.forEach(date => {
              const val10Y_hist = treasury10Y_FRED.history!.find(h => h.date === date)?.value;
              const val2Y_hist = treasury2Y_FRED.history!.find(h => h.date === date)?.value;
              if (val10Y_hist !== undefined && val2Y_hist !== undefined) {
                spreadHistory.push({ date, value: val10Y_hist - val2Y_hist });
              }
            });
            spreadHistory.sort((a, b) => a.date.localeCompare(b.date));
            history = spreadHistory;
          }
        } catch (e) {
          console.error(`Failed to fetch yield spread history:`, e);
        }
      } else if (indicator.symbol.startsWith("DGS") || indicator.symbol === "DFF" || indicator.symbol === "DFEDTARU" || indicator.symbol === "ICSA" || indicator.symbol === "SOFR" || indicator.symbol === "RRPONTSYD" || indicator.symbol === "M2SL" || indicator.symbol === "UNRATE" || indicator.symbol === "STLFSI4") {
        fredSeriesId = indicator.symbol;
      }
      
      if (fredSeriesId) {
        // FRED API limit은 최대 100,000이지만, 실제로는 더 작은 값 사용
        const fredLimit = Math.min(daysToFetch, 10000);
        const fredData = await fetchFRED(fredSeriesId, fredLimit);
        if (fredData?.history) {
          history = fredData.history;
          
          // fed-funds-rate인 경우 FOMC 발표일만 필터링 (값이 0.01% 이상 변경된 날짜만)
          if (indicatorId === "fed-funds-rate" && history.length > 1) {
            const filteredHistory: Array<{ date: string; value: number }> = [history[0]];
            for (let i = 1; i < history.length; i++) {
              const prev = history[i - 1];
              const curr = history[i];
              const change = Math.abs(curr.value - prev.value);
              if (change >= 0.01) { // 0.01% 이상 변경된 경우만 포함
                filteredHistory.push(curr);
              }
            }
            history = filteredHistory;
          }
        }
      }
      
      // FRED 데이터가 아닌 경우 Yahoo Finance나 다른 소스 시도
      if (!history || history.length === 0) {
        if (indicator.symbol.startsWith("^") || indicator.symbol.includes("=") || indicator.symbol.includes(".")) {
        // Yahoo Finance 심볼인 경우 히스토리 가져오기
        try {
          // 기간별 최적화된 interval 설정
          let range = '1mo';
          let interval = '1d';
          
          if (period === '1D') {
            range = '1d';
            interval = '5m'; // 5분 간격
          } else if (period === '1M') {
            range = '1mo';
            interval = '1d';
          } else if (period === '1Y') {
            range = '1y';
            interval = '1d';
          } else if (period === '5Y') {
            range = '5y';
            interval = '1wk'; // 주간 데이터
          } else if (period === 'MAX') {
            range = 'max';
            interval = '1mo'; // 월간 데이터
          }
          
          const cleanSymbol = indicator.symbol.replace(/[^A-Z0-9=.-]/g, "");
          const url = `https://query1.finance.yahoo.com/v8/finance/chart/${cleanSymbol}?interval=${interval}&range=${range}`;
          const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
          if (response.ok) {
            const data = await response.json();
            const result = data.chart?.result?.[0];
            if (result && result.timestamp) {
              // VIX 같은 경우 quote.close가 아닌 다른 필드에 있을 수 있음
              let values: number[] = [];
              if (result.indicators?.quote?.[0]?.close) {
                values = result.indicators.quote[0].close;
              } else if (result.indicators?.adjclose?.[0]?.adjclose) {
                values = result.indicators.adjclose[0].adjclose;
              } else if (result.indicators?.quote?.[0]?.open) {
                values = result.indicators.quote[0].open;
              } else if (result.indicators?.quote?.[0]?.high) {
                values = result.indicators.quote[0].high;
              }
              
              if (values && values.length > 0) {
                const timestamps = result.timestamp;
                history = timestamps.map((ts: number, idx: number) => ({
                  date: new Date(ts * 1000).toISOString().split('T')[0],
                  value: values[idx] || 0,
                })).filter((h: { date: string; value: number }) => h.value > 0);
              }
            }
          }
        } catch (e) {
          console.error(`Failed to fetch Yahoo history for ${indicatorId}:`, e);
        }
        } else if (indicatorId === "fear-greed-index") {
        // Fear & Greed Index는 CNN API 또는 Alternative.me API에서 히스토리 가져오기
        try {
          // CNN API 시도
          const cnnResponse = await fetch("https://production.dataviz.cnn.io/index/fearandgreed/graphdata", {
            headers: { "User-Agent": "Mozilla/5.0" }
          });
          if (cnnResponse.ok) {
            const cnnData = await cnnResponse.json();
            if (cnnData.fear_and_greed && cnnData.fear_and_greed.data) {
              history = cnnData.fear_and_greed.data.map((item: any) => ({
                date: item.date || new Date(item.timestamp || Date.now()).toISOString().split('T')[0],
                value: item.value || item.score || 0,
              })).reverse();
            }
          } else {
            // 대안: Alternative.me API
            const limit = period === '1D' ? 1 : period === '1M' ? 30 : period === '1Y' ? 365 : period === '5Y' ? 1825 : 10000;
            const response = await fetch(`https://api.alternative.me/fng/?limit=${limit}`);
            if (response.ok) {
              const data = await response.json();
              if (data.data) {
                history = data.data.map((item: any) => ({
                  date: new Date(parseInt(item.timestamp) * 1000).toISOString().split('T')[0],
                  value: parseInt(item.value, 10),
                })).reverse();
              }
            }
          }
        } catch (e) {
          console.error(`Failed to fetch Fear & Greed history:`, e);
        }
      } else if (indicatorId === "high-yield-spread") {
        // 하이일드 스프레드는 HYG와 TLT의 차이로 계산
        try {
          let range = '1mo';
          let interval = '1d';
          if (period === '1D') { range = '1d'; interval = '5m'; }
          else if (period === '1M') { range = '1mo'; interval = '1d'; }
          else if (period === '1Y') { range = '1y'; interval = '1d'; }
          else if (period === '5Y') { range = '5y'; interval = '1wk'; }
          else if (period === 'MAX') { range = 'max'; interval = '1mo'; }
          
          const [hygResponse, tltResponse] = await Promise.all([
            fetch(`https://query1.finance.yahoo.com/v8/finance/chart/HYG?interval=${interval}&range=${range}`, { headers: { "User-Agent": "Mozilla/5.0" } }),
            fetch(`https://query1.finance.yahoo.com/v8/finance/chart/TLT?interval=${interval}&range=${range}`, { headers: { "User-Agent": "Mozilla/5.0" } })
          ]);
          
          if (hygResponse.ok && tltResponse.ok) {
            const [hygData, tltData] = await Promise.all([hygResponse.json(), tltResponse.json()]);
            const hygResult = hygData.chart?.result?.[0];
            const tltResult = tltData.chart?.result?.[0];
            
            if (hygResult && tltResult && hygResult.timestamp && tltResult.timestamp) {
              const hygTimestamps = hygResult.timestamp;
              const hygCloses = hygResult.indicators.quote[0].close;
              const tltCloses = tltResult.indicators.quote[0].close;
              
              // 타임스탬프 매칭하여 스프레드 계산
              const spreadMap = new Map<string, number>();
              hygTimestamps.forEach((ts: number, idx: number) => {
                const date = new Date(ts * 1000).toISOString().split('T')[0];
                const tltIdx = tltResult.timestamp.findIndex((t: number) => 
                  new Date(t * 1000).toISOString().split('T')[0] === date
                );
                if (tltIdx >= 0 && hygCloses[idx] && tltCloses[tltIdx]) {
                  const spread = ((hygCloses[idx] / tltCloses[tltIdx]) - 1) * 10000; // bp 단위
                  spreadMap.set(date, spread);
                }
              });
              
              history = Array.from(spreadMap.entries()).map(([date, value]) => ({ date, value }));
            }
          }
        } catch (e) {
          console.error(`Failed to fetch high yield spread history:`, e);
        }
      }
      }
    } catch (e) {
      console.error(`Failed to fetch history for ${indicatorId}:`, e);
    }
  }
  
  // 통합된 자연스러운 분석 생성
  const analysis = await generateUnifiedAnalysis(indicator, history);
  
  // 관련 뉴스 가져오기
  let relatedNews: Array<{ title: string; source: string; publishedAt: string }> = [];
  let newsComment = "none";
  
  if (indicator) {
    try {
      relatedNews = await fetchRelatedNews(indicator.name, indicator.category);
      
      // 뉴스가 있으면 경제 코치 코멘트 생성
      if (relatedNews.length > 0) {
        const newsTitles = relatedNews.map(n => n.title).join(", ");
        newsComment = `최근 ${indicator.name}와 관련된 뉴스(${relatedNews.length}건)를 종합하면, ${newsTitles} 등의 이슈가 시장에 영향을 미치고 있습니다. 이러한 뉴스는 ${indicator.name}의 ${indicator.changePercent !== null && indicator.changePercent > 0 ? "상승" : indicator.changePercent !== null && indicator.changePercent < 0 ? "하락" : "변동"} 추세와 연관되어 있으며, 거시경제 환경 변화를 반영하고 있습니다. 투자자는 이러한 뉴스와 지표 변동을 종합적으로 고려하여 자산 배분을 조정해야 합니다.`;
      }
    } catch (e) {
      console.error("Failed to fetch related news:", e);
    }
  }
  
  return {
    indicator,
    history,
    analysis,
    relatedNews,
    newsComment,
    relatedIndicators,
    comprehensiveAnalysis,
  };
}

/**
 * 연관 지표 찾기
 */
function getRelatedIndicators(indicatorId: string, allIndicators: EconomicIndicator[]): Array<{ id: string; name: string; category: string }> {
  const related: Array<{ id: string; name: string; category: string }> = [];
  
  // 지표별 연관 지표 매핑
  const relatedMap: Record<string, string[]> = {
    "fed-funds-rate": ["sofr", "treasury-10y", "treasury-2y", "yield-spread"],
    "sofr": ["fed-funds-rate", "on-rrp", "treasury-10y"],
    "on-rrp": ["sofr", "fed-funds-rate"],
    "treasury-10y": ["treasury-2y", "yield-spread", "fed-funds-rate", "sofr"],
    "treasury-2y": ["treasury-10y", "yield-spread", "fed-funds-rate"],
    "yield-spread": ["treasury-10y", "treasury-2y", "fed-funds-rate"],
    "dxy": ["fed-funds-rate", "wti", "sp500"],
    "wti": ["dxy", "sp500"],
    "sp500": ["vix", "fed-funds-rate", "dxy"],
    "vix": ["sp500", "fear-greed-index"],
    "fear-greed-index": ["vix", "sp500"],
    "initial-jobless-claims": ["unemployment-rate", "fed-funds-rate"],
    "unemployment-rate": ["initial-jobless-claims", "fed-funds-rate"],
    "m2": ["fed-funds-rate", "sp500"],
    "high-yield-spread": ["fed-funds-rate", "sp500", "vix"],
    "korea-bank-cds": ["fed-funds-rate", "dxy"],
    "stlfsi4": ["fed-funds-rate", "vix", "sp500"],
  };
  
  const relatedIds = relatedMap[indicatorId] || [];
  relatedIds.forEach(id => {
    const ind = allIndicators.find(i => i.id === id);
    if (ind && ind.id) {
      related.push({ id: ind.id, name: ind.name, category: ind.category });
    }
  });
  
  return related.slice(0, 5); // 최대 5개
}

/**
 * 종합해석 생성 (여러 지표를 함께 분석)
 */
async function generateComprehensiveAnalysis(
  indicator: EconomicIndicator | null,
  allIndicators: EconomicIndicator[],
  relatedIndicators: Array<{ id: string; name: string; category: string }>
): Promise<string> {
  if (!indicator) return "";
  
  const related = relatedIndicators.map(ri => allIndicators.find(i => i.id === ri.id)).filter(Boolean) as EconomicIndicator[];
  
  let analysis = "";
  
  // 지표별 종합해석
  if (indicator.id === "fed-funds-rate") {
    const sofr = related.find(r => r.id === "sofr");
    const spread = allIndicators.find(i => i.id === "yield-spread");
    const sp500 = allIndicators.find(i => i.id === "sp500");
    
    analysis = `[종합해석] 기준금리(${indicator.value?.toFixed(2)}%)와 관련 지표들을 함께 분석하면, `;
    if (sofr && sofr.value) {
      const sofrSpread = sofr.value - (indicator.value || 0);
      analysis += `SOFR(${sofr.value.toFixed(2)}%)와의 스프레드는 ${sofrSpread.toFixed(2)}%p로 ${sofrSpread > 0.1 ? "시장 유동성 경색 신호" : "정상 범위"}입니다. `;
    }
    if (spread && spread.value) {
      analysis += `금리스프레드(${spread.value.toFixed(2)}%p)는 ${spread.value < 0 ? "역전되어 경기 침체 우려" : spread.value < 1 ? "축소되어 경기 둔화 신호" : "정상 범위로 경기 회복 기대"}를 나타냅니다. `;
    }
    if (sp500 && sp500.changePercent !== null) {
      analysis += `주식 시장(${sp500.changePercent > 0 ? "상승" : "하락"})은 연준의 금리 정책에 ${sp500.changePercent > 0 ? "긍정적으로 반응" : "부정적으로 반응"}하고 있습니다.`;
    }
  } else if (indicator.id === "sofr") {
    const fedRate = allIndicators.find(i => i.id === "fed-funds-rate");
    const onRrp = allIndicators.find(i => i.id === "on-rrp");
    
    analysis = `[종합해석] SOFR(${indicator.value?.toFixed(2)}%)는 단기 자금 시장의 리스크를 나타내는 중요한 지표입니다. `;
    if (fedRate && fedRate.value) {
      const spread = (indicator.value || 0) - fedRate.value;
      analysis += `기준금리(${fedRate.value.toFixed(2)}%)와의 스프레드(${spread.toFixed(2)}%p)는 ${spread > 0.2 ? "시장 스트레스가 높음" : "정상 범위"}을 의미합니다. `;
    }
    if (onRrp && onRrp.value) {
      analysis += `ON RRP(${onRrp.value.toFixed(1)}십억 달러)는 연준의 유동성 흡수 수단으로, ${onRrp.value > 1000 ? "대규모 유동성 흡수" : "정상 범위"}를 나타냅니다.`;
    }
  } else if (indicator.id === "sp500") {
    const fedRate = allIndicators.find(i => i.id === "fed-funds-rate");
    const vix = allIndicators.find(i => i.id === "vix");
    const m2 = allIndicators.find(i => i.id === "m2");
    
    analysis = `[종합해석] S&P500(${indicator.value?.toFixed(2)}점)의 움직임은 여러 거시경제 지표와 연관되어 있습니다. `;
    if (fedRate && fedRate.value) {
      analysis += `기준금리(${fedRate.value.toFixed(2)}%)가 ${fedRate.value > 4 ? "높은 수준" : "낮은 수준"}에서 주식 시장은 ${indicator.changePercent && indicator.changePercent > 0 ? "상승" : "하락"}하고 있어, ${fedRate.value > 4 && indicator.changePercent && indicator.changePercent > 0 ? "연준의 정책 전환 기대가 반영" : "금리 영향이 지속"}되고 있습니다. `;
    }
    if (vix && vix.value) {
      analysis += `VIX(${vix.value.toFixed(2)})는 ${vix.value > 20 ? "높은 변동성으로 시장 불안" : "낮은 변동성으로 시장 안정"}을 나타냅니다. `;
    }
    if (m2 && m2.changePercent !== null) {
      analysis += `M2 통화량(${m2.changePercent > 0 ? "증가" : "감소"})은 유동성 환경을 반영하며, 주식 시장에 ${m2.changePercent > 0 ? "긍정적" : "부정적"} 영향을 미칩니다.`;
    }
  } else if (indicator.id === "initial-jobless-claims" || indicator.id === "unemployment-rate") {
    const fedRate = allIndicators.find(i => i.id === "fed-funds-rate");
    const sp500 = allIndicators.find(i => i.id === "sp500");
    
    analysis = `[종합해석] 노동시장 지표(${indicator.name})는 연준의 통화정책과 밀접한 관련이 있습니다. `;
    if (indicator.id === "initial-jobless-claims") {
      const unemployment = allIndicators.find(i => i.id === "unemployment-rate");
      if (unemployment && unemployment.value) {
        analysis += `실업률(${unemployment.value.toFixed(2)}%)과 함께 보면, `;
      }
    }
    if (fedRate && fedRate.value) {
      analysis += `기준금리(${fedRate.value.toFixed(2)}%)는 노동시장 강도에 따라 조정되며, `;
    }
    if (sp500 && sp500.value) {
      analysis += `주식 시장은 노동시장 개선을 ${sp500.changePercent && sp500.changePercent > 0 ? "긍정적으로 반영" : "부정적으로 반영"}하고 있습니다.`;
    }
  } else {
    // 기본 종합해석
    if (related.length > 0) {
      analysis = `[종합해석] ${indicator.name}(${indicator.value?.toFixed(2)}${indicator.unit})는 `;
      related.slice(0, 2).forEach((r, idx) => {
        if (idx > 0) analysis += ", ";
        analysis += `${r.name}(${r.value?.toFixed(2)}${r.unit})`;
      });
      analysis += ` 등과 함께 분석하면 더 정확한 경제 환경을 파악할 수 있습니다.`;
    }
  }
  
  return analysis;
}

/**
 * 통합된 자연스러운 분석 생성 (다른 데이터와 뉴스 종합 분석)
 */
async function generateUnifiedAnalysis(indicator: EconomicIndicator | null, history: Array<{ date: string; value: number }>): Promise<string> {
  if (!indicator || indicator.value === null) {
    return "데이터가 없어 분석할 수 없습니다.";
  }
  
  const change = indicator.change || 0;
  const changePercent = indicator.changePercent || 0;
  const value = indicator.value;
  
  // 다른 지표들과의 상관관계 분석을 위해 전체 지표 가져오기
  let allIndicators: EconomicIndicator[] = [];
  try {
    allIndicators = await fetchAllEconomicIndicators();
  } catch (e) {
    console.error("Failed to fetch all indicators for analysis:", e);
  }
  
  // 히스토리 데이터 분석
  let trend = "안정적";
  let volatility = "낮음";
  let recentDirection = change >= 0 ? "상승" : "하락";
  let historicalContext = "";
  let cyclePosition = "";
  let correlationInsight = "";
  let macroContext = "";
  
  if (history.length > 0) {
    const values = history.map(h => h.value).filter(v => v > 0);
    if (values.length > 1) {
      const min = Math.min(...values);
      const max = Math.max(...values);
      const range = max - min;
      const avg = values.reduce((a, b) => a + b, 0) / values.length;
      volatility = (range / avg) * 100 > 10 ? "높음" : (range / avg) * 100 > 5 ? "보통" : "낮음";
      
      // 현재 값이 평균 대비 어느 위치인지
      const deviationFromAvg = ((value - avg) / avg) * 100;
      if (deviationFromAvg > 10) historicalContext = "역사적 평균 대비 상당히 높은 수준";
      else if (deviationFromAvg > 5) historicalContext = "역사적 평균 대비 높은 수준";
      else if (deviationFromAvg < -10) historicalContext = "역사적 평균 대비 상당히 낮은 수준";
      else if (deviationFromAvg < -5) historicalContext = "역사적 평균 대비 낮은 수준";
      else historicalContext = "역사적 평균 수준";
      
      // 사이클 위치 분석 (최근 1년 데이터 기준)
      if (values.length >= 30) {
        const recent30 = values.slice(-30);
        const recentMax = Math.max(...recent30);
        const recentMin = Math.min(...recent30);
        const currentPosition = (value - recentMin) / (recentMax - recentMin);
        if (currentPosition > 0.8) cyclePosition = "사이클 상단 근처";
        else if (currentPosition > 0.6) cyclePosition = "사이클 상승 구간";
        else if (currentPosition < 0.2) cyclePosition = "사이클 하단 근처";
        else if (currentPosition < 0.4) cyclePosition = "사이클 하락 구간";
        else cyclePosition = "사이클 중간 구간";
      }
      
      // 최근 7일 vs 이전 7일 비교
      if (values.length >= 14) {
        const recent7 = values.slice(-7);
        const previous7 = values.slice(-14, -7);
        const recentAvg = recent7.reduce((a, b) => a + b, 0) / recent7.length;
        const previousAvg = previous7.reduce((a, b) => a + b, 0) / previous7.length;
        if (recentAvg > previousAvg * 1.02) trend = "상승 추세";
        else if (recentAvg < previousAvg * 0.98) trend = "하락 추세";
        else trend = "안정적";
      }
    }
  }
  
  // 다른 지표들과의 상관관계 분석
  if (allIndicators.length > 0) {
    if (indicator.category === "금리") {
      const vix = allIndicators.find(i => i.id === "vix");
      const sp500 = allIndicators.find(i => i.id === "sp500");
      const dxy = allIndicators.find(i => i.id === "dxy");
      if (vix && sp500) {
        if (value > 4 && vix.value && vix.value > 20) {
          correlationInsight = "기준금리 상승과 VIX 상승이 동시에 나타나 시장 불안이 확대되고 있음을 시사합니다. 이는 연준의 긴축 정책이 시장 리스크 인식을 높이고 있음을 의미합니다.";
        } else if (value < 3 && sp500.value && sp500.changePercent && sp500.changePercent > 0) {
          correlationInsight = "낮은 금리 환경에서 주식 시장이 상승하고 있어 유동성 추구 현상이 나타나고 있습니다. 이는 연준의 완화적 정책이 자산 가격에 긍정적 영향을 미치고 있음을 보여줍니다.";
        }
      }
      if (dxy && dxy.value) {
        if (value > 4 && dxy.value > 105) {
          macroContext = "높은 금리와 강한 달러가 동시에 나타나고 있어, 이는 글로벌 자본이 미국으로 유입되고 있음을 의미합니다. 신흥국 통화와 자산에 압박을 줄 수 있습니다.";
        }
      }
    } else if (indicator.category === "심리") {
      const sp500 = allIndicators.find(i => i.id === "sp500");
      const vix = allIndicators.find(i => i.id === "vix");
      if (sp500 && sp500.changePercent !== null && vix && vix.value) {
        if (value < 30 && sp500.changePercent < 0 && vix.value > 25) {
          correlationInsight = "극도의 공포 상태와 주식 하락, 높은 변동성이 동반되어 있는데, 이는 과매도 구간으로 해석될 수 있습니다. 역사적으로 이러한 극단적 상황은 반등의 전조가 되기도 합니다.";
        } else if (value > 70 && sp500.changePercent > 0 && vix.value < 15) {
          correlationInsight = "과도한 탐욕 상태에서 주식이 상승하고 변동성이 낮은 상황은 조정 위험이 커지고 있음을 시사합니다. 시장이 과열 상태일 가능성이 높습니다.";
        }
      }
    } else if (indicator.category === "지수") {
      const dxy = allIndicators.find(i => i.id === "dxy");
      const wti = allIndicators.find(i => i.id === "wti");
      const fedRate = allIndicators.find(i => i.id === "fed-funds-rate");
      if (indicator.id === "dxy" && wti && fedRate) {
        if (value > 105 && wti.value && wti.changePercent && wti.changePercent < 0 && fedRate.value && fedRate.value > 4) {
          correlationInsight = "달러 강세, 유가 하락, 높은 금리가 동시에 나타나고 있어, 이는 글로벌 수요 둔화와 연준의 긴축 정책이 결합된 결과입니다. 신흥국과 원자재 수출국에 부담을 줄 수 있습니다.";
        }
      } else if (indicator.id === "sp500" || indicator.id === "dow" || indicator.id === "nasdaq") {
        const fedRate = allIndicators.find(i => i.id === "fed-funds-rate");
        const vix = allIndicators.find(i => i.id === "vix");
        if (fedRate && vix) {
          if (value > 0 && fedRate.value && fedRate.value > 4 && vix.value && vix.value < 15) {
            macroContext = "높은 금리 환경임에도 주식이 상승하고 변동성이 낮은 것은 시장이 연준의 정책 전환을 기대하고 있거나, 기업 실적이 예상을 상회하고 있음을 의미할 수 있습니다.";
          }
        }
      }
    } else if (indicator.category === "신용") {
      const fedRate = allIndicators.find(i => i.id === "fed-funds-rate");
      const sp500 = allIndicators.find(i => i.id === "sp500");
      if (fedRate && sp500) {
        if (value > 500 && fedRate.value && fedRate.value > 4) {
          correlationInsight = "높은 하이일드 스프레드와 높은 금리가 동시에 나타나고 있어, 이는 신용 경색이 심화되고 있음을 의미합니다. 기업의 차입 비용이 증가하여 실적에 부담을 줄 수 있습니다.";
        } else if (value < 300 && sp500.changePercent && sp500.changePercent > 0) {
          correlationInsight = "낮은 스프레드와 주식 상승이 동반되어 있어, 신용 환경이 개선되고 있음을 시사합니다. 이는 기업의 자금 조달 여건이 양호함을 의미합니다.";
        }
      }
    }
  }
  
  // 카테고리별 종합 분석 생성
  let analysis = "";
  
  switch (indicator.category) {
    case "금리":
      if (indicator.name.includes("기준금리")) {
        const policyContext = value > 5 ? "연준이 강력한 긴축 정책을 펼치고 있으며" : value > 3 ? "연준이 중립적 통화정책으로 전환 중이며" : "연준이 완화적 통화정책 기조를 유지하고 있으며";
        analysis = `[현재 상황] 미국 기준금리는 ${value.toFixed(2)}%로 ${historicalContext}입니다. ${policyContext}, 이는 ${change >= 0 ? "인플레이션 억제를 위한 정책 의지" : "경기 부양을 위한 정책 여지"}를 나타냅니다. ${cyclePosition ? `현재 ${cyclePosition}에 위치해 있으며,` : ""} ${trend}을 보이고 있습니다.

[시장 해석] ${correlationInsight || "시장은 연준의 다음 FOMC 회의 결과를 주시하고 있으며, 금리 전망에 따라 자산 배분을 조정하고 있습니다."} ${macroContext || ""} 장기적으로는 경제 성장률과 인플레이션 목표 사이의 균형을 유지하려는 연준의 정책 의도가 드러나고 있습니다.

[투자 시사점] 금리 ${recentDirection} 환경에서는 ${change >= 0 ? "채권과 현금의 상대적 매력이 높아지고, 부채 비중이 높은 기업과 부동산에 부담이 될 수 있습니다" : "주식과 리스크 자산의 상대적 매력이 높아지고, 기업 투자와 소비가 촉진될 수 있습니다"}. 투자자는 연준의 정책 전환 시점을 주시하고 자산 배분을 조정해야 합니다.`;
      } else if (indicator.name.includes("스프레드")) {
        const spreadStatus = value > 0 ? "정상적인 수익률 곡선" : "역전 신호";
        const spreadImplication = value < 0 ? "경기 침체 우려가 높아지고 있으며" : value < 1 ? "경기 둔화 신호가 나타나고 있으며" : "경기 회복 신호가 나타나고 있으며";
        analysis = `[현재 상황] 금리스프레드(10Y-2Y)는 ${value.toFixed(2)}%p로 ${spreadStatus}를 보이고 있으며, ${historicalContext}입니다. ${spreadImplication} ${cyclePosition ? `현재 ${cyclePosition}에 위치해 있습니다.` : ""} ${trend}을 나타내고 있습니다.

[경기 사이클 해석] ${correlationInsight || "장단기 금리 차이는 경기 사이클의 중요한 선행 지표로, 투자자들은 이 지표를 통해 경기 전환점을 예측합니다."} ${value < 0 ? "역전된 수익률 곡선은 과거 경기 침체의 선행 지표로 작용해왔으며, 현재 수준은 경기 둔화 우려를 시사합니다" : value > 2 ? "넓은 스프레드는 경기 회복 기대를 반영하며, 경제 성장 전망이 긍정적임을 의미합니다" : "현재 스프레드는 경기 사이클의 중간 단계를 나타냅니다"}.

[투자 시사점] ${spreadImplication} 자산 배분 전략에 중요한 시사점을 제공합니다. 스프레드가 확대되면(정상 곡선) 경기 회복 기대가 커져 주식과 리스크 자산에 유리하며, 스프레드가 축소되거나 역전되면 경기 둔화 우려가 커져 방어적 자산(채권, 현금)에 유리합니다.`;
      } else {
        const rateMeaning = indicator.name.includes("3개월") ? "단기 유동성과 시장 기대를 반영하며" : indicator.name.includes("2년") ? "중기 통화정책 기대를 반영하며" : "장기 인플레이션과 경기 전망을 반영하며";
        analysis = `[현재 상황] ${indicator.name}는 ${value.toFixed(2)}%로 ${historicalContext}입니다. ${rateMeaning} ${trend}을 보이고 있습니다. ${cyclePosition ? `현재 ${cyclePosition}에 위치해 있습니다.` : ""}

[시장 해석] ${correlationInsight || `${indicator.name}의 ${recentDirection} 추세는 ${change >= 0 ? "인플레이션 압력이 지속되고 있음을 의미하며" : "디플레이션 우려가 나타나고 있음을 의미하며"}, 시장은 연준의 정책 방향에 민감하게 반응하고 있습니다`}. ${macroContext || ""}

[투자 시사점] ${indicator.name}의 ${recentDirection} 추세는 ${change >= 0 ? "차입 비용 상승으로 기업과 가계의 부채 부담을 증가시킬 수 있으며" : "차입 비용 하락으로 기업 투자와 소비를 촉진할 수 있으며"} 자산 가격에 영향을 미칩니다. 투자자는 이 지표를 통해 통화정책 전환점을 예측하고 자산 배분을 조정할 수 있습니다.`;
      }
      break;
      
    case "심리":
      if (indicator.name.includes("Fear & Greed")) {
        const level = value < 25 ? "극도의 공포" : value < 45 ? "공포" : value < 55 ? "중립" : value < 75 ? "탐욕" : "극도의 탐욕";
        analysis = `[현재 상황] Fear & Greed Index는 ${value}점(${level})으로 ${historicalContext}입니다. ${cyclePosition ? `현재 ${cyclePosition}에 위치해 있으며,` : ""} ${trend}을 보이고 있습니다.

[시장 심리 해석] ${correlationInsight || `시장 심리가 ${change >= 0 ? "낙관적" : "비관적"}으로 전환되고 있으며, 투자자들의 리스크 선호도가 변화하고 있어 자산 가격 변동성에 직접적인 영향을 미칩니다`}. ${value < 25 ? "역사적으로 극도의 공포 상태는 매수 기회로 해석될 수 있으나, 근본적인 문제가 해결되지 않으면 추가 하락이 있을 수 있습니다" : value > 75 ? "과도한 탐욕 상태는 조정 가능성을 시사하며, 시장이 과열 상태일 가능성이 높습니다" : "현재 수준은 시장의 균형 상태를 나타내며, 특별한 시장 이벤트가 없다면 안정적 흐름이 예상됩니다"}.

[투자 시사점] ${value < 25 ? "극도의 공포 상태는 역행 투자 관점에서 매수 기회로 해석될 수 있으나, 리스크 관리가 중요합니다" : value > 75 ? "과도한 탐욕 상태는 조정 위험이 높아지므로 방어적 자산 배분을 고려해야 합니다" : "현재 수준은 시장의 균형 상태로, 감정에 휘둘리지 않고 객관적인 분석을 유지해야 합니다"}. 투자자는 시장 심리 지표를 참고하되, 근본적인 가치 분석과 함께 판단해야 합니다.`;
      } else if (indicator.name.includes("실업수당청구건수")) {
        const claimsStatus = value > 300 ? "높은 수준" : value > 250 ? "보통 수준" : "낮은 수준";
        const claimsImplication = value > 300 ? "노동 시장이 약화되고 있으며, 경기 둔화 신호가 나타나고 있습니다" : value < 200 ? "노동 시장이 강세를 보이고 있으며, 경기 회복 신호가 나타나고 있습니다" : "노동 시장이 안정적이며, 경기 전망이 중립적입니다";
        analysis = `[현재 상황] 실업수당청구건수는 ${value.toLocaleString("en-US")}천 명으로 ${historicalContext}입니다. ${claimsStatus}이며, ${trend}을 보이고 있습니다. ${cyclePosition ? `현재 ${cyclePosition}에 위치해 있습니다.` : ""}

[노동 시장 해석] ${claimsImplication}. ${correlationInsight || `실업수당청구건수의 ${recentDirection} 추세는 노동 시장의 건강성과 경제 전망을 나타내는 중요한 선행 지표입니다`}. ${change >= 0 ? "청구건수 증가는 기업의 고용 감소와 경기 둔화를 시사하며, 이는 소비 위축과 경제 성장 둔화로 이어질 수 있습니다" : "청구건수 감소는 기업의 고용 안정과 경기 회복을 시사하며, 이는 소비 증가와 경제 성장 촉진으로 이어질 수 있습니다"}. ${value > 300 ? "역사적으로 높은 청구건수는 경기 침체의 선행 지표로 작용해왔으며, 현재 수준은 경기 둔화 우려를 시사합니다" : value < 200 ? "낮은 청구건수는 강한 노동 시장을 나타내며, 이는 소비자 신뢰와 경제 성장에 긍정적입니다" : "현재 수준은 노동 시장의 정상 범위 내에 있으며, 큰 변화 없이 안정적으로 유지되고 있습니다"}.

[투자 시사점] 실업수당청구건수의 ${recentDirection} 추세는 자산 배분에 중요한 시사점을 제공합니다. ${change >= 0 ? "청구건수 증가는 경기 둔화 우려를 높여 방어적 자산(고품질 채권, 현금)에 유리하며, 리스크 자산(주식, 하이일드 채권)에는 부정적입니다" : "청구건수 감소는 경기 회복 기대를 높여 리스크 자산에 유리하며, 방어적 자산의 상대적 매력은 감소합니다"}. 투자자는 이 지표를 통해 노동 시장의 건강성과 경기 사이클 전환점을 예측하고 자산 배분을 조정할 수 있습니다. 연준은 이 지표를 통화정책 결정의 중요한 참고 자료로 활용하며, 노동 시장 강도에 따라 금리 정책을 조정할 수 있습니다.`;
      } else {
        analysis = `[현재 상황] ${indicator.name}는 ${value.toFixed(2)}로 ${historicalContext}입니다. ${trend}을 보이고 있으며, 변동성은 ${volatility} 수준입니다.

[시장 해석] ${correlationInsight || `${indicator.name}의 ${recentDirection} 추세는 시장 환경 변화를 나타내며, 투자자들의 리스크 인식 변화를 보여줍니다`}. ${Math.abs(changePercent || 0) > 10 ? "높은 변동성은 시장 불확실성이 증가했음을 의미하며, 이는 자산 가격의 급격한 변동을 초래할 수 있습니다" : "상대적 안정은 시장이 현재 수준을 수용하고 있음을 의미합니다"}.

[투자 시사점] ${indicator.name}의 ${recentDirection} 추세는 자산 배분 전략에 중요한 참고 자료가 됩니다. 높은 변동성 환경에서는 포트폴리오 다각화를 통해 리스크를 분산시켜야 하며, 변동성 관리 전략을 수립해야 합니다.`;
      }
      break;
      
    case "지수":
      const indexContext = indicator.name.includes("달러") 
        ? "달러 강세는 글로벌 자본 유입과 연준 정책을 반영하며, 수출 경쟁력과 신흥국 자본 유출에 영향을 미칩니다"
        : indicator.name.includes("유가")
        ? "유가 변동은 공급·수요와 지정학적 요인을 반영하며, 인플레이션과 기업 수익성에 직접적인 영향을 미칩니다"
        : "주가지수는 기업 실적과 시장 유동성을 반영하며, 경제 전망과 투자자 심리를 나타냅니다";
      analysis = `[현재 상황] ${indicator.name}는 ${value.toFixed(2)}${indicator.unit}로 ${historicalContext}입니다. ${trend}을 보이고 있으며, 변동성은 ${volatility} 수준입니다.

[거시경제 해석] ${indexContext}. ${correlationInsight || macroContext || `${indicator.name}의 ${recentDirection} 추세는 거시경제 환경 변화를 나타내고 있습니다`}. ${indicator.name.includes("달러") ? "달러 강세는 신흥국 자본 유출과 원자재 가격 하락 압력을 만들 수 있으며, 반대로 달러 약세는 신흥국 자본 유입과 원자재 가격 상승을 촉진할 수 있습니다" : indicator.name.includes("유가") ? "유가 상승은 인플레이션 압력을 높이고 소비자 구매력을 약화시킬 수 있으며, 반대로 유가 하락은 인플레이션 완화와 소비 여력을 높일 수 있습니다" : "주가지수 상승은 경제 회복 기대를 반영하며 기업 수익성 개선을 시사하지만, 과도한 상승은 평가 밸류에이션 우려를 높일 수 있습니다"}.

[투자 시사점] ${indicator.name}의 ${recentDirection} 추세는 자산 배분에 중요한 시사점을 제공합니다. ${indicator.name.includes("달러") ? "달러 강세 환경에서는 달러 자산과 수출 기업에 유리하며, 신흥국 자산에는 부담이 될 수 있습니다" : indicator.name.includes("유가") ? "유가 상승 환경에서는 에너지 섹터와 원자재에 유리하며, 소비재와 운송업에는 부담이 될 수 있습니다" : "주가지수 상승 환경에서는 주식 투자에 유리하지만, 평가 밸류에이션이 높아지면 조정 위험이 커질 수 있습니다"}. 투자자는 이 지표를 통해 거시경제 흐름을 파악하고 자산 배분을 조정할 수 있습니다.`;
      break;
      
    case "신용":
      const creditContext = value > 500 ? "높은 스프레드는 신용 경색과 금융 시스템 스트레스를 나타내며" : "낮은 스프레드는 신용 여유와 금융 시스템 안정을 나타내며";
      analysis = `[현재 상황] ${indicator.name}는 ${value.toFixed(2)}${indicator.unit}로 ${historicalContext}입니다. ${creditContext} ${trend}을 보이고 있습니다.

[금융 시스템 해석] ${correlationInsight || `${indicator.name}는 금융 시스템의 건강성과 시장 리스크 인식을 나타내는 중요한 신호입니다`}. ${value > 500 ? "높은 스프레드는 기업의 차입 비용이 증가하고 있음을 의미하며, 이는 기업 실적에 부담을 줄 수 있습니다" : "낮은 스프레드는 기업의 자금 조달 여건이 양호함을 의미하며, 이는 기업 투자와 성장에 긍정적입니다"}.

[투자 시사점] ${creditContext} 자산 배분에 중요한 시사점을 제공합니다. 스프레드 확대는 신용 경색과 유동성 위험을 시사하여 리스크 자산(주식, 하이일드 채권)에 부정적이며, 방어적 자산(고품질 채권, 현금)에 유리합니다. 반대로 스프레드 축소는 신용 여유와 유동성 개선을 시사하여 리스크 자산에 긍정적입니다. 현재 수준은 ${value > 500 ? "신용 리스크 관리에 주의가 필요하며" : "신용 환경이 안정적이며"} 투자자는 신용 사이클 전환점을 주시해야 합니다.`;
      break;
      
    default:
      analysis = `[현재 상황] ${indicator.name}는 ${value.toFixed(2)}${indicator.unit}로 ${historicalContext}입니다. ${trend}을 보이고 있으며, 변동성은 ${volatility} 수준입니다.

[시장 해석] ${correlationInsight || `${indicator.name}의 ${recentDirection} 추세는 경제 환경 변화를 나타내며, 투자 결정에 중요한 참고 자료가 됩니다`}. ${macroContext || ""}

[투자 시사점] ${indicator.name}의 ${recentDirection} 추세는 거시경제 흐름을 파악하는 데 도움이 됩니다. 투자자는 이 지표를 통해 경제 환경 변화를 예측하고 자산 배분을 조정할 수 있습니다.`;
  }
  
  return analysis;
}

