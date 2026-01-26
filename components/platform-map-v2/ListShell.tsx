import { useMemo, useState } from "react";
import type { Grade } from "../../lib/platform-map-v2/scoring";
import { getScoreSummary } from "../../lib/platform-map-v2/scoring";
import type { PlatformMapSample } from "../../lib/platform-map-v2/types";

type Props = {
  items: PlatformMapSample[];
  selectedId: string;
  onSelect: (id: string) => void;
};

const GRADE_OPTIONS: Grade[] = ["A", "B", "C", "D"];

export default function ListShell({ items, selectedId, onSelect }: Props) {
  const [search, setSearch] = useState("");
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");
  const [selectedGrades, setSelectedGrades] = useState<Grade[]>([]);

  const itemsWithScore = useMemo(
    () =>
      items.map((item) => {
        const summary = getScoreSummary(item.axes);
        return { ...item, total: summary.total, grade: summary.grade };
      }),
    [items],
  );

  const filteredItems = useMemo(() => {
    const term = search.trim().toLowerCase();
    const gradeSet = new Set(selectedGrades);
    const result = itemsWithScore.filter((item) => {
      const nameMatch = term.length === 0 || item.name.toLowerCase().includes(term);
      const gradeMatch = gradeSet.size === 0 || gradeSet.has(item.grade);
      return nameMatch && gradeMatch;
    });

    return [...result].sort((a, b) =>
      sortOrder === "desc" ? b.total - a.total : a.total - b.total,
    );
  }, [itemsWithScore, search, selectedGrades, sortOrder]);

  const toggleGrade = (grade: Grade) => {
    setSelectedGrades((prev) =>
      prev.includes(grade) ? prev.filter((item) => item !== grade) : [...prev, grade],
    );
  };

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
          onChange={(event) => setSearch(event.target.value)}
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
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {GRADE_OPTIONS.map((grade) => {
            const active = selectedGrades.includes(grade);
            return (
              <button
                key={grade}
                type="button"
                onClick={() => toggleGrade(grade)}
                style={{
                  borderRadius: 999,
                  border: active ? "1px solid #38bdf8" : "1px solid #1f2937",
                  background: active ? "#0b1f3a" : "#111827",
                  color: "#e5e7eb",
                  padding: "4px 10px",
                  fontSize: 11,
                  cursor: "pointer",
                }}
              >
                {grade}
              </button>
            );
          })}
          <span style={{ fontSize: 11, color: "#94a3b8", alignSelf: "center" }}>
            총 {filteredItems.length}/{items.length}
          </span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 11, color: "#94a3b8" }}>정렬</span>
          <button
            type="button"
            onClick={() => setSortOrder("desc")}
            style={{
              borderRadius: 999,
              border: sortOrder === "desc" ? "1px solid #38bdf8" : "1px solid #1f2937",
              background: sortOrder === "desc" ? "#0b1f3a" : "#111827",
              color: "#e5e7eb",
              padding: "4px 10px",
              fontSize: 11,
              cursor: "pointer",
            }}
          >
            총점 높은순
          </button>
          <button
            type="button"
            onClick={() => setSortOrder("asc")}
            style={{
              borderRadius: 999,
              border: sortOrder === "asc" ? "1px solid #38bdf8" : "1px solid #1f2937",
              background: sortOrder === "asc" ? "#0b1f3a" : "#111827",
              color: "#e5e7eb",
              padding: "4px 10px",
              fontSize: 11,
              cursor: "pointer",
            }}
          >
            총점 낮은순
          </button>
        </div>
      </div>
      <div style={{ display: "grid", gap: 8 }}>
        {filteredItems.length === 0 && (
          <div style={{ fontSize: 12, color: "#94a3b8" }}>조건에 맞는 지역이 없습니다.</div>
        )}
        {filteredItems.map((item) => {
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
