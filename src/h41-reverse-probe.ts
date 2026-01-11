/**
 * H.4.1 릴리즈 날짜 역탐색 (Reverse Probe)
 * Seed 날짜부터 하루씩 감소시키며 실제 존재하는 아카이브 URL을 찾아 릴리즈 날짜 수집
 */

import { fetchLatestReleaseDateFromFormatPage } from "./h41-format-seed.js";
import { yyyymmddFromISO, ymdToIso } from "./h41-calendar.js";

const ARCHIVE_BASE_URL = "https://www.federalreserve.gov/releases/h41/";

/**
 * ISO 날짜(YYYY-MM-DD)를 하루 감소시킴 (문자열 기반)
 * "2026-01-02" -> "2026-01-01"
 * "2026-01-01" -> "2025-12-31"
 */
function subtractOneDay(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  
  let newYear = year;
  let newMonth = month;
  let newDay = day - 1;
  
  if (newDay < 1) {
    newMonth -= 1;
    if (newMonth < 1) {
      newMonth = 12;
      newYear -= 1;
    }
    
    // 해당 월의 마지막 일 계산 (단순화: 31일 가정, 필요시 개선)
    const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    // 윤년 계산 (간단히)
    const isLeapYear = (newYear % 4 === 0 && newYear % 100 !== 0) || (newYear % 400 === 0);
    if (newMonth === 2 && isLeapYear) {
      newDay = 29;
    } else {
      newDay = daysInMonth[newMonth - 1];
    }
  }
  
  return `${String(newYear).padStart(4, '0')}-${String(newMonth).padStart(2, '0')}-${String(newDay).padStart(2, '0')}`;
}

/**
 * 특정 YYYYMMDD 날짜의 H.4.1 아카이브가 유효한지 확인
 * @param ymd YYYYMMDD 형식 날짜
 * @returns 유효하면 true, 아니면 false
 */
async function isValidH41Release(ymd: string): Promise<boolean> {
  const urlCandidates = [
    `${ARCHIVE_BASE_URL}${ymd}/h41.txt`,
    `${ARCHIVE_BASE_URL}${ymd}/default.htm`,
  ];

  for (const url of urlCandidates) {
    try {
      const response = await fetch(url, {
        headers: {
          "user-agent": "Mozilla/5.0 (compatible; fedreportsh/1.0; +https://fedreportsh.vercel.app)",
          "accept": "text/html,application/xhtml+xml,text/plain",
        },
        cache: "no-store" as RequestCache,
      });

      if (response.ok) {
        const text = await response.text();
        // 시그니처 확인: "H.4.1" 또는 "Factors Affecting Reserve Balances"
        if (text.length > 500 && (
          text.includes("H.4.1") ||
          text.includes("Factors Affecting Reserve Balances") ||
          text.includes("Reserve Bank credit")
        )) {
          return true;
        }
      }
    } catch (e) {
      // 다음 URL 시도
      continue;
    }
  }

  return false;
}

export interface DiscoverReleaseDatesOptions {
  limit: number;
  startDateISO?: string; // 시작 날짜 (ISO 형식), 없으면 Format 페이지에서 가져옴
  maxLookbackDays?: number; // 최대 탐색 일수 (기본 120일)
}

export interface DiscoverReleaseDatesResult {
  datesISO: string[]; // ISO 형식 날짜 배열 (최신순)
  nextCursorISO: string | null; // 다음 탐색 시작 날짜 (ISO 형식)
  debug?: {
    seedDateISO: string;
    triedDays: number;
    foundCount: number;
    source: string;
  };
}

/**
 * 역탐색을 통해 실제 존재하는 릴리즈 날짜 수집
 * @param options 탐색 옵션
 * @returns 발견된 날짜 목록 및 다음 cursor
 */
export async function discoverReleaseDates(
  options: DiscoverReleaseDatesOptions
): Promise<DiscoverReleaseDatesResult> {
  const { limit, startDateISO, maxLookbackDays = 120 } = options;
  
  // Seed 날짜 결정
  let seedDateISO: string;
  if (startDateISO) {
    seedDateISO = startDateISO;
  } else {
    const formatDate = await fetchLatestReleaseDateFromFormatPage();
    if (!formatDate) {
      throw new Error("Failed to fetch latest release date from Format page");
    }
    seedDateISO = formatDate;
  }

  const foundDates: string[] = [];
  let currentDateISO = seedDateISO;
  let triedDays = 0;

  // 최대 탐색 일수 내에서 limit개만큼 찾을 때까지 반복
  while (foundDates.length < limit && triedDays < maxLookbackDays) {
    const ymd = yyyymmddFromISO(currentDateISO);
    
    if (await isValidH41Release(ymd)) {
      foundDates.push(currentDateISO);
      console.log(`[H.4.1 Reverse Probe] Found valid release: ${currentDateISO} (${ymd})`);
    }

    // 하루 감소
    currentDateISO = subtractOneDay(currentDateISO);
    triedDays++;
  }

  // 최신순 정렬 (이미 역순이므로 내림차순 유지)
  foundDates.sort((a, b) => b.localeCompare(a));

  // nextCursor는 마지막으로 발견된 날짜의 다음 날짜 (또는 마지막 탐색 날짜)
  // 더보기 시 이 날짜부터 다시 탐색 시작
  const nextCursorISO = foundDates.length === limit && triedDays < maxLookbackDays
    ? currentDateISO // 다음 탐색 시작 날짜 (이미 하루 감소된 상태)
    : null;

  return {
    datesISO: foundDates,
    nextCursorISO,
    debug: {
      seedDateISO,
      triedDays,
      foundCount: foundDates.length,
      source: "reverse-probe",
    },
  };
}
