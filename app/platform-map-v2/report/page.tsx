"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { PlatformMapReport, PlatformMapReportPeriod } from "../../../lib/platform-map-v2/types";

const formatDateTime = (value: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("ko-KR", { hour12: false });
};

const buildMarkdown = (report: PlatformMapReport) => {
  const section = (title: string, lines: string[]) =>
    `## ${title}\n${lines.map((line) => `- ${line}`).join("\n")}\n`;

  const regionLines = (items: PlatformMapReport["scoreChanges"]["top"]) =>
    items.map((item) => `${item.sigungu} · ${item.totalScore} · 일치도 ${item.capitalAlignmentScore}`);

  return [
    `# ${report.title}`,
    `- 생성일: ${formatDateTime(report.generatedAt)}`,
    "",
    section("요약", report.summary),
    section("점수 변화 Top", regionLines(report.scoreChanges.top)),
    section("점수 변화 Bottom", regionLines(report.scoreChanges.bottom)),
    section(
      "자본 이동 교차 검증",
      [
        `정합 ${report.crossChecks.aligned.length}`,
        `선행 ${report.crossChecks.leading.length}`,
        `후행 ${report.crossChecks.lagging.length}`,
        `불일치 ${report.crossChecks.mismatch.length}`,
      ],
    ),
    section("기관 시점 해석", [...report.institutionView.reasons, ...report.institutionView.notYet]),
    section("관찰 포인트", [
      ...report.watchPoints.policy,
      ...report.watchPoints.institution,
      ...report.watchPoints.governance,
    ]),
  ].join("\n");
};

const downloadFile = (filename: string, content: string, type = "text/plain") => {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

export default function ReportPage() {
  const [period, setPeriod] = useState<PlatformMapReportPeriod>("weekly");
  const [reports, setReports] = useState<PlatformMapReport[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadReports = async () => {
    try {
      const response = await fetch("/api/platform-map-v2/reports");
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = (await response.json()) as { ok: boolean; reports: PlatformMapReport[] };
      setReports(data.reports ?? []);
      if (!selectedId && data.reports?.[0]) {
        setSelectedId(data.reports[0].id);
      }
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "unknown");
    }
  };

  useEffect(() => {
    void loadReports();
  }, []);

  const createReport = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/platform-map-v2/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = (await response.json()) as { ok: boolean; report: PlatformMapReport; warnings?: string[] };
      setReports((prev) => [data.report, ...prev]);
      setSelectedId(data.report.id);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "unknown");
    } finally {
      setLoading(false);
    }
  };

  const selectedReport = useMemo(
    () => reports.find((item) => item.id === selectedId) ?? null,
    [reports, selectedId],
  );

  return (
    <div style={{ minHeight: "100vh", padding: 24, background: "#0b0f14", color: "#e5e7eb" }}>
      <header style={{ display: "grid", gap: 8, marginBottom: 16 }}>
        <div style={{ fontSize: 18, fontWeight: 700 }}>플랫폼 자본 흐름 관찰 리포트</div>
        <div style={{ fontSize: 12, color: "#9ca3af" }}>
          리포트는 관찰용이며 투자 권유가 아닙니다.
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <Link
            href="/platform-map-v2"
            style={{
              borderRadius: 999,
              border: "1px solid #1f2937",
              background: "#111827",
              color: "#e5e7eb",
              padding: "4px 10px",
              fontSize: 11,
              textDecoration: "none",
            }}
          >
            지도 돌아가기
          </Link>
          <select
            value={period}
            onChange={(event) => setPeriod(event.target.value as PlatformMapReportPeriod)}
            style={{
              borderRadius: 8,
              border: "1px solid #1f2937",
              background: "#0f172a",
              color: "#e5e7eb",
              padding: "4px 8px",
              fontSize: 11,
            }}
          >
            <option value="weekly">주간 스냅샷</option>
            <option value="monthly">월간 누적</option>
            <option value="manual">수동 생성</option>
          </select>
          <button
            type="button"
            onClick={createReport}
            disabled={loading}
            style={{
              borderRadius: 999,
              border: "1px solid #1f2937",
              background: loading ? "#0b1220" : "#0b1f3a",
              color: "#e5e7eb",
              padding: "4px 10px",
              fontSize: 11,
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "생성 중..." : "리포트 생성"}
          </button>
          {error && <span style={{ fontSize: 11, color: "#fca5a5" }}>오류: {error}</span>}
        </div>
      </header>

      <section style={{ display: "grid", gap: 12, gridTemplateColumns: "minmax(200px, 260px) 1fr" }}>
        <div
          style={{
            borderRadius: 12,
            border: "1px solid #1f2937",
            background: "#0f172a",
            padding: 12,
            height: "fit-content",
          }}
        >
          <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 8 }}>리포트 목록</div>
          <div style={{ display: "grid", gap: 8 }}>
            {reports.length === 0 && (
              <div style={{ fontSize: 12, color: "#94a3b8" }}>저장된 리포트가 없습니다.</div>
            )}
            {reports.map((report) => (
              <button
                key={report.id}
                type="button"
                onClick={() => setSelectedId(report.id)}
                style={{
                  textAlign: "left",
                  borderRadius: 10,
                  border: selectedId === report.id ? "1px solid #38bdf8" : "1px solid #1f2937",
                  background: selectedId === report.id ? "#0b1220" : "#111827",
                  color: "#e5e7eb",
                  padding: "8px 10px",
                  fontSize: 11,
                }}
              >
                <div style={{ fontWeight: 600 }}>{report.title}</div>
                <div style={{ color: "#94a3b8", marginTop: 4 }}>{formatDateTime(report.generatedAt)}</div>
              </button>
            ))}
          </div>
        </div>

        <div
          style={{
            borderRadius: 12,
            border: "1px solid #1f2937",
            background: "#0f172a",
            padding: 16,
            minHeight: 360,
          }}
        >
          {!selectedReport && <div style={{ fontSize: 12, color: "#94a3b8" }}>리포트를 선택하세요.</div>}
          {selectedReport && (
            <div style={{ display: "grid", gap: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>{selectedReport.title}</div>
                  <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>
                    생성일: {formatDateTime(selectedReport.generatedAt)}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    onClick={() =>
                      selectedReport && downloadFile(`${selectedReport.title}.md`, buildMarkdown(selectedReport))
                    }
                    style={{
                      borderRadius: 999,
                      border: "1px solid #1f2937",
                      background: "#111827",
                      color: "#e5e7eb",
                      padding: "4px 10px",
                      fontSize: 11,
                    }}
                  >
                    Markdown 내보내기
                  </button>
                  <button
                    type="button"
                    onClick={() => window.print()}
                    style={{
                      borderRadius: 999,
                      border: "1px solid #1f2937",
                      background: "#111827",
                      color: "#e5e7eb",
                      padding: "4px 10px",
                      fontSize: 11,
                    }}
                  >
                    PDF 내보내기
                  </button>
                </div>
              </div>

              {selectedReport.warnings && selectedReport.warnings.length > 0 && (
                <div style={{ fontSize: 11, color: "#fbbf24" }}>
                  {selectedReport.warnings.map((warning) => (
                    <div key={warning}>주의: {warning}</div>
                  ))}
                </div>
              )}

              <div style={{ display: "grid", gap: 10 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>요약</div>
                  <ul style={{ margin: "6px 0 0 16px", color: "#cbd5f5", fontSize: 12 }}>
                    {selectedReport.summary.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </div>

                <div>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>점수 변화 Top / Bottom</div>
                  <div style={{ display: "grid", gap: 6, marginTop: 6, fontSize: 12, color: "#cbd5f5" }}>
                    <div>
                      Top:{" "}
                      {selectedReport.scoreChanges.top.map((item) => `${item.sigungu}(${item.delta ?? 0})`).join(", ")}
                    </div>
                    <div>
                      Bottom:{" "}
                      {selectedReport.scoreChanges.bottom
                        .map((item) => `${item.sigungu}(${item.delta ?? 0})`)
                        .join(", ")}
                    </div>
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>자본 이동 교차 검증</div>
                  <div style={{ display: "grid", gap: 6, marginTop: 6, fontSize: 12, color: "#cbd5f5" }}>
                    <div>정합: {selectedReport.crossChecks.aligned.map((item) => item.sigungu).join(", ")}</div>
                    <div>선행: {selectedReport.crossChecks.leading.map((item) => item.sigungu).join(", ")}</div>
                    <div>후행: {selectedReport.crossChecks.lagging.map((item) => item.sigungu).join(", ")}</div>
                    <div>불일치: {selectedReport.crossChecks.mismatch.map((item) => item.sigungu).join(", ")}</div>
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>기관 시점 해석</div>
                  <ul style={{ margin: "6px 0 0 16px", color: "#cbd5f5", fontSize: 12 }}>
                    {[...selectedReport.institutionView.reasons, ...selectedReport.institutionView.notYet].map(
                      (line) => (
                        <li key={line}>{line}</li>
                      ),
                    )}
                  </ul>
                </div>

                <div>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>관찰 포인트</div>
                  <ul style={{ margin: "6px 0 0 16px", color: "#cbd5f5", fontSize: 12 }}>
                    {[
                      ...selectedReport.watchPoints.policy,
                      ...selectedReport.watchPoints.institution,
                      ...selectedReport.watchPoints.governance,
                    ].map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
