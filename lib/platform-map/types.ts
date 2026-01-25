export const PLATFORM_AXES = [
  "data_infra",
  "residency_mobility",
  "institutional_demand",
  "financialization",
  "city_services",
  "subscription_housing",
  "jobs_future",
  "cbdc_payments",
  "network_infra",
  "governance",
  "talent_inflow",
  "future_blueprint",
] as const;

export type PlatformAxis = (typeof PLATFORM_AXES)[number];

export type PlatformGrade = "A" | "B" | "C" | "D";

export type PlatformAxisScores = Record<PlatformAxis, number>;

export type PlatformEvidence = {
  notes: string;
  links: Array<{ title: string; url: string; date: string }>;
  signals: Array<{
    type: "policy" | "news" | "data";
    tag: string;
    date: string;
    impact: "+" | "-";
  }>;
};

export type SigunguRating = {
  sigunguCode: string;
  sigunguName: string;
  grade: PlatformGrade;
  score: number;
  axes: PlatformAxisScores;
  evidence: PlatformEvidence;
  updatedAt: string;
};

export type PlatformMapDataResponse = {
  ok: true;
  geojson: any;
  ratings: SigunguRating[];
  meta: { updatedAt: string; source: string };
};

export type PlatformNewsItem = {
  title: string;
  url: string;
  date: string;
  source: string;
  regions: string[];
  tags: string[];
  axisImpacts: Array<{ axis: PlatformAxis; dir: "+" | "-"; weight: number }>;
};

export type PlatformNewsResponse = {
  ok: true;
  items: PlatformNewsItem[];
  meta: { warnings: string[] };
};
