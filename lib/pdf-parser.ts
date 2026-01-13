import pdfParse from 'pdf-parse';

export interface ParsedTable {
  name: string;
  rows: Array<Record<string, string | number>>;
}

export interface ParsedH41Data {
  releaseDate: string;
  weekEnded: string;
  tables: ParsedTable[];
  rawText: string;
}

/**
 * PDF에서 텍스트 추출 및 파싱
 */
export async function parseH41PDF(pdfBuffer: Buffer): Promise<ParsedH41Data> {
  const data = await pdfParse(pdfBuffer);
  const rawText = data.text;

  // 기본 정보 추출
  const releaseDateMatch = rawText.match(/Release\s+Date[:\s]+([A-Za-z]+\s+\d{1,2},\s+\d{4})/i);
  const weekEndedMatch = rawText.match(/Week\s+ended[:\s]+([A-Za-z]+\s+\d{1,2},\s+\d{4})/i);

  const releaseDate = releaseDateMatch ? releaseDateMatch[1] : '';
  const weekEnded = weekEndedMatch ? weekEndedMatch[1] : '';

  // 테이블 파싱
  const tables: ParsedTable[] = [];

  // Table 1: Factors Affecting Reserve Balances
  const table1 = parseTable1(rawText);
  if (table1) tables.push(table1);

  // Table 2: Maturity Distribution
  const table2 = parseTable2(rawText);
  if (table2) tables.push(table2);

  // Table 5: Consolidated Statement
  const table5 = parseTable5(rawText);
  if (table5) tables.push(table5);

  // Table 6: Each FRB
  const table6 = parseTable6(rawText);
  if (table6) tables.push(table6);

  // Table 7: Collateral
  const table7 = parseTable7(rawText);
  if (table7) tables.push(table7);

  return {
    releaseDate,
    weekEnded,
    tables,
    rawText,
  };
}

/**
 * Table 1: Factors Affecting Reserve Balances 파싱
 */
function parseTable1(text: string): ParsedTable | null {
  const table1Start = text.indexOf('Factors Affecting Reserve Balances');
  if (table1Start === -1) return null;

  const table1End = text.indexOf('Table 2', table1Start);
  const table1Text = table1End !== -1 
    ? text.substring(table1Start, table1End)
    : text.substring(table1Start);

  const rows: Array<Record<string, string | number>> = [];
  
  // 라인별 파싱
  const lines = table1Text.split('\n');
  let currentRow: Record<string, string | number> = {};

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // 라벨과 숫자 추출
    const labelMatch = trimmed.match(/^([A-Za-z][^0-9]+?)(\d[\d,.\s-]+)/);
    if (labelMatch) {
      const label = labelMatch[1].trim();
      const numbers = labelMatch[2].trim().split(/\s+/);
      
      if (numbers.length >= 2) {
        currentRow = {
          label,
          weekEnded: parseNumber(numbers[0]),
          changeFromPrevWeek: parseNumber(numbers[1]),
        };
        rows.push(currentRow);
      }
    }
  }

  return rows.length > 0 ? { name: 'Factors Affecting Reserve Balances', rows } : null;
}

/**
 * Table 2: Maturity Distribution 파싱
 */
function parseTable2(text: string): ParsedTable | null {
  const table2Start = text.indexOf('Maturity Distribution');
  if (table2Start === -1) return null;

  const table2End = text.indexOf('Table 3', table2Start);
  const table2Text = table2End !== -1 
    ? text.substring(table2Start, table2End)
    : text.substring(table2Start);

  // 간단한 구현 (실제로는 더 정교한 파싱 필요)
  return { name: 'Maturity Distribution', rows: [] };
}

/**
 * Table 5: Consolidated Statement 파싱
 */
function parseTable5(text: string): ParsedTable | null {
  const table5Start = text.indexOf('Consolidated Statement');
  if (table5Start === -1) return null;

  // 간단한 구현
  return { name: 'Consolidated Statement', rows: [] };
}

/**
 * Table 6: Each FRB 파싱
 */
function parseTable6(text: string): ParsedTable | null {
  const table6Start = text.indexOf('Each Federal Reserve Bank');
  if (table6Start === -1) return null;

  // 간단한 구현
  return { name: 'Each Federal Reserve Bank', rows: [] };
}

/**
 * Table 7: Collateral 파싱
 */
function parseTable7(text: string): ParsedTable | null {
  const table7Start = text.indexOf('Collateral');
  if (table7Start === -1) return null;

  // 간단한 구현
  return { name: 'Collateral', rows: [] };
}

/**
 * 숫자 파싱 (콤마, 공백 제거)
 */
function parseNumber(str: string): number {
  const cleaned = str.replace(/[,\s]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}
