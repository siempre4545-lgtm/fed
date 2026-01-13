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
 */
function parseNumber(text: string): number | null {
  if (!text) return null;
  
  // 모든 공백 제거 (non-breaking space 포함)
  const cleaned = text.replace(/[\u00a0\s,]/g, '').trim();
  if (!cleaned) return null;
  
  // 부호 처리: -258,957 같은 형식
  const signMatch = cleaned.match(/^([+-])?/);
  const sign = signMatch && signMatch[1] === '-' ? -1 : 1;
  
  // 숫자만 추출
  const numMatch = cleaned.match(/(\d+)/);
  if (!numMatch) return null;
  
  const num = parseInt(numMatch[1], 10);
  if (isNaN(num)) return null;
  
  return sign * num;
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
    // "Week ended"와 "Change"가 포함된 라인 찾기
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.match(/Week\s+ended/i) && line.match(/Change\s+from/i)) {
        headerLineIndex = i;
        
        // 간단한 컬럼 인덱스 추정 (공백으로 분리)
        const parts = line.split(/\s{3,}/).map(p => p.trim()).filter(Boolean);
        weekEndedColIndex = 0;
        changeFromWeekEndedColIndex = 1;
        changeFromYearAgoColIndex = 2;
        
        // 날짜 추출
        const weekEndedMatch = line.match(/Week\s+ended\s+([A-Z][a-z]{2,}\s+\d{1,2},\s+\d{4})/i);
        const prevWeekMatch = line.match(/Change\s+from\s+week\s+ended[:\s]+([A-Z][a-z]{2,}\s+\d{1,2},\s+\d{4})/i);
        const yearAgoMatch = line.match(/Change\s+from[:\s]+([A-Z][a-z]{2,}\s+\d{1,2},\s+\d{4})/i);
        
        if (prevWeekMatch) prevWeekEndedText = prevWeekMatch[1].trim();
        if (yearAgoMatch) yearAgoLabel = yearAgoMatch[1].trim();
        
        break;
      }
    }
  }
  
  if (headerLineIndex === -1) {
    console.error('[parseFactorsTable1] Header not found. Searching in lines:', {
      totalLines: lines.length,
      sampleLines: lines.slice(0, 50),
    });
    
    // 더 유연한 헤더 검색
    for (let i = 0; i < Math.min(100, lines.length); i++) {
      const line = lines[i].toLowerCase();
      if (line.includes('week') || line.includes('change')) {
        console.warn(`[parseFactorsTable1] Potential header at line ${i}:`, lines[i]);
      }
    }
    
    throw new Error('Table 1 header not found. Expected line with "Week ended" and "Change from"');
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
  const supplying: FactorsTableRow[] = [];
  const supplyingStartKeywords = ['Reserve Bank credit', 'Reserve bank credit'];
  const supplyingEndKeywords = ['Total factors supplying reserve funds', 'Total factors supplying'];
  
  let supplyingStartIndex = -1;
  let supplyingEndIndex = -1;
  
  for (let i = headerLineIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    
    // 시작 키워드 찾기
    if (supplyingStartIndex === -1) {
      for (const keyword of supplyingStartKeywords) {
        if (line.toLowerCase().includes(keyword.toLowerCase())) {
          supplyingStartIndex = i;
          break;
        }
      }
    }
    
    // 종료 키워드 찾기
    if (supplyingStartIndex >= 0 && supplyingEndIndex === -1) {
      for (const keyword of supplyingEndKeywords) {
        if (line.toLowerCase().includes(keyword.toLowerCase())) {
          supplyingEndIndex = i;
          break;
        }
      }
    }
    
    if (supplyingEndIndex >= 0) break;
  }
  
  if (supplyingStartIndex === -1) {
    console.error('[parseFactorsTable1] Supplying factors section not found. Searching for keywords:', {
      headerLineIndex,
      linesAroundHeader: lines.slice(Math.max(0, headerLineIndex - 5), headerLineIndex + 20),
    });
    throw new Error('Supplying factors section not found. Expected "Reserve Bank credit" after header');
  }
  
  // 공급 요인 항목 파싱
  for (let i = supplyingStartIndex; i < (supplyingEndIndex > 0 ? supplyingEndIndex : lines.length); i++) {
    const line = lines[i];
    
    // 빈 라인 또는 숫자만 있는 라인 스킵
    if (!line.trim() || /^\s*[\d,\s+-]+\s*$/.test(line)) continue;
    
    // 합계 라인은 나중에 처리
    if (line.toLowerCase().includes('total factors supplying')) continue;
    
    // 라벨 찾기 (숫자가 아닌 텍스트)
    const labelMatch = line.match(/^([^0-9+-]+?)(?:\s{2,}|\t)/);
    if (!labelMatch) continue;
    
    const label = labelMatch[1].trim();
    if (!label || label.length < 3) continue; // 너무 짧은 라벨 스킵
    
    // 숫자 추출 (3개 컬럼: value, wow, yoy)
    const numbers = extractNumbersFromLine(line);
    
    if (numbers.length >= 3) {
      supplying.push({
        key: label,
        labelKo: translateLabel(label),
        value: numbers[0] || 0,
        wow: numbers[1] || 0,
        yoy: numbers[2] || 0,
      });
    } else if (numbers.length >= 1) {
      // 일부 항목은 주간/연간 변화가 없을 수 있음
      supplying.push({
        key: label,
        labelKo: translateLabel(label),
        value: numbers[0] || 0,
        wow: 0,
        yoy: 0,
      });
    }
  }
  
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
  const absorbingEndKeywords = [
    'Total factors, other than reserve balances, absorbing reserve funds',
    'Total factors absorbing',
  ];
  
  let absorbingStartIndex = supplyingEndIndex >= 0 ? supplyingEndIndex + 1 : lines.length;
  let absorbingEndIndex = -1;
  let reserveBalancesIndex = -1;
  
  // "continued" 섹션 시작 인덱스 찾기
  let continuedStartIndex = -1;
  for (let i = absorbingStartIndex; i < lines.length; i++) {
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
  
  for (let i = actualAbsorbingStartIndex; i < lines.length; i++) {
    const line = lines[i];
    
    // 종료 키워드 찾기
    if (absorbingEndIndex === -1) {
      for (const keyword of absorbingEndKeywords) {
        if (line.toLowerCase().includes(keyword.toLowerCase())) {
          absorbingEndIndex = i;
          break;
        }
      }
    }
    
    // Reserve balances 찾기
    if (reserveBalancesIndex === -1) {
      if (line.toLowerCase().includes('reserve balances with federal reserve banks')) {
        reserveBalancesIndex = i;
      }
    }
    
    if (absorbingEndIndex >= 0 && reserveBalancesIndex >= 0) break;
  }
  
  // 흡수 요인 항목 파싱 (continued 포함)
  for (let i = actualAbsorbingStartIndex; i < (absorbingEndIndex > 0 ? absorbingEndIndex : lines.length); i++) {
    const line = lines[i];
    
    // 빈 라인 또는 숫자만 있는 라인 스킵
    if (!line.trim() || /^\s*[\d,\s+-]+\s*$/.test(line)) continue;
    
    // "continued" 헤더 라인 스킵
    if (line.toLowerCase().includes('continued') && line.toLowerCase().includes('table')) continue;
    
    // 합계 라인은 나중에 처리
    if (line.toLowerCase().includes('total factors')) continue;
    if (line.toLowerCase().includes('reserve balances')) continue;
    
    // 라벨 찾기
    const labelMatch = line.match(/^([^0-9+-]+?)(?:\s{2,}|\t)/);
    if (!labelMatch) continue;
    
    const label = labelMatch[1].trim();
    if (!label || label.length < 3) continue;
    
    // 숫자 추출
    const numbers = extractNumbersFromLine(line);
    
    if (numbers.length >= 3) {
      absorbing.push({
        key: label,
        labelKo: translateLabel(label),
        value: numbers[0] || 0,
        wow: numbers[1] || 0,
        yoy: numbers[2] || 0,
      });
    } else if (numbers.length >= 1) {
      absorbing.push({
        key: label,
        labelKo: translateLabel(label),
        value: numbers[0] || 0,
        wow: 0,
        yoy: 0,
      });
    }
  }
  
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
  
  // 라인을 공백/탭으로 분리
  const parts = line.split(/\s{2,}|\t/).map(p => p.trim()).filter(Boolean);
  
  // 각 파트에서 숫자 추출
  for (const part of parts) {
    const num = parseNumber(part);
    if (num !== null) {
      numbers.push(num);
    }
  }
  
  // 위 방법이 실패하면 정규식으로 직접 추출
  if (numbers.length < 3) {
    const regex = /([+-]?\s*[\d,]+)/g;
    let match;
    const extracted: number[] = [];
    
    while ((match = regex.exec(line)) !== null && extracted.length < 3) {
      const num = parseNumber(match[1]);
      if (num !== null) {
        extracted.push(num);
      }
    }
    
    if (extracted.length > numbers.length) {
      return extracted;
    }
  }
  
  return numbers;
}
