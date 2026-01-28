import { AXIS_MAX_SCORE, TOTAL_MAX_SCORE } from "../../lib/platform-map-v2/scoring";
import type { PlatformMapRating, ScoreComponent } from "../../lib/platform-map-v2/types";

type Props = {
  region?: PlatformMapRating | null;
};

const formatScore = (value: number) => (Number.isInteger(value) ? value.toString() : value.toFixed(1));
const STATUS_LABEL = {
  confirmed: "확정",
  estimated: "추정",
  not_observed: "관측 없음",
} as const;
const STRUCTURAL_MAX = 120;
const HOLDINGS_MAX = 10;
const RSS_MAX = 42;

const formatComponent = (component: ScoreComponent | undefined, max: number) => {
  if (!component || component.status === "not_observed" || component.score === null) {
    return "관측 없음";
  }
  return `${component.score.toFixed(1)}/${max} (${STATUS_LABEL[component.status]})`;
};

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
        총점 {region.totalScore}/{TOTAL_MAX_SCORE} · 등급 {region.scoreStatus ?? region.gradeLabel ?? region.grade}
      </div>
      {typeof region.scoreDelta === "number" && (
        <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 6 }}>
          최근 점수 변화: {region.scoreDelta > 0 ? "+" : ""}
          {region.scoreDelta.toFixed(2)}
        </div>
      )}
      {region.scoreComponents && (
        <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 8 }}>
          구성: 구조 {formatComponent(region.scoreComponents.structural, STRUCTURAL_MAX)} · 매집{" "}
          {formatComponent(region.scoreComponents.holdings, HOLDINGS_MAX)} · RSS{" "}
          {formatComponent(region.scoreComponents.rss, RSS_MAX)}
        </div>
      )}
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
      {region.preInstitutionalMove && (
        <div style={{ fontSize: 11, color: "#fbbf24", marginBottom: 10 }}>
          Pre-Institutional Move: 기관 조건 충족률 상승
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
