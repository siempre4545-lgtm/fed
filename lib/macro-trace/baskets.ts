/**
 * 바스켓 상세 페이지용 구성 종목 정의.
 * (기존 definitions.ts 수정 없이 상세 페이지 전용으로 재정의)
 */

export type BasketItem = {
  symbol: string;
  name: string;
  kind?: "stock" | "etf" | "index" | "fx";
  /** 위험자산 세부페이지 섹터별 열병합용 */
  sector?: string;
};

export type Basket = {
  id: string;
  label: string;
  items: BasketItem[];
};

const SAFE_ITEMS: BasketItem[] = [
  { symbol: "GLD", name: "금", kind: "etf" },
  { symbol: "SGOV", name: "미국 0~3개월 T-Bill (SGOV)", kind: "etf" },
];

const RISK_ITEMS: BasketItem[] = [
  { symbol: "RKLB", name: "우주 (RKLB)", kind: "stock", sector: "우주경제" },
  { symbol: "RDW", name: "우주 (RDW)", kind: "stock", sector: "우주경제" },
  { symbol: "NTLA", name: "장수과학 (NTLA)", kind: "stock", sector: "장수과학" },
  { symbol: "CRSP", name: "장수과학 (CRSP)", kind: "stock", sector: "장수과학" },
  { symbol: "CLPT", name: "BCI (CLPT)", kind: "stock", sector: "BCI" },
  { symbol: "DNA", name: "합성생물학 (DNA)", kind: "stock", sector: "합성생물학" },
  { symbol: "VRT", name: "데이터/냉각기술 (VRT)", kind: "stock", sector: "데이터/냉각기술" },
  { symbol: "GLW", name: "데이터/해저케이블 (GLW)", kind: "stock", sector: "데이터/해저케이블" },
  { symbol: "TEL", name: "데이터/해저케이블 (TEL)", kind: "stock", sector: "데이터/해저케이블" },
  { symbol: "FLNC", name: "인프라 (FLNC)", kind: "stock", sector: "인프라" },
  { symbol: "SMR", name: "미래에너지 (SMR)", kind: "stock", sector: "미래에너지" },
  { symbol: "META", name: "빅테크 (META)", kind: "stock", sector: "빅테크" },
  { symbol: "MSFT", name: "빅테크 (MSFT)", kind: "stock", sector: "빅테크" },
  { symbol: "HOOD", name: "결제시스템 (HOOD)", kind: "stock", sector: "결제시스템" },
  { symbol: "MA", name: "결제시스템 (MA)", kind: "stock", sector: "결제시스템" },
  { symbol: "V", name: "결제시스템 (V)", kind: "stock", sector: "결제시스템" },
  { symbol: "IONQ", name: "양자컴퓨터 (IONQ)", kind: "stock", sector: "양자컴퓨터" },
  { symbol: "NET", name: "사이버보안 (NET)", kind: "stock", sector: "사이버보안" },
  { symbol: "ETN", name: "전력 (ETN)", kind: "stock", sector: "전력" },
  { symbol: "GEV", name: "전력 (GEV)", kind: "stock", sector: "전력" },
  { symbol: "PWR", name: "전력 (PWR)", kind: "stock", sector: "전력" },
];

const HEDGE_ITEMS: BasketItem[] = [
  { symbol: "TLT", name: "초장기국채 (TLT)", kind: "etf" },
  { symbol: "IEF", name: "중기국채 (IEF)", kind: "etf" },
  { symbol: "USO", name: "원유 (USO)", kind: "etf" },
  { symbol: "SLV", name: "은 (SLV)", kind: "etf" },
  { symbol: "UNG", name: "천연가스 (UNG)", kind: "etf" },
  { symbol: "DBA", name: "농산물 종합 (DBA)", kind: "etf" },
  { symbol: "CORN", name: "옥수수 (CORN)", kind: "etf" },
  { symbol: "WEAT", name: "밀 (WEAT)", kind: "etf" },
  { symbol: "CPER", name: "구리 (CPER)", kind: "etf" },
  { symbol: "LIT", name: "리튬 (LIT)", kind: "etf" },
];

export const BASKETS: Basket[] = [
  { id: "safe", label: "안전자산", items: SAFE_ITEMS },
  { id: "risk", label: "위험자산", items: RISK_ITEMS },
  { id: "hedge", label: "헷징자산", items: HEDGE_ITEMS },
];

export const getBasketById = (id: string): Basket | null =>
  BASKETS.find((b) => b.id === id) ?? null;

export const getBasketIds = (): string[] => BASKETS.map((b) => b.id);
