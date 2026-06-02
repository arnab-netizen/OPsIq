import { db } from "@/lib/db";
import type { ApprovalRequest } from "@/generated/prisma";

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

export async function requestApproval(
  operatorItemId: string,
  requestedBy: string,
  approverId: string
): Promise<ApprovalRequest> {
  const existingRequest = await db.approvalRequest.findUnique({
    where: {
      operatorItemId_approverUserId: {
        operatorItemId,
        approverUserId: approverId,
      },
    },
  });

  if (existingRequest) {
    return existingRequest;
  }

  return await db.approvalRequest.create({
    data: {
      operatorItemId,
      requestedBy,
      approverUserId: approverId,
      approvalStatus: "pending",
    },
  });
}

export async function approveOutcome(
  approvalRequestId: string,
  approverId: string,
  decision: string
): Promise<{ approved: boolean; reason: string }> {
  const request = await db.approvalRequest.findUnique({
    where: { id: approvalRequestId },
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

  await db.approvalRequest.update({
    where: { id: approvalRequestId },
    data: {
      approvalStatus: "approved",
      approvalDecision: decision,
      approvedAt: new Date(),
    },
  });

  return {
    approved: true,
    reason: "Approval recorded",
  };
}

export async function rejectOutcome(
  approvalRequestId: string,
  approverId: string,
  decision: string
): Promise<{ approved: boolean; reason: string }> {
  const request = await db.approvalRequest.findUnique({
    where: { id: approvalRequestId },
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

  await db.approvalRequest.update({
    where: { id: approvalRequestId },
    data: {
      approvalStatus: "rejected",
      approvalDecision: decision,
    },
  });

  return {
    approved: false,
    reason: decision,
  };
}

export async function getApprovalStatus(
  operatorItemId: string
): Promise<ApprovalStatus> {
  const requests = await db.approvalRequest.findMany({
    where: { operatorItemId },
  });

  if (requests.length === 0) {
    return {
      approved: false,
      pending: false,
      rejected: false,
      reason: "No approval requests found",
    };
  }

  const approved = requests.filter((r) => r.approvalStatus === "approved");
  const pending = requests.filter((r) => r.approvalStatus === "pending");
  const rejected = requests.filter((r) => r.approvalStatus === "rejected");

  return {
    approved: approved.length > 0,
    pending: pending.length > 0,
    rejected: rejected.length > 0,
    reason: rejected.length > 0 ? rejected[0].approvalDecision || "Rejected by reviewer" : undefined,
  };
}

export async function requiresApproval(impactExpected: number): boolean {
  return impactExpected > APPROVAL_THRESHOLD;
}

export async function enforceApprovalRequirement(
  operatorItemId: string,
  impactExpected: number,
  requestedBy: string,
  approverId: string
): Promise<{
  requiresApproval: boolean;
  approvalCreated: boolean;
  approvalRequestId?: string;
}> {
  const needsApproval = await requiresApproval(impactExpected);

  if (!needsApproval) {
    return {
      requiresApproval: false,
      approvalCreated: false,
    };
  }

  const approval = await requestApproval(operatorItemId, requestedBy, approverId);

  return {
    requiresApproval: true,
    approvalCreated: true,
    approvalRequestId: approval.id,
  };
}

export async function canCompleteWithApprovalStatus(
  operatorItemId: string,
  impactExpected: number
): Promise<{ allowed: boolean; reason?: string }> {
  if (!(await requiresApproval(impactExpected))) {
    return { allowed: true };
  }

  const status = await getApprovalStatus(operatorItemId);

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
