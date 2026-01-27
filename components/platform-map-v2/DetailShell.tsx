import { AXIS_MAX_SCORE, TOTAL_MAX_SCORE } from "../../lib/platform-map-v2/scoring";
import type { PlatformMapRating } from "../../lib/platform-map-v2/types";

type Props = {
  region?: PlatformMapRating | null;
};

const formatScore = (value: number) => (Number.isInteger(value) ? value.toString() : value.toFixed(1));

export default function DetailShell({ region }: Props) {
  if (!region) {
    return (
      <div
        style={{
          borderRadius: 12,
          border: "1px solid #1f2937",
          background: "#0f172a",
          padding: 16,
          color: "#cbd5f5",
        }}
      >
        <div style={{ fontSize: 13, marginBottom: 8 }}>상세 (placeholder)</div>
        <div style={{ fontSize: 12 }}>선택된 지역이 없습니다.</div>
      </div>
    );
  }

  return (
    <div
      style={{
        borderRadius: 12,
        border: "1px solid #1f2937",
        background: "#0f172a",
        padding: 16,
        color: "#cbd5f5",
      }}
    >
      <div style={{ fontSize: 13, marginBottom: 8 }}>상세</div>
      <div style={{ fontSize: 12, marginBottom: 6 }}>선택된 지역: {region.name}</div>
      <div style={{ fontSize: 12, marginBottom: 6 }}>
        총점 {region.totalScore}/{TOTAL_MAX_SCORE} · 등급 {region.gradeLabel ?? region.grade}
      </div>
      {region.pisStatus && (
        <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 6 }}>
          기관 선행 신호: {region.pisStatus}
        </div>
      )}
      {region.tags && region.tags.length > 0 && (
        <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 10 }}>
          태그: {region.tags.join(", ")}
        </div>
      )}
      <div
        style={{
          display: "grid",
          gap: 6,
          borderTop: "1px solid #1f2937",
          paddingTop: 8,
        }}
      >
        {region.axisScores.map((axis) => (
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
            <span>
              {formatScore(axis.score)}/{AXIS_MAX_SCORE}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
