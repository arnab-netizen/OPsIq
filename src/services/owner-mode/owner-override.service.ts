/**
 * Phase 4 — Owner Arbitration Override service.
 *
 * When an owner disagrees with the system's goal arbitration recommendation,
 * they may persist an explicit override that: (a) is stored separately from
 * the system GoalArbitrationRecord, (b) is always visible in the UI alongside
 * the system recommendation (not silently substituted for it), and (c) carries
 * a mandatory rationale field for audit trail.
 *
 * The model is append-only — each override is a new row. The "latest" override
 * for a given arbitration record is the most recently created one.
 *
 * Workspace isolation enforced. Audit event emitted atomically.
 */

import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { NotFoundError, ValidationError } from "@/infra/errors";
import type { Prisma } from "@/generated/prisma/client";

export type OverridePortfolioDecision =
  | "EXECUTE_NOW"
  | "DELAY"
  | "CANCEL"
  | "MERGE"
  | "SPLIT"
  | "ESCALATE";

const VALID_DECISIONS: OverridePortfolioDecision[] = [
  "EXECUTE_NOW", "DELAY", "CANCEL", "MERGE", "SPLIT", "ESCALATE",
];

function validateDecision(d: string): asserts d is OverridePortfolioDecision {
  if (!VALID_DECISIONS.includes(d as OverridePortfolioDecision)) {
    throw new ValidationError(
      `Invalid portfolio decision: ${d}. Must be one of ${VALID_DECISIONS.join(", ")}`,
    );
  }
}

export interface CreateArbitrationOverrideInput {
  workspaceId: string;
  actorId: string;
  overriddenRecordId: string;
  overrideObjectiveId?: string | null;
  overrideRationale: string;
  decision: OverridePortfolioDecision;
}

/**
 * Persist an owner arbitration override.
 *
 * Validates that the GoalArbitrationRecord exists in this workspace before
 * writing (workspace isolation). The override is stored as a separate record —
 * the original GoalArbitrationRecord is never mutated.
 */
export async function createArbitrationOverride(
  input: CreateArbitrationOverrideInput,
) {
  validateDecision(input.decision);

  if (input.overrideRationale.trim().length === 0) {
    throw new ValidationError("overrideRationale cannot be empty");
  }
  if (input.overrideRationale.trim().length < 10) {
    throw new ValidationError("overrideRationale must be at least 10 characters");
  }

  // Workspace isolation: verify the arbitration record belongs to this workspace
  const arbitrationRecord = await db.goalArbitrationRecord.findFirst({
    where: { id: input.overriddenRecordId, workspaceId: input.workspaceId },
    select: { id: true, winnerObjectiveId: true },
  });

  if (!arbitrationRecord) {
    throw new NotFoundError("GoalArbitrationRecord", input.overriddenRecordId);
  }

  return db.$transaction(async (tx: Prisma.TransactionClient) => {
    const override = await tx.ownerArbitrationOverride.create({
      data: {
        workspaceId: input.workspaceId,
        actorId: input.actorId,
        overriddenRecordId: input.overriddenRecordId,
        overrideObjectiveId: input.overrideObjectiveId ?? null,
        overrideRationale: input.overrideRationale.trim(),
        decision: input.decision,
      },
    });

    await emitAuditEvent(
      {
        eventName: AUDIT_EVENTS.OWNER_ARBITRATION_OVERRIDDEN,
        workspaceId: input.workspaceId,
        actorId: input.actorId,
        entityType: "OwnerArbitrationOverride",
        entityId: override.id,
        payload: {
          overriddenRecordId: input.overriddenRecordId,
          systemWinnerObjectiveId: arbitrationRecord.winnerObjectiveId,
          overrideObjectiveId: input.overrideObjectiveId ?? null,
          decision: input.decision,
          rationale: input.overrideRationale,
        },
      },
      tx,
    );

    return override;
  });
}

/**
 * Get the latest owner arbitration override for a given arbitration record.
 * Returns null if no override exists.
 */
export async function getLatestOverride(
  workspaceId: string,
  overriddenRecordId: string,
) {
  return db.ownerArbitrationOverride.findFirst({
    where: { workspaceId, overriddenRecordId },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * List all overrides for a workspace (newest first).
 * Useful for audit review and the Now View sidebar.
 */
export async function listOverrides(
  workspaceId: string,
  opts: { limit?: number } = {},
) {
  return db.ownerArbitrationOverride.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "desc" },
    take: opts.limit ?? 50,
  });
}
