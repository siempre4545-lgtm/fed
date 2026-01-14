/**
 * 연간 변동 계산 유틸리티
 * 1년 전 데이터와 비교하여 연간 변동값 계산
 */

// 구형 타입 - 더 이상 사용되지 않음
// import type { H41Card } from './h41-parser';

export interface HistoricalCard {
  fedLabel: string;
  balance_musd: number;
  change_musd: number;
}

export interface HistoricalData {
  date: string;
  weekEnded: string;
  cards: HistoricalCard[];
}

/**
 * 연간 변동 계산
 * @param currentValue 현재 값
 * @param currentDate 현재 날짜 (YYYY-MM-DD)
 * @param historicalData 과거 데이터 배열
 * @param fedLabel 찾을 항목의 fedLabel
 * @returns 연간 변동값과 변동률
 */
export function calculateYearlyChange(
  currentValue: number,
  currentDate: string,
  historicalData: HistoricalData[],
  fedLabel: string
): { change: number; changePercent: number } {
  try {
    const current = new Date(currentDate);
    const oneYearAgo = new Date(current);
    oneYearAgo.setDate(oneYearAgo.getDate() - 364); // 약 52주 전
    
    // 52주 전 날짜와 가장 가까운 데이터 찾기 (±2주 범위)
    const targetDate = oneYearAgo.getTime();
    const twoWeeksMs = 14 * 24 * 60 * 60 * 1000;
    
    let closestData: HistoricalData | null = null;
    let minDiff = Infinity;
    
    for (const data of historicalData) {
      const dataDate = new Date(data.date).getTime();
      const diff = Math.abs(dataDate - targetDate);
      
      // ±2주 범위 내에서 가장 가까운 데이터
      if (diff <= twoWeeksMs && diff < minDiff) {
        minDiff = diff;
        closestData = data;
      }
    }
    
    if (!closestData) {
      console.warn(`[calculateYearlyChange] No historical data found for ${fedLabel} (target: ${oneYearAgo.toISOString().split('T')[0]})`);
      return { change: 0, changePercent: 0 };
    }
    
    // fedLabel이 특수한 경우 (합계 등) 처리
    let pastValue = 0;
    if (fedLabel === 'Total Supplying Factors' || fedLabel === 'Total Absorbing Factors' || fedLabel === 'Reserve Balances') {
      // 합계의 경우, 해당 날짜의 모든 카드를 합산
      // 이 경우는 convertFactors에서 별도로 처리해야 함
      const pastCard = closestData.cards.find(c => c.fedLabel === fedLabel);
      if (pastCard) {
        pastValue = pastCard.balance_musd;
      } else {
        console.warn(`[calculateYearlyChange] Card not found for ${fedLabel} in historical data`);
        return { change: 0, changePercent: 0 };
      }
    } else {
      const pastCard = closestData.cards.find(c => c.fedLabel === fedLabel);
      if (!pastCard) {
        console.warn(`[calculateYearlyChange] Card not found for ${fedLabel} in historical data (date: ${closestData.date})`);
        return { change: 0, changePercent: 0 };
      }
      pastValue = pastCard.balance_musd;
    }
    
    if (pastValue === 0) {
      console.warn(`[calculateYearlyChange] Past value is 0 for ${fedLabel}`);
      return { change: 0, changePercent: 0 };
    }
    
    const change = currentValue - pastValue;
    const changePercent = (change / pastValue) * 100;
    
    console.log(`[calculateYearlyChange] ${fedLabel}:`, {
      currentValue,
      pastValue,
      change,
      changePercent: changePercent.toFixed(2),
      historicalDate: closestData.date,
    });
    
    return { change, changePercent };
  } catch (error) {
    console.error(`[calculateYearlyChange] Error for ${fedLabel}:`, error);
    return { change: 0, changePercent: 0 };
  }
}

/**
 * 여러 항목의 연간 변동을 일괄 계산
 */
export function calculateYearlyChanges(
  currentCards: H41Card[],
  currentDate: string,
  historicalData: HistoricalData[]
): Map<string, { change: number; changePercent: number }> {
  const result = new Map<string, { change: number; changePercent: number }>();
  
  for (const card of currentCards) {
    const yearly = calculateYearlyChange(
      card.balance_musd,
      currentDate,
      historicalData,
      card.fedLabel
    );
    result.set(card.fedLabel, yearly);
  }
  
  return result;
}
