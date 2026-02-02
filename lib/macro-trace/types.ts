export type QuarterKey = "Q1" | "Q2" | "Q3";
export type BucketKey = "safe" | "risk" | "hedge";

export type TickerDefinition = {
  key: string;
  label: string;
  ticker?: string;
  bucket?: BucketKey;
  sector?: string;
  isIndicator?: boolean;
};

export type SectorDefinition = {
  name: string;
  tickers: string[];
};

export type QuarterSeries = Record<QuarterKey, number | null>;

export type PriceEntry =
  | {
      ok: true;
      price: number;
      changePct: number | null;
      quarters?: QuarterSeries;
      source?: string;
      error?: undefined;
    }
  | {
      ok: false;
      price?: undefined;
      changePct?: undefined;
      source?: string;
      error: string;
    };

export type PriceMap = Record<string, PriceEntry>;
