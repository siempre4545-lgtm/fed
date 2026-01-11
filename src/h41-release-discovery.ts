/**
 * H.4.1 릴리즈 날짜 역탐색 유틸리티
 * current/ 페이지를 기준점으로 하여 일 단위 연속 스캔으로 개별 릴리즈 URL 존재 여부 확인
 */

const ARCHIVE_BASE_URL = "https://www.federalreserve.gov/releases/h41/";
const CURRENT_URL = "https://www.federalreserve.gov/releases/h41/current/";

/**
 * 날짜에서 릴리즈 URL 생성 (2가지 패턴 지원)
 */
function buildReleaseUrl(date: Date, useDefaultHtm: boolean = false): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const yyyymmdd = `${year}${month}${day}`;
  
  if (useDefaultHtm) {
    return `${ARCHIVE_BASE_URL}${yyyymmdd}/default.htm`;
  }
  return `${ARCHIVE_BASE_URL}${yyyymmdd}/`;
}

/**
 * 타임아웃이 있는 fetch (캐시 no-store)
 */
async function fetchWithTimeout(
  url: string, 
  timeoutMs: number = 2500
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "accept-language": "en-US,en;q=0.9",
      },
      redirect: "follow" as RequestRedirect,
      cache: "no-store" as RequestCache, // 원천 HTML은 no-store
    });
    clearTimeout(timeoutId);
    return response;
  } catch (e) {
    clearTimeout(timeoutId);
    if (e instanceof Error && e.name === 'AbortError') {
      throw new Error(`Timeout after ${timeoutMs}ms`);
    }
    throw e;
  }
}

/**
 * H.4.1 릴리즈 HTML 유효성 검증 (강화)
 */
function isValidH41ReleaseHtml(html: string): boolean {
  if (!html || html.length < 500) return false;
  
  const htmlLower = html.toLowerCase();
  
  // 차단/비정상 페이지 감지 (INVALID 처리)
  const invalidPatterns = [
    "access denied",
    "please enable javascript",
    "you need to enable javascript",
    "robot",
    "bot detected",
    "403 forbidden",
    "page not found",
    "404 error",
  ];
  
  if (invalidPatterns.some(pattern => htmlLower.includes(pattern))) {
    return false;
  }
  
  // 유효한 H.4.1 페이지 검증 (시그니처 2종 이상)
  let validCount = 0;
  
  // 조건 1: "H.4.1" 키워드 (필수)
  if (htmlLower.includes("h.4.1") || htmlLower.includes("frb: h.4.1")) {
    validCount++;
  }
  
  // 조건 2: "Factors Affecting Reserve Balances" 또는 "FRB: H.4.1"
  if (
    htmlLower.includes("factors affecting reserve balances") || 
    htmlLower.includes("frb: h.4.1")
  ) {
    validCount++;
  }
  
  // 조건 3: "Table 1" 또는 "<table" 태그
  if (htmlLower.includes("table 1") || htmlLower.includes("<table")) {
    validCount++;
  }
  
  // 조건 4: 핵심 항목 텍스트 존재
  const coreItems = [
    "u.s. treasury securities",
    "mortgage-backed securities",
    "reserve balances with federal reserve banks",
    "reverse repurchase agreements",
    "reverse repurchase",
    "u.s. treasury, general account",
  ];
  
  const hasCoreItem = coreItems.some(item => htmlLower.includes(item));
  if (hasCoreItem) {
    validCount++;
  }
  
  // 시그니처 2종 이상 통과 필요
  return validCount >= 2;
}

/**
 * 파싱 결과 검증 (핵심 필드 3개 이상이 0이면 INVALID)
 * 실제 파싱은 하지 않고 HTML만으로 간접 검증
 */
function isValidH41ReleaseByHtml(html: string): boolean {
  if (!isValidH41ReleaseHtml(html)) {
    return false;
  }
  
  const htmlLower = html.toLowerCase();
  
  // 숫자 패턴이 충분히 많은지 확인 (최소 10개 이상의 큰 숫자)
  const largeNumberPattern = /\d{1,3}(?:,\d{3})+(?:\.\d+)?/g;
  const numbers = htmlLower.match(largeNumberPattern);
  
  // 최소 10개 이상의 큰 숫자가 있어야 유효한 데이터로 간주
  if (!numbers || numbers.length < 10) {
    return false;
  }
  
  return true;
}

/**
 * 단일 날짜 후보 검증 (2가지 URL 패턴 시도)
 */
async function checkDateCandidate(date: Date): Promise<string | null> {
  const urlPatterns = [
    buildReleaseUrl(date, false), // /YYYYMMDD/
    buildReleaseUrl(date, true),  // /YYYYMMDD/default.htm
  ];
  
  for (const url of urlPatterns) {
    try {
      const response = await fetchWithTimeout(url, 2500);
      
      if (response.ok && response.status === 200) {
        const html = await response.text();
        
        if (isValidH41ReleaseByHtml(html)) {
          const year = date.getFullYear();
          const month = String(date.getMonth() + 1).padStart(2, '0');
          const day = String(date.getDate()).padStart(2, '0');
          const isoDate = `${year}-${month}-${day}`;
          return isoDate;
        }
      }
    } catch (e) {
      // 타임아웃이나 네트워크 에러는 무시하고 다음 패턴 시도
      continue;
    }
  }
  
  return null;
}

/**
 * current/ 페이지에서 최신 릴리즈 날짜 파싱 (기준점 설정)
 */
export async function getAnchorReleaseDate(): Promise<Date> {
  try {
    // current/ 페이지에서 최신 릴리즈 날짜 파싱
    const response = await fetchWithTimeout(CURRENT_URL, 3000);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch current/ page: ${response.status} ${response.statusText}`);
    }
    
    const html = await response.text();
    
    // HTML이 너무 짧거나 에러 페이지인지 확인
    if (html.length < 500 || html.toLowerCase().includes("page not found") || html.toLowerCase().includes("404 error")) {
      throw new Error(`Current/ page appears to be invalid (length: ${html.length}, contains error markers)`);
    }
    
    // "Release Date:" 패턴으로 날짜 추출
    const releaseDateMatch = html.match(/Release Date:\s*([A-Za-z]+\s+\d{1,2},\s+\d{4})/i);
    
    if (!releaseDateMatch || !releaseDateMatch[1]) {
      // 대체 패턴 시도: "January 8, 2026" 같은 형식
      const altMatch = html.match(/([A-Za-z]+\s+\d{1,2},\s+\d{4})\s*(?:Release|H\.4\.1)/i);
      if (!altMatch || !altMatch[1]) {
        throw new Error(`Failed to parse release date from current/ page HTML. HTML preview: ${html.substring(0, 500)}`);
      }
      
      const parsedDate = new Date(altMatch[1]);
      if (isNaN(parsedDate.getTime())) {
        throw new Error(`Failed to parse date string "${altMatch[1]}" from current/ page`);
      }
      
      console.log(`[H.4.1 Discovery] Parsed anchor date from current/ page (alt pattern): ${altMatch[1]} (${parsedDate.toISOString().split('T')[0]})`);
      return parsedDate;
    }
    
    const dateStr = releaseDateMatch[1];
    const parsedDate = new Date(dateStr);
    
    if (isNaN(parsedDate.getTime())) {
      throw new Error(`Failed to parse date string "${dateStr}" from current/ page`);
    }
    
    console.log(`[H.4.1 Discovery] Parsed anchor date from current/ page: ${dateStr} (${parsedDate.toISOString().split('T')[0]})`);
    return parsedDate;
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : String(e);
    console.error(`[H.4.1 Discovery] Failed to get anchor date from current/ page: ${errorMsg}`);
    throw new Error(`Failed to get anchor release date from current/ page: ${errorMsg}`);
  }
}

/**
 * 슬라이딩 윈도우 병렬화: 날짜 블록을 병렬로 검증
 */
async function checkDateBlock(
  dates: Date[],
  concurrency: number = 5
): Promise<string[]> {
  const results: string[] = [];
  
  // concurrency만큼 동시에 처리
  for (let i = 0; i < dates.length; i += concurrency) {
    const block = dates.slice(i, i + concurrency);
    const blockResults = await Promise.allSettled(
      block.map(date => checkDateCandidate(date))
    );
    
    blockResults.forEach((result, index) => {
      if (result.status === 'fulfilled' && result.value) {
        results.push(result.value);
      }
    });
  }
  
  return results;
}

/**
 * 최근 발표일 역탐색 (일 단위 연속 스캔)
 */
export async function discoverRecentReleaseDates(options: {
  anchorDate?: Date;
  targetCount?: number;
  lookbackDays?: number;
}): Promise<string[]> {
  const { anchorDate, targetCount = 40, lookbackDays = 120 } = options;
  
  // 기준점 날짜 가져오기
  let startDate: Date;
  try {
    if (anchorDate) {
      startDate = new Date(anchorDate);
    } else {
      startDate = await getAnchorReleaseDate();
    }
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : String(e);
    console.error(`[H.4.1 Discovery] Failed to get anchor date: ${errorMsg}`);
    throw new Error(`Failed to get anchor release date: ${errorMsg}`);
  }
  
  const dates: string[] = [];
  const dateSet = new Set<string>();
  
  // anchor부터 하루씩 감소시키며 검사할 날짜 목록 생성
  const dateCandidates: Date[] = [];
  let currentDate = new Date(startDate);
  
  for (let i = 0; i < lookbackDays && dates.length < targetCount; i++) {
    dateCandidates.push(new Date(currentDate));
    currentDate.setDate(currentDate.getDate() - 1);
  }
  
  // 슬라이딩 윈도우 병렬화: 14일 블록, concurrency 5
  const windowSize = 14;
  const concurrency = 5;
  
  for (let i = 0; i < dateCandidates.length && dates.length < targetCount; i += windowSize) {
    const window = dateCandidates.slice(i, i + windowSize);
    const windowResults = await checkDateBlock(window, concurrency);
    
    windowResults.forEach(isoDate => {
      if (!dateSet.has(isoDate)) {
        dates.push(isoDate);
        dateSet.add(isoDate);
      }
    });
    
    // 목표 수량에 도달하면 중단
    if (dates.length >= targetCount) {
      break;
    }
  }
  
  // 최신순 정렬 (내림차순)
  dates.sort((a, b) => {
    const dateA = new Date(a).getTime();
    const dateB = new Date(b).getTime();
    return dateB - dateA;
  });
  
  console.log(`[H.4.1 Discovery] Discovered ${dates.length} release dates (anchor: ${startDate.toISOString().split('T')[0]}, target: ${targetCount}, lookback: ${lookbackDays} days)`);
  
  // 연도 경계 날짜 확인
  const criticalDates = ['2026-01-02', '2025-12-29', '2026-01-08', '2025-12-18'];
  const foundCriticalDates = criticalDates.filter(d => dates.includes(d));
  console.log(`[H.4.1 Discovery] Critical dates check - Found: [${foundCriticalDates.join(', ')}], Missing: [${criticalDates.filter(d => !dates.includes(d)).join(', ')}]`);
  
  // 상위 15개 날짜 출력 (디버그)
  if (dates.length > 0) {
    console.log(`[H.4.1 Discovery] Top 15 dates:`, dates.slice(0, 15));
  }
  
  return dates;
}