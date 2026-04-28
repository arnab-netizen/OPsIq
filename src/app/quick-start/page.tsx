"use client";

import { useState } from "react";

interface AnalysisResult {
  problem: string;
  action: string;
  impactLow: number;
  impactExpected: number;
  impactHigh: number;
  confidence: number;
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

      {result && (
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
              {result.problem}
            </p>
          </div>

          <div style={{ marginBottom: "12px" }}>
            <strong>Action:</strong>
            <p style={{ margin: "4px 0 0 0", color: "#555" }}>
              {result.action}
            </p>
          </div>

          <div style={{ marginBottom: "12px" }}>
            <strong>Impact Estimate:</strong>
            <ul style={{ margin: "8px 0 0 20px", color: "#555" }}>
              <li>Low: ${result.impactLow.toFixed(2)}</li>
              <li>Expected: ${result.impactExpected.toFixed(2)}</li>
              <li>High: ${result.impactHigh.toFixed(2)}</li>
            </ul>
          </div>

          <div>
            <strong>Confidence:</strong>
            <p style={{ margin: "4px 0 0 0", color: "#555" }}>
              {(result.confidence * 100).toFixed(0)}%
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
