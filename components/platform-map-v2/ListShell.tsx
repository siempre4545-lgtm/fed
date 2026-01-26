import type { Grade } from "../../lib/platform-map-v2/scoring";
import type { PlatformMapSample } from "../../lib/platform-map-v2/types";

type Props = {
  items: Array<PlatformMapSample & { total: number; grade: Grade }>;
  selectedId: string;
  onSelect: (id: string) => void;
  search: string;
  onSearch: (value: string) => void;
};

export default function ListShell({ items, selectedId, onSelect, search, onSearch }: Props) {
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
      <div style={{ fontSize: 13, marginBottom: 8 }}>리스트 (placeholder)</div>
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
              <span style={{ fontSize: 11, color: "#94a3b8" }}>
                {item.grade} · {item.total}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
