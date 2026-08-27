/**
 * F-STARTUP-OUTCOME-LOOP — closes a StartupInitiative's funded outcome.
 *
 * Closes the real defect: startup-execution-blueprint.service.ts creates a
 * FundedInitiativeOutcome row (outcome: "PENDING", safeForLearning: true) for
 * every launched StartupInitiative, and the budget learning loop
 * (budget.service.ts / updated-plan.ts) already reads safeForLearning
 * outcomes to steer future recommendations -- but until this service existed,
 * nothing ever transitioned that row out of PENDING, so real startup outcomes
 * were silently orphaned and never fed the learning loop.
 *
 * No new mechanism is invented: this reuses the SAME classifier
 * (classifyBudgetOutcome, wrapping classifyInitiativeOutcome) and the SAME
 * FundedInitiativeOutcome store that action-link.service.ts's
 * updateBudgetAction() already uses to close OwnerBudgetAction-triggered
 * outcomes -- just triggered off StartupInitiative completion instead.
 * "Verified measurable outcome and/or explicit owner confirmation" is
 * enforced the same way it already is for budget actions: outcomeVerified is
 * a required, explicit boolean and an unverified outcome is never classified
 * as a success (see classifyInitiativeOutcome). There is no arbitrary
 * timeout anywhere in this path.
 *
 * Root-cause note: the PENDING row created at blueprint time is stamped
 * businessId = workspaceId (a placeholder -- no OwnerBusiness exists yet at
 * blueprint-creation time, which always precedes handoff). That placeholder
 * is why the row is invisible to budget.service.ts's business-scoped learning
 * query even if its `outcome` field alone were flipped. Closing an initiative
 * therefore requires the session to have already been handed off to a real
 * OwnerBusiness, and this service repoints the row at that real businessId in
 * the same update that classifies it -- fixing both defects in one place
 * instead of leaving a permanently-orphaned, wrongly-scoped row behind.
 *
 * Known, deliberately out-of-scope edge case: a superseded blueprint's
 * StartupInitiative is never itself marked SUPERSEDED (see
 * startup-execution-blueprint.service.ts's supersession block), so a session
 * that was re-approved/re-blueprinted more than once before handoff can carry
 * more than one PENDING FundedInitiativeOutcome row with the same
 * initiativeLabel. That is a distinct, pre-existing defect in the
 * supersession path, not this one -- this service fails closed (refuses to
 * guess) rather than silently closing the wrong row when it detects that
 * ambiguity.
 */
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { NotFoundError, ConflictError } from "@/infra/errors";
import { classifyBudgetOutcome, type BudgetOutcomeInput, type BudgetOutcomeResult } from "@/domain/owner-budget";
import { assertInitiativeClosable, type StartupInitiativeStatus } from "@/domain/owner-strategy/startup-initiative-lifecycle";
import { logger } from "@/infra/logger";

export interface CloseStartupInitiativeInput extends BudgetOutcomeInput {
  note?: string;
}

export interface CloseStartupInitiativeResult {
  initiativeId: string;
  businessId: string;
  status: "COMPLETED" | "CANCELLED";
  fundedInitiativeOutcomeId: string;
  classification: BudgetOutcomeResult;
}

/**
 * Close a StartupInitiative by classifying its measured outcome and moving
 * the PENDING FundedInitiativeOutcome row created at blueprint time into a
 * real, learning-eligible classification. Requires the initiative's session
 * to have already been handed off to a real OwnerBusiness (handOffStartupSessionToBusiness) --
 * a startup outcome can only be measured against a business that actually exists.
 */
export async function closeStartupInitiative(
  workspaceId: string,
  initiativeId: string,
  input: CloseStartupInitiativeInput,
  actorId: string
): Promise<CloseStartupInitiativeResult> {
  const toStatus: "COMPLETED" | "CANCELLED" = input.cancelled ? "CANCELLED" : "COMPLETED";

  const result = await db.$transaction(async (tx: Prisma.TransactionClient) => {
    const initiative = await tx.startupInitiative.findFirst({
      where: { id: initiativeId, workspaceId },
      select: { id: true, sessionId: true, label: true, status: true },
    });
    if (!initiative) throw new NotFoundError("StartupInitiative", initiativeId);

    assertInitiativeClosable(initiative.status as StartupInitiativeStatus, toStatus);

    const session = await tx.ownerStartupSession.findFirst({
      where: { id: initiative.sessionId, workspaceId },
      select: { businessId: true },
    });
    if (!session?.businessId) {
      throw new ConflictError(
        "STARTUP_INITIATIVE_NOT_HANDED_OFF: this initiative's session has not been handed off to a real OwnerBusiness yet -- a startup outcome can only be measured/closed against a business that exists. Call the handoff endpoint first."
      );
    }
    const businessId = session.businessId;

    const business = await tx.ownerBusiness.findFirst({ where: { id: businessId, workspaceId }, select: { id: true } });
    if (!business) throw new NotFoundError("OwnerBusiness", businessId);

    // The PENDING placeholder created at blueprint time, matched by label (FundedInitiativeOutcome
    // has no initiativeId column). Fail closed rather than guess if more than one is found -- see
    // the file-header note on the supersession-orphan edge case.
    const pending = await tx.fundedInitiativeOutcome.findMany({
      where: { workspaceId, initiativeLabel: initiative.label, outcome: "PENDING" },
      select: { id: true, expectedImpact: true },
    });
    if (pending.length === 0) {
      throw new ConflictError(
        `STARTUP_INITIATIVE_OUTCOME_MISSING: no PENDING FundedInitiativeOutcome row found for initiative "${initiative.label}" -- nothing to close.`
      );
    }
    if (pending.length > 1) {
      throw new ConflictError(
        `STARTUP_INITIATIVE_OUTCOME_AMBIGUOUS: ${pending.length} PENDING FundedInitiativeOutcome rows share the label "${initiative.label}" -- refusing to guess which one belongs to this initiative. This indicates a re-approved/re-blueprinted session whose earlier StartupInitiative was never marked SUPERSEDED; resolve manually before closing.`
      );
    }
    const pendingRow = pending[0];

    const priorFailures = await tx.fundedInitiativeOutcome.count({
      where: { workspaceId, businessId, initiativeLabel: initiative.label, outcome: "FAILED" },
    });

    const classification = classifyBudgetOutcome({
      outcomeVerified: input.outcomeVerified,
      expectedImpact: input.expectedImpact ?? null,
      actualImpact: input.actualImpact ?? null,
      expectedSpend: input.expectedSpend ?? null,
      actualSpend: input.actualSpend ?? null,
      cancelled: input.cancelled === true,
      overridden: input.overridden === true,
      externalFactor: input.externalFactor === true,
      priorFailures,
    });

    const outcomeUpdate = await tx.fundedInitiativeOutcome.updateMany({
      where: { id: pendingRow.id, outcome: "PENDING" },
      data: {
        businessId,
        outcome: classification.outcome,
        nextStep: classification.nextStep,
        safeForLearning: classification.safeForLearning,
        expectedImpact: input.expectedImpact ?? pendingRow.expectedImpact ?? null,
        actualImpact: input.actualImpact ?? null,
        note: JSON.stringify({
          disposition: classification.disposition,
          confidenceImpact: classification.confidenceImpact,
          priorFailures,
          reason: classification.reason,
          completionNotes: input.note ?? null,
        }),
        createdBy: actorId,
        updatedAt: new Date(),
      },
    });
    if (outcomeUpdate.count === 0) {
      throw new ConflictError(
        "CONCURRENCY_CONFLICT: the funded initiative outcome was concurrently closed -- retry the request to get the winning result."
      );
    }

    const initiativeUpdate = await tx.startupInitiative.updateMany({
      where: { id: initiativeId, workspaceId, status: initiative.status },
      data: { status: toStatus },
    });
    if (initiativeUpdate.count === 0) {
      throw new ConflictError(
        "CONCURRENCY_CONFLICT: the startup initiative was concurrently closed -- retry the request to get the winning result."
      );
    }

    await emitAuditEvent(
      {
        workspaceId,
        actorId,
        eventName: AUDIT_EVENTS.STARTUP_INITIATIVE_OUTCOME_CLOSED,
        entityType: "StartupInitiative",
        entityId: initiativeId,
        payload: {
          businessId,
          sessionId: initiative.sessionId,
          initiativeLabel: initiative.label,
          fundedInitiativeOutcomeId: pendingRow.id,
          previousStatus: initiative.status,
          newStatus: toStatus,
          outcome: classification.outcome,
          disposition: classification.disposition,
          confidenceImpact: classification.confidenceImpact,
          safeForLearning: classification.safeForLearning,
          expectedImpact: input.expectedImpact ?? null,
          actualImpact: input.actualImpact ?? null,
        },
      },
      tx
    );

    return {
      initiativeId,
      businessId,
      status: toStatus,
      fundedInitiativeOutcomeId: pendingRow.id,
      classification,
      initiativeLabel: initiative.label,
    };
  });

  // Mandatory adaptive rule (CLAUDE.md): a closed startup outcome is a significant
  // change and must route into governed re-evaluation of the resulting business's
  // condition profile / intervention mode / recommendation priority / review cadence
  // / health status. Reuses the SAME re-evaluation mechanism integration-event.service.ts
  // already uses for business-scoped events (Owner Mode has no Engagement/BusinessConditionProfile
  // row to re-evaluate here -- OwnerBusiness/StartupInitiative are workspace+business scoped, not
  // engagement scoped -- so the owner-bcp.service.ts BCP is the correct, already-established
  // adaptive-reassessment surface for this domain, not src/services/re-evaluation.ts which requires
  // an Engagement row). Best-effort: a re-evaluation failure never unwinds the outcome closure that
  // already committed above -- there is nothing left to roll back, and the outcome/audit trail must
  // stand regardless.
  try {
    const { getCurrentConditionProfile, evaluateConditionProfile } = await import(
      "@/services/owner-mode/owner-bcp.service"
    );
    const current = await getCurrentConditionProfile({ workspaceId, businessId: result.businessId });
    if (current) {
      const triggerType =
        result.classification.outcome === "FAILED"
          ? "BLOCKER_EVENT"
          : result.classification.outcome === "SUCCESS" || result.classification.outcome === "PARTIAL"
            ? "KPI_CHANGE"
            : "SIGNAL_REASSESSMENT";
      await evaluateConditionProfile({
        workspaceId,
        actorId,
        businessId: result.businessId,
        facts: {
          financialHealthScore: current.financialHealthScore,
          operationalHealthScore: current.operationalHealthScore,
          salesHealthScore: current.salesHealthScore,
          sopHealthScore: current.sopHealthScore,
          humanExecutionRisk: current.humanExecutionRisk as "CRITICAL" | "HIGH" | "MEDIUM" | "LOW",
        },
        triggerType,
        triggerDescription: `StartupInitiative "${result.initiativeLabel}" closed with outcome ${result.classification.outcome} (${result.classification.reason})`,
        sourceReassessmentEventId: undefined,
      });
    }
  } catch (err) {
    logger.warn("Startup initiative BCP re-evaluation failed (non-blocking)", {
      workspaceId,
      businessId: result.businessId,
      initiativeId,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return {
    initiativeId: result.initiativeId,
    businessId: result.businessId,
    status: result.status,
    fundedInitiativeOutcomeId: result.fundedInitiativeOutcomeId,
    classification: result.classification,
  };
}
