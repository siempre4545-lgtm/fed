import { DEFAULT_EXTERNAL_ASSETS, MacroAssetKey, normalizeStooqSymbol } from "./symbols.js";
import { fetchManyStooqQuotes } from "./sources/stooq.js";
import { fetchUsdKrw } from "./sources/fx.js";
import { fetchFedreportshIndicators } from "../sources/fedreportsh.js";
import { fetchFinraMarginDebt } from "../sources/finra-margin-debt.js";

export type SnapshotItem =
  | {
      ok: true;
      key: MacroAssetKey;
      symbol: string;
      asOf: string;
      price: number;
      change1dPct?: number | null;
      source: string;
    }
  | {
      ok: false;
      key: MacroAssetKey;
      symbol: string;
      error: string;
      source: string;
    };

export const getFridaySnapshot = async () => {
  // TODO: 금요일 스냅샷 확장 포인트
  return { items: [] as SnapshotItem[], warnings: ["금요일 스냅샷은 아직 구현되지 않았습니다."] };
};

export const getThursdaySnapshot = async (
  keys?: MacroAssetKey[]
): Promise<{ items: SnapshotItem[]; warnings: string[] }> => {
  const requested = keys?.length
    ? DEFAULT_EXTERNAL_ASSETS.filter((asset) => keys.includes(asset.key))
    : DEFAULT_EXTERNAL_ASSETS;

  const items: SnapshotItem[] = [];
  const warnings: string[] = [];

  const internalIndicators = await fetchFedreportshIndicators();
  const marginDebt = await fetchFinraMarginDebt().catch(() => null);

  const stooqTargets = requested
    .filter((item) => item.kind === "stock" || item.kind === "etf")
    .map((item) => item.ticker || item.key);

  const stooqQuotes = await fetchManyStooqQuotes(
    stooqTargets.map((ticker) => normalizeStooqSymbol(ticker))
  );

  for (const asset of requested) {
    if (asset.kind === "fx") {
      try {
        const fx = await fetchUsdKrw();
        items.push({
          ok: true,
          key: asset.key,
          symbol: "USDKRW",
          asOf: fx.asOf,
          price: fx.rate,
          source: fx.source,
        });
      } catch (error: any) {
        const message = error?.message || "fx fetch failed";
        items.push({
          ok: false,
          key: asset.key,
          symbol: "USDKRW",
          error: message,
          source: "https://open.er-api.com/v6/latest/USD",
        });
        warnings.push(`${asset.label} ${message}`);
      }
      continue;
    }

    if (asset.key === "DXY") {
      const internal = internalIndicators["DXY"];
      if (internal && typeof internal.value === "number") {
        items.push({
          ok: true,
          key: asset.key,
          symbol: internal.symbol,
          asOf: internal.lastUpdated,
          price: internal.value,
          change1dPct: internal.changePercent ?? null,
          source: "https://fedreportsh.vercel.app/economic-indicators",
        });
        continue;
      }
    }

    if (asset.kind === "internal") {
      if (asset.key === "MARGIN_DEBT") {
        if (marginDebt && marginDebt.value) {
          items.push({
            ok: true,
            key: asset.key,
            symbol: asset.label,
            asOf: marginDebt.asOf,
            price: marginDebt.value,
            source: marginDebt.sourceUrl,
          });
        } else {
          const message = marginDebt?.warning || "margin debt missing";
          items.push({
            ok: false,
            key: asset.key,
            symbol: asset.label,
            error: message,
            source: marginDebt?.sourceUrl || "https://www.finra.org/",
          });
          warnings.push(`${asset.label} ${message}`);
        }
      } else {
        const indicatorSymbol = asset.key === "M2" ? "M2SL" : asset.key;
        const internal = internalIndicators[indicatorSymbol];
        if (internal && typeof internal.value === "number") {
          items.push({
            ok: true,
            key: asset.key,
            symbol: internal.symbol,
            asOf: internal.lastUpdated,
            price: internal.value,
            change1dPct: internal.changePercent ?? null,
            source: "https://fedreportsh.vercel.app/economic-indicators",
          });
        } else {
          items.push({
            ok: false,
            key: asset.key,
            symbol: indicatorSymbol,
            error: "internal missing",
            source: "https://fedreportsh.vercel.app/economic-indicators",
          });
          warnings.push(`${asset.label} 내부 데이터 없음`);
        }
      }
      continue;
    }

    const ticker = asset.ticker || asset.key;
    const normalized = normalizeStooqSymbol(ticker);
    const quote = stooqQuotes[normalized];
    if (quote?.ok) {
      items.push({
        ok: true,
        key: asset.key,
        symbol: normalized,
        asOf: quote.data.date,
        price: quote.data.close,
        change1dPct:
          quote.data.open !== 0
            ? Number((((quote.data.close - quote.data.open) / quote.data.open) * 100).toFixed(2))
            : null,
        source: "stooq",
      });
    } else {
      const error = quote?.error || "stooq missing";
      items.push({
        ok: false,
        key: asset.key,
        symbol: normalized,
        error,
        source: "stooq",
      });
      console.warn(
        JSON.stringify({
          level: "warn",
          msg: "snapshot_item_failed",
          key: asset.key,
          symbol: normalized,
          error,
          source: "stooq",
        })
      );
      warnings.push(`${asset.label} ${error}`);
    }
  }

  return { items, warnings };
};
