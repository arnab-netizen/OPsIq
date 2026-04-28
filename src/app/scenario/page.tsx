"use client";

import { useState } from "react";

interface ScenarioResult {
  impactExpected: number;
  impactLow: number;
  impactHigh: number;
}

export default function ScenarioPage() {
  const [baseRevenue, setBaseRevenue] = useState("");
  const [baseCost, setBaseCost] = useState("");
  const [deltaRevenue, setDeltaRevenue] = useState("");
  const [deltaCost, setDeltaCost] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ScenarioResult | null>(null);

  const handleSimulate = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch("/api/scenario", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseRevenue: parseFloat(baseRevenue),
          baseCost: parseFloat(baseCost),
          deltaRevenue: parseFloat(deltaRevenue),
          deltaCost: parseFloat(deltaCost),
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to run scenario");
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
      <h1>Scenario Lab</h1>

      <div style={{ marginBottom: "20px" }}>
        <div style={{ marginBottom: "15px" }}>
          <label>
            Base Revenue ($):
            <input
              type="number"
              value={baseRevenue}
              onChange={(e) => setBaseRevenue(e.target.value)}
              disabled={loading}
              placeholder="e.g., 10000"
              style={{ marginLeft: "10px", padding: "8px", width: "150px" }}
            />
          </label>
        </div>

        <div style={{ marginBottom: "15px" }}>
          <label>
            Base Cost ($):
            <input
              type="number"
              value={baseCost}
              onChange={(e) => setBaseCost(e.target.value)}
              disabled={loading}
              placeholder="e.g., 5000"
              style={{ marginLeft: "10px", padding: "8px", width: "150px" }}
            />
          </label>
        </div>

        <div style={{ marginBottom: "15px" }}>
          <label>
            Delta Revenue ($):
            <input
              type="number"
              value={deltaRevenue}
              onChange={(e) => setDeltaRevenue(e.target.value)}
              disabled={loading}
              placeholder="e.g., 1000"
              style={{ marginLeft: "10px", padding: "8px", width: "150px" }}
            />
          </label>
        </div>

        <div style={{ marginBottom: "15px" }}>
          <label>
            Delta Cost ($):
            <input
              type="number"
              value={deltaCost}
              onChange={(e) => setDeltaCost(e.target.value)}
              disabled={loading}
              placeholder="e.g., 200"
              style={{ marginLeft: "10px", padding: "8px", width: "150px" }}
            />
          </label>
        </div>

        <button
          onClick={handleSimulate}
          disabled={loading || !baseRevenue || !baseCost || !deltaRevenue || !deltaCost}
          style={{
            padding: "10px 20px",
            fontSize: "16px",
            fontWeight: "bold",
            backgroundColor: "#28a745",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: loading ? "not-allowed" : "pointer",
            opacity:
              loading || !baseRevenue || !baseCost || !deltaRevenue || !deltaCost
                ? 0.5
                : 1,
          }}
        >
          {loading ? "Simulating..." : "Simulate"}
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
            border: "1px solid #ccc",
            padding: "15px",
            borderRadius: "4px",
            backgroundColor: "#f5f5f5",
          }}
        >
          <h2 style={{ marginTop: "0" }}>Scenario Impact</h2>

          <p style={{ margin: "8px 0", color: "#555" }}>
            <strong>Expected Impact:</strong> ${result.impactExpected.toFixed(2)}
          </p>

          <p style={{ margin: "8px 0", color: "#555" }}>
            <strong>Low:</strong> ${result.impactLow.toFixed(2)}
          </p>

          <p style={{ margin: "8px 0 0 0", color: "#555" }}>
            <strong>High:</strong> ${result.impactHigh.toFixed(2)}
          </p>
        </div>
      )}
    </div>
  );
}
