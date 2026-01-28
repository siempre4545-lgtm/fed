"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  AXIS_DEFINITIONS,
  type AxisKey,
  type AxisArticleMap,
  type PlatformMapDetailResponse,
  type PlatformMapRating,
} from "../../../lib/platform-map-v2/types";
import type { HistoryResponse } from "../../../lib/platform-map-v2/history/types";
import WhyNotACard from "../../../components/platform-map-v2/WhyNotACard";
import InstitutionSummaryCard from "../../../components/platform-map-v2/InstitutionSummaryCard";
import CapitalComparisonCard from "../../../components/platform-map-v2/CapitalComparisonCard";

const formatDate = (value: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toISOString().slice(0, 10);
};

const formatScore = (value: number) => (Number.isInteger(value) ? value.toString() : value.toFixed(1));

type NewsSourceResult = {
  source: string;
  ok: boolean;
  status?: number;
  elapsedMs: number;
  titleCount: number;
  errorReason?: string;
};

const ScoreBars = ({
  series,
  color,
}: {
  series: Array<{ date: string; totalScore: number }>;
  color: string;
}) => {
  if (series.length === 0) return <div style={{ fontSize: 11, color: "#94a3b8" }}>데이터 없음</div>;
  const maxScore = Math.max(...series.map((item) => item.totalScore), 1);
  return (
    <div style={{ display: "flex", gap: 4, alignItems: "flex-end", height: 60 }}>
      {series.map((item) => (
        <div
          key={item.date}
          title={`${item.date} · ${item.totalScore}`}
          style={{
            width: 6,
            height: Math.max(6, (item.totalScore / maxScore) * 60),
            borderRadius: 3,
            background: color,
          }}
        />
      ))}
    </div>
  );
};

export default function Page({ params }: { params: { sigungu: string } }) {
  const sigungu = decodeURIComponent(params.sigungu ?? "").trim() || "선택 지역";
  const [rating, setRating] = useState<PlatformMapRating | null>(null);
  const [articlesByAxis, setArticlesByAxis] = useState<AxisArticleMap | null>(null);
  const [analysis, setAnalysis] = useState<PlatformMapDetailResponse["analysis"] | null>(null);
  const [capital, setCapital] = useState<PlatformMapDetailResponse["capital"] | null>(null);
  const [institutionSummary, setInstitutionSummary] = useState<
    PlatformMapDetailResponse["institutionSummary"] | null
  >(null);
  const [capitalComparison, setCapitalComparison] = useState<
    PlatformMapDetailResponse["capitalComparison"] | null
  >(null);
  const [history, setHistory] = useState<HistoryResponse | null>(null);
  const [newsStatus, setNewsStatus] = useState<{ ok: boolean; sources: NewsSourceResult[] } | null>(null);
  const [newsOpen, setNewsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDetail = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/platform-map-v2/data?sigungu=${encodeURIComponent(sigungu)}&debug=1`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = (await response.json()) as PlatformMapDetailResponse;
      setRating(data.rating ?? null);
      setArticlesByAxis(data.articlesByAxis ?? null);
      setAnalysis(data.analysis ?? null);
      setCapital(data.capital ?? null);
      setInstitutionSummary(data.institutionSummary ?? null);
      setCapitalComparison(data.capitalComparison ?? null);
      await loadNewsStatus(data.rating?.sigunguKey);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "unknown");
    } finally {
      setLoading(false);
    }
  };

  const loadHistory = async () => {
    try {
      const response = await fetch(`/api/platform-map-v2/history?sigungu=${encodeURIComponent(sigungu)}&days=30`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = (await response.json()) as HistoryResponse;
      setHistory(data);
    } catch (fetchError) {
      setHistory(null);
    }
  };

  const loadNewsStatus = async (sigunguKey?: string) => {
    try {
      const response = await fetch(
        `/api/platform-map-v2/news?sigungu=${encodeURIComponent(sigungu)}${
          sigunguKey ? `&sigunguKey=${encodeURIComponent(sigunguKey)}` : ""
        }`,
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = (await response.json()) as { ok: boolean; sources: NewsSourceResult[] };
      setNewsStatus(data);
    } catch (fetchError) {
      setNewsStatus({ ok: false, sources: [] });
    }
  };

  useEffect(() => {
    if (sigungu) {
      void loadDetail();
      void loadHistory();
    }
  }, [sigungu]);

  const axisScoreMap = useMemo(
    () =>
      AXIS_DEFINITIONS.reduce(
        (acc, axis) => ({
          ...acc,
          [axis.key]: rating?.axisScores.find((item) => item.key === axis.key)?.score ?? 0,
        }),
        {} as Record<AxisKey, number>,
      ),
    [rating],
  );

  const weeklySeries = history?.weeklyAverage.slice(-7) ?? [];
  const monthlySeries = history?.monthlyAverage.slice(-30) ?? [];

  return (
    <div style={{ minHeight: "100vh", background: "#0b0f14", color: "#e5e7eb", padding: 24 }}>
      <header style={{ display: "grid", gap: 8, marginBottom: 16 }}>
        <div style={{ fontSize: 18, fontWeight: 700 }}>{sigungu}</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <Link
            href="/platform-map-v2"
            style={{
              borderRadius: 999,
              border: "1px solid #1f2937",
              background: "#111827",
              color: "#e5e7eb",
              padding: "6px 12px",
              fontSize: 12,
              textDecoration: "none",
            }}
          >
            목록으로 돌아가기
          </Link>
          {loading && <span style={{ fontSize: 11, color: "#94a3b8" }}>불러오는 중...</span>}
          {error && <span style={{ fontSize: 11, color: "#fca5a5" }}>오류: {error}</span>}
          {error && (
            <button
              type="button"
              onClick={loadDetail}
              style={{
                borderRadius: 999,
                border: "1px solid #1f2937",
                background: "#111827",
                color: "#e5e7eb",
                padding: "4px 10px",
                fontSize: 11,
                cursor: "pointer",
              }}
            >
              다시 시도
            </button>
          )}
        </div>
      </header>

      <section style={{ display: "grid", gap: 12 }}>
        <div
          style={{
            borderRadius: 12,
            border: "1px solid #1f2937",
            background: "#0f172a",
            padding: 16,
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 700 }}>총점 · 등급</div>
          <div style={{ fontSize: 14, marginTop: 6 }}>
            {rating ? (
              <>
                {formatScore(rating.totalScore)} · {rating.scoreStatus ?? rating.gradeLabel ?? rating.grade}
              </>
            ) : (
              "데이터 없음"
            )}
          </div>
          {rating?.pisStatus && (
            <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 6 }}>
              기관 선행 신호: {rating.pisStatus}
            </div>
          )}
          {rating?.tags && rating.tags.length > 0 && (
            <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>
              태그: {rating.tags.join(", ")}
            </div>
          )}
          {rating?.preInstitutionalMove && (
            <div style={{ fontSize: 11, color: "#fbbf24", marginTop: 4 }}>
              Pre-Institutional Move: 기관 조건 충족률 상승
            </div>
          )}
          <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 6 }}>
            점수는 RSS 뉴스 기반으로 자동 산출됩니다.
          </div>
        </div>

        {newsStatus && (
          <div
            style={{
              borderRadius: 12,
              border: "1px solid #1f2937",
              background: "#0f172a",
              padding: 16,
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 700 }}>RSS 소스 수집 상태</div>
            <div style={{ fontSize: 12, marginTop: 6, color: "#cbd5f5" }}>
              성공 {newsStatus.sources.filter((item) => item.ok).length} · 실패{" "}
              {newsStatus.sources.filter((item) => !item.ok).length}
            </div>
            {newsStatus.sources.some((item) => !item.ok) && (
              <button
                type="button"
                onClick={() => setNewsOpen((prev) => !prev)}
                style={{
                  marginTop: 8,
                  borderRadius: 999,
                  border: "1px solid #1f2937",
                  background: "#111827",
                  color: "#e5e7eb",
                  padding: "4px 10px",
                  fontSize: 11,
                  cursor: "pointer",
                }}
              >
                {newsOpen ? "실패 소스 접기" : "실패 소스 보기"}
              </button>
            )}
            {newsOpen && (
              <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
                {newsStatus.sources
                  .filter((item) => !item.ok)
                  .map((item) => (
                    <div key={item.source} style={{ fontSize: 11, color: "#fca5a5" }}>
                      {item.source} · {item.errorReason ?? "unknown"} · {item.elapsedMs}ms
                    </div>
                  ))}
              </div>
            )}
            {newsStatus.sources.length === 0 && (
              <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 6 }}>
                소스 응답이 없습니다.
              </div>
            )}
          </div>
        )}

        <CapitalComparisonCard comparison={capitalComparison} />

        {rating?.scoreComponents && (
          <div
            style={{
              borderRadius: 12,
              border: "1px solid #1f2937",
              background: "#0f172a",
              padding: 16,
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 700 }}>점수 구성 상세</div>
            <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 6 }}>
              구조적 기정사실 + 기관/리츠 매집 + RSS 변화 점수를 합산합니다.
            </div>
            <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                <span>구조적 기정사실</span>
                <span>{rating.scoreComponents.structural.toFixed(1)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                <span>기관/리츠 매집</span>
                <span>{rating.scoreComponents.holdings.toFixed(1)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                <span>RSS 변화</span>
                <span>{rating.scoreComponents.rss.toFixed(1)}</span>
              </div>
            </div>
          </div>
        )}

        {capital && (
          <div
            style={{
              borderRadius: 12,
              border: "1px solid #1f2937",
              background: "#0f172a",
              padding: 16,
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 700 }}>자본 이동 일치도</div>
            <div style={{ fontSize: 14, marginTop: 6 }}>
              {capital.score} · {capital.band}
            </div>
            <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 6 }}>
              점수는 12개 축과 분리된 참고 지표입니다.
            </div>
            {capital.warnings.length > 0 && (
              <div style={{ display: "grid", gap: 4, marginTop: 8, fontSize: 11, color: "#fbbf24" }}>
                {capital.warnings.map((warning) => (
                  <div key={warning}>주의: {warning}</div>
                ))}
              </div>
            )}
          </div>
        )}

        <InstitutionSummaryCard summary={institutionSummary} />

        <WhyNotACard analysis={analysis ?? null} />

        <div
          style={{
            borderRadius: 12,
            border: "1px solid #1f2937",
            background: "#0f172a",
            padding: 16,
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>12개 기준 점수</div>
          <div style={{ display: "grid", gap: 6 }}>
            {AXIS_DEFINITIONS.map((axis) => (
              <div
                key={axis.key}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 12,
                  color: "#e5e7eb",
                }}
              >
                <span>{axis.label}</span>
                <span>{formatScore(axisScoreMap[axis.key])}/10</span>
              </div>
            ))}
          </div>
        </div>

        <div
          style={{
            borderRadius: 12,
            border: "1px solid #1f2937",
            background: "#0f172a",
            padding: 16,
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>주간/월간 점수 변화</div>
          <div style={{ display: "grid", gap: 12 }}>
            <div>
              <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 6 }}>최근 7일 평균</div>
              <ScoreBars series={weeklySeries} color="#38bdf8" />
            </div>
            <div>
              <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 6 }}>최근 30일 평균</div>
              <ScoreBars series={monthlySeries} color="#22c55e" />
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gap: 12 }}>
          {AXIS_DEFINITIONS.map((axis) => {
            const items = articlesByAxis?.[axis.key] ?? [];
            return (
              <div
                key={axis.key}
                style={{
                  borderRadius: 12,
                  border: "1px solid #1f2937",
                  background: "#0f172a",
                  padding: 16,
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 700 }}>{axis.label}</div>
                <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>
                  반영 기사 {items.length}건
                </div>
                {items.length === 0 ? (
                  <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 8 }}>
                    반영된 기사가 없습니다.
                  </div>
                ) : (
                  <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
                    {items.map((item) => (
                      <div
                        key={`${axis.key}-${item.id}`}
                        style={{
                          borderRadius: 10,
                          border: "1px solid #1f2937",
                          background: "#111827",
                          padding: 10,
                        }}
                      >
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noreferrer"
                          style={{ fontSize: 12, color: "#e5e7eb", textDecoration: "none" }}
                        >
                          {item.title}
                        </a>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", fontSize: 11, marginTop: 6 }}>
                          <span style={{ color: "#94a3b8" }}>{item.source}</span>
                          <span style={{ color: "#94a3b8" }}>{formatDate(item.publishedAt)}</span>
                          <span
                            style={{
                              borderRadius: 999,
                              border: "1px solid #1f2937",
                              padding: "2px 8px",
                              fontSize: 10,
                              color: "#e5e7eb",
                            }}
                          >
                            신뢰도 {item.reliability}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
