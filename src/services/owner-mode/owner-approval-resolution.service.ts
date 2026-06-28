/**
 * Jarvis 360 gap-closure (G07,G08,G10) — live owner approval resolution (DI).
 *
 * Strict re-audit finding: approval memory + standing instructions were persisted but
 * never consulted by any live approval flow, so the owner's workload was never reduced.
 *
 * This composes the existing Slice-4 pieces into ONE live decision used before asking
 * the owner to approve:
 *   1. standing instruction for the scope (auto_allow / forbidden / needs_approval)
 *   2. recorded approval memory (content-hash + risk-class reuse)
 * When OpsIQ can auto-handle (standing auto-allow or remembered approval), it records an
 * attention event flagged handledByOpsIQ so "approvals avoided" is observable in the
 * control center, and audits the auto-handle. Otherwise the owner must decide.
 *
 * Reuses owner-load.service + approval-memory.service (no duplicate approval engine).
 */

import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import type { ApprovalRiskClass } from "@/domain/owner-mode/approval-memory";
import {
  isApprovalRemembered,
  type ApprovalMemoryDeps,
} from "@/services/owner-mode/approval-memory.service";
import {
  evaluateRequestAgainstStandingInstructions,
  recordAttentionEvent,
  type OwnerLoadDeps,
} from "@/services/owner-mode/owner-load.service";

export interface ResolveOwnerApprovalInput {
  workspaceId: string;
  /** Approval-memory + standing-instruction scope, e.g. "pricing.discount". */
  scope: string;
  /** Stable content hash of the decision being approved (see hashApprovalContent). */
  contentHash: string;
  riskClass: ApprovalRiskClass;
  actionType: string;
  amount?: number | null;
}

export type OwnerApprovalOutcome = "auto_handled" | "forbidden" | "needs_owner_approval";

export interface OwnerApprovalResolution {
  outcome: OwnerApprovalOutcome;
  reason: "standing_instruction_allow" | "standing_instruction_forbidden" | "approval_memory" | "owner_decision_required";
  /** True only when the owner must personally act. */
  ownerActionRequired: boolean;
  /** True when OpsIQ removed this from the owner's plate (workload reduction). */
  handledByOpsIQ: boolean;
}

export interface OwnerApprovalResolutionDeps {
  memory?: ApprovalMemoryDeps;
  load?: OwnerLoadDeps;
}

async function autoHandled(
  input: ResolveOwnerApprovalInput,
  reason: OwnerApprovalResolution["reason"],
  forbidden: boolean,
  deps: OwnerApprovalResolutionDeps
): Promise<OwnerApprovalResolution> {
  await recordAttentionEvent(
    {
      workspaceId: input.workspaceId,
      eventType: forbidden ? "approval.auto_blocked" : "approval.auto_approved",
      severity: forbidden ? "high" : "low",
      disposition: "auto_handle",
      ownerDecisionRequired: false,
      handledByOpsIQ: true,
      sourceRef: `${input.scope}:${input.contentHash.slice(0, 12)}`,
    },
    deps.load
  );
  await emitAuditEvent({
    workspaceId: input.workspaceId,
    eventName: AUDIT_EVENTS.OWNER_APPROVAL_AUTO_HANDLED,
    actorType: "system",
    entityType: "owner_approval",
    entityId: `${input.scope}:${input.contentHash.slice(0, 12)}`,
    payload: { scope: input.scope, reason, forbidden },
  });
  return {
    outcome: forbidden ? "forbidden" : "auto_handled",
    reason,
    ownerActionRequired: false,
    handledByOpsIQ: true,
  };
}

/**
 * Decide whether OpsIQ can handle an approval on the owner's behalf (standing
 * instruction or remembered approval) or the owner must decide. Workspace-scoped.
 */
export async function resolveOwnerApproval(
  input: ResolveOwnerApprovalInput,
  injected?: OwnerApprovalResolutionDeps
): Promise<OwnerApprovalResolution> {
  const deps = injected ?? {};

  // 1. Standing instruction for this scope.
  const standing = await evaluateRequestAgainstStandingInstructions(
    { workspaceId: input.workspaceId, scope: input.scope, actionType: input.actionType, amount: input.amount ?? null },
    deps.load
  );
  if (standing === "forbidden") {
    return autoHandled(input, "standing_instruction_forbidden", true, deps);
  }
  if (standing === "auto_allow") {
    return autoHandled(input, "standing_instruction_allow", false, deps);
  }

  // 2. Recorded approval memory (content-hash + risk reuse).
  const remembered = await isApprovalRemembered(
    { workspaceId: input.workspaceId, scope: input.scope, contentHash: input.contentHash, riskClass: input.riskClass },
    deps.memory
  );
  if (remembered) {
    return autoHandled(input, "approval_memory", false, deps);
  }

  // 3. Genuine owner decision required.
  await recordAttentionEvent(
    {
      workspaceId: input.workspaceId,
      eventType: "approval.owner_decision_required",
      severity: input.riskClass === "critical" || input.riskClass === "high" ? "high" : "medium",
      disposition: "owner_decision",
      ownerDecisionRequired: true,
      handledByOpsIQ: false,
      sourceRef: `${input.scope}:${input.contentHash.slice(0, 12)}`,
    },
    deps.load
  );
  return {
    outcome: "needs_owner_approval",
    reason: "owner_decision_required",
    ownerActionRequired: true,
    handledByOpsIQ: false,
  };
}
