/**
 * H.4.1 HTML 파싱 핵심 유틸리티
 * - 라벨 매칭 (후보 라벨 지원)
 * - 숫자 파싱
 * - 섹션 찾기
 */

import * as cheerio from 'cheerio';

/**
 * 숫자 파싱 (쉼표, 부호, 공백 처리)
 */
export function parseNumber(text: string | null | undefined): number | null {
  if (!text) return null;
  
  // non-breaking space를 일반 공백으로 변환
  const cleaned = text.replace(/\u00a0/g, ' ').trim();
  if (!cleaned) return null;
  
  // 부호(+/-) 보존, 콤마 제거
  const m = cleaned.match(/^([+-])?\s*([\d,]+(?:\.[\d]+)?)$/);
  if (!m) return null;
  
  const sign = m[1] === '-' ? -1 : 1;
  const n = Number(m[2].replace(/,/g, ''));
  if (!Number.isFinite(n)) return null;
  
  return sign * n;
}

/**
 * 라벨 정규화 (매칭을 위한 전처리)
 */
export function normalizeLabel(label: string): string {
  return label
    .replace(/\u00a0/g, ' ') // non-breaking space
    .replace(/[()]/g, ' ') // 괄호 제거
    .replace(/\./g, ' ') // 마침표 제거
    .replace(/&/g, 'and') // &를 and로 변환
    .replace(/,/g, ' ') // 쉼표 제거
    .replace(/\s+/g, ' ') // 연속 공백을 하나로
    .toLowerCase()
    .trim();
}

/**
 * 라벨 매칭 (후보 라벨 지원)
 * @param text 검색할 텍스트
 * @param candidates 후보 라벨 배열 (우선순위 순)
 * @returns 매칭된 라벨 또는 null
 */
export function matchLabel(
  text: string,
  candidates: string[]
): string | null {
  const normalized = normalizeLabel(text);
  
  for (const candidate of candidates) {
    const normalizedCandidate = normalizeLabel(candidate);
    
    // 완전 일치
    if (normalized === normalizedCandidate) {
      return candidate;
    }
    
    // 부분 일치 (키워드 기반)
    const candidateKeywords = normalizedCandidate.split(/\s+/).filter(k => k.length > 2);
    if (candidateKeywords.length > 0 && candidateKeywords.every(kw => normalized.includes(kw))) {
      return candidate;
    }
  }
  
  return null;
}

/**
 * 테이블 행에서 값 추출
 * @param $ cheerio 인스턴스
 * @param row 테이블 행 요소
 * @param labelColumnIndex 라벨이 있는 컬럼 인덱스
 * @param valueColumnIndex 값이 있는 컬럼 인덱스
 * @returns 파싱된 숫자 또는 null
 */
export function extractValueFromRow(
  $: cheerio.CheerioAPI,
  row: cheerio.Element,
  labelColumnIndex: number,
  valueColumnIndex: number
): number | null {
  const cells = $(row).find('td, th');
  if (cells.length <= Math.max(labelColumnIndex, valueColumnIndex)) {
    return null;
  }
  
  const valueText = $(cells[valueColumnIndex]).text().trim();
  return parseNumber(valueText);
}

/**
 * 섹션 찾기 (헤더 텍스트로)
 * @param $ cheerio 인스턴스
 * @param sectionKeywords 섹션 헤더 키워드 배열
 * @returns 섹션 요소 또는 null
 */
export function findSection(
  $: cheerio.CheerioAPI,
  sectionKeywords: string[]
): cheerio.Cheerio<cheerio.Element> | null {
  const body = $('body');
  const bodyText = body.text();
  
  for (const keyword of sectionKeywords) {
    // 전체 텍스트에서 키워드 위치 찾기
    if (!bodyText.includes(keyword)) {
      continue;
    }
    
    // 모든 요소를 순회하며 키워드 포함 요소 찾기
    const allElements = body.find('*');
    let foundElement: cheerio.Element | null = null;
    
    for (let i = 0; i < allElements.length; i++) {
      const el = allElements[i];
      const text = $(el).text();
      
      // 키워드가 포함된 경우
      if (text.includes(keyword)) {
        // 가장 작은 요소 (가장 구체적인 매칭) 선택
        if (!foundElement || $(el).children().length < $(foundElement).children().length) {
          foundElement = el;
        }
      }
    }
    
    if (foundElement) {
      // 테이블을 포함한 부모 요소 찾기
      let section = $(foundElement).closest('table');
      if (section.length === 0) {
        section = $(foundElement).closest('div, section');
      }
      if (section.length === 0) {
        section = $(foundElement).parent();
      }
      
      if (section.length > 0 && section[0] !== body[0]) {
        return section;
      }
    }
  }
  
  return null;
}

/**
 * 섹션 근처에서 첫 번째 테이블 찾기
 * @param $ cheerio 인스턴스
 * @param sectionRoot 섹션 루트 요소
 * @returns 테이블 요소 또는 null
 */
export function findFirstTableNearSection(
  $: cheerio.CheerioAPI,
  sectionRoot: cheerio.Cheerio<cheerio.Element>
): cheerio.Cheerio<cheerio.Element> | null {
  if (sectionRoot.length === 0) {
    return null;
  }
  
  // 1. sectionRoot 내부에 table이 있으면 첫 번째 반환
  const innerTable = sectionRoot.find('table').first();
  if (innerTable.length > 0) {
    return innerTable;
  }
  
  // 2. sectionRoot의 다음 형제(nextAll)를 순회하면서 table 찾기
  const nextSiblings = sectionRoot.nextAll();
  let searched = 0;
  const maxSearch = 12;
  
  for (let i = 0; i < nextSiblings.length && searched < maxSearch; i++) {
    const sibling = nextSiblings.eq(i);
    searched++;
    
    // heading을 만나면 중단 (다음 섹션으로 넘어감)
    const tagName = sibling.prop('tagName')?.toLowerCase();
    if (tagName && ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tagName)) {
      const headingText = sibling.text().trim();
      if (headingText.length > 0) {
        break;
      }
    }
    
    // 테이블 찾기
    const table = sibling.find('table').first();
    if (table.length > 0) {
      return table;
    }
    
    // 형제 자체가 테이블인 경우
    if (tagName === 'table') {
      return sibling;
    }
  }
  
  // 3. sectionRoot의 부모에서 table descendant 탐색
  const parent = sectionRoot.parent();
  if (parent.length > 0) {
    const parentTable = parent.find('table').first();
    if (parentTable.length > 0) {
      return parentTable;
    }
  }
  
  // 4. sectionRoot의 이전 형제(prevAll)도 확인 (표가 위에 있을 수 있음)
  const prevSiblings = sectionRoot.prevAll();
  searched = 0;
  
  for (let i = 0; i < prevSiblings.length && searched < maxSearch; i++) {
    const sibling = prevSiblings.eq(i);
    searched++;
    
    const table = sibling.find('table').first();
    if (table.length > 0) {
      return table;
    }
    
    const tagName = sibling.prop('tagName')?.toLowerCase();
    if (tagName === 'table') {
      return sibling;
    }
  }
  
  return null;
}

/**
 * 테이블에서 라벨로 행 찾기
 * @param $ cheerio 인스턴스
 * @param table 테이블 요소
 * @param labelCandidates 라벨 후보 배열
 * @returns 매칭된 행 요소 또는 null
 */
export function findRowByLabel(
  $: cheerio.CheerioAPI,
  table: cheerio.Cheerio<cheerio.Element>,
  labelCandidates: string[]
): cheerio.Cheerio<cheerio.Element> | null {
  const rows = table.find('tr');
  
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const firstCell = $(row).find('td, th').first();
    const cellText = firstCell.text().trim();
    
    const matched = matchLabel(cellText, labelCandidates);
    if (matched) {
      return $(row);
    }
  }
  
  return null;
}

/**
 * 테이블 헤더에서 컬럼 인덱스 찾기
 * @param $ cheerio 인스턴스
 * @param table 테이블 요소
 * @param headerKeywords 헤더 키워드 배열
 * @returns 컬럼 인덱스 또는 -1
 */
export function findColumnIndex(
  $: cheerio.CheerioAPI,
  table: cheerio.Cheerio<cheerio.Element>,
  headerKeywords: string[]
): number {
  const headerRows = table.find('tr').slice(0, 3); // 처음 3개 행을 헤더 후보로 검색
  
  for (let rowIdx = 0; rowIdx < headerRows.length; rowIdx++) {
    const row = headerRows[rowIdx];
    const cells = $(row).find('td, th');
    
    for (let colIdx = 0; colIdx < cells.length; colIdx++) {
      const cellText = $(cells[colIdx]).text().trim();
      const normalized = normalizeLabel(cellText);
      
      for (const keyword of headerKeywords) {
        const normalizedKeyword = normalizeLabel(keyword);
        if (normalized.includes(normalizedKeyword)) {
          return colIdx;
        }
      }
    }
  }
  
  return -1;
}

/**
 * 날짜 파싱 (ISO 형식으로 변환)
 */
export function parseDateToISO(dateText: string): string | null {
  if (!dateText) return null;
  
  // "Jan 7, 2026" 형식 파싱
  const match = dateText.match(/([A-Z][a-z]{2,})\s+(\d{1,2}),\s+(\d{4})/);
  if (!match) return null;
  
  const monthNames: Record<string, string> = {
    'Jan': '01', 'Feb': '02', 'Mar': '03', 'Apr': '04',
    'May': '05', 'Jun': '06', 'Jul': '07', 'Aug': '08',
    'Sep': '09', 'Oct': '10', 'Nov': '11', 'Dec': '12',
  };
  
  const month = monthNames[match[1]];
  if (!month) return null;
  
  const day = String(match[2]).padStart(2, '0');
  const year = match[3];
  
  return `${year}-${month}-${day}`;
}

/**
 * 날짜 형식 변환 (YYYY-MM-DD -> YYYYMMDD)
 */
export function formatDateForURL(date: string): string {
  return date.replace(/-/g, '');
}

/**
 * 날짜 형식 변환 (YYYYMMDD -> YYYY-MM-DD)
 */
export function formatDateFromURL(dateStr: string): string {
  if (dateStr.length !== 8) {
    throw new Error(`Invalid date format: ${dateStr}. Expected YYYYMMDD.`);
  }
  return `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;
}
