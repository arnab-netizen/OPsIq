"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface DecisionData {
  id: string;
  workspaceId: string;
  problem: string;
  action: string;
  confidence: number;
  impactExpected: number;
  impactLow: number;
  impactHigh: number;
  status: string;
  blockStage: string | null;
  blockReason: string | null;
  gateResult: any;
  guardrailResult: any;
  controlLayerViolations: any;
  explanation: any;
  inputsSnapshot: any;
  createdAt: Date;
  updatedAt: Date;
  auditLog: Array<any>;
  ownerUserId?: string;
  createdBy?: string;
  assignedTo?: string | null;
  reviewedBy?: string | null;
}

interface DecisionDetailViewProps {
  decision: DecisionData;
  workspaceId?: string;
}

export default function DecisionDetailView({ decision, workspaceId = "" }: DecisionDetailViewProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [overrideReason, setOverrideReason] = useState("");
  const [showOverride, setShowOverride] = useState(false);

  const getWorkspaceId = () => {
    if (workspaceId) return workspaceId;
    // Fallback: try to get from URL params
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      return params.get("workspaceId") || decision.workspaceId;
    }
    return decision.workspaceId;
  };

  const handleApprove = async () => {
    setLoading(true);
    setError(null);

    try {
      const wsId = getWorkspaceId();
      const res = await fetch(
        `/api/decisions/${decision.id}?workspaceId=${wsId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "approved" }),
        }
      );

      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || "Failed to approve decision");
      }

      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Error approving decision"
      );
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async () => {
    setLoading(true);
    setError(null);

    try {
      const wsId = getWorkspaceId();
      const res = await fetch(
        `/api/decisions/${decision.id}?workspaceId=${wsId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "rejected" }),
        }
      );

      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || "Failed to reject decision");
      }

      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Error rejecting decision"
      );
    } finally {
      setLoading(false);
    }
  };

  const handleOverride = async () => {
    if (!overrideReason.trim()) {
      setError("Override reason is required");
      return;
    }

    if (overrideReason.length < 10) {
      setError("Please provide a detailed reason (at least 10 characters)");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const wsId = getWorkspaceId();
      const res = await fetch(
        `/api/decisions/${decision.id}?workspaceId=${wsId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: "approved",
            override_reason: overrideReason,
            override_approved_at: new Date().toISOString(),
          }),
        }
      );

      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || "Failed to override decision");
      }

      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Error overriding decision"
      );
    } finally {
      setLoading(false);
    }
  };

  const inputs = decision.inputsSnapshot || {};
  const explanation = decision.explanation || {};

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-6 pb-4 border-b">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">{decision.problem}</h1>
        <div className="flex items-center gap-4 mb-3">
          <span
            className={`px-3 py-1 rounded text-sm font-medium ${
              decision.status === "pending"
                ? "bg-yellow-200 text-yellow-800"
                : decision.status === "approved"
                  ? "bg-green-200 text-green-800"
                  : decision.status === "blocked"
                    ? "bg-red-200 text-red-800"
                    : "bg-gray-200 text-gray-800"
            }`}
          >
            {decision.status.toUpperCase()}
          </span>
          <span className="text-gray-500">
            Created {new Date(decision.createdAt).toLocaleDateString()}
          </span>
        </div>
        <div className="flex gap-6 text-sm">
          {decision.ownerUserId && (
            <div>
              <span className="text-gray-600">Owner:</span>
              <span className="ml-2 font-medium text-gray-900">{decision.ownerUserId.slice(0, 8)}</span>
            </div>
          )}
          {decision.assignedTo ? (
            <div>
              <span className="text-gray-600">Assigned to:</span>
              <span className="ml-2 font-medium text-blue-600">{decision.assignedTo.slice(0, 8)}</span>
            </div>
          ) : (
            <div>
              <span className="text-gray-600">Assigned to:</span>
              <span className="ml-2 text-gray-500 italic">Unassigned</span>
            </div>
          )}
          {decision.reviewedBy && (
            <div>
              <span className="text-gray-600">Reviewed by:</span>
              <span className="ml-2 font-medium text-green-600">{decision.reviewedBy.slice(0, 8)}</span>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="col-span-2 space-y-6">
          {/* Inputs */}
          <div className="bg-white border rounded-lg p-4">
            <h2 className="font-bold text-gray-900 mb-4">Decision Inputs</h2>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase">
                  Description
                </label>
                <p className="text-gray-900 mt-1">{decision.action}</p>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase">
                    Confidence
                  </label>
                  <p className="text-xl font-bold text-gray-900 mt-1">
                    {(decision.confidence * 100).toFixed(0)}%
                  </p>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase">
                    Expected Impact
                  </label>
                  <p className="text-xl font-bold text-blue-600 mt-1">
                    ₹{(decision.impactExpected / 1000000).toFixed(2)}M
                  </p>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase">
                    Impact Range
                  </label>
                  <p className="text-sm text-gray-700 mt-1">
                    ₹{(decision.impactLow / 1000000).toFixed(2)}M - ₹{(decision.impactHigh / 1000000).toFixed(2)}M
                  </p>
                </div>
              </div>
              {inputs.revenue || inputs.cost ? (
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase">
                    Financial Inputs
                  </label>
                  <div className="text-gray-900 mt-1 text-sm space-y-1">
                    {inputs.revenue && <p>Revenue: ₹{(inputs.revenue / 1000000).toFixed(2)}M</p>}
                    {inputs.cost && <p>Cost: ₹{(inputs.cost / 1000000).toFixed(2)}M</p>}
                    {inputs.expectedROI && (
                      <p>Expected ROI: {(inputs.expectedROI * 100).toFixed(1)}%</p>
                    )}
                  </div>
                </div>
              ) : null}
              {inputs.risk && (
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase">
                    Risk Level
                  </label>
                  <p className="text-gray-900 mt-1 capitalize">{inputs.risk}</p>
                </div>
              )}
            </div>
          </div>

          {/* Evaluation Result */}
          {explanation?.evaluated_at && (
            <div className="bg-white border rounded-lg p-4">
              <h2 className="font-bold text-gray-900 mb-4">Evaluation Result</h2>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase">
                    Recommendation
                  </label>
                  <p
                    className={`text-lg font-bold mt-1 ${
                      explanation.recommendation === "approved"
                        ? "text-green-600"
                        : "text-red-600"
                    }`}
                  >
                    {explanation.recommendation === "approved" ? "✓ APPROVE" : "⚠️ BLOCK"}
                  </p>
                </div>
                {explanation.block_stage && (
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase">
                      Block Stage
                    </label>
                    <p className="text-gray-900 mt-1">{explanation.block_stage}</p>
                  </div>
                )}
                {explanation.block_reason && (
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase">
                      Block Reason
                    </label>
                    <p className="text-gray-900 mt-1">{explanation.block_reason}</p>
                  </div>
                )}
                {explanation.evaluation_result?.controlLayerViolations && (
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase">
                      Control Violations
                    </label>
                    <pre className="text-gray-900 mt-1 text-xs bg-gray-50 p-2 rounded overflow-auto">
                      {JSON.stringify(explanation.evaluation_result.controlLayerViolations, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Block Reasons */}
          {decision.blockStage && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <h2 className="font-bold text-red-900 mb-4">⚠️ Decision Blocked</h2>
              <div className="space-y-2 text-sm text-red-800">
                {decision.blockStage && <p>Stage: {decision.blockStage}</p>}
                {decision.blockReason && <p>Reason: {decision.blockReason}</p>}
              </div>
            </div>
          )}

          {/* Audit Trail */}
          <div className="bg-white border rounded-lg p-4">
            <h2 className="font-bold text-gray-900 mb-4">Audit Trail</h2>
            <div className="space-y-3">
              {decision.auditLog && decision.auditLog.length > 0 ? (
                decision.auditLog.map((event: any, idx: number) => (
                  <div key={idx} className="border-l-2 border-gray-200 pl-3 py-2">
                    <div className="flex justify-between items-start">
                      <span className="font-semibold text-sm text-gray-900">{event.eventName}</span>
                      <span className="text-xs text-gray-500">
                        {new Date(event.createdAt).toLocaleString()}
                      </span>
                    </div>
                    {event.metadata && (
                      <div className="mt-2 text-xs">
                        {event.metadata.action && (
                          <p className="text-gray-700">
                            <span className="font-semibold">Action:</span> {event.metadata.action}
                          </p>
                        )}
                        {event.metadata.status && (
                          <p className="text-gray-700">
                            <span className="font-semibold">Status:</span> {event.metadata.status}
                          </p>
                        )}
                        {event.metadata.reason && (
                          <p className="text-gray-700">
                            <span className="font-semibold">Reason:</span> {event.metadata.reason}
                          </p>
                        )}
                        {event.metadata.override_reason && (
                          <p className="text-gray-700">
                            <span className="font-semibold">Override:</span> {event.metadata.override_reason}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <p className="text-gray-500 text-sm">No audit events yet</p>
              )}
            </div>
          </div>
        </div>

        {/* Actions Sidebar */}
        <div className="col-span-1">
          <div className="bg-white border rounded-lg p-4 sticky top-6">
            <h2 className="font-bold text-gray-900 mb-4">Actions</h2>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded p-2 mb-4 text-xs text-red-800">
                {error}
              </div>
            )}

            {decision.status === "pending" && (
              <div className="space-y-2">
                <div className="text-xs text-gray-600 mb-3 italic">
                  Review and approve or reject this decision
                </div>
                <button
                  onClick={handleApprove}
                  disabled={loading}
                  className="w-full bg-green-600 text-white py-2 px-3 rounded text-sm font-medium hover:bg-green-700 disabled:bg-gray-400 transition"
                  title="Approve this decision"
                >
                  {loading ? "Processing..." : "✓ APPROVE"}
                </button>
                <button
                  onClick={handleReject}
                  disabled={loading}
                  className="w-full bg-red-600 text-white py-2 px-3 rounded text-sm font-medium hover:bg-red-700 disabled:bg-gray-400 transition"
                  title="Reject this decision"
                >
                  {loading ? "Processing..." : "✗ REJECT"}
                </button>
              </div>
            )}

            {decision.status === "blocked" && (
              <div className="space-y-2">
                {!showOverride ? (
                  <>
                    <div className="text-xs text-gray-600 mb-3 italic">
                      This decision is blocked by governance rules. Admin override is available.
                    </div>
                    <button
                      onClick={() => setShowOverride(true)}
                      disabled={loading}
                      className="w-full bg-blue-600 text-white py-2 px-3 rounded text-sm font-medium hover:bg-blue-700 disabled:bg-gray-400 transition"
                      title="Override the block and approve this decision"
                    >
                      ⚠️ OVERRIDE
                    </button>
                  </>
                ) : (
                  <>
                    <div className="text-xs text-gray-700 mb-2 font-semibold">
                      Override requires detailed reason:
                    </div>
                    <textarea
                      value={overrideReason}
                      onChange={(e) => setOverrideReason(e.target.value)}
                      placeholder="Explain why you are overriding the governance block..."
                      className="w-full border rounded p-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                      rows={4}
                    />
                    <div className="text-xs text-gray-500">
                      {overrideReason.length} / 10+ characters required
                    </div>
                    <button
                      onClick={handleOverride}
                      disabled={loading || overrideReason.length < 10}
                      className="w-full bg-blue-600 text-white py-2 px-3 rounded text-sm font-medium hover:bg-blue-700 disabled:bg-gray-400 transition"
                    >
                      {loading ? "Processing..." : "Confirm Override"}
                    </button>
                    <button
                      onClick={() => {
                        setShowOverride(false);
                        setOverrideReason("");
                      }}
                      disabled={loading}
                      className="w-full bg-gray-300 text-gray-900 py-2 px-3 rounded text-sm font-medium hover:bg-gray-400 transition"
                    >
                      Cancel
                    </button>
                  </>
                )}
              </div>
            )}

            {(decision.status === "approved" || decision.status === "done") && (
              <div className="text-center py-4 text-gray-600 text-sm">
                Decision {decision.status}
              </div>
            )}

            <div className="text-xs text-gray-500 mt-4 pt-4 border-t">
              All actions are logged to audit trail
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
