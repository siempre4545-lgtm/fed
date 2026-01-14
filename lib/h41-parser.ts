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
  pickH41Table,
  getTable1ColumnIndices,
} from './h41-parser-core';
import { fetchH41HtmlStrict, FetchH41Error } from './h41-fetch';

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
 * H.4.1 HTML 파싱 코어 함수 (HTML 문자열 직접 파싱)
 * 테스트에서 사용하기 위해 분리
 */
function parseH41HTMLFromHTML(html: string, date: string, warnings: string[], fetchedUrl?: string): H41ParsedData {
  const $ = cheerio.load(html);
  
  // Release Date와 Week Ended 파싱
  const releaseDate = parseReleaseDate($);
  const weekEnded = date; // 선택한 날짜를 기준일로 사용
  
  // 로깅: HTML 기본 정보 (간소화)
  const tableCount = $('table').length;
  if (fetchedUrl) {
    warnings.push(`[parseH41HTML] fetchedUrl: ${fetchedUrl}`);
  }
  warnings.push(`[parseH41HTML] htmlValidationResult: OK, tables: ${tableCount}`);
  
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
    releaseDate: releaseDate || date,
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
}

/**
 * H.4.1 HTML 파싱 메인 함수
 */
export async function parseH41HTML(date: string, html?: string): Promise<H41ParsedData> {
  const warnings: string[] = [];
  
  try {
    let htmlContent: string;
    let fetchedUrl: string | undefined;
    
    // HTML이 직접 제공된 경우 (테스트용)
    if (html) {
      htmlContent = html;
    } else {
      // fetchH41HtmlStrict 사용
      try {
        const fetchResult = await fetchH41HtmlStrict(date);
        htmlContent = fetchResult.html;
        fetchedUrl = fetchResult.url;
        warnings.push(`[parseH41HTML] fetchedUrl: ${fetchedUrl}`);
        warnings.push(`[parseH41HTML] htmlValidationResult: OK`);
      } catch (error) {
        // FetchH41Error 처리
        if (error instanceof FetchH41Error) {
          warnings.push(`[parseH41HTML] fetchedUrl: ${error.url || 'unknown'}`);
          warnings.push(`[parseH41HTML] htmlValidationResult: FAIL`);
          warnings.push(`[parseH41HTML] failCode: ${error.code}`);
          
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
            warnings: [`${error.code}: ${error.message}`],
          };
        }
        
        // 기타 에러
        throw error;
      }
    }
    
    const result = parseH41HTMLFromHTML(htmlContent, date, warnings, fetchedUrl);
    
    // warnings 길이 제한 (800자)
    const maxWarningLength = 800;
    if (result.warnings.length > 0) {
      const totalLength = result.warnings.join('; ').length;
      if (totalLength > maxWarningLength) {
        const truncated = result.warnings.slice(0, Math.floor(result.warnings.length * 0.8));
        result.warnings.splice(0, result.warnings.length, ...truncated);
        result.warnings.push(`[parseH41HTML] ... (${result.warnings.length - truncated.length} more warnings truncated)`);
      }
    }
    
    return result;
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
  let factorsSection = findSection($, [
    'Factors Affecting Reserve Balances',
    'Table 1',
    'Factors affecting reserve balances',
  ]);
  
  // findSection이 실패하면 body 전체로 scope 확장
  if (!factorsSection || factorsSection.length === 0) {
    warnings.push('[Overview] Section not found, using body as scope');
    factorsSection = $('body');
  }
  
  // Table 1을 정확히 선택 (pickH41Table 사용)
  let table = pickH41Table($, factorsSection, [
    'Reserve Bank credit',
    'Total factors supplying reserve funds',
    'Currency in circulation',
    'U.S. Treasury, General Account',
  ], warnings);
  
  // pickH41Table이 실패하면 body 전체에서 직접 찾기
  if (!table || table.length === 0) {
    warnings.push('[Overview] Table 1 not found in section, trying body-wide search');
    table = pickH41Table($, $('body'), [
      'Reserve Bank credit',
      'Total factors supplying reserve funds',
      'Currency in circulation',
      'U.S. Treasury, General Account',
    ], warnings);
  }
  
  // 그래도 실패하면 findFirstTableNearSection으로 폴백
  if (!table || table.length === 0) {
    warnings.push('[Overview] Table 1 not found using pickH41Table, trying findFirstTableNearSection');
    table = findFirstTableNearSection($, factorsSection, ['Factors Affecting Reserve Balances', 'Table 1']);
    if (!table || table.length === 0) {
      warnings.push('[Overview] Table 1 not found using fallback method');
      return createEmptyOverview();
    }
  }
  
  // 선택된 테이블이 최소 행 수를 만족하는지 확인
  const tableRowCount = table.find('tr').length;
  if (tableRowCount < 5) {
    warnings.push(`[Overview] Selected table has only ${tableRowCount} rows, too few for data table`);
    return createEmptyOverview();
  }
  
  // 로깅: 선택된 테이블 정보
  const rowCount = table.find('tr').length;
  const first3Rows: string[][] = [];
  table.find('tr').slice(0, 3).each((_, row) => {
    const cells = $(row).find('td, th');
    const rowData: string[] = [];
    cells.slice(0, 5).each((_, cell) => {
      rowData.push($(cell).text().trim().substring(0, 50));
    });
    first3Rows.push(rowData);
  });
  warnings.push(`[Overview] Selected table - ${rowCount} rows, first 3 rows sample: ${JSON.stringify(first3Rows)}`);
  
  // getTable1ColumnIndices 사용
  const colIndices = getTable1ColumnIndices($, table);
  const { valueCol, weeklyCol, yearlyCol } = colIndices;
  
  // 로깅: 컬럼 인덱스 결정 과정
  if (valueCol >= 0 && weeklyCol >= 0 && yearlyCol >= 0) {
    warnings.push(`[Overview] Column indices found - valueCol: ${valueCol}, weeklyCol: ${weeklyCol}, yearlyCol: ${yearlyCol}`);
  } else {
    // 실패 시 상세 정보 로깅
    const headerRows = table.find('tr').slice(0, 3);
    const headerInfo = Array.from(headerRows).map((row, idx) => {
      const cells = $(row).find('td, th');
      return Array.from(cells).slice(0, 6).map((cell, cellIdx) => ({
        row: idx,
        col: cellIdx,
        text: $(cell).text().trim().substring(0, 60),
        colspan: $(cell).attr('colspan') || '1',
      }));
    });
    warnings.push(`[Overview] Column indices FAILED - valueCol: ${valueCol}, weeklyCol: ${weeklyCol}, yearlyCol: ${yearlyCol}`);
    warnings.push(`[Overview] Header structure: ${JSON.stringify(headerInfo).substring(0, 400)}`);
  }
  
  // 컬럼 인덱스가 하나라도 -1이면 실패
  if (valueCol < 0 || weeklyCol < 0 || yearlyCol < 0) {
    warnings.push(`[Overview] Cannot proceed - missing column indices`);
    return createEmptyOverview();
  }
  
  const actualValueCol = valueCol;
  const actualWeeklyCol = weeklyCol;
  const actualYearlyCol = yearlyCol;
  
  // 각 항목 파싱 (라벨 후보 확장)
  const totalAssets = extractValue(table, $, [
    'Total factors supplying reserve funds',
    'Total factors supplying',
    'Total supplying'
  ], actualValueCol, warnings);
  const securities = extractValue(table, $, [
    'Securities held outright',
    'Securities held',
    'Securities'
  ], actualValueCol, warnings);
  const reserveBalances = extractValue(table, $, [
    'Reserve balances with Federal Reserve Banks',
    'Reserve balances',
    'Reserves'
  ], actualValueCol, warnings);
  const tga = extractValue(table, $, [
    'U.S. Treasury, General Account',
    'Treasury General Account',
    'Treasury, General Account',
    'TGA'
  ], actualValueCol, warnings);
  const reverseRepos = extractValue(table, $, [
    'Reverse repurchase agreements',
    'Reverse repos',
    'Reverse repurchase'
  ], actualValueCol, warnings);
  const currency = extractValue(table, $, [
    'Currency in circulation',
    'Currency',
    'Federal Reserve notes'
  ], actualValueCol, warnings);
  
  const totalAssetsWeekly = extractValue(table, $, [
    'Total factors supplying reserve funds',
    'Total factors supplying'
  ], actualWeeklyCol, warnings);
  const totalAssetsYearly = extractValue(table, $, [
    'Total factors supplying reserve funds',
    'Total factors supplying'
  ], actualYearlyCol, warnings);
  const securitiesWeekly = extractValue(table, $, [
    'Securities held outright',
    'Securities held'
  ], actualWeeklyCol, warnings);
  const securitiesYearly = extractValue(table, $, [
    'Securities held outright',
    'Securities held'
  ], actualYearlyCol, warnings);
  const reserveBalancesWeekly = extractValue(table, $, [
    'Reserve balances with Federal Reserve Banks',
    'Reserve balances',
    'Reserves'
  ], actualWeeklyCol, warnings);
  const reserveBalancesYearly = extractValue(table, $, [
    'Reserve balances with Federal Reserve Banks',
    'Reserve balances',
    'Reserves'
  ], actualYearlyCol, warnings);
  const tgaWeekly = extractValue(table, $, [
    'U.S. Treasury, General Account',
    'Treasury General Account',
    'TGA'
  ], actualWeeklyCol, warnings);
  const tgaYearly = extractValue(table, $, [
    'U.S. Treasury, General Account',
    'Treasury General Account',
    'TGA'
  ], actualYearlyCol, warnings);
  const reverseReposWeekly = extractValue(table, $, [
    'Reverse repurchase agreements',
    'Reverse repos'
  ], actualWeeklyCol, warnings);
  const reverseReposYearly = extractValue(table, $, [
    'Reverse repurchase agreements',
    'Reverse repos'
  ], actualYearlyCol, warnings);
  const currencyWeekly = extractValue(table, $, [
    'Currency in circulation',
    'Currency'
  ], actualWeeklyCol, warnings);
  const currencyYearly = extractValue(table, $, [
    'Currency in circulation',
    'Currency'
  ], actualYearlyCol, warnings);
  
  // "5. Consolidated Statement" 섹션에서 자산 구성 파싱
  const statementSection = findSection($, [
    'Consolidated Statement of Condition',
    'Table 5',
    'Consolidated Statement',
  ]);
  
  let totalAssetsForComposition: number | null = null;
  let treasurySecurities: number | null = null;
  let mortgageBackedSecurities: number | null = null;
  let otherAssets: number | null = null;
  
  if (statementSection && statementSection.length > 0) {
    const statementTable = findFirstTableNearSection($, statementSection, ['Consolidated Statement', 'Assets', 'Liabilities', 'Table 5']);
    if (statementTable && statementTable.length > 0) {
      // Table 5의 구조: "Wednesday Jan 7, 2026 | Change since Wednesday Dec 31, 2025 | Change since Wednesday Jan 8, 2025"
      const assetsValueCol = findColumnIndex($, statementTable, [
        'Wednesday',  // 우선순위 1: "Wednesday Jan 7, 2026"
        'Week ended',  // 우선순위 2
        'Assets',  // 우선순위 3
        'Level',
        'Averages of daily figures'
      ]);
      
      if (process.env.NODE_ENV === 'development') {
        warnings.push(`[Overview] Statement table assetsValueCol: ${assetsValueCol}`);
      }
      
      totalAssetsForComposition = extractValue(statementTable, $, [
        'Total assets',
        'Total'
      ], assetsValueCol, warnings);
      treasurySecurities = extractValue(statementTable, $, [
        'U.S. Treasury securities',
        'U.S. Treasury',
        'Treasury securities',
        'Treasury'
      ], assetsValueCol, warnings);
      mortgageBackedSecurities = extractValue(statementTable, $, [
        'Mortgage-backed securities',
        'Mortgage backed securities',
        'MBS'
      ], assetsValueCol, warnings);
      
      // Other assets는 직접 찾기 어려울 수 있으므로 계산
      if (totalAssetsForComposition !== null && treasurySecurities !== null && mortgageBackedSecurities !== null) {
        // Other assets = Total - Treasury - MBS - 기타 알려진 자산들
        // 또는 직접 찾기 시도
        otherAssets = extractValue(statementTable, $, [
          'Other assets',
          'Other',
          'Other assets (including unamortized premiums and discounts)',
          'Other Federal Reserve assets'
        ], assetsValueCol, warnings);
        
        // 찾지 못하면 계산
        if (otherAssets === null) {
          // 대략적인 계산 (정확하지 않을 수 있음)
          const knownAssets = (treasurySecurities || 0) + (mortgageBackedSecurities || 0);
          otherAssets = totalAssetsForComposition - knownAssets;
          if (otherAssets < 0) otherAssets = null;
        }
      } else {
        otherAssets = extractValue(statementTable, $, [
          'Other assets',
          'Other',
          'Other assets (including unamortized premiums and discounts)',
          'Other Federal Reserve assets'
        ], assetsValueCol, warnings);
      }
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
  // "1. Factors Affecting Reserve Balances" 섹션 찾기
  let factorsSection = findSection($, [
    'Factors Affecting Reserve Balances',
    'Table 1',
    'Factors affecting reserve balances',
  ]);
  
  // findSection이 실패하면 body 전체로 scope 확장
  if (!factorsSection || factorsSection.length === 0) {
    warnings.push('[Factors] Section not found, using body as scope');
    factorsSection = $('body');
  }
  
  // Table 1을 정확히 선택 (pickH41Table 사용, overview와 동일한 테이블)
  let table = pickH41Table($, factorsSection, [
    'Reserve Bank credit',
    'Total factors supplying reserve funds',
    'Currency in circulation',
    'U.S. Treasury, General Account',
  ], warnings);
  
  // pickH41Table이 실패하면 body 전체에서 직접 찾기
  if (!table || table.length === 0) {
    warnings.push('[Factors] Table 1 not found in section, trying body-wide search');
    table = pickH41Table($, $('body'), [
      'Reserve Bank credit',
      'Total factors supplying reserve funds',
      'Currency in circulation',
      'U.S. Treasury, General Account',
    ], warnings);
  }
  
  // 그래도 실패하면 findFirstTableNearSection으로 폴백
  if (!table || table.length === 0) {
    warnings.push('[Factors] Table 1 not found using pickH41Table, trying findFirstTableNearSection');
    table = findFirstTableNearSection($, factorsSection, ['Factors Affecting Reserve Balances', 'Table 1']);
    if (!table || table.length === 0) {
      warnings.push('[Factors] Table 1 not found using fallback method');
      return createEmptyFactors();
    }
  }
  
  // 선택된 테이블이 최소 행 수를 만족하는지 확인
  const tableRowCount = table.find('tr').length;
  if (tableRowCount < 5) {
    warnings.push(`[Factors] Selected table has only ${tableRowCount} rows, too few for data table`);
    return createEmptyFactors();
  }
  
  // 로깅: 선택된 테이블 정보
  const rowCount = table.find('tr').length;
  warnings.push(`[Factors] Selected table - ${rowCount} rows`);
  
  // getTable1ColumnIndices 사용
  const colIndices = getTable1ColumnIndices($, table);
  const { valueCol, weeklyCol, yearlyCol } = colIndices;
  
  // 로깅: 컬럼 인덱스 결정 과정
  if (valueCol >= 0 && weeklyCol >= 0 && yearlyCol >= 0) {
    warnings.push(`[Factors] Column indices found - valueCol: ${valueCol}, weeklyCol: ${weeklyCol}, yearlyCol: ${yearlyCol}`);
  } else {
    warnings.push(`[Factors] Column indices FAILED - valueCol: ${valueCol}, weeklyCol: ${weeklyCol}, yearlyCol: ${yearlyCol}`);
  }
  
  // 컬럼 인덱스가 하나라도 -1이면 실패
  if (valueCol < 0 || weeklyCol < 0 || yearlyCol < 0) {
    warnings.push(`[Factors] Cannot proceed - missing column indices`);
    return createEmptyFactors();
  }
  
  const actualValueCol = valueCol;
  const actualWeeklyCol = weeklyCol;
  const actualYearlyCol = yearlyCol;
  
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
    { label: 'Bank Term Funding Program', labelKo: '은행기간대출', value: null, weekly: null, yearly: null },
    { label: 'Central bank liquidity swaps', labelKo: '통화스왑', value: null, weekly: null, yearly: null },
    { label: 'Gold stock', labelKo: '금', value: null, weekly: null, yearly: null },
    { label: 'Special drawing rights certificate account', labelKo: 'SDR 증서', value: null, weekly: null, yearly: null },
  ];
  
  // 각 항목에 대한 라벨 후보 확장 (더 정확한 매칭을 위해)
  const labelCandidates: Record<string, string[]> = {
    'Reserve Bank credit': ['Reserve Bank credit', 'Reserve bank credit'],
    'Securities held outright': ['Securities held outright', 'Securities held'],
    'U.S. Treasury securities': ['U.S. Treasury securities', 'U.S. Treasury', 'Treasury securities'],
    'Bills': ['Bills', 'Treasury bills'],
    'Notes and bonds, nominal': ['Notes and bonds, nominal', 'Notes and bonds nominal', 'Nominal notes and bonds'],
    'Notes and bonds, inflation-indexed': ['Notes and bonds, inflation-indexed', 'Notes and bonds inflation-indexed', 'Inflation-indexed notes and bonds', 'TIPS'],
    'Mortgage-backed securities': ['Mortgage-backed securities', 'Mortgage backed securities', 'MBS'],
    'Repurchase agreements': ['Repurchase agreements', 'Repos'],
    'Loans': ['Loans', 'Total loans'],
    'Bank Term Funding Program': ['Bank Term Funding Program', 'BTFP', 'Bank term funding program'],
    'Central bank liquidity swaps': ['Central bank liquidity swaps', 'Central bank swaps', 'Liquidity swaps'],
    'Gold stock': ['Gold stock', 'Gold certificate account', 'Gold'],
    'Special drawing rights certificate account': ['Special drawing rights certificate account', 'SDR certificate account', 'SDR'],
  };
  
  // 통화스왑은 "6. Statement of Condition of Each Federal Reserve Bank" 섹션에서 찾기 시도
  const swapsRow = supplying.find(r => r.label === 'Central bank liquidity swaps');
  if (swapsRow) {
    // 먼저 Factors 섹션에서 찾기
    swapsRow.value = extractValue(table, $, ['Central bank liquidity swaps'], actualValueCol, warnings);
    swapsRow.weekly = extractValue(table, $, ['Central bank liquidity swaps'], actualWeeklyCol, warnings);
    swapsRow.yearly = extractValue(table, $, ['Central bank liquidity swaps'], actualYearlyCol, warnings);
    
    // Factors 섹션에서 못 찾으면 Statement 섹션에서 찾기
    if (swapsRow.value === null) {
      const statementSection = findSection($, ['Statement of Condition of Each Federal Reserve Bank', 'Table 6']);
      if (statementSection && statementSection.length > 0) {
        const statementTable = findFirstTableNearSection($, statementSection, ['Statement of Condition', 'Central bank liquidity swaps']);
        if (statementTable && statementTable.length > 0) {
          const stmtValueCol = findColumnIndex($, statementTable, ['Total', 'Wednesday', 'Level']);
          const stmtWeeklyCol = findColumnIndex($, statementTable, ['Change since', 'Change from']);
          const stmtYearlyCol = findColumnIndex($, statementTable, ['Change from year ago']);
          swapsRow.value = extractValue(statementTable, $, ['Central bank liquidity swaps'], stmtValueCol, warnings);
          swapsRow.weekly = extractValue(statementTable, $, ['Central bank liquidity swaps'], stmtWeeklyCol, warnings);
          swapsRow.yearly = extractValue(statementTable, $, ['Central bank liquidity swaps'], stmtYearlyCol, warnings);
        }
      }
    }
  }
  
  // SDR 증서는 "5. Consolidated Statement" 섹션에서 찾기
  const sdrRow = supplying.find(r => r.label === 'Special drawing rights certificate account');
  if (sdrRow) {
    // 먼저 Factors 섹션에서 찾기
    sdrRow.value = extractValue(table, $, ['Special drawing rights certificate account'], actualValueCol, warnings);
    sdrRow.weekly = extractValue(table, $, ['Special drawing rights certificate account'], actualWeeklyCol, warnings);
    sdrRow.yearly = extractValue(table, $, ['Special drawing rights certificate account'], actualYearlyCol, warnings);
    
    // Factors 섹션에서 못 찾으면 Statement 섹션에서 찾기
    if (sdrRow.value === null) {
      const statementSection = findSection($, ['Consolidated Statement of Condition', 'Table 5']);
      if (statementSection && statementSection.length > 0) {
        const statementTable = findFirstTableNearSection($, statementSection, ['Consolidated Statement', 'Assets']);
        if (statementTable && statementTable.length > 0) {
          const stmtValueCol = findColumnIndex($, statementTable, ['Assets', 'Wednesday', 'Level']);
          const stmtWeeklyCol = findColumnIndex($, statementTable, ['Change since', 'Change from']);
          const stmtYearlyCol = findColumnIndex($, statementTable, ['Change from year ago']);
          sdrRow.value = extractValue(statementTable, $, ['Special drawing rights certificate account', 'SDR certificate account', 'SDR'], stmtValueCol, warnings);
          sdrRow.weekly = extractValue(statementTable, $, ['Special drawing rights certificate account', 'SDR certificate account', 'SDR'], stmtWeeklyCol, warnings);
          sdrRow.yearly = extractValue(statementTable, $, ['Special drawing rights certificate account', 'SDR certificate account', 'SDR'], stmtYearlyCol, warnings);
        }
      }
    }
  }
  
  // 공급 요인 파싱 (라벨 후보 사용)
  for (const row of supplying) {
    const candidates = labelCandidates[row.label] || [row.label];
    row.value = extractValue(table, $, candidates, actualValueCol, warnings);
    row.weekly = extractValue(table, $, candidates, actualWeeklyCol, warnings);
    row.yearly = extractValue(table, $, candidates, actualYearlyCol, warnings);
    
    // 중첩된 항목 (Bills, Notes and bonds)은 Treasury securities 하위에서 찾기
    if (row.label === 'Bills' || row.label === 'Notes and bonds, nominal' || row.label === 'Notes and bonds, inflation-indexed') {
      if (row.value === null) {
        // Treasury securities 행을 찾아서 하위 항목 확인
        const treasuryRow = findRowByLabel($, table, ['U.S. Treasury securities', 'Treasury securities']);
        if (treasuryRow && treasuryRow.length > 0) {
          // 다음 행들을 확인 (들여쓰기된 하위 항목)
          const allRows = table.find('tr');
          let foundTreasury = false;
          for (let i = 0; i < allRows.length; i++) {
            const currentRow = $(allRows[i]);
            const firstCell = currentRow.find('td, th').first();
            const cellText = firstCell.text().trim();
            
            if (matchLabel(cellText, ['U.S. Treasury securities', 'Treasury securities'])) {
              foundTreasury = true;
              continue;
            }
            
            if (foundTreasury) {
              // 들여쓰기 확인 (공백이나 특수 문자로 시작)
              if (cellText.match(/^\s+/) || cellText.match(/^[•·\-\s]/)) {
                const matched = matchLabel(cellText, candidates);
                if (matched) {
                  const cells = currentRow.find('td, th');
                  row.value = valueCol >= 0 && cells.length > valueCol ? parseNumber($(cells[valueCol]).text()) : null;
                  row.weekly = weeklyCol >= 0 && cells.length > weeklyCol ? parseNumber($(cells[weeklyCol]).text()) : null;
                  row.yearly = yearlyCol >= 0 && cells.length > yearlyCol ? parseNumber($(cells[yearlyCol]).text()) : null;
                  break;
                }
              } else {
                // 더 이상 하위 항목이 아니면 중단
                break;
              }
            }
          }
        }
      }
    }
  }
  
  // 흡수 요인 4개
  const absorbing: FactorsRow[] = [
    { label: 'Currency in circulation', labelKo: '유통 통화', value: null, weekly: null, yearly: null },
    { label: 'Reverse repurchase agreements', labelKo: '역레포', value: null, weekly: null, yearly: null },
    { label: 'Deposits with F.R. Banks, other than reserve balances', labelKo: '연준 예치금', value: null, weekly: null, yearly: null },
    { label: 'U.S. Treasury, General Account', labelKo: '재무부 일반계정', value: null, weekly: null, yearly: null },
  ];
  
  // 흡수 요인 라벨 후보
  const absorbingLabelCandidates: Record<string, string[]> = {
    'Currency in circulation': ['Currency in circulation', 'Currency', 'Federal Reserve notes'],
    'Reverse repurchase agreements': ['Reverse repurchase agreements', 'Reverse repos', 'Reverse repurchase'],
    'Deposits with F.R. Banks, other than reserve balances': [
      'Deposits with F.R. Banks, other than reserve balances',
      'Deposits with F.R. Banks',
      'Deposits other than reserve balances',
      'Other deposits'
    ],
    'U.S. Treasury, General Account': [
      'U.S. Treasury, General Account',
      'Treasury General Account',
      'Treasury, General Account',
      'TGA',
      'U.S. Treasury General Account'
    ],
  };
  
  // 흡수 요인 파싱 (라벨 후보 사용)
  for (const row of absorbing) {
    const candidates = absorbingLabelCandidates[row.label] || [row.label];
    row.value = extractValue(table, $, candidates, actualValueCol, warnings);
    row.weekly = extractValue(table, $, candidates, actualWeeklyCol, warnings);
    row.yearly = extractValue(table, $, candidates, actualYearlyCol, warnings);
  }
  
  // 하단 합계 (원문에서 직접 파싱) - 라벨 후보 확장
  const totalSupplying = {
    value: extractValue(table, $, [
      'Total factors supplying reserve funds',
      'Total factors supplying',
      'Total supplying',
      'Total factors'
    ], actualValueCol, warnings),
    weekly: extractValue(table, $, [
      'Total factors supplying reserve funds',
      'Total factors supplying',
      'Total supplying'
    ], actualWeeklyCol, warnings),
    yearly: extractValue(table, $, [
      'Total factors supplying reserve funds',
      'Total factors supplying',
      'Total supplying'
    ], actualYearlyCol, warnings),
  };
  
  const totalAbsorbing = {
    value: extractValue(table, $, [
      'Total factors, other than reserve balances, absorbing reserve funds',
      'Total factors absorbing reserve funds',
      'Total factors absorbing',
      'Total absorbing',
      'Total factors other than reserve balances'
    ], actualValueCol, warnings),
    weekly: extractValue(table, $, [
      'Total factors, other than reserve balances, absorbing reserve funds',
      'Total factors absorbing reserve funds',
      'Total factors absorbing'
    ], actualWeeklyCol, warnings),
    yearly: extractValue(table, $, [
      'Total factors, other than reserve balances, absorbing reserve funds',
      'Total factors absorbing reserve funds',
      'Total factors absorbing'
    ], actualYearlyCol, warnings),
  };
  
  const reserveBalances = {
    value: extractValue(table, $, [
      'Reserve balances with Federal Reserve Banks',
      'Reserve balances',
      'Reserves',
      'Reserve balances at Federal Reserve Banks'
    ], actualValueCol, warnings),
    weekly: extractValue(table, $, [
      'Reserve balances with Federal Reserve Banks',
      'Reserve balances',
      'Reserves'
    ], actualWeeklyCol, warnings),
    yearly: extractValue(table, $, [
      'Reserve balances with Federal Reserve Banks',
      'Reserve balances',
      'Reserves'
    ], actualYearlyCol, warnings),
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
  
  // 컬럼 인덱스 찾기 (헤더에서) - 라벨 후보 확장
  const within15DaysCol = findColumnIndex($, table, [
    'Within 15 days',
    'within 15 days',
    '15 days',
    '15 days or less',
    '0-15 days'
  ]);
  const days16to90Col = findColumnIndex($, table, [
    '16 days to 90 days',
    '16-90 days',
    '16 to 90',
    '16-90',
    '16 days to 90'
  ]);
  const days91to1YearCol = findColumnIndex($, table, [
    '91 days to 1 year',
    '91일-1년',
    '91-365',
    '91 days to 365 days',
    '91-365 days'
  ]);
  const years1to5Col = findColumnIndex($, table, [
    'Over 1 year to 5 years',
    '1-5 years',
    '1 to 5',
    '1-5',
    'Over 1 year to 5'
  ]);
  const years5to10Col = findColumnIndex($, table, [
    'Over 5 years to 10 years',
    '5-10 years',
    '5 to 10',
    '5-10',
    'Over 5 years to 10'
  ]);
  const years10AndOverCol = findColumnIndex($, table, [
    'Over 10 years',
    '10 years and over',
    '10+',
    'Over 10',
    '10 years or more'
  ]);
  const totalCol = findColumnIndex($, table, [
    'All',
    'Total',
    'All maturities',
    'Total all maturities'
  ]);
  
  // Treasury securities 행 찾기 - 라벨 후보 확장
  const treasuryRow = findRowByLabel($, table, [
    'U.S. Treasury securities',
    'Treasury securities',
    'U.S. Treasury',
    'Treasury',
    'Treasury debt'
  ]);
  const mbsRow = findRowByLabel($, table, [
    'Mortgage-backed securities',
    'Mortgage backed securities',
    'MBS',
    'Mortgage-backed',
    'Mortgage securities'
  ]);
  
  const treasury = parseMaturityRow($, treasuryRow, table, within15DaysCol, days16to90Col, days91to1YearCol, years1to5Col, years5to10Col, years10AndOverCol, totalCol, warnings);
  const mbs = parseMaturityRow($, mbsRow, table, within15DaysCol, days16to90Col, days91to1YearCol, years1to5Col, years5to10Col, years10AndOverCol, totalCol, warnings);
  
  return { treasury, mbs };
}

/**
 * Maturity 행 파싱
 */
function parseMaturityRow(
  $: cheerio.CheerioAPI,
  row: cheerio.Cheerio<any> | null,
  table: cheerio.Cheerio<any>,
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
  let primaryCreditWeekly: number | null = null;
  let btfpWeekly: number | null = null;
  let loansTotalWeekly: number | null = null;
  let overnight: number | null = null;
  let term: number | null = null;
  
  if (factorsSection && factorsSection.length > 0) {
    const table = findFirstTableNearSection($, factorsSection, ['Loans', 'Primary credit', 'BTFP']);
    if (table && table.length > 0) {
      const valueCol = findColumnIndex($, table, ['Week ended', 'Wednesday', 'Level', 'Averages of daily figures']);
      const weeklyCol = findColumnIndex($, table, ['Change from week ended', 'Change from previous week', 'Change since']);
      
      // Loans 항목 파싱 (라벨 후보 확장)
      primaryCredit = extractValue(table, $, [
        'Loans - Primary credit',
        'Primary credit',
        'Loans Primary credit',
        'Primary credit loans'
      ], valueCol, warnings);
      primaryCreditWeekly = extractValue(table, $, [
        'Loans - Primary credit',
        'Primary credit',
        'Loans Primary credit'
      ], weeklyCol, warnings);
      
      btfp = extractValue(table, $, [
        'Loans - Bank Term Funding Program',
        'Bank Term Funding Program',
        'BTFP',
        'Loans BTFP'
      ], valueCol, warnings);
      btfpWeekly = extractValue(table, $, [
        'Loans - Bank Term Funding Program',
        'Bank Term Funding Program',
        'BTFP'
      ], weeklyCol, warnings);
      
      loansTotal = extractValue(table, $, [
        'Loans',
        'Total loans',
        'Loans total'
      ], valueCol, warnings);
      loansTotalWeekly = extractValue(table, $, [
        'Loans',
        'Total loans'
      ], weeklyCol, warnings);
    }
  }
  
  if (memoSection && memoSection.length > 0) {
    const table = findFirstTableNearSection($, memoSection, ['Memorandum Items', 'Securities lent', 'Overnight', 'Term']);
    if (table && table.length > 0) {
      const valueCol = findColumnIndex($, table, ['Week ended', 'Level', 'Wednesday', 'Averages of daily figures']);
      overnight = extractValue(table, $, [
        'Securities lent to dealers - Overnight facility',
        'Overnight facility',
        'Securities lent Overnight',
        'Overnight'
      ], valueCol, warnings);
      // 기간물은 찾기 어려울 수 있으므로 여러 후보 시도
      term = extractValue(table, $, [
        'Securities lent to dealers - Term facility',
        'Term facility',
        'Securities lent Term',
        'Term'
      ], valueCol, warnings);
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
  
  // 자산 항목 라벨 후보
  const assetsLabels = {
    gold: ['Gold certificate account', 'Gold stock', 'Gold'],
    sdr: ['Special drawing rights certificate account', 'SDR certificate account', 'SDR'],
    securities: ['Securities held outright', 'Securities held', 'Securities'],
    repos: ['Repurchase agreements', 'Repos', 'Repurchase'],
    loans: ['Loans', 'Total loans'],
    swaps: ['Central bank liquidity swaps', 'Central bank swaps', 'Liquidity swaps', 'Swaps'],
    total: ['Total assets', 'Total'],
  };
  
  // 부채 항목 라벨 후보
  const liabilitiesLabels = {
    currency: ['Federal Reserve notes', 'Currency in circulation', 'Currency', 'F.R. notes'],
    reverseRepos: ['Reverse repurchase agreements', 'Reverse repos', 'Reverse repurchase'],
    deposits: [
      'Deposits with F.R. Banks, other than reserve balances',
      'Deposits with F.R. Banks',
      'Deposits other than reserve balances',
      'Deposits',
      'Other deposits'
    ],
    reserveBalances: [
      'Reserve balances with Federal Reserve Banks',
      'Reserve balances',
      'Reserves',
      'Reserve balances at Federal Reserve Banks'
    ],
    tga: [
      'U.S. Treasury, General Account',
      'Treasury General Account',
      'Treasury, General Account',
      'TGA',
      'U.S. Treasury General Account',
      'Treasury'
    ],
    total: ['Total liabilities', 'Total'],
  };
  
  return {
    assets: {
      gold: extractValue(table, $, assetsLabels.gold, assetsValueCol, warnings),
      sdr: extractValue(table, $, assetsLabels.sdr, assetsValueCol, warnings),
      securities: extractValue(table, $, assetsLabels.securities, assetsValueCol, warnings),
      repos: extractValue(table, $, assetsLabels.repos, assetsValueCol, warnings),
      loans: extractValue(table, $, assetsLabels.loans, assetsValueCol, warnings),
      swaps: extractValue(table, $, assetsLabels.swaps, assetsValueCol, warnings),
      total: extractValue(table, $, assetsLabels.total, assetsValueCol, warnings),
      // 주간/연간 변동
      goldWeekly: extractValue(table, $, assetsLabels.gold, assetsWeeklyCol, warnings),
      goldYearly: extractValue(table, $, assetsLabels.gold, assetsYearlyCol, warnings),
      sdrWeekly: extractValue(table, $, assetsLabels.sdr, assetsWeeklyCol, warnings),
      sdrYearly: extractValue(table, $, assetsLabels.sdr, assetsYearlyCol, warnings),
      securitiesWeekly: extractValue(table, $, assetsLabels.securities, assetsWeeklyCol, warnings),
      securitiesYearly: extractValue(table, $, assetsLabels.securities, assetsYearlyCol, warnings),
      reposWeekly: extractValue(table, $, assetsLabels.repos, assetsWeeklyCol, warnings),
      reposYearly: extractValue(table, $, assetsLabels.repos, assetsYearlyCol, warnings),
      loansWeekly: extractValue(table, $, assetsLabels.loans, assetsWeeklyCol, warnings),
      loansYearly: extractValue(table, $, assetsLabels.loans, assetsYearlyCol, warnings),
      swapsWeekly: extractValue(table, $, assetsLabels.swaps, assetsWeeklyCol, warnings),
      swapsYearly: extractValue(table, $, assetsLabels.swaps, assetsYearlyCol, warnings),
      totalWeekly: extractValue(table, $, assetsLabels.total, assetsWeeklyCol, warnings),
      totalYearly: extractValue(table, $, assetsLabels.total, assetsYearlyCol, warnings),
    },
    liabilities: {
      currency: extractValue(table, $, liabilitiesLabels.currency, liabilitiesValueCol, warnings),
      reverseRepos: extractValue(table, $, liabilitiesLabels.reverseRepos, liabilitiesValueCol, warnings),
      deposits: extractValue(table, $, liabilitiesLabels.deposits, liabilitiesValueCol, warnings),
      reserveBalances: extractValue(table, $, liabilitiesLabels.reserveBalances, liabilitiesValueCol, warnings),
      tga: extractValue(table, $, liabilitiesLabels.tga, liabilitiesValueCol, warnings),
      total: extractValue(table, $, liabilitiesLabels.total, liabilitiesValueCol, warnings),
      // 주간/연간 변동
      currencyWeekly: extractValue(table, $, liabilitiesLabels.currency, liabilitiesWeeklyCol, warnings),
      currencyYearly: extractValue(table, $, liabilitiesLabels.currency, liabilitiesYearlyCol, warnings),
      reverseReposWeekly: extractValue(table, $, liabilitiesLabels.reverseRepos, liabilitiesWeeklyCol, warnings),
      reverseReposYearly: extractValue(table, $, liabilitiesLabels.reverseRepos, liabilitiesYearlyCol, warnings),
      depositsWeekly: extractValue(table, $, liabilitiesLabels.deposits, liabilitiesWeeklyCol, warnings),
      depositsYearly: extractValue(table, $, liabilitiesLabels.deposits, liabilitiesYearlyCol, warnings),
      reserveBalancesWeekly: extractValue(table, $, liabilitiesLabels.reserveBalances, liabilitiesWeeklyCol, warnings),
      reserveBalancesYearly: extractValue(table, $, liabilitiesLabels.reserveBalances, liabilitiesYearlyCol, warnings),
      tgaWeekly: extractValue(table, $, liabilitiesLabels.tga, liabilitiesWeeklyCol, warnings),
      tgaYearly: extractValue(table, $, liabilitiesLabels.tga, liabilitiesYearlyCol, warnings),
      totalWeekly: extractValue(table, $, liabilitiesLabels.total, liabilitiesWeeklyCol, warnings),
      totalYearly: extractValue(table, $, liabilitiesLabels.total, liabilitiesYearlyCol, warnings),
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
 * 테이블에서 값 추출 헬퍼 (개선된 버전)
 */
function extractValue(
  table: cheerio.Cheerio<any>,
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
  
  // 먼저 정확한 라벨로 찾기 시도
  let row = findRowByLabel($, table, expandedCandidates);
  
  // 찾지 못한 경우, 더 유연한 검색 시도
  if (!row || row.length === 0) {
    const allRows = table.find('tr');
    for (let i = 0; i < allRows.length; i++) {
      const currentRow = $(allRows[i]);
      const firstCell = currentRow.find('td, th').first();
      const cellText = firstCell.text().trim();
      
      // 각 라벨 후보와 비교 (부분 일치 포함)
      for (const candidate of labelCandidates) {
        const normalizedCandidate = normalizeLabel(candidate);
        const normalizedCell = normalizeLabel(cellText);
        
        // 완전 일치 또는 주요 키워드가 모두 포함되는지 확인
        if (normalizedCell === normalizedCandidate || 
            normalizedCell.includes(normalizedCandidate) ||
            normalizedCandidate.split(/\s+/).filter(w => w.length > 3).every(kw => normalizedCell.includes(kw))) {
          row = currentRow;
          break;
        }
      }
      if (row && row.length > 0) break;
    }
  }
  
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
      warnings.push(`Column index ${columnIndex} out of range for row: ${labelCandidates[0]} (found ${cells.length} cells)`);
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
