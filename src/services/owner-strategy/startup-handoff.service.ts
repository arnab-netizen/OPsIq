/**
 * F-STARTUP-NO-HANDOFF — links a validated, execution-planned Startup session
 * to a real, operating OwnerBusiness. This is the ONLY writer of
 * OwnerStartupSession.businessId and the only path that transitions a
 * session into ACTIVE.
 */
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { NotFoundError, ConflictError } from "@/infra/errors";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { assertValidTransition, type StartupSessionStatus } from "@/domain/owner-strategy/startup-lifecycle";
import { Prisma } from "@/generated/prisma/client";

export interface HandoffResult {
  businessId: string;
  alreadyHandedOff: boolean;
}

export async function handOffStartupSessionToBusiness(
  workspaceId: string,
  sessionId: string,
  actorId: string
): Promise<HandoffResult> {
  return db.$transaction(async (tx: Prisma.TransactionClient) => {
    const session = await tx.ownerStartupSession.findFirst({
      where: { id: sessionId, workspaceId },
      select: {
        id: true,
        status: true,
        businessId: true,
        intake: true,
        currentOwnerDecisionId: true,
      },
    });
    if (!session) throw new NotFoundError("OwnerStartupSession", sessionId);

    // Idempotent: already handed off -- return the existing link instead of
    // re-creating. Matches the evidence-record idempotencyKey pattern
    // elsewhere in this domain: repeating the same effective request returns
    // the same result, never a duplicate.
    if (session.status === "ACTIVE" && session.businessId) {
      return { businessId: session.businessId, alreadyHandedOff: true };
    }

    assertValidTransition(session.status as StartupSessionStatus, "ACTIVE");

    if (!session.currentOwnerDecisionId) {
      throw new ConflictError("HANDOFF_BLOCKED: no owner decision recorded for this session");
    }
    const decision = await tx.startupOwnerDecision.findFirst({
      where: { id: session.currentOwnerDecisionId, workspaceId },
      select: { decisionType: true, ideaId: true },
    });
    if (!decision || decision.decisionType !== "GO" || !decision.ideaId) {
      throw new ConflictError(
        "HANDOFF_BLOCKED: session's current decision is not an approved GO decision with a linked idea"
      );
    }

    const idea = await tx.startupIdeaRecord.findFirst({
      where: { id: decision.ideaId, workspaceId },
      select: { id: true, name: true, industry: true, supersededById: true },
    });
    if (!idea) throw new NotFoundError("StartupIdeaRecord", decision.ideaId);
    if (idea.supersededById) {
      throw new ConflictError(
        "HANDOFF_BLOCKED: the approved idea has since been revised -- reapproval is required before handoff"
      );
    }

    // Require a live (non-superseded/cancelled) execution plan -- proof the
    // owner actually planned execution, not just approved the idea. Nothing
    // upstream (EXECUTION_PLANNED's own transition guard) checks that a
    // blueprint/plan was ever created, so this is the first and only gate.
    const plan = await tx.startupExecutionPlan.findFirst({
      where: {
        workspaceId,
        sessionId,
        ideaId: idea.id,
        status: { notIn: ["SUPERSEDED", "CANCELLED"] },
      },
      select: { id: true },
      orderBy: { planVersion: "desc" },
    });
    if (!plan) {
      throw new ConflictError(
        "HANDOFF_BLOCKED: no active execution plan found for the approved idea -- create a blueprint/execution plan before activating"
      );
    }

    const intake = session.intake as { location?: string | null } | null;
    const businessId = randomUUID();
    await tx.ownerBusiness.create({
      data: {
        id: businessId,
        workspaceId,
        name: idea.name,
        businessType: idea.industry,
        location: intake?.location ?? null,
        isActive: true,
        createdBy: actorId,
      },
    });

    // Optimistic-concurrency guard (Pattern A, matching transitionSession()'s
    // own EXECUTION_PLANNED guard in startup-session.service.ts): the WHERE
    // clause re-checks status/businessId at UPDATE time. If either changed
    // since our read above (a concurrent handoff already won), count=0 and
    // we throw -- rolling back this whole transaction, including the
    // OwnerBusiness row just created, so no orphaned duplicate is ever left.
    const guard = await tx.ownerStartupSession.updateMany({
      where: { id: sessionId, workspaceId, status: session.status, businessId: null },
      data: { status: "ACTIVE", businessId },
    });
    if (guard.count === 0) {
      throw new ConflictError(
        "CONCURRENCY_CONFLICT: session was concurrently handed off to a business -- retry the request to get the winning result"
      );
    }

    await tx.startupExecutionPlan.update({
      where: { id: plan.id },
      data: { status: "COMPLETED" },
    });

    await emitAuditEvent({
      workspaceId,
      actorId,
      eventName: AUDIT_EVENTS.STARTUP_SESSION_HANDED_OFF_TO_BUSINESS,
      payload: { sessionId, businessId, ideaId: idea.id, executionPlanId: plan.id },
    }, tx);

    return { businessId, alreadyHandedOff: false };
  });
}
