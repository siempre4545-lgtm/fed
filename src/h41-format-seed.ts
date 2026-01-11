/**
 * H.4.1 DataDownload Format 페이지에서 최신 릴리즈 날짜를 파싱
 * 역탐색(backfill)의 seed로 사용
 */

const FORMAT_PAGE_URL = "https://www.federalreserve.gov/datadownload/Format.aspx?rel=H41&series=cc73dc54904678a485aa7d87a81c786f";

// 월 이름 -> 월 숫자 매핑
const MONTH_NAMES: Record<string, string> = {
  "january": "01", "february": "02", "march": "03", "april": "04",
  "may": "05", "june": "06", "july": "07", "august": "08",
  "september": "09", "october": "10", "november": "11", "december": "12",
  "jan": "01", "feb": "02", "mar": "03", "apr": "04",
  "jun": "06", "jul": "07", "aug": "08", "sep": "09",
  "oct": "10", "nov": "11", "dec": "12",
};

/**
 * Format 페이지에서 최신 릴리즈 날짜 파싱
 * @returns ISO 형식 날짜 (YYYY-MM-DD) 또는 null
 */
export async function fetchLatestReleaseDateFromFormatPage(): Promise<string | null> {
  try {
    const response = await fetch(FORMAT_PAGE_URL, {
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; fedreportsh/1.0; +https://fedreportsh.vercel.app)",
        "accept": "text/html,application/xhtml+xml",
        "accept-language": "en-US,en;q=0.9",
      },
      cache: "no-store" as RequestCache,
    });

    if (!response.ok) {
      console.warn(`[H.4.1 Format] Failed to fetch Format page: ${response.status} ${response.statusText}`);
      return null;
    }

    const html = await response.text();

    // "last released" 패턴 찾기 (대소문자 무시)
    // 예: "last released Thursday, January 8, 2026"
    // 예: "last released Thursday, Jan 8, 2026"
    const patterns = [
      /last\s+released\s+\w+,\s+([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})/i,
      /last\s+released\s+([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})/i,
    ];

    for (const pattern of patterns) {
      const match = pattern.exec(html);
      if (match) {
        const monthName = match[1].toLowerCase();
        const day = match[2].padStart(2, '0');
        const year = match[3];

        const month = MONTH_NAMES[monthName];
        if (!month) {
          console.warn(`[H.4.1 Format] Unknown month name: ${monthName}`);
          continue;
        }

        const isoDate = `${year}-${month}-${day}`;
        console.log(`[H.4.1 Format] Parsed latest release date: ${isoDate}`);
        return isoDate;
      }
    }

    console.warn(`[H.4.1 Format] No "last released" pattern found in Format page`);
    return null;
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : String(e);
    console.error(`[H.4.1 Format] Error fetching Format page: ${errorMsg}`);
    return null;
  }
}
