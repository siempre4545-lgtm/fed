import { fetchAllEconomicIndicators } from "../../src/economic-indicators.js";
import { fetchH41Report } from "../../src/h41.js";
import { fetchFRED } from "../../src/secret-indicators.js";
import { getMarketPrices } from "../../lib/market/getPrices.js";
import { fetchFinraMarginDebt } from "../../lib/sources/finra-margin-debt.js";

type TableRow = {
  group: string;
  label: string;
  key: string;
  value: number | null;
  source: "internal" | "external";
  status: "ok" | "na";
  error?: string;
};

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const toUtcSeconds = (ymd: string, hour: number, minute: number) => {
  const [year, month, day] = ymd.split("-").map((v) => Number(v));
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  return Math.floor(Date.UTC(year, month - 1, day, hour, minute, 0) / 1000);
};

const fetchJsonWithRetry = async (url: string, retries: number = 1, timeoutMs: number = 6000) => {
  let lastError: string | null = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; fedreportsh/1.0; +https://fedreportsh.vercel.app)",
          Accept: "application/json",
          "Accept-Language": "en-US,en;q=0.9",
          "Cache-Control": "no-cache",
        },
        signal: controller.signal,
      });
      if (!response.ok) {
        lastError = `status ${response.status}`;
        continue;
      }
      const data = await response.json();
      clearTimeout(timeout);
      return { ok: true as const, data };
    } catch (error: any) {
      lastError = error?.message || "fetch failed";
    } finally {
      clearTimeout(timeout);
    }
  }
  return { ok: false as const, error: lastError || "fetch failed" };
};

const fetchYahooDailyValue = async (symbol: string, date: string) => {
  const start = toUtcSeconds(date, 0, 0);
  const end = toUtcSeconds(date, 23, 59);
  if (start === null || end === null) {
    return { value: null, error: "invalid date" };
  }
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    symbol
  )}?interval=1d&period1=${start}&period2=${end + 60}`;
  const result = await fetchJsonWithRetry(url);
  if (!result.ok) {
    return { value: null, error: result.error };
  }
  const payload = result.data;
  const data = payload?.chart?.result?.[0];
  const closes = data?.indicators?.quote?.[0]?.close || [];
  const valid = closes.filter((v: number | null) => typeof v === "number");
  if (!valid.length) {
    return { value: null, error: "no data" };
  }
  return { value: Number(valid[valid.length - 1]), error: null };
};

const fetchFredValue = async (seriesId: string, date: string) => {
  const apiKey = process.env.FRED_API_KEY || "demo";
  const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${apiKey}&file_type=json&limit=1&sort_order=desc&observation_end=${date}`;
  const result = await fetchJsonWithRetry(url);
  if (!result.ok) {
    return { value: null, error: result.error };
  }
  const observations = result.data?.observations || [];
  if (!observations.length) {
    return { value: null, error: "no data" };
  }
  const latest = observations[0];
  if (!latest || latest.value === "." || latest.value === null) {
    return { value: null, error: "no data" };
  }
  const value = Number(latest.value);
  return Number.isFinite(value) ? { value, error: null } : { value: null, error: "invalid" };
};

const resolveRow = (
  group: string,
  label: string,
  key: string,
  payload: { value: number | null; source: "internal" | "external"; error?: string } | null
): TableRow => {
  if (!payload || payload.value === null || payload.value === undefined) {
    return { group, label, key, value: null, source: payload?.source || "external", status: "na", error: payload?.error };
  }
  return { group, label, key, value: payload.value, source: payload.source, status: "ok" };
};

export default async function handler(req: any, res: any) {
  const dateParam = typeof req.query?.date === "string" ? req.query.date : "";
  const date = DATE_REGEX.test(dateParam)
    ? dateParam
    : new Date().toISOString().slice(0, 10);

  const warnings: string[] = [];
  const rows: TableRow[] = [];

  const [economicIndicators, h41Report, marketSnapshot] = await Promise.all([
    fetchAllEconomicIndicators().catch(() => {
      warnings.push("경제지표 데이터를 불러오지 못했습니다.");
      return [];
    }),
    fetchH41Report(date).catch(() => {
      warnings.push("H.4.1 데이터를 불러오지 못했습니다.");
      return null;
    }),
    getMarketPrices(["USDKRW", "MARGIN_DEBT"]).catch(() => null),
  ]);

  const econByName = (needle: string) =>
    economicIndicators.find((item) => item.name.includes(needle));

  const econValue = (needle: string) => {
    const found = econByName(needle);
    if (!found) return null;
    return { value: found.value ?? null, source: "internal" as const };
  };

  const h41Value = (fedLabel: string) => {
    const card = h41Report?.cards?.find((item) => item.fedLabel === fedLabel);
    if (!card) return null;
    return { value: Number(card.balance_okeusd), source: "internal" as const };
  };

  const marketValue = (key: string) => {
    const item = marketSnapshot?.items?.find((entry: any) => entry.key === key);
    if (!item || !item.ok) return null;
    return { value: item.price ?? null, source: "internal" as const };
  };

  // 글로벌
  rows.push(
    resolveRow("글로벌", "(D)DXY 달러지수", "DXY", econValue("달러 인덱스")),
    resolveRow("글로벌", "(D)DXY 달러환율", "USDKRW", marketValue("USDKRW"))
  );
  if (rows[rows.length - 1].value === null) {
    const usdkrw = await fetchYahooDailyValue("USDKRW=X", date);
    rows[rows.length - 1] = resolveRow("글로벌", "(D)DXY 달러환율", "USDKRW", {
      value: usdkrw.value,
      source: "external",
      error: usdkrw.error || undefined,
    });
  }
  const yenValue = await fetchYahooDailyValue("JPYKRW=X", date);
  rows.push(
    resolveRow("글로벌", "원/엔", "JPYKRW", {
      value: yenValue.value,
      source: "external",
      error: yenValue.error || undefined,
    })
  );

  // 금리
  rows.push(
    resolveRow("금리", "미국국채 3Y", "DGS3", null),
    resolveRow("금리", "미국국채 2Y", "DGS2", econValue("미국 2년물")),
    resolveRow("금리", "미국국채 10Y", "DGS10", econValue("미국 10년물"))
  );
  const dgs3 = await fetchFredValue("DGS3", date);
  rows[rows.findIndex((row) => row.key === "DGS3")] = resolveRow(
    "금리",
    "미국국채 3Y",
    "DGS3",
    { value: dgs3.value, source: "external", error: dgs3.error || undefined }
  );

  // 장단기금리차(10Y-20Y) - 내부 값 없으면 N/A
  const tenYear = econByName("미국 10년물")?.value;
  const twentyYear = econByName("20년물")?.value ?? null;
  const spreadValue =
    typeof tenYear === "number" && typeof twentyYear === "number"
      ? tenYear - twentyYear
      : null;
  rows.push(
    resolveRow("금리", "장단기금리차(10Y-20Y)", "SPREAD_10Y_20Y", {
      value: spreadValue,
      source: "internal",
    })
  );

  // 시장금리
  rows.push(
    resolveRow("시장금리", "USD SOFR (미국 달러 SOFR 금리)", "SOFR", econValue("USD SOFR")),
    resolveRow("시장금리", "ON RRP", "RRPONTSYD", econValue("ON RRP")),
    resolveRow("시장금리", "EFFR", "EFFR", econValue("기준금리")),
    resolveRow("시장금리", "SRF", "SRF", null),
    resolveRow("시장금리", "하이일드스프레드", "HIGH_YIELD", econValue("하이일드"))
  );
  if (rows.find((row) => row.key === "EFFR")?.value === null) {
    const effr = await fetchFredValue("EFFR", date);
    rows[rows.findIndex((row) => row.key === "EFFR")] = resolveRow("시장금리", "EFFR", "EFFR", {
      value: effr.value,
      source: "external",
      error: effr.error || undefined,
    });
  }
  const srf = await fetchFredValue("SRF", date);
  rows[rows.findIndex((row) => row.key === "SRF")] = resolveRow("시장금리", "SRF", "SRF", {
    value: srf.value,
    source: "external",
    error: srf.error || undefined,
  });

  // 심리
  rows.push(
    resolveRow(
      "심리",
      "은행 CDS 프리미엄과 금융기관 채권 금리 동향여부",
      "BANK_CDS",
      econValue("은행 CDS")
    ),
    resolveRow("심리", "VIX", "VIX", econValue("VIX")),
    resolveRow("심리", "Fear & Greed Index 지수", "FEAR_GREED", econValue("Fear & Greed"))
  );

  // 시장
  const kospi = await fetchYahooDailyValue("^KS11", date);
  const nikkei = await fetchYahooDailyValue("^N225", date);
  rows.push(
    resolveRow("시장", "코스피", "KOSPI", {
      value: kospi.value,
      source: "external",
      error: kospi.error || undefined,
    }),
    resolveRow("시장", "닛케이", "NIKKEI", {
      value: nikkei.value,
      source: "external",
      error: nikkei.error || undefined,
    }),
    resolveRow("시장", "다우존스", "DOW", econValue("다우존스")),
    resolveRow("시장", "나스닥", "NASDAQ", econValue("나스닥")),
    resolveRow("시장", "S&P500", "SP500", econValue("S&P500")),
    resolveRow("시장", "운송 및 물류 지표 급락 (Baltic Dry Index)", "BDI", econValue("Baltic Dry Index")),
    resolveRow("시장", "실업수당 청구건수 (미국 주요)", "ICSA", econValue("실업수당청구건수"))
  );

  // 연준(자산)
  rows.push(
    resolveRow("연준(자산)", "국채 (U.S. Treasury securities)", "UST", h41Value("U.S. Treasury securities")),
    resolveRow("연준(자산)", "MBS (Mortgage-backed securities)", "MBS", h41Value("Mortgage-backed securities")),
    resolveRow("연준(자산)", "레포 (Repurchase agreements)", "REPO", h41Value("Repurchase agreements")),
    resolveRow("연준(자산)", "대출 (Loans)", "LOANS", null)
  );

  // 연준(부채)
  rows.push(
    resolveRow(
      "연준(부채)",
      "시중통화량 (Currency in circulation)",
      "CURRENCY",
      h41Value("Currency in circulation")
    ),
    resolveRow("연준(부채)", "역레포 (Reverse repurchase agreements)", "RRP", h41Value("Reverse repurchase agreements")),
    resolveRow("연준(부채)", "TGA (U.S. Treasury, General Account)", "TGA", h41Value("U.S. Treasury, General Account")),
    resolveRow("연준(부채)", "지급준비금 (Reserve balances)", "RESERVE", h41Value("Reserve balances with Federal Reserve Banks")),
    resolveRow("연준(부채)", "현금", "CASH", h41Value("Currency in circulation"))
  );

  // 통화량
  rows.push(
    resolveRow("통화량", "M2", "M2", econValue("M2 (통화량)")),
    resolveRow("통화량", "마진데트 (시장유동성)", "MARGIN_DEBT", marketValue("MARGIN_DEBT"))
  );
  if (rows.find((row) => row.key === "MARGIN_DEBT")?.value === null) {
    const marginDebt = await fetchFinraMarginDebt().catch(() => null);
    rows[rows.findIndex((row) => row.key === "MARGIN_DEBT")] = resolveRow(
      "통화량",
      "마진데트 (시장유동성)",
      "MARGIN_DEBT",
      {
        value: marginDebt?.value ?? null,
        source: "external",
        error: marginDebt ? undefined : "not available",
      }
    );
  }

  // 기타
  const tips5y = await fetchFredValue("DFII5", date);
  const tips10y = await fetchFredValue("DFII10", date);
  rows.push(
    resolveRow("기타", "미국 실업률 - Unemployment Rate", "UNRATE", econValue("실업률 - Unemployment")),
    resolveRow("기타", "미국 ISM 제조업 지수 - ISM Manufacturing PMI", "ISM", econValue("ISM 제조업")),
    resolveRow(
      "기타",
      "소비자신뢰지수 - Consumer Confidence Index",
      "CCI",
      econValue("소비자 신뢰지수")
    ),
    resolveRow("기타", "소매판매 성장률 - Retail Sales", "RRSFS", econValue("소매판매 성장률")),
    resolveRow("기타", "기업 재고판매비율 - Inventory to Sales Ratio", "IVSALES", econValue("Inventory to Sales")),
    resolveRow("기타", "운송 및 물류 지표 급락 - Cass Freight Index", "CASS", econValue("Cass Freight Index")),
    resolveRow("기타", "STLFSI4", "STLFSI4", econValue("STLFSI4")),
    resolveRow("기타", "TIPS실질금리_5Y", "DFII5", {
      value: tips5y.value,
      source: "external",
      error: tips5y.error || undefined,
    }),
    resolveRow("기타", "TIPS실질금리_10Y", "DFII10", {
      value: tips10y.value,
      source: "external",
      error: tips10y.error || undefined,
    })
  );

  res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=3600");
  return res.status(200).json({ ok: true, date, rows, meta: { warnings } });
}
