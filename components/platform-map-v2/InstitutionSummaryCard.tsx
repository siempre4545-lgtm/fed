import type { PlatformMapDetailResponse } from "../../lib/platform-map-v2/types";

type Props = {
  summary: PlatformMapDetailResponse["institutionSummary"] | null;
};

export default function InstitutionSummaryCard({ summary }: Props) {
  if (!summary) return null;

  return (
    <div
      style={{
        borderRadius: 12,
        border: "1px solid #1f2937",
        background: "#0f172a",
        padding: 16,
        color: "#e5e7eb",
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>기관 시점 요약</div>
      <div style={{ display: "grid", gap: 8, fontSize: 12, color: "#cbd5f5" }}>
        <div>
          <span style={{ color: "#94a3b8" }}>기관이 보는 이유: </span>
          {summary.reasonForInterest}
        </div>
        <div>
          <span style={{ color: "#94a3b8" }}>아직 매집하지 않는 이유: </span>
          {summary.reasonNotYet}
        </div>
        <div>
          <span style={{ color: "#94a3b8" }}>매집 트리거: </span>
          {summary.trigger}
        </div>
        <div>
          <span style={{ color: "#94a3b8" }}>우선 관찰 기관 유형: </span>
          {summary.likelyInstitution}
        </div>
      </div>
    </div>
  );
}
