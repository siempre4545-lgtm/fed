type Props = {
  selectedName: string;
};

export default function DetailShell({ selectedName }: Props) {
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
      <div style={{ fontSize: 13, marginBottom: 8 }}>상세 (placeholder)</div>
      <div style={{ fontSize: 12 }}>선택된 지역 상세: {selectedName}</div>
    </div>
  );
}
