/**
 * H.4.1 공식 캘린더에서 발표일 수집
 * 문자열 기반 날짜 처리로 타임존 변환 문제 방지
 */

const H41_CALENDAR_URL = "https://www.federalreserve.gov/releases/h41/";

/**
 * YYYYMMDD 형식을 YYYY-MM-DD로 변환 (문자열 기반)
 */
export function ymdToIso(ymd: string): string {
  if (!/^\d{8}$/.test(ymd)) {
    throw new Error(`Invalid YYYYMMDD format: ${ymd}`);
  }
  return `${ymd.substring(0, 4)}-${ymd.substring(4, 6)}-${ymd.substring(6, 8)}`;
}

/**
 * ISO 날짜 문자열(YYYY-MM-DD)을 YYYYMMDD 형식으로 변환 (타임존 안전, 문자열 split 방식)
 * "2026-01-02" -> "20260102"
 * 
 * 중요: Date 객체를 사용하지 않고 순수 문자열 split으로 처리하여
 * 타임존 변환으로 인한 하루 밀림 문제를 방지합니다.
 */
export function yyyymmddFromISO(iso: string): string {
  const parts = iso.split('-');
  if (parts.length !== 3) {
    throw new Error(`Invalid ISO date format: ${iso}. Expected YYYY-MM-DD.`);
  }
  const [y, m, d] = parts;
  if (!y || !m || !d || y.length !== 4 || m.length !== 2 || d.length !== 2) {
    throw new Error(`Invalid ISO date format: ${iso}. Expected YYYY-MM-DD.`);
  }
  return `${y}${m}${d}`;
}

/**
 * @deprecated Use yyyymmddFromISO instead
 */
export function isoToYmd(iso: string): string {
  return yyyymmddFromISO(iso);
}

/**
 * H.4.1 공식 캘린더에서 발표일 목록 수집
 * @returns YYYYMMDD 형식의 날짜 배열 (최신순)
 */
export async function fetchH41CalendarDates(): Promise<string[]> {
  try {
    const response = await fetch(H41_CALENDAR_URL, {
      headers: {
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "accept-language": "en-US,en;q=0.9",
      },
      cache: "no-store" as RequestCache,
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch H.4.1 calendar: ${response.status} ${response.statusText}`);
    }

    const html = await response.text();

    // 정규식으로 /releases/h41/YYYYMMDD/ 패턴 추출
    const datePattern = /\/releases\/h41\/(\d{8})\//g;
    const dateSet = new Set<string>();
    let match;

    while ((match = datePattern.exec(html)) !== null) {
      const ymd = match[1];
      // 유효성 검증: 2023년 이후만 (아카이브 제외)
      const year = parseInt(ymd.substring(0, 4), 10);
      if (year >= 2023 && year <= 2100) {
        dateSet.add(ymd);
      }
    }

    // Set을 배열로 변환 후 최신순 정렬 (숫자 내림차순)
    const dates = Array.from(dateSet);
    dates.sort((a, b) => Number(b) - Number(a));

    console.log(`[H.4.1 Calendar] Collected ${dates.length} release dates from calendar`);

    // 최소 검증: 상위 30개 중에 20260102, 20251229 포함 여부 확인
    const top30 = dates.slice(0, 30);
    const criticalDates = ['20260102', '20251229'];
    const foundCritical = criticalDates.filter(d => top30.includes(d));
    console.log(`[H.4.1 Calendar] Top 30 dates check - Found: [${foundCritical.join(', ')}], Missing: [${criticalDates.filter(d => !top30.includes(d)).join(', ')}]`);
    console.log(`[H.4.1 Calendar] Top 20 dates:`, top30.slice(0, 20));

    return dates;
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : String(e);
    console.error(`[H.4.1 Calendar] Failed to fetch calendar dates: ${errorMsg}`);
    throw new Error(`Failed to fetch H.4.1 calendar dates: ${errorMsg}`);
  }
}