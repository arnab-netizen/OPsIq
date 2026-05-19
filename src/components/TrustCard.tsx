import { GovMetric } from "@/src/components/ui/GovMetric";

interface TrustCardProps {
  ruleId: string;
  confidence: number;
}

export function TrustCard({ ruleId, confidence }: TrustCardProps) {
  // Convert confidence (0-1 scale) to percentage (0-100) for GovMetric
  const confidencePercentage = Math.round(confidence * 100);

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

      <div style={{ margin: "10px 0" }}>
        <GovMetric
          name="confidence"
          value={confidencePercentage}
          size="md"
          showInterpretation={true}
          showAction={false}
        />
      </div>

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
