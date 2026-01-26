export type AxisKey =
  | "data_infra"
  | "residency_mobility"
  | "institutional_bid"
  | "financialization"
  | "city_services"
  | "subscription_profit"
  | "jobs_industry"
  | "digital_payment_cbdc"
  | "network_infra"
  | "governance"
  | "skilled_inflow"
  | "masterplan";

export type AxisDefinition = {
  key: AxisKey;
  label: string;
};

export const AXIS_DEFINITIONS = [
  { key: "data_infra", label: "데이터 인프라" },
  { key: "residency_mobility", label: "거주·이동성" },
  { key: "institutional_bid", label: "제도 유치" },
  { key: "financialization", label: "금융화" },
  { key: "city_services", label: "도시 서비스" },
  { key: "subscription_profit", label: "구독 수익" },
  { key: "jobs_industry", label: "일자리·산업" },
  { key: "digital_payment_cbdc", label: "디지털 결제·CBDC" },
  { key: "network_infra", label: "네트워크 인프라" },
  { key: "governance", label: "거버넌스" },
  { key: "skilled_inflow", label: "숙련 인재 유입" },
  { key: "masterplan", label: "마스터플랜" },
] as const satisfies AxisDefinition[];

export type AxisScore = {
  key: AxisKey;
  label: string;
  score: number;
};

export type PlatformMapSample = {
  id: string;
  name: string;
  axes: AxisScore[];
};

export type EvidenceItem = {
  id: string;
  title: string;
  source: string;
  publishedAt: string;
  url: string;
  snippet: string;
  axes: AxisKey[];
  regionHints: string[];
  reliability: "A" | "B" | "C";
  sentiment?: "pos" | "neg" | "neutral";
};

export type AxisEvidencePack = {
  axis: AxisKey;
  items: EvidenceItem[];
  scoreHint: -2 | -1 | 0 | 1 | 2;
  reason: string;
};
