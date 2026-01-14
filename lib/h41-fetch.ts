/**
 * H.4.1 HTML 수집 모듈
 * 엄격한 검증과 재시도 로직을 포함한 HTML 수집
 */

export type FetchH41Result = {
  html: string;
  url: string;
  fetchedAt: string;
};

export type FetchH41ErrorCode =
  | 'NO_RELEASE_FOR_DATE'
  | 'FETCH_BLOCKED_OR_UNEXPECTED_HTML'
  | `HTTP_ERROR_${number}`;

export class FetchH41Error extends Error {
  constructor(
    public code: FetchH41ErrorCode,
    message: string,
    public url?: string,
    public status?: number
  ) {
    super(message);
    this.name = 'FetchH41Error';
  }
}

/**
 * H.4.1 HTML 본문 검증
 * @param html HTML 문자열
 * @returns 검증 통과 여부
 */
function validateH41Html(html: string): boolean {
  const lowerHtml = html.toLowerCase();
  
  // 정부 배너만 있는지 확인
  const hasGovBanner = lowerHtml.includes('an official website of the united states government');
  
  // H.4.1 본문 키워드 확인
  const keywords = [
    'h.4.1',
    'factors affecting reserve balances',
    'consolidated statement of condition',
    'reserve bank credit',
  ];
  
  const matchedKeywords = keywords.filter(keyword => lowerHtml.includes(keyword));
  
  // 정부 배너만 있고 키워드가 부족하면 실패
  if (hasGovBanner && matchedKeywords.length < 2) {
    return false;
  }
  
  // 키워드 2개 이상이면 통과
  return matchedKeywords.length >= 2;
}

/**
 * 날짜를 YYYYMMDD 형식으로 변환
 */
function formatDateForURL(date: string): string {
  return date.replace(/-/g, '');
}

/**
 * H.4.1 HTML을 엄격하게 수집
 * @param dateISO YYYY-MM-DD 형식의 날짜
 * @returns HTML, URL, 수집 시각
 * @throws FetchH41Error
 */
export async function fetchH41HtmlStrict(dateISO: string): Promise<FetchH41Result> {
  const dateStr = formatDateForURL(dateISO);
  const baseUrl = `https://www.federalreserve.gov/releases/h41/${dateStr}/default.htm`;
  const refererUrl = 'https://www.federalreserve.gov/releases/h41/';
  
  const fetchOptions: RequestInit = {
    redirect: 'follow',
    cache: 'no-store',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer': refererUrl,
    },
  };
  
  // 1차 시도
  let response: Response;
  try {
    response = await fetch(baseUrl, fetchOptions);
  } catch (error) {
    throw new FetchH41Error(
      'FETCH_BLOCKED_OR_UNEXPECTED_HTML',
      `Failed to fetch H.4.1 HTML: ${error instanceof Error ? error.message : String(error)}`,
      baseUrl
    );
  }
  
  if (!response.ok) {
    throw new FetchH41Error(
      `HTTP_ERROR_${response.status}` as FetchH41ErrorCode,
      `HTTP ${response.status} ${response.statusText}`,
      baseUrl,
      response.status
    );
  }
  
  let html = await response.text();
  
  // HTML 검증
  if (validateH41Html(html)) {
    return {
      html,
      url: baseUrl,
      fetchedAt: new Date().toISOString(),
    };
  }
  
  // 2차 시도 (헤더 약간 변경)
  try {
    const retryOptions: RequestInit = {
      ...fetchOptions,
      headers: {
        ...fetchOptions.headers,
        'Accept-Language': 'en-US,en;q=0.8',
      },
    };
    
    response = await fetch(baseUrl, retryOptions);
    
    if (response.ok) {
      html = await response.text();
      
      if (validateH41Html(html)) {
        return {
          html,
          url: baseUrl,
          fetchedAt: new Date().toISOString(),
        };
      }
    }
  } catch (error) {
    // 2차 시도 실패는 무시하고 3차로 진행
  }
  
  // 3차 시도: 메인 페이지에서 날짜 링크 확인
  try {
    const mainPageUrl = 'https://www.federalreserve.gov/releases/h41/';
    const mainResponse = await fetch(mainPageUrl, fetchOptions);
    
    if (mainResponse.ok) {
      const mainHtml = await mainResponse.text();
      const dateLinkPattern = new RegExp(`/releases/h41/${dateStr}/`, 'i');
      
      if (!dateLinkPattern.test(mainHtml)) {
        throw new FetchH41Error(
          'NO_RELEASE_FOR_DATE',
          `No H.4.1 release found for date ${dateISO}`,
          baseUrl
        );
      }
    }
  } catch (error) {
    if (error instanceof FetchH41Error) {
      throw error;
    }
    // 메인 페이지 확인 실패는 무시
  }
  
  // 모든 시도 실패
  throw new FetchH41Error(
    'FETCH_BLOCKED_OR_UNEXPECTED_HTML',
    'Failed to fetch valid H.4.1 HTML after multiple attempts. The page may be blocked or contain unexpected content.',
    baseUrl
  );
}
