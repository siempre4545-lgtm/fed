/**
 * H.4.1 아카이브 데이터 fetch & parse
 * 문자열 기반 날짜 처리로 타임존 변환 문제 방지
 */

import * as cheerio from "cheerio";
import { fetchH41Report } from "./h41.js";
import { ymdToIso } from "./h41-calendar.js";

const ARCHIVE_BASE_URL = "https://www.federalreserve.gov/releases/h41/";

export type ParsedRow = {
  date: string; // ISO format "YYYY-MM-DD"
  assetTotal: { value: number; delta: number | null };
  treasury: { value: number; delta: number | null };
  mbs: { value: number; delta: number | null };
  repo: { value: number; delta: number | null };
  loans: { value: number; delta: number | null };
  liabilityTotal: { value: number; delta: number | null };
  currency: { value: number; delta: number | null };
  rrp: { value: number; delta: number | null };
  tga: { value: number; delta: number | null };
  reserves: { value: number; delta: number | null };
};

/**
 * H.4.1 아카이브 데이터 fetch & parse
 * @param ymd YYYYMMDD 형식의 날짜
 * @returns 파싱된 행 데이터
 */
export async function fetchH41Archive(ymd: string): Promise<ParsedRow | null> {
  // URL 후보 (ymd 그대로 사용)
  const urlCandidates = [
    `${ARCHIVE_BASE_URL}${ymd}/h41.txt`, // 1순위
    `${ARCHIVE_BASE_URL}${ymd}/`, // 2순위
    `${ARCHIVE_BASE_URL}${ymd}/default.htm`, // 3순위
  ];

  let report: Awaited<ReturnType<typeof fetchH41Report>> | null = null;

  // ISO 형식으로 변환 (기존 fetchH41Report는 ISO 형식을 받음)
  const isoDate = ymdToIso(ymd);

  // 기존 fetchH41Report 함수 재사용 (이미 안정적으로 구현되어 있음)
  try {
    report = await fetchH41Report(isoDate);
  } catch (e) {
    console.warn(`[H.4.1 Archive] Failed to fetch archive for ${ymd} (${isoDate}):`, e instanceof Error ? e.message : String(e));
    return null;
  }

  if (!report || !report.cards || report.cards.length === 0) {
    console.warn(`[H.4.1 Archive] No cards found in report for ${ymd}`);
    return null;
  }

  // 카드에서 필요한 항목 추출
  const findCard = (fedLabel: string) => {
    return report!.cards.find(c => c.fedLabel === fedLabel);
  };

  // 자산 항목
  const treasuryCard = findCard("U.S. Treasury securities");
  const mbsCard = findCard("Mortgage-backed securities");
  const repoCard = findCard("Repurchase agreements");
  const loansCard = findCard("Primary credit");

  // 부채 항목
  const currencyCard = findCard("Currency in circulation");
  const rrpCard = findCard("Reverse repurchase agreements");
  const tgaCard = findCard("U.S. Treasury, General Account");
  const reservesCard = findCard("Reserve balances with Federal Reserve Banks");

  // 값 추출 (Millions of USD 단위로 유지, 나중에 조 단위로 변환)
  const treasury = treasuryCard ? treasuryCard.balance_musd : 0;
  const mbs = mbsCard ? mbsCard.balance_musd : 0;
  const repo = repoCard ? repoCard.balance_musd : 0;
  const loans = loansCard ? loansCard.balance_musd : 0;

  const currency = currencyCard ? currencyCard.balance_musd : 0;
  const rrp = rrpCard ? rrpCard.balance_musd : 0;
  const tga = tgaCard ? tgaCard.balance_musd : 0;
  const reserves = reservesCard ? reservesCard.balance_musd : 0;

  // 합계 계산
  const assetTotal = treasury + mbs + repo + loans;
  const liabilityTotal = currency + rrp + tga + reserves;

  // delta는 나중에 계산 (이전 행과 비교)
  return {
    date: isoDate,
    assetTotal: { value: assetTotal, delta: null },
    treasury: { value: treasury, delta: null },
    mbs: { value: mbs, delta: null },
    repo: { value: repo, delta: null },
    loans: { value: loans, delta: null },
    liabilityTotal: { value: liabilityTotal, delta: null },
    currency: { value: currency, delta: null },
    rrp: { value: rrp, delta: null },
    tga: { value: tga, delta: null },
    reserves: { value: reserves, delta: null },
  };
}

/**
 * 여러 날짜의 아카이브 데이터를 병렬로 fetch & parse
 * @param ymds YYYYMMDD 형식의 날짜 배열
 * @param concurrency 동시 처리 개수 (기본 4)
 * @returns 파싱된 행 데이터 배열 (null 제외)
 */
export async function fetchH41ArchivesBatch(
  ymds: string[],
  concurrency: number = 4
): Promise<ParsedRow[]> {
  const results: ParsedRow[] = [];

  // concurrency만큼 동시에 처리
  for (let i = 0; i < ymds.length; i += concurrency) {
    const batch = ymds.slice(i, i + concurrency);
    const batchResults = await Promise.allSettled(
      batch.map(ymd => fetchH41Archive(ymd))
    );

    batchResults.forEach((result, index) => {
      if (result.status === 'fulfilled' && result.value) {
        results.push(result.value);
      } else {
        const ymd = batch[index];
        console.warn(`[H.4.1 Archive] Failed to fetch archive for ${ymd}:`, 
          result.status === 'rejected' ? result.reason : 'null result');
      }
    });
  }

  return results;
}

/**
 * delta 계산 (이전 행과 비교)
 * @param rows 파싱된 행 배열 (최신순)
 */
export function calculateDeltas(rows: ParsedRow[]): void {
  for (let i = 0; i < rows.length; i++) {
    const current = rows[i];
    const previous = rows[i + 1]; // 다음 행이 이전 발표일

    if (previous) {
      current.assetTotal.delta = current.assetTotal.value - previous.assetTotal.value;
      current.treasury.delta = current.treasury.value - previous.treasury.value;
      current.mbs.delta = current.mbs.value - previous.mbs.value;
      current.repo.delta = current.repo.value - previous.repo.value;
      current.loans.delta = current.loans.value - previous.loans.value;
      current.liabilityTotal.delta = current.liabilityTotal.value - previous.liabilityTotal.value;
      current.currency.delta = current.currency.value - previous.currency.value;
      current.rrp.delta = current.rrp.value - previous.rrp.value;
      current.tga.delta = current.tga.value - previous.tga.value;
      current.reserves.delta = current.reserves.value - previous.reserves.value;
    }
    // 마지막 행은 delta가 null로 유지됨
  }
}