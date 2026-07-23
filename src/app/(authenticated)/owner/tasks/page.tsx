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
import { Badge, Button } from "@/ui/primitives";
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

const ALL_STATUSES = Object.values(DelegatedTaskStatus);

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
        <h1 className="text-2xl font-semibold">Delegated Tasks</h1>
        <Link href="/owner/tasks/new">
          <Button size="sm">+ New Task</Button>
        </Link>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-6">
        <select
          value={statusFilter}
          onChange={handleStatusChange}
          className="rounded border border-border bg-background px-3 py-1.5 text-sm"
        >
          <option value="">All statuses</option>
          {ALL_STATUSES.map((s) => (
            <option key={s} value={s}>{STATUS_LABELS[s] ?? s}</option>
          ))}
        </select>
      </div>

      {/* Task list */}
      {loading && <p className="text-muted-foreground text-sm">Loading…</p>}
      {error ? <p className="text-destructive text-sm">{error}</p> : null}

      {!loading && !error && tasks.length === 0 && (
        <p className="text-muted-foreground text-sm">No tasks found.</p>
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
                    <Link href={`/owner/tasks/${task.id}`} className="text-primary hover:underline text-sm">
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
