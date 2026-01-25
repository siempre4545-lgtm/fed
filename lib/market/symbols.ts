export type MacroAssetKey =
  | "GLD"
  | "DXY"
  | "USDKRW"
  | "AWK"
  | "ECL"
  | "KO"
  | "DG"
  | "RKLB"
  | "RDW"
  | "NTLA"
  | "CRSP"
  | "CLPT"
  | "DNA"
  | "VRT"
  | "GLW"
  | "TEL"
  | "FLNC"
  | "GEV"
  | "SMR"
  | "META"
  | "MSFT"
  | "HOOD"
  | "MA"
  | "V"
  | "IONQ"
  | "NET"
  | "TLT"
  | "IEF"
  | "USO"
  | "M2"
  | "STLFSI4"
  | "MARGIN_DEBT";

const STQ_SYMBOL_MAP: Record<string, string> = {
  dxy: "uup.us",
  lvmh: "mc.fr",
  nq: "nq.f",
  vix: "vixy.us",
};

export const normalizeStooqSymbol = (inputTicker: string): string => {
  const trimmed = inputTicker.trim().toLowerCase();
  if (!trimmed) return trimmed;
  if (STQ_SYMBOL_MAP[trimmed]) return STQ_SYMBOL_MAP[trimmed];
  if (trimmed.includes(".")) return trimmed;
  if (!/^[a-z]+$/.test(trimmed)) return trimmed;
  return `${trimmed}.us`;
};

export const DEFAULT_EXTERNAL_ASSETS: Array<{
  key: MacroAssetKey;
  label: string;
  ticker?: string;
  kind: "stock" | "etf" | "fx" | "internal";
  proxyFor?: string;
}> = [
  { key: "GLD", label: "금(GLD)", ticker: "GLD", kind: "etf" },
  {
    key: "DXY",
    label: "달러인덱스(DXY, 대체:UUP)",
    ticker: "UUP",
    kind: "etf",
    proxyFor: "DXY",
  },
  { key: "USDKRW", label: "달러환율(USDKRW)", kind: "fx" },
  { key: "AWK", label: "물(AWK)", ticker: "AWK", kind: "stock" },
  { key: "ECL", label: "식량(ECL)", ticker: "ECL", kind: "stock" },
  { key: "KO", label: "필수소비재(KO)", ticker: "KO", kind: "stock" },
  { key: "DG", label: "필수소비재(DG)", ticker: "DG", kind: "stock" },
  { key: "RKLB", label: "우주(RKLB)", ticker: "RKLB", kind: "stock" },
  { key: "RDW", label: "우주(RDW)", ticker: "RDW", kind: "stock" },
  { key: "NTLA", label: "장수과학(NTLA)", ticker: "NTLA", kind: "stock" },
  { key: "CRSP", label: "장수과학(CRSP)", ticker: "CRSP", kind: "stock" },
  { key: "CLPT", label: "BCI(CLPT)", ticker: "CLPT", kind: "stock" },
  { key: "DNA", label: "합성생물학(DNA)", ticker: "DNA", kind: "stock" },
  { key: "VRT", label: "인프라/전력(VRT)", ticker: "VRT", kind: "stock" },
  { key: "GLW", label: "인프라/원자재(GLW)", ticker: "GLW", kind: "stock" },
  { key: "TEL", label: "전력/데이터(TEL)", ticker: "TEL", kind: "stock" },
  { key: "FLNC", label: "전력/데이터(FLNC)", ticker: "FLNC", kind: "stock" },
  { key: "GEV", label: "전력/데이터(GEV)", ticker: "GEV", kind: "stock" },
  { key: "SMR", label: "전력/데이터(SMR)", ticker: "SMR", kind: "stock" },
  { key: "META", label: "데이터/플랫폼(META)", ticker: "META", kind: "stock" },
  { key: "MSFT", label: "데이터/플랫폼(MSFT)", ticker: "MSFT", kind: "stock" },
  { key: "HOOD", label: "결제시스템(HOOD)", ticker: "HOOD", kind: "stock" },
  { key: "MA", label: "결제시스템(MA)", ticker: "MA", kind: "stock" },
  { key: "V", label: "결제시스템(V)", ticker: "V", kind: "stock" },
  { key: "IONQ", label: "양자보안(IONQ)", ticker: "IONQ", kind: "stock" },
  { key: "NET", label: "양자보안(NET)", ticker: "NET", kind: "stock" },
  { key: "TLT", label: "미국채 ETF(TLT)", ticker: "TLT", kind: "etf" },
  { key: "IEF", label: "미국채 ETF(IEF)", ticker: "IEF", kind: "etf" },
  { key: "USO", label: "원유(USO)", ticker: "USO", kind: "etf" },
  { key: "M2", label: "M2", kind: "internal" },
  { key: "STLFSI4", label: "STLFSI4", kind: "internal" },
  { key: "MARGIN_DEBT", label: "마진데트", kind: "internal" },
];
