import { AXIS_DEFINITIONS, type AxisKey } from "../types";
import { classifyText } from "../classify";

export const LLM_SYSTEM_PROMPT = `너는 한국의 지역 정책, 도시 개발, 산업, 금융, 인프라 뉴스를 분석하여
해당 지역이 “미래 플랫폼 도시에 편입될 가능성”을 판단하는 분석 모델이다.

아래 12개 기준 중,
기사 내용이 명확히 부합하는 기준만 선택하라.
추측, 과장, 억지 해석은 금지한다.

12개 기준:
1. 데이터 인프라
2. 거주 이동성
3. 제도 우위
4. 금융화
5. 도시 서비스
6. 구독 수익
7. 일자리·산업
8. 디지털 결제·CBDC
9. 네트워크 인프라
10. 거버넌스
11. 숙련 인재 유입
12. 마스터플랜

출력(JSON):
{
  "matched_axes": [번호 배열],
  "reason": {
    "기준번호": "기사 내용 기반 정량적 근거 요약"
  }
}`;

const AXIS_NUMBER_BY_KEY = AXIS_DEFINITIONS.reduce(
  (acc, axis, index) => ({
    ...acc,
    [axis.key]: index + 1,
  }),
  {} as Record<AxisKey, number>,
);

const AXIS_KEY_BY_NUMBER = AXIS_DEFINITIONS.reduce(
  (acc, axis, index) => ({
    ...acc,
    [index + 1]: axis.key,
  }),
  {} as Record<number, AxisKey>,
);

export type LlmClassifyResult = {
  matched_axes: number[];
  reason: Record<number, string>;
};

export type RuleClassifyResult = {
  matchedAxes: AxisKey[];
  reasonByAxis: Partial<Record<AxisKey, string>>;
};

export const classifyWithRules = (text: string): RuleClassifyResult => {
  const { axes, axisReasons } = classifyText(text);
  const reasonByAxis: Partial<Record<AxisKey, string>> = {};
  axes.forEach((axis) => {
    const reasons = axisReasons[axis] ?? [];
    reasonByAxis[axis] = reasons.length > 0 ? `키워드: ${reasons.slice(0, 4).join(", ")}` : "키워드 매칭";
  });
  return { matchedAxes: axes, reasonByAxis };
};

export const classifyArticle = (text: string): LlmClassifyResult => {
  const { matchedAxes, reasonByAxis } = classifyWithRules(text);
  const matched_axes = matchedAxes.map((axis) => AXIS_NUMBER_BY_KEY[axis]).sort((a, b) => a - b);
  const reason: Record<number, string> = {};
  matchedAxes.forEach((axis) => {
    const index = AXIS_NUMBER_BY_KEY[axis];
    reason[index] = reasonByAxis[axis] ?? "키워드 매칭";
  });
  return { matched_axes, reason };
};

export const mapAxesNumberToKeys = (values: number[]) =>
  values.map((value) => AXIS_KEY_BY_NUMBER[value]).filter(Boolean);
