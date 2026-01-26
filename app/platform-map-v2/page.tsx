"use client";

import { useEffect, useMemo, useState } from "react";
import DetailShell from "../../components/platform-map-v2/DetailShell";
import ListShell from "../../components/platform-map-v2/ListShell";
import MapShell from "../../components/platform-map-v2/MapShell";
import { SAMPLE_REGIONS } from "../../data/platform-map-v2/sample";
import type { Grade } from "../../lib/platform-map-v2/scoring";
import { getScoreSummary } from "../../lib/platform-map-v2/scoring";

const GRADE_OPTIONS: Grade[] = ["A", "B", "C", "D"];

export default function Page() {
  const [selectedId, setSelectedId] = useState(SAMPLE_REGIONS[0]?.id ?? "");
  const [search, setSearch] = useState("");
  const [selectedGrades, setSelectedGrades] = useState<Grade[]>([]);
  const [mobileView, setMobileView] = useState<"list" | "map">("list");

  const itemsWithScore = useMemo(
    () =>
      SAMPLE_REGIONS.map((item) => {
        const summary = getScoreSummary(item.axes);
        return { ...item, total: summary.total, grade: summary.grade };
      }),
    [],
  );

  const filteredItems = useMemo(() => {
    const term = search.trim().toLowerCase();
    const gradeSet = new Set(selectedGrades);
    return itemsWithScore
      .filter((item) => {
        const nameMatch = term.length === 0 || item.name.toLowerCase().includes(term);
        const gradeMatch = gradeSet.size === 0 || gradeSet.has(item.grade);
        return nameMatch && gradeMatch;
      })
      .sort((a, b) => b.total - a.total);
  }, [itemsWithScore, search, selectedGrades]);

  useEffect(() => {
    if (!filteredItems.find((item) => item.id === selectedId)) {
      setSelectedId(filteredItems[0]?.id ?? "");
    }
  }, [filteredItems, selectedId]);

  const selectedRegion = useMemo(
    () => itemsWithScore.find((region) => region.id === selectedId),
    [itemsWithScore, selectedId],
  );

  const toggleGrade = (grade: Grade) => {
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
          샘플 3개 지역만 하드코딩되어 있으며 외부 연동은 없습니다.
        </div>
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
            표시 {filteredItems.length}/{itemsWithScore.length}
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
        <div
          className="layoutList"
          style={{ display: mobileView === "list" ? "grid" : "none", gap: 16 }}
        >
          <ListShell
            items={filteredItems}
            selectedId={selectedId}
            onSelect={setSelectedId}
            search={search}
            onSearch={setSearch}
          />
          <DetailShell region={selectedRegion} />
        </div>
        <div
          className="layoutMap"
          style={{ display: mobileView === "map" ? "grid" : "none", gap: 16 }}
        >
          <MapShell items={filteredItems} selectedId={selectedId} />
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
