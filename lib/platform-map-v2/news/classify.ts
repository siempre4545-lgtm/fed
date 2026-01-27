import { AXIS_DEFINITIONS, type AxisKey } from "../types";
import { classifyText } from "../classify";

export const LLM_SYSTEM_PROMPT = `입력: {title, body, publishedAt, sourceName, regionHints?}
출력(JSON): {
  axes: {
    data_infra: {hit:boolean, confidence:0..1, evidence:[...]},
    residency_mobility: {hit:boolean, confidence:0..1, evidence:[...]},
    institutional_demand: {hit:boolean, confidence:0..1, evidence:[...]},
    financialization: {hit:boolean, confidence:0..1, evidence:[...]},
    city_services: {hit:boolean, confidence:0..1, evidence:[...]},
    subscription_profitability: {hit:boolean, confidence:0..1, evidence:[...]},
    jobs_industry: {hit:boolean, confidence:0..1, evidence:[...]},
    digital_payment_cbdc: {hit:boolean, confidence:0..1, evidence:[...]},
    network_infra: {hit:boolean, confidence:0..1, evidence:[...]},
    governance: {hit:boolean, confidence:0..1, evidence:[...]},
    skilled_residents: {hit:boolean, confidence:0..1, evidence:[...]},
    future_blueprint: {hit:boolean, confidence:0..1, evidence:[...]}
  },
  region: {level: "sigungu"|"sido"|"unknown", names:[...]},
  duplicate: {isDuplicate:boolean, reason:string}
}

규칙:
1) 12축은 반드시 모두 포함
2) hit=false인 축도 confidence 포함
3) evidence는 1~3개 문장으로 짧게
4) 지역은 기사에 명시된 행정명/별칭을 최대한 추출하되, 불확실하면 unknown`;

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
