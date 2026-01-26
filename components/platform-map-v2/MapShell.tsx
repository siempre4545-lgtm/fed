import type { Grade } from "../../lib/platform-map-v2/scoring";

type Props = {
  selectedName: string;
  totalScore: number;
  grade: Grade;
};

export default function MapShell({ selectedName, totalScore, grade }: Props) {
  return (
    <div
      style={{
        minHeight: 260,
        borderRadius: 12,
        border: "1px solid #1f2937",
        background: "#0f172a",
        padding: 16,
        color: "#cbd5f5",
      }}
    >
      <div style={{ fontSize: 13, marginBottom: 8 }}>지도 영역 (placeholder)</div>
      <div style={{ fontSize: 12 }}>선택 지역: {selectedName}</div>
      <div style={{ fontSize: 12, marginTop: 6 }}>
        총점 {totalScore}/120 · 등급 {grade}
      </div>
    </div>
  );
}
