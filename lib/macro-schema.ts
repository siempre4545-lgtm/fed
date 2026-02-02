export type MacroItemKind = "asset" | "indicator";

export type MacroSource =
  | { type: "internal"; origin: "fedreportsh"; url: string }
  | { type: "external"; origin: "finra" | "stooq" | "other"; url: string }
  | { type: "computed"; origin: "derived"; url?: string };

export type MacroItem = {
  id: string;
  kind: MacroItemKind;
  group: "안전자산" | "위험자산" | "헤지자산" | "현금성" | "거시지표";
  sector?: string;
  name: string;
  ticker?: string;
  unit?: string;
  value: number | null;
  changePct?: number | null;
  changeAbs?: number | null;
  asOf: string;
  source: MacroSource;
};

export type ThursdaySnapshot = {
  ok: boolean;
  date: string;
  items: MacroItem[];
  warnings: string[];
};

export type MemoMap = Record<string, string>;
