interface ImpactEstimate {
  low: number;
  expected: number;
  high: number;
}

interface OutputPanelProps {
  problem: string;
  action: string;
  impact: ImpactEstimate;
  confidence: number;
}

export function OutputPanel({
  problem,
  action,
  impact,
  confidence,
}: OutputPanelProps) {
  return (
    <div
      style={{
        border: "1px solid #e0e0e0",
        padding: "20px",
        borderRadius: "4px",
        backgroundColor: "#f5f5f5",
      }}
    >
      <h2 style={{ marginTop: "0" }}>Analysis Result</h2>

      <div style={{ marginBottom: "12px" }}>
        <strong>Problem:</strong>
        <p style={{ margin: "4px 0 0 0", color: "#555" }}>
          {problem}
        </p>
      </div>

      <div style={{ marginBottom: "12px" }}>
        <strong>Action:</strong>
        <p style={{ margin: "4px 0 0 0", color: "#555" }}>
          {action}
        </p>
      </div>

      <div style={{ marginBottom: "12px" }}>
        <strong>Impact Estimate:</strong>
        <ul style={{ margin: "8px 0 0 20px", color: "#555" }}>
          <li>Low: ${impact.low.toFixed(2)}</li>
          <li>Expected: ${impact.expected.toFixed(2)}</li>
          <li>High: ${impact.high.toFixed(2)}</li>
        </ul>
      </div>

      <div>
        <strong>Confidence:</strong>
        <p style={{ margin: "4px 0 0 0", color: "#555" }}>
          {(confidence * 100).toFixed(0)}%
        </p>
      </div>
    </div>
  );
}
