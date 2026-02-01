import type { BucketKey, SectorDefinition, TickerDefinition } from "./types";

export const SAFE_ASSETS: TickerDefinition[] = [
  { key: "GLD", label: "금 (GLD)", bucket: "safe" },
  { key: "SGOV", label: "미국 0~3개월 T-Bill (SGOV)", bucket: "safe" },
];

export const HEDGE_ASSETS: TickerDefinition[] = [
  { key: "USO", label: "원유 (USO)", bucket: "hedge" },
  { key: "SLV", label: "은 (SLV)", bucket: "hedge" },
  { key: "VIX", label: "변동성 (VIX, 대체:VIXY)", bucket: "hedge", ticker: "VIXY" },
  { key: "UNG", label: "천연가스 (UNG)", bucket: "hedge" },
  { key: "DBA", label: "농산물 종합 (DBA)", bucket: "hedge" },
  { key: "CORN", label: "옥수수 (CORN)", bucket: "hedge" },
  { key: "WEAT", label: "밀 (WEAT)", bucket: "hedge" },
  { key: "CPER", label: "구리 (CPER)", bucket: "hedge" },
  { key: "LIT", label: "리튬 (LIT)", bucket: "hedge" },
];

export const RISK_SECTORS: Record<string, string[]> = {
  빅테크: ["AAPL", "AMZN", "GOOG", "META", "MSFT", "TSLA", "NVDA"],
  우주경제: ["RKLB", "RDW", "ASTS", "SPCE"],
  장수과학: ["NTLA", "UNH", "CRSP"],
  합성생물학: ["DNA"],
  양자컴퓨터: ["IONQ", "RGTI"],
  인프라: ["FLNC"],
  "데이터/냉각기술": ["VRT"],
  "데이터/해저케이블": ["GLW", "TEL"],
  전력: ["ETN", "GEV", "PWR"],
  미래에너지: ["NEE", "OKLO", "SMR", "APD"],
  결제시스템: ["HOOD", "V", "PYPL", "AXP"],
  "금융/자산운용": ["BLK", "GS", "JPM", "MS"],
  "명품/사치재": ["LVMH", "HESAY", "PPRUY"],
  저작권: ["ADBE"],
};

export const EXTRA_SECTORS: Record<string, string[]> = {
  사이버보안: ["NET", "PLTR", "CRWD"],
  "방산/우주": ["LMT", "NOC"],
  "데이터센터/냉각": ["VRT", "CARR"],
  "위성통신/우주데이터": ["IRDM", "ASTS"],
  "해양환경/로봇": ["TDY", "OII"],
  "수자원/대기물": ["GEV"],
  "친환경 리사이클링": ["EMN"],
  "세포 재프로그래밍": ["SANA"],
  "디지털 트윈/IoT": ["IOT"],
};

export const INDICATORS: TickerDefinition[] = [
  { key: "NQ", label: "NQ선물", isIndicator: true },
  { key: "M2", label: "M2", isIndicator: true },
  { key: "STLFSI4", label: "STLFSI4", isIndicator: true },
];

const mergeSectors = (
  primary: Record<string, string[]>,
  secondary: Record<string, string[]>
): Record<string, string[]> => {
  const tickerToSector = new Map<string, string>();
  const merged: Record<string, string[]> = {};

  const addSector = (sector: string, tickers: string[]) => {
    const unique = tickers.filter((ticker) => !tickerToSector.has(ticker));
    if (!unique.length) return;
    unique.forEach((ticker) => tickerToSector.set(ticker, sector));
    merged[sector] = (merged[sector] || []).concat(unique);
  };

  Object.entries(primary).forEach(([sector, tickers]) => addSector(sector, tickers));
  Object.entries(secondary).forEach(([sector, tickers]) => addSector(sector, tickers));

  return merged;
};

export const SECTOR_DEFINITIONS: SectorDefinition[] = Object.entries(
  mergeSectors(RISK_SECTORS, EXTRA_SECTORS)
).map(([name, tickers]) => ({
  name,
  tickers: Array.from(new Set(tickers)),
}));

export const getAllKeys = () => {
  const keys = new Set<string>();
  SAFE_ASSETS.forEach((item) => keys.add(item.key));
  HEDGE_ASSETS.forEach((item) => keys.add(item.key));
  SECTOR_DEFINITIONS.forEach((sector) => sector.tickers.forEach((ticker) => keys.add(ticker)));
  INDICATORS.forEach((item) => keys.add(item.key));
  return Array.from(keys);
};

export const getBucketTickers = (bucket: BucketKey) => {
  if (bucket === "safe") return SAFE_ASSETS.map((item) => item.key);
  if (bucket === "hedge") return HEDGE_ASSETS.map((item) => item.key);
  return SECTOR_DEFINITIONS.flatMap((sector) => sector.tickers);
};

export const getAllDefinitions = (): TickerDefinition[] => [
  ...SAFE_ASSETS,
  ...HEDGE_ASSETS,
  ...INDICATORS,
];

export const getLabelForKey = (key: string) => {
  const found = getAllDefinitions().find((item) => item.key === key);
  return found?.label || key;
};
