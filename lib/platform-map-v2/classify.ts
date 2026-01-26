import type { AxisKey, EvidenceItem } from "./types";

export type AxisReasonMap = Partial<Record<AxisKey, string[]>>;

export type Sentiment = "pos" | "neg" | "neutral";

const AXIS_KEYWORDS: Record<AxisKey, string[]> = {
  data_infra: ["데이터센터", "데이터 센터", "광통신", "스마트미터", "IoT", "센서", "전력망", "변전소", "5G", "6G"],
  residency_mobility: ["외국인", "국제학교", "공항", "글로벌", "MICE", "컨벤션", "호텔", "관광", "기업 유치", "정주"],
  institutional_bid: ["특구", "규제특례", "인센티브", "유치", "세제", "조례", "입지", "공모", "입찰"],
  financialization: ["금융", "핀테크", "자산관리", "투자", "벤처", "펀드", "증권", "거래소", "금융허브"],
  city_services: ["교통", "스마트시티", "복지", "의료", "교육", "공공서비스", "문화", "안전", "치안"],
  subscription_profit: ["구독", "멤버십", "월정액", "정기결제", "ARPU", "LTV", "SaaS"],
  jobs_industry: ["일자리", "고용", "산업단지", "클러스터", "공장", "반도체", "배터리", "바이오", "제조", "R&D"],
  digital_payment_cbdc: ["CBDC", "디지털화폐", "전자지갑", "간편결제", "QR", "결제망", "블록체인"],
  network_infra: ["네트워크", "통신망", "백본", "IDC", "IX", "데이터허브", "해저케이블", "망 구축"],
  governance: ["거버넌스", "협의체", "민관", "지자체", "규제", "정책", "위원회", "공공기관"],
  skilled_inflow: ["인재", "전문인력", "연구원", "대학", "캠퍼스", "석박사", "인력양성", "리크루팅"],
  masterplan: ["마스터플랜", "종합계획", "도시계획", "개발계획", "중장기", "로드맵", "비전", "기본계획"],
};

const POSITIVE_KEYWORDS = ["확대", "증가", "유치", "성장", "개선", "상승", "투자", "완료", "착공", "개발", "혁신"];
const NEGATIVE_KEYWORDS = ["감소", "축소", "하락", "중단", "지연", "논란", "취소", "부진", "위기"];

const RELIABILITY_A = ["go.kr", "kdi.re.kr", "kostat.go.kr", "molit.go.kr", "mois.go.kr", "korea.kr"];
const RELIABILITY_B = [
  "yonhapnews.co.kr",
  "mk.co.kr",
  "hankyung.com",
  "joongang.co.kr",
  "donga.com",
  "chosun.com",
  "hani.co.kr",
  "newsis.com",
  "seoul.co.kr",
  "edaily.co.kr",
  "fnnews.com",
  "sedaily.com",
  "news.naver.com",
];

const normalizeText = (value: string) =>
  value
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

const collectMatches = (text: string, keywords: string[]) => {
  const normalized = normalizeText(text);
  return keywords.filter((keyword) => normalized.includes(normalizeText(keyword)));
};

export const classifyText = (text: string) => {
  const axisReasons: AxisReasonMap = {};
  const axes = Object.entries(AXIS_KEYWORDS).flatMap(([axis, keywords]) => {
    const matches = collectMatches(text, keywords);
    if (matches.length === 0) return [];
    axisReasons[axis as AxisKey] = matches;
    return [axis as AxisKey];
  });

  const posMatches = collectMatches(text, POSITIVE_KEYWORDS).length;
  const negMatches = collectMatches(text, NEGATIVE_KEYWORDS).length;
  let sentiment: Sentiment | undefined;
  if (posMatches > 0 || negMatches > 0) {
    sentiment = posMatches === negMatches ? "neutral" : posMatches > negMatches ? "pos" : "neg";
  }

  return { axes, axisReasons, sentiment };
};

export const getReliabilityFromUrl = (url: string) => {
  try {
    const host = new URL(url).host.toLowerCase();
    if (RELIABILITY_A.some((domain) => host.endsWith(domain))) return "A";
    if (RELIABILITY_B.some((domain) => host.endsWith(domain))) return "B";
  } catch (error) {
    return "C";
  }
  return "C";
};

export const getScoreHint = (items: EvidenceItem[]) => {
  if (items.length < 2) return 0;
  const pos = items.filter((item) => item.sentiment === "pos").length;
  const neg = items.filter((item) => item.sentiment === "neg").length;
  const delta = pos - neg;
  if (delta >= 3) return 2;
  if (delta >= 1) return 1;
  if (delta <= -3) return -2;
  if (delta <= -1) return -1;
  return 0;
};
