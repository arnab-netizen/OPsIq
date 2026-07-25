/**
 * Bundle 4.1 — Stage 3 → Reassessment Signal Router.
 *
 * Fire-and-forget bridge from Stage 3 operational events to the
 * OwnerReassessmentEvent system. Each signal creates an OwnerReassessmentEvent
 * via lazy-imported createReassessmentEvent so the router never blocks the
 * primary Stage 3 operation even if the reassessment service fails.
 *
 * Rules:
 * - All emissions are best-effort: all errors are swallowed, never propagate.
 * - businessId is required: calls with a null/undefined businessId are skipped silently.
 * - Workspace-scoped: workspaceId is always passed from the calling service.
 * - Lazy import: createReassessmentEvent is imported dynamically per call.
 */

import type { ReassessmentTrigger } from "@/services/owner-mode/reassessment-event.service";

/** Internal helper: emit one reassessment event, swallow all errors. */
async function emitReassessmentSignal(
  workspaceId: string,
  businessId: string,
  actorId: string,
  trigger: ReassessmentTrigger,
  triggerDescription: string,
  refs: { actionId?: string; sourceProofId?: string },
): Promise<void> {
  try {
    const { createReassessmentEvent } = await import(
      "@/services/owner-mode/reassessment-event.service"
    );
    await createReassessmentEvent({
      workspaceId,
      businessId,
      trigger,
      triggerDescription,
      actorId,
      actionId: refs.actionId ?? null,
      sourceProofId: refs.sourceProofId ?? null,
    });
  } catch {
    // Fire-and-forget: a signal failure must never block the primary Stage 3 operation.
  }
}

/**
 * Route a resolved complaint to the reassessment system.
 * Trigger: "verified_outcome" — resolved complaint is a quality re-evaluation signal.
 * Skips silently when businessId is null/undefined.
 */
export async function routeComplaintResolutionSignal(
  workspaceId: string,
  actorId: string,
  complaintId: string,
  businessId: string | null | undefined,
): Promise<void> {
  if (!businessId) return;
  await emitReassessmentSignal(
    workspaceId,
    businessId,
    actorId,
    "verified_outcome",
    `Customer complaint ${complaintId} resolved — business quality re-evaluation triggered`,
    {},
  );
}

/**
 * Route an action assignment failure to the reassessment system.
 * Trigger: "failed_outcome" — failed action is an execution health signal.
 * Skips silently when businessId is null/undefined.
 */
export async function routeActionFailureSignal(
  workspaceId: string,
  actorId: string,
  assignmentId: string,
  businessId: string | null | undefined,
): Promise<void> {
  if (!businessId) return;
  await emitReassessmentSignal(
    workspaceId,
    businessId,
    actorId,
    "failed_outcome",
    `Owner action assignment ${assignmentId} failed — execution re-evaluation triggered`,
    { actionId: assignmentId },
  );
}

/**
 * Route a rejected approval (rescope triggered) to the reassessment system.
 * Trigger: "external_event_invalidation" — rejected approval invalidates the
 * planned action's assumptions. businessId is always present for approvals.
 */
export async function routeApprovalRejectionSignal(
  workspaceId: string,
  actorId: string,
  approvalId: string,
  businessId: string,
  actionId: string | null | undefined,
): Promise<void> {
  await emitReassessmentSignal(
    workspaceId,
    businessId,
    actorId,
    "external_event_invalidation",
    `Approval ${approvalId} rejected — action rescoped, domain re-evaluation triggered`,
    { actionId: actionId ?? undefined },
  );
}

/**
 * Route a SOP non-compliance alert to the reassessment system.
 * Trigger: "new_contradicting_evidence" — SOP breach contradicts assumed compliance health.
 * Skips silently when businessId is null/undefined.
 */
export async function routeSopComplianceSignal(
  workspaceId: string,
  actorId: string,
  alertId: string,
  businessId: string | null | undefined,
): Promise<void> {
  if (!businessId) return;
  await emitReassessmentSignal(
    workspaceId,
    businessId,
    actorId,
    "new_contradicting_evidence",
    `SOP non-compliance alert ${alertId} created — compliance re-evaluation triggered`,
    {},
  );
}
