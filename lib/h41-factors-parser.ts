/**
 * H.4.1 Table 1 "Factors Affecting Reserve Balances" 직접 파싱
 * 원문 HTML에서 테이블을 직접 읽어 모든 항목을 순서대로 추출
 */

import * as cheerio from 'cheerio';

export interface FactorsTableRow {
  key: string; // 원문 라벨
  labelKo: string; // 한글 번역
  value: number; // week ended 값 (백만 달러)
  wow: number; // Change from week ended (주간 Δ)
  yoy: number; // Change from: (연간 Δ)
}

export interface FactorsTableData {
  releaseDate: string; // YYYY-MM-DD
  weekEnded: string; // YYYY-MM-DD
  prevWeekEnded: string; // YYYY-MM-DD
  yearAgoLabel: string; // "Jan 8, 2025" 형식
  supplying: FactorsTableRow[];
  absorbing: FactorsTableRow[];
  totals: {
    totalSupplying: { value: number; wow: number; yoy: number };
    totalAbsorbingExReserves: { value: number; wow: number; yoy: number };
    reserveBalances: { value: number; wow: number; yoy: number };
  };
  integrity: {
    calcReserveBalances: number; // 공급 - 흡수 계산값
    delta: number; // 원문값과 계산값 차이
    ok: boolean; // 차이가 허용 범위 내인지
  };
}

/**
 * 숫자 파싱 (부호, 콤마, 공백 처리)
 * 기존 h41-parser.ts의 parseNumberFromText와 동일한 로직 사용
 */
function parseNumber(text: string): number | null {
  if (!text) return null;
  
  // non-breaking space를 일반 공백으로 변환
  const cleaned = text.replace(/\u00a0/g, ' ').trim();
  if (!cleaned) return null;
  
  // 부호(+/-) 보존, 콤마 제거
  const m = cleaned.match(/^([+-])?\s*([\d,]+)$/);
  if (!m) return null;
  
  const sign = m[1] === '-' ? -1 : 1;
  const n = Number(m[2].replace(/,/g, ''));
  if (!Number.isFinite(n)) return null;
  
  return sign * n;
}

/**
 * 날짜 파싱 (ISO 형식으로 변환)
 */
function parseDateToISO(dateText: string): string | null {
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
 * 한글 라벨 번역
 */
function translateLabel(enLabel: string): string {
  const translations: Record<string, string> = {
    'Reserve Bank credit': '연준 신용',
    'Securities held outright': '보유 증권',
    'U.S. Treasury securities': '미 국채',
    'Bills': '단기채',
    'Notes and bonds': '중장기채',
    'TIPS': '물가연동채',
    'Mortgage-backed securities': '주택저당증권',
    'Repurchase agreements': '레포',
    'Loans': '대출',
    'Primary credit': '1차 신용',
    'Bank Term Funding Program': '은행기간대출',
    'BTFP': '은행기간대출',
    'Central bank liquidity swaps': '통화스왑',
    'Gold': '금',
    'SDR': 'SDR',
    'Reverse repurchase agreements': '역레포',
    'Currency in circulation': '유통 통화',
    'U.S. Treasury, General Account': 'TGA',
    'Deposits with F.R. Banks, other than reserve balances': '예금 (지준금 제외)',
    'Other liabilities and capital': '기타 부채·자본',
    'Reserve balances with Federal Reserve Banks': '지급준비금',
  };
  
  // 정확한 매칭 시도
  if (translations[enLabel]) {
    return translations[enLabel];
  }
  
  // 부분 매칭 시도
  for (const [key, value] of Object.entries(translations)) {
    if (enLabel.toLowerCase().includes(key.toLowerCase()) || key.toLowerCase().includes(enLabel.toLowerCase())) {
      return value;
    }
  }
  
  // 번역 없으면 원문 반환
  return enLabel;
}

/**
 * Table 1 파싱 메인 함수
 * HTML 테이블 구조를 직접 파싱하여 정확한 데이터 추출
 */
export async function parseFactorsTable1(html: string, sourceUrl: string): Promise<FactorsTableData> {
  const $ = cheerio.load(html);
  
  // 먼저 테이블 구조로 파싱 시도
  let tableFound = false;
  let tableRows: Array<{ label: string; values: number[] }> = [];
  
  // "Factors Affecting Reserve Balances" 테이블 찾기
  $('table').each((_, table) => {
    const $table = $(table);
    const tableText = $table.text().toLowerCase();
    
    if (tableText.includes('factors affecting reserve balances') || 
        tableText.includes('reserve bank credit')) {
      tableFound = true;
      
      // 테이블 헤더 찾기
      const headers: string[] = [];
      $table.find('thead tr, tr:first-child').first().find('th, td').each((_, cell) => {
        const headerText = $(cell).text().trim();
        if (headerText) headers.push(headerText);
      });
      
      // 테이블 행 파싱
      $table.find('tbody tr, tr').each((_, row) => {
        const $row = $(row);
        const cells = $row.find('td, th');
        
        if (cells.length === 0) return;
        
        // 첫 번째 셀이 라벨
        const label = $row.find('td:first-child, th:first-child').text().trim();
        if (!label || label.length < 3) return;
        
        // 나머지 셀에서 숫자 추출
        const values: number[] = [];
        cells.slice(1).each((_, cell) => {
          const cellText = $(cell).text().trim();
          const num = parseNumber(cellText);
          if (num !== null) {
            values.push(num);
          }
        });
        
        if (label && values.length > 0) {
          tableRows.push({ label, values });
        }
      });
    }
  });
  
  // 테이블을 찾지 못한 경우 텍스트 기반 파싱으로 fallback
  const text = $('body').text().replace(/\r/g, '');
  const lines = text
    .split('\n')
    .map(s => s.replace(/\u00a0/g, ' ').trim())
    .filter(Boolean);
  
  // Release Date와 Week Ended 찾기
  const releaseDateLine = lines.find(l => l.startsWith('Release Date:')) ?? '';
  const releaseDateText = releaseDateLine.replace('Release Date:', '').trim();
  const releaseDate = parseDateToISO(releaseDateText) || '';
  
  let weekEndedText = '';
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('Week ended') && !line.toLowerCase().includes('change from')) {
      const match = line.match(/Week\s+ended\s+([A-Z][a-z]{2,}\s+\d{1,2},\s+\d{4})/i);
      if (match) {
        weekEndedText = match[1].trim();
        break;
      }
    }
  }
  const weekEnded = parseDateToISO(weekEndedText) || '';
  
  // Table 1 섹션 찾기 (더 유연한 검색)
  const table1Start = text.toLowerCase().indexOf('factors affecting reserve balances');
  if (table1Start === -1) {
    // 대체 키워드로 검색
    const altKeywords = [
      'reserve bank credit',
      'table 1',
      'factors supplying',
      'factors absorbing',
    ];
    
    let found = false;
    for (const keyword of altKeywords) {
      const idx = text.toLowerCase().indexOf(keyword);
      if (idx !== -1) {
        console.warn(`[parseFactorsTable1] Table 1 not found with primary keyword, but found "${keyword}" at index ${idx}`);
        found = true;
        break;
      }
    }
    
    if (!found) {
      console.error('[parseFactorsTable1] Table 1 section not found. Text length:', text.length);
      console.error('[parseFactorsTable1] First 1000 chars of text:', text.substring(0, 1000));
      throw new Error('Table 1 "Factors Affecting Reserve Balances" not found in HTML');
    }
  }
  
  // 테이블 헤더 찾기 (컬럼 인덱스 확인)
  let headerLineIndex = -1;
  let weekEndedColIndex = -1;
  let changeFromWeekEndedColIndex = -1;
  let changeFromYearAgoColIndex = -1;
  let prevWeekEndedText = '';
  let yearAgoLabel = '';
  
  // 헤더 라인 찾기 (숫자가 아닌 라인에서 "Week ended", "Change from" 찾기)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].toLowerCase();
    if (line.includes('week ended') && line.includes('change from')) {
      headerLineIndex = i;
      
      // 컬럼 분리 (탭 또는 공백으로 구분)
      const headerParts = lines[i].split(/\s{2,}|\t/).map(p => p.trim()).filter(Boolean);
      
      // 각 컬럼 인덱스 찾기
      for (let j = 0; j < headerParts.length; j++) {
        const part = headerParts[j].toLowerCase();
        if (part.includes('week ended') && !part.includes('change')) {
          weekEndedColIndex = j;
          // Week ended 날짜 추출
          const dateMatch = lines[i].match(/Week\s+ended\s+([A-Z][a-z]{2,}\s+\d{1,2},\s+\d{4})/i);
          if (dateMatch) {
            // 이미 weekEndedText에 저장됨
          }
        } else if (part.includes('change from week ended')) {
          changeFromWeekEndedColIndex = j;
          // Change from week ended 날짜 추출
          const prevDateMatch = lines[i].match(/Change\s+from\s+week\s+ended:\s*([A-Z][a-z]{2,}\s+\d{1,2},\s+\d{4})/i);
          if (prevDateMatch) {
            prevWeekEndedText = prevDateMatch[1].trim();
          }
        } else if (part.includes('change from:') || part.includes('change from')) {
          // 연간 컬럼 (두 번째 "Change from")
          if (changeFromWeekEndedColIndex >= 0 && j > changeFromWeekEndedColIndex) {
            changeFromYearAgoColIndex = j;
            // Change from 날짜 추출
            const yearAgoMatch = lines[i].match(/Change\s+from:\s*([A-Z][a-z]{2,}\s+\d{1,2},\s+\d{4})/i);
            if (yearAgoMatch) {
              yearAgoLabel = yearAgoMatch[1].trim();
            }
          }
        }
      }
      
      break;
    }
  }
  
  // 헤더를 찾지 못한 경우, 더 유연한 검색
  if (headerLineIndex === -1) {
    console.warn('[parseFactorsTable1] Header not found with standard pattern, trying flexible search...');
    
    // "Week ended"와 "Change"가 포함된 라인 찾기 (대소문자 무시)
    for (let i = 0; i < Math.min(300, lines.length); i++) {
      const line = lines[i];
      const lineLower = line.toLowerCase();
      
      // "Week" 또는 "Change"가 포함된 줄 찾기
      if (lineLower.includes('week') || lineLower.includes('change')) {
        // 인접한 줄들도 확인
        const contextLines = [
          i > 0 ? lines[i - 1] : '',
          line,
          i + 1 < lines.length ? lines[i + 1] : '',
        ].join(' ').toLowerCase();
        
        if (contextLines.includes('week') && contextLines.includes('change')) {
          headerLineIndex = i;
          weekEndedColIndex = 0;
          changeFromWeekEndedColIndex = 1;
          changeFromYearAgoColIndex = 2;
          
          // 날짜 추출
          const contextOriginal = [
            i > 0 ? lines[i - 1] : '',
            line,
            i + 1 < lines.length ? lines[i + 1] : '',
          ].join(' ');
          
          const weekEndedMatch = contextOriginal.match(/Week\s+ended\s+([A-Z][a-z]{2,}\s+\d{1,2},\s+\d{4})/i);
          const prevWeekMatch = contextOriginal.match(/Change\s+from\s+week\s+ended[:\s]+([A-Z][a-z]{2,}\s+\d{1,2},\s+\d{4})/i);
          const yearAgoMatch = contextOriginal.match(/Change\s+from[:\s]+([A-Z][a-z]{2,}\s+\d{1,2},\s+\d{4})/i);
          
          if (prevWeekMatch) prevWeekEndedText = prevWeekMatch[1].trim();
          if (yearAgoMatch) yearAgoLabel = yearAgoMatch[1].trim();
          
          console.log(`[parseFactorsTable1] Found header at line ${i} with flexible search`);
          break;
        }
      }
    }
  }
  
  if (headerLineIndex === -1) {
    console.error('[parseFactorsTable1] Header not found. Searching in lines:', {
      totalLines: lines.length,
      sampleLines: lines.slice(0, 100),
    });
    
    // 디버깅: "Week" 또는 "Change"가 포함된 줄 출력
    const potentialHeaders: Array<{ line: number; text: string }> = [];
    for (let i = 0; i < Math.min(200, lines.length); i++) {
      const line = lines[i].toLowerCase();
      if (line.includes('week') || line.includes('change') || line.includes('ended')) {
        potentialHeaders.push({ line: i, text: lines[i] });
      }
    }
    
    console.error('[parseFactorsTable1] Potential header lines:', potentialHeaders.slice(0, 20));
    
    // 헤더를 찾지 못했어도 계속 진행 (기본값 사용)
    console.warn('[parseFactorsTable1] Header not found, using default column indices');
    headerLineIndex = 0;
    weekEndedColIndex = 0;
    changeFromWeekEndedColIndex = 1;
    changeFromYearAgoColIndex = 2;
  }
  
  const prevWeekEnded = parseDateToISO(prevWeekEndedText) || '';
  
  console.log('[parseFactorsTable1] Header found at line', headerLineIndex, {
    weekEndedColIndex,
    changeFromWeekEndedColIndex,
    changeFromYearAgoColIndex,
    prevWeekEndedText,
    yearAgoLabel,
  });
  
  // 공급 요인 파싱 (Reserve Bank credit부터 Total factors supplying 전까지)
  // 기존 h41-parser.ts의 findLabelIndex 방식을 사용하여 더 견고하게 파싱
  const supplying: FactorsTableRow[] = [];
  
  // 공급 요인 라벨 목록 (원문 순서대로)
  const supplyingLabels = [
    'Reserve Bank credit',
    'Securities held outright',
    'U.S. Treasury securities',
    'Bills',
    'Notes and bonds',
    'Notes and bonds, nominal',
    'Notes and bonds, inflation-indexed',
    'Inflation compensation',
    'Federal agency debt securities',
    'Mortgage-backed securities',
    'Unamortized premiums on securities held outright',
    'Unamortized discounts on securities held outright',
    'Repurchase agreements',
    'Loans',
    'Primary credit',
    'Secondary credit',
    'Seasonal credit',
    'Paycheck Protection Program Liquidity Facility',
    'Bank Term Funding Program',
    'Other credit extensions',
    'Net portfolio holdings of MS Facilities 2020 LLC',
    'Float',
    'Central bank liquidity swaps',
    'Other Federal Reserve assets',
    'Gold Stock',
    'Special Drawing Rights Certificate Account',
    'Treasury Currency Outstanding',
  ];
  
  // findLabelIndex 함수 (기존 파서와 동일한 로직)
  const findLabelIndex = (searchLabel: string, startFrom: number = 0): number => {
    // 정확한 매칭
    for (let i = startFrom; i < lines.length; i++) {
      if (lines[i] === searchLabel) return i;
    }
    
    // 대소문자 무시 매칭
    const lowerSearch = searchLabel.toLowerCase();
    for (let i = startFrom; i < lines.length; i++) {
      if (lines[i].toLowerCase() === lowerSearch) return i;
    }
    
    // 키워드 매칭
    const keywords = lowerSearch.split(/[,\s]+/).filter(k => k.length > 3);
    for (let i = startFrom; i < lines.length; i++) {
      const lineLower = lines[i].toLowerCase();
      if (keywords.every(kw => lineLower.includes(kw))) {
        return i;
      }
    }
    
    return -1;
  };
  
  // Reserve Bank credit 찾기 (시작점)
  let supplyingStartIndex = findLabelIndex('Reserve Bank credit', headerLineIndex + 1);
  if (supplyingStartIndex === -1) {
    supplyingStartIndex = findLabelIndex('Reserve bank credit', headerLineIndex + 1);
  }
  
  // Total factors supplying 찾기 (종료점)
  let supplyingEndIndex = findLabelIndex('Total factors supplying reserve funds', supplyingStartIndex >= 0 ? supplyingStartIndex : headerLineIndex + 1);
  if (supplyingEndIndex === -1) {
    supplyingEndIndex = findLabelIndex('Total factors supplying', supplyingStartIndex >= 0 ? supplyingStartIndex : headerLineIndex + 1);
  }
  
  if (supplyingStartIndex === -1) {
    console.error('[parseFactorsTable1] Supplying factors section not found. Searching for keywords:', {
      headerLineIndex,
      linesAroundHeader: lines.slice(Math.max(0, headerLineIndex - 5), Math.min(headerLineIndex + 50, lines.length)),
    });
    throw new Error('Supplying factors section not found. Expected "Reserve Bank credit" after header');
  }
  
  console.log(`[parseFactorsTable1] Supplying factors section: ${supplyingStartIndex} to ${supplyingEndIndex > 0 ? supplyingEndIndex : 'end'}`);
  
  // 공급 요인 항목 파싱 (기존 파서 방식: 라벨 찾고 다음 5줄에서 숫자 추출)
  console.log(`[parseFactorsTable1] Parsing supplying factors from line ${supplyingStartIndex} to ${supplyingEndIndex > 0 ? supplyingEndIndex : lines.length}`);
  
  // 각 라벨을 순서대로 찾아서 파싱
  for (const label of supplyingLabels) {
    // 현재 범위 내에서만 검색
    const searchStart = supplyingStartIndex;
    const searchEnd = supplyingEndIndex > 0 ? supplyingEndIndex : Math.min(supplyingStartIndex + 200, lines.length);
    
    const labelIdx = findLabelIndex(label, searchStart);
    if (labelIdx < 0 || labelIdx >= searchEnd) continue;
    
    // 합계 라인은 건너뛰기
    if (label.toLowerCase().includes('total factors supplying')) continue;
    
    // 라벨 다음 5줄에서 숫자 추출 (기존 파서 방식)
    let value = 0;
    let wow = 0;
    let yoy = 0;
    const numbers: number[] = [];
    
    for (let i = 1; i <= 5 && labelIdx + i < lines.length; i++) {
      const num = parseNumber(lines[labelIdx + i]);
      if (num !== null) {
        numbers.push(num);
      }
    }
    
    // 첫 번째 숫자는 value, 두 번째는 wow, 세 번째는 yoy
    if (numbers.length >= 1) {
      value = numbers[0];
      wow = numbers.length >= 2 ? numbers[1] : 0;
      yoy = numbers.length >= 3 ? numbers[2] : 0;
      
      supplying.push({
        key: label,
        labelKo: translateLabel(label),
        value,
        wow,
        yoy,
      });
      
      console.log(`[parseFactorsTable1] Added supplying factor: ${label} = ${value} (wow: ${wow}, yoy: ${yoy})`);
    }
  }
  
  console.log(`[parseFactorsTable1] Parsed ${supplying.length} supplying factors`);
  
  // Total factors supplying 찾기
  let totalSupplyingValue = 0;
  let totalSupplyingWow = 0;
  let totalSupplyingYoy = 0;
  
  if (supplyingEndIndex >= 0) {
    const totalLine = lines[supplyingEndIndex];
    const totalNumbers = extractNumbersFromLine(totalLine);
    if (totalNumbers.length >= 3) {
      totalSupplyingValue = totalNumbers[0] || 0;
      totalSupplyingWow = totalNumbers[1] || 0;
      totalSupplyingYoy = totalNumbers[2] || 0;
    }
  }
  
  // 흡수 요인 파싱 (Total factors supplying 다음부터 Total factors absorbing 전까지)
  // "continued" 섹션도 포함하여 파싱
  const absorbing: FactorsTableRow[] = [];
  
  // 흡수 요인 라벨 목록 (원문 순서대로)
  const absorbingLabels = [
    'Currency in circulation',
    'Reverse repurchase agreements',
    'Reverse repurchase agreements with foreign official and international accounts',
    'Reverse repurchase agreements with others',
    'Treasury Cash Holdings',
    'Deposits with F.R. Banks, other than reserve balances',
    'U.S. Treasury, General Account',
    'Foreign official',
    'Other',
    'Other liabilities and capital',
  ];
  
  let absorbingStartIndex = supplyingEndIndex >= 0 ? supplyingEndIndex + 1 : lines.length;
  let absorbingEndIndex = -1;
  let reserveBalancesIndex = -1;
  
  // "continued" 섹션 시작 인덱스 찾기
  let continuedStartIndex = -1;
  for (let i = absorbingStartIndex; i < Math.min(absorbingStartIndex + 100, lines.length); i++) {
    const line = lines[i].toLowerCase();
    if (line.includes('continued') || line.includes('table 1 (continued)')) {
      continuedStartIndex = i;
      break;
    }
  }
  
  // continued 섹션이 있으면 그 이후부터도 흡수 요인으로 포함
  const actualAbsorbingStartIndex = continuedStartIndex >= 0 
    ? Math.min(absorbingStartIndex, continuedStartIndex)
    : absorbingStartIndex;
  
  // Total factors absorbing 찾기 (종료점)
  absorbingEndIndex = findLabelIndex('Total factors, other than reserve balances, absorbing reserve funds', actualAbsorbingStartIndex);
  if (absorbingEndIndex === -1) {
    absorbingEndIndex = findLabelIndex('Total factors absorbing', actualAbsorbingStartIndex);
  }
  
  // Reserve balances 찾기
  reserveBalancesIndex = findLabelIndex('Reserve balances with Federal Reserve Banks', actualAbsorbingStartIndex);
  
  console.log(`[parseFactorsTable1] Absorbing factors section: ${actualAbsorbingStartIndex} to ${absorbingEndIndex > 0 ? absorbingEndIndex : 'end'}, Reserve balances at: ${reserveBalancesIndex}`);
  
  // 흡수 요인 항목 파싱 (기존 파서 방식: 라벨 찾고 다음 5줄에서 숫자 추출)
  console.log(`[parseFactorsTable1] Parsing absorbing factors from line ${actualAbsorbingStartIndex} to ${absorbingEndIndex > 0 ? absorbingEndIndex : lines.length}`);
  
  // 각 라벨을 순서대로 찾아서 파싱
  for (const label of absorbingLabels) {
    // 현재 범위 내에서만 검색
    const searchStart = actualAbsorbingStartIndex;
    const searchEnd = absorbingEndIndex > 0 ? absorbingEndIndex : Math.min(actualAbsorbingStartIndex + 200, lines.length);
    
    const labelIdx = findLabelIndex(label, searchStart);
    if (labelIdx < 0 || labelIdx >= searchEnd) continue;
    
    // 합계 라인은 건너뛰기
    if (label.toLowerCase().includes('total factors')) continue;
    if (label.toLowerCase().includes('reserve balances')) continue;
    
    // 라벨 다음 5줄에서 숫자 추출 (기존 파서 방식)
    const numbers: number[] = [];
    
    for (let i = 1; i <= 5 && labelIdx + i < lines.length; i++) {
      const num = parseNumber(lines[labelIdx + i]);
      if (num !== null) {
        numbers.push(num);
      }
    }
    
    // 첫 번째 숫자는 value, 두 번째는 wow, 세 번째는 yoy
    if (numbers.length >= 1) {
      const value = numbers[0];
      const wow = numbers.length >= 2 ? numbers[1] : 0;
      const yoy = numbers.length >= 3 ? numbers[2] : 0;
      
      absorbing.push({
        key: label,
        labelKo: translateLabel(label),
        value,
        wow,
        yoy,
      });
      
      console.log(`[parseFactorsTable1] Added absorbing factor: ${label} = ${value} (wow: ${wow}, yoy: ${yoy})`);
    }
  }
  
  console.log(`[parseFactorsTable1] Parsed ${absorbing.length} absorbing factors`);
  
  // Total factors absorbing (지준금 제외) 찾기
  let totalAbsorbingExReservesValue = 0;
  let totalAbsorbingExReservesWow = 0;
  let totalAbsorbingExReservesYoy = 0;
  
  if (absorbingEndIndex >= 0) {
    const totalLine = lines[absorbingEndIndex];
    const totalNumbers = extractNumbersFromLine(totalLine);
    if (totalNumbers.length >= 3) {
      totalAbsorbingExReservesValue = totalNumbers[0] || 0;
      totalAbsorbingExReservesWow = totalNumbers[1] || 0;
      totalAbsorbingExReservesYoy = totalNumbers[2] || 0;
    }
  }
  
  // Reserve balances 찾기
  let reserveBalancesValue = 0;
  let reserveBalancesWow = 0;
  let reserveBalancesYoy = 0;
  
  if (reserveBalancesIndex >= 0) {
    const reserveLine = lines[reserveBalancesIndex];
    const reserveNumbers = extractNumbersFromLine(reserveLine);
    if (reserveNumbers.length >= 3) {
      reserveBalancesValue = reserveNumbers[0] || 0;
      reserveBalancesWow = reserveNumbers[1] || 0;
      reserveBalancesYoy = reserveNumbers[2] || 0;
    }
  }
  
  // 검증: 공급 - 흡수 = 지급준비금 (계산값)
  const calcReserveBalances = totalSupplyingValue - totalAbsorbingExReservesValue;
  const delta = Math.abs(calcReserveBalances - reserveBalancesValue);
  const ok = delta <= 10; // 10백만 달러 이내 오차 허용
  
  if (!ok) {
    console.warn('[parseFactorsTable1] Reserve balances mismatch:', {
      calculated: calcReserveBalances,
      fromSource: reserveBalancesValue,
      delta,
    });
  }
  
  return {
    releaseDate,
    weekEnded,
    prevWeekEnded,
    yearAgoLabel,
    supplying,
    absorbing,
    totals: {
      totalSupplying: {
        value: totalSupplyingValue,
        wow: totalSupplyingWow,
        yoy: totalSupplyingYoy,
      },
      totalAbsorbingExReserves: {
        value: totalAbsorbingExReservesValue,
        wow: totalAbsorbingExReservesWow,
        yoy: totalAbsorbingExReservesYoy,
      },
      reserveBalances: {
        value: reserveBalancesValue,
        wow: reserveBalancesWow,
        yoy: reserveBalancesYoy,
      },
    },
    integrity: {
      calcReserveBalances,
      delta,
      ok,
    },
  };
}

/**
 * 라인에서 숫자 추출 (3개 컬럼: value, wow, yoy)
 */
function extractNumbersFromLine(line: string): number[] {
  const numbers: number[] = [];
  
  // 방법 1: 정규식으로 직접 추출 (부호 포함, 콤마 포함)
  const regex = /([+-]?\s*[\d,]+(?:\.[\d]+)?)/g;
  let match;
  const extracted: number[] = [];
  
  while ((match = regex.exec(line)) !== null) {
    const num = parseNumber(match[1]);
    if (num !== null) {
      extracted.push(num);
    }
  }
  
  if (extracted.length > 0) {
    return extracted;
  }
  
  // 방법 2: 공백/탭으로 분리 후 숫자 추출
  const parts = line.split(/\s{2,}|\t/).map(p => p.trim()).filter(Boolean);
  
  for (const part of parts) {
    const num = parseNumber(part);
    if (num !== null) {
      numbers.push(num);
    }
  }
  
  return numbers;
}
