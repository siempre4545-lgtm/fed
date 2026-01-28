import { AXIS_DEFINITIONS, type AxisKey } from "../types";
import { classifyText } from "../classify";

export const LLM_SYSTEM_PROMPT = `기사 1건을 입력받아 12개 기준 중 해당 축만 선택한다.
출력은 아래 JSON 형식만 허용한다.

12개 기준(라벨 그대로 사용):
- 데이터 인프라
- 거주·이동성
- 제도 유치
- 금융화
- 도시 서비스
- 구독 수익
- 일자리·산업
- 디지털 결제·CBDC
- 네트워크 인프라
- 거버넌스
- 숙련 인재 유입
- 마스터플랜

출력(JSON 고정):
{
  "matched_axes": ["금융화", "제도 유치"],
  "axis_scores": {
    "금융화": 2,
    "제도 유치": 1
  },
  "confidence": 0.78,
  "reason": "리츠 편입 및 금융기관 매입 기사"
}

규칙:
1) matched_axes는 12개 라벨 중에서만 선택
2) axis_scores는 0~2 정수
3) confidence는 0~1
4) reason은 1문장으로 간결하게`;

export type LlmClassifyResult = {
  axes: Record<
    | "data_infra"
    | "residency_mobility"
    | "institutional_demand"
    | "financialization"
    | "city_services"
    | "subscription_profitability"
    | "jobs_industry"
    | "digital_payment_cbdc"
    | "network_infra"
    | "governance"
    | "skilled_residents"
    | "future_blueprint",
    { hit: boolean; confidence: number; evidence: string[] }
  >;
  region: { level: "sigungu" | "sido" | "unknown"; names: string[] };
  duplicate: { isDuplicate: boolean; reason: string };
};

export type RuleClassifyResult = {
  matchedAxes: AxisKey[];
  reasonByAxis: Partial<Record<AxisKey, string>>;
  confidenceByAxis: Partial<Record<AxisKey, number>>;
};

const toConfidence = (matchCount: number) => Math.min(0.95, 0.45 + matchCount * 0.15);

export const classifyWithRules = (text: string): RuleClassifyResult => {
  const { axes, axisReasons } = classifyText(text);
  const reasonByAxis: Partial<Record<AxisKey, string>> = {};
  const confidenceByAxis: Partial<Record<AxisKey, number>> = {};
  axes.forEach((axis) => {
    const reasons = axisReasons[axis] ?? [];
    reasonByAxis[axis] = reasons.length > 0 ? `키워드: ${reasons.slice(0, 4).join(", ")}` : "키워드 매칭";
    confidenceByAxis[axis] = toConfidence(reasons.length);
  });
  return { matchedAxes: axes, reasonByAxis, confidenceByAxis };
};

export const classifyArticle = (text: string): RuleClassifyResult => {
  return classifyWithRules(text);
};

export const getAxisLabels = () => AXIS_DEFINITIONS.map((axis) => axis.label);
