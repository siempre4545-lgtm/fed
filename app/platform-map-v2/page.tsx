"use client";

import { useMemo, useState } from "react";
import DetailShell from "../../components/platform-map-v2/DetailShell";
import ListShell from "../../components/platform-map-v2/ListShell";
import MapShell from "../../components/platform-map-v2/MapShell";
import { SAMPLE_REGIONS } from "../../data/platform-map-v2/sample";
import { getScoreSummary } from "../../lib/platform-map-v2/scoring";

export default function Page() {
  const [selectedId, setSelectedId] = useState(SAMPLE_REGIONS[0]?.id ?? "");

  const selectedRegion = useMemo(
    () => SAMPLE_REGIONS.find((region) => region.id === selectedId) ?? SAMPLE_REGIONS[0],
    [selectedId],
  );
  const summary = selectedRegion ? getScoreSummary(selectedRegion.axes) : null;

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
      </header>

      <section className="layout" style={{ marginTop: 16, display: "grid", gap: 16 }}>
        <div className="layoutMain" style={{ display: "grid", gap: 16 }}>
          <MapShell
            selectedName={selectedRegion?.name ?? "선택된 지역 없음"}
            totalScore={summary?.total ?? 0}
            grade={summary?.grade ?? "D"}
          />
        </div>
        <div className="layoutSide" style={{ display: "grid", gap: 16 }}>
          <ListShell items={SAMPLE_REGIONS} selectedId={selectedId} onSelect={setSelectedId} />
          <DetailShell region={selectedRegion} />
        </div>
      </section>

      <style jsx>{`
        @media (min-width: 960px) {
          .layout {
            grid-template-columns: minmax(0, 1.2fr) minmax(0, 0.8fr);
          }
        }
      `}</style>
    </div>
  );
}
