/**
 * 기존 H41Report를 H4Report 스키마로 변환하는 어댑터
 * 기존 HTML 파싱 로직을 재사용하여 안정적인 데이터 추출
 */

import type { H41Report, H41Card } from './h41-parser';
import type { H4Report, H4ReportOverview, H4ReportFactors, H4ReportSummary, H4ReportMaturity, H4ReportLoansAndLending, H4ReportConsolidatedStatement, H4ReportRegionalFed, H4ReportFRNotes } from './types';
import { translateLabel } from './translations';
import { calculateYearlyChange, type HistoricalData } from './yearly-calculator';
import { promises as fs } from 'fs';
import { join } from 'path';
import { parseMaturityDistribution, parseLoans, parseSecuritiesLending, parseConsolidatedStatement, parseRegionalFed, parseFRNotes } from './h41-table-parser';
import { fetchH41Report, getFedReleaseDates } from './h41-parser';

/**
 * 52주 전 데이터와 직전 주 데이터를 직접 가져오기
 */
async function fetchHistoricalDataForYearlyComparison(
  currentDate: string,
  releaseDates: string[]
): Promise<HistoricalData[]> {
  const historicalData: HistoricalData[] = [];
  
  try {
    // 현재 날짜를 Date 객체로 변환
    const current = new Date(currentDate);
    
    // 52주 전 날짜 계산 (약 364일 전)
    const oneYearAgo = new Date(current);
    oneYearAgo.setDate(oneYearAgo.getDate() - 364);
    
    // 직전 주 날짜 계산 (약 7일 전)
    const oneWeekAgo = new Date(current);
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    
    // releaseDates에서 가장 가까운 날짜 찾기
    const findClosestDate = (targetDate: Date): string | null => {
      let closest: string | null = null;
      let minDiff = Infinity;
      
      for (const releaseDate of releaseDates) {
        const release = new Date(releaseDate);
        const diff = Math.abs(release.getTime() - targetDate.getTime());
        // ±14일 범위 내에서 가장 가까운 날짜
        if (diff <= 14 * 24 * 60 * 60 * 1000 && diff < minDiff) {
          minDiff = diff;
          closest = releaseDate;
        }
      }
      
      return closest;
    };
    
    // 52주 전 데이터 가져오기
    const yearAgoDate = findClosestDate(oneYearAgo);
    if (yearAgoDate) {
      try {
        console.log(`[fetchHistoricalData] Fetching 52 weeks ago data for ${yearAgoDate}`);
        const yearAgoReport = await fetchH41Report(yearAgoDate, releaseDates);
        historicalData.push({
          date: yearAgoDate,
          weekEnded: formatDateToISO(yearAgoReport.asOfWeekEndedText, yearAgoDate),
          cards: yearAgoReport.cards.map(c => ({
            fedLabel: c.fedLabel,
            balance_musd: c.balance_musd,
            change_musd: c.change_musd,
          })),
        });
      } catch (error) {
        console.warn(`[fetchHistoricalData] Failed to fetch year ago data for ${yearAgoDate}:`, error);
      }
    }
    
    // 직전 주 데이터 가져오기 (주간 변화 계산용)
    const weekAgoDate = findClosestDate(oneWeekAgo);
    if (weekAgoDate && weekAgoDate !== currentDate) {
      try {
        console.log(`[fetchHistoricalData] Fetching previous week data for ${weekAgoDate}`);
        const weekAgoReport = await fetchH41Report(weekAgoDate, releaseDates);
        historicalData.push({
          date: weekAgoDate,
          weekEnded: formatDateToISO(weekAgoReport.asOfWeekEndedText, weekAgoDate),
          cards: weekAgoReport.cards.map(c => ({
            fedLabel: c.fedLabel,
            balance_musd: c.balance_musd,
            change_musd: c.change_musd,
          })),
        });
      } catch (error) {
        console.warn(`[fetchHistoricalData] Failed to fetch week ago data for ${weekAgoDate}:`, error);
      }
    }
    
    console.log(`[fetchHistoricalData] Loaded ${historicalData.length} historical data points`);
  } catch (error) {
    console.error('[fetchHistoricalData] Error fetching historical data:', error);
  }
  
  return historicalData;
}

/**
 * H41Report를 H4Report로 변환
 */
export async function convertH41ToH4Report(
  h41Report: H41Report,
  date: string,
  pdfUrl: string
): Promise<H4Report> {
  // 52주 전 데이터와 직전 주 데이터를 직접 가져오기
  let releaseDates: string[] = [];
  try {
    releaseDates = await getFedReleaseDates();
    console.log(`[convertH41ToH4Report] Loaded ${releaseDates.length} release dates`);
  } catch (error) {
    console.warn('[convertH41ToH4Report] Failed to load release dates:', error);
  }
  
  const historicalData = await fetchHistoricalDataForYearlyComparison(date, releaseDates);
  
  // 개요 데이터 변환 (연간 데이터 포함)
  const overview = await convertOverview(h41Report, date, historicalData, releaseDates);
  
  // 준비금 요인 변환 (연간 데이터 포함)
  const factors = await convertFactors(h41Report, date, historicalData);
  
  // 요인 요약 변환
  const summary = convertSummary(h41Report);
  
  // HTML 텍스트에서 추가 테이블 파싱
  const rawText = (h41Report as any).rawText || '';
  
  // 만기분포 파싱
  const maturity = convertMaturity(h41Report, rawText);
  
  // 대출/증권대출 파싱
  const loansAndLending = convertLoansAndLending(h41Report, rawText);
  
  // 재무제표 파싱
  const consolidatedStatement = convertConsolidatedStatement(h41Report, rawText);
  
  // 지역 연준 파싱
  const regionalFed = convertRegionalFed(h41Report, rawText);
  
  // 연방 준비권 파싱
  const frNotes = convertFRNotes(h41Report, rawText);
  
  // 발표일(Release Date) 파싱: HTML에서 파싱된 releaseDateText 사용
  // fallback으로 실제 사용된 release 날짜 사용
  const reportDate = formatDateToISO(h41Report.releaseDateText, date);
  
  // 기준일(Week Ended) 파싱: HTML에서 파싱된 asOfWeekEndedText 사용
  // fallback으로 발표일 사용
  const weekEnded = formatDateToISO(h41Report.asOfWeekEndedText, reportDate);
  
  console.log('[convertH41ToH4Report] Date conversion:', {
    releaseDateText: h41Report.releaseDateText,
    asOfWeekEndedText: h41Report.asOfWeekEndedText,
    actualReleaseDate: date, // 실제 사용된 release 날짜 (URL에서 가져온 날짜)
    reportDate, // 파싱된 발표일 (HTML에서 추출)
    weekEnded, // 파싱된 기준일 (HTML에서 추출)
  });
  
  return {
    ok: true,
    meta: {
      reportDate, // 파싱된 발표일 (HTML의 Release Date)
      weekEnded, // 파싱된 기준일 (HTML의 Week Ended)
      sourceUrl: h41Report.sourceUrl,
      pdfUrl,
      parsedAt: new Date().toISOString(),
    },
    overview,
    factors,
    summary,
    maturity,
    loansAndLending,
    consolidatedStatement,
    regionalFed,
    frNotes,
  };
}

/**
 * 개요 데이터 변환 (연간 데이터 포함)
 */
async function convertOverview(
  h41Report: H41Report,
  currentDate: string,
  historicalData: HistoricalData[],
  releaseDates: string[]
): Promise<H4ReportOverview> {
  const cards = h41Report.cards;
  
  // 카드 찾기 헬퍼
  const findCard = (fedLabel: string): H41Card | undefined => {
    return cards.find(c => c.fedLabel === fedLabel);
  };
  
  // 총 자산 (Total Assets로 명확히 호출)
  // H.4.1 HTML에서 "Total assets" 또는 "Total liabilities and capital"을 찾거나
  // 모든 자산 항목을 합산하여 계산
  let totalAssetsCard = findCard('Total assets') || 
    findCard('Total Assets') ||
    findCard('Total liabilities and capital') ||
    findCard('Total Liabilities and Capital');
  
  // Total assets 카드를 찾지 못한 경우, HTML에서 직접 파싱 시도
  if (!totalAssetsCard || totalAssetsCard.balance_musd === 0) {
    // Reserve Bank credit는 연준의 총 자산을 나타냄 (자산 = 부채 + 자본)
    const reserveBankCredit = findCard('Reserve Bank credit');
    if (reserveBankCredit && reserveBankCredit.balance_musd > 0) {
      // Reserve Bank credit는 자산 측면에서 Total Assets와 유사
      // 하지만 정확한 Total Assets를 찾기 위해 다른 방법 시도
      totalAssetsCard = reserveBankCredit;
    }
  }
  
  // 여전히 찾지 못한 경우, HTML rawText에서 직접 파싱
  if ((!totalAssetsCard || totalAssetsCard.balance_musd === 0) && (h41Report as any).rawText) {
    const rawText = (h41Report as any).rawText;
    const totalAssetsMatch = rawText.match(/Total\s+(?:assets|Assets|liabilities\s+and\s+capital)\s+([\d,]+)/i);
    if (totalAssetsMatch) {
      const totalAssetsValue = parseFloat(totalAssetsMatch[1].replace(/,/g, ''));
      if (totalAssetsValue > 0) {
        totalAssetsCard = {
          fedLabel: 'Total assets',
          balance_musd: totalAssetsValue,
          change_musd: 0, // 주간 변화는 별도 계산 필요
        } as any;
      }
    }
  }
  
  const totalAssets = totalAssetsCard?.balance_musd || 0;
  const totalAssetsChange = totalAssetsCard?.change_musd || 0;
  
  // 디버그 로그
  console.log('[convertOverview] Total Assets search:', {
    found: !!totalAssetsCard,
    value: totalAssets,
    change: totalAssetsChange,
    fedLabel: totalAssetsCard?.fedLabel,
    allCardLabels: cards.map(c => c.fedLabel).slice(0, 10),
  });
  
  // 보유 증권
  const securitiesCard = findCard('Securities held outright');
  const securitiesHeld = securitiesCard?.balance_musd || 0;
  const securitiesHeldChange = securitiesCard?.change_musd || 0;
  
  // 지급준비금
  const reservesCard = findCard('Reserve balances with Federal Reserve Banks');
  const reserves = reservesCard?.balance_musd || 0;
  const reservesChange = reservesCard?.change_musd || 0;
  
  // TGA
  const tgaCard = findCard('U.S. Treasury, General Account');
  const tga = tgaCard?.balance_musd || 0;
  const tgaChange = tgaCard?.change_musd || 0;
  
  // 역레포
  const rrpCard = findCard('Reverse repurchase agreements');
  const rrp = rrpCard?.balance_musd || 0;
  const rrpChange = rrpCard?.change_musd || 0;
  
  // 유통 통화
  const currencyCard = findCard('Currency in circulation');
  const currency = currencyCard?.balance_musd || 0;
  const currencyChange = currencyCard?.change_musd || 0;
  
  // 자산 구성
  const treasuryCard = findCard('U.S. Treasury securities');
  const mbsCard = findCard('Mortgage-backed securities');
  const treasury = treasuryCard?.balance_musd || 0;
  const mbs = mbsCard?.balance_musd || 0;
  const other = securitiesHeld - treasury - mbs;
  
  // 주간 변화 계산: 직전 주 데이터와 비교
  const previousWeekData = historicalData.find(h => {
    const hDate = new Date(h.date);
    const current = new Date(currentDate);
    const diffDays = (current.getTime() - hDate.getTime()) / (1000 * 60 * 60 * 24);
    return diffDays > 0 && diffDays <= 14; // 직전 주 범위
  });
  
  // 주간 변화 재계산 (직전 주 데이터가 있는 경우)
  let totalAssetsWeeklyChange = totalAssetsChange;
  let securitiesHeldWeeklyChange = securitiesHeldChange;
  let reservesWeeklyChange = reservesChange;
  let tgaWeeklyChange = tgaChange;
  let rrpWeeklyChange = rrpChange;
  let currencyWeeklyChange = currencyChange;
  
  if (previousWeekData) {
    const prevTotalAssets = previousWeekData.cards.find(c => 
      c.fedLabel === (totalAssetsCard?.fedLabel || 'Total assets')
    );
    if (prevTotalAssets) {
      totalAssetsWeeklyChange = totalAssets - prevTotalAssets.balance_musd;
    }
    
    const prevSecurities = previousWeekData.cards.find(c => c.fedLabel === 'Securities held outright');
    if (prevSecurities) {
      securitiesHeldWeeklyChange = securitiesHeld - prevSecurities.balance_musd;
    }
    
    const prevReserves = previousWeekData.cards.find(c => c.fedLabel === 'Reserve balances with Federal Reserve Banks');
    if (prevReserves) {
      reservesWeeklyChange = reserves - prevReserves.balance_musd;
    }
    
    const prevTga = previousWeekData.cards.find(c => c.fedLabel === 'U.S. Treasury, General Account');
    if (prevTga) {
      tgaWeeklyChange = tga - prevTga.balance_musd;
    }
    
    const prevRrp = previousWeekData.cards.find(c => c.fedLabel === 'Reverse repurchase agreements');
    if (prevRrp) {
      rrpWeeklyChange = rrp - prevRrp.balance_musd;
    }
    
    const prevCurrency = previousWeekData.cards.find(c => c.fedLabel === 'Currency in circulation');
    if (prevCurrency) {
      currencyWeeklyChange = currency - prevCurrency.balance_musd;
    }
  }
  
  // 연간 데이터 계산 (52주 전 데이터와 비교)
  const totalAssetsYearly = calculateYearlyChange(
    totalAssets,
    currentDate,
    historicalData,
    totalAssetsCard?.fedLabel || 'Total assets'
  );
  const securitiesYearly = calculateYearlyChange(
    securitiesHeld,
    currentDate,
    historicalData,
    'Securities held outright'
  );
  const reservesYearly = calculateYearlyChange(
    reserves,
    currentDate,
    historicalData,
    'Reserve balances with Federal Reserve Banks'
  );
  const tgaYearly = calculateYearlyChange(
    tga,
    currentDate,
    historicalData,
    'U.S. Treasury, General Account'
  );
  const rrpYearly = calculateYearlyChange(
    rrp,
    currentDate,
    historicalData,
    'Reverse repurchase agreements'
  );
  const currencyYearly = calculateYearlyChange(
    currency,
    currentDate,
    historicalData,
    'Currency in circulation'
  );
  
  // 디버그 로그
  console.log('[convertOverview] Yearly changes:', {
    totalAssets: { value: totalAssets, yearly: totalAssetsYearly },
    securitiesHeld: { value: securitiesHeld, yearly: securitiesYearly },
    reserves: { value: reserves, yearly: reservesYearly },
    historicalDataCount: historicalData.length,
  });
  
  return {
    totalAssets: {
      value: totalAssets,
      weeklyChange: totalAssetsWeeklyChange,
      weeklyChangePercent: totalAssets ? (totalAssetsWeeklyChange / totalAssets) * 100 : 0,
      yearlyChange: totalAssetsYearly.change,
      yearlyChangePercent: totalAssetsYearly.changePercent,
    },
    securitiesHeld: {
      value: securitiesHeld,
      weeklyChange: securitiesHeldWeeklyChange,
      weeklyChangePercent: securitiesHeld ? (securitiesHeldWeeklyChange / securitiesHeld) * 100 : 0,
      yearlyChange: securitiesYearly.change,
      yearlyChangePercent: securitiesYearly.changePercent,
    },
    reserves: {
      value: reserves,
      weeklyChange: reservesWeeklyChange,
      weeklyChangePercent: reserves ? (reservesWeeklyChange / reserves) * 100 : 0,
      yearlyChange: reservesYearly.change,
      yearlyChangePercent: reservesYearly.changePercent,
    },
    tga: {
      value: tga,
      weeklyChange: tgaWeeklyChange,
      weeklyChangePercent: tga ? (tgaWeeklyChange / tga) * 100 : 0,
      yearlyChange: tgaYearly.change,
      yearlyChangePercent: tgaYearly.changePercent,
    },
    rrp: {
      value: rrp,
      weeklyChange: rrpWeeklyChange,
      weeklyChangePercent: rrp ? (rrpWeeklyChange / rrp) * 100 : 0,
      yearlyChange: rrpYearly.change,
      yearlyChangePercent: rrpYearly.changePercent,
    },
    currency: {
      value: currency,
      weeklyChange: currencyWeeklyChange,
      weeklyChangePercent: currency ? (currencyWeeklyChange / currency) * 100 : 0,
      yearlyChange: currencyYearly.change,
      yearlyChangePercent: currencyYearly.changePercent,
    },
    assetComposition: {
      treasury: {
        value: treasury,
        percent: securitiesHeld ? (treasury / securitiesHeld) * 100 : 0,
      },
      mbs: {
        value: mbs,
        percent: securitiesHeld ? (mbs / securitiesHeld) * 100 : 0,
      },
      other: {
        value: other,
        percent: securitiesHeld ? (other / securitiesHeld) * 100 : 0,
      },
    },
  };
}

/**
 * 준비금 요인 변환 (연간 데이터 포함)
 * 공급 요인: Reserve Bank Credit, Securities Held, Treasury Securities, Bills, Notes and Bonds, TIPS, MBS, Repos, Loans, BTFP, CB Swaps, Gold, SDR
 * 흡수 요인: Deposits (Other liabilities and capital을 Deposits로 변경)
 */
async function convertFactors(
  h41Report: H41Report,
  currentDate: string,
  historicalData: HistoricalData[]
): Promise<H4ReportFactors> {
  const cards = h41Report.cards;
  
  // 공급 요인 필드 정의
  const supplyingLabels = [
    'Reserve Bank credit',
    'Securities held outright',
    'U.S. Treasury securities',
    'Bills',
    'Notes and bonds',
    'TIPS',
    'Mortgage-backed securities',
    'Repurchase agreements',
    'Loans',
    'Bank Term Funding Program',
    'BTFP',
    'Central bank liquidity swaps',
    'Gold',
    'SDR',
  ];
  
  // 흡수 요인 필드 정의 (Deposits로 변경)
  const absorbingLabels = [
    'Reverse repurchase agreements',
    'Currency in circulation',
    'U.S. Treasury, General Account',
    'Deposits with F.R. Banks, other than reserve balances',
    'Other liabilities and capital', // Deposits로 매핑
  ];
  
  // 직전 주 데이터 찾기
  const previousWeekData = historicalData.find(h => {
    const hDate = new Date(h.date);
    const current = new Date(currentDate);
    const diffDays = (current.getTime() - hDate.getTime()) / (1000 * 60 * 60 * 24);
    return diffDays > 0 && diffDays <= 14; // 직전 주 범위
  });
  
  const supplying: H4ReportFactorRow[] = [];
  const absorbing: H4ReportFactorRow[] = [];
  
  // 공급 요인 찾기 및 연간 변화 계산
  for (const label of supplyingLabels) {
    const card = cards.find(c => {
      const cLabel = c.fedLabel.toLowerCase();
      const searchLabel = label.toLowerCase();
      return cLabel.includes(searchLabel) || searchLabel.includes(cLabel);
    });
    
    if (card) {
      // 주간 변화 재계산 (직전 주 데이터가 있는 경우)
      let weeklyChange = card.change_musd;
      if (previousWeekData) {
        const prevCard = previousWeekData.cards.find(c => c.fedLabel === card.fedLabel);
        if (prevCard) {
          weeklyChange = card.balance_musd - prevCard.balance_musd;
        }
      }
      
      // 연간 변화 계산
      const yearly = calculateYearlyChange(
        card.balance_musd,
        currentDate,
        historicalData,
        card.fedLabel
      );
      
      supplying.push({
        label: translateLabel(card.fedLabel),
        labelEn: card.fedLabel,
        value: card.balance_musd,
        change: weeklyChange,
        changePercent: card.balance_musd ? (weeklyChange / card.balance_musd) * 100 : 0,
        yearlyChange: yearly.change,
        yearlyChangePercent: yearly.changePercent,
      });
    }
  }
  
  // 흡수 요인 찾기 및 연간 변화 계산
  for (const label of absorbingLabels) {
    const card = cards.find(c => {
      const cLabel = c.fedLabel.toLowerCase();
      const searchLabel = label.toLowerCase();
      return cLabel.includes(searchLabel) || searchLabel.includes(cLabel);
    });
    
    if (card) {
      // 주간 변화 재계산 (직전 주 데이터가 있는 경우)
      let weeklyChange = card.change_musd;
      if (previousWeekData) {
        const prevCard = previousWeekData.cards.find(c => c.fedLabel === card.fedLabel);
        if (prevCard) {
          weeklyChange = card.balance_musd - prevCard.balance_musd;
        }
      }
      
      // 연간 변화 계산
      const yearly = calculateYearlyChange(
        card.balance_musd,
        currentDate,
        historicalData,
        card.fedLabel
      );
      
      // Other liabilities and capital을 Deposits로 표시
      const displayLabel = card.fedLabel === 'Other liabilities and capital' 
        ? 'Deposits' 
        : translateLabel(card.fedLabel);
      
      absorbing.push({
        label: displayLabel,
        labelEn: card.fedLabel === 'Other liabilities and capital' ? 'Deposits' : card.fedLabel,
        value: card.balance_musd,
        change: weeklyChange,
        changePercent: card.balance_musd ? (weeklyChange / card.balance_musd) * 100 : 0,
        yearlyChange: yearly.change,
        yearlyChangePercent: yearly.changePercent,
      });
    }
  }
  
  // 합계 계산
  const supplyingTotal = supplying.reduce((sum, r) => sum + r.value, 0);
  const absorbingTotal = absorbing.reduce((sum, r) => sum + r.value, 0);
  const netTotal = supplyingTotal - absorbingTotal; // 지급준비금
  
  // 합계의 주간 변화 계산
  let supplyingWeeklyChange = 0;
  let absorbingWeeklyChange = 0;
  let netWeeklyChange = 0;
  
  if (previousWeekData) {
    const prevSupplyingTotal = supplying.reduce((sum, row) => {
      const prevCard = previousWeekData.cards.find(c => c.fedLabel === row.labelEn);
      return sum + (prevCard?.balance_musd || 0);
    }, 0);
    
    const prevAbsorbingTotal = absorbing.reduce((sum, row) => {
      const prevCard = previousWeekData.cards.find(c => c.fedLabel === row.labelEn);
      return sum + (prevCard?.balance_musd || 0);
    }, 0);
    
    supplyingWeeklyChange = supplyingTotal - prevSupplyingTotal;
    absorbingWeeklyChange = absorbingTotal - prevAbsorbingTotal;
    netWeeklyChange = netTotal - (prevSupplyingTotal - prevAbsorbingTotal);
  } else {
    // 직전 주 데이터가 없으면 개별 변화의 합으로 계산
    supplyingWeeklyChange = supplying.reduce((sum, r) => sum + r.change, 0);
    absorbingWeeklyChange = absorbing.reduce((sum, r) => sum + r.change, 0);
    netWeeklyChange = supplyingWeeklyChange - absorbingWeeklyChange;
  }
  
  // 합계의 연간 변화 계산 (52주 전 데이터에서 동일 항목 합산)
  const yearAgoData = historicalData.find(h => {
    const hDate = new Date(h.date);
    const current = new Date(currentDate);
    const diffDays = (current.getTime() - hDate.getTime()) / (1000 * 60 * 60 * 24);
    return diffDays >= 350 && diffDays <= 378; // 약 52주 전 범위
  });
  
  let supplyingYearlyChange = 0;
  let absorbingYearlyChange = 0;
  let netYearlyChange = 0;
  
  if (yearAgoData) {
    // 52주 전 공급 요인 합계 계산
    const prevSupplyingTotal = supplying.reduce((sum, row) => {
      const prevCard = yearAgoData.cards.find(c => c.fedLabel === row.labelEn);
      return sum + (prevCard?.balance_musd || 0);
    }, 0);
    
    // 52주 전 흡수 요인 합계 계산
    const prevAbsorbingTotal = absorbing.reduce((sum, row) => {
      const prevCard = yearAgoData.cards.find(c => c.fedLabel === row.labelEn);
      return sum + (prevCard?.balance_musd || 0);
    }, 0);
    
    supplyingYearlyChange = supplyingTotal - prevSupplyingTotal;
    absorbingYearlyChange = absorbingTotal - prevAbsorbingTotal;
    netYearlyChange = netTotal - (prevSupplyingTotal - prevAbsorbingTotal);
    
    console.log('[convertFactors] Yearly totals calculation:', {
      current: { supplying: supplyingTotal, absorbing: absorbingTotal, net: netTotal },
      yearAgo: { supplying: prevSupplyingTotal, absorbing: prevAbsorbingTotal, net: prevSupplyingTotal - prevAbsorbingTotal },
      changes: { supplying: supplyingYearlyChange, absorbing: absorbingYearlyChange, net: netYearlyChange },
      yearAgoDate: yearAgoData.date,
    });
  } else {
    console.warn('[convertFactors] No year ago data found for totals calculation');
  }
  
  const supplyingYearlyPercent = supplyingTotal ? (supplyingYearlyChange / supplyingTotal) * 100 : 0;
  const absorbingYearlyPercent = absorbingTotal ? (absorbingYearlyChange / absorbingTotal) * 100 : 0;
  const netYearlyPercent = netTotal ? (netYearlyChange / netTotal) * 100 : 0;
  
  console.log('[convertFactors] Totals calculation:', {
    supplying: {
      total: supplyingTotal,
      weeklyChange: supplyingWeeklyChange,
      yearlyChange: supplyingYearlyChange,
      yearlyPercent: supplyingYearlyPercent,
    },
    absorbing: {
      total: absorbingTotal,
      weeklyChange: absorbingWeeklyChange,
      yearlyChange: absorbingYearlyChange,
      yearlyPercent: absorbingYearlyPercent,
    },
    net: {
      total: netTotal,
      weeklyChange: netWeeklyChange,
      yearlyChange: netYearlyChange,
      yearlyPercent: netYearlyPercent,
    },
    hasYearAgoData: !!yearAgoData,
    hasPreviousWeekData: !!previousWeekData,
  });
  
  return {
    supplying,
    absorbing,
    totals: {
      supplying: supplyingTotal,
      supplyingWeeklyChange,
      supplyingYearlyChange,
      absorbing: absorbingTotal,
      absorbingWeeklyChange,
      absorbingYearlyChange,
      net: netTotal,
      netWeeklyChange,
      netYearlyChange,
    },
  };
}

/**
 * 요인 요약 변환
 * 주요 공급 요인: Loans와 CB Swaps (Primary Credit, MBS, 국채 대신)
 * 주요 흡수 요인: Deposits (Other liabilities and capital 대신)
 */
function convertSummary(h41Report: H41Report): H4ReportSummary {
  const cards = h41Report.cards;
  
  // 주요 공급 요인: Loans와 CB Swaps
  const loansCard = cards.find(c => 
    c.fedLabel.toLowerCase().includes('loans') && 
    !c.fedLabel.toLowerCase().includes('total')
  );
  const swapsCard = cards.find(c => 
    c.fedLabel.toLowerCase().includes('central bank liquidity swaps') ||
    c.fedLabel.toLowerCase().includes('swaps')
  );
  
  const keySupply: Array<{ label: string; value: number; change: number }> = [];
  if (loansCard) {
    keySupply.push({
      label: translateLabel(loansCard.fedLabel),
      value: loansCard.balance_musd,
      change: loansCard.change_musd,
    });
  }
  if (swapsCard) {
    keySupply.push({
      label: translateLabel(swapsCard.fedLabel),
      value: swapsCard.balance_musd,
      change: swapsCard.change_musd,
    });
  }
  
  // 주요 흡수 요인: Deposits
  const depositsCard = cards.find(c => 
    c.fedLabel === 'Other liabilities and capital' ||
    c.fedLabel.toLowerCase().includes('deposits')
  );
  
  const keyAbsorb: Array<{ label: string; value: number; change: number }> = [];
  if (depositsCard) {
    keyAbsorb.push({
      label: depositsCard.fedLabel === 'Other liabilities and capital' ? '연준 예치금' : translateLabel(depositsCard.fedLabel),
      value: depositsCard.balance_musd,
      change: depositsCard.change_musd,
    });
  }
  
  return {
    keySupply,
    keyAbsorb,
  };
}

/**
 * 만기분포 변환
 */
function convertMaturity(h41Report: H41Report, rawText: string): H4ReportMaturity {
  const maturityRows = parseMaturityDistribution(rawText);
  
  const buckets: Array<{ range: string; value: number; percent: number }> = [];
  const tableRows: Array<{ label: string; buckets: Record<string, number>; total: number }> = [];
  
  // Treasury와 MBS 행 처리
  for (const row of maturityRows) {
    const bucketsMap: Record<string, number> = {
      '15일↓': row.buckets['15일↓'],
      '16-90일': row.buckets['16-90일'],
      '91일-1년': row.buckets['91일-1년'],
      '1-5년': row.buckets['1-5년'],
      '5-10년': row.buckets['5-10년'],
      '10년↑': row.buckets['10년↑'],
    };
    
    tableRows.push({
      label: row.label,
      buckets: bucketsMap,
      total: row.total,
    });
    
    // 전체 합계를 buckets에 추가
    if (row.label === '미 국채') {
      Object.entries(bucketsMap).forEach(([range, value]) => {
        buckets.push({
          range,
          value,
          percent: row.total > 0 ? (value / row.total) * 100 : 0,
        });
      });
    }
  }
  
  return {
    buckets,
    tableRows,
  };
}

/**
 * 대출/증권대출 변환
 */
function convertLoansAndLending(h41Report: H41Report, rawText: string): H4ReportLoansAndLending {
  const cards = h41Report.cards;
  
  const findCard = (fedLabel: string) => cards.find(c => 
    c.fedLabel.toLowerCase().includes(fedLabel.toLowerCase())
  );
  
  // 대출 테이블 (HTML 파싱 우선, 없으면 cards에서)
  const parsedLoans = parseLoans(rawText);
  const loansTable: Array<{ label: string; value: number; change: number }> = [];
  
  if (parsedLoans.length > 0) {
    // 파싱된 데이터 사용
    loansTable.push(...parsedLoans.map(l => ({
      label: l.label,
      value: l.value,
      change: l.change,
    })));
  } else {
    // cards에서 찾기
    const primaryCredit = findCard('Primary credit');
    if (primaryCredit) {
      loansTable.push({
        label: '1차 신용',
        value: primaryCredit.balance_musd,
        change: primaryCredit.change_musd,
      });
    }
    
    const btfp = findCard('Bank Term Funding Program') || findCard('BTFP');
    if (btfp) {
      loansTable.push({
        label: '은행기간대출',
        value: btfp.balance_musd,
        change: btfp.change_musd,
      });
    }
    
    // Total Loans 계산
    const totalLoans = loansTable.reduce((sum, row) => sum + row.value, 0);
    if (totalLoans > 0) {
      loansTable.push({
        label: '대출 합계',
        value: totalLoans,
        change: loansTable.reduce((sum, row) => sum + row.change, 0),
      });
    }
  }
  
  // 증권 대출 테이블
  const parsedSecurities = parseSecuritiesLending(rawText);
  const securitiesLendingTable: Array<{ label: string; value: number; change: number }> = [];
  
  if (parsedSecurities.length > 0) {
    securitiesLendingTable.push(...parsedSecurities.map(s => ({
      label: s.label,
      value: s.value,
      change: s.change,
    })));
  }
  
  return {
    loansTable,
    securitiesLendingTable,
  };
}

/**
 * 재무제표 변환
 */
function convertConsolidatedStatement(h41Report: H41Report, rawText: string): H4ReportConsolidatedStatement {
  const cards = h41Report.cards;
  
  const findCard = (fedLabel: string) => cards.find(c => 
    c.fedLabel.toLowerCase().includes(fedLabel.toLowerCase())
  );
  
  // HTML 파싱 시도
  const parsed = parseConsolidatedStatement(rawText);
  
  // 자산 행 (파싱된 데이터 우선, 없으면 cards에서)
  const assetsRows: Array<{ label: string; value: number; change: number }> = [];
  
  if (parsed.assets.length > 0) {
    assetsRows.push(...parsed.assets.map(a => ({
      label: a.label,
      value: a.value,
      change: a.weeklyChange,
    })));
  } else {
    // cards에서 찾기
    const gold = findCard('Gold');
    if (gold) assetsRows.push({ label: '금', value: gold.balance_musd, change: gold.change_musd });
    
    const sdr = findCard('SDR');
    if (sdr) assetsRows.push({ label: 'SDR', value: sdr.balance_musd, change: sdr.change_musd });
    
    const securities = findCard('Securities held outright');
    if (securities) assetsRows.push({ label: '보유 증권', value: securities.balance_musd, change: securities.change_musd });
    
    const repos = findCard('Repurchase agreements');
    if (repos) assetsRows.push({ label: '레포', value: repos.balance_musd, change: repos.change_musd });
    
    const loans = findCard('Loans') || findCard('Primary credit');
    if (loans) assetsRows.push({ label: '대출', value: loans.balance_musd, change: loans.change_musd });
    
    const swaps = findCard('Central bank liquidity swaps');
    if (swaps) assetsRows.push({ label: '통화스왑', value: swaps.balance_musd, change: swaps.change_musd });
    
    const totalAssets = findCard('Total assets') || findCard('Total liabilities and capital');
    if (totalAssets) assetsRows.push({ label: '총 자산', value: totalAssets.balance_musd, change: totalAssets.change_musd });
  }
  
  // 부채 행
  const liabilitiesRows: Array<{ label: string; value: number; change: number }> = [];
  
  if (parsed.liabilities.length > 0) {
    liabilitiesRows.push(...parsed.liabilities.map(l => ({
      label: l.label,
      value: l.value,
      change: l.weeklyChange,
    })));
  } else {
    // cards에서 찾기
    const frNotes = findCard('Federal Reserve Notes') || findCard('F.R. Notes');
    if (frNotes) liabilitiesRows.push({ label: '연방준비권', value: frNotes.balance_musd, change: frNotes.change_musd });
    
    const reverseRepos = findCard('Reverse repurchase agreements');
    if (reverseRepos) liabilitiesRows.push({ label: '역레포', value: reverseRepos.balance_musd, change: reverseRepos.change_musd });
    
    const deposits = findCard('Deposits') || findCard('Other liabilities and capital');
    if (deposits) liabilitiesRows.push({ label: '예금', value: deposits.balance_musd, change: deposits.change_musd });
    
    const reserves = findCard('Reserve balances with Federal Reserve Banks');
    if (reserves) liabilitiesRows.push({ label: '지급준비금', value: reserves.balance_musd, change: reserves.change_musd });
    
    const tga = findCard('U.S. Treasury, General Account');
    if (tga) liabilitiesRows.push({ label: 'TGA', value: tga.balance_musd, change: tga.change_musd });
    
    const totalLiabilities = findCard('Total liabilities');
    if (totalLiabilities) liabilitiesRows.push({ label: '총 부채', value: totalLiabilities.balance_musd, change: totalLiabilities.change_musd });
  }
  
  const totalAssets = assetsRows.find(r => r.label === '총 자산')?.value || 0;
  const totalLiabilities = liabilitiesRows.find(r => r.label === '총 부채')?.value || 0;
  
  return {
    assetsRows,
    liabilitiesRows,
    totals: {
      assets: totalAssets,
      liabilities: totalLiabilities,
    },
  };
}

/**
 * 지역 연준 변환
 */
function convertRegionalFed(h41Report: H41Report, rawText: string): H4ReportRegionalFed {
  const parsed = parseRegionalFed(rawText);
  
  const bankNames = ['보스턴', '뉴욕', '필라델피아', '클리블랜드', '리치몬드', '애틀랜타', '시카고', '세인트루이스', '미니애폴리스', '캔자스시티', '댈러스', '샌프란시스코'];
  const bankNamesEn = ['Boston', 'New York', 'Philadelphia', 'Cleveland', 'Richmond', 'Atlanta', 'Chicago', 'St. Louis', 'Minneapolis', 'Kansas City', 'Dallas', 'San Francisco'];
  
  const rows: Array<{ label: string; values: Record<string, number>; total: number }> = [];
  
  for (let i = 0; i < parsed.length; i++) {
    const row = parsed[i];
    const bankName = bankNamesEn.findIndex(b => b === row.bank);
    
    if (bankName >= 0) {
      const values: Record<string, number> = {
        ...row.assets,
        ...row.liabilities,
      };
      
      rows.push({
        label: bankNames[bankName],
        values,
        total: row.totalAssets,
      });
    }
  }
  
  return {
    columns: bankNames,
    rows,
  };
}

/**
 * 연방 준비권 변환
 */
function convertFRNotes(h41Report: H41Report, rawText: string): H4ReportFRNotes {
  const parsed = parseFRNotes(rawText);
  
  const bankNames = ['보스턴', '뉴욕', '필라델피아', '클리블랜드', '리치몬드', '애틀랜타', '시카고', '세인트루이스', '미니애폴리스', '캔자스시티', '댈러스', '샌프란시스코'];
  const bankNamesEn = ['Boston', 'New York', 'Philadelphia', 'Cleveland', 'Richmond', 'Atlanta', 'Chicago', 'St. Louis', 'Minneapolis', 'Kansas City', 'Dallas', 'San Francisco'];
  
  const rows: Array<{ label: string; value: number; change: number }> = [];
  
  for (const row of parsed) {
    const bankIdx = bankNamesEn.findIndex(b => b === row.bank);
    if (bankIdx >= 0) {
      // 발행액, 담보, 금증서를 별도 행으로 추가
      rows.push({
        label: `${bankNames[bankIdx]} - 발행액`,
        value: row.issueAmount,
        change: 0,
      });
      rows.push({
        label: `${bankNames[bankIdx]} - 담보`,
        value: row.collateral,
        change: 0,
      });
      rows.push({
        label: `${bankNames[bankIdx]} - 금 증서`,
        value: row.goldCertificate,
        change: 0,
      });
    }
  }
  
  return {
    rows,
  };
}

/**
 * 날짜 문자열을 ISO 형식으로 변환
 * "Dec 17, 2025" -> "2025-12-17"
 */
function formatDateToISO(dateStr: string, fallbackDate?: string): string {
  try {
    // (unknown)이나 빈 문자열인 경우 fallback 사용
    if (!dateStr || dateStr === '(unknown)' || dateStr.trim() === '') {
      if (fallbackDate) {
        console.warn('[formatDateToISO] Using fallback date:', fallbackDate);
        return fallbackDate;
      }
      return dateStr;
    }
    
    // "January 8, 2026" 형식 파싱
    if (dateStr.includes(',') && dateStr.match(/[A-Z][a-z]+\s+\d{1,2},\s+\d{4}/)) {
      const date = new Date(dateStr);
      if (!isNaN(date.getTime())) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const result = `${year}-${month}-${day}`;
        console.log('[formatDateToISO] Parsed date:', dateStr, '->', result);
        return result;
      }
    }
    
    // ISO 형식 (YYYY-MM-DD)인 경우 그대로 반환
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return dateStr;
    }
    
    // 일반 Date 파싱 시도
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const result = `${year}-${month}-${day}`;
      console.log('[formatDateToISO] Parsed date (general):', dateStr, '->', result);
      return result;
    }
    
    // 파싱 실패 시 fallback 사용
    if (fallbackDate) {
      console.warn('[formatDateToISO] Failed to parse date, using fallback:', dateStr, '->', fallbackDate);
      return fallbackDate;
    }
    
    console.warn('[formatDateToISO] Failed to parse date (no fallback):', dateStr);
    return dateStr;
  } catch (error) {
    console.error('[formatDateToISO] Error parsing date:', dateStr, error);
    if (fallbackDate) {
      return fallbackDate;
    }
    return dateStr;
  }
}
