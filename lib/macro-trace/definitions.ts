import type { BucketKey, SectorDefinition, TickerDefinition } from "./types";

export const SAFE_ASSETS: TickerDefinition[] = [
  { key: "GLD", label: "금 (GLD)", bucket: "safe" },
  { key: "DXY", label: "달러 인덱스 (DXY, 대체:UUP)", bucket: "safe", ticker: "UUP" },
  { key: "SHY", label: "단기국채 (SHY)", bucket: "safe" },
  { key: "IEF", label: "중기국채 (IEF)", bucket: "safe" },
  { key: "TLT", label: "초장기국채 (TLT)", bucket: "safe" },
  { key: "KO", label: "필수소비재 (KO)", bucket: "safe" },
  { key: "WMT", label: "필수소비재 (WMT)", bucket: "safe" },
  { key: "PEP", label: "필수소비재 (PEP)", bucket: "safe" },
  { key: "KHC", label: "필수소비재 (KHC)", bucket: "safe" },
  { key: "CL", label: "필수소비재 (CL)", bucket: "safe" },
  { key: "AWK", label: "물 (AWK)", bucket: "safe" },
  { key: "ECL", label: "식량 (ECL)", bucket: "safe" },
  { key: "GEV", label: "수자원/대기물 (GEV)", bucket: "safe" },
  { key: "XYL", label: "수자원 (XYL)", bucket: "safe" },
];

export const HEDGE_ASSETS: TickerDefinition[] = [
  { key: "USO", label: "원유 (USO)", bucket: "hedge" },
  { key: "SLV", label: "은 (SLV)", bucket: "hedge" },
  { key: "VIX", label: "변동성 (VIX, 대체:VIXY)", bucket: "hedge", ticker: "VIXY" },
];

export const RISK_SECTORS: Record<string, string[]> = {
  빅테크: ["AAPL", "AMZN", "GOOG", "META", "MSFT", "TSLA", "NVDA"],
  우주경제: ["RKLB", "RDW", "ASTS", "SPCE"],
  장수과학: ["NTLA", "UNH", "CRSP"],
  합성생물학: ["DNA"],
  양자컴퓨터: ["IONQ", "RGTI"],
  인프라: ["GLW", "TEL", "VRT"],
  미래에너지: ["FLNC", "GEV", "NEE", "OKLO", "PWR", "SMR", "APD", "ETN"],
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
