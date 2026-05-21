"use client";

import { useState } from "react";
import { OperatorItem as OperatorItemType } from "@/domain/operator/types";
import { classifyOperatorError } from "@/lib/operator-error-governance";

interface OperatorItemProps {
  item: OperatorItemType;
  onUpdate?: (updatedItem: OperatorItemType) => void;
}

export function OperatorItem({ item, onUpdate }: OperatorItemProps) {
  const [loading, setLoading] = useState(false);
  const [overrideAction, setOverrideAction] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [overrideLoading, setOverrideLoading] = useState(false);

  const handleStart = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/operator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: item.id,
          status: "in_progress",
          actualOutcome: null,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to start");
      }

      onUpdate?.({ ...item, status: "in_progress" });
    } catch (error) {
      const governed = classifyOperatorError(error instanceof Error ? error : new Error(String(error)), { context: "action" });
      alert(governed.operatorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleComplete = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/operator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: item.id,
          status: "done",
          actualOutcome: "completed",
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to complete");
      }

      onUpdate?.({ ...item, status: "done" });
    } catch (error) {
      alert(error instanceof Error ? error.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  const handleOverride = async () => {
    if (!overrideAction || !overrideReason) {
      alert("Please enter both action and reason");
      return;
    }

    setOverrideLoading(true);
    try {
      const response = await fetch("/api/override", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operatorItemId: item.id,
          overriddenAction: overrideAction,
          reason: overrideReason,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to override");
      }

      setOverrideAction("");
      setOverrideReason("");
      alert("Override applied successfully");
    } catch (error) {
      alert(error instanceof Error ? error.message : "Unknown error");
    } finally {
      setOverrideLoading(false);
    }
  };

  return (
    <div
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
        <strong>Status:</strong>{" "}
        <span style={{ fontWeight: "bold" }}>{item.status}</span>
      </p>

      <div
        style={{
          backgroundColor: "#f0f0f0",
          padding: "12px",
          borderRadius: "4px",
          marginBottom: "15px",
        }}
      >
        <h4 style={{ margin: "0 0 10px 0" }}>Override Action</h4>
        <div style={{ marginBottom: "10px" }}>
          <label style={{ display: "block", marginBottom: "5px" }}>
            New Action:
          </label>
          <input
            type="text"
            value={overrideAction}
            onChange={(e) => setOverrideAction(e.target.value)}
            disabled={overrideLoading}
            placeholder="Enter new action"
            style={{
              width: "100%",
              padding: "8px",
              borderRadius: "4px",
              border: "1px solid #ccc",
              boxSizing: "border-box",
            }}
          />
        </div>

        <div style={{ marginBottom: "10px" }}>
          <label style={{ display: "block", marginBottom: "5px" }}>
            Reason:
          </label>
          <input
            type="text"
            value={overrideReason}
            onChange={(e) => setOverrideReason(e.target.value)}
            disabled={overrideLoading}
            placeholder="Enter reason for override"
            style={{
              width: "100%",
              padding: "8px",
              borderRadius: "4px",
              border: "1px solid #ccc",
              boxSizing: "border-box",
            }}
          />
        </div>

        <button
          onClick={handleOverride}
          disabled={overrideLoading}
          style={{
            padding: "8px 16px",
            backgroundColor: "#ffc107",
            color: "black",
            border: "none",
            borderRadius: "4px",
            cursor: overrideLoading ? "not-allowed" : "pointer",
            fontWeight: "bold",
            opacity: overrideLoading ? 0.6 : 1,
          }}
        >
          {overrideLoading ? "Overriding..." : "Override"}
        </button>
      </div>

      <div style={{ display: "flex", gap: "10px" }}>
        {item.status === "pending" && (
          <button
            onClick={handleStart}
            disabled={loading}
            style={{
              padding: "8px 16px",
              backgroundColor: "#28a745",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: loading ? "not-allowed" : "pointer",
              fontWeight: "bold",
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? "Starting..." : "Start"}
          </button>
        )}

        {item.status === "in_progress" && (
          <button
            onClick={handleComplete}
            disabled={loading}
            style={{
              padding: "8px 16px",
              backgroundColor: "#007bff",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: loading ? "not-allowed" : "pointer",
              fontWeight: "bold",
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? "Completing..." : "Complete"}
          </button>
        )}

        {item.status === "done" && (
          <span
            style={{
              padding: "8px 16px",
              backgroundColor: "#28a745",
              color: "white",
              borderRadius: "4px",
              fontWeight: "bold",
            }}
          >
            ✓ Done
          </span>
        )}
      </div>
    </div>
  );
}
