type Props = {
  items: string[];
  selectedName: string;
  onSelect: (name: string) => void;
};

export default function ListShell({ items, selectedName, onSelect }: Props) {
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
      <div style={{ display: "grid", gap: 8 }}>
        {items.map((name) => {
          const active = name === selectedName;
          return (
            <button
              key={name}
              type="button"
              onClick={() => onSelect(name)}
              style={{
                textAlign: "left",
                padding: "8px 10px",
                borderRadius: 10,
                border: active ? "1px solid #38bdf8" : "1px solid #1f2937",
                background: active ? "#0b1f3a" : "#111827",
                color: "#e5e7eb",
                cursor: "pointer",
              }}
            >
              {name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
