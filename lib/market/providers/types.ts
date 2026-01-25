export type FetchDebugEntry = {
  source: string;
  key?: string;
  url: string;
  status?: number;
  elapsedMs: number;
  bodyHead?: string;
  ok: boolean;
  error?: string;
};

export type ProviderFetchOptions = {
  signal?: AbortSignal;
  log?: boolean;
  key?: string;
  onFetch?: (entry: FetchDebugEntry) => void;
};

export type ProviderQuoteResult =
  | { ok: true; price: number; ts: string }
  | { ok: false; error: string };

export type ProviderFxResult =
  | { ok: true; rate: number; ts: string }
  | { ok: false; error: string };

export type MarketProvider = {
  name: string;
  getQuote: (symbol: string, options?: ProviderFetchOptions) => Promise<ProviderQuoteResult>;
  getFx?: (pair: string, options?: ProviderFetchOptions) => Promise<ProviderFxResult>;
};
