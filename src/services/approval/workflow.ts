import { db } from "@/lib/db";
import type { ApprovalRequest, Prisma } from "@/generated/prisma/client";
import {
  resolveOwnerApproval,
  type ResolveOwnerApprovalInput,
  type OwnerApprovalResolutionDeps,
} from "@/services/owner-mode/owner-approval-resolution.service";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { NotFoundError } from "@/infra/errors";
import { logger } from "@/infra/logger";

export interface ApprovalStatus {
  approved: boolean;
  pending: boolean;
  rejected: boolean;
  reason?: string;
}

export interface ApprovalDecision {
  status: "approved" | "rejected";
  decision: string;
  approvedBy: string;
}

export const APPROVAL_THRESHOLD = 100000;

/**
 * Resolve the workspace that owns an operator item, straight from the DB. Used by
 * requestApproval() to verify a caller-supplied workspaceId actually matches the operator
 * item's real workspace before a new ApprovalRequest.workspaceId is ever written — the same
 * DB-derived-not-caller-trusted check used elsewhere in the codebase for cross-workspace
 * attribution (e.g. OwnerApprovalRequest.createApproval()'s getBusiness(businessId,
 * workspaceId) check). Throws NotFoundError if the operator item is missing.
 */
async function resolveApprovalWorkspaceId(operatorItemId: string): Promise<string> {
  const item = await db.operatorItem.findUnique({
    where: { id: operatorItemId },
    select: { workspaceId: true },
  });
  if (!item) throw new NotFoundError("OperatorItem", operatorItemId);
  return item.workspaceId;
}

export async function requestApproval(
  workspaceId: string,
  operatorItemId: string,
  requestedBy: string,
  approverId: string
): Promise<ApprovalRequest> {
  // WORKSPACE-ISOLATION: verify the operator item actually belongs to the caller's workspace
  // BEFORE ever creating a governed record under it. This is derived from the DB (the operator
  // item's own workspaceId), never trusted from the caller's workspaceId argument alone — a
  // caller cannot attribute a new approval to its own workspace by pairing a foreign
  // operatorItemId with its own workspaceId. Fails closed as a not-found (never leaks whether
  // the operator item exists in another workspace).
  const actualWorkspaceId = await resolveApprovalWorkspaceId(operatorItemId);
  if (actualWorkspaceId !== workspaceId) {
    throw new NotFoundError("OperatorItem", operatorItemId);
  }

  const existingRequest = await db.approvalRequest.findFirst({
    where: {
      operatorItemId,
      approverUserId: approverId,
      workspaceId,
    },
  });

  // Idempotent: an approval request for this (operatorItem, approver) already exists (also enforced
  // by the DB unique constraint). Return it without creating a duplicate or re-emitting a creation
  // audit event.
  if (existingRequest) {
    return existingRequest;
  }

  // AUDIT-01: create the governed approval record and emit its creation audit event inside one
  // transaction. A failed audit write rolls the create back (fail-closed) so a high-value approval
  // record can never exist without an audit trail.
  const created = await db.$transaction(async (tx: Prisma.TransactionClient) => {
    const request = await tx.approvalRequest.create({
      data: {
        workspaceId,
        operatorItemId,
        requestedBy,
        approverUserId: approverId,
        approvalStatus: "pending",
      },
    });

    await emitAuditEvent(
      {
        eventName: AUDIT_EVENTS.APPROVAL_REQUESTED,
        workspaceId,
        actorId: requestedBy,
        entityType: "approval_request",
        entityId: request.id,
        payload: {
          operatorItemId,
          approverUserId: approverId,
          requestedBy,
          newStatus: "pending",
        },
        visibility: "internal",
      },
      tx
    );

    return request;
  });

  logger.info("Approval requested", {
    approvalRequestId: created.id,
    operatorItemId,
    approverUserId: approverId,
  });

  return created;
}

export async function approveOutcome(
  workspaceId: string,
  approvalRequestId: string,
  approverId: string,
  decision: string
): Promise<{ approved: boolean; reason: string }> {
  // WORKSPACE-ISOLATION: scope the read by workspaceId. A caller in another workspace gets the
  // same "not found" result as a nonexistent id — the record's existence in a foreign workspace
  // is never revealed.
  const request = await db.approvalRequest.findFirst({
    where: { id: approvalRequestId, workspaceId },
  });

  if (!request) {
    return {
      approved: false,
      reason: "Approval request not found",
    };
  }

  if (request.approverUserId !== approverId) {
    return {
      approved: false,
      reason: "Not authorized to approve this request",
    };
  }

  const now = new Date();

  // AUDIT-01 + CONC-01 + status guard: transition via a status-guarded updateMany (only a row that
  // is STILL pending, AND still in the caller's workspace, transitions) inside one transaction with
  // the audit event. This makes concurrent approve/reject race-safe (exactly one wins), makes
  // re-approve a no-op rather than a re-stamp, prevents silently flipping an already-rejected record
  // to approved, rolls the state change back if the audit write fails (fail-closed), and — combined
  // with the workspace-scoped read above — prevents a cross-workspace update entirely.
  let granted = false;
  await db.$transaction(async (tx: Prisma.TransactionClient) => {
    const res = await tx.approvalRequest.updateMany({
      where: { id: approvalRequestId, workspaceId, approvalStatus: "pending" },
      data: {
        approvalStatus: "approved",
        approvalDecision: decision,
        approvedAt: now,
      },
    });

    if (res.count === 1) {
      granted = true;
      await emitAuditEvent(
        {
          eventName: AUDIT_EVENTS.APPROVAL_GRANTED,
          workspaceId,
          actorId: approverId,
          entityType: "approval_request",
          entityId: approvalRequestId,
          payload: {
            operatorItemId: request.operatorItemId,
            approverUserId: approverId,
            decision,
            previousStatus: "pending",
            newStatus: "approved",
          },
          visibility: "internal",
        },
        tx
      );
    }
  });

  if (granted) {
    logger.info("Approval granted", { approvalRequestId, approverUserId: approverId });
    return { approved: true, reason: "Approval recorded" };
  }

  // count === 0: the request was not pending. Distinguish idempotent replay from a blocked flip.
  const current = await db.approvalRequest.findFirst({ where: { id: approvalRequestId, workspaceId } });
  if (current?.approvalStatus === "approved") {
    return { approved: true, reason: "Approval already recorded" };
  }
  return {
    approved: false,
    reason: `Cannot approve: request is ${current?.approvalStatus ?? "missing"}`,
  };
}

export async function rejectOutcome(
  workspaceId: string,
  approvalRequestId: string,
  approverId: string,
  decision: string
): Promise<{ approved: boolean; reason: string }> {
  // WORKSPACE-ISOLATION: scope the read by workspaceId — see approveOutcome.
  const request = await db.approvalRequest.findFirst({
    where: { id: approvalRequestId, workspaceId },
  });

  if (!request) {
    return {
      approved: false,
      reason: "Approval request not found",
    };
  }

  if (request.approverUserId !== approverId) {
    return {
      approved: false,
      reason: "Not authorized to reject this request",
    };
  }

  // AUDIT-01 + CONC-01 + status guard: reject via a status-guarded updateMany (only a STILL-pending
  // row, AND still in the caller's workspace, transitions) inside one transaction with the audit
  // event. Prevents silently flipping an already-approved record to rejected, makes repeated reject
  // idempotent, is concurrency-safe, and rolls the state change back if the audit write fails
  // (fail-closed).
  let rejected = false;
  await db.$transaction(async (tx: Prisma.TransactionClient) => {
    const res = await tx.approvalRequest.updateMany({
      where: { id: approvalRequestId, workspaceId, approvalStatus: "pending" },
      data: {
        approvalStatus: "rejected",
        approvalDecision: decision,
      },
    });

    if (res.count === 1) {
      rejected = true;
      await emitAuditEvent(
        {
          eventName: AUDIT_EVENTS.APPROVAL_DENIED,
          workspaceId,
          actorId: approverId,
          entityType: "approval_request",
          entityId: approvalRequestId,
          payload: {
            operatorItemId: request.operatorItemId,
            approverUserId: approverId,
            decision,
            previousStatus: "pending",
            newStatus: "rejected",
          },
          visibility: "internal",
        },
        tx
      );
    }
  });

  if (rejected) {
    logger.info("Approval rejected", { approvalRequestId, approverUserId: approverId });
    return { approved: false, reason: decision };
  }

  // count === 0: the request was not pending. Distinguish idempotent replay from a blocked flip.
  const current = await db.approvalRequest.findFirst({ where: { id: approvalRequestId, workspaceId } });
  if (current?.approvalStatus === "rejected") {
    return { approved: false, reason: current.approvalDecision || decision };
  }
  if (current?.approvalStatus === "approved") {
    return { approved: false, reason: "Cannot reject: request is already approved" };
  }
  return { approved: false, reason: `Cannot reject: request is ${current?.approvalStatus ?? "missing"}` };
}

export async function getApprovalStatus(
  workspaceId: string,
  operatorItemId: string
): Promise<ApprovalStatus> {
  const requests = await db.approvalRequest.findMany({
    where: { operatorItemId, workspaceId },
  });

  if (requests.length === 0) {
    return {
      approved: false,
      pending: false,
      rejected: false,
      reason: "No approval requests found",
    };
  }

  const approved = requests.filter((r: ApprovalRequest) => r.approvalStatus === "approved");
  const pending = requests.filter((r: ApprovalRequest) => r.approvalStatus === "pending");
  const rejected = requests.filter((r: ApprovalRequest) => r.approvalStatus === "rejected");

  return {
    approved: approved.length > 0,
    pending: pending.length > 0,
    rejected: rejected.length > 0,
    reason: rejected.length > 0 ? rejected[0].approvalDecision || "Rejected by reviewer" : undefined,
  };
}

export async function requiresApproval(impactExpected: number): Promise<boolean> {
  return impactExpected > APPROVAL_THRESHOLD;
}

export async function enforceApprovalRequirement(
  workspaceId: string,
  operatorItemId: string,
  impactExpected: number,
  requestedBy: string,
  approverId: string,
  /**
   * Owner-mode context. When supplied, OpsIQ first consults the owner's standing
   * instructions + recorded approval memory (Slice 4) and auto-handles the approval
   * when allowed/remembered — avoiding a redundant re-ask (real workload reduction).
   * Omitted by the legacy operator path, which keeps its existing behavior.
   */
  ownerContext?: ResolveOwnerApprovalInput,
  injectedOwnerDeps?: OwnerApprovalResolutionDeps
): Promise<{
  requiresApproval: boolean;
  approvalCreated: boolean;
  approvalRequestId?: string;
  autoHandled?: boolean;
  autoHandledReason?: string;
}> {
  const needsApproval = await requiresApproval(impactExpected);

  if (!needsApproval) {
    return {
      requiresApproval: false,
      approvalCreated: false,
    };
  }

  if (ownerContext) {
    const resolution = await resolveOwnerApproval(ownerContext, injectedOwnerDeps);
    if (!resolution.ownerActionRequired) {
      // OpsIQ handled it (standing-instruction allow/forbid or remembered approval);
      // no approval request is created and the owner is not re-asked.
      return {
        requiresApproval: true,
        approvalCreated: false,
        autoHandled: true,
        autoHandledReason: resolution.reason,
      };
    }
  }

  const approval = await requestApproval(workspaceId, operatorItemId, requestedBy, approverId);

  return {
    requiresApproval: true,
    approvalCreated: true,
    approvalRequestId: approval.id,
  };
}

export async function canCompleteWithApprovalStatus(
  workspaceId: string,
  operatorItemId: string,
  impactExpected: number
): Promise<{ allowed: boolean; reason?: string }> {
  if (!(await requiresApproval(impactExpected))) {
    return { allowed: true };
  }

  const status = await getApprovalStatus(workspaceId, operatorItemId);

  if (status.rejected) {
    return {
      allowed: false,
      reason: `Approval rejected: ${status.reason}`,
    };
  }

  if (status.pending) {
    return {
      allowed: false,
      reason: "Approval pending - cannot complete until approved",
    };
  }

  if (!status.approved) {
    return {
      allowed: false,
      reason: "Approval required for high-impact decision",
    };
  }

  return { allowed: true };
}
