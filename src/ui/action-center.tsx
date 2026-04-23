"use client";

import { useState } from "react";
import { Badge } from "@/ui/primitives";

interface Action {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueDate?: string;
  version: number;
}

interface ActionCenterProps {
  actions: Action[];
  engagementId: string;
  onActionUpdated?: () => void;
}

const STATUS_TRANSITIONS: Record<string, string[]> = {
  draft: ["assigned", "cancelled"],
  assigned: ["in_progress", "blocked", "cancelled"],
  in_progress: ["blocked", "completed", "assigned"],
  blocked: ["assigned", "cancelled"],
  completed: [],
  verified: [],
  cancelled: [],
};

export function ActionCenter({
  actions,
  engagementId,
  onActionUpdated,
}: ActionCenterProps) {
  const [updating, setUpdating] = useState<string | null>(null);
  const [localActions, setLocalActions] = useState(actions);

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

  const isOverdue = (dueDate?: string) => {
    if (!dueDate) return false;
    return new Date(dueDate) < new Date();
  };

  const handleStatusUpdate = async (
    actionId: string,
    newStatus: string,
    version: number
  ) => {
    setUpdating(actionId);
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/actions/${actionId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: newStatus, version }),
        }
      );

      if (res.ok) {
        const updated = await res.json();
        setLocalActions(
          localActions.map((a) =>
            a.id === actionId
              ? {
                  ...a,
                  status: updated.data.status || newStatus,
                  version: updated.meta.version,
                }
              : a
          )
        );
        onActionUpdated?.();
      }
    } catch (err) {
      console.error("Failed to update action:", err);
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
        isOverdue(a.dueDate)
    ),
    open: localActions.filter(
      (a) =>
        (a.status === "assigned" || a.status === "in_progress") &&
        !isOverdue(a.dueDate)
    ),
  };

  return (
    <div className="space-y-6">
      {grouped.blocked.length > 0 && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-6">
          <h3 className="text-base font-semibold text-destructive">
            Blocked ({grouped.blocked.length})
          </h3>
          <div className="mt-3 space-y-2">
            {grouped.blocked.map((action) => (
              <div
                key={action.id}
                className="rounded-md border border-destructive/50 bg-background p-3 text-sm"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="font-medium text-foreground">
                      {action.title}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {action.priority} priority
                    </p>
                  </div>
                  <Badge variant="destructive">Blocked</Badge>
                </div>
                {STATUS_TRANSITIONS[action.status]?.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {STATUS_TRANSITIONS[action.status].map((s) => (
                      <button
                        key={s}
                        disabled={updating === action.id}
                        onClick={() =>
                          handleStatusUpdate(action.id, s, action.version)
                        }
                        className="text-xs px-2 py-1 rounded border border-border hover:bg-muted disabled:opacity-50"
                      >
                        → {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {grouped.overdue.length > 0 && (
        <div className="rounded-lg border border-warning/50 bg-warning/5 p-6">
          <h3 className="text-base font-semibold text-warning">
            Overdue ({grouped.overdue.length})
          </h3>
          <div className="mt-3 space-y-2">
            {grouped.overdue.map((action) => (
              <div
                key={action.id}
                className="rounded-md border border-warning/50 bg-background p-3 text-sm"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="font-medium text-foreground">
                      {action.title}
                    </p>
                    <p className="mt-1 text-xs text-warning">
                      {action.dueDate &&
                        `Due: ${new Date(action.dueDate).toLocaleDateString()}`}
                    </p>
                  </div>
                  <Badge variant="warning">Overdue</Badge>
                </div>
                {STATUS_TRANSITIONS[action.status]?.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {STATUS_TRANSITIONS[action.status].map((s) => (
                      <button
                        key={s}
                        disabled={updating === action.id}
                        onClick={() =>
                          handleStatusUpdate(action.id, s, action.version)
                        }
                        className="text-xs px-2 py-1 rounded border border-border hover:bg-muted disabled:opacity-50"
                      >
                        → {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-lg border border-border p-6">
        <h3 className="text-base font-semibold text-foreground">
          Open Actions ({grouped.open.length})
        </h3>
        {grouped.open.length > 0 ? (
          <div className="mt-3 space-y-2">
            {grouped.open.map((action) => (
              <div
                key={action.id}
                className="rounded-md border border-border p-3 text-sm hover:bg-muted/50"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="font-medium text-foreground">
                      {action.title}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {action.dueDate &&
                        `Due: ${new Date(action.dueDate).toLocaleDateString()}`}
                    </p>
                  </div>
                  <Badge variant={getPriorityVariant(action.priority)}>
                    {action.priority}
                  </Badge>
                </div>
                {STATUS_TRANSITIONS[action.status]?.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {STATUS_TRANSITIONS[action.status].map((s) => (
                      <button
                        key={s}
                        disabled={updating === action.id}
                        onClick={() =>
                          handleStatusUpdate(action.id, s, action.version)
                        }
                        className="text-xs px-2 py-1 rounded border border-border hover:bg-muted disabled:opacity-50"
                      >
                        → {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            No open actions.
          </p>
        )}
      </div>
    </div>
  );
}
