interface TrustCardProps {
  ruleId: string;
  confidence: number;
}

export function TrustCard({ ruleId, confidence }: TrustCardProps) {
  return (
    <div
      style={{
        border: "1px solid #ccc",
        padding: "15px",
        borderRadius: "4px",
        backgroundColor: "#fafafa",
      }}
    >
      <h3 style={{ margin: "0 0 10px 0" }}>Decision Trust</h3>

      <p style={{ margin: "5px 0" }}>
        <strong>Rule ID:</strong> {ruleId}
      </p>

      <p style={{ margin: "5px 0" }}>
        <strong>Confidence:</strong> {(confidence * 100).toFixed(0)}%
      </p>

      <p
        style={{
          margin: "10px 0 0 0",
          color: "#666",
          fontSize: "14px",
        }}
      >
        Deterministic rule-based decision
      </p>
    </div>
  );
}
