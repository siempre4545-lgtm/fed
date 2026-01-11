/**
 * H.4.1 릴리즈 날짜 역탐색 유틸리티
 * 개별 릴리즈 URL을 날짜순으로 확인하며 유효한 것만 수집
 */

const ARCHIVE_BASE_URL = "https://www.federalreserve.gov/releases/h41/";

/**
 * 날짜에서 릴리즈 URL 생성
 */
function buildReleaseUrl(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const yyyymmdd = `${year}${month}${day}`;
  return `${ARCHIVE_BASE_URL}${yyyymmdd}/default.htm`;
}

/**
 * 타임아웃이 있는 fetch
 */
async function fetchWithTimeout(url: string, timeoutMs: number = 2500): Promise<Response> {
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
      cache: "no-store" as RequestCache,
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
 * H.4.1 릴리즈 HTML 유효성 검증
 */
function isValidH41ReleaseHtml(html: string): boolean {
  if (!html || html.length < 500) return false;
  
  const htmlLower = html.toLowerCase();
  
  // 최소 2개 조건 통과 필요
  let validCount = 0;
  
  // 조건 1: "Factors Affecting Reserve Balances" 또는 "H.4.1" 키워드
  if (htmlLower.includes("factors affecting reserve balances") || htmlLower.includes("h.4.1")) {
    validCount++;
  }
  
  // 조건 2: "Table 1" 또는 "TABLE 1"
  if (htmlLower.includes("table 1") || htmlLower.includes("<table")) {
    validCount++;
  }
  
  // 조건 3: 핵심 항목 텍스트 존재
  const coreItems = [
    "u.s. treasury securities",
    "mortgage-backed securities",
    "reserve balances with federal reserve banks",
    "reverse repurchase agreements",
    "u.s. treasury, general account"
  ];
  
  const hasCoreItem = coreItems.some(item => htmlLower.includes(item));
  if (hasCoreItem) {
    validCount++;
  }
  
  return validCount >= 2;
}

/**
 * 최근 발표일 역탐색
 */
export async function discoverRecentReleaseDates(options: {
  startDate: Date;
  targetCount?: number;
  lookbackDays?: number;
}): Promise<string[]> {
  const { startDate, targetCount = 40, lookbackDays = 120 } = options;
  
  const dates: string[] = [];
  const dateSet = new Set<string>();
  let currentDate = new Date(startDate);
  let scannedDays = 0;
  const maxLookbackDays = lookbackDays;
  
  // 최신 발표일부터 역순으로 탐색
  while (dates.length < targetCount && scannedDays < maxLookbackDays) {
    const url = buildReleaseUrl(currentDate);
    
    try {
      const response = await fetchWithTimeout(url, 2500);
      
      if (response.ok) {
        const html = await response.text();
        
        if (isValidH41ReleaseHtml(html)) {
          const year = currentDate.getFullYear();
          const month = String(currentDate.getMonth() + 1).padStart(2, '0');
          const day = String(currentDate.getDate()).padStart(2, '0');
          const isoDate = `${year}-${month}-${day}`;
          
          if (!dateSet.has(isoDate)) {
            dates.push(isoDate);
            dateSet.add(isoDate);
          }
        }
      }
    } catch (e) {
      // 타임아웃이나 네트워크 에러는 무시하고 계속 진행
      // console.warn(`[H.4.1 Discovery] Failed to check ${url}:`, e instanceof Error ? e.message : String(e));
    }
    
    // 하루씩 과거로 이동
    currentDate.setDate(currentDate.getDate() - 1);
    scannedDays++;
  }
  
  // 최신순 정렬 (내림차순)
  dates.sort((a, b) => {
    const dateA = new Date(a).getTime();
    const dateB = new Date(b).getTime();
    return dateB - dateA;
  });
  
  return dates;
}
