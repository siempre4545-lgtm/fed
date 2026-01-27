import type { CapitalComparison } from "../../lib/platform-map-v2/types";

const STATUS_COLOR: Record<CapitalComparison["status"], string> = {
  정합: "#22c55e",
  선행: "#f59e0b",
  후행: "#60a5fa",
  불일치: "#ef4444",
};

const CONFIDENCE_LABEL: Record<"HIGH" | "MEDIUM" | "LOW", string> = {
  HIGH: "높음",
  MEDIUM: "중간",
  LOW: "낮음",
};

type Props = {
  comparison: CapitalComparison | null | undefined;
};

export default function CapitalComparisonCard({ comparison }: Props) {
  if (!comparison) return null;

  const holdingsCount = comparison.holdings.length;

  return (
    <div
      style={{
        borderRadius: 12,
        border: "1px solid #1f2937",
        background: "#0f172a",
        padding: 16,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 8,
          marginBottom: 8,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 700 }}>실제 자본 이동 비교</div>
        <span
          style={{
            borderRadius: 999,
            border: `1px solid ${STATUS_COLOR[comparison.status]}`,
            color: STATUS_COLOR[comparison.status],
            padding: "2px 8px",
            fontSize: 10,
          }}
        >
          {comparison.statusLabel}
        </span>
      </div>
      <div style={{ fontSize: 12, color: "#cbd5f5", marginBottom: 8 }}>{comparison.summary}</div>
      <div style={{ fontSize: 11, color: "#94a3b8" }}>{comparison.reason}</div>

      <div style={{ marginTop: 12, display: "grid", gap: 6 }}>
        <div style={{ fontSize: 12, color: "#e5e7eb" }}>
          보유 기관 유형: {comparison.institutionTypes.length > 0 ? comparison.institutionTypes.join(" / ") : "확인 없음"}
        </div>
        <div style={{ fontSize: 11, color: "#94a3b8" }}>보유 스냅샷 {holdingsCount}건</div>
        <div style={{ fontSize: 11, color: "#94a3b8" }}>
          실제 보유 정보는 분기/반기 스냅샷 기준이며 투자 권유가 아닙니다.
        </div>
      </div>

      {comparison.holdings.length > 0 && (
        <div style={{ display: "grid", gap: 6, marginTop: 12 }}>
          {comparison.holdings.slice(0, 6).map((item) => (
            <div
              key={`${item.entity}-${item.sigungu}`}
              style={{
                borderRadius: 10,
                border: "1px solid #1f2937",
                background: "#0b1220",
                padding: "8px 10px",
                fontSize: 11,
                color: "#cbd5f5",
              }}
            >
              <div>
                {item.entity} · 신뢰 {CONFIDENCE_LABEL[item.confidence]}
              </div>
              <div style={{ color: "#94a3b8", marginTop: 4 }}>{item.source}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
