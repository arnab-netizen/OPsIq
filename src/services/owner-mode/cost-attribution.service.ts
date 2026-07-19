/**
 * Phase 4 — Cost Attribution service.
 *
 * Links BudgetLine and SpendEntry records to BusinessObjectives
 * via the new `linkedObjectiveId` nullable field.
 *
 * Build cost intelligence view from attributed entries.
 * Workspace isolation enforced via budget period ownership chain.
 * Audit events emitted atomically.
 */

import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { NotFoundError, ValidationError } from "@/infra/errors";
import { buildCostIntelligence, type CostEntry, type CostCategory } from "@/domain/owner-mode/cost-intelligence";
import type { Prisma } from "@/generated/prisma/client";

export async function attributeBudgetLineToObjective(
  workspaceId: string,
  actorId: string,
  budgetLineId: string,
  objectiveId: string,
) {
  // Verify objective belongs to workspace
  const objective = await db.businessObjective.findFirst({
    where: { id: objectiveId, workspaceId },
  });
  if (!objective) throw new NotFoundError("BusinessObjective", objectiveId);

  // Verify budget line belongs to workspace (via BudgetPeriod)
  const budgetLine = await db.budgetLine.findFirst({
    where: {
      id: budgetLineId,
      budgetPeriod: { workspaceId },
    },
  });
  if (!budgetLine) throw new NotFoundError("BudgetLine", budgetLineId);

  return db.$transaction(async (tx: Prisma.TransactionClient) => {
    const updated = await tx.budgetLine.update({
      where: { id: budgetLineId },
      data: { linkedObjectiveId: objectiveId },
    });

    await emitAuditEvent(
      {
        eventName: AUDIT_EVENTS.OWNER_COST_ATTRIBUTED_TO_OBJECTIVE,
        workspaceId,
        actorId,
        entityType: "BudgetLine",
        entityId: budgetLineId,
        payload: { objectiveId, linkedEntity: "BudgetLine" },
      },
      tx,
    );

    return updated;
  });
}

export async function attributeSpendEntryToObjective(
  workspaceId: string,
  actorId: string,
  spendEntryId: string,
  objectiveId: string,
) {
  const objective = await db.businessObjective.findFirst({
    where: { id: objectiveId, workspaceId },
  });
  if (!objective) throw new NotFoundError("BusinessObjective", objectiveId);

  // Verify spend entry belongs to workspace
  const spendEntry = await db.spendEntry.findFirst({
    where: {
      id: spendEntryId,
      workspaceId,
    },
  });
  if (!spendEntry) throw new NotFoundError("SpendEntry", spendEntryId);

  return db.$transaction(async (tx: Prisma.TransactionClient) => {
    const updated = await tx.spendEntry.update({
      where: { id: spendEntryId },
      data: { linkedObjectiveId: objectiveId },
    });

    await emitAuditEvent(
      {
        eventName: AUDIT_EVENTS.OWNER_COST_ATTRIBUTED_TO_OBJECTIVE,
        workspaceId,
        actorId,
        entityType: "SpendEntry",
        entityId: spendEntryId,
        payload: { objectiveId, linkedEntity: "SpendEntry" },
      },
      tx,
    );

    return updated;
  });
}

export async function buildWorkspaceCostIntelligence(workspaceId: string) {
  // Fetch all spend entries for the workspace
  const spendEntries = await db.spendEntry.findMany({
    where: { workspaceId },
    select: {
      id: true,
      amount: true,
      category: true,
      linkedObjectiveId: true,
      createdAt: true,
    },
  });

  const costEntries: CostEntry[] = spendEntries.map((e: (typeof spendEntries)[number]) => ({
    entryId: e.id,
    amount: typeof e.amount === "object" && "toNumber" in e.amount
      ? (e.amount as { toNumber: () => number }).toNumber()
      : Number(e.amount),
    category: (e.category as CostCategory | null) ?? "OTHER",
    linkedObjectiveId: e.linkedObjectiveId ?? null,
    recordedAt: e.createdAt.toISOString(),
    isVerified: false,
  }));

  return buildCostIntelligence(costEntries);
}

export async function removeObjectiveAttribution(
  workspaceId: string,
  actorId: string,
  entityType: "BudgetLine" | "SpendEntry",
  entityId: string,
) {
  if (entityType === "BudgetLine") {
    const line = await db.budgetLine.findFirst({
      where: { id: entityId, budgetPeriod: { workspaceId } },
    });
    if (!line) throw new NotFoundError("BudgetLine", entityId);
    if (!line.linkedObjectiveId) throw new ValidationError("BudgetLine has no linked objective");

    return db.budgetLine.update({
      where: { id: entityId },
      data: { linkedObjectiveId: null },
    });
  }

  const entry = await db.spendEntry.findFirst({
    where: { id: entityId, workspaceId },
  });
  if (!entry) throw new NotFoundError("SpendEntry", entityId);
  if (!entry.linkedObjectiveId) throw new ValidationError("SpendEntry has no linked objective");

  return db.spendEntry.update({
    where: { id: entityId },
    data: { linkedObjectiveId: null },
  });
}
