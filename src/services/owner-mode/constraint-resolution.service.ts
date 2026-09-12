/**
 * Phase 4 — Constraint Resolution service.
 *
 * Persists ConstraintResolutionRecord rows from the stateless constraint-engine.
 * Lifecycle: ACTIVE → ACCEPTED | RESOLVED.
 * Workspace isolation enforced. Audit events emitted atomically.
 */

import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { NotFoundError, ValidationError } from "@/infra/errors";
import type { ConstraintType } from "@/domain/owner-mode/constraint-engine";
import type { Prisma } from "@/generated/prisma/client";
import { getFixtureTaintedStartupSessionIds } from "@/services/owner-strategy/startup-session.service";

export type ConstraintStatus = "ACTIVE" | "ACCEPTED" | "RESOLVED";

export interface CreateConstraintResolutionInput {
  workspaceId: string;
  actorId: string;
  constraintType: ConstraintType;
  constraintSource: "INTERNAL" | "EXTERNAL";
  title: string;
  bindingScore: number; // 0..1
  remediationAction?: string | null;
  linkedObjectiveId?: string | null;
}

export interface UpdateConstraintStatusInput {
  workspaceId: string;
  recordId: string;
  actorId: string;
  status: "ACCEPTED" | "RESOLVED";
  remediationAction?: string | null;
}

export async function createConstraintRecord(input: CreateConstraintResolutionInput) {
  if (input.title.trim().length === 0) {
    throw new ValidationError("title cannot be empty");
  }
  if (input.bindingScore < 0 || input.bindingScore > 1) {
    throw new ValidationError("bindingScore must be between 0 and 1");
  }

  return db.$transaction(async (tx: Prisma.TransactionClient) => {
    const record = await tx.constraintResolutionRecord.create({
      data: {
        workspaceId: input.workspaceId,
        constraintType: input.constraintType,
        constraintSource: input.constraintSource,
        title: input.title.trim(),
        bindingScore: input.bindingScore,
        remediationAction: input.remediationAction ?? null,
        status: "ACTIVE",
        linkedObjectiveId: input.linkedObjectiveId ?? null,
      },
    });

    await emitAuditEvent(
      {
        eventName: AUDIT_EVENTS.OWNER_CONSTRAINT_IDENTIFIED,
        workspaceId: input.workspaceId,
        actorId: input.actorId,
        entityType: "ConstraintResolutionRecord",
        entityId: record.id,
        payload: {
          constraintType: input.constraintType,
          constraintSource: input.constraintSource,
          bindingScore: input.bindingScore,
        },
      },
      tx,
    );

    return record;
  });
}

export async function updateConstraintStatus(input: UpdateConstraintStatusInput) {
  const existing = await db.constraintResolutionRecord.findFirst({
    where: { id: input.recordId, workspaceId: input.workspaceId },
  });
  if (!existing) throw new NotFoundError("ConstraintResolutionRecord", input.recordId);

  if (existing.status !== "ACTIVE") {
    throw new ValidationError(`Constraint is already ${existing.status}`);
  }

  return db.$transaction(async (tx: Prisma.TransactionClient) => {
    const updated = await tx.constraintResolutionRecord.update({
      where: { id: input.recordId },
      data: {
        status: input.status,
        resolvedAt: input.status === "RESOLVED" ? new Date() : null,
        ...(input.remediationAction !== undefined ? { remediationAction: input.remediationAction } : {}),
      },
    });

    const eventName =
      input.status === "RESOLVED"
        ? AUDIT_EVENTS.OWNER_CONSTRAINT_RESOLVED
        : AUDIT_EVENTS.OWNER_CONSTRAINT_ACCEPTED;

    await emitAuditEvent(
      {
        eventName,
        workspaceId: input.workspaceId,
        actorId: input.actorId,
        entityType: "ConstraintResolutionRecord",
        entityId: input.recordId,
        payload: { constraintType: existing.constraintType, status: input.status },
      },
      tx,
    );

    return updated;
  });
}

export async function listActiveConstraints(workspaceId: string) {
  // Read-time correction for historical rows whose isFixtureRecord was incorrectly persisted as
  // false (createBlueprint()'s write-time gap, now fixed) — excludes any constraint linked to a
  // startup session that is itself, or is handed off to a business that is, isFixtureBusiness:
  // true. Never touches stored data. See getFixtureTaintedStartupSessionIds() doc comment.
  const fixtureTaintedSessionIds = await getFixtureTaintedStartupSessionIds(workspaceId);
  const fixtureSessionExclusion =
    fixtureTaintedSessionIds.length > 0
      ? { OR: [{ linkedStartupSessionId: null }, { linkedStartupSessionId: { notIn: fixtureTaintedSessionIds } }] }
      : {};

  return db.constraintResolutionRecord.findMany({
    where: {
      workspaceId,
      status: "ACTIVE",
      // isFixtureRecord: false excludes acceptance/QA fixture constraints (see
      // ACCEPTANCE_FIXTURE_ISOLATION_PLAN.md) — an ordinary owner's constraint list must never
      // include a constraint a QA blueprint run created.
      isFixtureRecord: false,
      ...fixtureSessionExclusion,
    },
    orderBy: [{ bindingScore: "desc" }, { identifiedAt: "asc" }],
  });
}

export async function getConstraintRecord(workspaceId: string, recordId: string) {
  const record = await db.constraintResolutionRecord.findFirst({
    where: { id: recordId, workspaceId },
  });
  if (!record) throw new NotFoundError("ConstraintResolutionRecord", recordId);
  return record;
}
