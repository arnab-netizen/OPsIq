"use client";

import { useState } from "react";
import { OutputPanel } from "@/components/OutputPanel";
import { TrustCard } from "@/components/TrustCard";

interface DecisionOutput {
  problem: string;
  action: string;
  impactMultiplier: number;
  confidence: number;
  ruleId: string;
}

interface ImpactEstimate {
  impactLow: number;
  impactExpected: number;
  impactHigh: number;
  confidenceWeight: number;
}

interface AnalysisResult {
  decisions: DecisionOutput[];
  impact: ImpactEstimate;
}

export default function QuickStartPage() {
  const [revenue, setRevenue] = useState("");
  const [cost, setCost] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);

  const handleRunAnalysis = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          revenue: parseFloat(revenue),
          cost: parseFloat(cost),
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to run analysis");
      }

      const data = await response.json();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: "20px", fontFamily: "sans-serif", maxWidth: "600px" }}>
      <h1>Quick Start Analysis</h1>

      <div style={{ marginBottom: "20px" }}>
        <div style={{ marginBottom: "15px" }}>
          <label>
            Revenue ($):
            <input
              type="number"
              value={revenue}
              onChange={(e) => setRevenue(e.target.value)}
              disabled={loading}
              placeholder="e.g., 10000"
              style={{
                marginLeft: "10px",
                padding: "8px",
                fontSize: "14px",
                width: "150px",
              }}
            />
          </label>
        </div>

        <div style={{ marginBottom: "15px" }}>
          <label>
            Cost ($):
            <input
              type="number"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              disabled={loading}
              placeholder="e.g., 5000"
              style={{
                marginLeft: "10px",
                padding: "8px",
                fontSize: "14px",
                width: "150px",
              }}
            />
          </label>
        </div>

        <button
          onClick={handleRunAnalysis}
          disabled={loading || !revenue || !cost}
          style={{
            padding: "10px 20px",
            fontSize: "16px",
            fontWeight: "bold",
            cursor: loading || !revenue || !cost ? "not-allowed" : "pointer",
            opacity: loading || !revenue || !cost ? 0.5 : 1,
            backgroundColor: "#007bff",
            color: "white",
            border: "none",
            borderRadius: "4px",
          }}
        >
          {loading ? "Running Analysis..." : "Run Analysis"}
        </button>
      </div>

      {error && (
        <div
          style={{
            color: "#d32f2f",
            backgroundColor: "#ffebee",
            padding: "12px",
            borderRadius: "4px",
            marginBottom: "20px",
          }}
        >
          Error: {error}
        </div>
      )}

      {result && result.decisions.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
          <OutputPanel
            problem={result.decisions[0].problem}
            action={result.decisions[0].action}
            impact={{
              low: result.impact.impactLow,
              expected: result.impact.impactExpected,
              high: result.impact.impactHigh,
            }}
            confidence={result.impact.confidenceWeight}
          />
          <TrustCard
            ruleId={result.decisions[0].ruleId}
            confidence={result.decisions[0].confidence}
          />
        </div>
      )}
    </div>
  );
}
