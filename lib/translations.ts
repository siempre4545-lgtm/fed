/**
 * 한글화 용어집
 */

export const translationMap: Record<string, string> = {
  // 주요 항목
  'Reserve Bank credit': '연준 신용',
  'Securities held outright': '보유 증권',
  'U.S. Treasury securities': '국채',
  'Mortgage-backed securities': 'MBS',
  'Agency debt securities': '기관채',
  'Currency in circulation': '유통 통화',
  'Reverse repurchase agreements': '역레포',
  'U.S. Treasury, General Account': '재무부 일반계정(TGA)',
  'Reserve balances with Federal Reserve Banks': '지급준비금',
  'Total assets': '총 자산',
  'Total liabilities': '총 부채',
  
  // 준비금 요인
  'Factors supplying reserve funds': '공급 요인',
  'Factors absorbing reserve funds': '흡수 요인',
  'Repurchase agreements': '리포',
  'Primary credit': 'Primary Credit',
  'Other Federal Reserve assets': '기타 연준 자산',
  'Treasury cash holdings': '재무부 현금 보유',
  'Deposits with F.R. Banks, other than reserve balances': '기타 예치금',
  'Treasury deposits with Federal Reserve Banks': '재무부 예치금',
  'Other liabilities and capital': '연준 예치금',
  'Deposits': '연준 예치금',
  
  // 만기 분포
  'Within 15 days': '15일 이내',
  '16 days to 90 days': '16-90일',
  '91 days to 1 year': '91일-1년',
  'Over 1 year to 5 years': '1-5년',
  'Over 5 years to 10 years': '5-10년',
  'Over 10 years': '10년 이상',
  
  // 대출/증권
  'Secondary credit': 'Secondary Credit',
  'Seasonal credit': 'Seasonal Credit',
  'Bank Term Funding Program': 'BTFP',
  'Other credit extensions': '기타 신용 연장',
  'Overnight securities lending': '일일 증권 대출',
  
  // 지역 연준
  'Boston': '보스턴',
  'New York': '뉴욕',
  'Philadelphia': '필라델피아',
  'Cleveland': '클리블랜드',
  'Richmond': '리치먼드',
  'Atlanta': '애틀랜타',
  'Chicago': '시카고',
  'St. Louis': '세인트루이스',
  'Minneapolis': '미니애폴리스',
  'Kansas City': '캔자스시티',
  'Dallas': '댈러스',
  'San Francisco': '샌프란시스코',
};

/**
 * 라벨 한글화
 */
export function translateLabel(label: string): string {
  // 정확한 매칭 우선
  if (translationMap[label]) {
    return translationMap[label];
  }
  
  // 부분 매칭
  for (const [en, ko] of Object.entries(translationMap)) {
    if (label.includes(en)) {
      return label.replace(en, ko);
    }
  }
  
  // 매칭되지 않으면 원문 반환
  return label;
}

/**
 * 숫자 포맷팅 (백만 달러 단위)
 */
export function formatMillions(value: number): string {
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(3)}T`;
  } else if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}B`;
  } else {
    return `${value.toFixed(0)}M`;
  }
}

/**
 * 숫자 포맷팅 (쉼표 포함)
 */
export function formatNumber(value: number): string {
  return value.toLocaleString('en-US');
}

/**
 * 변화량 포맷팅
 */
export function formatChange(value: number, percent: number): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${formatNumber(value)} (${sign}${percent.toFixed(2)}%)`;
}
