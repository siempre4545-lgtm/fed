type Props = {
  selectedName: string;
};

export default function MapShell({ selectedName }: Props) {
  return (
    <div
      style={{
        minHeight: 260,
        borderRadius: 12,
        border: "1px solid #1f2937",
        background: "#0f172a",
        padding: 16,
        color: "#cbd5f5",
      }}
    >
      <div style={{ fontSize: 13, marginBottom: 8 }}>지도 영역 (placeholder)</div>
      <div style={{ fontSize: 12 }}>선택 지역: {selectedName}</div>
    </div>
  );
}
