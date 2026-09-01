"use client";

/**
 * /owner/tasks/[taskId] — task detail page with proof state and owner CTAs.
 *
 * All mutations go through server-authoritative routes (status/proof routes).
 * No workspace IDs or actor IDs are supplied from the client.
 */

/* eslint-disable react-hooks/set-state-in-effect -- fetch-on-mount is the intentional pattern */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Badge, Button, DetailPageSkeleton } from "@/ui/primitives";
import { DelegatedTaskStatus } from "@/domain/execution/delegated-task";
import { ProofStatus, ProofType } from "@/domain/execution/proof";
import { classifyOperatorError } from "@/lib/operator-error-governance";

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

const PROOF_STATUS_LABELS: Record<string, string> = {
  [ProofStatus.NOT_REQUIRED]: "Not Required",
  [ProofStatus.REQUIRED]: "Required",
  [ProofStatus.PENDING_SUBMISSION]: "Pending Submission",
  [ProofStatus.SUBMITTED]: "Submitted",
  [ProofStatus.AI_PRECHECK_PASSED]: "AI Precheck Passed",
  [ProofStatus.AI_PRECHECK_FAILED]: "AI Precheck Failed",
  [ProofStatus.NEEDS_HUMAN_REVIEW]: "Needs Human Review",
  [ProofStatus.ACCEPTED]: "Accepted",
  [ProofStatus.REJECTED]: "Rejected",
  [ProofStatus.RESUBMISSION_REQUIRED]: "Resubmission Required",
  [ProofStatus.DISPUTED]: "Disputed",
  [ProofStatus.OVERRIDDEN_NOT_VERIFIED]: "Override (Not Verified)",
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
      setActionSuccess(`Proof review outcome: ${reviewTo}.`);
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
  if (error) return <div className="px-4 py-8 text-destructive text-sm">{error}</div>;
  if (!task) return <div className="px-4 py-8 text-muted-foreground text-sm">Task not found.</div>;

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
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <Link href="/owner/tasks" className="text-sm text-muted-foreground hover:underline mb-2 block">
            ← Tasks
          </Link>
          <h1 className="text-2xl font-semibold">{task.title}</h1>
        </div>
        <Badge variant={STATUS_VARIANT[task.status] ?? "default"}>
          {STATUS_LABELS[task.status] ?? task.status}
        </Badge>
      </div>

      {/* Feedback */}
      {actionSuccess && <p className="text-sm text-green-700 dark:text-green-400">{actionSuccess}</p>}
      {actionError && <p className="text-sm text-destructive">{actionError}</p>}

      {/* Task info */}
      <div className="rounded-lg border border-border p-4 space-y-3 text-sm">
        {task.description && <p className="text-muted-foreground">{task.description}</p>}
        <div className="grid grid-cols-2 gap-2">
          <div><span className="text-muted-foreground">Assigned to:</span> <span>{task.assignedRole ?? task.assignedUserId ?? "—"}</span></div>
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
              Type: <span className="text-foreground">{task.proofRequirement.proofType}</span>
              {task.proofRequirement.riskLevel && <> · Risk: <span className="text-foreground">{task.proofRequirement.riskLevel}</span></>}
            </div>
          )}
          {task.proof ? (
            <div className="space-y-1">
              <div>
                Status: <Badge variant={task.proof.status === ProofStatus.ACCEPTED ? "success" : task.proof.duplicateFlagged ? "destructive" : "default"}>
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
              <select
                value={submitProofType}
                onChange={(e) => setSubmitProofType(e.target.value)}
                className="rounded border border-border bg-background px-3 py-1.5 text-sm w-full"
                required
              >
                <option value="">Select proof type…</option>
                {Object.values(ProofType).map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              <input
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
              <select
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
                <input
                  type="text"
                  placeholder="Rejection reason (required)"
                  value={reviewReason}
                  onChange={(e) => setReviewReason(e.target.value)}
                  className="rounded border border-border bg-background px-3 py-1.5 text-sm w-full"
                  required
                />
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
            {task.status === DelegatedTaskStatus.COMPLETED_PENDING_REVIEW && (
              <Link href={`/owner/tasks/${task.id}/complete`}>
                <Button size="sm" disabled={actionLoading}>Review &amp; Approve</Button>
              </Link>
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
                {h.actorRole && <span>({h.actorRole})</span>}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
