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
import { coerceToThursday, getMostRecentThursday, toYmd } from "@/lib/macro-trace/date";
import { SECTOR_DEFINITIONS, getAllKeys, getBucketTickers } from "@/lib/macro-trace/definitions";
import {
  computeQuarterSeries,
  collectPriceErrors,
  computeBucketAverages,
  computeSectorAverages,
  fetchPrices,
  toPriceMap,
} from "@/lib/macro-trace/data";
import type { PricesResponse } from "@/lib/macro-trace/data";
import type { QuarterKey } from "@/lib/macro-trace/types";

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
  const viewParam = params.get("view");
  const legacyPage = params.get("page");
  const view = viewParam === "sectors" || legacyPage === "2" ? "sectors" : "dashboard";
  const paramDate = params.get("date");
  const [date, setDate] = useState(() =>
    coerceToThursday(
      /^\d{4}-\d{2}-\d{2}$/.test(paramDate || "")
        ? (paramDate as string)
        : toYmd(getMostRecentThursday())
    )
  );
  const [data, setData] = useState<PricesResponse | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const keys = useMemo(() => getAllKeys(), []);

  useEffect(() => {
    if (!paramDate) return;
    const nextDate = coerceToThursday(paramDate);
    if (nextDate !== date) {
      setDate(nextDate);
    }
    if (nextDate !== paramDate) {
      const query = new URLSearchParams(params.toString());
      query.set("date", nextDate);
      router.replace(`?${query.toString()}`);
    }
  }, [paramDate, date, params, router]);

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
          setError("데이터를 불러오지 못했습니다.");
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
  const sectorSeries = useMemo(() => computeSectorAverages(priceMap, SECTOR_DEFINITIONS), [priceMap]);
  const bucketSeries = useMemo(
    () =>
      computeBucketAverages(
        priceMap,
        {
          safe: getBucketTickers("safe"),
          risk: getBucketTickers("risk"),
          hedge: getBucketTickers("hedge"),
        },
        sectorSeries
      ),
    [priceMap, sectorSeries]
  );

  const lineData = useMemo(
    () =>
      QUARTERS.map((quarter) => ({
        quarter: QUARTER_LABELS[quarter],
        safe: bucketSeries.safe?.[quarter] ?? null,
        risk: bucketSeries.risk?.[quarter] ?? null,
        hedge: bucketSeries.hedge?.[quarter] ?? null,
      })),
    [bucketSeries]
  );

  const comparisonData = useMemo(() => {
    const vixEntry = priceMap.VIX;
    const nqEntry = priceMap.NQ;
    const vixSeries = computeQuarterSeries(vixEntry && vixEntry.ok ? vixEntry.changePct ?? null : null);
    const nqSeries = computeQuarterSeries(nqEntry && nqEntry.ok ? nqEntry.changePct ?? null : null);

    return [
      {
        label: "안전자산",
        Q1: bucketSeries.safe?.Q1 ?? null,
        Q2: bucketSeries.safe?.Q2 ?? null,
        Q3: bucketSeries.safe?.Q3 ?? null,
      },
      {
        label: "위험자산",
        Q1: bucketSeries.risk?.Q1 ?? null,
        Q2: bucketSeries.risk?.Q2 ?? null,
        Q3: bucketSeries.risk?.Q3 ?? null,
      },
      {
        label: "변동성 (VIX, 대체:VIXY)",
        Q1: vixSeries.Q1,
        Q2: vixSeries.Q2,
        Q3: vixSeries.Q3,
      },
      {
        label: "NQ선물",
        Q1: nqSeries.Q1,
        Q2: nqSeries.Q2,
        Q3: nqSeries.Q3,
      },
    ];
  }, [bucketSeries, priceMap]);

  const sectorBars = useMemo(() => {
    return SECTOR_DEFINITIONS.map((sector) => ({
      sector: sector.name,
      value: sectorSeries[sector.name]?.Q3 ?? null,
    })).sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  }, [sectorSeries]);

  const errors = useMemo(() => collectPriceErrors(priceMap), [priceMap]);

  const setView = (nextView: string) => {
    const query = new URLSearchParams(params.toString());
    query.set("view", nextView);
    query.delete("page");
    if (date) {
      query.set("date", date);
    }
    router.push(`?${query.toString()}`);
  };

  const handleDateChange = (value: string) => {
    const nextDate = coerceToThursday(value);
    setDate(nextDate);
    const query = new URLSearchParams(params.toString());
    query.set("date", nextDate);
    query.set("view", view);
    query.delete("page");
    router.replace(`?${query.toString()}`);
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <div className={styles.title}>/macro-trace</div>
          <div className={styles.subtitle}>금융 데이터 기반 자산 바스켓 리포트</div>
        </div>
        <div className={styles.actions}>
          {view === "dashboard" && (
            <>
              <button className={styles.button} onClick={() => setView("sectors")}>
                다음 페이지 ▶
              </button>
              <a className={styles.button} href="/" rel="noreferrer">
                대시보드
              </a>
            </>
          )}
          {view === "sectors" && (
            <>
              <button className={styles.button} onClick={() => setView("dashboard")}>
                ◀ 이전 페이지
              </button>
            </>
          )}
        </div>
      </header>

      {view === "dashboard" && (
        <section className={styles.controls}>
          <label className={styles.label}>
            날짜 선택
            <input
              type="date"
              value={date}
              onChange={(event) => handleDateChange(event.target.value)}
            />
          </label>
          <span className={styles.status}>
            {status === "loading" && "불러오는 중"}
            {status === "error" && "오류"}
            {status === "idle" && "완료"}
          </span>
        </section>
      )}

      {error && <div className={styles.error}>오류: {error}</div>}
      {!!data?.meta?.warnings?.length && (
        <div className={styles.warning}>경고: {data.meta.warnings.join(" · ")}</div>
      )}

      {view === "dashboard" ? (
        <>
          <section className={styles.cards}>
            <div className={styles.card}>
              <div className={styles.cardTitle}>안전자산 바스켓 (3Q)</div>
              <div className={styles.cardValue}>{formatPct(bucketSeries.safe?.Q3 ?? null)}</div>
            </div>
            <div className={styles.card}>
              <div className={styles.cardTitle}>위험자산 바스켓 (3Q)</div>
              <div className={styles.cardValue}>{formatPct(bucketSeries.risk?.Q3 ?? null)}</div>
            </div>
            <div className={styles.card}>
              <div className={styles.cardTitle}>헷징자산 바스켓 (3Q)</div>
              <div className={styles.cardValue}>{formatPct(bucketSeries.hedge?.Q3 ?? null)}</div>
            </div>
          </section>

          <section className={styles.chartGrid}>
            <div className={styles.chartCard}>
              <div className={styles.cardTitle}>자산군별 3쿼터 변동률 추이</div>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={lineData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="quarter" />
                  <YAxis />
                  <Tooltip formatter={(value) => formatPct(value as number)} />
                  <Legend />
                  <Line type="monotone" dataKey="safe" name="안전자산" stroke="#22c55e" />
                  <Line type="monotone" dataKey="risk" name="위험자산" stroke="#f97316" />
                  <Line type="monotone" dataKey="hedge" name="헷징자산" stroke="#38bdf8" />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className={styles.chartCard}>
              <div className={styles.cardTitle}>자산군 + 주요 지표 변동률 비교 (1~3Q)</div>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={comparisonData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" />
                  <YAxis />
                  <Tooltip formatter={(value) => formatPct(value as number)} />
                  <Legend />
                  <Bar dataKey="Q1" name="1Q" fill="#f59e0b" />
                  <Bar dataKey="Q2" name="2Q" fill="#fbbf24" />
                  <Bar dataKey="Q3" name="3Q" fill="#fde047" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
        </>
      ) : (
        <section className={styles.chartCard}>
          <div className={styles.cardTitle}>섹터별 3쿼터 평균 변동률</div>
          <ResponsiveContainer width="100%" height={360}>
            <BarChart data={sectorBars}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="sector" />
              <YAxis />
              <Tooltip formatter={(value) => formatPct(value as number)} />
              <Bar dataKey="value" name="3Q 평균" fill="#34d399" />
            </BarChart>
          </ResponsiveContainer>
        </section>
      )}

      {!!errors.length && (
        <section className={styles.errorList}>
          <div className={styles.cardTitle}>개별 실패 항목</div>
          <ul>
            {errors.slice(0, 12).map((item) => (
              <li key={item.key}>
                {item.key}: {item.error}
              </li>
            ))}
            {errors.length > 12 && <li>외 {errors.length - 12}개</li>}
          </ul>
        </section>
      )}
    </div>
  );
};
