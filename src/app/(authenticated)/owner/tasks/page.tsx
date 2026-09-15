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
import { useActiveBusiness } from "@/context/active-business-context";

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

/** An owner-started governed action (ProcessExecutionTask) -- e.g. one begun with "Start Work" on
 *  Home. Distinct from a DelegatedTask (work explicitly handed off to a named person/role): this is
 *  work the owner is doing themselves, or a governed correction/data/approval item, that must show
 *  up here once started so Home, Priorities, and Actions never disagree about whether it exists. */
interface OwnerWorkItem {
  id: string;
  taskKey: string;
  businessId: string | null;
  ownerVisibleSummary: string;
  status: string;
  severity: string;
  executionRoute: string;
  workStartedAt: string | null;
}

const OWNER_WORK_STATUS_LABELS: Record<string, string> = {
  PROPOSED: "Proposed",
  ACKNOWLEDGED: "Acknowledged",
  IN_PROGRESS: "In progress",
  BLOCKED: "Blocked",
  NEEDS_DATA: "Needs data",
  APPROVED: "Approved",
  DELEGATED: "Delegated",
  COMPLETED: "Completed",
  REJECTED: "Rejected",
  OUTCOME_RECORDED: "Outcome recorded",
  OUTCOME_DISPUTED: "Outcome disputed",
  OUTCOME_VERIFIED: "Outcome verified",
};
const OWNER_WORK_TERMINAL = new Set(["REJECTED"]);

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
// Presentation-only: "-accessible" variants keep the exact same status ->
// color mapping as before, only the badge text color changes to the
// AA-contrast-checked token for that same tinted fill (see badge.tsx's own
// PR #385 readable-text fix comment).
const GROUP_VARIANT: Record<string, "success-accessible" | "default-accessible" | "warning-accessible" | "destructive-accessible"> = {
  "To do": "default-accessible",
  "In progress": "default-accessible",
  Waiting: "warning-accessible",
  Done: "success-accessible",
};

async function apiFetch(path: string) {
  const res = await fetch(path, { headers: { "Content-Type": "application/json" } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || data?.error || `Request failed (${res.status})`);
  return data;
}

export default function OwnerTasksPage() {
  const { activeBusinessId } = useActiveBusiness();
  const [tasks, setTasks] = useState<TaskListItem[]>([]);
  const [ownerWork, setOwnerWork] = useState<OwnerWorkItem[]>([]);
  const [ownerWorkError, setOwnerWorkError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [offset, setOffset] = useState(0);

  const LIMIT = 25;

  // My work: owner-started governed actions (ProcessExecutionTask), independent of the delegated-
  // task filters/pagination below -- loaded once per active business, not re-fetched on every
  // status-filter/offset change since it has no filter/pagination controls of its own.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setOwnerWorkError(null);
      try {
        const data = await apiFetch("/api/owner/process-execution");
        if (cancelled) return;
        const rows = (data.tasks ?? []) as OwnerWorkItem[];
        // Business-scoped: an item belongs here if it's this business's own (businessId matches)
        // or is an explicit workspace-level item (businessId null) -- never another business's.
        // Excludes PROPOSED (not yet started -- Priorities/Home is where the owner starts it) and
        // MONITOR_ONLY (no interactive action to show).
        const relevant = rows.filter((t) =>
          (t.businessId === null || t.businessId === activeBusinessId) &&
          t.status !== "PROPOSED" &&
          t.executionRoute !== "MONITOR_ONLY"
        );
        setOwnerWork(relevant);
      } catch (err) {
        if (!cancelled) setOwnerWorkError(classifyOperatorError(err, { context: "load" }).operatorMessage);
      }
    })();
    return () => { cancelled = true; };
  }, [activeBusinessId]);

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
      <div className="flex flex-wrap items-center justify-between gap-2 mb-6">
        <h1 className="font-display text-[1.75rem] font-semibold tracking-tight">Actions</h1>
        <Link href="/owner/tasks/new">
          <Button size="sm">+ New Task</Button>
        </Link>
      </div>

      {/* My work: governed actions the owner started themselves (e.g. via Start Work on Home) --
          distinct from delegated work below, which is handed off to a named person/role. */}
      {ownerWorkError ? <p className="text-destructive text-sm mb-4">{ownerWorkError}</p> : null}
      {ownerWork.length > 0 && (
        <div className="mb-8">
          <h2 className="font-display text-base font-semibold tracking-tight text-foreground mb-3">My work</h2>
          <ul className="flex flex-col">
            {ownerWork.map((item) => {
              const isTerminal = OWNER_WORK_TERMINAL.has(item.status);
              return (
                <li key={item.id} className="border-t border-border py-4 first:border-t-0 first:pt-0">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <Link href="/owner/cockpit" className="font-display text-[1.05rem] font-semibold text-foreground hover:underline">
                      {item.ownerVisibleSummary}
                    </Link>
                    <Badge variant={isTerminal ? "destructive-accessible" : item.status === "COMPLETED" || item.status.startsWith("OUTCOME") ? "success-accessible" : "default-accessible"}>
                      {OWNER_WORK_STATUS_LABELS[item.status] ?? item.status}
                    </Badge>
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                    <span>Who: You</span>
                    {item.workStartedAt && <span>Started: {new Date(item.workStartedAt).toLocaleDateString()}</span>}
                  </div>
                  <Link href="/owner/cockpit" className="mt-1.5 inline-block text-sm font-medium text-[var(--primary-text)] underline-offset-2 hover:underline">
                    Continue on Home →
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <h2 className="font-display text-base font-semibold tracking-tight text-foreground mb-3">Delegated work</h2>

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

      {/* A short list (the common case for a real, non-fixture business) otherwise trails into a
          mostly-empty page below -- the same "arbitrary empty whitespace" issue found and fixed
          on Priorities during a formal cross-screen audit, and fixed the same way here: a closing
          line so the page reads as complete rather than unfinished. Only shown on an unfiltered,
          unpaginated short list -- a filtered view already explains itself, and a full page of
          results already has pagination controls doing that job. */}
      {!loading && !error && tasks.length > 0 && tasks.length < LIMIT && !statusFilter && offset === 0 && (
        <p className="border-t border-border pt-4 text-sm text-muted-foreground">
          That{"'"}s every task currently delegated. New tasks you create, or ones OpsIQ proposes, will appear here.
        </p>
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
