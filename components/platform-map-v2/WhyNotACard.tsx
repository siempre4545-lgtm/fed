import type { NotAReasonResult } from "../../lib/platform-map-v2/analysis/notAReason";

type Props = {
  analysis: NotAReasonResult | null;
};

export default function WhyNotACard({ analysis }: Props) {
  if (!analysis || analysis.reasons.length === 0) {
    return null;
  }

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
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>왜 A가 아닌가?</div>
      <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 10 }}>
        A등급 하위 컷 {analysis.cutoffScore.toFixed(1)} 기준으로 부족한 축을 자동 분석했습니다.
      </div>
      <div style={{ display: "grid", gap: 8 }}>
        {analysis.reasons.map((reason) => (
          <div
            key={reason.axis}
            style={{
              borderRadius: 10,
              border: "1px solid #1f2937",
              background: "#111827",
              padding: "10px 12px",
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 600 }}>{reason.label}</div>
            <div style={{ fontSize: 11, color: "#cbd5f5", marginTop: 4 }}>{reason.message}</div>
            <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 6 }}>
              기사 수 {reason.articleCount} · A평균 {reason.aAvgArticleCount.toFixed(1)} · 점수차{" "}
              {reason.scoreGap.toFixed(1)}
            </div>
            {reason.links && reason.links.length > 0 && (
              <div style={{ marginTop: 6, display: "grid", gap: 4 }}>
                {reason.links.map((link) => (
                  <a
                    key={link.url}
                    href={link.url}
                    target="_blank"
                    rel="noreferrer"
                    style={{ fontSize: 10, color: "#93c5fd", textDecoration: "none" }}
                  >
                    {link.source} · {link.title}
                  </a>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
