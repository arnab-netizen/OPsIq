"use client";

/**
 * /owner/tasks/[taskId] — task detail page with proof state and owner CTAs.
 *
 * All mutations go through server-authoritative routes (status/proof routes).
 * No workspace IDs or actor IDs are supplied from the client.
 */

/* eslint-disable react-hooks/set-state-in-effect -- fetch-on-mount is the intentional pattern */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Badge, Button, DetailPageSkeleton, PageHeader, PageContainer } from "@/ui/primitives";
import { DelegatedTaskStatus, TaskActorRole } from "@/domain/execution/delegated-task";
import { ProofStatus, ProofType, ProofRiskLevel } from "@/domain/execution/proof";
import { PROOF_TYPE_LABEL } from "@/lib/owner-proof-type-labels";
import { classifyOperatorError } from "@/lib/operator-error-governance";
import { httpResponseErrorFromBody } from "@/lib/operator-safe-errors";

interface ProofDetail {
  id: string;
  status: string;
  proofType: string | null;
  submittedByUserId: string | null;
  submittedAt: string | null;
  reviewedByUserId: string | null;
  reviewedAt: string | null;
  reviewReason: string | null;
  duplicateFlagged: boolean;
}

interface TaskDetail {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string | null;
  assignedUserId: string | null;
  assignedRole: string | null;
  dueAt: string | null;
  workStartedAt: string | null;
  createdAt: string;
  proofRequirementId: string | null;
  sourceOperatorItemId: string | null;
  proof: ProofDetail | null;
  proofRequirement: {
    id: string;
    proofType: string;
    riskLevel: string | null;
    reviewerRole: string | null;
    ownerOverrideAllowed: boolean;
  } | null;
  statusHistory: Array<{
    id: string;
    fromStatus: string | null;
    toStatus: string;
    actorId: string | null;
    actorRole: string | null;
    occurredAt: string;
  }>;
}

// Presentation-only: "-accessible" variants keep the exact same status ->
// color mapping as before, only the badge text color changes to the
// AA-contrast-checked token for that same tinted fill (see badge.tsx's own
// PR #385 readable-text fix comment).
const STATUS_VARIANT: Record<string, "success-accessible" | "default-accessible" | "warning-accessible" | "destructive-accessible"> = {
  [DelegatedTaskStatus.APPROVED_COMPLETE]: "success-accessible",
  [DelegatedTaskStatus.IN_PROGRESS]: "default-accessible",
  [DelegatedTaskStatus.PROOF_REQUIRED]: "warning-accessible",
  [DelegatedTaskStatus.PROOF_SUBMITTED]: "warning-accessible",
  [DelegatedTaskStatus.BLOCKED]: "destructive-accessible",
  [DelegatedTaskStatus.ESCALATED]: "destructive-accessible",
  [DelegatedTaskStatus.REJECTED_INCOMPLETE]: "destructive-accessible",
  [DelegatedTaskStatus.CANCELLED]: "destructive-accessible",
  [DelegatedTaskStatus.EXPIRED]: "destructive-accessible",
  [DelegatedTaskStatus.DISPUTED]: "warning-accessible",
  [DelegatedTaskStatus.COMPLETED_PENDING_REVIEW]: "warning-accessible",
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

const PROOF_STATUS_LABELS: Record<string, string> = {
  [ProofStatus.NOT_REQUIRED]: "Not Required",
  [ProofStatus.REQUIRED]: "Required",
  [ProofStatus.PENDING_SUBMISSION]: "Pending Submission",
  [ProofStatus.SUBMITTED]: "Submitted",
  [ProofStatus.AI_PRECHECK_PASSED]: "Automatically checked — passed",
  [ProofStatus.AI_PRECHECK_FAILED]: "Automatically checked — needs review",
  [ProofStatus.NEEDS_HUMAN_REVIEW]: "Needs Human Review",
  [ProofStatus.ACCEPTED]: "Accepted",
  [ProofStatus.REJECTED]: "Rejected",
  [ProofStatus.RESUBMISSION_REQUIRED]: "Resubmission Required",
  [ProofStatus.DISPUTED]: "Disputed",
  [ProofStatus.OVERRIDDEN_NOT_VERIFIED]: "Override (Not Verified)",
};

const RISK_LEVEL_LABEL: Record<string, string> = {
  [ProofRiskLevel.LOW]: "Low",
  [ProofRiskLevel.MEDIUM]: "Medium",
  [ProofRiskLevel.HIGH]: "High",
};

// UX-05B Candidate 8: humanize the authoritative TaskActorRole enum instead of rendering it
// verbatim in status history (was e.g. raw "EMPLOYEE"/"MANAGER"/"OWNER"/"SYSTEM").
const ACTOR_ROLE_LABEL: Record<string, string> = {
  [TaskActorRole.EMPLOYEE]: "Employee",
  [TaskActorRole.MANAGER]: "Manager",
  [TaskActorRole.OWNER]: "Owner",
  [TaskActorRole.SYSTEM]: "System",
};

// UX-06A1 hostile-audit remediation: "Assigned to:" previously rendered raw
// assignedRole ("MANAGER", "STAFF") verbatim. Kept as its own narrowly-scoped map
// (not merged with ACTOR_ROLE_LABEL above) -- assignedRole and TaskActorRole are
// distinct concepts (who a task is delegated to vs. who acted in its status
// history) and are not collapsed into one lookup table.
const ASSIGNED_ROLE_LABEL: Record<string, string> = {
  MANAGER: "Manager",
  STAFF: "Staff",
  EMPLOYEE: "Employee",
  OWNER: "Owner",
};

// UX-06 Wave A2 (Section T.2): frozen mapping from completeTask()'s known 409
// blocked reasons to plain owner language. Raw reason codes must never render;
// any reason not in this map falls through to the existing governed error path.
const BLOCKED_REASON_LABEL: Record<string, string> = {
  proof_not_accepted: "The proof still needs to be accepted before this task can be approved.",
  duplicate_proof: "This proof was flagged as a duplicate. Review it or ask for new proof before approving the task.",
  proof_stale: "The accepted proof is too old to use for approval. Ask for updated proof.",
  separation_of_duty: "The person who completed this work cannot approve it. Another authorised reviewer needs to approve the task.",
  transition_denied: "This task cannot be approved from its current state. Refresh the task and review its latest status.",
};

async function apiFetch(path: string) {
  const res = await fetch(path, { headers: { "Content-Type": "application/json" } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || data?.error || `Request failed (${res.status})`);
  return data;
}

async function apiPost(path: string, body: unknown) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || data?.error || `Request failed (${res.status})`);
  return data;
}

async function apiPatch(path: string, body: unknown) {
  const res = await fetch(path, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || data?.error || `Request failed (${res.status})`);
  return data;
}

export default function TaskDetailPage() {
  const { taskId } = useParams<{ taskId: string }>();
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // UX-06 Wave A2: React state alone does not synchronously protect two rapid
  // click-handler invocations within the same tick, so this ref -- local to the
  // approval action only, not a general concurrency framework -- guards against
  // a duplicate POST /api/owner/tasks/complete from a double click.
  const approveInFlightRef = useRef(false);

  // Proof submit form state
  const [submitProofType, setSubmitProofType] = useState<string>("");
  const [submitNote, setSubmitNote] = useState("");

  // Proof review form state
  const [reviewTo, setReviewTo] = useState<string>("");
  const [reviewReason, setReviewReason] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch(`/api/owner/tasks/${taskId}`);
      setTask(data.task ?? null);
    } catch (err) {
      setError(classifyOperatorError(err, { context: "load" }).operatorMessage);
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => { load(); }, [load]);

  async function handleTransition(to: DelegatedTaskStatus) {
    setActionLoading(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      await apiPatch(`/api/owner/tasks/${taskId}/status`, { to });
      setActionSuccess(`Status updated to ${STATUS_LABELS[to] ?? to}.`);
      await load();
    } catch (err) {
      setActionError(classifyOperatorError(err, { context: "action" }).operatorMessage);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleSubmitProof(e: React.FormEvent) {
    e.preventDefault();
    if (!submitProofType) return;
    setActionLoading(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      await apiPost(`/api/owner/tasks/${taskId}/proof/submit`, {
        proofType: submitProofType,
        fields: { note: submitNote },
      });
      setActionSuccess("Proof submitted.");
      setSubmitNote("");
      setSubmitProofType("");
      await load();
    } catch (err) {
      setActionError(classifyOperatorError(err, { context: "action" }).operatorMessage);
    } finally {
      setActionLoading(false);
    }
  }

  // UX-06 Wave A2 (Section T.2, Candidate 9): same-page final approval. Calls
  // the existing, unchanged POST /api/owner/tasks/complete with only { taskId }
  // -- never ownerOverride/maxProofAgeDays -- and never optimistically marks
  // the task approved; the final status always comes from the reload below.
  async function handleApproveTask() {
    if (approveInFlightRef.current) return;
    approveInFlightRef.current = true;
    setActionLoading(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      const res = await fetch("/api/owner/tasks/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 409 && data && (data as { blocked?: unknown }).blocked === true) {
        const reason = (data as { reason?: unknown }).reason;
        const mapped = typeof reason === "string" ? BLOCKED_REASON_LABEL[reason] : undefined;
        setActionError(
          mapped ??
            classifyOperatorError(httpResponseErrorFromBody(res.status, data), { context: "action" }).operatorMessage
        );
        return;
      }
      if (!res.ok) {
        throw httpResponseErrorFromBody(res.status, data);
      }
      setActionSuccess("Task approved.");
      await load();
    } catch (err) {
      setActionError(classifyOperatorError(err, { context: "action" }).operatorMessage);
    } finally {
      setActionLoading(false);
      approveInFlightRef.current = false;
    }
  }

  async function handleReviewProof(e: React.FormEvent) {
    e.preventDefault();
    if (!reviewTo) return;
    setActionLoading(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      await apiPost(`/api/owner/tasks/${taskId}/proof/review`, {
        to: reviewTo,
        reason: reviewReason || undefined,
      });
      setActionSuccess(`Proof review outcome: ${PROOF_STATUS_LABELS[reviewTo] ?? reviewTo}.`);
      setReviewTo("");
      setReviewReason("");
      await load();
    } catch (err) {
      setActionError(classifyOperatorError(err, { context: "action" }).operatorMessage);
    } finally {
      setActionLoading(false);
    }
  }

  if (loading) return <DetailPageSkeleton label="Loading" />;
  if (error) return <PageContainer><p className="text-destructive text-sm">{error}</p></PageContainer>;
  if (!task) return <PageContainer><p className="text-muted-foreground text-sm">Task not found.</p></PageContainer>;

  const isTerminal = [
    DelegatedTaskStatus.APPROVED_COMPLETE,
    DelegatedTaskStatus.CANCELLED,
    DelegatedTaskStatus.EXPIRED,
  ].includes(task.status as DelegatedTaskStatus);

  const canSubmitProof = task.proofRequirementId &&
    [DelegatedTaskStatus.PROOF_REQUIRED].includes(task.status as DelegatedTaskStatus);

  const canReviewProof = task.proof &&
    [ProofStatus.SUBMITTED, ProofStatus.NEEDS_HUMAN_REVIEW, ProofStatus.AI_PRECHECK_PASSED, ProofStatus.AI_PRECHECK_FAILED].includes(task.proof.status as ProofStatus);

  return (
    <PageContainer narrow className="space-y-6">
      {/* Header */}
      <div>
        <Link href="/owner/tasks" className="text-sm text-muted-foreground hover:underline mb-2 block">
          ← Tasks
        </Link>
        <PageHeader
          title={task.title}
          actions={
            <Badge variant={STATUS_VARIANT[task.status] ?? "default-accessible"}>
              {STATUS_LABELS[task.status] ?? task.status}
            </Badge>
          }
        />
      </div>

      {/* Feedback */}
      {actionSuccess && <p className="text-sm text-green-700 dark:text-green-400">{actionSuccess}</p>}
      {actionError && <p className="text-sm text-destructive">{actionError}</p>}

      {/* Task info */}
      <div className="rounded-lg border border-border p-4 space-y-3 text-sm">
        {task.description && <p className="text-muted-foreground">{task.description}</p>}
        <div className="grid grid-cols-2 gap-2">
          {/* UX-05B Candidate 7: never show a raw user id -- mirrors the list page's own fix
              (owner/tasks/page.tsx) for the identical leak: role, or a fixed "Assigned" string,
              or "—" when neither is set (matching this page's own convention for other missing
              fields, e.g. Priority/Due/Work started below). */}
          <div><span className="text-muted-foreground">Assigned to:</span> <span>{task.assignedRole ? (ASSIGNED_ROLE_LABEL[task.assignedRole] ?? "Assigned") : (task.assignedUserId ? "Assigned" : "—")}</span></div>
          <div><span className="text-muted-foreground">Priority:</span> <span>{task.priority ?? "—"}</span></div>
          <div><span className="text-muted-foreground">Due:</span> <span>{task.dueAt ? new Date(task.dueAt).toLocaleDateString() : "—"}</span></div>
          <div><span className="text-muted-foreground">Work started:</span> <span>{task.workStartedAt ? new Date(task.workStartedAt).toLocaleString() : "—"}</span></div>
          {task.sourceOperatorItemId && (
            <div className="col-span-2">
              <span className="text-muted-foreground">Source recommendation:</span>{" "}
              <span className="font-mono text-xs">{task.sourceOperatorItemId}</span>
            </div>
          )}
        </div>
      </div>

      {/* Proof panel */}
      {task.proofRequirementId && (
        <div className="rounded-lg border border-border p-4 space-y-3 text-sm">
          <h2 className="font-medium">Proof</h2>
          {task.proofRequirement && (
            <div className="text-muted-foreground">
              Type: <span className="text-foreground">{PROOF_TYPE_LABEL[task.proofRequirement.proofType] ?? task.proofRequirement.proofType}</span>
              {task.proofRequirement.riskLevel && <> · Risk: <span className="text-foreground">{RISK_LEVEL_LABEL[task.proofRequirement.riskLevel] ?? task.proofRequirement.riskLevel}</span></>}
            </div>
          )}
          {task.proof ? (
            <div className="space-y-1">
              <div>
                Status: <Badge variant={task.proof.status === ProofStatus.ACCEPTED ? "success-accessible" : task.proof.duplicateFlagged ? "destructive-accessible" : "default-accessible"}>
                  {PROOF_STATUS_LABELS[task.proof.status] ?? task.proof.status}
                </Badge>
                {task.proof.duplicateFlagged && <span className="ml-2 text-destructive text-xs font-medium">DUPLICATE</span>}
              </div>
              {task.proof.submittedAt && <div className="text-muted-foreground">Submitted: {new Date(task.proof.submittedAt).toLocaleString()}</div>}
              {task.proof.reviewedAt && <div className="text-muted-foreground">Reviewed: {new Date(task.proof.reviewedAt).toLocaleString()}</div>}
              {task.proof.reviewReason && <div className="text-muted-foreground">Reason: {task.proof.reviewReason}</div>}
            </div>
          ) : (
            <p className="text-muted-foreground">No proof submitted yet.</p>
          )}

          {/* Submit proof form */}
          {canSubmitProof && (
            <form onSubmit={handleSubmitProof} className="space-y-2 pt-2 border-t border-border">
              <h3 className="font-medium text-sm">Submit proof</h3>
              {/* UX-06 Wave B1 (Section K, N): these fields were previously placeholder-only with
                  no persistent <label>, an accessibility/labeling gap. Payload/handler unchanged. */}
              <label htmlFor="submit-proof-type" className="text-sm font-medium text-foreground block">
                Proof type
              </label>
              <select
                id="submit-proof-type"
                value={submitProofType}
                onChange={(e) => setSubmitProofType(e.target.value)}
                className="rounded border border-border bg-background px-3 py-1.5 text-sm w-full"
                required
              >
                <option value="">Select proof type…</option>
                {Object.values(ProofType).map((t) => (
                  <option key={t} value={t}>{PROOF_TYPE_LABEL[t] ?? t}</option>
                ))}
              </select>
              <label htmlFor="submit-proof-note" className="text-sm font-medium text-foreground block">
                Note
              </label>
              <input
                id="submit-proof-note"
                type="text"
                placeholder="Note (required)"
                value={submitNote}
                onChange={(e) => setSubmitNote(e.target.value)}
                className="rounded border border-border bg-background px-3 py-1.5 text-sm w-full"
                required
              />
              <Button type="submit" size="sm" disabled={actionLoading}>
                {actionLoading ? "Submitting…" : "Submit Proof"}
              </Button>
            </form>
          )}

          {/* Review proof form */}
          {canReviewProof && (
            <form onSubmit={handleReviewProof} className="space-y-2 pt-2 border-t border-border">
              <h3 className="font-medium text-sm">Review proof</h3>
              {/* UX-06 Wave B1 (Section K, N): persistent labels replacing placeholder-only
                  fields. Payload/handler unchanged. */}
              <label htmlFor="review-proof-outcome" className="text-sm font-medium text-foreground block">
                Outcome
              </label>
              <select
                id="review-proof-outcome"
                value={reviewTo}
                onChange={(e) => setReviewTo(e.target.value)}
                className="rounded border border-border bg-background px-3 py-1.5 text-sm w-full"
                required
              >
                <option value="">Select outcome…</option>
                <option value={ProofStatus.ACCEPTED}>Accept</option>
                <option value={ProofStatus.REJECTED}>Reject</option>
                <option value={ProofStatus.RESUBMISSION_REQUIRED}>Request Resubmission</option>
                <option value={ProofStatus.NEEDS_HUMAN_REVIEW}>Route to Human Review</option>
                <option value={ProofStatus.DISPUTED}>Dispute</option>
              </select>
              {reviewTo === ProofStatus.REJECTED && (
                <>
                  <label htmlFor="review-proof-reason" className="text-sm font-medium text-foreground block">
                    Rejection reason
                  </label>
                  <input
                    id="review-proof-reason"
                    type="text"
                    placeholder="Rejection reason (required)"
                    value={reviewReason}
                    onChange={(e) => setReviewReason(e.target.value)}
                    className="rounded border border-border bg-background px-3 py-1.5 text-sm w-full"
                    required
                  />
                </>
              )}
              <Button type="submit" size="sm" disabled={actionLoading}>
                {actionLoading ? "Reviewing…" : "Submit Review"}
              </Button>
            </form>
          )}
        </div>
      )}

      {/* Owner status transition CTAs */}
      {!isTerminal && (
        <div className="rounded-lg border border-border p-4 space-y-3 text-sm">
          <h2 className="font-medium">Owner actions</h2>

          {/* UX-06 Wave A2 (Section T.2, Candidate 9): same-page final approval,
              replacing the previous dead Review & Approve link to a nonexistent
              /complete route. The Proof panel above already shows everything
              needed to decide -- no second proof-review step is added here. */}
          {task.status === DelegatedTaskStatus.COMPLETED_PENDING_REVIEW && (
            <div className="space-y-2 pb-3 border-b border-border">
              <h3 className="font-medium">Ready for approval</h3>
              <p className="text-muted-foreground">
                {task.proofRequirementId
                  ? "The work has been completed. Review the details and any proof above, then approve it to mark this task as complete."
                  : "The work has been completed. Review the details above, then approve it to mark this task as complete."}
              </p>
              <Button size="sm" disabled={actionLoading} onClick={handleApproveTask}>
                {actionLoading ? "Approving…" : "Approve task"}
              </Button>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {task.status !== DelegatedTaskStatus.IN_PROGRESS && [
              DelegatedTaskStatus.ASSIGNED,
              DelegatedTaskStatus.ACKNOWLEDGED,
              DelegatedTaskStatus.BLOCKED,
              DelegatedTaskStatus.NEEDS_OWNER_CLARIFICATION,
            ].includes(task.status as DelegatedTaskStatus) && (
              <Button size="sm" variant="outline" disabled={actionLoading}
                onClick={() => handleTransition(DelegatedTaskStatus.IN_PROGRESS)}>
                Mark In Progress
              </Button>
            )}
            {task.status === DelegatedTaskStatus.IN_PROGRESS && (
              <Button size="sm" variant="outline" disabled={actionLoading}
                onClick={() => handleTransition(DelegatedTaskStatus.PROOF_REQUIRED)}>
                Require Proof
              </Button>
            )}
            {![DelegatedTaskStatus.CANCELLED].includes(task.status as DelegatedTaskStatus) && (
              <Button size="sm" variant="outline" disabled={actionLoading}
                onClick={() => handleTransition(DelegatedTaskStatus.CANCELLED)}>
                Cancel Task
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Status history */}
      {task.statusHistory.length > 0 && (
        <div className="rounded-lg border border-border p-4 space-y-2 text-sm">
          <h2 className="font-medium">Status history</h2>
          <ol className="space-y-1">
            {task.statusHistory.map((h) => (
              <li key={h.id} className="flex gap-2 text-muted-foreground">
                <span className="text-foreground">{STATUS_LABELS[h.toStatus] ?? h.toStatus}</span>
                {h.fromStatus && <span>← {STATUS_LABELS[h.fromStatus] ?? h.fromStatus}</span>}
                <span>·</span>
                <span>{new Date(h.occurredAt).toLocaleString()}</span>
                {h.actorRole && <span>({ACTOR_ROLE_LABEL[h.actorRole] ?? h.actorRole})</span>}
              </li>
            ))}
          </ol>
        </div>
      )}
    </PageContainer>
  );
}
