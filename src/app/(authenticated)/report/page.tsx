"use client";

import { useEffect, useState } from "react";
import { classifyOperatorError } from "@/lib/operator-error-governance";
import { toHttpResponseError } from "@/lib/operator-safe-errors";
import { CardDashboardSkeleton } from "@/ui/primitives";

interface ReportData {
  totalImpact: number;
  totalActions: number;
  completedActions: number;
  accuracyScore: number;
  generatedAt: string;
}

export default function ReportPage() {
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchReport = async () => {
      try {
        const response = await fetch("/api/report");
        if (!response.ok) {
          // Preserve the real HTTP status and the server's governed error
          // message instead of discarding them behind a generic message --
          // a generic "Failed to fetch report" string collided with the
          // classifier's network-error keyword check below, so a 401/403/500
          // response always rendered as "Couldn't connect to the server."
          throw await toHttpResponseError(response);
        }
        const data = await response.json();
        setReport(data);
      } catch (err) {
        const governed = classifyOperatorError(err instanceof Error ? err : new Error(String(err)), { context: "load" });
        setError(governed.operatorMessage);
      } finally {
        setLoading(false);
      }
    };

    fetchReport();
  }, []);

  return (
    <div style={{ padding: "20px", fontFamily: "sans-serif", maxWidth: "800px" }}>
      <h1>Report</h1>

      {loading && <CardDashboardSkeleton sections={2} label="Loading report" />}

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

      {report && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "20px",
            marginBottom: "20px",
          }}
        >
          <div
            style={{
              border: "1px solid #ccc",
              padding: "20px",
              borderRadius: "4px",
              backgroundColor: "#f5f5f5",
            }}
          >
            <h3 style={{ margin: "0 0 10px 0", color: "#333" }}>Total Impact</h3>
            <p
              style={{
                margin: 0,
                fontSize: "28px",
                fontWeight: "bold",
                color: "#28a745",
              }}
            >
              ${report.totalImpact.toFixed(2)}
            </p>
          </div>

          <div
            style={{
              border: "1px solid #ccc",
              padding: "20px",
              borderRadius: "4px",
              backgroundColor: "#f5f5f5",
            }}
          >
            <h3 style={{ margin: "0 0 10px 0", color: "#333" }}>Total Actions</h3>
            <p
              style={{
                margin: 0,
                fontSize: "28px",
                fontWeight: "bold",
                color: "#007bff",
              }}
            >
              {report.totalActions}
            </p>
          </div>

          <div
            style={{
              border: "1px solid #ccc",
              padding: "20px",
              borderRadius: "4px",
              backgroundColor: "#f5f5f5",
            }}
          >
            <h3 style={{ margin: "0 0 10px 0", color: "#333" }}>Completed Actions</h3>
            <p
              style={{
                margin: 0,
                fontSize: "28px",
                fontWeight: "bold",
                color: "#20c997",
              }}
            >
              {report.completedActions} / {report.totalActions}
            </p>
          </div>

          <div
            style={{
              border: "1px solid #ccc",
              padding: "20px",
              borderRadius: "4px",
              backgroundColor: "#f5f5f5",
            }}
          >
            <h3 style={{ margin: "0 0 10px 0", color: "#333" }}>Accuracy</h3>
            <p
              style={{
                margin: 0,
                fontSize: "28px",
                fontWeight: "bold",
                color: "#ffc107",
              }}
            >
              {(report.accuracyScore * 100).toFixed(1)}%
            </p>
          </div>
        </div>
      )}

      {report && (
        <div
          style={{
            color: "#999",
            fontSize: "12px",
            marginTop: "20px",
          }}
        >
          Generated at: {new Date(report.generatedAt).toLocaleString()}
        </div>
      )}
    </div>
  );
}
