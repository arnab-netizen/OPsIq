/**
 * Audit Log Panel — displays correction and approval history.
 *
 * Shows all FactReviewAction records chronologically with details:
 * action type, fact, previous/new values, reason, timestamp.
 */
"use client";

import type { FactReviewAction } from "@/services/data-review/fact-review.service";

export interface AuditLogPanelProps {
  actions: FactReviewAction[];
  loading?: boolean;
}

function getActionBadgeColor(action: string): string {
  switch (action) {
    case "approved":
      return "bg-green-100 text-green-800";
    case "corrected":
      return "bg-blue-100 text-blue-800";
    case "rejected":
      return "bg-red-100 text-red-800";
    case "marked_unknown":
      return "bg-gray-100 text-gray-800";
    default:
      return "bg-gray-100 text-gray-800";
  }
}

function getActionEmoji(action: string): string {
  switch (action) {
    case "approved":
      return "✓";
    case "corrected":
      return "✎";
    case "rejected":
      return "✗";
    case "marked_unknown":
      return "?";
    default:
      return "•";
  }
}

export function AuditLogPanel({ actions, loading = false }: AuditLogPanelProps) {
  if (loading) {
    return (
      <div className="rounded-lg border border-gray-300 bg-gray-50 p-4">
        <h2 className="mb-4 text-lg font-semibold">Correction Audit Log</h2>
        <div className="text-center text-gray-500">Loading...</div>
      </div>
    );
  }

  const sortedActions = [...actions].reverse(); // Most recent first

  return (
    <div className="rounded-lg border border-gray-300 bg-gray-50 p-4">
      <h2 className="mb-4 text-lg font-semibold">Correction Audit Log</h2>

      {sortedActions.length === 0 ? (
        <div className="text-center text-gray-500">No corrections yet</div>
      ) : (
        <div className="space-y-3">
          {sortedActions.map((action, idx) => (
            <div key={idx} className="rounded bg-white p-3">
              <div className="mb-2 flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <span className={`inline-block rounded px-2 py-1 text-xs font-medium ${getActionBadgeColor(action.action)}`}>
                    {getActionEmoji(action.action)} {action.action}
                  </span>
                  <span className="font-mono text-sm text-gray-600">{action.factId}</span>
                </div>
              </div>

              {action.action === "corrected" && (
                <div className="mb-2 text-xs">
                  <div className="text-gray-600">
                    Previous: <span className="font-mono">{String(action.previousValue ?? "(null)")}</span>
                  </div>
                  <div className="text-gray-600">
                    New: <span className="font-mono">{String(action.newValue ?? "(null)")}</span>
                  </div>
                  {action.correctionReason && (
                    <div className="mt-1 text-gray-600">Reason: {action.correctionReason}</div>
                  )}
                </div>
              )}

              {action.action === "rejected" && action.correctionReason && (
                <div className="text-xs text-gray-600">Reason: {action.correctionReason}</div>
              )}

              {action.action === "marked_unknown" && action.correctionReason && (
                <div className="text-xs text-gray-600">Reason: {action.correctionReason}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
