/**
 * 비밀지표 데이터 수집 모듈
 * 자본주의 내부 신경계를 해부하는 12개 선행 지표
 */

export type SecretIndicator = {
  id: string;
  name: string;
  description: string;
  fredSeriesId?: string;
  alternativeSource?: string;
  value: number | null;
  previousValue: number | null;
  change: number | null;
  changePercent: number | null;
  unit: string;
  lastUpdated: string;
  interpretation: string;
  trend: "up" | "down" | "neutral";
  riskLevel: "low" | "medium" | "high" | "critical";
};

/**
 * FRED API에서 데이터 가져오기
 */
async function fetchFRED(seriesId: string, limit: number = 2): Promise<{ value: number; previousValue: number; date: string } | null> {
  try {
    const apiKey = process.env.FRED_API_KEY || "demo";
    const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${apiKey}&file_type=json&limit=${limit}&sort_order=desc`;
    
    const response = await fetch(url, {
      headers: { "User-Agent": "h41-dashboard/1.0" },
      cache: "no-store"
    });
    
    if (!response.ok) {
      console.warn(`FRED API error for ${seriesId}: ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    const observations = data.observations || [];
    
    if (observations.length < 2) {
      console.warn(`Insufficient data for ${seriesId}`);
      return null;
    }
    
    const latest = observations[0];
    const previous = observations[1];
    
    const value = parseFloat(latest.value);
    const previousValue = parseFloat(previous.value);
    
    if (isNaN(value) || isNaN(previousValue)) {
      return null;
    }
    
    return {
      value,
      previousValue,
      date: latest.date
    };
  } catch (error) {
    console.error(`Failed to fetch FRED data for ${seriesId}:`, error);
    return null;
  }
}

/**
 * 지표별 해석 생성
 */
function generateInterpretation(
  indicator: SecretIndicator,
  value: number,
  previousValue: number,
  change: number,
  changePercent: number
): string {
  const absChange = Math.abs(change);
  const absChangePercent = Math.abs(changePercent);
  
  switch (indicator.id) {
    case "bank_reserves_velocity":
      if (change > 0) {
        return `은행 준비금의 속도가 증가하고 있습니다(${absChangePercent.toFixed(2)}%). 이는 은행들이 서로를 신뢰하고 자금을 순환시키고 있다는 신호입니다. 유동성 환경이 개선되고 있으며, 신용 창출이 활발해질 수 있습니다. 거대 자본가들은 이런 시점에 성장 자산의 비중을 늘립니다.`;
      } else if (change < 0) {
        return `은행 준비금의 속도가 감소하고 있습니다(${absChangePercent.toFixed(2)}%). 이는 은행들이 서로를 신뢰하지 못하고 자금 순환이 멈추고 있다는 경고 신호입니다. 신용 경색이 시작될 수 있으며, 거대 자본가들은 방어적 포지션으로 전환합니다.`;
      }
      return `은행 준비금의 속도가 안정적으로 유지되고 있습니다. 현재 신뢰 수준이 유지되고 있으며, 큰 변화 없이 진행되고 있습니다.`;
      
    case "sofr_iorb_spread":
      if (change > 0) {
        return `SOFR-IORB 스프레드가 확대되고 있습니다(${absChange.toFixed(2)}bp). 이는 은행들이 서로를 포기하고 중앙은행으로 돌아가고 있다는 신호입니다. 금융 시스템에 스트레스가 증가하고 있으며, 유동성 경색이 시작될 수 있습니다. 거대 자본가들은 현금 비중을 늘리고 방어적 자산으로 전환합니다.`;
      } else if (change < 0) {
        return `SOFR-IORB 스프레드가 축소되고 있습니다(${absChange.toFixed(2)}bp). 이는 은행 간 신뢰가 회복되고 있으며, 금융 시스템이 안정화되고 있다는 신호입니다. 유동성 환경이 개선되고 있어 자산 가격 상승 여지가 생길 수 있습니다.`;
      }
      return `SOFR-IORB 스프레드가 안정적으로 유지되고 있습니다. 현재 은행 간 신뢰 수준이 유지되고 있으며, 큰 변화 없이 진행되고 있습니다.`;
      
    case "cross_currency_basis":
      if (change > 0) {
        return `Cross Currency Basis가 확대되고 있습니다. 이는 달러 조달 능력이 악화되고 있다는 신호입니다. 글로벌 달러 유동성이 경색되고 있으며, 신흥국과 기업들의 달러 조달 비용이 상승하고 있습니다. 거대 자본가들은 달러 강세 자산으로 이동하며, 위험 자산에서 빠져나갑니다.`;
      } else if (change < 0) {
        return `Cross Currency Basis가 축소되고 있습니다. 이는 달러 조달 능력이 개선되고 있다는 신호입니다. 글로벌 달러 유동성이 풍부해지고 있으며, 신흥국과 기업들의 달러 조달이 원활해지고 있습니다.`;
      }
      return `Cross Currency Basis가 안정적으로 유지되고 있습니다. 현재 달러 조달 환경이 유지되고 있으며, 큰 변화 없이 진행되고 있습니다.`;
      
    case "sloos":
      if (change > 0) {
        return `SLOOS(은행 대출 기준 설문)가 강화되고 있습니다(${absChangePercent.toFixed(2)}%). 은행들이 대출 기준을 강화하고 있다는 것은 뉴스보다 먼저 위기 신호를 감지했다는 의미입니다. 신용 경색이 시작될 수 있으며, 기업들의 자금 조달이 어려워질 수 있습니다. 거대 자본가들은 현금 비중을 늘리고 방어적 포지션으로 전환합니다.`;
      } else if (change < 0) {
        return `SLOOS(은행 대출 기준 설문)가 완화되고 있습니다(${absChangePercent.toFixed(2)}%). 은행들이 대출 기준을 완화하고 있다는 것은 신용 환경이 개선되고 있다는 신호입니다. 기업들의 자금 조달이 원활해지고 있으며, 성장 자산에 유리한 환경이 조성되고 있습니다.`;
      }
      return `SLOOS(은행 대출 기준 설문)가 안정적으로 유지되고 있습니다. 현재 대출 기준이 유지되고 있으며, 큰 변화 없이 진행되고 있습니다.`;
      
    case "cre_risk_perception":
      if (change > 0) {
        return `상업용 부동산 위험 인식 지표가 상승하고 있습니다(${absChangePercent.toFixed(2)}%). 은행들이 CRE 대출을 위험하다고 느끼는 비율이 증가하고 있습니다. 이는 시장 가격보다 선행하는 지표로, 상업용 부동산 시장의 악화가 예상됩니다. 거대 자본가들은 부동산 관련 자산에서 빠져나갑니다.`;
      } else if (change < 0) {
        return `상업용 부동산 위험 인식 지표가 하락하고 있습니다(${absChangePercent.toFixed(2)}%). 은행들이 CRE 대출을 덜 위험하다고 느끼고 있습니다. 상업용 부동산 시장이 안정화되고 있으며, 투자 기회가 생길 수 있습니다.`;
      }
      return `상업용 부동산 위험 인식 지표가 안정적으로 유지되고 있습니다. 현재 위험 인식 수준이 유지되고 있으며, 큰 변화 없이 진행되고 있습니다.`;
      
    case "interest_coverage_tail_risk":
      if (change > 0) {
        return `기업 이자보상 능력의 꼬리 위험이 증가하고 있습니다(${absChangePercent.toFixed(2)}%). 가장 약한 기업들의 현금성 자산이 고금리 환경에서 하락 전환 위험에 노출되고 있습니다. 신용 위기는 항상 가장 약한 기업부터 터진다는 원리에 따라, 기업 신용 위험이 증가하고 있습니다. 거대 자본가들은 고수익 채권과 위험 자산에서 빠져나갑니다.`;
      } else if (change < 0) {
        return `기업 이자보상 능력의 꼬리 위험이 감소하고 있습니다(${absChangePercent.toFixed(2)}%). 가장 약한 기업들의 현금성 자산이 개선되고 있으며, 신용 위험이 감소하고 있습니다. 기업 신용 환경이 안정화되고 있어 위험 자산에 유리한 환경이 조성되고 있습니다.`;
      }
      return `기업 이자보상 능력의 꼬리 위험이 안정적으로 유지되고 있습니다. 현재 신용 위험 수준이 유지되고 있으며, 큰 변화 없이 진행되고 있습니다.`;
      
    case "mmf_flows":
      if (change > 0) {
        return `MMF 자금이 급증하고 있습니다(${absChangePercent.toFixed(2)}%). 공포는 증가가 아니라 어디서 어디로 이동하는지로 드러난다는 원리에 따라, 주식과 예금에서 MMF로 자금이 이동하고 있습니다. 이는 시장 불안이 증가하고 있다는 신호이며, 거대 자본가들은 방어적 포지션으로 전환합니다.`;
      } else if (change < 0) {
        return `MMF 자금이 감소하고 있습니다(${absChangePercent.toFixed(2)}%). 자금이 MMF에서 주식이나 예금으로 이동하고 있습니다. 시장 신뢰가 회복되고 있으며, 위험 자산에 유리한 환경이 조성되고 있습니다.`;
      }
      return `MMF 자금이 안정적으로 유지되고 있습니다. 현재 자금 이동이 안정적이며, 큰 변화 없이 진행되고 있습니다.`;
      
    case "tga":
      if (change > 0) {
        return `미 재무부 일반계정(TGA)이 증가하고 있습니다(${absChangePercent.toFixed(2)}%). 정부가 시장 유동성을 흡수하고 있는 숨겨진 밸브가 작동하고 있습니다. 세금 징수나 국채 발행 자금이 예치되면서 시중 유동성이 정부 계정으로 흡수되고 있습니다. 이는 단기적으로 자금 시장의 금리 상승 압력과 자산 가격 조정 압력으로 작용할 수 있습니다.`;
      } else if (change < 0) {
        return `미 재무부 일반계정(TGA)이 감소하고 있습니다(${absChangePercent.toFixed(2)}%). 정부가 시장 유동성을 공급하고 있는 숨겨진 밸브가 작동하고 있습니다. 정부 지출 확대로 시중 유동성이 공급되고 있으며, 자금 시장의 금리 하락 압력과 자산 가격 상승 요인으로 작용할 수 있습니다.`;
      }
      return `미 재무부 일반계정(TGA)이 안정적으로 유지되고 있습니다. 현재 정부 유동성 관리가 안정적이며, 큰 변화 없이 진행되고 있습니다.`;
      
    case "primary_dealer_positioning":
      if (change > 0) {
        return `프라이머리 딜러 포지션이 증가하고 있습니다. 시장을 떠받치던 거대한 손들이 포지션을 늘리고 있습니다. 이는 시장 유동성이 개선되고 있으며, 거대 자본가들이 시장에 대한 신뢰를 회복하고 있다는 신호입니다.`;
      } else if (change < 0) {
        return `프라이머리 딜러 포지션이 감소하고 있습니다. 시장을 떠받치던 거대한 손들이 먼저 내려놓고 있습니다. 이는 시장 유동성이 악화되고 있으며, 거대 자본가들이 시장에서 빠져나가고 있다는 경고 신호입니다. 거대 자본가들은 이런 시점에 방어적 포지션으로 전환합니다.`;
      }
      return `프라이머리 딜러 포지션이 안정적으로 유지되고 있습니다. 현재 시장 지지 수준이 유지되고 있으며, 큰 변화 없이 진행되고 있습니다.`;
      
    case "dollar_strength_quality":
      if (change > 0) {
        return `달러 강세의 질이 개선되고 있습니다. 성장 달러인지 공포 달러인지를 가르는 기준에서, 달러 상승과 위험 자산 상승이 함께 나타나고 있습니다. 이는 성장 달러로 해석되며, 글로벌 성장 기대가 반영되고 있습니다. 거대 자본가들은 성장 자산의 비중을 늘립니다.`;
      } else if (change < 0) {
        return `달러 강세의 질이 악화되고 있습니다. 달러 상승과 위험 자산 하락이 함께 나타나고 있습니다. 이는 공포 달러로 해석되며, 글로벌 리스크 회피 심리가 증가하고 있습니다. 거대 자본가들은 방어적 자산으로 이동하며, 현금 비중을 늘립니다.`;
      }
      return `달러 강세의 질이 안정적으로 유지되고 있습니다. 현재 달러 강세의 성격이 유지되고 있으며, 큰 변화 없이 진행되고 있습니다.`;
      
    case "global_trade_finance_stress":
      if (change > 0) {
        return `글로벌 무역금융 위축이 증가하고 있습니다. 실물 경제의 순환이 막히기 시작하는 신호입니다. 무역 금융이 경색되면서 글로벌 무역이 위축되고 있으며, 실물 경제의 악화가 예상됩니다. 거대 자본가들은 실물 경제 관련 자산에서 빠져나갑니다.`;
      } else if (change < 0) {
        return `글로벌 무역금융 위축이 감소하고 있습니다. 실물 경제의 순환이 개선되고 있는 신호입니다. 무역 금융이 회복되면서 글로벌 무역이 활성화되고 있으며, 실물 경제의 개선이 예상됩니다.`;
      }
      return `글로벌 무역금융 위축이 안정적으로 유지되고 있습니다. 현재 무역 금융 환경이 유지되고 있으며, 큰 변화 없이 진행되고 있습니다.`;
      
    case "sovereign_risk_gap":
      if (change > 0) {
        return `국가 CDS vs 환율 괴리가 확대되고 있습니다. 시장이 판단하는 국가 신뢰도와 환율이 따로 움직이고 있습니다. 이는 국가 신뢰도가 악화되고 있다는 신호이며, 거대 자본가들은 해당 국가 자산에서 빠져나갑니다.`;
      } else if (change < 0) {
        return `국가 CDS vs 환율 괴리가 축소되고 있습니다. 시장이 판단하는 국가 신뢰도와 환율이 함께 움직이고 있습니다. 이는 국가 신뢰도가 개선되고 있다는 신호이며, 해당 국가 자산에 투자 기회가 생길 수 있습니다.`;
      }
      return `국가 CDS vs 환율 괴리가 안정적으로 유지되고 있습니다. 현재 국가 신뢰도가 유지되고 있으며, 큰 변화 없이 진행되고 있습니다.`;
      
    default:
      return "데이터를 분석 중입니다.";
  }
}

/**
 * 위험 수준 판단
 */
function determineRiskLevel(indicator: SecretIndicator, change: number, changePercent: number): "low" | "medium" | "high" | "critical" {
  const absChangePercent = Math.abs(changePercent);
  
  // 지표별로 위험 수준 판단 로직이 다를 수 있음
  if (absChangePercent > 10) return "critical";
  if (absChangePercent > 5) return "high";
  if (absChangePercent > 2) return "medium";
  return "low";
}

/**
 * 모든 비밀지표 가져오기
 */
export async function fetchAllSecretIndicators(): Promise<SecretIndicator[]> {
  const indicators: SecretIndicator[] = [
    {
      id: "bank_reserves_velocity",
      name: "은행 준비금의 속도",
      description: "돈의 양이 아니라 은행 신뢰의 척도가 변화하고 멈추는 순간을 보여줌",
      fredSeriesId: "WRESBAL",
      unit: "억 달러",
      value: null,
      previousValue: null,
      change: null,
      changePercent: null,
      lastUpdated: "",
      interpretation: "",
      trend: "neutral",
      riskLevel: "low"
    },
    {
      id: "sofr_iorb_spread",
      name: "SOFR-IORB 스프레드",
      description: "은행들이 서로를 포기하고 중앙은행으로 돌아가는 신호를 알려주는 지표",
      fredSeriesId: "SOFR",
      alternativeSource: "IORB와의 차이 계산 필요",
      unit: "bp",
      value: null,
      previousValue: null,
      change: null,
      changePercent: null,
      lastUpdated: "",
      interpretation: "",
      trend: "neutral",
      riskLevel: "low"
    },
    {
      id: "cross_currency_basis",
      name: "Cross Currency Basis",
      description: "달러가 있느냐 보다 빌릴 수 있는냐가 중요해지는 순간에 대한 내용으로 말 그대로 달러 조달능력 지표",
      alternativeSource: "Refinitiv, Bloomberg, MacroMicro",
      unit: "bp",
      value: null,
      previousValue: null,
      change: null,
      changePercent: null,
      lastUpdated: "",
      interpretation: "",
      trend: "neutral",
      riskLevel: "low"
    },
    {
      id: "sloos",
      name: "SLOOS (은행 대출 기준 설문)",
      description: "은행이 대출 기준을 강화했는지 나타나는 비율로 은행이 뉴스보다 먼저 위기 신호를 알려주는 지표",
      fredSeriesId: "DRTSCILM",
      unit: "%",
      value: null,
      previousValue: null,
      change: null,
      changePercent: null,
      lastUpdated: "",
      interpretation: "",
      trend: "neutral",
      riskLevel: "low"
    },
    {
      id: "cre_risk_perception",
      name: "상업용 부동산 위험 인식 지표",
      description: "가격이 아니라 은행의 판단이 먼저 움직인다는 원리 구조하에 은행이 CRE 대출을 위험하다고 느끼는 비율",
      fredSeriesId: "DRCRELEXFACBS",
      unit: "%",
      value: null,
      previousValue: null,
      change: null,
      changePercent: null,
      lastUpdated: "",
      interpretation: "",
      trend: "neutral",
      riskLevel: "low"
    },
    {
      id: "interest_coverage_tail_risk",
      name: "기업 이자보상 능력의 꼬리",
      description: "신용 위기는 항상 가장 약한 기업부터 터진다는 원리에 의해 기업 현금성자산과 고금리 환경에서 하락 전환이 위험하다는 걸 알 수 있는 지표",
      fredSeriesId: "A053RC1Q027SBEA",
      unit: "%",
      value: null,
      previousValue: null,
      change: null,
      changePercent: null,
      lastUpdated: "",
      interpretation: "",
      trend: "neutral",
      riskLevel: "low"
    },
    {
      id: "mmf_flows",
      name: "MMF 자금이동 경로",
      description: "공포는 증가가 아니라 어디서 어디로 이동하는지로 드러난다는 구조 원리에 의해 판단하는 개념",
      fredSeriesId: "MMMFFAQ027S",
      unit: "억 달러",
      value: null,
      previousValue: null,
      change: null,
      changePercent: null,
      lastUpdated: "",
      interpretation: "",
      trend: "neutral",
      riskLevel: "low"
    },
    {
      id: "tga",
      name: "미 재무부 일반계정 (TGA)",
      description: "정부가 시장 유동성을 흡수하거나 푸는 숨겨진 밸브",
      fredSeriesId: "WTREGEN",
      unit: "억 달러",
      value: null,
      previousValue: null,
      change: null,
      changePercent: null,
      lastUpdated: "",
      interpretation: "",
      trend: "neutral",
      riskLevel: "low"
    },
    {
      id: "primary_dealer_positioning",
      name: "프라이머리 딜러 포지션",
      description: "시장을 떠받치던 거대한 손들이 먼저 내려놓는 순간을 알 수 있는 지표",
      alternativeSource: "NY Fed Primary Dealer Statistics",
      unit: "억 달러",
      value: null,
      previousValue: null,
      change: null,
      changePercent: null,
      lastUpdated: "",
      interpretation: "",
      trend: "neutral",
      riskLevel: "low"
    },
    {
      id: "dollar_strength_quality",
      name: "달러 강세의 질",
      description: "성장달러인가 공포달러인가를 가르는 기준으로 보는 지표",
      fredSeriesId: "DTWEXBGS",
      unit: "지수",
      value: null,
      previousValue: null,
      change: null,
      changePercent: null,
      lastUpdated: "",
      interpretation: "",
      trend: "neutral",
      riskLevel: "low"
    },
    {
      id: "global_trade_finance_stress",
      name: "글로벌 무역금융 위축",
      description: "실물 경제의 순환이 막히기 시작하는 신호를 알 수 있는 지표",
      alternativeSource: "BIS, ICC",
      unit: "지수",
      value: null,
      previousValue: null,
      change: null,
      changePercent: null,
      lastUpdated: "",
      interpretation: "",
      trend: "neutral",
      riskLevel: "low"
    },
    {
      id: "sovereign_risk_gap",
      name: "국가 CDS vs 환율 괴리",
      description: "시장이 판단하는 이 나라는 믿을 수 있는 국가인가에 대해 알 수 있는 지표",
      alternativeSource: "worldgovernmentbonds, indexergo.com",
      unit: "bp",
      value: null,
      previousValue: null,
      change: null,
      changePercent: null,
      lastUpdated: "",
      interpretation: "",
      trend: "neutral",
      riskLevel: "low"
    }
  ];
  
  // FRED API로 데이터 가져오기
  for (const indicator of indicators) {
    if (indicator.fredSeriesId) {
      try {
        const data = await fetchFRED(indicator.fredSeriesId);
        if (data) {
          indicator.value = data.value;
          indicator.previousValue = data.previousValue;
          indicator.change = data.value - data.previousValue;
          indicator.changePercent = ((data.value - data.previousValue) / data.previousValue) * 100;
          indicator.lastUpdated = data.date;
          indicator.trend = indicator.change > 0 ? "up" : indicator.change < 0 ? "down" : "neutral";
          indicator.riskLevel = determineRiskLevel(indicator, indicator.change, indicator.changePercent);
          indicator.interpretation = generateInterpretation(
            indicator,
            data.value,
            data.previousValue,
            indicator.change,
            indicator.changePercent
          );
        }
      } catch (error) {
        console.error(`Failed to fetch ${indicator.name}:`, error);
      }
    }
  }
  
  return indicators;
}

