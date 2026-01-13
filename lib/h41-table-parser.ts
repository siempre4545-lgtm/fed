/**
 * H.4.1 PDF/HTML에서 특정 테이블 파싱 유틸리티
 * 만기분포, 대출/증권대출, 재무제표, 지역 연준, 연방 준비권 파싱
 */

import * as cheerio from 'cheerio';

export interface MaturityRow {
  label: string; // "Treasury" or "MBS"
  buckets: {
    '15일↓': number;
    '16-90일': number;
    '91일-1년': number;
    '1-5년': number;
    '5-10년': number;
    '10년↑': number;
  };
  total: number;
}

export interface LoansRow {
  label: string;
  value: number;
  change: number;
}

export interface SecuritiesLendingRow {
  label: string;
  value: number;
  change: number;
  description?: string;
}

export interface ConsolidatedRow {
  label: string;
  value: number;
  weeklyChange: number;
  yearlyChange: number;
}

export interface RegionalFedRow {
  bank: string;
  assets: Record<string, number>;
  liabilities: Record<string, number>;
  totalAssets: number;
}

export interface FRNotesRow {
  bank: string;
  issueAmount: number;
  collateral: number;
  goldCertificate: number;
}

/**
 * 만기분포 파싱 (Table 2)
 */
export function parseMaturityDistribution(text: string): MaturityRow[] {
  const rows: MaturityRow[] = [];
  
  // "Maturity Distribution" 섹션 찾기
  const maturityStart = text.indexOf('Maturity Distribution');
  if (maturityStart === -1) return rows;
  
  const maturityEnd = text.indexOf('Table 3', maturityStart);
  const maturityText = maturityEnd !== -1
    ? text.substring(maturityStart, maturityEnd)
    : text.substring(maturityStart);
  
  const lines = maturityText.split('\n').map(l => l.trim()).filter(Boolean);
  
  // Treasury와 MBS 행 찾기
  let treasuryRow: MaturityRow | null = null;
  let mbsRow: MaturityRow | null = null;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].toLowerCase();
    
    // Treasury 행 찾기
    if ((line.includes('treasury') || line.includes('u.s. treasury')) && !treasuryRow) {
      treasuryRow = extractMaturityRow(lines, i, '미 국채');
    }
    
    // MBS 행 찾기
    if ((line.includes('mbs') || line.includes('mortgage-backed')) && !mbsRow) {
      mbsRow = extractMaturityRow(lines, i, 'MBS');
    }
  }
  
  if (treasuryRow) rows.push(treasuryRow);
  if (mbsRow) rows.push(mbsRow);
  
  return rows;
}

function extractMaturityRow(lines: string[], startIdx: number, label: string): MaturityRow {
  const buckets: MaturityRow['buckets'] = {
    '15일↓': 0,
    '16-90일': 0,
    '91일-1년': 0,
    '1-5년': 0,
    '5-10년': 0,
    '10년↑': 0,
  };
  
  // 다음 10줄 내에서 숫자 찾기
  for (let i = startIdx; i < Math.min(startIdx + 10, lines.length); i++) {
    const line = lines[i];
    const numbers = extractNumbers(line);
    
    if (numbers.length >= 6) {
      buckets['15일↓'] = numbers[0] || 0;
      buckets['16-90일'] = numbers[1] || 0;
      buckets['91일-1년'] = numbers[2] || 0;
      buckets['1-5년'] = numbers[3] || 0;
      buckets['5-10년'] = numbers[4] || 0;
      buckets['10년↑'] = numbers[5] || 0;
      break;
    }
  }
  
  const total = Object.values(buckets).reduce((sum, val) => sum + val, 0);
  
  return { label, buckets, total };
}

function extractNumbers(text: string): number[] {
  const numbers: number[] = [];
  // 콤마 포함 숫자 패턴
  const pattern = /([+-]?[\d,]+)/g;
  let match;
  
  while ((match = pattern.exec(text)) !== null) {
    const num = parseInt(match[1].replace(/,/g, ''), 10);
    if (!isNaN(num)) {
      numbers.push(num);
    }
  }
  
  return numbers;
}

/**
 * 대출 파싱
 */
export function parseLoans(text: string): LoansRow[] {
  const rows: LoansRow[] = [];
  
  // Primary Credit 찾기
  const primaryCredit = findValueAndChange(text, ['Primary credit', 'Primary Credit']);
  if (primaryCredit) {
    rows.push({
      label: '1차 신용',
      value: primaryCredit.value,
      change: primaryCredit.change,
    });
  }
  
  // BTFP 찾기
  const btfp = findValueAndChange(text, ['Bank Term Funding Program', 'BTFP']);
  if (btfp) {
    rows.push({
      label: '은행기간대출',
      value: btfp.value,
      change: btfp.change,
    });
  }
  
  // Total Loans 찾기
  const totalLoans = findValueAndChange(text, ['Total loans', 'Total Loans']);
  if (totalLoans) {
    rows.push({
      label: '대출 합계',
      value: totalLoans.value,
      change: totalLoans.change,
    });
  }
  
  return rows;
}

/**
 * 증권 대출 파싱
 */
export function parseSecuritiesLending(text: string): SecuritiesLendingRow[] {
  const rows: SecuritiesLendingRow[] = [];
  
  // Overnight 찾기
  const overnight = findValueAndChange(text, ['Overnight', 'overnight securities lending']);
  if (overnight) {
    rows.push({
      label: '익일물',
      value: overnight.value,
      change: overnight.change,
      description: '다음 영업일 만기',
    });
  }
  
  // Term 찾기
  const term = findValueAndChange(text, ['Term', 'term securities lending']);
  if (term) {
    rows.push({
      label: '기간물',
      value: term.value,
      change: term.change,
      description: '특정 기간 지정',
    });
  }
  
  return rows;
}

function findValueAndChange(text: string, labels: string[]): { value: number; change: number } | null {
  for (const label of labels) {
    const idx = text.toLowerCase().indexOf(label.toLowerCase());
    if (idx === -1) continue;
    
    // 라벨 다음 10줄 내에서 숫자 2개 찾기
    const section = text.substring(idx, idx + 500);
    const numbers = extractNumbers(section);
    
    if (numbers.length >= 2) {
      return {
        value: numbers[0],
        change: numbers[1],
      };
    }
  }
  
  return null;
}

/**
 * 재무제표 파싱 (Table 5)
 */
export function parseConsolidatedStatement(text: string): {
  assets: ConsolidatedRow[];
  liabilities: ConsolidatedRow[];
} {
  const assets: ConsolidatedRow[] = [];
  const liabilities: ConsolidatedRow[] = [];
  
  // Assets 섹션 찾기
  const assetsStart = text.toLowerCase().indexOf('assets');
  if (assetsStart !== -1) {
    const assetsSection = text.substring(assetsStart, assetsStart + 2000);
    
    // 각 자산 항목 찾기
    const assetLabels = [
      { search: ['Gold', 'gold'], label: '금' },
      { search: ['SDR', 'sdr'], label: 'SDR' },
      { search: ['Securities', 'securities held'], label: '보유 증권' },
      { search: ['Repos', 'Repurchase agreements'], label: '레포' },
      { search: ['Loans', 'Total loans'], label: '대출' },
      { search: ['Swaps', 'Central bank liquidity swaps'], label: '통화스왑' },
      { search: ['Total assets', 'Total Assets'], label: '총 자산' },
    ];
    
    for (const { search, label } of assetLabels) {
      const found = findValueAndChange(assetsSection, search);
      if (found) {
        assets.push({
          label,
          value: found.value,
          weeklyChange: found.change,
          yearlyChange: 0, // 연간 데이터는 별도 계산 필요
        });
      }
    }
  }
  
  // Liabilities 섹션 찾기
  const liabilitiesStart = text.toLowerCase().indexOf('liabilities');
  if (liabilitiesStart !== -1) {
    const liabilitiesSection = text.substring(liabilitiesStart, liabilitiesStart + 2000);
    
    // 각 부채 항목 찾기
    const liabilityLabels = [
      { search: ['F.R. Notes', 'Federal Reserve Notes'], label: '연방준비권' },
      { search: ['Reverse Repos', 'Reverse repurchase'], label: '역레포' },
      { search: ['Deposits', 'Deposits with'], label: '예금' },
      { search: ['Reserves', 'Reserve balances'], label: '지급준비금' },
      { search: ['TGA', 'Treasury, General Account'], label: 'TGA' },
      { search: ['Total liabilities', 'Total Liabilities'], label: '총 부채' },
    ];
    
    for (const { search, label } of liabilityLabels) {
      const found = findValueAndChange(liabilitiesSection, search);
      if (found) {
        liabilities.push({
          label,
          value: found.value,
          weeklyChange: found.change,
          yearlyChange: 0, // 연간 데이터는 별도 계산 필요
        });
      }
    }
  }
  
  return { assets, liabilities };
}

/**
 * 지역 연준 파싱 (Table 6)
 */
export function parseRegionalFed(text: string): RegionalFedRow[] {
  const rows: RegionalFedRow[] = [];
  
  const banks = [
    'Boston', 'New York', 'Philadelphia', 'Cleveland', 'Richmond',
    'Atlanta', 'Chicago', 'St. Louis', 'Minneapolis', 'Kansas City',
    'Dallas', 'San Francisco',
  ];
  
  for (const bank of banks) {
    const bankIdx = text.toLowerCase().indexOf(bank.toLowerCase());
    if (bankIdx === -1) continue;
    
    const section = text.substring(bankIdx, bankIdx + 1000);
    const assets: Record<string, number> = {};
    const liabilities: Record<string, number> = {};
    
    // 자산 항목 찾기
    const assetLabels = [
      'Gold Certificates', 'SDR Certificates', 'Securities Held',
      'Treasury Securities', 'MBS', 'Repurchase Agreements', 'Loans',
    ];
    
    for (const label of assetLabels) {
      const found = findValueAndChange(section, [label]);
      if (found) {
        assets[label] = found.value;
      }
    }
    
    // 부채 항목 찾기
    const liabilityLabels = [
      'F.R. Notes Outstanding', 'Reverse Repurchase', 'Deposits',
      'Capital Paid In', 'Surplus',
    ];
    
    for (const label of liabilityLabels) {
      const found = findValueAndChange(section, [label]);
      if (found) {
        liabilities[label] = found.value;
      }
    }
    
    const totalAssets = Object.values(assets).reduce((sum, val) => sum + val, 0);
    
    rows.push({
      bank,
      assets,
      liabilities,
      totalAssets,
    });
  }
  
  return rows;
}

/**
 * 연방 준비권 파싱 (Table 7)
 */
export function parseFRNotes(text: string): FRNotesRow[] {
  const rows: FRNotesRow[] = [];
  
  const banks = [
    'Boston', 'New York', 'Philadelphia', 'Cleveland', 'Richmond',
    'Atlanta', 'Chicago', 'St. Louis', 'Minneapolis', 'Kansas City',
    'Dallas', 'San Francisco',
  ];
  
  // "Federal Reserve Notes Outstanding and Collateral" 섹션 찾기
  const collateralStart = text.toLowerCase().indexOf('collateral');
  if (collateralStart === -1) return rows;
  
  const collateralSection = text.substring(collateralStart, collateralStart + 5000);
  
  for (const bank of banks) {
    const bankIdx = collateralSection.toLowerCase().indexOf(bank.toLowerCase());
    if (bankIdx === -1) continue;
    
    const section = collateralSection.substring(bankIdx, bankIdx + 500);
    const numbers = extractNumbers(section);
    
    if (numbers.length >= 3) {
      rows.push({
        bank,
        issueAmount: numbers[0] || 0,
        collateral: numbers[1] || 0,
        goldCertificate: numbers[2] || 0,
      });
    }
  }
  
  return rows;
}
