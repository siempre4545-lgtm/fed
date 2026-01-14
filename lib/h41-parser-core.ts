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
 * 각주 번호 및 불필요한 문자 제거 강화
 */
export function normalizeLabel(label: string): string {
  return label
    .replace(/\u00a0/g, ' ') // non-breaking space
    .replace(/[()]/g, ' ') // 괄호 제거
    .replace(/\./g, ' ') // 마침표 제거
    .replace(/&/g, 'and') // &를 and로 변환
    .replace(/,/g, ' ') // 쉼표 제거
    .replace(/\s+\d+$/g, '') // 끝에 붙은 각주 번호 제거 (예: "Securities held outright 1" -> "Securities held outright")
    .replace(/\d+$/g, '') // 끝에 붙은 각주 번호 제거 (예: "Securities held outright1" -> "Securities held outright")
    .replace(/\s*\(\d+\)\s*/g, ' ') // 괄호 안의 숫자 제거 (예: "Item (1)" -> "Item")
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

    // 1. 단일 행에서 직접 매칭 (기존 로직) - "Week ended"를 우선적으로 찾기 위해 역순으로 검색
    // "Week ended"는 보통 두 번째 행에 있으므로, 나중 행부터 검색
    for (let rowIdx = headerRows.length - 1; rowIdx >= 0; rowIdx--) {
      const row = headerRows[rowIdx];
      const cells = $(row).find('td, th');
      let currentCol = 0;

      for (let cellIdx = 0; cellIdx < cells.length; cellIdx++) {
        const cell = cells[cellIdx];
        const cellText = $(cell).text().trim();
        const normalized = normalizeLabel(cellText);
        const colspan = parseInt($(cell).attr('colspan') || '1', 10);

        // 완전 일치 또는 부분 일치 확인
        // "Week ended"는 정확히 매칭되어야 함 (다른 텍스트와 혼동 방지)
        if (keywordLower.includes('week ended')) {
          // "Week ended"로 시작하는지 확인 (대소문자 무시)
          const cellLower = cellText.toLowerCase();
          if (cellLower.startsWith('week ended') || normalized.startsWith('week ended')) {
            return currentCol;
          }
          // "Week ended"가 포함되어 있고 날짜 패턴도 있으면 매칭
          if (cellLower.includes('week ended') && datePattern.test(cellText)) {
            return currentCol;
          }
        } else if (normalized === normalizedKeyword || normalized.includes(normalizedKeyword)) {
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
        
        // "Change from week ended" 같은 패턴도 확인
        if (keywordLower.includes('change from week ended') && cellText.toLowerCase().includes('change from week ended')) {
          return currentCol;
        }
        
        // "Change from year ago" 패턴 확인
        if (keywordLower.includes('change from year ago') && cellText.toLowerCase().includes('change from year ago')) {
          return currentCol;
        }

        currentCol += colspan;
      }
    }

    // 2. 여러 행에 걸친 헤더 매칭 (컬럼별로 수집한 텍스트 조합)
    for (let colIdx = 0; colIdx < columnHeaders.length; colIdx++) {
      const combinedText = columnHeaders[colIdx].join(' ').trim();
      if (!combinedText) continue;

      const normalized = normalizeLabel(combinedText);

      // "Week ended"는 정확히 매칭되어야 함
      if (keywordLower.includes('week ended')) {
        // "Week ended"로 시작하는지 확인 (다른 텍스트와 혼동 방지)
        if (normalized.startsWith('week ended') || combinedText.toLowerCase().includes('week ended')) {
          // "Week ended"가 포함된 경우, 해당 컬럼의 마지막 행 텍스트 확인
          // 마지막 행에 "Week ended"가 있으면 더 정확함
          const lastRowText = columnHeaders[colIdx].length > 0 
            ? columnHeaders[colIdx][columnHeaders[colIdx].length - 1].toLowerCase()
            : '';
          if (lastRowText.includes('week ended')) {
            return colIdx;
          }
        }
      } else {
        // 완전 일치 또는 부분 일치 확인
        if (normalized === normalizedKeyword || normalized.includes(normalizedKeyword)) {
          return colIdx;
        }
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

/**
 * H.4.1 Table 1을 정확히 선택하는 함수
 * scope 안의 모든 table을 순회하며 mustHaveLabels 중 2개 이상이 포함되는 table을 선택
 */
export function pickH41Table(
  $: cheerio.CheerioAPI,
  scope: cheerio.Cheerio<any>,
  mustHaveLabels: string[],
  warnings?: string[]
): cheerio.Cheerio<any> | null {
  if (scope.length === 0) {
    if (warnings) warnings.push('[pickH41Table] Scope is empty');
    return null;
  }

  // scope가 body인 경우 직접 $('table') 사용
  let allTables: cheerio.Cheerio<any>;
  const isBody = scope.prop('tagName')?.toLowerCase() === 'body' || 
                 (scope.length === 1 && scope.is('body'));
  
  if (isBody) {
    allTables = $('table');
  } else {
    allTables = scope.find('table');
  }

  if (allTables.length === 0) {
    // scope 자체가 table인 경우
    if (scope.prop('tagName')?.toLowerCase() === 'table') {
      return scope;
    }
    if (warnings) warnings.push('[pickH41Table] No tables found in scope');
    return null;
  }

  if (warnings) {
    warnings.push(`[pickH41Table] Found ${allTables.length} tables in scope, searching for labels: ${mustHaveLabels.join(', ')}`);
  }

  let bestMatch: cheerio.Cheerio<any> | null = null;
  let bestScore = 0;
  const matchDetails: Array<{ index: number; score: number; matches: string[]; rowCount: number }> = [];

  for (let i = 0; i < allTables.length; i++) {
    const table = allTables.eq(i);
    const tableText = table.text().toLowerCase();
    const rowCount = table.find('tr').length;
    
    // 최소 행 수 확인 (헤더 + 데이터 행 최소 5행 이상)
    if (rowCount < 5) {
      continue; // 제목만 있는 테이블은 스킵
    }
    
    // mustHaveLabels 중 몇 개가 포함되는지 계산
    let matchCount = 0;
    const matchedLabels: string[] = [];
    for (const label of mustHaveLabels) {
      const normalizedLabel = normalizeLabel(label);
      // 원본 라벨과 정규화된 라벨 모두 확인
      if (tableText.includes(normalizedLabel) || tableText.includes(label.toLowerCase())) {
        matchCount++;
        matchedLabels.push(label);
      }
    }

    matchDetails.push({ index: i, score: matchCount, matches: matchedLabels, rowCount });

    // 2개 이상 매칭되면 후보
    if (matchCount >= 2 && matchCount > bestScore) {
      bestMatch = table;
      bestScore = matchCount;
    }
  }

  if (warnings && bestMatch === null) {
    const topMatches = matchDetails
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map(m => `Table ${m.index}: score=${m.score}, rows=${m.rowCount}, matches=[${m.matches.join(', ')}]`)
      .join('; ');
    warnings.push(`[pickH41Table] No table found with 2+ matches and 5+ rows. Top matches: ${topMatches}`);
  } else if (warnings && bestMatch) {
    const rowCount = bestMatch.find('tr').length;
    warnings.push(`[pickH41Table] Selected table with score ${bestScore}, rows: ${rowCount}`);
  }

  return bestMatch;
}

/**
 * Table 1 전용 컬럼 인덱스 계산 함수
 * 멀티행 헤더/colspan/rowspan을 지원하여 정확한 컬럼 인덱스를 찾음
 */
export function getTable1ColumnIndices(
  $: cheerio.CheerioAPI,
  table: cheerio.Cheerio<any>
): { valueCol: number; weeklyCol: number; yearlyCol: number; avgCol?: number } {
  const result = { valueCol: -1, weeklyCol: -1, yearlyCol: -1, avgCol: -1 };
  
  if (table.length === 0) {
    return result;
  }

  // 헤더 행 검색 (최대 5개 행)
  const headerRows = table.find('tr').slice(0, 5);
  if (headerRows.length === 0) {
    return result;
  }

  // 날짜 패턴 정규식
  const datePattern = /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},\s+\d{4}\b/i;
  const weekdayPattern = /\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)day\b/i;

  // 최대 컬럼 수 계산 (colspan 고려)
  const maxCols = Math.max(...Array.from(headerRows).map((row) => {
    const cells = $(row).find('td, th');
    let colCount = 0;
    cells.each((_, cell) => {
      const colspan = parseInt($(cell).attr('colspan') || '1', 10);
      colCount += colspan;
    });
    return colCount;
  }));

  // 각 컬럼별로 헤더 텍스트 수집 (멀티행 헤더 처리)
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
      const rowspan = parseInt($(cell).attr('rowspan') || '1', 10);

      // colspan만큼 컬럼에 텍스트 추가
      for (let i = 0; i < colspan && currentCol + i < maxCols; i++) {
        if (cellText) {
          columnHeaders[currentCol + i].push(cellText);
        }
      }
      currentCol += colspan;
    });
  }

  // 컬럼별로 최종 헤더 텍스트 생성
  const colHeaderTexts: string[] = [];
  for (let colIdx = 0; colIdx < columnHeaders.length; colIdx++) {
    const combined = columnHeaders[colIdx].join(' ').trim();
    colHeaderTexts[colIdx] = combined;
  }

  // A) valueCol 찾기: 'Week ended'를 포함하는 컬럼 우선 선택
  for (let colIdx = 0; colIdx < colHeaderTexts.length; colIdx++) {
    const text = colHeaderTexts[colIdx].toLowerCase();
    if (text.includes('week ended')) {
      result.valueCol = colIdx;
      break;
    }
  }

  // valueCol을 찾지 못한 경우, 'Week ended' 다음에 오는 첫 숫자 컬럼 선택 (최후 폴백)
  if (result.valueCol < 0) {
    // 첫 번째 데이터 행에서 숫자가 있는 첫 번째 컬럼 찾기
    const dataRows = table.find('tr').slice(headerRows.length);
    for (let rowIdx = 0; rowIdx < Math.min(3, dataRows.length); rowIdx++) {
      const row = $(dataRows[rowIdx]);
      const cells = row.find('td, th');
      for (let cellIdx = 0; cellIdx < cells.length; cellIdx++) {
        const cellText = $(cells[cellIdx]).text().trim();
        if (parseNumber(cellText) !== null) {
          result.valueCol = cellIdx;
          break;
        }
      }
      if (result.valueCol >= 0) break;
    }
  }
  
  // valueCol이 설정되었으면, weeklyCol/yearlyCol은 valueCol과 달라야 함
  const excludeCols = result.valueCol >= 0 ? [result.valueCol] : [];

  // B) weeklyCol/yearlyCol 찾기
  // 주의: 'Change from week ended'는 헤더 텍스트일 뿐, 실제 데이터는 그 다음 컬럼에 있음
  // 따라서 'Change from week ended'를 포함하는 컬럼을 weeklyCol로 설정하지 말고,
  // 그 다음에 오는 날짜 컬럼들을 찾아야 함
  
  // 'Change from year ago'가 명시적으로 있으면 사용
  for (let colIdx = 0; colIdx < colHeaderTexts.length; colIdx++) {
    const text = colHeaderTexts[colIdx].toLowerCase();
    
    if (result.yearlyCol < 0 && text.includes('change from year ago')) {
      result.yearlyCol = colIdx;
    }
  }
  
  // 'Change from previous week'이 명시적으로 있으면 사용
  for (let colIdx = 0; colIdx < colHeaderTexts.length; colIdx++) {
    const text = colHeaderTexts[colIdx].toLowerCase();
    
    if (result.weeklyCol < 0 && text.includes('change from previous week')) {
      result.weeklyCol = colIdx;
    }
  }

  // weeklyCol/yearlyCol을 찾지 못한 경우, 'Change from week ended' 그룹 아래 날짜 2개 컬럼 찾기
  if (result.weeklyCol < 0 || result.yearlyCol < 0) {
    // 'Change from week ended'가 포함된 컬럼 찾기 (이 컬럼 자체가 아니라 그 다음 컬럼들이 데이터)
    let changeFromWeekEndedCol = -1;
    for (let colIdx = 0; colIdx < colHeaderTexts.length; colIdx++) {
      const text = colHeaderTexts[colIdx].toLowerCase();
      if (text.includes('change from week ended')) {
        changeFromWeekEndedCol = colIdx;
        break;
      }
    }

    // 실제 데이터 행에서 날짜 패턴이 있는 컬럼 찾기
    // colspan을 고려하여 실제 컬럼 인덱스를 계산
    const dateCols: Array<{ colIdx: number; dateText: string; source: string }> = [];
    const dataRows = table.find('tr').slice(headerRows.length);
    
    // 데이터 행에서 날짜 찾기 (실제 셀 인덱스 사용, colspan 고려)
    for (let rowIdx = 0; rowIdx < Math.min(3, dataRows.length); rowIdx++) {
      const row = $(dataRows[rowIdx]);
      const cells = row.find('td, th');
      let actualColIdx = 0; // colspan을 고려한 실제 컬럼 인덱스
      
      for (let cellIdx = 0; cellIdx < cells.length; cellIdx++) {
        const cell = $(cells[cellIdx]);
        const cellText = cell.text().trim();
        const colspan = parseInt(cell.attr('colspan') || '1', 10);
        
        // valueCol은 제외
        if (excludeCols.includes(actualColIdx)) {
          actualColIdx += colspan;
          continue;
        }
        
        // "Change from week ended" 컬럼도 제외
        if (changeFromWeekEndedCol >= 0 && actualColIdx === changeFromWeekEndedCol) {
          actualColIdx += colspan;
          continue;
        }
        
        // "Change from week ended" 이후만 확인
        if (changeFromWeekEndedCol >= 0 && actualColIdx <= changeFromWeekEndedCol) {
          actualColIdx += colspan;
          continue;
        }
        
        const dateMatch = cellText.match(datePattern);
        if (dateMatch) {
          // 이미 추가되지 않은 컬럼만 추가
          if (!dateCols.some(dc => dc.colIdx === actualColIdx)) {
            dateCols.push({ colIdx: actualColIdx, dateText: dateMatch[0], source: `data-row-${rowIdx}` });
          }
        }
        
        actualColIdx += colspan;
      }
    }
    
    // 헤더 행에서도 날짜 찾기 (colspan 고려)
    for (let rowIdx = 0; rowIdx < headerRows.length; rowIdx++) {
      const row = $(headerRows[rowIdx]);
      const cells = row.find('td, th');
      let actualColIdx = 0; // colspan을 고려한 실제 컬럼 인덱스
      
      for (let cellIdx = 0; cellIdx < cells.length; cellIdx++) {
        const cell = $(cells[cellIdx]);
        const cellText = cell.text().trim();
        const colspan = parseInt(cell.attr('colspan') || '1', 10);
        
        // valueCol은 제외
        if (excludeCols.includes(actualColIdx)) {
          actualColIdx += colspan;
          continue;
        }
        
        // "Change from week ended" 컬럼도 제외
        if (changeFromWeekEndedCol >= 0 && actualColIdx === changeFromWeekEndedCol) {
          actualColIdx += colspan;
          continue;
        }
        
        // "Change from week ended" 이후만
        if (changeFromWeekEndedCol >= 0 && actualColIdx <= changeFromWeekEndedCol) {
          actualColIdx += colspan;
          continue;
        }
        
        const dateMatch = cellText.match(datePattern);
        if (dateMatch) {
          // 이미 추가되지 않은 컬럼만 추가
          if (!dateCols.some(dc => dc.colIdx === actualColIdx)) {
            dateCols.push({ colIdx: actualColIdx, dateText: dateMatch[0], source: `header-row-${rowIdx}` });
          }
        }
        
        actualColIdx += colspan;
      }
    }

    // 날짜 컬럼들을 컬럼 인덱스 순으로 정렬
    dateCols.sort((a, b) => a.colIdx - b.colIdx);

    // 'Change from week ended' 컬럼 이후의 날짜 컬럼들을 찾기
    // valueCol과 다른 컬럼만 선택
    const changeGroupDateCols = changeFromWeekEndedCol >= 0
      ? dateCols.filter(dc => dc.colIdx > changeFromWeekEndedCol && !excludeCols.includes(dc.colIdx))
      : dateCols.filter(dc => !excludeCols.includes(dc.colIdx));

    // 첫 번째 날짜 컬럼 → weeklyCol, 두 번째 날짜 컬럼 → yearlyCol
    if (changeGroupDateCols.length >= 1 && result.weeklyCol < 0) {
      result.weeklyCol = changeGroupDateCols[0].colIdx;
    }
    if (changeGroupDateCols.length >= 2 && result.yearlyCol < 0) {
      result.yearlyCol = changeGroupDateCols[1].colIdx;
    }
    
    // 그래도 못 찾으면 모든 날짜 컬럼에서 첫 번째/두 번째 선택 (valueCol 제외)
    const availableDateCols = dateCols.filter(dc => !excludeCols.includes(dc.colIdx));
    if (result.weeklyCol < 0 && availableDateCols.length >= 1) {
      result.weeklyCol = availableDateCols[0].colIdx;
    }
    if (result.yearlyCol < 0 && availableDateCols.length >= 2) {
      result.yearlyCol = availableDateCols[1].colIdx;
    }
  }

  // C) avgCol 찾기 (선택사항): 'Averages of daily figures' 컬럼
  for (let colIdx = 0; colIdx < colHeaderTexts.length; colIdx++) {
    const text = colHeaderTexts[colIdx].toLowerCase();
    if (text.includes('averages of daily figures')) {
      result.avgCol = colIdx;
      break;
    }
  }

  // 디버깅: 컬럼 헤더 텍스트 로깅 (실패 시)
  if (result.valueCol < 0 || result.weeklyCol < 0 || result.yearlyCol < 0) {
    const headerPreview = colHeaderTexts.slice(0, 6).map((text, idx) => 
      `Col${idx}: "${text.substring(0, 50)}"`
    ).join('; ');
    // warnings가 있으면 로깅 (하지만 여기서는 warnings를 받지 않으므로 주석 처리)
    // if (warnings) warnings.push(`[getTable1ColumnIndices] Header preview: ${headerPreview}`);
  }

  return result;
}
