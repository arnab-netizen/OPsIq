"use client";

/**
 * /owner/tasks — delegated task list for the workspace owner.
 *
 * Lists all tasks with status/assignee filters. All reads and mutations go through
 * server-authoritative routes; no workspace IDs or actor IDs are supplied from the client.
 */

/* eslint-disable react-hooks/set-state-in-effect -- fetch-on-mount is the intentional pattern */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Badge, Button, EmptyState, TableListSkeleton } from "@/ui/primitives";
import { DelegatedTaskStatus } from "@/domain/execution/delegated-task";
import { classifyOperatorError } from "@/lib/operator-error-governance";

interface TaskListItem {
  id: string;
  title: string;
  status: string;
  priority: string | null;
  assignedUserId: string | null;
  assignedRole: string | null;
  dueAt: string | null;
  createdAt: string;
  proofRequirementId: string | null;
}

const STATUS_VARIANT: Record<string, "success" | "default" | "warning" | "destructive"> = {
  [DelegatedTaskStatus.APPROVED_COMPLETE]: "success",
  [DelegatedTaskStatus.IN_PROGRESS]: "default",
  [DelegatedTaskStatus.PROOF_REQUIRED]: "warning",
  [DelegatedTaskStatus.PROOF_SUBMITTED]: "warning",
  [DelegatedTaskStatus.BLOCKED]: "destructive",
  [DelegatedTaskStatus.ESCALATED]: "destructive",
  [DelegatedTaskStatus.REJECTED_INCOMPLETE]: "destructive",
  [DelegatedTaskStatus.CANCELLED]: "destructive",
  [DelegatedTaskStatus.EXPIRED]: "destructive",
  [DelegatedTaskStatus.DISPUTED]: "warning",
  [DelegatedTaskStatus.COMPLETED_PENDING_REVIEW]: "warning",
};

const STATUS_LABELS: Record<string, string> = {
  [DelegatedTaskStatus.DRAFT]: "Draft",
  [DelegatedTaskStatus.ASSIGNED]: "Assigned",
  [DelegatedTaskStatus.ACKNOWLEDGED]: "Acknowledged",
  [DelegatedTaskStatus.IN_PROGRESS]: "In Progress",
  [DelegatedTaskStatus.BLOCKED]: "Blocked",
  [DelegatedTaskStatus.NEEDS_OWNER_CLARIFICATION]: "Needs Clarification",
  [DelegatedTaskStatus.ESCALATED]: "Escalated",
  [DelegatedTaskStatus.PROOF_REQUIRED]: "Proof Required",
  [DelegatedTaskStatus.PROOF_SUBMITTED]: "Proof Submitted",
  [DelegatedTaskStatus.COMPLETED_PENDING_REVIEW]: "Pending Review",
  [DelegatedTaskStatus.APPROVED_COMPLETE]: "Approved",
  [DelegatedTaskStatus.REJECTED_INCOMPLETE]: "Rejected",
  [DelegatedTaskStatus.CANCELLED]: "Cancelled",
  [DelegatedTaskStatus.EXPIRED]: "Expired",
  [DelegatedTaskStatus.DISPUTED]: "Disputed",
};

/**
 * Plain-language grouping of the 15-state DelegatedTaskStatus model, for the filter dropdown only
 * — the underlying status value, API contract, and per-row Badge/STATUS_LABELS above are untouched.
 * A lay owner sees "To do / In progress / Waiting / Done" as the structure; the detailed state is
 * still there in each group and on every row, one level down, not hidden.
 */
const STATUS_GROUPS: Array<{ label: string; statuses: string[] }> = [
  { label: "To do", statuses: [DelegatedTaskStatus.DRAFT, DelegatedTaskStatus.ASSIGNED, DelegatedTaskStatus.ACKNOWLEDGED] },
  { label: "In progress", statuses: [DelegatedTaskStatus.IN_PROGRESS] },
  {
    label: "Waiting",
    statuses: [
      DelegatedTaskStatus.BLOCKED,
      DelegatedTaskStatus.NEEDS_OWNER_CLARIFICATION,
      DelegatedTaskStatus.ESCALATED,
      DelegatedTaskStatus.PROOF_REQUIRED,
      DelegatedTaskStatus.PROOF_SUBMITTED,
      DelegatedTaskStatus.COMPLETED_PENDING_REVIEW,
      DelegatedTaskStatus.DISPUTED,
    ],
  },
  {
    label: "Done",
    statuses: [
      DelegatedTaskStatus.APPROVED_COMPLETE,
      DelegatedTaskStatus.REJECTED_INCOMPLETE,
      DelegatedTaskStatus.CANCELLED,
      DelegatedTaskStatus.EXPIRED,
    ],
  },
];

async function apiFetch(path: string) {
  const res = await fetch(path, { headers: { "Content-Type": "application/json" } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || data?.error || `Request failed (${res.status})`);
  return data;
}

export default function OwnerTasksPage() {
  const [tasks, setTasks] = useState<TaskListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [offset, setOffset] = useState(0);

  const LIMIT = 25;

  const load = useCallback(async (status: string, off: number) => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ limit: String(LIMIT), offset: String(off) });
      if (status) qs.set("status", status);
      const data = await apiFetch(`/api/owner/tasks?${qs}`);
      setTasks(data.tasks ?? []);
    } catch (err) {
      setError(classifyOperatorError(err, { context: "load" }).operatorMessage);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(statusFilter, offset);
  }, [load, statusFilter, offset]);

  function handleStatusChange(e: React.ChangeEvent<HTMLSelectElement>) {
    setOffset(0);
    setStatusFilter(e.target.value);
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display text-[1.75rem] font-semibold tracking-tight">Actions</h1>
        <Link href="/owner/tasks/new">
          <Button size="sm">+ New Task</Button>
        </Link>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-6">
        <select
          aria-label="Filter tasks by status"
          value={statusFilter}
          onChange={handleStatusChange}
          className="rounded border border-border bg-background px-3 py-1.5 text-sm"
        >
          <option value="">All statuses</option>
          {STATUS_GROUPS.map((group) => (
            <optgroup key={group.label} label={group.label}>
              {group.statuses.map((s) => (
                <option key={s} value={s}>{STATUS_LABELS[s] ?? s}</option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      {/* Task list */}
      {loading && <TableListSkeleton label="Loading" rows={4} />}
      {error ? <p className="text-destructive text-sm">{error}</p> : null}

      {!loading && !error && tasks.length === 0 && (
        statusFilter ? (
          <EmptyState
            title="No tasks match this filter"
            description={`No delegated tasks have status "${STATUS_LABELS[statusFilter as keyof typeof STATUS_LABELS] ?? statusFilter}".`}
            primaryAction={{ label: "Clear filter", onClick: () => setStatusFilter("") }}
          />
        ) : (
          <EmptyState
            title="No tasks delegated yet"
            description="Delegate a task to hand off work with a clear owner, deadline, and expected proof."
            primaryAction={{ label: "+ New Task", href: "/owner/tasks/new" }}
          />
        )
      )}

      {!loading && !error && tasks.length > 0 && (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Title</th>
                <th className="px-4 py-2 text-left font-medium">Status</th>
                <th className="px-4 py-2 text-left font-medium">Assigned to</th>
                <th className="px-4 py-2 text-left font-medium">Due</th>
                <th className="px-4 py-2 text-left font-medium">Proof</th>
                <th className="px-4 py-2 text-left font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {tasks.map((task) => (
                <tr key={task.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-medium">{task.title}</td>
                  <td className="px-4 py-3">
                    <Badge variant={STATUS_VARIANT[task.status] ?? "default"}>
                      {STATUS_LABELS[task.status] ?? task.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {task.assignedRole ?? task.assignedUserId ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {task.dueAt ? new Date(task.dueAt).toLocaleDateString() : "—"}
                  </td>
                  <td className="px-4 py-3">
                    {task.proofRequirementId ? (
                      <Badge variant="default">Required</Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/owner/tasks/${task.id}`} className="text-[var(--primary-text)] hover:underline text-sm">
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {!loading && !error && (
        <div className="flex gap-3 mt-4">
          {offset > 0 && (
            <Button variant="outline" size="sm" onClick={() => setOffset(Math.max(0, offset - LIMIT))}>
              Previous
            </Button>
          )}
          {tasks.length === LIMIT && (
            <Button variant="outline" size="sm" onClick={() => setOffset(offset + LIMIT)}>
              Next
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
