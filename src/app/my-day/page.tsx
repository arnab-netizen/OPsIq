"use client";

import { useEffect, useState } from "react";

interface OperatorItem {
  id: string;
  problem: string;
  action: string;
  impactExpected: number;
  confidence: number;
  priorityScore: number;
  status: "pending" | "in_progress" | "done";
}

export default function MyDayPage() {
  const [items, setItems] = useState<OperatorItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchItems = async () => {
      try {
        const response = await fetch("/api/operator");
        if (!response.ok) {
          throw new Error("Failed to fetch items");
        }
        const data = await response.json();
        setItems(data.slice(0, 3));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    };

    fetchItems();
  }, []);

  const handleStart = async (id: string) => {
    try {
      const response = await fetch("/api/operator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          status: "in_progress",
          actualOutcome: null,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to update item");
      }

      setItems(
        items.map((item) =>
          item.id === id ? { ...item, status: "in_progress" } : item
        )
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : "Unknown error");
    }
  };

  return (
    <div style={{ padding: "20px", fontFamily: "sans-serif", maxWidth: "800px" }}>
      <h1>My Day</h1>

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

      <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
        {items.map((item) => (
          <div
            key={item.id}
            style={{
              border: "1px solid #ccc",
              padding: "15px",
              borderRadius: "4px",
              backgroundColor: "#fafafa",
            }}
          >
            <h3 style={{ margin: "0 0 10px 0" }}>{item.problem}</h3>

            <p style={{ margin: "8px 0", color: "#555" }}>
              <strong>Action:</strong> {item.action}
            </p>

            <p style={{ margin: "8px 0", color: "#555" }}>
              <strong>Expected Impact:</strong> ${item.impactExpected.toFixed(2)}
            </p>

            <p style={{ margin: "8px 0", color: "#555" }}>
              <strong>Confidence:</strong> {(item.confidence * 100).toFixed(0)}%
            </p>

            <p style={{ margin: "8px 0 15px 0", color: "#555" }}>
              <strong>Priority Score:</strong> {item.priorityScore.toFixed(2)}
            </p>

            {item.status === "pending" && (
              <button
                onClick={() => handleStart(item.id)}
                style={{
                  padding: "8px 16px",
                  backgroundColor: "#28a745",
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                  cursor: "pointer",
                  fontWeight: "bold",
                }}
              >
                Start
              </button>
            )}

            {item.status === "in_progress" && (
              <span
                style={{
                  display: "inline-block",
                  padding: "8px 16px",
                  backgroundColor: "#ffc107",
                  color: "#333",
                  borderRadius: "4px",
                  fontWeight: "bold",
                }}
              >
                In Progress
              </span>
            )}

            {item.status === "done" && (
              <span
                style={{
                  display: "inline-block",
                  padding: "8px 16px",
                  backgroundColor: "#28a745",
                  color: "white",
                  borderRadius: "4px",
                  fontWeight: "bold",
                }}
              >
                Done
              </span>
            )}
          </div>
        ))}
      </div>

      {!loading && items.length === 0 && (
        <p style={{ color: "#999" }}>No items for today</p>
      )}
    </div>
  );
}
