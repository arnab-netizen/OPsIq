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

/** Reverse lookup: raw 15-state status → the one owner-visible bucket it belongs to. */
const GROUP_FOR_STATUS: Record<string, string> = Object.fromEntries(
  STATUS_GROUPS.flatMap((g) => g.statuses.map((s) => [s, g.label]))
);
const GROUP_VARIANT: Record<string, "success" | "default" | "warning" | "destructive"> = {
  "To do": "default",
  "In progress": "default",
  Waiting: "warning",
  Done: "success",
};

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
        <ul className="flex flex-col">
          {tasks.map((task) => {
            const group = GROUP_FOR_STATUS[task.status] ?? "To do";
            // Never show a raw user id -- the list API returns assignedUserId but no resolved
            // display name, so "who owns it" falls back to the role (if set) or a plain "Assigned"
            // rather than leaking the UUID, which is the previous fallback here.
            const who = task.assignedRole ?? (task.assignedUserId ? "Assigned" : "Not yet assigned");
            return (
              <li key={task.id} className="border-t border-border py-4 first:border-t-0 first:pt-0">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <Link href={`/owner/tasks/${task.id}`} className="font-display text-[1.05rem] font-semibold text-foreground hover:underline">
                    {task.title}
                  </Link>
                  <Badge variant={GROUP_VARIANT[group]}>{group}</Badge>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                  <span>Who: {who}</span>
                  <span>When: {task.dueAt ? new Date(task.dueAt).toLocaleDateString() : "No due date set"}</span>
                  {task.proofRequirementId && <span>Proof required before this can close</span>}
                </div>
                <Link href={`/owner/tasks/${task.id}`} className="mt-1.5 inline-block text-sm font-medium text-[var(--primary-text)] underline-offset-2 hover:underline">
                  What happens next →
                </Link>
              </li>
            );
          })}
        </ul>
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
