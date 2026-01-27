import Link from "next/link";
import type { PisStatus, PlatformMapRating } from "../../lib/platform-map-v2/types";

type Props = {
  items: Array<PlatformMapRating & { id: string; total: number }>;
  selectedId: string;
  onSelect: (id: string) => void;
  search: string;
  onSearch: (value: string) => void;
  totalCount: number;
};

const PIS_BADGE: Record<PisStatus, { label: string; color: string; background: string }> = {
  "기관 선행 구간": { label: "🟡 기관 선행", color: "#facc15", background: "#1f2937" },
  "관찰 필요": { label: "🔵 관찰 필요", color: "#60a5fa", background: "#0b1220" },
  정체: { label: "⚪ 정체", color: "#94a3b8", background: "#0b1220" },
};

export default function ListShell({
  items,
  selectedId,
  onSelect,
  search,
  onSearch,
  totalCount,
}: Props) {
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
      <div style={{ fontSize: 13, marginBottom: 8 }}>리스트</div>
      <div style={{ display: "grid", gap: 10, marginBottom: 12 }}>
        <input
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          placeholder="시군구명 검색"
          style={{
            width: "100%",
            borderRadius: 10,
            border: "1px solid #1f2937",
            padding: "8px 10px",
            background: "#0b1220",
            color: "#e5e7eb",
            fontSize: 12,
          }}
        />
        <div style={{ fontSize: 11, color: "#94a3b8" }}>
          표시 {items.length} / 전체 {totalCount}
        </div>
      </div>
      <div style={{ display: "grid", gap: 8 }}>
        {items.length === 0 && (
          <div style={{ fontSize: 12, color: "#94a3b8" }}>조건에 맞는 지역이 없습니다.</div>
        )}
        {items.map((item) => {
          const active = item.id === selectedId;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item.id)}
              style={{
                textAlign: "left",
                padding: "8px 10px",
                borderRadius: 10,
                border: active ? "1px solid #38bdf8" : "1px solid #1f2937",
                background: active ? "#0b1f3a" : "#111827",
                color: "#e5e7eb",
                cursor: "pointer",
                display: "flex",
                justifyContent: "space-between",
                gap: 8,
                alignItems: "center",
              }}
            >
              <span style={{ fontSize: 12 }}>{item.name}</span>
              <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {item.pisStatus && (
                  <span
                    style={{
                      borderRadius: 999,
                      border: `1px solid ${PIS_BADGE[item.pisStatus].color}`,
                      background: PIS_BADGE[item.pisStatus].background,
                      color: PIS_BADGE[item.pisStatus].color,
                      padding: "2px 6px",
                      fontSize: 10,
                    }}
                  >
                    {PIS_BADGE[item.pisStatus].label}
                  </span>
                )}
                {item.preInstitutionalMove && (
                  <span
                    style={{
                      borderRadius: 999,
                      border: "1px solid #f97316",
                      background: "#1f2937",
                      color: "#f97316",
                      padding: "2px 6px",
                      fontSize: 10,
                    }}
                  >
                    Pre-Institutional Move
                  </span>
                )}
                <span style={{ fontSize: 11, color: "#94a3b8" }}>
                  {item.scoreStatus ?? item.gradeLabel ?? item.grade} · {item.total}
                </span>
                <Link
                  href={`/platform-map-v2/${encodeURIComponent(item.name)}`}
                  style={{
                    borderRadius: 999,
                    border: "1px solid #1f2937",
                    padding: "2px 8px",
                    fontSize: 10,
                    color: "#e5e7eb",
                    textDecoration: "none",
                  }}
                >
                  상세
                </Link>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
