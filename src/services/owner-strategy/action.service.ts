/**
 * Owner Strategy & Scenario Planning (Module 8) — action execution service.
 *
 * Transitions strategy actions through the SHARED Module 1 status machine
 * (proposed→assigned→in_progress→{blocked}→completed|cancelled). Workspace
 * ownership is enforced; invalid transitions are rejected (400); completing
 * requires completion evidence. Reuses the recovery action-status vocabulary.
 */
import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { NotFoundError, ValidationError } from "@/infra/errors";
import {
  canTransition,
  isValidRecoveryStatus,
  requiresCompletionEvidence,
  type RecoveryActionStatus,
} from "@/domain/founder-recovery/action-status";
import { enforceOwnerActionGates, recordOwnerGateAssessment, type OwnerGateAssessment } from "@/services/owner-mode/owner-action-gate.service";
import { applyGuardedActionUpdate } from "@/services/owner-mode/owner-action-transition";
import type { StrategyActionUpdateInput } from "@/domain/owner-strategy/validation";
import {
  arbitrateStrategyActionRows,
  STRATEGY_FITS_WITHOUT_FORWARD_STEPS,
  STRATEGY_STEP_NOT_IN_DECISION_MESSAGE,
} from "@/domain/owner-strategy/action-arbitration";
import { ENGAGED_ACTION_STATUSES } from "@/domain/founder-recovery/action-continuity";
import { currentStrategyDecision } from "./decision-view";
import { CURRENT_STRATEGY_CYCLE_ORDER } from "@/services/owner-spine/current-diagnosis-cycle";
import { ownerStrategyStepIntent } from "@/domain/owner-spine/owner-imperatives";

export async function updateStrategyAction(
  actionId: string,
  input: StrategyActionUpdateInput,
  actorId: string,
  workspaceId: string
) {
  const action = await db.ownerStrategyAction.findFirst({
    where: { id: actionId, workspaceId },
  });
  if (!action) throw new NotFoundError("OwnerStrategyAction", actionId);

  const data: Record<string, unknown> = {};
  const now = new Date();
  let gateAssessment: OwnerGateAssessment | null = null;

  if (input.status !== undefined) {
    if (!isValidRecoveryStatus(input.status)) {
      throw new ValidationError(`Invalid strategy action status: ${input.status}`);
    }
    const from = action.status as RecoveryActionStatus;
    if (!canTransition(from, input.status)) {
      throw new ValidationError(`Invalid strategy action transition: ${from} → ${input.status}`);
    }
    const to = input.status;
    // Strategy's current evaluation (read once): the decision-fit check and the gate's intent both use it.
    const current = await db.ownerStrategyCycle.findFirst({
      where: { businessId: action.businessId, workspaceId },
      orderBy: CURRENT_STRATEGY_CYCLE_ORDER,
      include: { snapshot: true },
    });
    const liveDecision = currentStrategyDecision(current);

    // Decision fit (server-side): a proposed step that is on hold, covered by the current next step,
    // or no longer flagged must not be newly taken on (action-arbitration.ts). Work the owner has
    // already taken on stays theirs to finish or cancel. Arbitrated over the same set the Strategy
    // page shows (latest cycle + engaged work carried from earlier cycles), so duplicates agree too.
    if (from === "proposed" && to === "assigned") {
      const latest = current;
      const decision = liveDecision;
      if (decision && latest) {
        const rows = await db.ownerStrategyAction.findMany({
          where: {
            businessId: action.businessId,
            workspaceId,
            OR: [{ cycleId: latest.id }, { status: { in: [...ENGAGED_ACTION_STATUSES] } }],
          },
          select: { id: true, findingCode: true, recommendationCode: true, status: true, cycleId: true },
          // The Strategy dashboard's order (dashboard.service.ts), so duplicates resolve the same way.
          orderBy: [
            { priorityScore: "desc" },
            { expectedImpactScore: "desc" },
            { confidence: "desc" },
            { findingCode: "asc" },
            { title: "asc" },
            { id: "asc" },
          ],
        });
        const ordered = [...rows.filter((r: { cycleId: string }) => r.cycleId === latest.id), ...rows.filter((r: { cycleId: string }) => r.cycleId !== latest.id)];
        // A proposal left on an older cycle was replaced by the latest evaluation's plan.
        const fit = arbitrateStrategyActionRows(ordered, decision).find((r: { id: string }) => r.id === actionId)?.decisionFit ?? "superseded";
        if (STRATEGY_FITS_WITHOUT_FORWARD_STEPS.includes(fit)) {
          throw new ValidationError(STRATEGY_STEP_NOT_IN_DECISION_MESSAGE);
        }
      }
    }

    if (requiresCompletionEvidence(to)) {
      const notes = input.completionNotes ?? action.completionNotes;
      const evidence =
        input.completionEvidence ??
        (Array.isArray(action.completionEvidence) ? action.completionEvidence : null);
      if (!notes || !evidence || evidence.length === 0) {
        throw new ValidationError(
          "Completing a strategy action requires completionNotes and completionEvidence."
        );
      }
      data.completedAt = now;
    }

    // EH-01/EH-02 — owner-mode safety gate (default-on, opt-out aware) before a material transition, after
    // the request's own validation (a request that fails it never records a block), with the step's intent
    // under the live decision (the class the canonical owner decision gives it).
    gateAssessment = await enforceOwnerActionGates({
      workspaceId,
      businessId: action.businessId,
      actionId,
      domain: "strategy",
      toStatus: to,
      findingCode: action.findingCode,
      findingId: action.findingId,
      intent: ownerStrategyStepIntent(liveDecision?.code ?? null, action.findingCode),
    });
    data.status = to;
  }

  if (input.assignedTo !== undefined) data.assignedTo = input.assignedTo;
  if (input.completionNotes !== undefined) data.completionNotes = input.completionNotes;
  if (input.completionEvidence !== undefined) data.completionEvidence = input.completionEvidence;

  // Compare-and-set on the status the transition was validated against (a double submission or a
  // concurrent change never applies a stale transition twice).
  const { row: updated, transitioned } = await applyGuardedActionUpdate<typeof action>(db.ownerStrategyAction, {
    entity: "OwnerStrategyAction", actionId, workspaceId, expectedStatus: action.status, toStatus: input.status, data,
  });
  // An identical concurrent request already applied this transition: nothing more to record or trigger.
  if (!transitioned) return updated;

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.OWNER_STRATEGY_ACTION_UPDATED,
    actorId,
    workspaceId,
    entityType: "OwnerStrategyAction",
    entityId: actionId,
    payload: { status: updated.status, assignedTo: updated.assignedTo },
  });
  // The gate's Owner-mode assessment is recorded only now that the transition is validated and saved.
  if (gateAssessment) await recordOwnerGateAssessment(gateAssessment);

  // On action completion, emit a dedicated event and trigger re-diagnosis of the current scenario.
  if (updated.status === "completed") {
    await emitAuditEvent({
      eventName: AUDIT_EVENTS.OWNER_STRATEGY_ACTION_COMPLETED,
      actorId,
      workspaceId,
      entityType: "OwnerStrategyAction",
      entityId: actionId,
      payload: { businessId: updated.businessId, cycleId: updated.cycleId },
    });

    try {
      // Re-evaluate the scenario behind the current decision, not the latest assessment period.
      const { currentStrategyScenarioId, runStrategyDiagnosis } = await import("./diagnosis.service");
      const scenarioId = await currentStrategyScenarioId(updated.businessId, workspaceId);
      if (scenarioId) {
        const newCycle = await runStrategyDiagnosis(updated.businessId, scenarioId, actorId, workspaceId);
        await emitAuditEvent({
          eventName: AUDIT_EVENTS.OWNER_STRATEGY_REASSESSMENT_TRIGGERED,
          actorId,
          workspaceId,
          entityType: "OwnerStrategyCycle",
          entityId: newCycle.id,
          payload: { trigger: "action_completed", triggerActionId: actionId },
        });
      }
    } catch (_err) {
      // Re-diagnosis failure must not fail the action update — advisory only.
    }
  }

  return updated;
}

export async function getStrategyAction(actionId: string, workspaceId: string) {
  const action = await db.ownerStrategyAction.findFirst({
    where: { id: actionId, workspaceId },
    include: { verifications: { orderBy: { createdAt: "desc" } } },
  });
  if (!action) throw new NotFoundError("OwnerStrategyAction", actionId);
  return action;
}
