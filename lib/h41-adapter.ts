/**
 * 기존 H41Report를 H4Report 스키마로 변환하는 어댑터
 * 기존 HTML 파싱 로직을 재사용하여 안정적인 데이터 추출
 */

import type { H41Report, H41Card } from './h41-parser';
import type { H4Report, H4ReportOverview, H4ReportFactors, H4ReportSummary } from './types';
import { translateLabel } from './translations';

/**
 * H41Report를 H4Report로 변환
 */
export async function convertH41ToH4Report(
  h41Report: H41Report,
  date: string,
  pdfUrl: string
): Promise<H4Report> {
  // 개요 데이터 변환 (연간 데이터 포함)
  const overview = await convertOverview(h41Report, date);
  
  // 준비금 요인 변환
  const factors = convertFactors(h41Report);
  
  // 요인 요약 변환
  const summary = convertSummary(h41Report);
  
  return {
    ok: true,
    meta: {
      reportDate: date,
      weekEnded: formatDateToISO(h41Report.asOfWeekEndedText),
      sourceUrl: h41Report.sourceUrl,
      pdfUrl,
      parsedAt: new Date().toISOString(),
    },
    overview,
    factors,
    summary,
    maturity: {
      buckets: [],
      tableRows: [],
    },
    loansAndLending: {
      loansTable: [],
      securitiesLendingTable: [],
    },
    consolidatedStatement: {
      assetsRows: [],
      liabilitiesRows: [],
      totals: { assets: 0, liabilities: 0 },
    },
    regionalFed: {
      columns: [],
      rows: [],
    },
    frNotes: {
      rows: [],
    },
  };
}

/**
 * 개요 데이터 변환 (연간 데이터 포함)
 */
async function convertOverview(h41Report: H41Report, currentDate: string): Promise<H4ReportOverview> {
  const cards = h41Report.cards;
  
  // 카드 찾기 헬퍼
  const findCard = (fedLabel: string): H41Card | undefined => {
    return cards.find(c => c.fedLabel === fedLabel);
  };
  
  // 총 자산 (Total liabilities and capital 또는 계산)
  const totalAssetsCard = findCard('Total liabilities and capital') || 
    findCard('Total assets');
  const totalAssets = totalAssetsCard?.balance_musd || 0;
  const totalAssetsChange = totalAssetsCard?.change_musd || 0;
  
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
  
  // 연간 데이터 계산 (현재는 0으로 설정, 추후 과거 데이터와 비교하여 계산)
  // TODO: HistoricalData를 활용한 연간 비교 구현
  const totalAssetsYearly = { change: 0, changePercent: 0 };
  const securitiesYearly = { change: 0, changePercent: 0 };
  const reservesYearly = { change: 0, changePercent: 0 };
  const tgaYearly = { change: 0, changePercent: 0 };
  const rrpYearly = { change: 0, changePercent: 0 };
  const currencyYearly = { change: 0, changePercent: 0 };
  
  return {
    totalAssets: {
      value: totalAssets,
      weeklyChange: totalAssetsChange,
      weeklyChangePercent: totalAssets ? (totalAssetsChange / totalAssets) * 100 : 0,
      yearlyChange: totalAssetsYearly.change,
      yearlyChangePercent: totalAssetsYearly.changePercent,
    },
    securitiesHeld: {
      value: securitiesHeld,
      weeklyChange: securitiesHeldChange,
      weeklyChangePercent: securitiesHeld ? (securitiesHeldChange / securitiesHeld) * 100 : 0,
      yearlyChange: securitiesYearly.change,
      yearlyChangePercent: securitiesYearly.changePercent,
    },
    reserves: {
      value: reserves,
      weeklyChange: reservesChange,
      weeklyChangePercent: reserves ? (reservesChange / reserves) * 100 : 0,
      yearlyChange: reservesYearly.change,
      yearlyChangePercent: reservesYearly.changePercent,
    },
    tga: {
      value: tga,
      weeklyChange: tgaChange,
      weeklyChangePercent: tga ? (tgaChange / tga) * 100 : 0,
      yearlyChange: tgaYearly.change,
      yearlyChangePercent: tgaYearly.changePercent,
    },
    rrp: {
      value: rrp,
      weeklyChange: rrpChange,
      weeklyChangePercent: rrp ? (rrpChange / rrp) * 100 : 0,
      yearlyChange: rrpYearly.change,
      yearlyChangePercent: rrpYearly.changePercent,
    },
    currency: {
      value: currency,
      weeklyChange: currencyChange,
      weeklyChangePercent: currency ? (currencyChange / currency) * 100 : 0,
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
 * 준비금 요인 변환
 */
function convertFactors(h41Report: H41Report): H4ReportFactors {
  const cards = h41Report.cards;
  
  // 공급 요인과 흡수 요인 분류
  const supplying: Array<{
    label: string;
    labelEn: string;
    value: number;
    change: number;
    changePercent: number;
  }> = [];
  const absorbing: Array<{
    label: string;
    labelEn: string;
    value: number;
    change: number;
    changePercent: number;
  }> = [];
  
  for (const card of cards) {
    const factorRow = {
      label: translateLabel(card.fedLabel),
      labelEn: card.fedLabel,
      value: card.balance_musd,
      change: card.change_musd,
      changePercent: card.balance_musd ? (card.change_musd / card.balance_musd) * 100 : 0,
    };
    
    // 공급 요인: 보유 증권, 리포 등
    if (card.liquidityTag === '공급(해열)' || card.liquidityTag === 'QT/자산') {
      supplying.push(factorRow);
    }
    // 흡수 요인: 역레포, 통화, TGA 등
    else if (card.liquidityTag === '흡수(약재)') {
      absorbing.push(factorRow);
    }
  }
  
  const supplyingTotal = supplying.reduce((sum, r) => sum + r.value, 0);
  const absorbingTotal = absorbing.reduce((sum, r) => sum + r.value, 0);
  
  return {
    supplying,
    absorbing,
    totals: {
      supplying: supplyingTotal,
      absorbing: absorbingTotal,
      net: supplyingTotal - absorbingTotal,
    },
  };
}

/**
 * 요인 요약 변환
 */
function convertSummary(h41Report: H41Report): H4ReportSummary {
  const factors = convertFactors(h41Report);
  
  return {
    keySupply: factors.supplying
      .filter(r => Math.abs(r.value) > 1000)
      .map(r => ({
        label: r.label,
        value: r.value,
        change: r.change,
      })),
    keyAbsorb: factors.absorbing
      .filter(r => Math.abs(r.value) > 1000)
      .map(r => ({
        label: r.label,
        value: r.value,
        change: r.change,
      })),
  };
}

/**
 * 날짜 문자열을 ISO 형식으로 변환
 * "Dec 17, 2025" -> "2025-12-17"
 */
function formatDateToISO(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      return dateStr;
    }
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  } catch {
    return dateStr;
  }
}
