/**
 * 연간 변동 계산 유틸리티
 * 1년 전 데이터와 비교하여 연간 변동값 계산
 */

import type { H41Card } from './h41-parser';

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
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    
    // 1년 전 날짜와 가장 가까운 데이터 찾기 (±2주 범위)
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
      return { change: 0, changePercent: 0 };
    }
    
    const pastCard = closestData.cards.find(c => c.fedLabel === fedLabel);
    if (!pastCard || pastCard.balance_musd === 0) {
      return { change: 0, changePercent: 0 };
    }
    
    const change = currentValue - pastCard.balance_musd;
    const changePercent = (change / pastCard.balance_musd) * 100;
    
    return { change, changePercent };
  } catch (error) {
    console.error('Error calculating yearly change:', error);
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
