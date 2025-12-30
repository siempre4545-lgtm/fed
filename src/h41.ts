import * as cheerio from "cheerio";
import { promises as fs } from "fs";
import { join } from "path";

export type H41Card = {
  key: string;              // ⓐ, ⓑ ...
  title: string;            // 표시명
  fedLabel: string;         // H.4.1 원문 라벨(매칭 기준)
  balance_musd: number;     // 잔액 (Millions of USD)
  change_musd: number;      // 전주 대비 변화 (Millions of USD)
  balance_okeusd: number;   // 잔액 (억 달러) = musd / 100
  change_okeusd: number;    // 변화 (억 달러)
  liquidityTag: "흡수(약재)" | "공급(해열)" | "QT/자산" | "상태";
  concept: string;          // 계정 개념 설명
  interpretation: string;  // 해석 (의미와 전개만)
  dataDate: string;         // 데이터 날짜 (Week ended)
  qtQeSignal?: "QT" | "QE" | "중립"; // QT/QE 신호
};

export type WarningLevel = 0 | 1 | 2 | 3;

export type TeamSignal = {
  blueTeam: string;
  whiteTeam: string;
  summary: string;
};

export type HistoricalData = {
  date: string;  // ISO date string
  weekEnded: string;
  cards: Array<{
    fedLabel: string;
    balance_musd: number;
    change_musd: number;
  }>;
};

export type H41Report = {
  releaseDateText: string;   // "December 18, 2025"
  asOfWeekEndedText: string; // "Dec 17, 2025"
  sourceUrl: string;
  cards: H41Card[];
  updatedAtISO: string;
  // 새로 추가된 필드들
  warningLevel: WarningLevel;
  assetGuidance: string;
  teamSignal: TeamSignal;
  weeklySummary: string;
  coreCards: H41Card[]; // 핵심 6개만
};

const SOURCE_URL = "https://www.federalreserve.gov/releases/h41/current/";
const ARCHIVE_BASE_URL = "https://www.federalreserve.gov/releases/h41/";
const DATA_DIR = join(process.cwd(), "data");
const HISTORICAL_DATA_FILE = join(DATA_DIR, "historical.json");

/**
 * H.4.1 current page는 텍스트가 길게 풀린 구조라,
 * "라벨 텍스트"를 찾고 그 다음에 등장하는 숫자 2개(week ended, change from prev week)를 잡는 방식이 가장 튼튼합니다.
 */
function parseNumberFromText(t: string): number | null {
  // "  833,093" 같은 형식 처리
  const cleaned = t.replace(/\u00a0/g, " ").trim();
  if (!cleaned) return null;

  // 부호(+/-) 보존, 콤마 제거
  const m = cleaned.match(/^([+-])?\s*([\d,]+)$/);
  if (!m) return null;
  const sign = m[1] === "-" ? -1 : 1;
  const n = Number(m[2].replace(/,/g, ""));
  if (!Number.isFinite(n)) return null;
  return sign * n;
}

function toOkEusd(musd: number): number {
  // Millions of USD -> 억 달러(100M)
  return musd / 100;
}

/**
 * 날짜를 yyyy-mm-dd 형식으로 변환
 * "December 18, 2025" -> "2025-12-18"
 * "Dec 17, 2025" -> "2025-12-17"
 */
function formatDateToYYYYMMDD(dateStr: string): string {
  try {
    // "December 18, 2025" 또는 "Dec 17, 2025" 형식 파싱
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      return dateStr; // 파싱 실패 시 원본 반환
    }
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  } catch {
    return dateStr; // 에러 시 원본 반환
  }
}

function fmtOk(v: number): string {
  const sign = v > 0 ? "+" : v < 0 ? "-" : "";
  const abs = Math.abs(v);
  // 소수 1자리 정도가 읽기 좋음(원하면 0자리로 바꿔도 됨)
  return `${sign}$${abs.toFixed(1)}억`;
}

/**
 * 계정 개념 설명 생성
 */
export function getConcept(fedLabel: string, liquidityTag: H41Card["liquidityTag"]): string {
  if (fedLabel.includes("Treasury") && fedLabel.includes("General Account")) {
    return "재무부 일반계정(TGA)은 정부가 징수한 세금과 국채 발행 자금을 보관하는 계정입니다. TGA가 증가하면 정부가 시중에서 자금을 흡수하는 것이고, 감소하면 정부가 지출하여 시중에 자금을 공급하는 것입니다.";
  }
  if (fedLabel.includes("Reverse repurchase")) {
    return "역리포(RRP)는 금융기관이 연준에 단기 자금을 예치하는 수단입니다. RRP 증가는 시중 유동성이 연준으로 흡수되고 있음을 의미하며, 감소는 시장으로 유동성이 돌아가고 있음을 의미합니다.";
  }
  if (fedLabel.includes("Repurchase agreements") && !fedLabel.includes("Reverse")) {
    return "리포(Repo)는 연준이 금융기관에 단기 자금을 공급하는 수단입니다. Repo 증가는 연준의 유동성 공급 확대를 의미하며, 감소는 공급 축소를 의미합니다.";
  }
  if (fedLabel.includes("Primary credit")) {
    return "Primary Credit은 은행들이 연준으로부터 직접 차입하는 융자입니다. 이는 금융 시스템의 유동성 공급 수단 중 하나로, 증가는 유동성 공급 확대를 의미합니다.";
  }
  if (fedLabel.includes("Securities held outright")) {
    return "보유증권 총계는 연준이 보유한 국채와 MBS의 총액입니다. 이는 연준의 자산 규모를 나타내며, 감소는 양적긴축(QT), 증가는 양적완화(QE)를 의미합니다.";
  }
  if (fedLabel.includes("Reserve balances")) {
    return "지준금(Reserve balances)은 은행들이 연준에 예치한 준비금입니다. 이는 은행 시스템의 유동성 쿠션을 나타내며, 증가는 대출 여력 확대, 감소는 대출 여력 축소를 의미합니다.";
  }
  return "";
}

/**
 * QT/QE 신호 판단
 */
function getQtQeSignal(
  fedLabel: string,
  change_musd: number
): "QT" | "QE" | "중립" {
  if (fedLabel.includes("Securities held outright")) {
    // 보유증권 감소 = QT, 증가 = QE
    if (change_musd < -20000) return "QT"; // 200억 이상 감소
    if (change_musd > 20000) return "QE"; // 200억 이상 증가
    return "중립";
  }
  return "중립";
}

/**
 * 동적 해석을 위한 주간 컨텍스트 생성 (향후 확장 가능)
 * 실제 경제 뉴스, 금리, 주가 등을 분석하여 매주 다른 해석 제공
 */
async function getWeeklyContext(): Promise<{
  weekNumber: number;
  month: number;
  context: string;
}> {
  const now = new Date();
  const weekNumber = Math.ceil(now.getDate() / 7);
  const month = now.getMonth() + 1;
  
  // 향후: 경제 뉴스, 금리 데이터, 주가 지수 등을 가져와서 컨텍스트 생성
  // 현재는 기본 구조만 제공
  const contexts = [
    "이번 주는 연준의 통화정책 방향성에 대한 시장의 관심이 높아진 가운데",
    "최근 금리 변동성과 자금 시장의 스트레스 지표를 고려할 때",
    "주요 경제 지표와 인플레이션 데이터를 종합하면",
    "금융 시장의 리스크 선호도 변화와 함께",
    "글로벌 유동성 환경과 달러 강세를 고려하면"
  ];
  
  const context = contexts[weekNumber % contexts.length];
  
  return { weekNumber, month, context };
}

/**
 * 해석 생성 (의미와 전개만, 수치는 제외)
 * 매주 다른 컨텍스트를 반영하여 동적 해석 제공
 */
async function interpret(rule: {
  liquidityTag: H41Card["liquidityTag"];
  title: string;
  fedLabel: string;
  change_musd: number;
  balance_musd: number;
}, weeklyContext: { weekNumber: number; month: number; context: string }): Promise<string> {
  const ch = rule.change_musd;
  const absCh = Math.abs(ch);
  const absChOk = absCh / 100; // 억 달러 단위
  
  // 머릿말과 본문을 분리하여 반환 (내용이 잘리지 않도록 전체 표시)
  const formatInterpretation = (headline: string, body: string, context?: string): string => {
    // 컨텍스트가 있으면 앞에 추가
    let fullBody = body;
    if (context) {
      fullBody = `${context} ${body}`;
    }
    
    // 머릿말만 볼드 처리하고, 본문은 그대로 표시 (키워드 강조 제거, ** 기호 제거)
    return `${headline}\n${fullBody}`;
  };

  // 변화가 0이면
  if (ch === 0) {
    switch (rule.liquidityTag) {
      case "흡수(약재)":
        return formatInterpretation(
          "현재 상태 유지 중",
          "이 지표가 변동이 없다는 건, 연준과 재무부가 의도적으로 이 수준을 유지하고 있다는 신호예요. 거대 자본가들은 이런 '정지 상태'를 기회로 봅니다. 시장이 예측 가능한 구간에 있다는 뜻이니까요. 블랙록이나 뱅가드 같은 기관들은 이런 때 포지션을 조정하거나 새로운 전략을 준비합니다."
        );
      case "공급(해열)":
        return formatInterpretation(
          "유동성 공급 안정",
          "연준이 시장에 자금을 공급하는 속도가 일정하게 유지되고 있어요. 이건 연준이 '지금 이 정도면 충분하다'고 판단하고 있다는 의미입니다. 미국의 금융 헤게모니 관점에서 보면, 글로벌 달러 유동성을 적절히 관리하면서도 시장 안정성을 유지하려는 의도로 읽힙니다."
        );
      case "QT/자산":
        return formatInterpretation(
          "QT 속도 일시 정지",
          "연준의 자산 축소가 잠시 멈춘 상태네요. 이건 단순히 'QT 중단'이 아니라, 연준이 시장 반응을 지켜보는 중이라는 신호입니다. 거대 자본가들은 이런 '호흡 조절' 시점을 매우 주의 깊게 봅니다. 다음 움직임이 더 중요해질 거예요."
        );
      case "상태":
        if (rule.fedLabel.includes("Reserve balances")) {
          return formatInterpretation(
            "은행 시스템 쿠션 유지",
            "은행들이 연준에 예치한 준비금이 안정적이라는 건, 금융 시스템이 여유 있는 상태라는 뜻입니다. 이건 미국이 글로벌 금융 시스템을 통제할 수 있는 여력이 충분하다는 신호예요. 거대 자본가들은 이런 안정성이 언제까지 지속될지가 관심사입니다."
          );
        }
        return formatInterpretation(
          "현재 수준 유지",
          "이 지표가 변동이 없다는 건, 시스템이 의도한 대로 작동하고 있다는 의미입니다. 거시적으로 보면 큰 변화가 없는 게 오히려 중요한 신호일 수 있어요."
        );
    }
  }

  switch (rule.liquidityTag) {
    case "흡수(약재)":
      if (rule.fedLabel.includes("Treasury")) {
        // TGA
        if (ch > 0) {
          return formatInterpretation(
            "정부 자금 흡수로 시장 유동성 압박",
            "재무부가 세금 징수나 국채 발행 자금을 예치하면서 시중 유동성이 정부 계정으로 흡수되고 있습니다. 이는 단기적으로 자금 시장의 금리 상승 압력과 자산 가격 조정 압력으로 작용할 수 있습니다.",
            weeklyContext.context
          );
        } else {
          return formatInterpretation(
            "정부 지출 확대로 시장 유동성 공급",
            "재무부가 예치된 자금을 지출하면서 시중 유동성이 공급되고 있습니다. 이는 자금 시장의 금리 하락 압력과 자산 가격 상승 요인으로 작용할 수 있습니다.",
            weeklyContext.context
          );
        }
      } else if (rule.fedLabel.includes("Reverse repurchase")) {
        // RRP
        if (ch > 0) {
          return formatInterpretation(
            "큰 손들이 연준에 돈을 맡기고 있어요",
            "RRP가 늘어난다는 건, 뱅가드나 블랙록 같은 거대 금융기관들이 '안전한 곳'에 돈을 맡기고 있다는 신호입니다. 이게 왜 중요한가? 이들은 시장에서 가장 예리한 눈을 가진 자본가들이거든요. RRP에 돈을 맡긴다는 건, 지금 시장에 매력적인 투자처가 없다고 판단하거나, 곧 변동성이 커질 거라고 예상한다는 뜻입니다. 미국의 관점에서 보면, 이건 달러가 여전히 '최고의 안전자산'으로 인정받고 있다는 증거예요. 글로벌 자본이 미국으로 몰리는 구조가 유지되고 있다는 거죠.",
            weeklyContext.context
          );
        } else {
          return formatInterpretation(
            "큰 손들이 연준에서 돈을 빼내고 있어요",
            "RRP에서 돈이 빠져나간다는 건, 거대 자본가들이 '이제 움직일 때다'고 판단했다는 신호입니다. 이들은 연준에 돈을 맡겨두는 것보다 시장에서 더 나은 기회를 찾고 있다는 뜻이에요. 이런 움직임은 보통 자산 가격 상승의 전조가 됩니다. 뱅가드나 블랙록 같은 기관들이 포지션을 늘리기 시작했다는 의미니까요. 미국의 헤게모니 관점에서 보면, 이건 글로벌 자본이 다시 미국 자산으로 몰리기 시작한다는 신호일 수 있어요.",
            weeklyContext.context
          );
        }
      } else {
        if (ch > 0) {
          return formatInterpretation(
            "시장에서 돈이 빠져나가고 있어요",
            "이 지표가 커진다는 건, 시장에 돌아다니는 유동성이 줄어든다는 뜻입니다. 거대 자본가들의 관점에서 보면, 이런 시점은 방어적으로 포지션을 조정해야 할 때예요. 미국이 글로벌 달러 유동성을 조절하면서 자산 가격을 통제하려는 의도로 읽힙니다. 뱅가드나 블랙록 같은 기관들은 이런 환경에서 고변동성 자산의 비중을 줄이고, 현금이나 방어적 자산으로 전환합니다."
          );
        } else {
          return formatInterpretation(
            "시장에 돈이 다시 돌아오고 있어요",
            "이 지표가 줄어든다는 건, 유동성 압박이 완화되고 있다는 신호입니다. 거대 자본가들은 이런 시점을 기회로 봅니다. 유동성이 풀리면서 자산 가격이 오를 여지가 생기니까요. 하지만 여기서 중요한 건, 이게 일시적인지 지속적인지 판단하는 거예요. 미국의 정책 의도를 정확히 읽어야 합니다."
          );
        }
      }
    case "공급(해열)":
      if (rule.fedLabel.includes("Repurchase agreements")) {
        // Repo
        if (ch > 0) {
          return formatInterpretation(
            "연준이 시장에 돈을 푸는 속도를 높이고 있어요",
            "Repo가 늘어난다는 건, 연준이 금융기관들에게 단기 자금을 더 많이 빌려주고 있다는 뜻입니다. 이게 단순히 '돈을 풀어준다'는 게 아니라, 연준이 시장의 유동성 부족을 감지하고 적극적으로 개입하고 있다는 신호예요. 거대 자본가들은 이런 움직임을 매우 주의 깊게 봅니다. 연준이 '시장을 구제'하려고 나선다는 건, 뭔가 문제가 있다는 뜻일 수도 있거든요. 하지만 동시에 유동성이 풀리면서 자산 가격이 오를 기회가 생기기도 합니다. 미국의 헤게모니 관점에서 보면, 이건 글로벌 금융 시스템을 안정시키면서도 달러의 지배력을 유지하는 전략의 일부입니다.",
            weeklyContext.context
          );
        } else {
          return formatInterpretation(
            "연준이 돈 풀기를 줄이고 있어요",
            "Repo가 줄어든다는 건, 연준이 시장 개입을 축소하고 있다는 신호입니다. 이게 왜 중요한가? 연준이 '이제 시장이 스스로 돌아갈 수 있다'고 판단했다는 뜻이거든요. 거대 자본가들은 이런 시점을 매우 예리하게 봅니다. 연준의 지원이 줄어들면 시장이 더 취약해질 수 있으니까요. 뱅가드나 블랙록 같은 기관들은 이런 환경에서 포지션을 더 방어적으로 조정합니다.",
            weeklyContext.context
          );
        }
      } else if (rule.fedLabel.includes("Primary credit")) {
        if (ch > 0) {
          return formatInterpretation(
            "은행들이 연준에 SOS 신호를 보내고 있어요",
            "Primary Credit이 늘어난다는 건, 은행들이 시장에서 돈을 못 빌려서 연준에 직접 와서 빌리고 있다는 뜻입니다. 이건 금융 시스템에 스트레스가 있다는 신호예요. 거대 자본가들은 이런 지표를 매우 경계합니다. 은행들이 돈을 못 빌린다는 건, 신용 경색이 시작될 수 있다는 뜻이거든요. 미국의 관점에서 보면, 이건 금융 시스템의 취약점이 노출되고 있다는 신호일 수 있어요. 하지만 동시에 연준이 개입해서 시스템을 구제하려는 의도로도 읽힙니다.",
            weeklyContext.context
          );
        } else {
          return formatInterpretation(
            "은행 시스템이 안정되고 있어요",
            "Primary Credit이 줄어든다는 건, 은행들이 시장에서 정상적으로 돈을 빌릴 수 있다는 뜻입니다. 이건 금융 시스템이 건강하다는 신호예요. 거대 자본가들은 이런 안정성을 좋아합니다. 시스템이 정상 작동하면 자산 가격도 안정적으로 움직일 가능성이 높으니까요. 미국의 헤게모니 관점에서 보면, 이건 글로벌 금융 시스템이 달러 중심으로 잘 돌아가고 있다는 증거입니다.",
            weeklyContext.context
          );
        }
      } else {
        if (ch > 0) {
          return formatInterpretation(
            "시장에 돈이 더 풀리고 있어요",
            "이 지표가 커진다는 건, 유동성 공급이 늘어나고 있다는 뜻입니다. 거대 자본가들은 이런 시점을 기회로 봅니다. 유동성이 풀리면 자산 가격이 오를 여지가 생기니까요. 하지만 여기서 중요한 건, 이게 연준의 의도적인 정책인지, 아니면 일시적인 현상인지 판단하는 거예요.",
            weeklyContext.context
          );
        } else {
          return formatInterpretation(
            "시장에 풀리는 돈이 줄어들고 있어요",
            "이 지표가 줄어든다는 건, 유동성 공급이 축소되고 있다는 신호입니다. 거대 자본가들은 이런 환경에서 더 신중해집니다. 유동성이 줄어들면 자산 가격에 압박이 가해질 수 있으니까요. 미국의 정책 의도를 정확히 읽어야 합니다.",
            weeklyContext.context
          );
        }
      }
    case "QT/자산":
      if (ch < 0) {
        const qtSpeed = absChOk > 50 ? "급속" : absChOk > 20 ? "지속" : "완만";
        return formatInterpretation(
          "연준이 대차대조표를 줄이고 있어요",
          `연준이 보유한 증권을 줄이고 있다는 건, 양적긴축(QT)이 ${qtSpeed}하게 진행되고 있다는 뜻입니다. 이게 왜 중요한가? 연준이 시장에서 돈을 빨아들이고 있다는 거거든요. 거대 자본가들의 관점에서 보면, 이건 미국이 글로벌 달러 유동성을 조절하면서 자산 가격을 통제하려는 전략입니다. 블랙록이나 뱅가드 같은 기관들은 QT가 진행될 때 포트폴리오를 더 방어적으로 조정합니다. 미국의 헤게모니 관점에서 보면, 이건 달러 강세를 유지하고 글로벌 자본을 미국으로 끌어들이는 수단이에요. QT가 빠를수록 시장 변동성이 커질 수 있으니, 거대 자본가들은 이런 시점에 현금 비중을 늘리거나 방어적 자산으로 전환합니다.`,
          weeklyContext.context
        );
      } else {
        return formatInterpretation(
          "연준이 자산 축소 속도를 늦추고 있어요",
          "연준의 보유증권이 줄어드는 속도가 둔화되고 있다는 건, QT 압력이 완화되고 있다는 신호입니다. 이게 단순히 'QT 중단'이 아니라, 연준이 시장 반응을 지켜보면서 속도를 조절하고 있다는 뜻이에요. 거대 자본가들은 이런 '호흡 조절' 시점을 매우 주의 깊게 봅니다. 연준이 다음에 어떤 결정을 내릴지가 핵심이거든요. 미국의 관점에서 보면, 이건 글로벌 금융 시스템의 안정성을 고려하면서도 달러의 지배력을 유지하려는 균형 전략입니다.",
          weeklyContext.context
        );
      }
    case "상태":
      if (rule.fedLabel.includes("Reserve balances")) {
        if (ch < 0) {
          return formatInterpretation(
            "은행 시스템의 안전 쿠션이 줄어들고 있어요",
            "지준금이 줄어든다는 건, 은행들이 연준에 예치한 준비금이 감소하고 있다는 뜻입니다. 이게 왜 중요한가? 이건 금융 시스템의 '안전 쿠션'이 줄어든다는 신호거든요. 거대 자본가들은 이런 지표를 매우 경계합니다. 지준금이 일정 수준 이하로 떨어지면, 은행들이 돈을 빌리기 어려워지고 신용 경색이 시작될 수 있으니까요. 미국의 헤게모니 관점에서 보면, 이건 금융 시스템의 취약점이 노출되고 있다는 신호일 수 있어요. 하지만 동시에 연준이 이런 상황을 감지하고 있다면, 곧 개입할 가능성도 있습니다. 뱅가드나 블랙록 같은 기관들은 이런 시점에 더 방어적으로 포지션을 조정합니다.",
            weeklyContext.context
          );
        } else {
          return formatInterpretation(
            "은행 시스템이 여유 있는 상태예요",
            "지준금이 늘어난다는 건, 은행들이 연준에 예치한 준비금이 증가하고 있다는 뜻입니다. 이건 금융 시스템이 건강하고 여유 있다는 신호예요. 거대 자본가들은 이런 안정성을 좋아합니다. 시스템이 정상 작동하면 자산 가격도 안정적으로 움직일 가능성이 높으니까요. 미국의 헤게모니 관점에서 보면, 이건 글로벌 금융 시스템이 달러 중심으로 잘 돌아가고 있다는 증거입니다. 은행들이 충분한 유동성을 가지고 있다는 건, 미국이 글로벌 금융 시스템을 통제할 수 있는 여력이 충분하다는 뜻이에요.",
            weeklyContext.context
          );
        }
      }
      return ch > 0
        ? formatInterpretation("이 지표의 영향력이 커지고 있어요", "이 지표가 커진다는 건, 시장에 미치는 영향력이 증가하고 있다는 뜻입니다. 거대 자본가들은 이런 변화를 주의 깊게 봅니다. 지표의 규모가 커지면, 그 지표가 시장에 미치는 영향도 커지니까요. 미국의 정책 의도를 정확히 읽어야 합니다.")
        : formatInterpretation("이 지표의 영향력이 줄어들고 있어요", "이 지표가 줄어든다는 건, 시장에 미치는 영향력이 감소하고 있다는 신호입니다. 거대 자본가들은 이런 변화를 주의 깊게 봅니다. 지표의 규모가 줄어들면, 그 지표가 시장에 미치는 영향도 줄어들 수 있으니까요.");
  }
}

export const ITEM_DEFS: Array<{
  key: string;
  title: string;
  fedLabel: string;
  liquidityTag: H41Card["liquidityTag"];
  isCore?: boolean; // 핵심 6개 항목 표시
}> = [
  { key: "ⓐ", title: "재무부 일반계정 (TGA)", fedLabel: "U.S. Treasury, General Account", liquidityTag: "흡수(약재)", isCore: true },
  { key: "ⓑ", title: "역리포 (RRP)", fedLabel: "Reverse repurchase agreements", liquidityTag: "흡수(약재)", isCore: true },
  { key: "ⓒ", title: "통화발행 (현금)", fedLabel: "Currency in circulation", liquidityTag: "흡수(약재)" },
  { key: "ⓓ", title: "기타 부채·자본", fedLabel: "Other liabilities and capital", liquidityTag: "흡수(약재)" },

  { key: "ⓔ", title: "리포 (Repo)", fedLabel: "Repurchase agreements", liquidityTag: "공급(해열)", isCore: true },
  { key: "ⓕ", title: "Primary Credit", fedLabel: "Primary credit", liquidityTag: "공급(해열)", isCore: true },
  { key: "ⓖ", title: "달러 스왑 (중앙은행)", fedLabel: "Central bank liquidity swaps", liquidityTag: "공급(해열)" },

  { key: "ⓗ", title: "보유증권 총계", fedLabel: "Securities held outright", liquidityTag: "QT/자산", isCore: true },
  { key: "ⓘ", title: "미국 국채 보유 (UST)", fedLabel: "U.S. Treasury securities", liquidityTag: "QT/자산" },
  { key: "ⓙ", title: "MBS 보유", fedLabel: "Mortgage-backed securities", liquidityTag: "QT/자산" },

  { key: "ⓚ", title: "지준금 (Reserve balances)", fedLabel: "Reserve balances with Federal Reserve Banks", liquidityTag: "상태", isCore: true },
  { key: "ⓛ", title: "Fed 자산 총규모 (Reserve Bank credit)", fedLabel: "Reserve Bank credit", liquidityTag: "상태" },
  { key: "ⓜ", title: "기타 예치금 (지준금 제외)", fedLabel: "Deposits with F.R. Banks, other than reserve balances", liquidityTag: "상태" },
  { key: "ⓝ", title: "흡수 총합 (지준금 제외)", fedLabel: "Total factors, other than reserve balances,", liquidityTag: "상태" }
];

// 핵심 6개 항목의 fedLabel 목록
const CORE_FED_LABELS = [
  "U.S. Treasury, General Account",
  "Reverse repurchase agreements",
  "Reserve balances with Federal Reserve Banks",
  "Securities held outright",
  "Repurchase agreements",
  "Primary credit"
];

/**
 * 경고 레벨 계산 (LEVEL 0~3)
 * 유동성 흡수 요인과 QT 진행 속도를 종합 평가
 */
function calculateWarningLevel(cards: H41Card[]): WarningLevel {
  // 핵심 항목 찾기
  const tga = cards.find(c => c.fedLabel === "U.S. Treasury, General Account");
  const rrp = cards.find(c => c.fedLabel === "Reverse repurchase agreements");
  const reserves = cards.find(c => c.fedLabel === "Reserve balances with Federal Reserve Banks");
  const securities = cards.find(c => c.fedLabel === "Securities held outright");
  const repo = cards.find(c => c.fedLabel === "Repurchase agreements");
  const primaryCredit = cards.find(c => c.fedLabel === "Primary credit");

  let score = 0;

  // TGA 증가 = 유동성 흡수 강화
  if (tga && tga.change_musd > 50000) score += 1; // 500억 이상 증가
  if (tga && tga.change_musd > 100000) score += 1; // 1000억 이상 증가

  // RRP 증가 = 유동성 흡수 강화
  if (rrp && rrp.change_musd > 30000) score += 1;
  if (rrp && rrp.change_musd > 60000) score += 1;

  // 지준금 감소 = 시스템 쿠션 축소
  if (reserves && reserves.change_musd < -50000) score += 1;
  if (reserves && reserves.change_musd < -100000) score += 1;

  // QT 진행 (보유증권 감소)
  if (securities && securities.change_musd < -50000) score += 1;
  if (securities && securities.change_musd < -100000) score += 1;

  // 공급 요인 감소 (Repo, Primary Credit 감소)
  const supplyDecrease = (repo?.change_musd ?? 0) + (primaryCredit?.change_musd ?? 0);
  if (supplyDecrease < -20000) score += 1;

  // 점수에 따라 레벨 결정
  if (score >= 6) return 3;
  if (score >= 4) return 2;
  if (score >= 2) return 1;
  return 0;
}

/**
 * 경고 레벨별 자산군 대응 가이드
 */
function getAssetGuidance(level: WarningLevel): string {
  const guides: Record<WarningLevel, string> = {
    0: "유동성 환경이 안정적인 국면입니다.\n성장주, 기술주, 장기 테마 자산에 대한 비중 확대가 가능한 구간입니다.",
    1: "유동성 흡수 신호가 일부 관측됩니다.\n공격적 자산 비중은 유지하되, 변동성 확대에 대비한 분산이 필요한 국면입니다.",
    2: "유동성 압박이 가시화되고 있습니다.\n방어적 자산과 현금성 비중을 점진적으로 높일 필요가 있습니다.",
    3: "유동성 급감과 긴축 가속이 동시에 진행 중입니다.\n고위험 자산 비중 축소와 방어적 포지션 유지가 우선되는 국면입니다."
  };
  return guides[level];
}

/**
 * 청팀/백팀 시그널 생성
 */
function getTeamSignal(level: WarningLevel): TeamSignal {
  const signals: Record<WarningLevel, TeamSignal> = {
    0: {
      blueTeam: "비중 확대 가능",
      whiteTeam: "기본 유지",
      summary: "청팀 우호적 환경 · 백팀 중립"
    },
    1: {
      blueTeam: "선별적 유지",
      whiteTeam: "점진적 관심",
      summary: "청팀 유지 · 백팀 관찰 필요"
    },
    2: {
      blueTeam: "비중 축소 권장",
      whiteTeam: "비중 확대 구간",
      summary: "청팀 리스크 관리 필요 · 백팀 우세 국면"
    },
    3: {
      blueTeam: "방어적 축소",
      whiteTeam: "핵심 포지션",
      summary: "청팀 방어 전환 · 백팀 중심 대응"
    }
  };
  return signals[level];
}

/**
 * 주간 요약 리포트 생성 (상세 버전)
 */
function generateWeeklySummary(cards: H41Card[], level: WarningLevel, teamSignal: TeamSignal): string {
  const tga = cards.find(c => c.fedLabel === "U.S. Treasury, General Account");
  const rrp = cards.find(c => c.fedLabel === "Reverse repurchase agreements");
  const reserves = cards.find(c => c.fedLabel === "Reserve balances with Federal Reserve Banks");
  const securities = cards.find(c => c.fedLabel === "Securities held outright");
  const repo = cards.find(c => c.fedLabel === "Repurchase agreements");
  const primaryCredit = cards.find(c => c.fedLabel === "Primary credit");
  const currency = cards.find(c => c.fedLabel === "Currency in circulation");
  const reserveBankCredit = cards.find(c => c.fedLabel === "Reserve Bank credit");
  const ust = cards.find(c => c.fedLabel === "U.S. Treasury securities");
  const mbs = cards.find(c => c.fedLabel === "Mortgage-backed securities");

  const parts: string[] = [];

  // 0) 주요 문구 (20자 내외, 볼드+이모지)
  const levelText = ["안정", "주의", "경계", "위험"][level];
  const mainPhrases = {
    0: "✅ 큰 손들이 움직일 여유가 있는 구간",
    1: "⚠️ 거대 자본가들이 신중해지는 시점",
    2: "🔶 미국이 유동성을 조절하고 있어요",
    3: "🚨 금융패권자들이 방어 모드로 전환"
  };
  parts.push(`**${mainPhrases[level]}**`);

  // 1) 이번 주 거시경제 이면 읽기
  parts.push(`\n[이번 주 거시경제 이면 읽기]`);
  
  if (level >= 2) {
    parts.push(`이번 주 데이터를 보면, 미국이 글로벌 달러 유동성을 **의도적으로 조절**하고 있다는 게 보여요. TGA와 RRP가 동시에 늘어난다는 건, 시장에서 돈을 빨아들이는 메커니즘이 작동하고 있다는 뜻입니다. 이게 단순히 '유동성 부족'이 아니라, 미국이 **달러 강세를 유지**하면서 **글로벌 자본을 미국으로 끌어들이는 전략**의 일부로 읽혀요.`);
    parts.push(`블랙록이나 뱅가드 같은 거대 자본가들은 이런 시점을 매우 주의 깊게 봅니다. 유동성이 줄어들면 자산 가격에 압박이 가해지니까, 이들은 포트폴리오를 더 방어적으로 조정합니다. 특히 고변동성 자산의 비중을 줄이고, 현금이나 방어적 자산으로 전환하는 움직임이 보여요.`);
  } else if (level === 1) {
    parts.push(`이번 주는 일부 신호들이 섞여 있어요. TGA나 RRP 같은 흡수 요인이 조금씩 보이지만, 아직은 **시스템이 안정적으로 돌아가고 있는** 상태입니다. 거대 자본가들의 관점에서 보면, 이건 '관찰 모드'에 들어간 시점이에요.`);
    parts.push(`뱅가드나 블랙록 같은 기관들은 이런 환경에서 포지션을 크게 바꾸지 않습니다. 하지만 유동성 압박 신호가 계속되면, 곧 방어적으로 전환할 준비를 하고 있어요.`);
  } else {
    parts.push(`이번 주 데이터를 보면, 유동성 환경이 비교적 **안정적으로 유지**되고 있어요. 이건 미국이 글로벌 금융 시스템을 통제할 수 있는 여력이 충분하다는 신호입니다.`);
    parts.push(`거대 자본가들의 관점에서 보면, 이런 안정성은 기회예요. 유동성이 충분하면 자산 가격이 오를 여지가 생기니까, 뱅가드나 블랙록 같은 기관들은 이런 시점에 성장 자산의 비중을 늘립니다.`);
  }

  // 2) 핵심 지표의 진짜 의미
  parts.push(`\n[핵심 지표의 진짜 의미]`);
  
  if (tga) {
    const tgaDir = tga.change_okeusd > 0 ? "증가" : tga.change_okeusd < 0 ? "감소" : "변동없음";
    const tgaAbs = Math.abs(tga.change_okeusd);
    if (tga.change_okeusd > 0) {
      parts.push(`• **재무부 계정(TGA)이 ${tgaAbs.toFixed(1)}억 달러 늘어났어요** - 이건 미국 정부가 세금을 받거나 국채를 팔아서 자금을 모으고 있다는 뜻입니다. 이게 왜 중요한가? 미국이 글로벌 달러 유동성을 조절하는 핵심 수단이거든요. TGA가 커지면 시장에 돌아다니는 달러가 줄어들어서, 전 세계 자산 가격에 압박이 가해집니다.`);
    } else if (tga.change_okeusd < 0) {
      parts.push(`• **재무부 계정(TGA)이 ${tgaAbs.toFixed(1)}억 달러 줄어들었어요** - 이건 정부가 지출을 늘리고 있다는 신호입니다. 거대 자본가들은 이런 시점을 노립니다. 유동성이 풀리면서 자산 가격이 오를 여지가 생기니까요.`);
    } else {
      parts.push(`• **재무부 계정(TGA)이 변동이 없어요** - 이건 연준과 재무부가 의도적으로 이 수준을 유지하고 있다는 신호입니다.`);
    }
  }
  
  if (rrp) {
    const rrpDir = rrp.change_okeusd > 0 ? "증가" : rrp.change_okeusd < 0 ? "감소" : "변동없음";
    const rrpAbs = Math.abs(rrp.change_okeusd);
    if (rrp.change_okeusd > 0) {
      parts.push(`• **역리포(RRP)가 ${rrpAbs.toFixed(1)}억 달러 늘어났어요** - 이건 뱅가드나 블랙록 같은 거대 금융기관들이 '안전한 곳'에 돈을 맡기고 있다는 신호입니다. 이들이 시장에서 가장 예리한 눈을 가진 자본가들이거든요. RRP에 돈을 맡긴다는 건, 지금 시장에 매력적인 투자처가 없다고 판단하거나, 곧 변동성이 커질 거라고 예상한다는 뜻입니다.`);
    } else if (rrp.change_okeusd < 0) {
      parts.push(`• **역리포(RRP)가 ${rrpAbs.toFixed(1)}억 달러 줄어들었어요** - 이건 거대 자본가들이 '이제 움직일 때다'고 판단했다는 신호입니다. 이런 움직임은 보통 자산 가격 상승의 전조가 됩니다.`);
    }
  }
  
  if (reserves) {
    const resDir = reserves.change_okeusd > 0 ? "증가" : reserves.change_okeusd < 0 ? "감소" : "변동없음";
    const resAbs = Math.abs(reserves.change_okeusd);
    if (reserves.change_okeusd < 0) {
      parts.push(`• **지준금이 ${resAbs.toFixed(1)}억 달러 줄어들었어요** - 이건 금융 시스템의 '안전 쿠션'이 줄어든다는 신호입니다. 거대 자본가들은 이런 지표를 매우 경계합니다. 지준금이 일정 수준 이하로 떨어지면, 은행들이 돈을 빌리기 어려워지고 신용 경색이 시작될 수 있으니까요.`);
    } else if (reserves.change_okeusd > 0) {
      parts.push(`• **지준금이 ${resAbs.toFixed(1)}억 달러 늘어났어요** - 이건 금융 시스템이 건강하고 여유 있다는 신호입니다. 거대 자본가들은 이런 안정성을 좋아합니다. 시스템이 정상 작동하면 자산 가격도 안정적으로 움직일 가능성이 높으니까요.`);
    }
  }

  // 3) 연준의 진짜 의도 읽기
  parts.push(`\n[연준의 진짜 의도 읽기]`);
  if (securities) {
    const secDir = securities.change_okeusd > 0 ? "증가" : securities.change_okeusd < 0 ? "감소" : "변동없음";
    const secAbs = Math.abs(securities.change_okeusd);
    if (securities.change_okeusd < 0) {
      parts.push(`• **연준이 보유증권을 ${secAbs.toFixed(1)}억 달러 줄였어요** - 이건 양적긴축(QT)이 진행되고 있다는 뜻입니다. 거대 자본가들의 관점에서 보면, 이건 미국이 글로벌 달러 유동성을 조절하면서 자산 가격을 통제하려는 전략입니다. 블랙록이나 뱅가드 같은 기관들은 QT가 진행될 때 포트폴리오를 더 방어적으로 조정합니다.`);
      parts.push(`  미국의 헤게모니 관점에서 보면, 이건 달러 강세를 유지하고 글로벌 자본을 미국으로 끌어들이는 수단이에요. QT가 빠를수록 시장 변동성이 커질 수 있으니, 거대 자본가들은 이런 시점에 현금 비중을 늘리거나 방어적 자산으로 전환합니다.`);
    } else if (securities.change_okeusd > 0) {
      parts.push(`• **연준의 보유증권이 ${secAbs.toFixed(1)}억 달러 늘어났어요** - 이건 QT가 일시적으로 중단되거나 반전 신호일 수 있어요. 거대 자본가들은 이런 변화를 매우 주의 깊게 봅니다.`);
    } else {
      parts.push(`• **연준의 보유증권이 변동이 없어요** - 이건 연준이 시장 반응을 지켜보면서 속도를 조절하고 있다는 뜻입니다.`);
    }
  }

  // 4) 거대 자본가들이 지금 뭘 하고 있는가
  parts.push(`\n[거대 자본가들이 지금 뭘 하고 있는가]`);
  if (repo && repo.change_okeusd > 0) {
    parts.push(`• **연준이 Repo를 늘리고 있어요** - 이건 연준이 시장의 유동성 부족을 감지하고 적극적으로 개입하고 있다는 신호입니다. 거대 자본가들은 이런 움직임을 매우 주의 깊게 봅니다. 연준이 '시장을 구제'하려고 나선다는 건, 뭔가 문제가 있다는 뜻일 수도 있거든요.`);
  }
  if (primaryCredit && primaryCredit.change_okeusd > 0) {
    parts.push(`• **Primary Credit이 늘어났어요** - 이건 은행들이 시장에서 돈을 못 빌려서 연준에 직접 와서 빌리고 있다는 뜻입니다. 이건 금융 시스템에 스트레스가 있다는 신호예요. 거대 자본가들은 이런 지표를 매우 경계합니다.`);
  }

  // 5) 종합 판단 - 코치 관점
  parts.push(`\n[종합 판단 - 코치 관점]`);
  if (level >= 2) {
    parts.push(`지금 상황을 정리하면, 미국이 **의도적으로 유동성을 조절**하고 있어요. 이건 단순히 '경제 정책'이 아니라, **글로벌 금융 헤게모니를 유지하는 전략**의 일부입니다.`);
    parts.push(`거대 자본가들(뱅가드, 블랙록 등)은 이런 환경에서 **방어적으로 포지션을 조정**합니다. 고변동성 자산의 비중을 줄이고, 현금이나 방어적 자산으로 전환하는 움직임이 보여요. 당신도 이들의 움직임을 참고해서 포트폴리오를 조정하는 게 좋을 것 같아요.`);
  } else if (level === 1) {
    parts.push(`지금은 **관찰 모드**에 들어간 시점이에요. 일부 압박 신호가 보이지만, 아직은 시스템이 안정적으로 돌아가고 있습니다.`);
    parts.push(`거대 자본가들은 이런 환경에서 포지션을 크게 바꾸지 않지만, 유동성 압박 신호가 계속되면 곧 방어적으로 전환할 준비를 하고 있어요. 당신도 이런 신호들을 주의 깊게 지켜봐야 합니다.`);
  } else {
    parts.push(`지금은 **거대 자본가들이 움직일 여유가 있는 구간**이에요. 유동성이 충분하면 자산 가격이 오를 여지가 생기니까, 뱅가드나 블랙록 같은 기관들은 이런 시점에 성장 자산의 비중을 늘립니다.`);
    parts.push(`하지만 여기서 중요한 건, 이게 일시적인지 지속적인지 판단하는 거예요. 미국의 정책 의도를 정확히 읽어야 합니다. 거대 자본가들의 다음 움직임을 주의 깊게 지켜보세요.`);
  }

  // 6) 자산군 관점 - 코치 조언
  parts.push(`\n[자산군 관점 - 코치 조언]`);
  parts.push(`**${teamSignal.summary}**`);
  parts.push(`• 청팀(성장·미래 자산): **${teamSignal.blueTeam}**`);
  parts.push(`• 백팀(방어·현금흐름 자산): **${teamSignal.whiteTeam}**`);
  if (level >= 2) {
    parts.push(`지금은 **방어적 자산**에 유리한 환경이에요. 거대 자본가들이 고변동성 자산의 비중을 줄이고 방어적으로 전환하는 시점이니까, 당신도 이들의 움직임을 참고하는 게 좋을 것 같아요.`);
  } else {
    parts.push(`지금은 **성장 자산**에 상대적으로 유리한 환경이에요. 하지만 거대 자본가들이 어떻게 움직이는지 주의 깊게 지켜봐야 합니다. 유동성 환경이 변하면 그들의 포지션도 바뀔 수 있으니까요.`);
  }

  return parts.join("\n");
}

/**
 * 더 유연한 라벨 매칭 (부분 일치, 대소문자 무시)
 */
function findLabelIndex(lines: string[], searchLabel: string): number {
  // 정확한 매칭 시도
  let idx = lines.findIndex(l => l === searchLabel);
  if (idx >= 0) return idx;

  // 대소문자 무시 매칭
  const lowerSearch = searchLabel.toLowerCase();
  idx = lines.findIndex(l => l.toLowerCase() === lowerSearch);
  if (idx >= 0) return idx;

  // 부분 일치 매칭 (핵심 키워드 추출)
  const keywords = searchLabel.toLowerCase().split(/[,\s]+/).filter(k => k.length > 3);
  for (let i = 0; i < lines.length; i++) {
    const lineLower = lines[i].toLowerCase();
    if (keywords.every(kw => lineLower.includes(kw))) {
      return i;
    }
  }

  // 특수 케이스 처리
  if (searchLabel.includes("Reverse repurchase")) {
    idx = lines.findIndex(l => 
      l.toLowerCase().includes("reverse") && 
      (l.toLowerCase().includes("repo") || l.toLowerCase().includes("repurchase"))
    );
    if (idx >= 0) return idx;
  }
  if (searchLabel.includes("Repurchase agreements") && !searchLabel.includes("Reverse")) {
    idx = lines.findIndex(l => 
      l.toLowerCase().includes("repurchase") && 
      !l.toLowerCase().includes("reverse")
    );
    if (idx >= 0) return idx;
  }
  if (searchLabel.includes("Securities held outright")) {
    idx = lines.findIndex(l => 
      l.toLowerCase().includes("securities") && 
      l.toLowerCase().includes("held") &&
      l.toLowerCase().includes("outright")
    );
    if (idx >= 0) return idx;
  }

  return -1;
}

/**
 * 과거 데이터 로드
 */
async function loadHistoricalData(): Promise<HistoricalData[]> {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const data = await fs.readFile(HISTORICAL_DATA_FILE, "utf-8");
    return JSON.parse(data);
  } catch {
    return [];
  }
}

/**
 * 과거 데이터 저장
 */
async function saveHistoricalData(data: HistoricalData): Promise<void> {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const historical = await loadHistoricalData();
    
    // 중복 제거 (같은 날짜가 있으면 제거)
    const filtered = historical.filter(h => h.date !== data.date);
    
    // 새 데이터 추가
    filtered.push(data);
    
    // 날짜순 정렬 (최신이 마지막)
    filtered.sort((a, b) => a.date.localeCompare(b.date));
    
    // 최근 3개월치만 유지 (약 13주)
    const recent = filtered.slice(-13);
    
    await fs.writeFile(HISTORICAL_DATA_FILE, JSON.stringify(recent, null, 2), "utf-8");
  } catch (err) {
    console.error("Failed to save historical data:", err);
  }
}

/**
 * 3개월 평균 계산
 */
function calculate3MonthAverage(
  historical: HistoricalData[],
  currentDate: string,
  fedLabel: string
): { avg: number; change: number } | null {
  const current = new Date(currentDate);
  const threeMonthsAgo = new Date(current);
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
  
  // 최근 3개월 데이터 필터링 (약 13주)
  const recentData = historical.filter(h => {
    const dataDate = new Date(h.date);
    return dataDate >= threeMonthsAgo && dataDate < current;
  });
  
  if (recentData.length === 0) return null;
  
  // 해당 항목의 평균 잔액 계산
  const balances = recentData
    .map(h => {
      const card = h.cards.find(c => c.fedLabel === fedLabel);
      return card ? card.balance_musd : null;
    })
    .filter((b): b is number => b !== null);
  
  if (balances.length === 0) return null;
  
  const avg = balances.reduce((sum, b) => sum + b, 0) / balances.length;
  
  // 현재 잔액 (가장 최근 데이터)
  const latest = recentData[recentData.length - 1];
  const latestCard = latest.cards.find(c => c.fedLabel === fedLabel);
  const currentBalance = latestCard ? latestCard.balance_musd : avg;
  
  return {
    avg,
    change: currentBalance - avg
  };
}

/**
 * 특정 날짜에서 가장 가까운 목요일 찾기 (H.4.1은 매주 목요일 발행)
 */
function findNearestThursday(targetDate: string): string {
  const date = new Date(targetDate);
  const dayOfWeek = date.getDay(); // 0=일요일, 4=목요일
  
  // 목요일까지의 일수 계산
  let daysToAdd = 4 - dayOfWeek;
  if (daysToAdd < 0) daysToAdd += 7; // 이미 목요일을 지났으면 다음 주 목요일
  if (daysToAdd === 0 && date.getHours() < 16) {
    // 오늘이 목요일이고 아직 발행 전이면 이번 주 목요일, 아니면 다음 주 목요일
    daysToAdd = 0;
  } else if (daysToAdd === 0) {
    daysToAdd = 7; // 이미 발행 시간이 지났으면 다음 주 목요일
  }
  
  // 과거 날짜인 경우 이전 목요일 찾기
  if (daysToAdd > 3) {
    daysToAdd -= 7; // 이전 주 목요일로
  }
  
  const thursday = new Date(date);
  thursday.setDate(date.getDate() + daysToAdd);
  
  const year = thursday.getFullYear();
  const month = String(thursday.getMonth() + 1).padStart(2, '0');
  const day = String(thursday.getDate()).padStart(2, '0');
  
  return `${year}-${month}-${day}`;
}

/**
 * FED H.4.1 발표 날짜 목록 생성 (실제 FED 웹사이트에서 스크래핑)
 */
export async function getFedReleaseDates(): Promise<string[]> {
  try {
    const url = "https://www.federalreserve.gov/releases/h41/";
    const response = await fetch(url, { 
      headers: { "User-Agent": "h41-dashboard/1.0 (+cursor)" },
      cache: "no-store" // 캐시 방지
    });
    
    if (!response.ok) {
      console.warn(`[H.4.1] Failed to fetch release dates from FED website, falling back to calculated dates`);
      return getFedReleaseDatesFallback();
    }
    
    const html = await response.text();
    const $ = cheerio.load(html);
    
    const dates: string[] = [];
    
    // "Release Date" 테이블에서 날짜 추출
    $('table.release-date-table td a, table td a[href*="/h41/"]').each((_idx, element) => {
      const href = $(element).attr('href');
      const dateText = $(element).text().trim();
      let dateFound = false;
      
      // href에서 날짜 추출 (예: /releases/h41/20251229/)
      if (href) {
        const dateMatch = href.match(/\/h41\/(\d{8})\//);
        if (dateMatch) {
          const dateStr = dateMatch[1];
          const year = dateStr.substring(0, 4);
          const month = dateStr.substring(4, 6);
          const day = dateStr.substring(6, 8);
          dates.push(`${year}-${month}-${day}`);
          dateFound = true;
        }
      }
      
      // 또는 텍스트에서 날짜 파싱
      if (!dateFound && dateText) {
        try {
          const date = new Date(dateText);
          if (!isNaN(date.getTime())) {
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            dates.push(`${year}-${month}-${day}`);
          }
        } catch (e) {
          // 날짜 파싱 실패 시 무시
        }
      }
    });
    
    // 중복 제거 및 정렬 (최신부터)
    const uniqueDates = Array.from(new Set(dates));
    uniqueDates.sort((a, b) => b.localeCompare(a));
    
    // 최대 52주치만 반환
    return uniqueDates.slice(0, 52);
  } catch (e) {
    console.warn(`[H.4.1] Error fetching release dates from FED website: ${e}, falling back to calculated dates`);
    return getFedReleaseDatesFallback();
  }
}

/**
 * FED H.4.1 발표 날짜 목록 생성 (계산된 목요일 - Fallback)
 */
function getFedReleaseDatesFallback(): string[] {
  const dates: string[] = [];
  const now = new Date();
  
  // 오늘이 목요일이고 오후 4시 30분 이후면 이번 주 목요일 포함, 아니면 제외
  const today = new Date();
  const isThursday = today.getDay() === 4;
  const isAfterRelease = today.getHours() >= 16 || (today.getHours() === 16 && today.getMinutes() >= 30);
  
  // 시작 날짜: 오늘이 목요일이고 발행 시간 이후면 오늘, 아니면 가장 최근 과거 목요일
  let startDate = new Date(now);
  if (!isThursday || !isAfterRelease) {
    // 가장 최근 과거 목요일 찾기
    const dayOfWeek = now.getDay();
    const daysToSubtract = dayOfWeek <= 4 ? (dayOfWeek + 3) : (dayOfWeek - 4);
    startDate.setDate(now.getDate() - daysToSubtract);
  }
  
  // 최근 52주 목요일 생성
  for (let i = 0; i < 52; i++) {
    const thursday = new Date(startDate);
    thursday.setDate(startDate.getDate() - (i * 7));
    
    const year = thursday.getFullYear();
    const month = String(thursday.getMonth() + 1).padStart(2, '0');
    const day = String(thursday.getDate()).padStart(2, '0');
    
    dates.push(`${year}-${month}-${day}`);
  }
  
  return dates;
}

/**
 * 특정 날짜의 H.4.1 리포트 가져오기
 * @param targetDate 선택적 날짜 (YYYY-MM-DD 형식), 없으면 최신 데이터
 * @param availableDates 사용 가능한 날짜 목록 (가장 가까운 날짜 찾기용)
 * 선택한 날짜에서 가장 가까운 목요일의 데이터를 가져옵니다.
 * 해당 날짜를 찾을 수 없으면 availableDates에서 가장 가까운 날짜를 시도합니다.
 */
export async function fetchH41Report(targetDate?: string, availableDates?: string[]): Promise<H41Report> {
  let url = SOURCE_URL;
  let thursdayDate: string | undefined;
  
  // 과거 날짜가 지정된 경우 가장 가까운 목요일 찾기
  if (targetDate) {
    try {
      // targetDate가 이미 목요일인지 확인 (getFedReleaseDates에서 온 경우)
      const dateObj = new Date(targetDate);
      const dayOfWeek = dateObj.getDay();
      
      if (dayOfWeek === 4) {
        // 이미 목요일이면 그대로 사용
        thursdayDate = targetDate;
      } else {
        // 목요일이 아니면 가장 가까운 목요일 찾기
        thursdayDate = findNearestThursday(targetDate);
      }
      
      const date = new Date(thursdayDate);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      
      // H.4.1 아카이브 URL 형식 시도:
      // 1. https://www.federalreserve.gov/releases/h41/YYYYMMDD/ (디렉토리)
      // 2. https://www.federalreserve.gov/releases/h41/YYYYMMDD/default.htm (HTML 파일)
      // 3. https://www.federalreserve.gov/releases/h41/YYYYMMDD/h41.txt (텍스트 파일)
      const archiveUrl = `${ARCHIVE_BASE_URL}${year}${month}${day}/default.htm`;
      url = archiveUrl;
      console.log(`[H.4.1] Fetching archive for date: ${targetDate} (Thursday: ${thursdayDate}), URL: ${archiveUrl}`);
    } catch (e) {
      console.error("Invalid date format, using current:", e);
    }
  }
  
  const res = await fetch(url, {
    headers: { "user-agent": "h41-dashboard/1.0 (+cursor)" },
    cache: "no-store" // 캐시 방지: 항상 최신 데이터 가져오기
  });
  
  if (!res.ok) {
    // 아카이브 URL이 실패하면 대체 URL 형식 시도
    if (targetDate && url !== SOURCE_URL && thursdayDate) {
      console.error(`[H.4.1] Failed to fetch archive for ${targetDate} (${url}), status: ${res.status}`);
      // 여러 URL 형식 시도
      const date = new Date(thursdayDate);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      
      // 대체 URL 형식 시도: https://www.federalreserve.gov/releases/h41/YYYYMMDD/h41.txt
      const altUrl1 = `${ARCHIVE_BASE_URL}${year}${month}${day}/h41.txt`;
      console.log(`[H.4.1] Trying alternative URL format 1: ${altUrl1}`);
      const altRes1 = await fetch(altUrl1, {
        headers: { "user-agent": "h41-dashboard/1.0 (+cursor)" },
        cache: "no-store" // 캐시 방지
      });
      
      if (altRes1.ok) {
        const html = await altRes1.text();
        if (html.length > 500) {
          const $ = cheerio.load(html);
          const report = await parseH41Report($, altUrl1);
          console.log(`[H.4.1] Successfully fetched using alternative URL format`);
          return report;
        }
      }
      
      // 또 다른 대체 URL 형식: https://www.federalreserve.gov/releases/h41/YYYYMMDD/default.htm
      const altUrl2 = `${ARCHIVE_BASE_URL}${year}${month}${day}/default.htm`;
      console.log(`[H.4.1] Trying alternative URL format 2: ${altUrl2}`);
      const altRes2 = await fetch(altUrl2, {
        headers: { "user-agent": "h41-dashboard/1.0 (+cursor)" },
        cache: "no-store" // 캐시 방지
      });
      
      if (altRes2.ok) {
        const html = await altRes2.text();
        if (html.length > 500) {
          const $ = cheerio.load(html);
          const report = await parseH41Report($, altUrl2);
          console.log(`[H.4.1] Successfully fetched using alternative URL format 2`);
          return report;
        }
      }
      
      throw new Error(`Failed to fetch H.4.1 archive for date ${targetDate}. Tried URLs: ${url}, ${altUrl1}, ${altUrl2}`);
    }
    throw new Error(`Failed to fetch H.4.1: ${res.status} ${res.statusText}`);
  }

  const html = await res.text();
  
  // HTML이 비어있거나 에러 페이지인지 확인 (아카이브 페이지만 체크)
  if (targetDate && url !== SOURCE_URL) {
    // 아카이브 페이지에 대해서만 엄격한 검증
    if (html.length < 500 || html.toLowerCase().includes("page not found") || html.toLowerCase().includes("404 error")) {
      console.error(`[H.4.1] Archive page appears to be empty or 404 for ${targetDate} (${url})`);
      // 최신 데이터로 폴백하지 않고 에러를 던짐
      throw new Error(`Failed to fetch H.4.1 archive for date ${targetDate}. The archive page appears to be empty or not found.`);
    }
  }
  
  // 최신 데이터의 경우 HTML이 너무 짧으면 에러 (하지만 파싱을 먼저 시도)
  if (!targetDate && html.length < 500) {
    console.warn(`Current H.4.1 page HTML seems too short (${html.length} chars), but attempting to parse anyway`);
  }
  
  const $ = cheerio.load(html);
  let report: H41Report;
  
  try {
    report = await parseH41Report($, url);
  } catch (parseError: any) {
    // 파싱 실패 시, 아카이브 데이터인 경우 에러를 던짐 (최신 데이터로 폴백하지 않음)
    if (targetDate && url !== SOURCE_URL) {
      console.error(`[H.4.1] Failed to parse archive data for ${targetDate}: ${parseError?.message}`);
      throw new Error(`Failed to parse H.4.1 archive for date ${targetDate}: ${parseError?.message || String(parseError)}`);
    }
    // 최신 데이터 파싱 실패는 에러로 전파
    throw new Error(`Failed to parse H.4.1 report: ${parseError?.message || String(parseError)}`);
  }
  
  // 파싱된 데이터가 유효한지 확인 (모든 카드가 0이면 파싱 실패로 간주)
  const hasValidData = report.cards.some(c => c.balance_musd !== 0 || c.change_musd !== 0);
  if (!hasValidData) {
    if (targetDate && url !== SOURCE_URL) {
      console.error(`[H.4.1] Parsed data appears invalid for ${targetDate} (all zeros)`);
      throw new Error(`Parsed H.4.1 archive data appears invalid (all zeros) for date ${targetDate}`);
    }
    // 최신 데이터가 모두 0이면 에러
    throw new Error(`Parsed H.4.1 data appears invalid (all zeros) for ${url}`);
  }
  
  console.log(`[H.4.1] Successfully fetched report for ${targetDate || 'current'}, Week ended: ${report.asOfWeekEndedText}`);
  return report;
}

/**
 * H.4.1 리포트 파싱 (공통 로직)
 */
async function parseH41Report($: cheerio.CheerioAPI, sourceUrl: string): Promise<H41Report> {
  // 테이블 구조도 확인
  const tables = $("table");
  
  // 페이지 주요 텍스트를 "라인 단위"로 뽑아내기
  const text = $("body").text().replace(/\r/g, "");
  const lines = text
    .split("\n")
    .map(s => s.replace(/\u00a0/g, " ").trim())
    .filter(Boolean);

  const releaseDateLine = lines.find(l => l.startsWith("Release Date:")) ?? "Release Date: (unknown)";
  const releaseDateRaw = releaseDateLine.replace("Release Date:", "").trim();
  // 원본 형식 유지 (December 18, 2025)
  const releaseDateText = releaseDateRaw;

  // "Week ended Dec 17, 2025" 같은 라인을 찾기
  let asOfWeekEndedText = "(unknown)";
  
  // 여러 패턴 시도
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // "Week ended" 다음 라인 확인
    if (line === "Week ended" && i + 1 < lines.length) {
      const nextLine = lines[i + 1];
      // "Change from week ended"가 아닌 날짜 형식인지 확인
      if (!nextLine.toLowerCase().includes("change from") && 
          !nextLine.toLowerCase().includes("week ended") &&
          (nextLine.match(/[A-Z][a-z]{2,}\s+\d{1,2},\s+\d{4}/) || nextLine.match(/\d{1,2}\/\d{1,2}\/\d{4}/))) {
        asOfWeekEndedText = nextLine.trim();
        break;
      }
    }
    // "Week ended Dec 17, 2025" 형식 (한 줄에 모두)
    if (line.includes("Week ended") && !line.toLowerCase().includes("change from")) {
      const match = line.match(/Week ended\s+([A-Z][a-z]{2,}\s+\d{1,2},\s+\d{4})/);
      if (match) {
        asOfWeekEndedText = match[1].trim();
        break;
      }
    }
  }
  
  // 여전히 못 찾았으면 원본 방식 시도
  if (asOfWeekEndedText === "(unknown)") {
    const weekEndedIdx = lines.findIndex(l => l === "Week ended" || (l.includes("Week ended") && !l.toLowerCase().includes("change from")));
    if (weekEndedIdx >= 0) {
      if (lines[weekEndedIdx + 1] && !lines[weekEndedIdx + 1].toLowerCase().includes("change from")) {
        asOfWeekEndedText = lines[weekEndedIdx + 1].trim();
      } else if (lines[weekEndedIdx].includes("Week ended")) {
        const extracted = lines[weekEndedIdx].replace(/Week ended/gi, "").trim();
        if (extracted && !extracted.toLowerCase().includes("change from")) {
          asOfWeekEndedText = extracted;
        }
      }
    }
  }

  // 과거 데이터 로드
  const historical = await loadHistoricalData();
  
  // 주간 컨텍스트 미리 가져오기
  const weeklyContext = await getWeeklyContext();

  const cards: H41Card[] = await Promise.all(ITEM_DEFS.map(async def => {
    const idx = findLabelIndex(lines, def.fedLabel);
    if (idx < 0) {
      // 라벨이 못 잡히면 0 처리 + 경고성 해석
      return {
        key: def.key,
        title: def.title,
        fedLabel: def.fedLabel,
        balance_musd: 0,
        change_musd: 0,
        balance_okeusd: 0,
        change_okeusd: 0,
        liquidityTag: def.liquidityTag,
        concept: getConcept(def.fedLabel, def.liquidityTag),
        interpretation: `파싱 실패: H.4.1 페이지 구조 변경 가능성이 있습니다.`,
        dataDate: asOfWeekEndedText,
        qtQeSignal: "중립"
      };
    }

    // 라벨 다음에 숫자 찾기 (여러 라인 확인)
    let balance = 0;
    let change = 0;
    
    // 다음 5개 라인 내에서 숫자 찾기
    for (let i = 1; i <= 5; i++) {
      if (idx + i < lines.length) {
        const num = parseNumberFromText(lines[idx + i]);
        if (num !== null) {
          if (balance === 0) {
            balance = num;
          } else if (change === 0) {
            change = num;
            break;
          }
        }
      }
    }

    // 개념 설명
    const concept = getConcept(def.fedLabel, def.liquidityTag);
    
    // 해석 (의미와 전개만) - 동적 컨텍스트 포함
    const interpretation = await interpret({ 
      liquidityTag: def.liquidityTag, 
      title: def.title,
      fedLabel: def.fedLabel, 
      change_musd: change,
      balance_musd: balance
    }, weeklyContext);
    
    // QT/QE 신호
    const qtQeSignal = getQtQeSignal(def.fedLabel, change);

    const card: H41Card = {
      key: def.key,
      title: def.title,
      fedLabel: def.fedLabel,
      balance_musd: balance,
      change_musd: change,
      balance_okeusd: toOkEusd(balance),
      change_okeusd: toOkEusd(change),
      liquidityTag: def.liquidityTag,
      concept,
      interpretation,
      dataDate: asOfWeekEndedText,
      qtQeSignal
    };
    return card;
  }));

  // 현재 데이터를 과거 데이터로 저장
  const currentDate = new Date().toISOString();
  await saveHistoricalData({
    date: currentDate,
    weekEnded: asOfWeekEndedText,
    cards: cards.map(c => ({
      fedLabel: c.fedLabel,
      balance_musd: c.balance_musd,
      change_musd: c.change_musd
    }))
  });

  // 핵심 6개 카드만 필터링
  const coreCards = cards.filter(c => CORE_FED_LABELS.includes(c.fedLabel));

  // 경고 레벨 계산
  const warningLevel = calculateWarningLevel(cards);
  const assetGuidance = getAssetGuidance(warningLevel);
  const teamSignal = getTeamSignal(warningLevel);
  const weeklySummary = generateWeeklySummary(cards, warningLevel, teamSignal);

  return {
    releaseDateText,
    asOfWeekEndedText,
    sourceUrl: SOURCE_URL,
    cards,
    updatedAtISO: new Date().toISOString(),
    warningLevel,
    assetGuidance,
    teamSignal,
    weeklySummary,
    coreCards
  };
}

export function toKoreanDigest(r: H41Report): string {
  const levelText = ["안정", "주의", "경계", "위험"][r.warningLevel];
  const header = [
    `FED H.4.1 데일리 요약`,
    `- Release: ${r.releaseDateText}`,
    `- Week ended: ${r.asOfWeekEndedText}`,
    `- Source: ${r.sourceUrl}`,
    ``,
    `[경고 레벨] LEVEL ${r.warningLevel} (${levelText})`,
    ``,
    `[자산군 대응 가이드]`,
    r.assetGuidance,
    ``,
    `[청팀/백팀 시그널]`,
    r.teamSignal.summary,
    `- 청팀: ${r.teamSignal.blueTeam}`,
    `- 백팀: ${r.teamSignal.whiteTeam}`,
    ``,
    `[핵심 6개 수치 요약]`
  ].join("\n");

  const body = r.coreCards
    .map(c => {
      const bal = `$${c.balance_okeusd.toFixed(1)}억`;
      const ch = fmtOk(c.change_okeusd);
      return [
        `${c.key} ${c.title}`,
        `잔액 : ${bal}`,
        `변동 : ${ch} (${c.change_okeusd > 0 ? "증가" : c.change_okeusd < 0 ? "감소" : "변동없음"})`,
        `${c.interpretation}`,
        `(${c.fedLabel})`,
        ""
      ].join("\n");
    })
    .join("\n");

  const footer = [
    ``,
    `[주간 요약 리포트]`,
    r.weeklySummary
  ].join("\n");

  return `${header}\n${body}\n${footer}`.trim();
}

