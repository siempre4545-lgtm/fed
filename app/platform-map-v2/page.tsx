"use client";

import { useState } from "react";
import MapShell from "../../components/platform-map-v2/MapShell";
import ListShell from "../../components/platform-map-v2/ListShell";
import DetailShell from "../../components/platform-map-v2/DetailShell";

const MOCK_AREAS = ["서울특별시 종로구", "부산광역시 해운대구"];

export default function Page() {
  const [selectedName, setSelectedName] = useState(MOCK_AREAS[0]);

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
          지도/리스트/상세는 초기 골격 상태이며, 데이터 연결 전 단계입니다.
        </div>
      </header>

      <section className="layout" style={{ marginTop: 16, display: "grid", gap: 16 }}>
        <div className="layoutMain" style={{ display: "grid", gap: 16 }}>
          <MapShell selectedName={selectedName} />
        </div>
        <div className="layoutSide" style={{ display: "grid", gap: 16 }}>
          <ListShell items={MOCK_AREAS} selectedName={selectedName} onSelect={setSelectedName} />
          <DetailShell selectedName={selectedName} />
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
