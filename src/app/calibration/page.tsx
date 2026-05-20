"use client";

import { useEffect, useState } from "react";
import { AccuracyPanel } from "@/components/AccuracyPanel";
import { toOperatorSafeError } from "@/lib/operator-safe-errors";

interface CalibrationRecord {
  id: string;
  operatorItemId: string;
  predictedImpact: number;
  actualImpact: number;
  confidence: number;
  deviation: number;
  createdAt: string;
}

interface CalibrationSummary {
  totalRecords: number;
  avgDeviation: number;
  accuracyScore: number;
}

interface CalibrationResponse {
  records: CalibrationRecord[];
  summary: CalibrationSummary;
}

export default function CalibrationPage() {
  const [data, setData] = useState<CalibrationResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchCalibration = async () => {
      try {
        const response = await fetch("/api/calibration");
        if (!response.ok) {
          throw new Error("Failed to fetch calibration data");
        }
        const data = await response.json();
        setData(data);
      } catch (err) {
        setError(toOperatorSafeError(err, "load").error);
      } finally {
        setLoading(false);
      }
    };

    fetchCalibration();
  }, []);

  return (
    <div style={{ padding: "20px", fontFamily: "sans-serif", maxWidth: "800px" }}>
      <h1>Calibration Dashboard</h1>

      {loading && <p>Loading...</p>}

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

      {data && (
        <>
          <div style={{ marginBottom: "30px" }}>
            <AccuracyPanel
              accuracyScore={data.summary.accuracyScore}
              avgDeviation={data.summary.avgDeviation}
              totalRecords={data.summary.totalRecords}
            />
          </div>

          <div>
            <h2>Recent Predictions</h2>
            {data.records.length === 0 ? (
              <p style={{ color: "#999" }}>No calibration records yet</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {data.records.slice(-5).reverse().map((record) => (
                  <div
                    key={record.id}
                    style={{
                      border: "1px solid #ddd",
                      padding: "10px",
                      borderRadius: "4px",
                      backgroundColor: "#fff",
                    }}
                  >
                    <p style={{ margin: "4px 0", fontSize: "14px" }}>
                      <strong>Predicted:</strong> ${record.predictedImpact.toFixed(2)}
                    </p>
                    <p style={{ margin: "4px 0", fontSize: "14px" }}>
                      <strong>Actual:</strong> ${record.actualImpact.toFixed(2)}
                    </p>
                    <p style={{ margin: "4px 0 0 0", fontSize: "14px", color: "#666" }}>
                      <strong>Deviation:</strong> {(record.deviation * 100).toFixed(1)}%
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
