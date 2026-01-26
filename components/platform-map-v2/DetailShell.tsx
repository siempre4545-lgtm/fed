import { AXIS_MAX_SCORE, getScoreSummary, TOTAL_MAX_SCORE } from "../../lib/platform-map-v2/scoring";
import type { PlatformMapSample } from "../../lib/platform-map-v2/types";

type Props = {
  region?: PlatformMapSample;
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

  const summary = getScoreSummary(region.axes);

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
      <div style={{ fontSize: 13, marginBottom: 8 }}>상세 (샘플)</div>
      <div style={{ fontSize: 12, marginBottom: 6 }}>선택된 지역: {region.name}</div>
      <div style={{ fontSize: 12, marginBottom: 10 }}>
        총점 {summary.total}/{TOTAL_MAX_SCORE} · 등급 {summary.grade}
      </div>
      <div
        style={{
          display: "grid",
          gap: 6,
          borderTop: "1px solid #1f2937",
          paddingTop: 8,
        }}
      >
        {region.axes.map((axis) => (
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
