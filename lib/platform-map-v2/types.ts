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

export type PlatformMapGrade = "A" | "B" | "C" | "D";

export type PlatformMapRating = {
  name: string;
  sigunguKey: string;
  grade: PlatformMapGrade;
  totalScore: number;
  axisScores: AxisScore[];
  top3Axes: AxisScore[];
  capitalAlignmentScore: number;
  capitalAlignmentBand: string;
  capitalStage: number;
};

export type CapitalHoldingConfidence = "HIGH" | "MEDIUM" | "LOW";

export type CapitalHoldingEntityType =
  | "financial_holding"
  | "reit"
  | "public_reit"
  | "btr_reit"
  | "pension"
  | "fund";

export type CapitalHoldingRegion = {
  sigungu: string;
  confidence: CapitalHoldingConfidence;
  note?: string;
};

export type CapitalHoldingEntity = {
  entity: string;
  type: CapitalHoldingEntityType;
  regions: CapitalHoldingRegion[];
  source: string;
  updatedAt?: string;
};

export type CapitalHoldingMatch = {
  entity: string;
  type: CapitalHoldingEntityType;
  sigungu: string;
  confidence: CapitalHoldingConfidence;
  source: string;
  note?: string;
};

export type CapitalComparisonStatus = "정합" | "선행" | "후행" | "불일치";

export type CapitalComparison = {
  status: CapitalComparisonStatus;
  statusLabel: string;
  reason: string;
  summary: string;
  holdings: CapitalHoldingMatch[];
  institutionTypes: string[];
};

export type AxisArticle = {
  id: string;
  title: string;
  url: string;
  publishedAt: string;
  source: string;
  reliability: "A" | "B" | "C";
  axes: AxisKey[];
};

export type AxisArticleMap = Record<AxisKey, AxisArticle[]>;

export type PlatformMapScoreStats = {
  minScore: number;
  maxScore: number;
  avgScore: number;
  uniqueScoreCount: number;
};

export type PlatformMapAxisStats = Record<AxisKey, { min: number; max: number; uniqueCount: number }>;

export type PlatformMapNewsStats = {
  regionsWithNews: number;
  totalItems: number;
  avgItemsPerRegion: number;
  noNewsRegions: string[];
  noNewsRegionSamples: Array<{ name: string; tokens: string[] }>;
};

export type PlatformMapScoringStatus = {
  scoringApplied: boolean;
  fallbackUsed: boolean;
  reason: Array<"뉴스_매칭_없음" | "점수계산_미실행" | "캐시_기본값" | "기타">;
};

export type PlatformMapSampleDebug = {
  name: string;
  sigunguKey: string;
  articles: number;
  axisDelta: Partial<Record<AxisKey, number>>;
  totalBeforeClamp: number;
  totalAfterClamp: number;
};

export type PlatformMapDebugInfo = {
  totalRegions: number;
  gradeCounts: Record<PlatformMapGrade, number>;
  scoreStats: PlatformMapScoreStats;
  axisStats: PlatformMapAxisStats;
  newsStats: PlatformMapNewsStats;
  scoringStatus: PlatformMapScoringStatus;
  samples: PlatformMapSampleDebug[];
};

export type PlatformMapDataResponse = {
  ok: true;
  geojson: any;
  ratings: PlatformMapRating[];
  meta: { updatedAt: string; source: string; relativeGrade?: boolean };
  debug?: PlatformMapDebugInfo;
};

export type PlatformMapDetailResponse = {
  ok: true;
  rating: PlatformMapRating | null;
  meta: { updatedAt: string; source: string; relativeGrade?: boolean };
  articlesByAxis?: AxisArticleMap;
  analysis?: {
    cutoffScore: number;
    reasons: Array<{
      axis: AxisKey;
      label: string;
      message: string;
      articleCount: number;
      aAvgArticleCount: number;
      scoreGap: number;
    }>;
  } | null;
  capital?: {
    score: number;
    band: string;
    stage: number;
    warnings: string[];
  };
  institutionSummary?: {
    reasonForInterest: string;
    reasonNotYet: string;
    trigger: string;
    likelyInstitution: string;
  };
  capitalComparison?: CapitalComparison;
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

export type PlatformMapReportPeriod = "weekly" | "monthly" | "manual";

export type PlatformMapReportRegion = {
  sigungu: string;
  totalScore: number;
  capitalAlignmentScore: number;
  status: CapitalComparisonStatus;
  delta?: number | null;
};

export type PlatformMapReport = {
  id: string;
  title: string;
  period: PlatformMapReportPeriod;
  generatedAt: string;
  summary: string[];
  scoreChanges: {
    top: PlatformMapReportRegion[];
    bottom: PlatformMapReportRegion[];
  };
  crossChecks: {
    aligned: PlatformMapReportRegion[];
    leading: PlatformMapReportRegion[];
    lagging: PlatformMapReportRegion[];
    mismatch: PlatformMapReportRegion[];
  };
  institutionView: {
    reasons: string[];
    notYet: string[];
  };
  watchPoints: {
    policy: string[];
    institution: string[];
    governance: string[];
  };
  warnings?: string[];
  holdingsUpdatedAt?: string | null;
};
