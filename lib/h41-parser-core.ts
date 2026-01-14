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
  let cleaned = text.replace(/\u00a0/g, ' ').trim();
  if (!cleaned) return null;
  
  // 각주 번호나 불필요한 텍스트 제거 (예: "Coin", "Total assets" 등)
  // 숫자가 아닌 텍스트만 있는 경우 null 반환
  const hasNumber = /\d/.test(cleaned);
  if (!hasNumber) return null;
  
  // 부호(+/-) 보존, 콤마 제거, 각주 번호 제거
  const m = cleaned.match(/^([+-])?\s*([\d,]+(?:\.[\d]+)?)/);
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
    .replace(/\d+$/g, '') // 끝에 붙은 각주 번호 제거 (예: "Securities held outright1" -> "Securities held outright")
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
  row: any,
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
): cheerio.Cheerio<any> | null {
  const body = $('body');
  const bodyText = body.text();
  
  for (const keyword of sectionKeywords) {
    // 전체 텍스트에서 키워드 위치 찾기
    if (!bodyText.includes(keyword)) {
      continue;
    }
    
    // 먼저 h1-h6, p, strong, b 태그에서 키워드 찾기 (헤더일 가능성 높음)
    const headerSelectors = 'h1, h2, h3, h4, h5, h6, p, strong, b, div[class*="title"], div[class*="header"]';
    let foundElement: any | null = null;
    
    $(headerSelectors).each((_, el) => {
      const text = $(el).text();
      if (text.includes(keyword)) {
        foundElement = el;
        return false; // break
      }
    });
    
    // 헤더에서 못 찾으면 모든 요소에서 찾기
    if (!foundElement) {
      const allElements = body.find('*');
      
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
    }
    
    if (foundElement) {
      // 테이블을 포함한 부모 요소 찾기 (더 넓은 범위로)
      let section = $(foundElement).closest('table');
      if (section.length === 0) {
        // div, section, article 등도 시도
        section = $(foundElement).closest('div, section, article, main');
      }
      if (section.length === 0) {
        // 부모 요소로
        section = $(foundElement).parent();
      }
      
      // body가 아닌 경우에만 반환
      if (section.length > 0 && section[0] !== body[0]) {
        return section;
      }
      
      // 그래도 없으면 foundElement 자체를 반환 (다음 단계에서 처리)
      return $(foundElement);
    }
  }
  
  return null;
}

/**
 * 섹션 근처에서 첫 번째 테이블 찾기
 * @param $ cheerio 인스턴스
 * @param sectionRoot 섹션 루트 요소
 * @param sectionKeywords 섹션 키워드 (테이블 찾기 실패 시 사용)
 * @returns 테이블 요소 또는 null
 */
export function findFirstTableNearSection(
  $: cheerio.CheerioAPI,
  sectionRoot: cheerio.Cheerio<any>,
  sectionKeywords?: string[]
): cheerio.Cheerio<any> | null {
  if (sectionRoot.length === 0) {
    return null;
  }
  
  // 1. sectionRoot 자체가 table인 경우
  const tagName = sectionRoot.prop('tagName')?.toLowerCase();
  if (tagName === 'table') {
    return sectionRoot;
  }
  
  // 2. sectionRoot 내부에 table이 있으면 첫 번째 반환
  const innerTable = sectionRoot.find('table').first();
  if (innerTable.length > 0) {
    return innerTable;
  }
  
  // 3. sectionRoot의 다음 형제(nextAll)를 순회하면서 table 찾기
  const nextSiblings = sectionRoot.nextAll();
  let searched = 0;
  const maxSearch = 30; // 더 많이 탐색
  
  for (let i = 0; i < nextSiblings.length && searched < maxSearch; i++) {
    const sibling = nextSiblings.eq(i);
    searched++;
    
    // heading을 만나면 중단 (다음 섹션으로 넘어감) - 단, 키워드가 포함된 경우는 계속
    const siblingTagName = sibling.prop('tagName')?.toLowerCase();
    if (siblingTagName && ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(siblingTagName)) {
      const headingText = sibling.text().trim();
      // 다른 섹션 헤더인지 확인 (일반적인 섹션 키워드 체크)
      if (headingText.length > 0 && !headingText.match(/table|factors|statement|condition|maturity|loans/i)) {
        // 다른 섹션으로 보이면 중단하지 않고 계속 (같은 섹션 내부일 수 있음)
      }
    }
    
    // 형제 자체가 테이블인 경우
    if (siblingTagName === 'table') {
      return sibling;
    }
    
    // 테이블 찾기
    const table = sibling.find('table').first();
    if (table.length > 0) {
      return table;
    }
  }
  
  // 4. sectionRoot의 부모에서 table descendant 탐색
  const parent = sectionRoot.parent();
  if (parent.length > 0) {
    const parentTable = parent.find('table').first();
    if (parentTable.length > 0) {
      return parentTable;
    }
    
    // 부모의 형제도 확인
    const parentSiblings = parent.nextAll();
    for (let i = 0; i < parentSiblings.length && i < 15; i++) {
      const sibling = parentSiblings.eq(i);
      const table = sibling.find('table').first();
      if (table.length > 0) {
        return table;
      }
      if (sibling.prop('tagName')?.toLowerCase() === 'table') {
        return sibling;
      }
    }
  }
  
  // 5. sectionRoot의 이전 형제(prevAll)도 확인 (표가 위에 있을 수 있음)
  const prevSiblings = sectionRoot.prevAll();
  searched = 0;
  
  for (let i = 0; i < prevSiblings.length && searched < maxSearch; i++) {
    const sibling = prevSiblings.eq(i);
    searched++;
    
    const table = sibling.find('table').first();
    if (table.length > 0) {
      return table;
    }
    
    const prevTagName = sibling.prop('tagName')?.toLowerCase();
    if (prevTagName === 'table') {
      return sibling;
    }
  }
  
  // 6. body 전체에서 키워드가 포함된 테이블 찾기 (최후의 수단)
  const body = $('body');
  const allTables = body.find('table');
  
  // sectionKeywords가 제공되면 사용, 없으면 sectionRoot 텍스트에서 추출
  let keywords: string[] = [];
  if (sectionKeywords && sectionKeywords.length > 0) {
    keywords = sectionKeywords.map(k => k.toLowerCase());
  } else {
    const sectionText = sectionRoot.text();
    keywords = sectionText.split(/\s+/).filter(w => w.length > 3).slice(0, 5).map(k => k.toLowerCase());
  }
  
  // 각 테이블의 텍스트를 확인하여 키워드가 포함되어 있으면 반환
  for (let i = 0; i < allTables.length; i++) {
    const table = allTables.eq(i);
    const tableText = table.text().toLowerCase();
    
    // 키워드가 테이블 텍스트에 포함되어 있으면 반환
    if (keywords.some(kw => tableText.includes(kw))) {
      return table;
    }
    
    // "Factors Affecting Reserve Balances" 같은 특정 키워드 확인
    if (tableText.includes('factors affecting') || tableText.includes('reserve balances')) {
      return table;
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
  table: cheerio.Cheerio<any>,
  labelCandidates: string[]
): cheerio.Cheerio<any> | null {
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
 * 테이블 헤더에서 컬럼 인덱스 찾기 (개선된 버전)
 * - 여러 행에 걸친 헤더 처리
 * - 날짜 패턴 인식 개선
 * - 컬럼 병합(colspan) 처리
 * @param $ cheerio 인스턴스
 * @param table 테이블 요소
 * @param headerKeywords 헤더 키워드 배열 (우선순위 순)
 * @returns 컬럼 인덱스 또는 -1
 */
export function findColumnIndex(
  $: cheerio.CheerioAPI,
  table: cheerio.Cheerio<any>,
  headerKeywords: string[]
): number {
  // 헤더 후보 행 검색 (최대 5개 행)
  const headerRows = table.find('tr').slice(0, 5);
  if (headerRows.length === 0) {
    return -1;
  }

  // 날짜 패턴 정규식 (예: "Jan 7, 2026", "Wednesday Jan 7, 2026" 등)
  const datePattern = /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},\s+\d{4}\b/i;
  const weekdayPattern = /\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)day\b/i;

  // 각 컬럼의 헤더 텍스트를 수집 (여러 행에 걸친 헤더 처리)
  const maxCols = Math.max(...Array.from(headerRows).map((row, idx) => {
    const cells = $(row).find('td, th');
    let colCount = 0;
    cells.each((_, cell) => {
      const colspan = parseInt($(cell).attr('colspan') || '1', 10);
      colCount += colspan;
    });
    return colCount;
  }));

  // 각 컬럼별로 헤더 텍스트 수집
  const columnHeaders: string[][] = [];
  for (let colIdx = 0; colIdx < maxCols; colIdx++) {
    columnHeaders[colIdx] = [];
  }

  // 각 헤더 행을 순회하며 컬럼별 텍스트 수집
  for (let rowIdx = 0; rowIdx < headerRows.length; rowIdx++) {
    const row = headerRows[rowIdx];
    const cells = $(row).find('td, th');
    let currentCol = 0;

    cells.each((_, cell) => {
      const cellText = $(cell).text().trim();
      const colspan = parseInt($(cell).attr('colspan') || '1', 10);

      // colspan만큼 컬럼에 텍스트 추가
      for (let i = 0; i < colspan && currentCol + i < maxCols; i++) {
        if (cellText) {
          columnHeaders[currentCol + i].push(cellText);
        }
      }
      currentCol += colspan;
    });
  }

  // 각 키워드에 대해 우선순위대로 매칭 시도
  for (const keyword of headerKeywords) {
    const normalizedKeyword = normalizeLabel(keyword);
    const keywordLower = keyword.toLowerCase();

    // 1. 단일 행에서 직접 매칭 (기존 로직)
    for (let rowIdx = 0; rowIdx < headerRows.length; rowIdx++) {
      const row = headerRows[rowIdx];
      const cells = $(row).find('td, th');
      let currentCol = 0;

      cells.each((_, cell) => {
        const cellText = $(cell).text().trim();
        const normalized = normalizeLabel(cellText);
        const colspan = parseInt($(cell).attr('colspan') || '1', 10);

        // 완전 일치 또는 부분 일치 확인
        if (normalized === normalizedKeyword || normalized.includes(normalizedKeyword)) {
          return currentCol;
        }

        // 날짜 패턴이 포함된 경우 (예: "Wednesday Jan 7, 2026")
        if (datePattern.test(cellText) || weekdayPattern.test(cellText)) {
          // 키워드에 날짜 관련 단어가 있으면 매칭
          if (keywordLower.includes('wednesday') || keywordLower.includes('week ended') || 
              keywordLower.includes('level') || keywordLower.includes('averages')) {
            return currentCol;
          }
        }

        currentCol += colspan;
      });
    }

    // 2. 여러 행에 걸친 헤더 매칭 (컬럼별로 수집한 텍스트 조합)
    for (let colIdx = 0; colIdx < columnHeaders.length; colIdx++) {
      const combinedText = columnHeaders[colIdx].join(' ').trim();
      if (!combinedText) continue;

      const normalized = normalizeLabel(combinedText);

      // 완전 일치 또는 부분 일치 확인
      if (normalized === normalizedKeyword || normalized.includes(normalizedKeyword)) {
        return colIdx;
      }

      // 여러 행 조합에서 날짜 패턴 확인
      if (datePattern.test(combinedText) || weekdayPattern.test(combinedText)) {
        if (keywordLower.includes('wednesday') || keywordLower.includes('week ended') || 
            keywordLower.includes('level') || keywordLower.includes('averages')) {
          return colIdx;
        }
      }

      // 키워드의 주요 단어들이 모두 포함되는지 확인 (더 정확한 매칭)
      const keywordWords = normalizedKeyword.split(/\s+/).filter(w => w.length > 2);
      if (keywordWords.length > 0 && keywordWords.every(word => normalized.includes(word))) {
        return colIdx;
      }
    }
  }

  // 디버깅을 위한 로깅 (개발 모드에서만)
  if (process.env.NODE_ENV === 'development') {
    const allHeaders = Array.from(headerRows).map((row, idx) => {
      const cells = $(row).find('td, th');
      return Array.from(cells).map((cell, cellIdx) => ({
        row: idx,
        col: cellIdx,
        text: $(cell).text().trim(),
        colspan: $(cell).attr('colspan') || '1',
      }));
    });
    console.warn('[findColumnIndex] Column not found:', {
      keywords: headerKeywords,
      headers: allHeaders,
    });
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
