"use client";

import { useState } from "react";
import { Badge, Button } from "@/ui/primitives";
import {
  classifyOperatorError,
  type ErrorGovernanceContext,
} from "@/lib/operator-error-governance";
import { GovernedEmptyState } from "@/components/ui/GovernedEmptyState";

interface Action {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueDate?: string;
  version: number;
  blockerReason?: string;
  evidence?: any[];
  linkedEvidence?: string[];
}

interface ActionCenterProps {
  actions: Action[];
  engagementId: string;
  onActionUpdated?: () => void;
}

// State machine: allowed transitions per status
const STATE_MACHINE: Record<string, string[]> = {
  created: ["in_progress", "blocked", "cancelled"],
  in_progress: ["blocked", "completed", "created"],
  blocked: ["in_progress", "created", "cancelled"],
  completed: ["verified"],
  verified: [],
  cancelled: [],
};

// User-friendly button labels for transitions
const TRANSITION_LABELS: Record<string, string> = {
  in_progress: "Start",
  blocked: "Block",
  completed: "Complete",
  verified: "Verify",
  created: "Reset",
  cancelled: "Cancel",
};

export function ActionCenter({
  actions,
  engagementId,
  onActionUpdated,
}: ActionCenterProps) {
  const [updating, setUpdating] = useState<string | null>(null);
  const [localActions, setLocalActions] = useState(actions);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [dialogState, setDialogState] = useState<Record<string, { targetStatus: string; showReason: boolean; showEvidence: boolean }>>({});

  const getPriorityVariant = (priority: string) => {
    switch (priority) {
      case "critical":
        return "destructive";
      case "high":
        return "warning";
      default:
        return "default";
    }
  };

  const getStatusVariant = (status: string) => {
    switch (status) {
      case "completed":
      case "verified":
        return "success";
      case "blocked":
        return "destructive";
      case "in_progress":
        return "warning";
      default:
        return "muted";
    }
  };

  const isOverdue = (dueDate?: string) => {
    if (!dueDate) return false;
    return new Date(dueDate) < new Date();
  };

  const hasEvidence = (action: Action): boolean => {
    return !!(
      (Array.isArray(action.evidence) && action.evidence.length > 0) ||
      (Array.isArray(action.linkedEvidence) && action.linkedEvidence.length > 0)
    );
  };

  const handleStatusUpdate = async (
    actionId: string,
    newStatus: string,
    version: number,
    reason?: string
  ) => {
    // Validate before sending
    const action = localActions.find((a) => a.id === actionId);
    if (!action) return;

    const newErrors: Record<string, string> = {};

    // Check evidence requirement for complete
    if (newStatus === "completed" && !hasEvidence(action)) {
      newErrors[actionId] = "Cannot complete action without evidence";
    }

    // Check blocker reason requirement
    if (newStatus === "blocked" && !reason) {
      newErrors[actionId] = "Please provide a reason for blocking";
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setUpdating(actionId);
    setErrors({});

    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/actions/${actionId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: newStatus,
            version,
            ...(newStatus === "blocked" && reason && { blockerReason: reason }),
          }),
        }
      );

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        const error = new Error(errorData?.error?.message || "Failed to update action");
        const context: ErrorGovernanceContext = {
          context: "action",
          resourceId: actionId,
        };
        const governed = classifyOperatorError(error, context);
        setErrors({ [actionId]: governed.operatorMessage });
        return;
      }

      const updated = await res.json();
      setLocalActions(
        localActions.map((a) =>
          a.id === actionId
            ? {
                ...a,
                status: updated.status || newStatus,
                version: (updated.version || version) + 1,
                blockerReason: updated.blockerReason || a.blockerReason,
              }
            : a
        )
      );

      // Clear dialog state and call callback
      setDialogState((prev) => {
        const newState = { ...prev };
        delete newState[actionId];
        return newState;
      });
      onActionUpdated?.();
    } catch (err) {
      const governed = classifyOperatorError(err instanceof Error ? err : new Error(String(err)), { context: "action" });
      const errorMessage = governed.operatorMessage;
      setErrors({ [actionId]: errorMessage });
    } finally {
      setUpdating(null);
    }
  };

  const grouped = {
    blocked: localActions.filter((a) => a.status === "blocked"),
    overdue: localActions.filter(
      (a) =>
        a.status !== "completed" &&
        a.status !== "verified" &&
        a.status !== "blocked" &&
        isOverdue(a.dueDate)
    ),
    inProgress: localActions.filter(
      (a) => (a.status === "in_progress" || a.status === "created") && !isOverdue(a.dueDate)
    ),
    completed: localActions.filter((a) => a.status === "completed" || a.status === "verified"),
  };

  const renderActionCard = (action: Action, isDanger = false) => {
    const allowedTransitions = STATE_MACHINE[action.status] || [];
    const dialogActive = dialogState[action.id];
    const hasError = errors[action.id];
    const evidence = hasEvidence(action);

    return (
      <div
        key={action.id}
        className={`rounded-lg border p-4 space-y-3 ${
          isDanger
            ? "border-destructive/50 bg-destructive/5"
            : "border-border bg-background"
        }`}
      >
        {/* Header with title and status */}
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <h4 className="font-medium text-foreground">{action.title}</h4>
            <div className="mt-2 flex flex-wrap gap-2">
              <Badge variant={getStatusVariant(action.status)}>
                {action.status.replace("_", " ")}
              </Badge>
              <Badge variant={getPriorityVariant(action.priority)}>
                {action.priority}
              </Badge>
            </div>
          </div>
        </div>

        {/* Details: due date, evidence, blocker reason */}
        <div className="text-sm space-y-1 text-muted-foreground">
          {action.dueDate && (
            <div className="flex items-center gap-2">
              <span>Due:</span>
              <span
                className={isOverdue(action.dueDate) ? "text-[var(--warning-text)] font-medium" : ""}
              >
                {new Date(action.dueDate).toLocaleDateString()}
              </span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <span>Evidence:</span>
            <span className={evidence ? "text-[var(--success-text)] font-medium" : "text-muted-foreground"}>
              {evidence ? "✓ Linked" : "Not linked"}
            </span>
          </div>
          {action.blockerReason && (
            <div className="flex items-start gap-2 text-destructive">
              <span>Reason:</span>
              <span>{action.blockerReason}</span>
            </div>
          )}
        </div>

        {/* Error message */}
        {hasError && (
          <div className="rounded-md border border-destructive/20 bg-destructive/5 p-2 text-xs text-destructive">
            {hasError}
          </div>
        )}

        {/* Transition buttons with smart labels */}
        {allowedTransitions.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-2">
            {allowedTransitions.map((nextStatus) => {
              const label = TRANSITION_LABELS[nextStatus] || nextStatus;
              const needsReason = nextStatus === "blocked" && !action.blockerReason;
              const needsEvidence = nextStatus === "completed" && !evidence;

              return (
                <div key={nextStatus} className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant={nextStatus === "blocked" ? "destructive" : "outline"}
                    disabled={updating === action.id || needsReason || needsEvidence}
                    onClick={() => {
                      if (needsReason) {
                        setDialogState((prev) => ({
                          ...prev,
                          [action.id]: {
                            targetStatus: nextStatus,
                            showReason: true,
                            showEvidence: false,
                          },
                        }));
                      } else if (needsEvidence) {
                        setErrors({
                          [action.id]: "Cannot complete action without evidence",
                        });
                      } else {
                        handleStatusUpdate(action.id, nextStatus, action.version);
                      }
                    }}
                  >
                    {label}
                  </Button>
                  {needsReason && (
                    <span className="text-xs text-destructive">*reason</span>
                  )}
                  {needsEvidence && (
                    <span className="text-xs text-[var(--warning-text)]">*evidence</span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Inline dialog for reason when blocking */}
        {dialogActive?.showReason && (
          <div className="rounded-md border border-border bg-muted/20 p-3 space-y-2">
            <label className="text-xs font-medium">Why is this action blocked?</label>
            <textarea
              placeholder="Describe the blocker..."
              onKeyDown={(e) => {
                if (e.key === "Enter" && e.ctrlKey) {
                  const reason = (e.currentTarget.value || "").trim();
                  if (reason) {
                    handleStatusUpdate(action.id, "blocked", action.version, reason);
                  }
                }
              }}
              id={`blocker-reason-${action.id}`}
              className="w-full rounded border border-border bg-background p-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              rows={2}
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => {
                  const reason = (
                    document.getElementById(
                      `blocker-reason-${action.id}`
                    ) as HTMLTextAreaElement
                  )?.value.trim();
                  if (reason) {
                    handleStatusUpdate(action.id, "blocked", action.version, reason);
                  }
                }}
                disabled={updating === action.id}
              >
                Confirm Block
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  setDialogState((prev) => {
                    const newState = { ...prev };
                    delete newState[action.id];
                    return newState;
                  })
                }
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Blocked Actions */}
      {grouped.blocked.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-base font-semibold text-destructive">
            Blocked ({grouped.blocked.length})
          </h3>
          <div className="space-y-3">
            {grouped.blocked.map((action) => renderActionCard(action, true))}
          </div>
        </div>
      )}

      {/* Overdue Actions */}
      {grouped.overdue.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-base font-semibold text-[var(--warning-text)]">
            Overdue ({grouped.overdue.length})
          </h3>
          <div className="space-y-3">
            {grouped.overdue.map((action) => renderActionCard(action, true))}
          </div>
        </div>
      )}

      {/* In Progress Actions */}
      {grouped.inProgress.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-base font-semibold">
            In Progress ({grouped.inProgress.length})
          </h3>
          <div className="space-y-3">
            {grouped.inProgress.map((action) => renderActionCard(action))}
          </div>
        </div>
      )}

      {/* Completed Actions */}
      {grouped.completed.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-base font-semibold text-[var(--success-text)]">
            Completed ({grouped.completed.length})
          </h3>
          <div className="space-y-3">
            {grouped.completed.map((action) => renderActionCard(action))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {localActions.length === 0 && (
        <GovernedEmptyState
          reason="no_actions"
          helpText="Actions are automatically generated based on your engagement's recommendations."
        />
      )}
    </div>
  );
}
