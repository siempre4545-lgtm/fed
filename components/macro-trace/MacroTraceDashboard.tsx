"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import styles from "./MacroTrace.module.css";
import {
  HEDGE_ASSETS,
  SAFE_ASSETS,
  SECTOR_DEFINITIONS,
  INDICATORS,
  getAllKeys,
  getLabelForKey,
} from "../../lib/macro-trace/definitions";
import {
  buildSectorDefinitions,
  collectSeriesErrors,
  computeBucketAverages,
  computeIndicatorSeries,
  computeSectorAverages,
} from "../../lib/macro-trace/calculations";
import { fetchPrices, toPriceMap } from "../../lib/macro-trace/data";
import type { PricesResponse } from "../../lib/macro-trace/data";
import type { QuarterKey } from "../../lib/macro-trace/types";
import { toYmd } from "../../lib/macro-trace/date";

const QUARTERS: QuarterKey[] = ["Q1", "Q2", "Q3"];
const QUARTER_LABELS: Record<QuarterKey, string> = {
  Q1: "1Q (00:00)",
  Q2: "2Q (02:00)",
  Q3: "3Q (05:30)",
};

const formatPct = (value: number | null | undefined) => {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value}%`;
};

export const MacroTraceDashboard = () => {
  const router = useRouter();
  const params = useSearchParams();
  const pageParam = params.get("page");
  const dateParam = params.get("date");
  const view = pageParam === "2" ? "sectors" : "dashboard";
  const [date, setDate] = useState(() =>
    /^\d{4}-\d{2}-\d{2}$/.test(dateParam || "")
      ? (dateParam as string)
      : toYmd(new Date())
  );
  const [data, setData] = useState<PricesResponse | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const keys = useMemo(() => getAllKeys(), []);

  useEffect(() => {
    if (!dateParam) return;
    if (dateParam !== date) {
      setDate(dateParam);
    }
  }, [dateParam, date]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setStatus("loading");
      setError(null);
      try {
        const json = await fetchPrices(keys, date);
        if (!active) return;
        if (!json.ok) {
          setStatus("error");
          setError(json.error || "데이터를 불러오지 못했습니다.");
          return;
        }
        setData(json);
        setStatus("idle");
      } catch (fetchError: any) {
        if (!active) return;
        setStatus("error");
        setError(fetchError?.message || "데이터를 불러오지 못했습니다.");
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [date, keys]);

  const priceMap = useMemo(() => toPriceMap(data), [data]);
  const safeKeys = useMemo(() => SAFE_ASSETS.map((item) => item.key), []);
  const hedgeKeys = useMemo(() => HEDGE_ASSETS.map((item) => item.key), []);
  const indicatorKeys = useMemo(() => INDICATORS.map((item) => item.key), []);

  const riskCandidates = useMemo(() => {
    const safe = new Set(safeKeys);
    const hedge = new Set(hedgeKeys);
    const indicators = new Set(indicatorKeys);
    return keys.filter((key) => !safe.has(key) && !hedge.has(key) && !indicators.has(key));
  }, [keys, safeKeys, hedgeKeys, indicatorKeys]);

  const sectors = useMemo(
    () => buildSectorDefinitions(SECTOR_DEFINITIONS, riskCandidates),
    [riskCandidates]
  );
  const sectorSeries = useMemo(() => computeSectorAverages(priceMap, sectors), [priceMap, sectors]);
  const bucketSeries = useMemo(
    () => computeBucketAverages(priceMap, sectorSeries, { safeKeys, hedgeKeys }),
    [priceMap, sectorSeries, safeKeys, hedgeKeys]
  );
  const indicatorSeries = useMemo(
    () => computeIndicatorSeries(priceMap, indicatorKeys),
    [priceMap, indicatorKeys]
  );
  const errors = useMemo(() => collectSeriesErrors(priceMap, keys), [priceMap, keys]);

  const lineData = useMemo(
    () =>
      QUARTERS.map((quarter) => ({
        quarter: QUARTER_LABELS[quarter],
        safe: bucketSeries.safe[quarter],
        risk: bucketSeries.risk[quarter],
        hedge: bucketSeries.hedge[quarter],
      })),
    [bucketSeries]
  );

  const comparisonData = useMemo(() => {
    const rows = [
      { name: "안전자산", series: bucketSeries.safe },
      { name: "위험자산", series: bucketSeries.risk },
      { name: "헷징자산", series: bucketSeries.hedge },
    ];
    const indicatorRows = indicatorKeys
      .map((key) => ({
        name: getLabelForKey(key),
        series: indicatorSeries[key],
      }))
      .filter((row) => row.series && Object.values(row.series).some((value) => value !== null));
    return [...rows, ...indicatorRows].map((row) => ({
      name: row.name,
      Q1: row.series?.Q1 ?? null,
      Q2: row.series?.Q2 ?? null,
      Q3: row.series?.Q3 ?? null,
    }));
  }, [bucketSeries, indicatorKeys, indicatorSeries]);

  const sectorChartData = useMemo(
    () =>
      sectors.map((sector) => ({
        sector: sector.name,
        Q1: sectorSeries[sector.name]?.Q1 ?? null,
        Q2: sectorSeries[sector.name]?.Q2 ?? null,
        Q3: sectorSeries[sector.name]?.Q3 ?? null,
      })),
    [sectors, sectorSeries]
  );

  const updateQuery = (next: { page?: string | null; date?: string }) => {
    const query = new URLSearchParams(params.toString());
    if (next.date) {
      query.set("date", next.date);
    }
    if (next.page !== undefined) {
      if (next.page) {
        query.set("page", next.page);
      } else {
        query.delete("page");
      }
    }
    const qs = query.toString();
    router.replace(`/macro-trace${qs ? `?${qs}` : ""}`);
  };

  const sectorChartMinWidth = Math.max(720, sectorChartData.length * 90);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <div className={styles.title}>월목토 루틴</div>
          <div className={styles.subtitle}>
            1Q/2Q/3Q 시간대별 변동률을 기반으로 자산 바스켓을 요약합니다.
          </div>
        </div>
        <div className={styles.actions}>
          {view === "dashboard" ? (
            <>
              <button
                className={styles.button}
                type="button"
                onClick={() => updateQuery({ page: "2" })}
              >
                다음 페이지 ▶
              </button>
              <a className={styles.button} href="/">
                대시보드
              </a>
            </>
          ) : (
            <>
              <button
                className={styles.button}
                type="button"
                onClick={() => updateQuery({ page: null })}
              >
                ◀ 이전 페이지
              </button>
              <a className={styles.button} href="/macro-trace/page3">
                다음 페이지 ▶
              </a>
            </>
          )}
        </div>
      </div>

      <div className={styles.controls}>
        <label className={styles.label}>
          날짜 선택
          <input
            type="date"
            value={date}
            onChange={(event) => {
              const nextDate = event.target.value;
              setDate(nextDate);
              updateQuery({ date: nextDate });
            }}
          />
        </label>
        <div className={styles.status}>
          {status === "loading" && "데이터 로딩 중..."}
          {status === "idle" && data?.asOf ? `업데이트: ${data.asOf}` : ""}
          {status === "error" && "데이터 로딩 실패"}
        </div>
      </div>

      {error && <div className={styles.error}>{error}</div>}
      {data?.meta?.warnings?.length ? (
        <div className={styles.warning}>경고: {data.meta.warnings.join(", ")}</div>
      ) : null}

      {view === "dashboard" && (
        <>
          <div className={styles.cards}>
            {[
              { title: "안전자산 바스켓", value: bucketSeries.safe.Q3 },
              { title: "위험자산 바스켓", value: bucketSeries.risk.Q3 },
              { title: "헷징자산 바스켓", value: bucketSeries.hedge.Q3 },
            ].map((card) => (
              <div key={card.title} className={styles.card}>
                <div className={styles.cardTitle}>{card.title}</div>
                <div className={styles.cardValue}>{formatPct(card.value)}</div>
                <div className={styles.subtitle}>3Q 평균</div>
              </div>
            ))}
          </div>

          <div className={styles.chartGrid}>
            <div className={styles.chartCard}>
              <div className={styles.cardTitle}>자산군별 3쿼터 변동률 추이</div>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={lineData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                  <XAxis dataKey="quarter" tick={{ fill: "#cbd5f5", fontSize: 12 }} />
                  <YAxis tick={{ fill: "#cbd5f5", fontSize: 12 }} />
                  <Tooltip formatter={(value) => formatPct(value as number)} />
                  <Legend />
                  <Line type="monotone" dataKey="safe" stroke="#fbbf24" strokeWidth={2} dot />
                  <Line type="monotone" dataKey="risk" stroke="#f87171" strokeWidth={2} dot />
                  <Line type="monotone" dataKey="hedge" stroke="#34d399" strokeWidth={2} dot />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className={styles.chartCard}>
              <div className={styles.cardTitle}>자산군 + 주요 지표 변동률 비교</div>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={comparisonData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                  <XAxis dataKey="name" tick={{ fill: "#cbd5f5", fontSize: 12 }} />
                  <YAxis tick={{ fill: "#cbd5f5", fontSize: 12 }} />
                  <Tooltip formatter={(value) => formatPct(value as number)} />
                  <Legend />
                  <Bar dataKey="Q1" fill="#f59e0b" />
                  <Bar dataKey="Q2" fill="#eab308" />
                  <Bar dataKey="Q3" fill="#facc15" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}

      {view === "sectors" && (
        <div className={styles.chartCard}>
          <div className={styles.cardTitle}>섹터별 3쿼터 평균 변동률</div>
          <div className={styles.chartScroll}>
            <div className={styles.chartScrollInner} style={{ minWidth: sectorChartMinWidth }}>
              <ResponsiveContainer width="100%" height={360}>
                <BarChart data={sectorChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                  <XAxis
                    dataKey="sector"
                    interval={0}
                    tick={{ fill: "#cbd5f5", fontSize: 11 }}
                    tickMargin={8}
                  />
                  <YAxis tick={{ fill: "#cbd5f5", fontSize: 12 }} />
                  <Tooltip formatter={(value) => formatPct(value as number)} />
                  <Legend />
                  <Bar dataKey="Q1" fill="#60a5fa" />
                  <Bar dataKey="Q2" fill="#a78bfa" />
                  <Bar dataKey="Q3" fill="#f87171" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {errors.length ? (
        <div className={styles.errorList}>
          <div className={styles.cardTitle}>수집 실패 항목</div>
          <ul>
            {errors.map((item) => (
              <li key={item.key}>
                {item.key}: {item.error}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
};
