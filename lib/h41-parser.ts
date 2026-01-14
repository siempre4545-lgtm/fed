/**
 * H.4.1 HTML 파서
 * Federal Reserve H.4.1 release HTML을 파싱하여 구조화된 데이터로 변환
 */

import * as cheerio from 'cheerio';
import {
  parseNumber,
  normalizeLabel,
  matchLabel,
  findSection,
  findRowByLabel,
  findColumnIndex,
  parseDateToISO,
  formatDateForURL,
  findFirstTableNearSection,
} from './h41-parser-core';

export interface H41ParsedData {
  ok: boolean;
  date: string;
  releaseDate: string;
  weekEnded: string;
  sections: {
    overview: OverviewSection;
    factors: FactorsSection;
    summary: SummarySection;
    maturity: MaturitySection;
    lending: LendingSection;
    statement: StatementSection;
  };
  warnings: string[];
}

export interface OverviewSection {
  totalAssets: number | null;
  securities: number | null;
  reserveBalances: number | null;
  tga: number | null;
  reverseRepos: number | null;
  currency: number | null;
  // 주간/연간 변화
  totalAssetsWeekly: number | null;
  totalAssetsYearly: number | null;
  securitiesWeekly: number | null;
  securitiesYearly: number | null;
  reserveBalancesWeekly: number | null;
  reserveBalancesYearly: number | null;
  tgaWeekly: number | null;
  tgaYearly: number | null;
  reverseReposWeekly: number | null;
  reverseReposYearly: number | null;
  currencyWeekly: number | null;
  currencyYearly: number | null;
  // 자산 구성
  totalAssetsForComposition: number | null;
  treasurySecurities: number | null;
  mortgageBackedSecurities: number | null;
  otherAssets: number | null;
}

export interface FactorsSection {
  supplying: FactorsRow[];
  absorbing: FactorsRow[];
  totals: {
    totalSupplying: { value: number | null; weekly: number | null; yearly: number | null };
    totalAbsorbing: { value: number | null; weekly: number | null; yearly: number | null };
    reserveBalances: { value: number | null; weekly: number | null; yearly: number | null };
  };
}

export interface FactorsRow {
  label: string;
  labelKo: string;
  value: number | null;
  weekly: number | null;
  yearly: number | null;
}

export interface SummarySection {
  supplyingTop: FactorsRow[];
  absorbingTop: FactorsRow[];
}

export interface MaturitySection {
  treasury: MaturityRow;
  mbs: MaturityRow;
}

export interface MaturityRow {
  within15Days: number | null;
  days16to90: number | null;
  days91to1Year: number | null;
  years1to5: number | null;
  years5to10: number | null;
  years10AndOver: number | null;
  total: number | null;
}

export interface LendingSection {
  loans: {
    primaryCredit: number | null;
    btfp: number | null;
    total: number | null;
  };
  securitiesLending: {
    overnight: number | null;
    term: number | null;
  };
}

export interface StatementSection {
  assets: {
    gold: number | null;
    sdr: number | null;
    securities: number | null;
    repos: number | null;
    loans: number | null;
    swaps: number | null;
    total: number | null;
    // 주간/연간 변동
    goldWeekly: number | null;
    goldYearly: number | null;
    sdrWeekly: number | null;
    sdrYearly: number | null;
    securitiesWeekly: number | null;
    securitiesYearly: number | null;
    reposWeekly: number | null;
    reposYearly: number | null;
    loansWeekly: number | null;
    loansYearly: number | null;
    swapsWeekly: number | null;
    swapsYearly: number | null;
    totalWeekly: number | null;
    totalYearly: number | null;
  };
  liabilities: {
    currency: number | null;
    reverseRepos: number | null;
    deposits: number | null;
    reserveBalances: number | null;
    tga: number | null;
    total: number | null;
    // 주간/연간 변동
    currencyWeekly: number | null;
    currencyYearly: number | null;
    reverseReposWeekly: number | null;
    reverseReposYearly: number | null;
    depositsWeekly: number | null;
    depositsYearly: number | null;
    reserveBalancesWeekly: number | null;
    reserveBalancesYearly: number | null;
    tgaWeekly: number | null;
    tgaYearly: number | null;
    totalWeekly: number | null;
    totalYearly: number | null;
  };
}

/**
 * H.4.1 HTML 파싱 메인 함수
 */
export async function parseH41HTML(date: string): Promise<H41ParsedData> {
  const dateStr = formatDateForURL(date);
  
  try {
    // 1차 URL 시도 (디렉토리)
    let url = `https://www.federalreserve.gov/releases/h41/${dateStr}/`;
    let response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; fedreportsh/1.0; +https://fedreportsh.vercel.app)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
      },
      cache: 'no-store',
      redirect: 'follow',
    });
    
    // 404면 fallback URL 시도
    if (response.status === 404) {
      url = `https://www.federalreserve.gov/releases/h41/${dateStr}/default.htm`;
      response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; fedreportsh/1.0; +https://fedreportsh.vercel.app)',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
        },
        cache: 'no-store',
        redirect: 'follow',
      });
    }
    
    // 로깅: 요청 정보
    const contentType = response.headers.get('content-type') || 'unknown';
    const html = await response.text();
    const htmlPreview = html.replace(/\s+/g, ' ').substring(0, 500);
    
    // 차단 키워드 확인
    const blockedKeywords = ['Access Denied', 'robot', 'captcha', 'Request Rejected', 'Forbidden'];
    const flagged = blockedKeywords.some(kw => html.toLowerCase().includes(kw.toLowerCase()));
    
    console.warn(`[parseH41HTML] Fetch result for ${dateStr}:`, {
      url,
      status: response.status,
      statusText: response.statusText,
      contentType,
      htmlLength: html.length,
      htmlPreview,
      flagged,
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch H.4.1 HTML: ${response.status} ${response.statusText}`);
    }
    
    if (flagged) {
      console.warn(`[parseH41HTML] WARNING: Blocked keywords detected in HTML for ${dateStr}`);
    }
    
    const $ = cheerio.load(html);
    
    // Release Date와 Week Ended 파싱
    const releaseDate = parseReleaseDate($);
    const weekEnded = parseWeekEnded($);
    
    const warnings: string[] = [];
    
    // 각 섹션 파싱
    const overview = parseOverviewSection($, warnings);
    const factors = parseFactorsSection($, warnings);
    const summary = parseSummarySection(factors, warnings);
    const maturity = parseMaturitySection($, warnings);
    const lending = parseLendingSection($, warnings);
    const statement = parseStatementSection($, warnings);
    
    return {
      ok: true,
      date,
      releaseDate,
      weekEnded,
      sections: {
        overview,
        factors,
        summary,
        maturity,
        lending,
        statement,
      },
      warnings,
    };
  } catch (error) {
    return {
      ok: false,
      date,
      releaseDate: '',
      weekEnded: '',
      sections: {
        overview: createEmptyOverview(),
        factors: createEmptyFactors(),
        summary: createEmptySummary(),
        maturity: createEmptyMaturity(),
        lending: createEmptyLending(),
        statement: createEmptyStatement(),
      },
      warnings: [error instanceof Error ? error.message : String(error)],
    };
  }
}

/**
 * Release Date 파싱
 */
function parseReleaseDate($: cheerio.CheerioAPI): string {
  const bodyText = $('body').text();
  const match = bodyText.match(/Release\s+Date[:\s]+([A-Z][a-z]{2,}\s+\d{1,2},\s+\d{4})/i);
  if (match) {
    const parsed = parseDateToISO(match[1]);
    if (parsed) return parsed;
  }
  return '';
}

/**
 * Week Ended 파싱
 */
function parseWeekEnded($: cheerio.CheerioAPI): string {
  const bodyText = $('body').text();
  const match = bodyText.match(/Week\s+ended[:\s]+([A-Z][a-z]{2,}\s+\d{1,2},\s+\d{4})/i);
  if (match) {
    const parsed = parseDateToISO(match[1]);
    if (parsed) return parsed;
  }
  return '';
}

/**
 * Overview 섹션 파싱
 */
function parseOverviewSection($: cheerio.CheerioAPI, warnings: string[]): OverviewSection {
  // "1. Factors Affecting Reserve Balances" 섹션 찾기
  const factorsSection = findSection($, [
    'Factors Affecting Reserve Balances',
    'Table 1',
    'Factors affecting reserve balances',
  ]);
  
  if (!factorsSection || factorsSection.length === 0) {
    if (process.env.NODE_ENV === 'development') {
      warnings.push('Overview section not found');
    }
    return createEmptyOverview();
  }
  
  const table = findFirstTableNearSection($, factorsSection, ['Factors Affecting Reserve Balances', 'Table 1']);
  if (!table || table.length === 0) {
    if (process.env.NODE_ENV === 'development') {
      warnings.push('Overview table not found');
    }
    return createEmptyOverview();
  }
  
  // 컬럼 인덱스 찾기
  const valueCol = findColumnIndex($, table, ['Week ended', 'Level']);
  const weeklyCol = findColumnIndex($, table, ['Change from previous week', 'Change from week ended']);
  const yearlyCol = findColumnIndex($, table, ['Change from year ago', 'Change from:']);
  
  // 각 항목 파싱
  const totalAssets = extractValue(table, $, ['Total factors supplying reserve funds'], valueCol, warnings);
  const securities = extractValue(table, $, ['Securities held outright'], valueCol, warnings);
  const reserveBalances = extractValue(table, $, ['Reserve balances with Federal Reserve Banks'], valueCol, warnings);
  const tga = extractValue(table, $, ['U.S. Treasury, General Account', 'Treasury General Account'], valueCol, warnings);
  const reverseRepos = extractValue(table, $, ['Reverse repurchase agreements'], valueCol, warnings);
  const currency = extractValue(table, $, ['Currency in circulation'], valueCol, warnings);
  
  const totalAssetsWeekly = extractValue(table, $, ['Total factors supplying reserve funds'], weeklyCol, warnings);
  const totalAssetsYearly = extractValue(table, $, ['Total factors supplying reserve funds'], yearlyCol, warnings);
  const securitiesWeekly = extractValue(table, $, ['Securities held outright'], weeklyCol, warnings);
  const securitiesYearly = extractValue(table, $, ['Securities held outright'], yearlyCol, warnings);
  const reserveBalancesWeekly = extractValue(table, $, ['Reserve balances with Federal Reserve Banks'], weeklyCol, warnings);
  const reserveBalancesYearly = extractValue(table, $, ['Reserve balances with Federal Reserve Banks'], yearlyCol, warnings);
  const tgaWeekly = extractValue(table, $, ['U.S. Treasury, General Account', 'Treasury General Account'], weeklyCol, warnings);
  const tgaYearly = extractValue(table, $, ['U.S. Treasury, General Account', 'Treasury General Account'], yearlyCol, warnings);
  const reverseReposWeekly = extractValue(table, $, ['Reverse repurchase agreements'], weeklyCol, warnings);
  const reverseReposYearly = extractValue(table, $, ['Reverse repurchase agreements'], yearlyCol, warnings);
  const currencyWeekly = extractValue(table, $, ['Currency in circulation'], weeklyCol, warnings);
  const currencyYearly = extractValue(table, $, ['Currency in circulation'], yearlyCol, warnings);
  
  // "5. Consolidated Statement" 섹션에서 자산 구성 파싱
  const statementSection = findSection($, [
    'Consolidated Statement of Condition',
    'Table 5',
  ]);
  
  let totalAssetsForComposition: number | null = null;
  let treasurySecurities: number | null = null;
  let mortgageBackedSecurities: number | null = null;
  let otherAssets: number | null = null;
  
  if (statementSection && statementSection.length > 0) {
    const statementTable = findFirstTableNearSection($, statementSection, ['Consolidated Statement', 'Assets', 'Liabilities']);
    if (statementTable && statementTable.length > 0) {
      const assetsValueCol = findColumnIndex($, statementTable, ['Assets', 'Level']);
      totalAssetsForComposition = extractValue(statementTable, $, ['Total assets'], assetsValueCol, warnings);
      treasurySecurities = extractValue(statementTable, $, ['U.S. Treasury securities'], assetsValueCol, warnings);
      mortgageBackedSecurities = extractValue(statementTable, $, ['Mortgage-backed securities'], assetsValueCol, warnings);
      otherAssets = extractValue(statementTable, $, ['Other assets'], assetsValueCol, warnings);
    }
  }
  
  return {
    totalAssets,
    securities,
    reserveBalances,
    tga,
    reverseRepos,
    currency,
    totalAssetsWeekly,
    totalAssetsYearly,
    securitiesWeekly,
    securitiesYearly,
    reserveBalancesWeekly,
    reserveBalancesYearly,
    tgaWeekly,
    tgaYearly,
    reverseReposWeekly,
    reverseReposYearly,
    currencyWeekly,
    currencyYearly,
    totalAssetsForComposition,
    treasurySecurities,
    mortgageBackedSecurities,
    otherAssets,
  };
}

/**
 * Factors 섹션 파싱
 */
function parseFactorsSection($: cheerio.CheerioAPI, warnings: string[]): FactorsSection {
  const factorsSection = findSection($, [
    'Factors Affecting Reserve Balances',
    'Table 1',
    'Factors affecting reserve balances',
  ]);
  
  if (!factorsSection || factorsSection.length === 0) {
    if (process.env.NODE_ENV === 'development') {
      warnings.push('Factors section not found');
    }
    return createEmptyFactors();
  }
  
  const table = findFirstTableNearSection($, factorsSection, ['Factors Affecting Reserve Balances', 'Table 1']);
  if (!table || table.length === 0) {
    if (process.env.NODE_ENV === 'development') {
      warnings.push('Factors table not found');
    }
    return createEmptyFactors();
  }
  
  const valueCol = findColumnIndex($, table, ['Week ended', 'Level']);
  const weeklyCol = findColumnIndex($, table, ['Change from previous week', 'Change from week ended']);
  const yearlyCol = findColumnIndex($, table, ['Change from year ago', 'Change from:']);
  
  // 공급 요인 13개 (사용자 요구사항에 맞게 정확한 라벨 매핑)
  const supplying: FactorsRow[] = [
    { label: 'Reserve Bank credit', labelKo: '연준 신용', value: null, weekly: null, yearly: null },
    { label: 'Securities held outright', labelKo: '보유 증권', value: null, weekly: null, yearly: null },
    { label: 'U.S. Treasury securities', labelKo: '미 국채', value: null, weekly: null, yearly: null },
    { label: 'Bills', labelKo: '단기채', value: null, weekly: null, yearly: null },
    { label: 'Notes and bonds, nominal', labelKo: '중장기채', value: null, weekly: null, yearly: null },
    { label: 'Notes and bonds, inflation-indexed', labelKo: '물가연동채', value: null, weekly: null, yearly: null },
    { label: 'Mortgage-backed securities', labelKo: '주택저당증권', value: null, weekly: null, yearly: null },
    { label: 'Repurchase agreements', labelKo: '레포', value: null, weekly: null, yearly: null },
    { label: 'Loans', labelKo: '대출', value: null, weekly: null, yearly: null },
    { label: 'Loans - Bank Term Funding Program', labelKo: '은행기간대출', value: null, weekly: null, yearly: null },
    { label: 'Central bank liquidity swaps', labelKo: '통화스왑', value: null, weekly: null, yearly: null },
    { label: 'Gold stock', labelKo: '금', value: null, weekly: null, yearly: null },
    { label: 'Special drawing rights certificate account', labelKo: 'SDR 증서', value: null, weekly: null, yearly: null },
  ];
  
  for (const row of supplying) {
    row.value = extractValue(table, $, [row.label], valueCol, warnings);
    row.weekly = extractValue(table, $, [row.label], weeklyCol, warnings);
    row.yearly = extractValue(table, $, [row.label], yearlyCol, warnings);
  }
  
  // 흡수 요인 4개
  const absorbing: FactorsRow[] = [
    { label: 'Currency in circulation', labelKo: '유통 통화', value: null, weekly: null, yearly: null },
    { label: 'Reverse repurchase agreements', labelKo: '역레포', value: null, weekly: null, yearly: null },
    { label: 'Deposits with F.R. Banks, other than reserve balances', labelKo: '연준 예치금', value: null, weekly: null, yearly: null },
    { label: 'U.S. Treasury, General Account', labelKo: '재무부 일반계정', value: null, weekly: null, yearly: null },
  ];
  
  for (const row of absorbing) {
    row.value = extractValue(table, $, [row.label], valueCol, warnings);
    row.weekly = extractValue(table, $, [row.label], weeklyCol, warnings);
    row.yearly = extractValue(table, $, [row.label], yearlyCol, warnings);
  }
  
  // 하단 합계 (원문에서 직접 파싱)
  const totalSupplying = {
    value: extractValue(table, $, ['Total factors supplying reserve funds'], valueCol, warnings),
    weekly: extractValue(table, $, ['Total factors supplying reserve funds'], weeklyCol, warnings),
    yearly: extractValue(table, $, ['Total factors supplying reserve funds'], yearlyCol, warnings),
  };
  
  const totalAbsorbing = {
    value: extractValue(table, $, ['Total factors, other than reserve balances, absorbing reserve funds'], valueCol, warnings),
    weekly: extractValue(table, $, ['Total factors, other than reserve balances, absorbing reserve funds'], weeklyCol, warnings),
    yearly: extractValue(table, $, ['Total factors, other than reserve balances, absorbing reserve funds'], yearlyCol, warnings),
  };
  
  const reserveBalances = {
    value: extractValue(table, $, ['Reserve balances with Federal Reserve Banks'], valueCol, warnings),
    weekly: extractValue(table, $, ['Reserve balances with Federal Reserve Banks'], weeklyCol, warnings),
    yearly: extractValue(table, $, ['Reserve balances with Federal Reserve Banks'], yearlyCol, warnings),
  };
  
  // 검증
  if (supplying.length !== 13) {
    warnings.push(`Supplying items count mismatch: expected 13, got ${supplying.length}`);
  }
  if (absorbing.length !== 4) {
    warnings.push(`Absorbing items count mismatch: expected 4, got ${absorbing.length}`);
  }
  
  return {
    supplying,
    absorbing,
    totals: {
      totalSupplying,
      totalAbsorbing,
      reserveBalances,
    },
  };
}

/**
 * Summary 섹션 파싱 (factors 데이터 재사용)
 */
function parseSummarySection(factors: FactorsSection, warnings: string[]): SummarySection {
  // 주요 공급 요인: 보유증권, 레포, 대출, 통화스왑
  const supplyingTop: FactorsRow[] = [
    factors.supplying.find(r => r.labelKo === '보유 증권') || { label: '', labelKo: '보유 증권', value: null, weekly: null, yearly: null },
    factors.supplying.find(r => r.labelKo === '레포') || { label: '', labelKo: '레포', value: null, weekly: null, yearly: null },
    factors.supplying.find(r => r.labelKo === '대출') || { label: '', labelKo: '대출', value: null, weekly: null, yearly: null },
    factors.supplying.find(r => r.labelKo === '통화스왑') || { label: '', labelKo: '통화스왑', value: null, weekly: null, yearly: null },
  ].filter(r => r.value !== null);
  
  // 주요 흡수 요인: 유통통화, 역레포, TGA, 지급준비금
  const absorbingTop: FactorsRow[] = [
    factors.absorbing.find(r => r.labelKo === '유통 통화') || { label: '', labelKo: '유통 통화', value: null, weekly: null, yearly: null },
    factors.absorbing.find(r => r.labelKo === '역레포') || { label: '', labelKo: '역레포', value: null, weekly: null, yearly: null },
    factors.absorbing.find(r => r.labelKo === '재무부 일반계정') || { label: '', labelKo: '재무부 일반계정', value: null, weekly: null, yearly: null },
    { label: 'Reserve balances with Federal Reserve Banks', labelKo: '지급준비금', ...factors.totals.reserveBalances },
  ].filter(r => r.value !== null);
  
  return {
    supplyingTop,
    absorbingTop,
  };
}

/**
 * Maturity 섹션 파싱
 */
function parseMaturitySection($: cheerio.CheerioAPI, warnings: string[]): MaturitySection {
  const maturitySection = findSection($, [
    'Maturity Distribution of Securities',
    'Table 2',
  ]);
  
  if (!maturitySection || maturitySection.length === 0) {
    warnings.push('Maturity section not found');
    return createEmptyMaturity();
  }
  
  const table = findFirstTableNearSection($, maturitySection, ['Maturity', 'Treasury', 'Mortgage']);
  if (!table || table.length === 0) {
    if (process.env.NODE_ENV === 'development') {
      warnings.push('Maturity table not found');
    }
    return createEmptyMaturity();
  }
  
  // 컬럼 인덱스 찾기 (헤더에서)
  const within15DaysCol = findColumnIndex($, table, ['Within 15 days', 'within 15 days', '15 days']);
  const days16to90Col = findColumnIndex($, table, ['16 days to 90 days', '16-90 days', '16 to 90']);
  const days91to1YearCol = findColumnIndex($, table, ['91 days to 1 year', '91일-1년', '91-365']);
  const years1to5Col = findColumnIndex($, table, ['Over 1 year to 5 years', '1-5 years', '1 to 5']);
  const years5to10Col = findColumnIndex($, table, ['Over 5 years to 10 years', '5-10 years', '5 to 10']);
  const years10AndOverCol = findColumnIndex($, table, ['Over 10 years', '10 years and over', '10+']);
  const totalCol = findColumnIndex($, table, ['All', 'Total']);
  
  // Treasury securities 행 찾기
  const treasuryRow = findRowByLabel($, table, ['U.S. Treasury securities', 'Treasury securities']);
  const mbsRow = findRowByLabel($, table, ['Mortgage-backed securities', 'MBS']);
  
  const treasury = parseMaturityRow($, treasuryRow, table, within15DaysCol, days16to90Col, days91to1YearCol, years1to5Col, years5to10Col, years10AndOverCol, totalCol, warnings);
  const mbs = parseMaturityRow($, mbsRow, table, within15DaysCol, days16to90Col, days91to1YearCol, years1to5Col, years5to10Col, years10AndOverCol, totalCol, warnings);
  
  return { treasury, mbs };
}

/**
 * Maturity 행 파싱
 */
function parseMaturityRow(
  $: cheerio.CheerioAPI,
  row: cheerio.Cheerio<cheerio.Element> | null,
  table: cheerio.Cheerio<cheerio.Element>,
  within15DaysCol: number,
  days16to90Col: number,
  days91to1YearCol: number,
  years1to5Col: number,
  years5to10Col: number,
  years10AndOverCol: number,
  totalCol: number,
  warnings: string[]
): MaturityRow {
  if (!row || row.length === 0) {
    return createEmptyMaturityRow();
  }
  
  const cells = row.find('td, th');
  
  return {
    within15Days: within15DaysCol >= 0 && cells.length > within15DaysCol ? parseNumber($(cells[within15DaysCol]).text()) : null,
    days16to90: days16to90Col >= 0 && cells.length > days16to90Col ? parseNumber($(cells[days16to90Col]).text()) : null,
    days91to1Year: days91to1YearCol >= 0 && cells.length > days91to1YearCol ? parseNumber($(cells[days91to1YearCol]).text()) : null,
    years1to5: years1to5Col >= 0 && cells.length > years1to5Col ? parseNumber($(cells[years1to5Col]).text()) : null,
    years5to10: years5to10Col >= 0 && cells.length > years5to10Col ? parseNumber($(cells[years5to10Col]).text()) : null,
    years10AndOver: years10AndOverCol >= 0 && cells.length > years10AndOverCol ? parseNumber($(cells[years10AndOverCol]).text()) : null,
    total: totalCol >= 0 && cells.length > totalCol ? parseNumber($(cells[totalCol]).text()) : null,
  };
}

/**
 * Lending 섹션 파싱
 */
function parseLendingSection($: cheerio.CheerioAPI, warnings: string[]): LendingSection {
  const factorsSection = findSection($, ['Factors Affecting Reserve Balances']);
  const memoSection = findSection($, ['Memorandum Items', '1A']);
  
  let primaryCredit: number | null = null;
  let btfp: number | null = null;
  let loansTotal: number | null = null;
  let overnight: number | null = null;
  let term: number | null = null;
  
  if (factorsSection && factorsSection.length > 0) {
    const table = findFirstTableNearSection($, factorsSection, ['Loans', 'Primary credit', 'BTFP']);
    if (table && table.length > 0) {
      const valueCol = findColumnIndex($, table, ['Week ended', 'Level']);
      primaryCredit = extractValue(table, $, ['Loans - Primary credit'], valueCol, warnings);
      btfp = extractValue(table, $, ['Loans - Bank Term Funding Program'], valueCol, warnings);
      loansTotal = extractValue(table, $, ['Loans'], valueCol, warnings);
    }
  }
  
  if (memoSection && memoSection.length > 0) {
    const table = findFirstTableNearSection($, memoSection, ['Memorandum Items', 'Securities lent', 'Overnight', 'Term']);
    if (table && table.length > 0) {
      const valueCol = findColumnIndex($, table, ['Week ended', 'Level', 'Wednesday']);
      overnight = extractValue(table, $, ['Securities lent to dealers - Overnight facility', 'Overnight facility'], valueCol, warnings);
      // 기간물은 찾기 어려울 수 있으므로 여러 후보 시도
      term = extractValue(table, $, ['Securities lent to dealers - Term facility', 'Term facility'], valueCol, warnings);
    }
  }
  
  return {
    loans: {
      primaryCredit,
      btfp,
      total: loansTotal,
    },
    securitiesLending: {
      overnight,
      term,
    },
  };
}

/**
 * Statement 섹션 파싱
 */
function parseStatementSection($: cheerio.CheerioAPI, warnings: string[]): StatementSection {
  const statementSection = findSection($, [
    'Consolidated Statement of Condition',
    'Table 5',
  ]);
  
  if (!statementSection || statementSection.length === 0) {
    warnings.push('Statement section not found');
    return createEmptyStatement();
  }
  
  const table = findFirstTableNearSection($, statementSection, ['Consolidated Statement', 'Statement of Condition']);
  if (!table || table.length === 0) {
    if (process.env.NODE_ENV === 'development') {
      warnings.push('Statement table not found');
    }
    return createEmptyStatement();
  }
  
  const assetsValueCol = findColumnIndex($, table, ['Assets', 'Level']);
  const assetsWeeklyCol = findColumnIndex($, table, ['Change since', 'Change from previous week']);
  const assetsYearlyCol = findColumnIndex($, table, ['Change from year ago', 'Change from:']);
  
  const liabilitiesValueCol = findColumnIndex($, table, ['Liabilities', 'Level']);
  const liabilitiesWeeklyCol = findColumnIndex($, table, ['Change since', 'Change from previous week']);
  const liabilitiesYearlyCol = findColumnIndex($, table, ['Change from year ago', 'Change from:']);
  
  return {
    assets: {
      gold: extractValue(table, $, ['Gold certificate account', 'Gold stock'], assetsValueCol, warnings),
      sdr: extractValue(table, $, ['Special drawing rights certificate account', 'Coin'], assetsValueCol, warnings),
      securities: extractValue(table, $, ['Securities held outright'], assetsValueCol, warnings),
      repos: extractValue(table, $, ['Repurchase agreements'], assetsValueCol, warnings),
      loans: extractValue(table, $, ['Loans'], assetsValueCol, warnings),
      swaps: extractValue(table, $, ['Central bank liquidity swaps'], assetsValueCol, warnings),
      total: extractValue(table, $, ['Total assets'], assetsValueCol, warnings),
      // 주간/연간 변동
      goldWeekly: extractValue(table, $, ['Gold certificate account', 'Gold stock'], assetsWeeklyCol, warnings),
      goldYearly: extractValue(table, $, ['Gold certificate account', 'Gold stock'], assetsYearlyCol, warnings),
      sdrWeekly: extractValue(table, $, ['Special drawing rights certificate account', 'Coin'], assetsWeeklyCol, warnings),
      sdrYearly: extractValue(table, $, ['Special drawing rights certificate account', 'Coin'], assetsYearlyCol, warnings),
      securitiesWeekly: extractValue(table, $, ['Securities held outright'], assetsWeeklyCol, warnings),
      securitiesYearly: extractValue(table, $, ['Securities held outright'], assetsYearlyCol, warnings),
      reposWeekly: extractValue(table, $, ['Repurchase agreements'], assetsWeeklyCol, warnings),
      reposYearly: extractValue(table, $, ['Repurchase agreements'], assetsYearlyCol, warnings),
      loansWeekly: extractValue(table, $, ['Loans'], assetsWeeklyCol, warnings),
      loansYearly: extractValue(table, $, ['Loans'], assetsYearlyCol, warnings),
      swapsWeekly: extractValue(table, $, ['Central bank liquidity swaps'], assetsWeeklyCol, warnings),
      swapsYearly: extractValue(table, $, ['Central bank liquidity swaps'], assetsYearlyCol, warnings),
      totalWeekly: extractValue(table, $, ['Total assets'], assetsWeeklyCol, warnings),
      totalYearly: extractValue(table, $, ['Total assets'], assetsYearlyCol, warnings),
    },
    liabilities: {
      currency: extractValue(table, $, ['Federal Reserve notes', 'Currency in circulation'], liabilitiesValueCol, warnings),
      reverseRepos: extractValue(table, $, ['Reverse repurchase agreements'], liabilitiesValueCol, warnings),
      deposits: extractValue(table, $, ['Deposits with F.R. Banks, other than reserve balances', 'Deposits'], liabilitiesValueCol, warnings),
      reserveBalances: extractValue(table, $, ['Reserve balances with Federal Reserve Banks', 'Reserves'], liabilitiesValueCol, warnings),
      tga: extractValue(table, $, ['U.S. Treasury, General Account', 'Treasury General Account', 'Treasury'], liabilitiesValueCol, warnings),
      total: extractValue(table, $, ['Total liabilities'], liabilitiesValueCol, warnings),
      // 주간/연간 변동
      currencyWeekly: extractValue(table, $, ['Federal Reserve notes', 'Currency in circulation'], liabilitiesWeeklyCol, warnings),
      currencyYearly: extractValue(table, $, ['Federal Reserve notes', 'Currency in circulation'], liabilitiesYearlyCol, warnings),
      reverseReposWeekly: extractValue(table, $, ['Reverse repurchase agreements'], liabilitiesWeeklyCol, warnings),
      reverseReposYearly: extractValue(table, $, ['Reverse repurchase agreements'], liabilitiesYearlyCol, warnings),
      depositsWeekly: extractValue(table, $, ['Deposits with F.R. Banks, other than reserve balances', 'Deposits'], liabilitiesWeeklyCol, warnings),
      depositsYearly: extractValue(table, $, ['Deposits with F.R. Banks, other than reserve balances', 'Deposits'], liabilitiesYearlyCol, warnings),
      reserveBalancesWeekly: extractValue(table, $, ['Reserve balances with Federal Reserve Banks', 'Reserves'], liabilitiesWeeklyCol, warnings),
      reserveBalancesYearly: extractValue(table, $, ['Reserve balances with Federal Reserve Banks', 'Reserves'], liabilitiesYearlyCol, warnings),
      tgaWeekly: extractValue(table, $, ['U.S. Treasury, General Account', 'Treasury General Account', 'Treasury'], liabilitiesWeeklyCol, warnings),
      tgaYearly: extractValue(table, $, ['U.S. Treasury, General Account', 'Treasury General Account', 'Treasury'], liabilitiesYearlyCol, warnings),
      totalWeekly: extractValue(table, $, ['Total liabilities'], liabilitiesWeeklyCol, warnings),
      totalYearly: extractValue(table, $, ['Total liabilities'], liabilitiesYearlyCol, warnings),
    },
  };
}

/**
 * 라벨 후보 확장 (변형 버전 추가)
 */
function expandLabelCandidates(candidates: string[]): string[] {
  const expanded = new Set<string>();
  
  for (const candidate of candidates) {
    expanded.add(candidate);
    
    // 콤마 제거 버전
    const withoutComma = candidate.replace(/,/g, '');
    if (withoutComma !== candidate) {
      expanded.add(withoutComma);
    }
    
    // 괄호 제거 버전
    const withoutParens = candidate.replace(/[()]/g, '');
    if (withoutParens !== candidate) {
      expanded.add(withoutParens);
    }
    
    // 연속 공백을 1개로
    const singleSpace = candidate.replace(/\s+/g, ' ');
    if (singleSpace !== candidate) {
      expanded.add(singleSpace);
    }
    
    // 콤마와 괄호 모두 제거
    const cleaned = candidate.replace(/[,()]/g, '').replace(/\s+/g, ' ');
    if (cleaned !== candidate) {
      expanded.add(cleaned);
    }
  }
  
  return Array.from(expanded);
}

/**
 * 테이블에서 값 추출 헬퍼
 */
function extractValue(
  table: cheerio.Cheerio<cheerio.Element>,
  $: cheerio.CheerioAPI,
  labelCandidates: string[],
  columnIndex: number,
  warnings: string[]
): number | null {
  if (columnIndex < 0) {
    return null;
  }
  
  // 라벨 후보 확장 (변형 버전 추가)
  const expandedCandidates = expandLabelCandidates(labelCandidates);
  
  const row = findRowByLabel($, table, expandedCandidates);
  if (!row || row.length === 0) {
    // 경고는 디버그 모드에서만 (너무 많아서)
    if (process.env.NODE_ENV === 'development') {
      warnings.push(`Row not found for labels: ${labelCandidates.join(', ')}`);
    }
    return null;
  }
  
  const cells = row.find('td, th');
  if (cells.length <= columnIndex) {
    if (process.env.NODE_ENV === 'development') {
      warnings.push(`Column index ${columnIndex} out of range for row: ${labelCandidates[0]}`);
    }
    return null;
  }
  
  const valueText = $(cells[columnIndex]).text().trim();
  const value = parseNumber(valueText);
  
  if (value === null && valueText && process.env.NODE_ENV === 'development') {
    // 숫자가 아닌 텍스트만 있는 경우는 경고하지 않음 (예: "Coin")
    if (/\d/.test(valueText)) {
      warnings.push(`Failed to parse number from "${valueText}" for ${labelCandidates[0]}`);
    }
  }
  
  return value;
}

// Empty creators
function createEmptyOverview(): OverviewSection {
  return {
    totalAssets: null,
    securities: null,
    reserveBalances: null,
    tga: null,
    reverseRepos: null,
    currency: null,
    totalAssetsWeekly: null,
    totalAssetsYearly: null,
    securitiesWeekly: null,
    securitiesYearly: null,
    reserveBalancesWeekly: null,
    reserveBalancesYearly: null,
    tgaWeekly: null,
    tgaYearly: null,
    reverseReposWeekly: null,
    reverseReposYearly: null,
    currencyWeekly: null,
    currencyYearly: null,
    totalAssetsForComposition: null,
    treasurySecurities: null,
    mortgageBackedSecurities: null,
    otherAssets: null,
  };
}

function createEmptyFactors(): FactorsSection {
  return {
    supplying: [],
    absorbing: [],
    totals: {
      totalSupplying: { value: null, weekly: null, yearly: null },
      totalAbsorbing: { value: null, weekly: null, yearly: null },
      reserveBalances: { value: null, weekly: null, yearly: null },
    },
  };
}

function createEmptySummary(): SummarySection {
  return {
    supplyingTop: [],
    absorbingTop: [],
  };
}

function createEmptyMaturity(): MaturitySection {
  return {
    treasury: createEmptyMaturityRow(),
    mbs: createEmptyMaturityRow(),
  };
}

function createEmptyMaturityRow(): MaturityRow {
  return {
    within15Days: null,
    days16to90: null,
    days91to1Year: null,
    years1to5: null,
    years5to10: null,
    years10AndOver: null,
    total: null,
  };
}

function createEmptyLending(): LendingSection {
  return {
    loans: {
      primaryCredit: null,
      btfp: null,
      total: null,
    },
    securitiesLending: {
      overnight: null,
      term: null,
    },
  };
}

function createEmptyStatement(): StatementSection {
  return {
    assets: {
      gold: null,
      sdr: null,
      securities: null,
      repos: null,
      loans: null,
      swaps: null,
      total: null,
      goldWeekly: null,
      goldYearly: null,
      sdrWeekly: null,
      sdrYearly: null,
      securitiesWeekly: null,
      securitiesYearly: null,
      reposWeekly: null,
      reposYearly: null,
      loansWeekly: null,
      loansYearly: null,
      swapsWeekly: null,
      swapsYearly: null,
      totalWeekly: null,
      totalYearly: null,
    },
    liabilities: {
      currency: null,
      reverseRepos: null,
      deposits: null,
      reserveBalances: null,
      tga: null,
      total: null,
      currencyWeekly: null,
      currencyYearly: null,
      reverseReposWeekly: null,
      reverseReposYearly: null,
      depositsWeekly: null,
      depositsYearly: null,
      reserveBalancesWeekly: null,
      reserveBalancesYearly: null,
      tgaWeekly: null,
      tgaYearly: null,
      totalWeekly: null,
      totalYearly: null,
    },
  };
}

/**
 * H.4.1 HTML 리포트 가져오기
 * @param dateISO YYYY-MM-DD 형식의 날짜 (필수)
 * @param availableDates 선택적 날짜 목록 (호환성을 위해 유지, 사용하지 않음)
 * @returns HTML 문자열과 URL
 */
export async function fetchH41Report(
  dateISO: string,
  availableDates?: string[]
): Promise<{ html: string; url: string }> {
  const dateStr = formatDateForURL(dateISO);
  
  // 1차 URL 시도 (디렉토리)
  let url = `https://www.federalreserve.gov/releases/h41/${dateStr}/`;
  let response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; fedreportsh/1.0; +https://fedreportsh.vercel.app)',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
    },
    cache: 'no-store',
    redirect: 'follow',
  });
  
  // 404면 fallback URL 시도
  if (response.status === 404) {
    url = `https://www.federalreserve.gov/releases/h41/${dateStr}/default.htm`;
    response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; fedreportsh/1.0; +https://fedreportsh.vercel.app)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
      },
      cache: 'no-store',
      redirect: 'follow',
    });
  }
  
  // 로깅: 요청 정보
  const contentType = response.headers.get('content-type') || 'unknown';
  const html = await response.text();
  const htmlPreview = html.replace(/\s+/g, ' ').substring(0, 500);
  
  // 차단 키워드 확인
  const blockedKeywords = ['Access Denied', 'robot', 'captcha', 'Request Rejected', 'Forbidden'];
  const flagged = blockedKeywords.some(kw => html.toLowerCase().includes(kw.toLowerCase()));
  
  console.warn(`[fetchH41Report] Fetch result for ${dateStr}:`, {
    url,
    status: response.status,
    statusText: response.statusText,
    contentType,
    htmlLength: html.length,
    htmlPreview,
    flagged,
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch H.4.1 HTML: ${response.status} ${response.statusText}`);
  }
  
  if (flagged) {
    console.warn(`[fetchH41Report] WARNING: Blocked keywords detected in HTML for ${dateStr}`);
  }
  
  return { html, url };
}

/**
 * Fed H.4.1 release 날짜 목록 가져오기
 * @returns YYYY-MM-DD 형식의 날짜 배열 (최신순)
 */
export async function getFedReleaseDates(): Promise<string[]> {
  const response = await fetch('https://www.federalreserve.gov/releases/h41/', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    },
    cache: 'no-store',
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch H.4.1 main page: ${response.status}`);
  }
  
  const html = await response.text();
  const $ = cheerio.load(html);
  
  const dates: string[] = [];
  
  // 링크에서 날짜 추출
  $('a[href*="/releases/h41/"]').each((_, el) => {
    const href = $(el).attr('href') || '';
    const match = href.match(/\/releases\/h41\/(\d{8})\//);
    if (match) {
      const dateStr = match[1];
      // YYYYMMDD -> YYYY-MM-DD
      const formatted = `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;
      dates.push(formatted);
    }
  });
  
  // 중복 제거 및 정렬 (최신순)
  const uniqueDates = Array.from(new Set(dates)).sort().reverse();
  
  if (uniqueDates.length === 0) {
    throw new Error('No release dates found');
  }
  
  return uniqueDates;
}
