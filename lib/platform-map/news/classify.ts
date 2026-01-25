import { PlatformAxis, PlatformNewsItem, SigunguRating } from "../types";

const AXIS_KEYWORDS: Record<PlatformAxis, { positive: string[]; negative: string[] }> = {
  data_infra: { positive: ["데이터센터", "IDC", "클라우드", "AI센터"], negative: ["중단", "취소"] },
  residency_mobility: { positive: ["교통", "철도", "지하철", "환승", "역세권"], negative: ["지연", "반대"] },
  institutional_demand: { positive: ["공공기관", "캠퍼스", "산단", "국책"], negative: ["축소"] },
  financialization: { positive: ["리츠", "REITs", "펀드", "투자유치"], negative: ["규제", "중단"] },
  city_services: { positive: ["스마트시티", "도시재생", "생활SOC", "복합개발"], negative: ["취소"] },
  subscription_housing: { positive: ["임대주택", "공공주택", "모듈러", "분양전환"], negative: ["미분양"] },
  jobs_future: { positive: ["일자리", "기업유치", "산업단지", "클러스터"], negative: ["감원"] },
  cbdc_payments: { positive: ["CBDC", "디지털화폐", "결제실험"], negative: ["보류"] },
  network_infra: { positive: ["5G", "6G", "초고속", "광역망"], negative: ["장애"] },
  governance: { positive: ["규제완화", "특구", "지원조례"], negative: ["규제", "중단"] },
  talent_inflow: { positive: ["인재", "대학", "연구소", "산학"], negative: ["유출"] },
  future_blueprint: { positive: ["마스터플랜", "개발계획", "종합계획"], negative: ["폐기"] },
};

const TAG_KEYWORDS: Record<string, string[]> = {
  "스마트시티": ["스마트시티"],
  "데이터센터": ["데이터센터", "IDC", "클라우드"],
  "산업단지": ["산업단지", "산단", "클러스터"],
  "규제": ["규제", "특구", "규제완화"],
  "금융화": ["리츠", "REITs", "토큰화", "RWA"],
  "CBDC": ["CBDC", "디지털화폐", "결제실험"],
};

const normalizeText = (value: string) => value.replace(/\s+/g, " ").trim();

const extractRegions = (text: string, ratings: SigunguRating[]) => {
  const regionMatches: string[] = [];
  ratings.forEach((rating) => {
    const full = rating.sigunguName;
    const shortName = full.split(" ").slice(-1)[0];
    if (full && text.includes(full)) {
      regionMatches.push(rating.sigunguCode);
    } else if (shortName && text.includes(shortName)) {
      regionMatches.push(rating.sigunguCode);
    }
  });
  return Array.from(new Set(regionMatches));
};

const extractAxisImpacts = (text: string) => {
  const impacts: Array<{ axis: PlatformAxis; dir: "+" | "-"; weight: number }> = [];
  (Object.keys(AXIS_KEYWORDS) as PlatformAxis[]).forEach((axis) => {
    const { positive, negative } = AXIS_KEYWORDS[axis];
    const hasPositive = positive.some((keyword) => text.includes(keyword));
    const hasNegative = negative.some((keyword) => text.includes(keyword));
    if (hasPositive) {
      impacts.push({ axis, dir: "+", weight: 1 });
    }
    if (hasNegative) {
      impacts.push({ axis, dir: "-", weight: 1 });
    }
  });
  return impacts;
};

const extractTags = (text: string) => {
  const tags: string[] = [];
  Object.entries(TAG_KEYWORDS).forEach(([tag, keywords]) => {
    if (keywords.some((keyword) => text.includes(keyword))) {
      tags.push(tag);
    }
  });
  return tags;
};

export const classifyNewsItem = (
  item: { title: string; url: string; date: string; source: string; summary?: string },
  ratings: SigunguRating[]
): PlatformNewsItem => {
  const text = normalizeText([item.title, item.summary].filter(Boolean).join(" "));
  return {
    title: item.title,
    url: item.url,
    date: item.date,
    source: item.source,
    regions: extractRegions(text, ratings),
    tags: extractTags(text),
    axisImpacts: extractAxisImpacts(text),
  };
};
