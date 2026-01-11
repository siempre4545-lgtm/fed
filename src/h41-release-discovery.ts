/**
 * H.4.1 릴리즈 날짜 역탐색 유틸리티
 * current/ 페이지를 기준점으로 하여 역추적 방식으로 개별 릴리즈 URL 존재 여부 확인
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
 * 타임아웃이 있는 fetch (캐시 사용 가능)
 */
async function fetchWithTimeout(
  url: string, 
  timeoutMs: number = 2500,
  useCache: boolean = false
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
      cache: useCache ? ("force-cache" as RequestCache) : ("no-store" as RequestCache),
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
  
  // 유효한 H.4.1 페이지 검증 (최소 2개 조건 통과 필요)
  let validCount = 0;
  
  // 조건 1: "Factors Affecting Reserve Balances" 또는 "H.4.1" 또는 "FRB: H.4.1" 키워드
  if (
    htmlLower.includes("factors affecting reserve balances") || 
    htmlLower.includes("h.4.1") ||
    htmlLower.includes("frb: h.4.1")
  ) {
    validCount++;
  }
  
  // 조건 2: "Table 1" 또는 "<table" 태그
  if (htmlLower.includes("table 1") || htmlLower.includes("<table")) {
    validCount++;
  }
  
  // 조건 3: 핵심 항목 텍스트 존재
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
  
  return validCount >= 2;
}

/**
 * current/ 페이지에서 최신 릴리즈 날짜 파싱 (기준점 설정)
 */
export async function getAnchorReleaseDate(): Promise<Date> {
  try {
    // current/ 페이지에서 최신 릴리즈 날짜 파싱
    const response = await fetchWithTimeout(CURRENT_URL, 3000, true); // 캐시 사용
    
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
 * 특정 날짜 주변(±offsetDays)에서 유효한 릴리즈 페이지 찾기
 * ±3일 범위 보정 탐색으로 연휴/일정 변경 대응
 */
async function findValidReleaseAroundDate(
  targetDate: Date,
  offsetDays: number = 3
): Promise<string | null> {
  const offsets = [0, -1, 1, -2, 2, -3, 3]; // 0부터 ±1, ±2, ±3 순서로 시도
  
  for (const offset of offsets) {
    if (Math.abs(offset) > offsetDays) continue;
    
    const candidateDate = new Date(targetDate);
    candidateDate.setDate(targetDate.getDate() + offset);
    
    // 2가지 URL 패턴 시도
    const urlPatterns = [
      buildReleaseUrl(candidateDate, false), // /YYYYMMDD/
      buildReleaseUrl(candidateDate, true),  // /YYYYMMDD/default.htm
    ];
    
    for (const url of urlPatterns) {
      try {
        const response = await fetchWithTimeout(url, 2500);
        
        if (response.ok) {
          const html = await response.text();
          
          if (isValidH41ReleaseHtml(html)) {
            const year = candidateDate.getFullYear();
            const month = String(candidateDate.getMonth() + 1).padStart(2, '0');
            const day = String(candidateDate.getDate()).padStart(2, '0');
            const isoDate = `${year}-${month}-${day}`;
            
            if (offset !== 0) {
              console.log(`[H.4.1 Discovery] Found valid release at ${isoDate} (offset: ${offset} days from target)`);
            }
            
            return isoDate;
          }
        }
      } catch (e) {
        // 타임아웃이나 네트워크 에러는 무시하고 다음 후보 시도
        continue;
      }
    }
  }
  
  return null;
}

/**
 * 최근 발표일 역탐색 (current/ 기준점 + ±3일 보정 탐색)
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
  let currentTargetDate = new Date(startDate);
  let scannedDays = 0;
  const maxLookbackDays = lookbackDays;
  let consecutiveFailures = 0;
  const maxConsecutiveFailures = 14; // 2주간 연속 실패 시 중단
  
  // 최신 발표일부터 역순으로 탐색
  while (dates.length < targetCount && scannedDays < maxLookbackDays) {
    // ±3일 범위 보정 탐색
    const foundDate = await findValidReleaseAroundDate(currentTargetDate, 3);
    
    if (foundDate && !dateSet.has(foundDate)) {
      dates.push(foundDate);
      dateSet.add(foundDate);
      consecutiveFailures = 0; // 성공 시 실패 카운터 리셋
      
      // 다음 탐색 목표: 찾은 날짜에서 -7일 (주간 릴리즈 가정)
      const foundDateObj = new Date(foundDate);
      currentTargetDate = new Date(foundDateObj);
      currentTargetDate.setDate(foundDateObj.getDate() - 7);
    } else {
      consecutiveFailures++;
      
      // 연속 실패가 너무 많으면 중단 (더 이상 유효한 릴리즈가 없을 가능성)
      if (consecutiveFailures >= maxConsecutiveFailures) {
        console.log(`[H.4.1 Discovery] Stopping after ${consecutiveFailures} consecutive failures`);
        break;
      }
      
      // 다음 탐색 목표: 현재 목표에서 -7일
      currentTargetDate.setDate(currentTargetDate.getDate() - 7);
    }
    
    scannedDays += 7; // 주간 단위로 진행
  }
  
  // 최신순 정렬 (내림차순)
  dates.sort((a, b) => {
    const dateA = new Date(a).getTime();
    const dateB = new Date(b).getTime();
    return dateB - dateA;
  });
  
  console.log(`[H.4.1 Discovery] Discovered ${dates.length} release dates (anchor: ${startDate.toISOString().split('T')[0]}, target: ${targetCount}, scanned: ${scannedDays} days)`);
  
  // 연도 경계 날짜 확인
  const criticalDates = ['2026-01-02', '2025-12-29', '2026-01-08', '2025-12-18'];
  const foundCriticalDates = criticalDates.filter(d => dates.includes(d));
  console.log(`[H.4.1 Discovery] Critical dates check - Found: [${foundCriticalDates.join(', ')}], Missing: [${criticalDates.filter(d => !dates.includes(d)).join(', ')}]`);
  
  return dates;
}