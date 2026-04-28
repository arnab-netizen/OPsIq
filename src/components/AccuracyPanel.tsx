interface AccuracyPanelProps {
  accuracyScore: number;
  avgDeviation: number;
  totalRecords: number;
}

export function AccuracyPanel({
  accuracyScore,
  avgDeviation,
  totalRecords,
}: AccuracyPanelProps) {
  return (
    <div
      style={{
        border: "1px solid #ccc",
        padding: "15px",
        borderRadius: "4px",
        backgroundColor: "#f0f0f0",
      }}
    >
      <h3 style={{ margin: "0 0 10px 0" }}>System Accuracy</h3>

      <p style={{ margin: "8px 0", color: "#555" }}>
        <strong>Accuracy Score:</strong> {(accuracyScore * 100).toFixed(1)}%
      </p>

      <p style={{ margin: "8px 0", color: "#555" }}>
        <strong>Average Deviation:</strong> {(avgDeviation * 100).toFixed(1)}%
      </p>

      <p style={{ margin: "8px 0 0 0", color: "#555" }}>
        <strong>Total Tracked:</strong> {totalRecords} decisions
      </p>
    </div>
  );
}
