"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface DecisionActionPanelProps {
  decisionId: string;
  status: string;
  blockReason?: string;
}

async function approveDecision(decisionId: string) {
  try {
    // Update decision status via API
    const res = await fetch(`/api/decisions/${decisionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "approved" }),
    });

    if (!res.ok) throw new Error("Failed to approve decision");
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Error approving decision" };
  }
}

async function overrideDecision(decisionId: string, reason: string) {
  try {
    const res = await fetch(`/api/decisions/${decisionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: "approved",
        override_reason: reason,
        override_approved_at: new Date().toISOString(),
      }),
    });

    if (!res.ok) throw new Error("Failed to override decision");
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Error overriding decision" };
  }
}

async function rejectDecision(decisionId: string) {
  try {
    const res = await fetch(`/api/decisions/${decisionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "rejected" }),
    });

    if (!res.ok) throw new Error("Failed to reject decision");
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Error rejecting decision" };
  }
}

export function DecisionActionPanel({ decisionId, status, blockReason }: DecisionActionPanelProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [overrideReason, setOverrideReason] = useState("");
  const [showOverrideForm, setShowOverrideForm] = useState(false);

  const handleApprove = async () => {
    setLoading(true);
    setError(null);

    const result = await approveDecision(decisionId);
    if (result.success) {
      router.push("/decisions/impact");
    } else {
      setError(result.error || "Error approving decision");
    }
    setLoading(false);
  };

  const handleOverride = async () => {
    if (!overrideReason.trim()) {
      setError("Override reason is required");
      return;
    }

    setLoading(true);
    setError(null);

    const result = await overrideDecision(decisionId, overrideReason);
    if (result.success) {
      router.push("/decisions/impact");
    } else {
      setError(result.error || "Error overriding decision");
    }
    setLoading(false);
  };

  const handleReject = async () => {
    setLoading(true);
    setError(null);

    const result = await rejectDecision(decisionId);
    if (result.success) {
      router.push("/decisions");
    } else {
      setError(result.error || "Error rejecting decision");
    }
    setLoading(false);
  };

  return (
    <div className="bg-gray-50 p-4 rounded-lg border">
      <h3 className="font-semibold text-gray-900 mb-4">DECISION ACTION</h3>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded p-3 mb-4 text-sm text-red-800">
          {error}
        </div>
      )}

      {status === "pending" && (
        <div className="space-y-3">
          <button
            onClick={handleApprove}
            disabled={loading}
            className="w-full bg-green-600 text-white py-2 px-4 rounded hover:bg-green-700 disabled:bg-gray-400 font-medium"
          >
            {loading ? "Processing..." : "✓ APPROVE"}
          </button>
          <button
            onClick={handleReject}
            disabled={loading}
            className="w-full bg-red-600 text-white py-2 px-4 rounded hover:bg-red-700 disabled:bg-gray-400 font-medium"
          >
            {loading ? "Processing..." : "✗ REJECT"}
          </button>
        </div>
      )}

      {status === "blocked" && (
        <div className="space-y-3">
          {!showOverrideForm ? (
            <button
              onClick={() => setShowOverrideForm(true)}
              disabled={loading}
              className="w-full bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700 disabled:bg-gray-400 font-medium"
            >
              ⚠️ OVERRIDE BLOCK
            </button>
          ) : (
            <div className="space-y-3">
              <textarea
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                placeholder="Why are you overriding this block? (required)"
                className="w-full border rounded p-2 text-sm"
                rows={3}
              />
              <div className="flex gap-2">
                <button
                  onClick={handleOverride}
                  disabled={loading}
                  className="flex-1 bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700 disabled:bg-gray-400 font-medium text-sm"
                >
                  {loading ? "Processing..." : "Confirm Override"}
                </button>
                <button
                  onClick={() => {
                    setShowOverrideForm(false);
                    setOverrideReason("");
                  }}
                  disabled={loading}
                  className="flex-1 bg-gray-400 text-white py-2 px-4 rounded hover:bg-gray-500 font-medium text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {(status === "approved" || status === "done") && (
        <div className="text-center py-4 text-gray-600">
          <p className="text-sm">This decision has been {status}.</p>
          <p className="text-xs text-gray-500 mt-2">View impact on dashboard →</p>
        </div>
      )}

      <div className="text-xs text-gray-500 mt-4 pt-4 border-t">
        ⓘ All actions are logged to audit trail and cannot be undone.
      </div>
    </div>
  );
}
