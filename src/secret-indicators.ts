/**
 * 비밀지표 데이터 수집 모듈
 * 자본주의 내부 신경계를 해부하는 12개 선행 지표
 */

export type SecretIndicator = {
  id: string;
  name: string;
  description: string;
  fredSeriesId?: string;
  alternativeSource?: string;
  value: number | null;
  previousValue: number | null;
  change: number | null;
  changePercent: number | null;
  unit: string;
  lastUpdated: string;
  interpretation: string;
  trend: "up" | "down" | "neutral";
  riskLevel: "low" | "medium" | "high" | "critical";
};

/**
 * FRED API에서 데이터 가져오기
 */
export async function fetchFRED(seriesId: string, limit: number = 2): Promise<{ value: number; previousValue: number; date: string } | null> {
  try {
    // FRED API 키가 없으면 demo 키 사용 (제한적)
    const apiKey = process.env.FRED_API_KEY || "demo";
    const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${apiKey}&file_type=json&limit=${limit}&sort_order=desc`;
    
    const response = await fetch(url, {
      headers: { "User-Agent": "h41-dashboard/1.0" },
      cache: "no-store"
    });
    
    if (!response.ok) {
      console.warn(`FRED API error for ${seriesId}: ${response.status}`);
      // API 키가 없거나 제한에 걸린 경우, 웹 스크래핑 시도
      if (response.status === 403 || response.status === 429) {
        console.warn(`FRED API rate limit or authentication issue for ${seriesId}, trying web scraping fallback`);
        return await fetchFREDWebScraping(seriesId);
      }
      return null;
    }
    
    const data = await response.json();
    
    // FRED API 에러 응답 확인
    if (data.error_code) {
      console.warn(`FRED API error for ${seriesId}: ${data.error_message || data.error_code}`);
      // 웹 스크래핑 fallback 시도
      return await fetchFREDWebScraping(seriesId);
    }
    
    const observations = data.observations || [];
    
    if (observations.length < 2) {
      console.warn(`Insufficient data for ${seriesId}`);
      return null;
    }
    
    const latest = observations[0];
    const previous = observations[1];
    
    // "." 값은 데이터 없음을 의미
    if (latest.value === "." || previous.value === ".") {
      console.warn(`Missing data for ${seriesId}`);
      return null;
    }
    
    const value = parseFloat(latest.value);
    const previousValue = parseFloat(previous.value);
    
    if (isNaN(value) || isNaN(previousValue)) {
      return null;
    }
    
    return {
      value,
      previousValue,
      date: latest.date
    };
  } catch (error) {
    console.error(`Failed to fetch FRED data for ${seriesId}:`, error);
    // 웹 스크래핑 fallback 시도
    return await fetchFREDWebScraping(seriesId);
  }
}

/**
 * FRED 웹 스크래핑 fallback (API 키가 없거나 제한에 걸린 경우)
 */
async function fetchFREDWebScraping(seriesId: string): Promise<{ value: number; previousValue: number; date: string } | null> {
  try {
    const url = `https://fred.stlouisfed.org/series/${seriesId}`;
    const response = await fetch(url, {
      headers: { "User-Agent": "h41-dashboard/1.0" },
      cache: "no-store"
    });
    
    if (!response.ok) {
      return null;
    }
    
    const html = await response.text();
    const cheerio = await import("cheerio");
    const $ = cheerio.load(html);
    
    // FRED 페이지에서 최신 데이터 추출 시도
    // 실제 구조에 맞게 파싱 로직 구현 필요
    // TODO: FRED 웹 페이지 구조 분석 후 파싱 로직 구현
    console.warn(`FRED web scraping for ${seriesId} not yet implemented`);
    return null;
  } catch (error) {
    console.error(`Failed to scrape FRED data for ${seriesId}:`, error);
    return null;
  }
}

/**
 * Cross Currency Basis 데이터 가져오기 (MacroMicro 또는 Bloomberg)
 * 참고: 실제 구현은 공개 API가 필요하지만, 여기서는 예시로 구현
 */
async function fetchCrossCurrencyBasis(): Promise<{ value: number; previousValue: number; date: string } | null> {
  try {
    // MacroMicro는 유료 API이므로, 실제로는 웹 스크래핑이나 다른 공개 소스를 사용해야 함
    // 참고: Bloomberg Terminal이나 Refinitiv Eikon 같은 유료 플랫폼에서도 제공
    // 여기서는 예시로 null 반환 (실제 구현 필요)
    // TODO: MacroMicro API 또는 웹 스크래핑 구현 필요
    console.warn("Cross Currency Basis: Data source requires API key or web scraping");
    return null;
  } catch (error) {
    console.error("Failed to fetch Cross Currency Basis:", error);
    return null;
  }
}

/**
 * 프라이머리 딜러 포지션 데이터 가져오기 (NY Fed)
 */
async function fetchPrimaryDealerPositioning(): Promise<{ value: number; previousValue: number; date: string } | null> {
  try {
    // NY Fed Primary Dealer Statistics는 CSV나 JSON 형식으로 데이터를 제공
    // 실제 URL: https://www.newyorkfed.org/markets/counterparties/primary-dealers-statistics
    // 데이터는 주로 "Net Position" 또는 "Total Position" 같은 지표를 사용
    // NY Fed API를 통해 데이터 가져오기 시도
    const url = "https://www.newyorkfed.org/markets/counterparties/primary-dealers-statistics";
    
    const response = await fetch(url, {
      headers: { "User-Agent": "h41-dashboard/1.0" },
      cache: "no-store"
    });
    
    if (!response.ok) {
      console.warn(`NY Fed API error: ${response.status}`);
      return null;
    }
    
    // HTML 파싱을 위해 cheerio 사용
    const cheerio = await import("cheerio");
    const html = await response.text();
    const $ = cheerio.load(html);
    
    // TODO: 실제 데이터 구조에 맞게 파싱 로직 구현 필요
    // NY Fed는 CSV 다운로드 링크를 제공할 수 있으므로, 해당 링크를 찾아서 파싱
    console.warn("Primary Dealer Positioning: Data parsing logic needs to be implemented based on actual NY Fed data structure");
    return null;
  } catch (error) {
    console.error("Failed to fetch Primary Dealer Positioning:", error);
    return null;
  }
}

/**
 * 국가 CDS vs 환율 괴리 데이터 가져오기
 */
async function fetchSovereignRiskGap(): Promise<{ value: number; previousValue: number; date: string } | null> {
  try {
    // worldgovernmentbonds.com 또는 indexergo.com에서 데이터 가져오기
    // CDS 스프레드와 환율 데이터를 비교하여 괴리를 계산
    // 참고: 이 사이트들은 웹 스크래핑이 필요할 수 있음
    // TODO: 웹 스크래핑 로직 구현 필요
    console.warn("Sovereign Risk Gap: Data source requires web scraping");
    return null;
  } catch (error) {
    console.error("Failed to fetch Sovereign Risk Gap:", error);
    return null;
  }
}

/**
 * SOFR-IORB 스프레드 데이터 가져오기
 * SOFR과 IORB를 각각 가져와서 스프레드 계산
 */
export async function fetchSOFRIORBSpread(): Promise<{
  sofr: { value: number; previousValue: number; date: string } | null;
  iorb: { value: number; previousValue: number; date: string } | null;
  spread: { value: number; previousValue: number; date: string } | null;
}> {
  try {
    // SOFR과 IORB를 병렬로 가져오기
    const [sofrData, iorbData] = await Promise.all([
      fetchFRED("SOFR", 2),
      fetchFRED("DFEDTARU", 2) // Interest Rate on Reserve Balances
    ]);
    
    let spread: { value: number; previousValue: number; date: string } | null = null;
    
    if (sofrData && iorbData) {
      // 스프레드 계산 (bp 단위로 변환: 1% = 100bp)
      const spreadValue = (sofrData.value - iorbData.value) * 100;
      const spreadPreviousValue = (sofrData.previousValue - iorbData.previousValue) * 100;
      
      spread = {
        value: spreadValue,
        previousValue: spreadPreviousValue,
        date: sofrData.date // 최신 날짜 사용
      };
    }
    
    return {
      sofr: sofrData,
      iorb: iorbData,
      spread
    };
  } catch (error) {
    console.error("Failed to fetch SOFR-IORB spread:", error);
    return {
      sofr: null,
      iorb: null,
      spread: null
    };
  }
}

/**
 * SOFR-IORB 스프레드 차트 데이터 가져오기 (최근 1년)
 */
export async function fetchSOFRIORBSpreadChartData(days: number = 365): Promise<{
  dates: string[];
  sofr: number[];
  iorb: number[];
  spread: number[];
} | null> {
  try {
    const apiKey = process.env.FRED_API_KEY || "demo";
    const endDate = new Date().toISOString().split('T')[0];
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    // SOFR과 IORB 데이터를 병렬로 가져오기
    const [sofrResponse, iorbResponse] = await Promise.all([
      fetch(`https://api.stlouisfed.org/fred/series/observations?series_id=SOFR&api_key=${apiKey}&file_type=json&observation_start=${startDate}&observation_end=${endDate}&sort_order=asc`),
      fetch(`https://api.stlouisfed.org/fred/series/observations?series_id=DFEDTARU&api_key=${apiKey}&file_type=json&observation_start=${startDate}&observation_end=${endDate}&sort_order=asc`)
    ]);
    
    if (!sofrResponse.ok || !iorbResponse.ok) {
      console.warn("Failed to fetch chart data from FRED API");
      return null;
    }
    
    const sofrData = await sofrResponse.json();
    const iorbData = await iorbResponse.json();
    
    if (sofrData.error_code || iorbData.error_code) {
      console.warn("FRED API error:", sofrData.error_message || iorbData.error_message);
      return null;
    }
    
    const sofrObservations = (sofrData.observations || []).filter((obs: any) => obs.value !== ".");
    const iorbObservations = (iorbData.observations || []).filter((obs: any) => obs.value !== ".");
    
    // 날짜 기준으로 매칭
    const dateMap = new Map<string, { sofr?: number; iorb?: number }>();
    
    sofrObservations.forEach((obs: any) => {
      const date = obs.date;
      const value = parseFloat(obs.value);
      if (!isNaN(value)) {
        if (!dateMap.has(date)) {
          dateMap.set(date, {});
        }
        dateMap.get(date)!.sofr = value;
      }
    });
    
    iorbObservations.forEach((obs: any) => {
      const date = obs.date;
      const value = parseFloat(obs.value);
      if (!isNaN(value)) {
        if (!dateMap.has(date)) {
          dateMap.set(date, {});
        }
        dateMap.get(date)!.iorb = value;
      }
    });
    
    // 두 값이 모두 있는 날짜만 사용
    const dates: string[] = [];
    const sofr: number[] = [];
    const iorb: number[] = [];
    const spread: number[] = [];
    
    Array.from(dateMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .forEach(([date, values]) => {
        if (values.sofr !== undefined && values.iorb !== undefined) {
          dates.push(date);
          sofr.push(values.sofr);
          iorb.push(values.iorb);
          spread.push((values.sofr - values.iorb) * 100); // bp 단위
        }
      });
    
    return {
      dates,
      sofr,
      iorb,
      spread
    };
  } catch (error) {
    console.error("Failed to fetch SOFR-IORB spread chart data:", error);
    return null;
  }
}

/**
 * WRESBAL (은행 준비금) 차트 데이터 가져오기
 * 최근 1년간의 주간 데이터
 */
export async function fetchWRESBALChartData(days: number = 365): Promise<{
  dates: string[];
  values: number[];
} | null> {
  try {
    const apiKey = process.env.FRED_API_KEY || "demo";
    const endDate = new Date().toISOString().split('T')[0];
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    const response = await fetch(
      `https://api.stlouisfed.org/fred/series/observations?series_id=WRESBAL&api_key=${apiKey}&file_type=json&observation_start=${startDate}&observation_end=${endDate}&sort_order=asc`
    );
    
    if (!response.ok) {
      console.warn("Failed to fetch WRESBAL chart data from FRED API");
      return null;
    }
    
    const data = await response.json();
    
    if (data.error_code) {
      console.warn("FRED API error:", data.error_message);
      return null;
    }
    
    const observations = (data.observations || []).filter((obs: any) => obs.value !== ".");
    
    const dates: string[] = [];
    const values: number[] = [];
    
    observations.forEach((obs: any) => {
      const value = parseFloat(obs.value);
      if (!isNaN(value)) {
        dates.push(obs.date);
        values.push(value / 1000); // 백만 달러를 십억 달러로 변환
      }
    });
    
    return {
      dates,
      values
    };
  } catch (error) {
    console.error("Failed to fetch WRESBAL chart data:", error);
    return null;
  }
}

/**
 * SOFR-IORB 스프레드 상세 해석 생성
 * 사용자 제공 개념 기반: 1차/2차 판독, 교차 판독, 포지션 판단
 */
export function generateSOFRIORBSpreadDetailedInterpretation(
  spreadData: {
    sofr: { value: number; previousValue: number; date: string } | null;
    iorb: { value: number; previousValue: number; date: string } | null;
    spread: { value: number; previousValue: number; date: string } | null;
  },
  chartData: {
    dates: string[];
    sofr: number[];
    iorb: number[];
    spread: number[];
  } | null
): {
  currentState: "normal" | "warning" | "defensive";
  primaryAnalysis: string;
  secondaryAnalysis: string;
  crossReading: string;
  positionGuidance: string;
  detailedExplanation: string;
} {
  if (!spreadData.spread || !spreadData.sofr || !spreadData.iorb) {
    return {
      currentState: "normal",
      primaryAnalysis: "데이터 수집 중입니다.",
      secondaryAnalysis: "",
      crossReading: "",
      positionGuidance: "",
      detailedExplanation: ""
    };
  }
  
  const currentSpread = spreadData.spread.value;
  const previousSpread = spreadData.spread.previousValue;
  const spreadChange = currentSpread - previousSpread;
  const absSpread = Math.abs(currentSpread);
  
  // 1차 판독: 괴리의 성격
  let primaryAnalysis = "";
  
  // 괴리가 단발성인지 확인 (차트 데이터가 있으면 최근 30일 데이터로 확인)
  let isTransient = false;
  if (chartData && chartData.spread.length >= 30) {
    const recentSpreads = chartData.spread.slice(-30);
    const avgRecent = recentSpreads.reduce((a, b) => a + b, 0) / recentSpreads.length;
    const maxRecent = Math.max(...recentSpreads);
    const minRecent = Math.min(...recentSpreads);
    
    // 최근 30일 평균과 현재 값의 차이가 크면 단발성일 가능성
    if (Math.abs(currentSpread - avgRecent) > Math.abs(avgRecent) * 0.5) {
      isTransient = true;
      primaryAnalysis += "⚠️ 단발성 변동 가능성: 최근 30일 평균과 비교하여 현재 값이 크게 벗어났습니다. 노이즈일 수 있으니 지속성을 관찰해야 합니다.\n\n";
    } else {
      primaryAnalysis += "✅ 지속적 패턴: 최근 30일 평균과 일치하는 패턴을 보이고 있습니다.\n\n";
    }
  }
  
  // 특별한 이벤트 없이 벌어졌는지 (현재는 데이터로 확인 불가, 추후 경제 이벤트 캘린더 연동 가능)
  primaryAnalysis += "📅 이벤트 확인: 경제 지표 발표나 특별한 이벤트 없이 발생했다면 은행 내부 판단의 신호일 가능성이 높습니다.\n\n";
  
  // 며칠에서 몇주 동안 유지되는지 (차트 데이터로 확인)
  if (chartData && chartData.spread.length >= 14) {
    const recent14Days = chartData.spread.slice(-14);
    const consistentDays = recent14Days.filter(s => Math.abs(s - currentSpread) < 5).length;
    
    if (consistentDays >= 7) {
      primaryAnalysis += `⏱️ 지속성: 최근 14일 중 ${consistentDays}일 동안 유사한 수준을 유지하고 있습니다. 이는 은행들의 선택이 반복되고 있다는 의미입니다.`;
    } else {
      primaryAnalysis += `⏱️ 변동성: 최근 14일 동안 스프레드가 불안정하게 움직이고 있습니다.`;
    }
  }
  
  // 2차 판독: 지속성과 방향
  let secondaryAnalysis = "";
  let currentState: "normal" | "warning" | "defensive" = "normal";
  
  if (absSpread < 5) {
    // 정상 상태: SOFR과 IORB가 붙었다가 다시 붙는 거고, 시스템 자율 유지 상태
    currentState = "normal";
    secondaryAnalysis = `✅ 정상 상태: SOFR(${spreadData.sofr.value.toFixed(2)}%)과 IORB(${spreadData.iorb.value.toFixed(2)}%) 간의 괴리가 미미합니다(${currentSpread.toFixed(2)}bp). 이는 시스템이 자율적으로 유지되고 있으며, 은행들이 서로를 신뢰하고 있다는 신호입니다.`;
  } else if (absSpread < 20) {
    // 경계 상태: SOFR과 IORB 간의 괴리가 발생한 거고, 다시 붙으려는 시도가 반복될 때
    currentState = "warning";
    secondaryAnalysis = `⚠️ 경계 상태: SOFR(${spreadData.sofr.value.toFixed(2)}%)과 IORB(${spreadData.iorb.value.toFixed(2)}%) 간의 괴리가 발생했습니다(${currentSpread.toFixed(2)}bp). 은행 간 선로의 신뢰 선별이 시작되었다는 뜻입니다. 다시 붙으려는 시도가 반복되는지 관찰해야 합니다.`;
  } else {
    // 방어 상태: 이미 괴리가 발생해서 붙지 않고 유지되는 상태, 간헐적으로 더 벌어지는거
    currentState = "defensive";
    secondaryAnalysis = `🚨 방어 상태: SOFR(${spreadData.sofr.value.toFixed(2)}%)과 IORB(${spreadData.iorb.value.toFixed(2)}%) 간의 괴리가 고착되었습니다(${currentSpread.toFixed(2)}bp). 은행은 이미 중앙은행을 기본 선택지로 고정했다는 뜻입니다. 간헐적으로 더 벌어질 수 있으니 주의가 필요합니다.`;
  }
  
  // 교차 판독 방법
  let crossReading = "📊 교차 판독 방법:\n\n";
  crossReading += "1️⃣ 은행 준비금의 속도: 준비금 속도 둔화와 SOFR-IORB 괴리를 더블체크하세요. 준비금으로 자본의 태도에서 SOFR-IORB 간극으로 행동 전환되는지 확인하면 뻔한 긴장은 끝납니다.\n\n";
  crossReading += "2️⃣ RRP와 MMF 함께보기: SOFR-IORB 괴리와 RRP 사용증가, MMF 자금유입이 동시에 이뤄지면 민간 신뢰 회피가 구조적으로 진행되고 있다는 뜻입니다.\n\n";
  crossReading += "3️⃣ SLOOS 후행확인: 분기 차로 대출 기준 강화 응답이 증가하는지 확인하세요. 은행 내부 판단이 공식 문서로 확정되는 개념입니다.\n\n";
  crossReading += "⚠️ 중요: 절대 SOFR과 IORB를 각각 단독 사용/해석은 금지입니다. 반드시 교차 판독을 병행해야 합니다.";
  
  // 포지션 판단
  let positionGuidance = "";
  if (currentState === "normal") {
    positionGuidance = "💼 포지션 유지 판단: SOFR-IORB 괴리가 미미한 상태입니다. 현재 포지션을 유지하되, 지속적으로 모니터링하세요.";
  } else if (currentState === "warning") {
    positionGuidance = "💼 포지션 축소 판단: SOFR-IORB 괴리가 발생하거나 반복될 때입니다. 리스크가 큰 우선순서대로 정리하세요 (공격적 투자 중단).";
  } else {
    positionGuidance = "💼 포지션 대기 판단: SOFR-IORB 괴리가 고착될 때입니다. 현금 확보로 선택지를 넓히세요.";
  }
  
  // 상세 설명
  let detailedExplanation = `## SOFR과 IORB의 본질\n\n`;
  detailedExplanation += `**SOFR 본질**: 민간 신뢰의 가격이기 때문에 은행이 은행을 얼마나 믿는지의 가격입니다. 시스템이 건강하다는 증거입니다. 정상적인 시스템에서는 은행은 서로를 믿습니다.\n\n`;
  detailedExplanation += `**IORB 본질**: 자본의 최후 피난처입니다. 중앙은행은 파산하지 않아 적어도 시스템이 유지되는 한 안전합니다. 마치 은행에게 "여기서는 의심하지 않아도 된다"고 말하는 것과 같은 개념입니다. 문제는 은행이 이 선택지를 평소보다 자주 사용하기 시작할 때 시작됩니다.\n\n`;
  detailedExplanation += `## 현재 상태\n\n`;
  detailedExplanation += `- 현재 SOFR: ${spreadData.sofr.value.toFixed(2)}%\n`;
  detailedExplanation += `- 현재 IORB: ${spreadData.iorb.value.toFixed(2)}%\n`;
  detailedExplanation += `- 스프레드: ${currentSpread.toFixed(2)}bp (${spreadChange > 0 ? '+' : ''}${spreadChange.toFixed(2)}bp)\n\n`;
  detailedExplanation += `## 해석 가이드\n\n`;
  detailedExplanation += `이 지표는 예측을 위한 것이 아닙니다. 자본주의 내부에서 이미 시작된 변화를 가장 먼저 확인하는 지표입니다. 위기가 터진 뒤 대응하는 것이 아닌, 위기가 준비되는 과정을 가장 먼저 알아차리고 그 시야를 갖게 하는 것이 목적입니다.`;
  
  return {
    currentState,
    primaryAnalysis,
    secondaryAnalysis,
    crossReading,
    positionGuidance,
    detailedExplanation
  };
}

/**
 * 지표별 해석 생성
 */
function generateInterpretation(
  indicator: SecretIndicator,
  value: number,
  previousValue: number,
  change: number,
  changePercent: number
): string {
  const absChange = Math.abs(change);
  const absChangePercent = Math.abs(changePercent);
  
  switch (indicator.id) {
    case "bank_reserves_velocity":
      if (change > 0) {
        return `은행 준비금의 속도가 증가하고 있습니다(${absChangePercent.toFixed(2)}%). 이는 은행들이 서로를 신뢰하고 자금을 순환시키고 있다는 신호입니다. 유동성 환경이 개선되고 있으며, 신용 창출이 활발해질 수 있습니다. 거대 자본가들은 이런 시점에 성장 자산의 비중을 늘립니다.`;
      } else if (change < 0) {
        return `은행 준비금의 속도가 감소하고 있습니다(${absChangePercent.toFixed(2)}%). 이는 은행들이 서로를 신뢰하지 못하고 자금 순환이 멈추고 있다는 경고 신호입니다. 신용 경색이 시작될 수 있으며, 거대 자본가들은 방어적 포지션으로 전환합니다.`;
      }
      return `은행 준비금의 속도가 안정적으로 유지되고 있습니다. 현재 신뢰 수준이 유지되고 있으며, 큰 변화 없이 진행되고 있습니다.`;
      
    case "sofr_iorb_spread":
      if (change > 0) {
        return `SOFR-IORB 스프레드가 확대되고 있습니다(${absChange.toFixed(2)}bp). 이는 은행들이 서로를 포기하고 중앙은행으로 돌아가고 있다는 신호입니다. 금융 시스템에 스트레스가 증가하고 있으며, 유동성 경색이 시작될 수 있습니다. 거대 자본가들은 현금 비중을 늘리고 방어적 자산으로 전환합니다.`;
      } else if (change < 0) {
        return `SOFR-IORB 스프레드가 축소되고 있습니다(${absChange.toFixed(2)}bp). 이는 은행 간 신뢰가 회복되고 있으며, 금융 시스템이 안정화되고 있다는 신호입니다. 유동성 환경이 개선되고 있어 자산 가격 상승 여지가 생길 수 있습니다.`;
      }
      return `SOFR-IORB 스프레드가 안정적으로 유지되고 있습니다. 현재 은행 간 신뢰 수준이 유지되고 있으며, 큰 변화 없이 진행되고 있습니다.`;
      
    case "cross_currency_basis":
      if (change > 0) {
        return `Cross Currency Basis가 확대되고 있습니다. 이는 달러 조달 능력이 악화되고 있다는 신호입니다. 글로벌 달러 유동성이 경색되고 있으며, 신흥국과 기업들의 달러 조달 비용이 상승하고 있습니다. 거대 자본가들은 달러 강세 자산으로 이동하며, 위험 자산에서 빠져나갑니다.`;
      } else if (change < 0) {
        return `Cross Currency Basis가 축소되고 있습니다. 이는 달러 조달 능력이 개선되고 있다는 신호입니다. 글로벌 달러 유동성이 풍부해지고 있으며, 신흥국과 기업들의 달러 조달이 원활해지고 있습니다.`;
      }
      return `Cross Currency Basis가 안정적으로 유지되고 있습니다. 현재 달러 조달 환경이 유지되고 있으며, 큰 변화 없이 진행되고 있습니다.`;
      
    case "sloos":
      if (change > 0) {
        return `SLOOS(은행 대출 기준 설문)가 강화되고 있습니다(${absChangePercent.toFixed(2)}%). 은행들이 대출 기준을 강화하고 있다는 것은 뉴스보다 먼저 위기 신호를 감지했다는 의미입니다. 신용 경색이 시작될 수 있으며, 기업들의 자금 조달이 어려워질 수 있습니다. 거대 자본가들은 현금 비중을 늘리고 방어적 포지션으로 전환합니다.`;
      } else if (change < 0) {
        return `SLOOS(은행 대출 기준 설문)가 완화되고 있습니다(${absChangePercent.toFixed(2)}%). 은행들이 대출 기준을 완화하고 있다는 것은 신용 환경이 개선되고 있다는 신호입니다. 기업들의 자금 조달이 원활해지고 있으며, 성장 자산에 유리한 환경이 조성되고 있습니다.`;
      }
      return `SLOOS(은행 대출 기준 설문)가 안정적으로 유지되고 있습니다. 현재 대출 기준이 유지되고 있으며, 큰 변화 없이 진행되고 있습니다.`;
      
    case "cre_risk_perception":
      if (change > 0) {
        return `상업용 부동산 위험 인식 지표가 상승하고 있습니다(${absChangePercent.toFixed(2)}%). 은행들이 CRE 대출을 위험하다고 느끼는 비율이 증가하고 있습니다. 이는 시장 가격보다 선행하는 지표로, 상업용 부동산 시장의 악화가 예상됩니다. 거대 자본가들은 부동산 관련 자산에서 빠져나갑니다.`;
      } else if (change < 0) {
        return `상업용 부동산 위험 인식 지표가 하락하고 있습니다(${absChangePercent.toFixed(2)}%). 은행들이 CRE 대출을 덜 위험하다고 느끼고 있습니다. 상업용 부동산 시장이 안정화되고 있으며, 투자 기회가 생길 수 있습니다.`;
      }
      return `상업용 부동산 위험 인식 지표가 안정적으로 유지되고 있습니다. 현재 위험 인식 수준이 유지되고 있으며, 큰 변화 없이 진행되고 있습니다.`;
      
    case "interest_coverage_tail_risk":
      if (change > 0) {
        return `기업 이자보상 능력의 꼬리 위험이 증가하고 있습니다(${absChangePercent.toFixed(2)}%). 가장 약한 기업들의 현금성 자산이 고금리 환경에서 하락 전환 위험에 노출되고 있습니다. 신용 위기는 항상 가장 약한 기업부터 터진다는 원리에 따라, 기업 신용 위험이 증가하고 있습니다. 거대 자본가들은 고수익 채권과 위험 자산에서 빠져나갑니다.`;
      } else if (change < 0) {
        return `기업 이자보상 능력의 꼬리 위험이 감소하고 있습니다(${absChangePercent.toFixed(2)}%). 가장 약한 기업들의 현금성 자산이 개선되고 있으며, 신용 위험이 감소하고 있습니다. 기업 신용 환경이 안정화되고 있어 위험 자산에 유리한 환경이 조성되고 있습니다.`;
      }
      return `기업 이자보상 능력의 꼬리 위험이 안정적으로 유지되고 있습니다. 현재 신용 위험 수준이 유지되고 있으며, 큰 변화 없이 진행되고 있습니다.`;
      
    case "mmf_flows":
      if (change > 0) {
        return `MMF 자금이 급증하고 있습니다(${absChangePercent.toFixed(2)}%). 공포는 증가가 아니라 어디서 어디로 이동하는지로 드러난다는 원리에 따라, 주식과 예금에서 MMF로 자금이 이동하고 있습니다. 이는 시장 불안이 증가하고 있다는 신호이며, 거대 자본가들은 방어적 포지션으로 전환합니다.`;
      } else if (change < 0) {
        return `MMF 자금이 감소하고 있습니다(${absChangePercent.toFixed(2)}%). 자금이 MMF에서 주식이나 예금으로 이동하고 있습니다. 시장 신뢰가 회복되고 있으며, 위험 자산에 유리한 환경이 조성되고 있습니다.`;
      }
      return `MMF 자금이 안정적으로 유지되고 있습니다. 현재 자금 이동이 안정적이며, 큰 변화 없이 진행되고 있습니다.`;
      
    case "tga":
      if (change > 0) {
        return `미 재무부 일반계정(TGA)이 증가하고 있습니다(${absChangePercent.toFixed(2)}%). 정부가 시장 유동성을 흡수하고 있는 숨겨진 밸브가 작동하고 있습니다. 세금 징수나 국채 발행 자금이 예치되면서 시중 유동성이 정부 계정으로 흡수되고 있습니다. 이는 단기적으로 자금 시장의 금리 상승 압력과 자산 가격 조정 압력으로 작용할 수 있습니다.`;
      } else if (change < 0) {
        return `미 재무부 일반계정(TGA)이 감소하고 있습니다(${absChangePercent.toFixed(2)}%). 정부가 시장 유동성을 공급하고 있는 숨겨진 밸브가 작동하고 있습니다. 정부 지출 확대로 시중 유동성이 공급되고 있으며, 자금 시장의 금리 하락 압력과 자산 가격 상승 요인으로 작용할 수 있습니다.`;
      }
      return `미 재무부 일반계정(TGA)이 안정적으로 유지되고 있습니다. 현재 정부 유동성 관리가 안정적이며, 큰 변화 없이 진행되고 있습니다.`;
      
    case "primary_dealer_positioning":
      if (change > 0) {
        return `프라이머리 딜러 포지션이 증가하고 있습니다. 시장을 떠받치던 거대한 손들이 포지션을 늘리고 있습니다. 이는 시장 유동성이 개선되고 있으며, 거대 자본가들이 시장에 대한 신뢰를 회복하고 있다는 신호입니다.`;
      } else if (change < 0) {
        return `프라이머리 딜러 포지션이 감소하고 있습니다. 시장을 떠받치던 거대한 손들이 먼저 내려놓고 있습니다. 이는 시장 유동성이 악화되고 있으며, 거대 자본가들이 시장에서 빠져나가고 있다는 경고 신호입니다. 거대 자본가들은 이런 시점에 방어적 포지션으로 전환합니다.`;
      }
      return `프라이머리 딜러 포지션이 안정적으로 유지되고 있습니다. 현재 시장 지지 수준이 유지되고 있으며, 큰 변화 없이 진행되고 있습니다.`;
      
    case "dollar_strength_quality":
      if (change > 0) {
        return `달러 강세의 질이 개선되고 있습니다. 성장 달러인지 공포 달러인지를 가르는 기준에서, 달러 상승과 위험 자산 상승이 함께 나타나고 있습니다. 이는 성장 달러로 해석되며, 글로벌 성장 기대가 반영되고 있습니다. 거대 자본가들은 성장 자산의 비중을 늘립니다.`;
      } else if (change < 0) {
        return `달러 강세의 질이 악화되고 있습니다. 달러 상승과 위험 자산 하락이 함께 나타나고 있습니다. 이는 공포 달러로 해석되며, 글로벌 리스크 회피 심리가 증가하고 있습니다. 거대 자본가들은 방어적 자산으로 이동하며, 현금 비중을 늘립니다.`;
      }
      return `달러 강세의 질이 안정적으로 유지되고 있습니다. 현재 달러 강세의 성격이 유지되고 있으며, 큰 변화 없이 진행되고 있습니다.`;
      
    case "global_trade_finance_stress":
      if (change > 0) {
        return `글로벌 무역금융 위축이 증가하고 있습니다. 실물 경제의 순환이 막히기 시작하는 신호입니다. 무역 금융이 경색되면서 글로벌 무역이 위축되고 있으며, 실물 경제의 악화가 예상됩니다. 거대 자본가들은 실물 경제 관련 자산에서 빠져나갑니다.`;
      } else if (change < 0) {
        return `글로벌 무역금융 위축이 감소하고 있습니다. 실물 경제의 순환이 개선되고 있는 신호입니다. 무역 금융이 회복되면서 글로벌 무역이 활성화되고 있으며, 실물 경제의 개선이 예상됩니다.`;
      }
      return `글로벌 무역금융 위축이 안정적으로 유지되고 있습니다. 현재 무역 금융 환경이 유지되고 있으며, 큰 변화 없이 진행되고 있습니다.`;
      
    case "sovereign_risk_gap":
      if (change > 0) {
        return `국가 CDS vs 환율 괴리가 확대되고 있습니다. 시장이 판단하는 국가 신뢰도와 환율이 따로 움직이고 있습니다. 이는 국가 신뢰도가 악화되고 있다는 신호이며, 거대 자본가들은 해당 국가 자산에서 빠져나갑니다.`;
      } else if (change < 0) {
        return `국가 CDS vs 환율 괴리가 축소되고 있습니다. 시장이 판단하는 국가 신뢰도와 환율이 함께 움직이고 있습니다. 이는 국가 신뢰도가 개선되고 있다는 신호이며, 해당 국가 자산에 투자 기회가 생길 수 있습니다.`;
      }
      return `국가 CDS vs 환율 괴리가 안정적으로 유지되고 있습니다. 현재 국가 신뢰도가 유지되고 있으며, 큰 변화 없이 진행되고 있습니다.`;
      
    default:
      return "데이터를 분석 중입니다.";
  }
}

/**
 * 위험 수준 판단
 */
function determineRiskLevel(indicator: SecretIndicator, change: number, changePercent: number): "low" | "medium" | "high" | "critical" {
  const absChangePercent = Math.abs(changePercent);
  
  // 지표별로 위험 수준 판단 로직이 다를 수 있음
  if (absChangePercent > 10) return "critical";
  if (absChangePercent > 5) return "high";
  if (absChangePercent > 2) return "medium";
  return "low";
}

/**
 * 모든 비밀지표 가져오기
 */
export async function fetchAllSecretIndicators(): Promise<SecretIndicator[]> {
  const indicators: SecretIndicator[] = [
    {
      id: "bank_reserves_velocity",
      name: "은행 준비금의 속도",
      description: "돈의 양이 아니라 은행 신뢰의 척도가 변화하고 멈추는 순간을 보여줌",
      fredSeriesId: "WRESBAL",
      unit: "억 달러",
      value: null,
      previousValue: null,
      change: null,
      changePercent: null,
      lastUpdated: "",
      interpretation: "",
      trend: "neutral",
      riskLevel: "low"
    },
    {
      id: "sofr_iorb_spread",
      name: "SOFR-IORB 스프레드",
      description: "은행들이 서로를 포기하고 중앙은행으로 돌아가는 신호를 알려주는 지표",
      fredSeriesId: "SOFR",
      alternativeSource: "IORB와의 차이 계산 필요",
      unit: "bp",
      value: null,
      previousValue: null,
      change: null,
      changePercent: null,
      lastUpdated: "",
      interpretation: "",
      trend: "neutral",
      riskLevel: "low"
    },
    {
      id: "cross_currency_basis",
      name: "Cross Currency Basis",
      description: "달러가 있느냐 보다 빌릴 수 있는냐가 중요해지는 순간에 대한 내용으로 말 그대로 달러 조달능력 지표",
      alternativeSource: "Refinitiv, Bloomberg, MacroMicro",
      unit: "bp",
      value: null,
      previousValue: null,
      change: null,
      changePercent: null,
      lastUpdated: "",
      interpretation: "",
      trend: "neutral",
      riskLevel: "low"
    },
    {
      id: "sloos",
      name: "SLOOS (은행 대출 기준 설문)",
      description: "은행이 대출 기준을 강화했는지 나타나는 비율로 은행이 뉴스보다 먼저 위기 신호를 알려주는 지표",
      fredSeriesId: "DRTSCILM",
      unit: "%",
      value: null,
      previousValue: null,
      change: null,
      changePercent: null,
      lastUpdated: "",
      interpretation: "",
      trend: "neutral",
      riskLevel: "low"
    },
    {
      id: "cre_risk_perception",
      name: "상업용 부동산 위험 인식 지표",
      description: "가격이 아니라 은행의 판단이 먼저 움직인다는 원리 구조하에 은행이 CRE 대출을 위험하다고 느끼는 비율",
      fredSeriesId: "DRCRELEXFACBS",
      unit: "%",
      value: null,
      previousValue: null,
      change: null,
      changePercent: null,
      lastUpdated: "",
      interpretation: "",
      trend: "neutral",
      riskLevel: "low"
    },
    {
      id: "interest_coverage_tail_risk",
      name: "기업 이자보상 능력의 꼬리",
      description: "신용 위기는 항상 가장 약한 기업부터 터진다는 원리에 의해 기업 현금성자산과 고금리 환경에서 하락 전환이 위험하다는 걸 알 수 있는 지표",
      fredSeriesId: "A053RC1Q027SBEA",
      unit: "%",
      value: null,
      previousValue: null,
      change: null,
      changePercent: null,
      lastUpdated: "",
      interpretation: "",
      trend: "neutral",
      riskLevel: "low"
    },
    {
      id: "mmf_flows",
      name: "MMF 자금이동 경로",
      description: "공포는 증가가 아니라 어디서 어디로 이동하는지로 드러난다는 구조 원리에 의해 판단하는 개념",
      fredSeriesId: "MMMFFAQ027S",
      unit: "억 달러",
      value: null,
      previousValue: null,
      change: null,
      changePercent: null,
      lastUpdated: "",
      interpretation: "",
      trend: "neutral",
      riskLevel: "low"
    },
    {
      id: "tga",
      name: "미 재무부 일반계정 (TGA)",
      description: "정부가 시장 유동성을 흡수하거나 푸는 숨겨진 밸브",
      fredSeriesId: "WTREGEN",
      unit: "억 달러",
      value: null,
      previousValue: null,
      change: null,
      changePercent: null,
      lastUpdated: "",
      interpretation: "",
      trend: "neutral",
      riskLevel: "low"
    },
    {
      id: "primary_dealer_positioning",
      name: "프라이머리 딜러 포지션",
      description: "시장을 떠받치던 거대한 손들이 먼저 내려놓는 순간을 알 수 있는 지표",
      alternativeSource: "NY Fed Primary Dealer Statistics",
      unit: "억 달러",
      value: null,
      previousValue: null,
      change: null,
      changePercent: null,
      lastUpdated: "",
      interpretation: "",
      trend: "neutral",
      riskLevel: "low"
    },
    {
      id: "dollar_strength_quality",
      name: "달러 강세의 질",
      description: "성장달러인가 공포달러인가를 가르는 기준으로 보는 지표",
      fredSeriesId: "DTWEXBGS",
      unit: "지수",
      value: null,
      previousValue: null,
      change: null,
      changePercent: null,
      lastUpdated: "",
      interpretation: "",
      trend: "neutral",
      riskLevel: "low"
    },
    {
      id: "global_trade_finance_stress",
      name: "글로벌 무역금융 위축",
      description: "실물 경제의 순환이 막히기 시작하는 신호를 알 수 있는 지표",
      alternativeSource: "BIS, ICC",
      unit: "지수",
      value: null,
      previousValue: null,
      change: null,
      changePercent: null,
      lastUpdated: "",
      interpretation: "",
      trend: "neutral",
      riskLevel: "low"
    },
    {
      id: "sovereign_risk_gap",
      name: "국가 CDS vs 환율 괴리",
      description: "시장이 판단하는 이 나라는 믿을 수 있는 국가인가에 대해 알 수 있는 지표",
      alternativeSource: "worldgovernmentbonds, indexergo.com",
      unit: "bp",
      value: null,
      previousValue: null,
      change: null,
      changePercent: null,
      lastUpdated: "",
      interpretation: "",
      trend: "neutral",
      riskLevel: "low"
    }
  ];
  
  // FRED API로 데이터 가져오기 (병렬 처리로 최적화)
  const fetchPromises = indicators.map(async (indicator) => {
    try {
      let data: { value: number; previousValue: number; date: string } | null = null;
      
      if (indicator.id === "sofr_iorb_spread") {
        // SOFR-IORB 스프레드는 별도 함수 사용
        const spreadData = await fetchSOFRIORBSpread();
        if (spreadData.spread) {
          data = spreadData.spread;
        }
      } else if (indicator.fredSeriesId) {
        // FRED API 사용
        data = await fetchFRED(indicator.fredSeriesId);
      } else if (indicator.id === "cross_currency_basis") {
        // Cross Currency Basis는 별도 함수 사용
        data = await fetchCrossCurrencyBasis();
      } else if (indicator.id === "primary_dealer_positioning") {
        // 프라이머리 딜러 포지션은 별도 함수 사용
        data = await fetchPrimaryDealerPositioning();
      } else if (indicator.id === "sovereign_risk_gap") {
        // 국가 CDS vs 환율 괴리는 별도 함수 사용
        data = await fetchSovereignRiskGap();
      }
      
      if (data) {
        indicator.value = data.value;
        indicator.previousValue = data.previousValue;
        indicator.change = data.value - data.previousValue;
        indicator.changePercent = ((data.value - data.previousValue) / Math.abs(data.previousValue)) * 100;
        indicator.lastUpdated = data.date;
        indicator.trend = indicator.change > 0 ? "up" : indicator.change < 0 ? "down" : "neutral";
        indicator.riskLevel = determineRiskLevel(indicator, indicator.change, indicator.changePercent);
        indicator.interpretation = generateInterpretation(
          indicator,
          data.value,
          data.previousValue,
          indicator.change,
          indicator.changePercent
        );
      }
    } catch (error) {
      console.error(`Failed to fetch ${indicator.name}:`, error);
    }
    return indicator;
  });
  
  // 모든 지표를 병렬로 가져오기
  await Promise.allSettled(fetchPromises);
  
  return indicators;
}

