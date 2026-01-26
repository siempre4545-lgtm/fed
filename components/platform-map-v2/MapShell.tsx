import Link from "next/link";
import { useState } from "react";
import type { Grade } from "../../lib/platform-map-v2/scoring";
import type { PlatformMapSample } from "../../lib/platform-map-v2/types";

type ItemWithScore = PlatformMapSample & { total: number; grade: Grade };

type Props = {
  items: ItemWithScore[];
  selectedId?: string;
};

const GRADE_STYLES: Record<Grade, { bg: string; text: string }> = {
  A: { bg: "#14532d", text: "#86efac" },
  B: { bg: "#1e3a8a", text: "#93c5fd" },
  C: { bg: "#4c1d95", text: "#c4b5fd" },
  D: { bg: "#7f1d1d", text: "#fecaca" },
};

const getTopAxes = (item: PlatformMapSample) =>
  [...item.axes].sort((a, b) => b.score - a.score).slice(0, 3);

export default function MapShell({ items, selectedId }: Props) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const focused =
    items.find((item) => item.id === hoveredId) ??
    (selectedId ? items.find((item) => item.id === selectedId) : undefined) ??
    items[0];

  return (
    <div
      style={{
        minHeight: 320,
        borderRadius: 12,
        border: "1px solid #1f2937",
        background: "#0f172a",
        padding: 16,
        color: "#cbd5f5",
      }}
    >
      <div style={{ fontSize: 13, marginBottom: 8 }}>지도 영역 (grade overview)</div>
      {focused && (
        <div style={{ display: "grid", gap: 6, marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: "#e5e7eb" }}>
            {focused.name} · 총점 {focused.total}/120 · 등급 {focused.grade}
          </div>
          <div style={{ fontSize: 11, color: "#94a3b8" }}>
            상위 3축:{" "}
            {getTopAxes(focused)
              .map((axis) => `${axis.label}(${axis.score})`)
              .join(" / ")}
          </div>
        </div>
      )}
      <div style={{ display: "grid", gap: 8 }}>
        {items.map((item) => {
          const gradeStyle = GRADE_STYLES[item.grade];
          const active = item.id === selectedId;
          return (
            <Link
              key={item.id}
              href={`/platform-map-v2/${encodeURIComponent(item.name)}`}
              onMouseEnter={() => setHoveredId(item.id)}
              onMouseLeave={() => setHoveredId((prev) => (prev === item.id ? null : prev))}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 8,
                padding: "8px 10px",
                borderRadius: 10,
                border: active ? "1px solid #38bdf8" : "1px solid #1f2937",
                background: "#111827",
                color: "#e5e7eb",
                textDecoration: "none",
              }}
            >
              <span style={{ fontSize: 12 }}>{item.name}</span>
              <span
                style={{
                  fontSize: 11,
                  borderRadius: 999,
                  padding: "2px 8px",
                  background: gradeStyle.bg,
                  color: gradeStyle.text,
                }}
              >
                {item.grade}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
