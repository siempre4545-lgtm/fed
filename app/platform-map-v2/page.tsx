"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import DetailShell from "../../components/platform-map-v2/DetailShell";
import ListShell from "../../components/platform-map-v2/ListShell";
import Map from "../../components/platform-map-v2/Map";
import type {
  PlatformMapDataResponse,
  PlatformMapDebugInfo,
  PlatformMapGrade,
  PlatformMapRating,
} from "../../lib/platform-map-v2/types";

const GRADE_OPTIONS: PlatformMapGrade[] = ["A", "B", "C", "D"];
const GRADE_ORDER: Record<PlatformMapGrade, number> = { A: 0, B: 1, C: 2, D: 3 };

function PageContent() {
  const [selectedId, setSelectedId] = useState("");
  const [search, setSearch] = useState("");
  const [selectedGrades, setSelectedGrades] = useState<PlatformMapGrade[]>([]);
  const [mobileView, setMobileView] = useState<"list" | "map">("list");
  const [geojson, setGeojson] = useState<any>(null);
  const [ratings, setRatings] = useState<PlatformMapRating[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<PlatformMapDebugInfo | null>(null);
  const [relativeGrade, setRelativeGrade] = useState(false);
  const [recomputing, setRecomputing] = useState(false);
  const searchParams = useSearchParams();
  const debugMode = searchParams.get("debug") === "1";

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/platform-map-v2/data${debugMode ? "?debug=1" : ""}`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = (await response.json()) as PlatformMapDataResponse;
      setGeojson(data.geojson);
      setRatings(data.ratings ?? []);
      setUpdatedAt(data.meta?.updatedAt ?? new Date().toISOString());
      setDebugInfo(debugMode ? data.debug ?? null : null);
      setRelativeGrade(Boolean(data.meta?.relativeGrade));
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "unknown");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [debugMode]);

  const runRecompute = async () => {
    setRecomputing(true);
    try {
      const response = await fetch("/api/platform-map-v2/recompute?force=1", { method: "POST" });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      await loadData();
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "unknown");
    } finally {
      setRecomputing(false);
    }
  };

  const filteredItems = useMemo(() => {
    const term = search.trim().toLowerCase();
    const gradeSet = new Set(selectedGrades);
    return ratings
      .filter((item) => {
        const nameMatch = term.length === 0 || item.name.toLowerCase().includes(term);
        const gradeMatch = gradeSet.size === 0 || gradeSet.has(item.grade);
        return nameMatch && gradeMatch;
      })
      .sort((a, b) => {
        if (GRADE_ORDER[a.grade] !== GRADE_ORDER[b.grade]) {
          return GRADE_ORDER[a.grade] - GRADE_ORDER[b.grade];
        }
        return b.totalScore - a.totalScore;
      })
      .map((item) => ({
        ...item,
        id: item.sigunguKey,
        axes: item.axisScores,
        total: item.totalScore,
      }));
  }, [ratings, search, selectedGrades]);

  useEffect(() => {
    if (!filteredItems.find((item) => item.id === selectedId)) {
      setSelectedId(filteredItems[0]?.id ?? "");
    }
  }, [filteredItems, selectedId]);

  const selectedRegion = useMemo(
    () => ratings.find((region) => region.sigunguKey === selectedId) ?? null,
    [ratings, selectedId],
  );

  const toggleGrade = (grade: PlatformMapGrade) => {
    setSelectedGrades((prev) =>
      prev.includes(grade) ? prev.filter((item) => item !== grade) : [...prev, grade],
    );
  };

  return (
    <div style={{ minHeight: "100vh", padding: 24, background: "#0b0f14", color: "#e5e7eb" }}>
      <header style={{ display: "grid", gap: 8 }}>
        <div style={{ fontSize: 20, fontWeight: 700 }}>
          보물지도: 한국 시군구 플랫폼 편입 등급(A~D)
        </div>
        <div style={{ fontSize: 12, color: "#9ca3af" }}>
          데이터·네트워크·금융화 관점의 미래 도시 편입 가능성 트래킹
        </div>
        <div style={{ fontSize: 12, color: "#9ca3af" }}>
          전국 시군구 기준으로 초기 점수를 표시합니다.
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <Link
            href="/"
            style={{
              borderRadius: 999,
              border: "1px solid #1f2937",
              background: "#111827",
              color: "#e5e7eb",
              padding: "4px 10px",
              fontSize: 11,
              textDecoration: "none",
            }}
          >
            대시보드
          </Link>
          <button
            type="button"
            onClick={loadData}
            style={{
              borderRadius: 999,
              border: "1px solid #1f2937",
              background: "#0b1f3a",
              color: "#e5e7eb",
              padding: "4px 10px",
              fontSize: 11,
              cursor: "pointer",
            }}
          >
            새로고침
          </button>
          {relativeGrade && (
            <span
              style={{
                borderRadius: 999,
                border: "1px solid #fbbf24",
                background: "#1f2937",
                color: "#fcd34d",
                padding: "2px 8px",
                fontSize: 10,
              }}
            >
              상대등급(분포기반)
            </span>
          )}
          <span style={{ fontSize: 11, color: "#94a3b8" }}>
            마지막 갱신: {updatedAt ? new Date(updatedAt).toLocaleString("ko-KR", { hour12: false }) : "-"}
          </span>
          {error && <span style={{ fontSize: 11, color: "#fca5a5" }}>오류: {error}</span>}
          {loading && <span style={{ fontSize: 11, color: "#94a3b8" }}>불러오는 중...</span>}
          {debugMode && (
            <button
              type="button"
              onClick={runRecompute}
              disabled={recomputing}
              style={{
                borderRadius: 999,
                border: "1px solid #1f2937",
                background: recomputing ? "#0b1220" : "#111827",
                color: "#e5e7eb",
                padding: "4px 10px",
                fontSize: 11,
                cursor: recomputing ? "not-allowed" : "pointer",
              }}
            >
              {recomputing ? "재계산 중..." : "강제 재계산"}
            </button>
          )}
        </div>
        {debugMode && debugInfo && (
          <div
            style={{
              borderRadius: 10,
              border: "1px solid #1f2937",
              background: "#0f172a",
              padding: 12,
              fontSize: 11,
              color: "#94a3b8",
              display: "grid",
              gap: 4,
            }}
          >
            <div>
              등급 분포: A {debugInfo.gradeCounts.A} · B {debugInfo.gradeCounts.B} · C{" "}
              {debugInfo.gradeCounts.C} · D {debugInfo.gradeCounts.D}
            </div>
            <div>uniqueScoreCount: {debugInfo.scoreStats.uniqueScoreCount}</div>
            <div>뉴스 매칭 지역 수: {debugInfo.newsStats.regionsWithNews}</div>
            <div>
              점수 범위: {debugInfo.scoreStats.minScore} ~ {debugInfo.scoreStats.maxScore} (평균{" "}
              {debugInfo.scoreStats.avgScore})
            </div>
            <div>원인: {debugInfo.scoringStatus.reason.join(", ")}</div>
          </div>
        )}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "#94a3b8" }}>등급 필터</span>
          {GRADE_OPTIONS.map((grade) => {
            const active = selectedGrades.includes(grade);
            return (
              <button
                key={grade}
                type="button"
                onClick={() => toggleGrade(grade)}
                style={{
                  borderRadius: 999,
                  border: active ? "1px solid #38bdf8" : "1px solid #1f2937",
                  background: active ? "#0b1f3a" : "#111827",
                  color: "#e5e7eb",
                  padding: "4px 10px",
                  fontSize: 11,
                  cursor: "pointer",
                }}
              >
                {grade}
              </button>
            );
          })}
          <span style={{ fontSize: 11, color: "#94a3b8" }}>
            표시 {filteredItems.length}/{ratings.length}
          </span>
          <div className="mobileToggle" style={{ display: "flex", gap: 6 }}>
            <button
              type="button"
              onClick={() => setMobileView("list")}
              style={{
                borderRadius: 999,
                border: mobileView === "list" ? "1px solid #38bdf8" : "1px solid #1f2937",
                background: mobileView === "list" ? "#0b1f3a" : "#111827",
                color: "#e5e7eb",
                padding: "4px 10px",
                fontSize: 11,
                cursor: "pointer",
              }}
            >
              리스트
            </button>
            <button
              type="button"
              onClick={() => setMobileView("map")}
              style={{
                borderRadius: 999,
                border: mobileView === "map" ? "1px solid #38bdf8" : "1px solid #1f2937",
                background: mobileView === "map" ? "#0b1f3a" : "#111827",
                color: "#e5e7eb",
                padding: "4px 10px",
                fontSize: 11,
                cursor: "pointer",
              }}
            >
              지도
            </button>
          </div>
        </div>
      </header>

      <section className="layout" style={{ marginTop: 16, display: "grid", gap: 16 }}>
        <div className="layoutList" style={{ display: mobileView === "list" ? "grid" : "none", gap: 16 }}>
          <ListShell
            items={filteredItems}
            selectedId={selectedId}
            onSelect={setSelectedId}
            search={search}
            onSearch={setSearch}
            totalCount={ratings.length}
          />
          <DetailShell region={selectedRegion} />
        </div>
        <div className="layoutMap" style={{ display: mobileView === "map" ? "grid" : "none", gap: 16 }}>
          <Map geojson={geojson} ratings={ratings} selectedGrades={selectedGrades} />
        </div>
      </section>

      <style jsx>{`
        @media (min-width: 960px) {
          .layout {
            grid-template-columns: minmax(0, 0.7fr) minmax(0, 1.3fr);
          }

          .layoutList,
          .layoutMap {
            display: grid !important;
          }

          .mobileToggle {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense
      fallback={
        <div style={{ minHeight: "100vh", padding: 24, background: "#0b0f14", color: "#e5e7eb" }}>
          불러오는 중...
        </div>
      }
    >
      <PageContent />
    </Suspense>
  );
}
