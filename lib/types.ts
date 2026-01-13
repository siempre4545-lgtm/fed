/**
 * 표준 H.4.1 리포트 JSON 스키마
 */

export interface H4ReportMeta {
  reportDate: string; // YYYY-MM-DD
  weekEnded: string; // YYYY-MM-DD
  sourceUrl: string;
  pdfUrl: string;
  parsedAt: string; // ISO timestamp
}

export interface H4ReportOverview {
  totalAssets: {
    value: number; // 백만 달러
    weeklyChange: number;
    weeklyChangePercent: number;
    yearlyChange: number;
    yearlyChangePercent: number;
  };
  securitiesHeld: {
    value: number;
    weeklyChange: number;
    weeklyChangePercent: number;
    yearlyChange: number;
    yearlyChangePercent: number;
  };
  reserves: {
    value: number;
    weeklyChange: number;
    weeklyChangePercent: number;
    yearlyChange: number;
    yearlyChangePercent: number;
  };
  tga: {
    value: number;
    weeklyChange: number;
    weeklyChangePercent: number;
    yearlyChange: number;
    yearlyChangePercent: number;
  };
  rrp: {
    value: number;
    weeklyChange: number;
    weeklyChangePercent: number;
    yearlyChange: number;
    yearlyChangePercent: number;
  };
  currency: {
    value: number;
    weeklyChange: number;
    weeklyChangePercent: number;
    yearlyChange: number;
    yearlyChangePercent: number;
  };
  assetComposition: {
    treasury: { value: number; percent: number };
    mbs: { value: number; percent: number };
    other: { value: number; percent: number };
  };
}

export interface H4ReportFactorRow {
  label: string; // 한글화된 라벨
  labelEn: string; // 원문 라벨
  value: number;
  change: number; // 주간 변화
  changePercent: number; // 주간 변화율
  yearlyChange: number; // 연간 변화
  yearlyChangePercent: number; // 연간 변화율
}

export interface H4ReportFactors {
  supplying: H4ReportFactorRow[];
  absorbing: H4ReportFactorRow[];
  totals: {
    supplying: number;
    supplyingWeeklyChange: number;
    supplyingYearlyChange: number;
    absorbing: number;
    absorbingWeeklyChange: number;
    absorbingYearlyChange: number;
    net: number; // 지급준비금 = 공급합계 - 흡수합계
    netWeeklyChange: number;
    netYearlyChange: number;
  };
}

export interface H4ReportSummary {
  keySupply: Array<{
    label: string;
    value: number;
    change: number;
  }>;
  keyAbsorb: Array<{
    label: string;
    value: number;
    change: number;
  }>;
}

export interface H4ReportMaturityBucket {
  range: string; // "15일", "16-90일", etc.
  value: number;
  percent: number;
}

export interface H4ReportMaturity {
  buckets: H4ReportMaturityBucket[];
  tableRows: Array<{
    label: string;
    buckets: Record<string, number>;
    total: number;
  }>;
}

export interface H4ReportLoansAndLending {
  loansTable: Array<{
    label: string;
    value: number;
    change: number;
  }>;
  securitiesLendingTable: Array<{
    label: string;
    value: number;
    change: number;
  }>;
}

export interface H4ReportConsolidatedStatement {
  assetsRows: Array<{
    label: string;
    value: number;
    change: number;
    yearlyChange?: number;
  }>;
  liabilitiesRows: Array<{
    label: string;
    value: number;
    change: number;
    yearlyChange?: number;
  }>;
  totals: {
    assets: number;
    liabilities: number;
  };
}

export interface H4ReportRegionalFed {
  columns: string[]; // 연준 이름들
  rows: Array<{
    label: string;
    values: Record<string, number>;
    total: number;
  }>;
}

export interface H4ReportFRNotes {
  rows: Array<{
    label: string;
    value: number;
    change: number;
  }>;
}

export interface H4Report {
  ok: boolean;
  error?: string; // 에러 메시지 (ok가 false일 때)
  meta?: H4ReportMeta;
  overview?: H4ReportOverview;
  factors?: H4ReportFactors;
  summary?: H4ReportSummary;
  maturity?: H4ReportMaturity;
  loansAndLending?: H4ReportLoansAndLending;
  consolidatedStatement?: H4ReportConsolidatedStatement;
  regionalFed?: H4ReportRegionalFed;
  frNotes?: H4ReportFRNotes;
  raw?: {
    // 디버깅용 원시 데이터 (선택적)
    parsedTables?: any[];
  };
}
