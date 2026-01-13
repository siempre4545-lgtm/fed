import type { ParsedH41Data } from './pdf-parser';
import type { H4Report, H4ReportOverview, H4ReportFactors, H4ReportSummary } from './types';
import { translateLabel, formatNumber } from './translations';

/**
 * PDF 파싱 결과를 표준 H4Report 스키마로 정규화
 */
export function normalizeH41Data(
  parsedData: ParsedH41Data,
  date: string,
  pdfUrl: string
): H4Report {
  // Table 1에서 주요 지표 추출
  const table1 = parsedData.tables.find(t => t.name === 'Factors Affecting Reserve Balances');
  
  // 개요 데이터 생성
  const overview = extractOverview(table1, parsedData);
  
  // 준비금 요인 데이터 생성
  const factors = extractFactors(table1);
  
  // 요인 요약 생성
  const summary = extractSummary(table1);
  
  // 나머지 탭 데이터는 기본 구조로 생성 (추후 개선)
  return {
    ok: true,
    meta: {
      reportDate: date,
      weekEnded: parsedData.weekEnded,
      sourceUrl: `https://www.federalreserve.gov/releases/h41/`,
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
 * 개요 데이터 추출
 */
function extractOverview(table1: any, parsedData: ParsedH41Data): H4ReportOverview {
  const rows = table1?.rows || [];
  
  // 주요 지표 찾기 (부분 일치 허용)
  const findValue = (patterns: string[]): number => {
    for (const pattern of patterns) {
      const row = rows.find((r: any) => {
        if (!r.label) return false;
        const labelLower = r.label.toLowerCase();
        return pattern.toLowerCase().split(' ').every(word => labelLower.includes(word));
      });
      if (row && typeof row.weekEnded === 'number') {
        return row.weekEnded;
      }
    }
    return 0;
  };
  
  const findChange = (patterns: string[]): number => {
    for (const pattern of patterns) {
      const row = rows.find((r: any) => {
        if (!r.label) return false;
        const labelLower = r.label.toLowerCase();
        return pattern.toLowerCase().split(' ').every(word => labelLower.includes(word));
      });
      if (row && typeof row.changeFromPrevWeek === 'number') {
        return row.changeFromPrevWeek;
      }
    }
    return 0;
  };
  
  // 총 자산 (Total assets 또는 Total liabilities and capital)
  const totalAssets = findValue(['total assets', 'total liabilities and capital', 'total liabilities']);
  const totalAssetsChange = findChange(['total assets', 'total liabilities and capital', 'total liabilities']);
  
  // 보유 증권
  const securitiesHeld = findValue(['securities held outright', 'securities held']);
  const securitiesHeldChange = findChange(['securities held outright', 'securities held']);
  
  // 지급준비금
  const reserves = findValue(['reserve balances', 'reserve balances with federal reserve banks']);
  const reservesChange = findChange(['reserve balances', 'reserve balances with federal reserve banks']);
  
  // TGA
  const tga = findValue(['treasury general account', 'u.s. treasury general account', 'treasury general']);
  const tgaChange = findChange(['treasury general account', 'u.s. treasury general account', 'treasury general']);
  
  // 역레포
  const rrp = findValue(['reverse repurchase', 'reverse repurchase agreements']);
  const rrpChange = findChange(['reverse repurchase', 'reverse repurchase agreements']);
  
  // 유통 통화
  const currency = findValue(['currency in circulation', 'currency']);
  const currencyChange = findChange(['currency in circulation', 'currency']);
  
  // 자산 구성 계산 (보유 증권 기준)
  const treasury = findValue(['u.s. treasury securities', 'treasury securities', 'treasury']);
  const mbs = findValue(['mortgage-backed securities', 'mortgage backed', 'mbs']);
  const other = securitiesHeld - treasury - mbs;
  
  return {
    totalAssets: {
      value: totalAssets,
      weeklyChange: totalAssetsChange,
      weeklyChangePercent: totalAssets ? (totalAssetsChange / totalAssets) * 100 : 0,
      yearlyChange: 0, // 연간 데이터는 별도 계산 필요
      yearlyChangePercent: 0,
    },
    securitiesHeld: {
      value: securitiesHeld,
      weeklyChange: securitiesHeldChange,
      weeklyChangePercent: securitiesHeld ? (securitiesHeldChange / securitiesHeld) * 100 : 0,
      yearlyChange: 0,
      yearlyChangePercent: 0,
    },
    reserves: {
      value: reserves,
      weeklyChange: reservesChange,
      weeklyChangePercent: reserves ? (reservesChange / reserves) * 100 : 0,
      yearlyChange: 0,
      yearlyChangePercent: 0,
    },
    tga: {
      value: tga,
      weeklyChange: tgaChange,
      weeklyChangePercent: tga ? (tgaChange / tga) * 100 : 0,
      yearlyChange: 0,
      yearlyChangePercent: 0,
    },
    rrp: {
      value: rrp,
      weeklyChange: rrpChange,
      weeklyChangePercent: rrp ? (rrpChange / rrp) * 100 : 0,
      yearlyChange: 0,
      yearlyChangePercent: 0,
    },
    currency: {
      value: currency,
      weeklyChange: currencyChange,
      weeklyChangePercent: currency ? (currencyChange / currency) * 100 : 0,
      yearlyChange: 0,
      yearlyChangePercent: 0,
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
 * 준비금 요인 데이터 추출
 */
function extractFactors(table1: any): H4ReportFactors {
  const rows = table1?.rows || [];
  
  // 공급 요인과 흡수 요인 분류
  const supplying: H4ReportFactorRow[] = [];
  const absorbing: H4ReportFactorRow[] = [];
  
  // 간단한 분류 로직 (실제로는 더 정교한 파싱 필요)
  for (const row of rows) {
    const label = row.label || '';
    const value = row.weekEnded || 0;
    const change = row.changeFromPrevWeek || 0;
    
    const factorRow = {
      label: translateLabel(label),
      labelEn: label,
      value,
      change,
      changePercent: value ? (change / value) * 100 : 0,
    };
    
    // 공급 요인: 보유 증권, 리포 등
    if (
      label.toLowerCase().includes('securities') ||
      label.toLowerCase().includes('repurchase') && !label.toLowerCase().includes('reverse')
    ) {
      supplying.push(factorRow);
    }
    // 흡수 요인: 역레포, 통화, TGA 등
    else if (
      label.toLowerCase().includes('reverse') ||
      label.toLowerCase().includes('currency') ||
      label.toLowerCase().includes('treasury') && label.toLowerCase().includes('general')
    ) {
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
 * 요인 요약 추출
 */
function extractSummary(table1: any): H4ReportSummary {
  const factors = extractFactors(table1);
  
  return {
    keySupply: factors.supplying
      .filter(r => Math.abs(r.value) > 1000) // 주요 항목만
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
