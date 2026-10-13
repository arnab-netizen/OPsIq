/**
 * Owner Cashflow (Module 5) — cashflow snapshot service.
 *
 * Persists a validated cashflow snapshot for a business (workspace-scoped,
 * unique reporting period). Computes data-confidence + missing-critical-data
 * deterministically at persist time (never invented). Reuses Module 1's
 * OwnerBusiness ownership guard.
 */
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { NotFoundError } from "@/infra/errors";
import { CashflowConflictError } from "@/services/owner-cashflow/cashflow-conflict";
import { databaseNow, lockCashPositionExclusive } from "@/services/owner-cashflow/effective-cashflow.service";
import type { Prisma } from "@/generated/prisma/client";
import { getBusiness } from "@/services/founder-recovery/business.service";
import { calculateDataConfidence } from "@/domain/owner-cashflow/data-confidence";
import type { CashflowSnapshotInput } from "@/domain/owner-cashflow/types";
import type { CashflowSnapshotAmendInput, CashflowSnapshotCreateInput } from "@/domain/owner-cashflow/validation";
import {
  CASHFLOW_CONFLICT_CODES,
  CASHFLOW_PERIOD_EXISTS_MESSAGE,
  CASHFLOW_REPLACEMENT_MESSAGE,
  CASHFLOW_STALE_MESSAGE,
  planCashflowAmend,
  type CashflowFigures,
} from "@/domain/owner-cashflow/amend";
import { rowToCashflowInput } from "@/domain/owner-cashflow/row-input";

/** Map the validated API input to the engine input shape. */
export function toCashflowInput(input: CashflowSnapshotCreateInput): CashflowSnapshotInput {
  return {
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    currency: input.currency,
    businessModel: input.businessModel,
    industryTemplate: input.industryTemplate,
    cashInHand: input.cashInHand,
    bankBalance: input.bankBalance,
    dailyCollections: input.dailyCollections,
    receivables: input.receivables,
    receivablesOverdue: input.receivablesOverdue,
    payables: input.payables,
    payablesOverdue: input.payablesOverdue,
    upcomingEmi: input.upcomingEmi,
    rentDue: input.rentDue,
    salaryDue: input.salaryDue,
    vendorDue: input.vendorDue,
    taxDue: input.taxDue,
    ownerWithdrawal: input.ownerWithdrawal,
    notes: input.notes,
  };
}

export { rowToCashflowInput } from "@/domain/owner-cashflow/row-input";

function isUniqueViolation(error: unknown): boolean {
  const e = error as { code?: string; cause?: { code?: string } };
  return e?.code === "P2002" || e?.cause?.code === "23505";
}

async function periodExistsConflict(
  workspaceId: string,
  businessId: string,
  periodStart: Date,
  periodEnd: Date,
  client: Pick<Prisma.TransactionClient, "ownerCashflowSnapshot"> = db as unknown as Prisma.TransactionClient
): Promise<CashflowConflictError> {
  const existing = await client.ownerCashflowSnapshot.findFirst({
    where: { workspaceId, businessId, periodStart, periodEnd },
    select: { id: true, updatedAt: true },
  });
  const conflict = new CashflowConflictError(CASHFLOW_CONFLICT_CODES.PERIOD_EXISTS, CASHFLOW_PERIOD_EXISTS_MESSAGE, {
    snapshotId: existing?.id ?? null,
    updatedAt: existing ? existing.updatedAt.toISOString() : null,
  });
  return conflict;
}

export async function createCashflowSnapshot(
  businessId: string,
  input: CashflowSnapshotCreateInput,
  actorId: string,
  workspaceId: string
) {
  await getBusiness(businessId, workspaceId); // workspace ownership + existence

  const periodStart = new Date(input.periodStart);
  const periodEnd = new Date(input.periodEnd);

  const engineInput = toCashflowInput(input);
  const confidence = calculateDataConfidence(engineInput);

  try {
    // One transaction: the cash-position lock serialises this against every other Cashflow create/edit of the business
    // (and against "accept this read"), the period check and the insert see the same state, and the audit event is
    // written with the row or not at all. The unique (business, period) index remains the final guard.
    return await db.$transaction(async (tx: Prisma.TransactionClient) => {
      await lockCashPositionExclusive(tx, businessId);
      const existing = await tx.ownerCashflowSnapshot.findFirst({
        where: { workspaceId, businessId, periodStart, periodEnd },
        select: { id: true },
      });
      if (existing) throw await periodExistsConflict(workspaceId, businessId, periodStart, periodEnd, tx);

      // Stamped from the database clock INSIDE the exclusive lock (never the app clock, never the transaction start).
      const stampedAt = await databaseNow(tx);
      const snapshot = await tx.ownerCashflowSnapshot.create({
        data: {
          id: randomUUID(),
          createdAt: stampedAt,
          updatedAt: stampedAt,
          workspaceId,
          businessId,
          periodStart,
          periodEnd,
          currency: input.currency,
          businessModelType: input.businessModel ?? null,
          industryTemplate: input.industryTemplate ?? null,
          cashInHand: input.cashInHand ?? null,
          bankBalance: input.bankBalance ?? null,
          dailyCollections: input.dailyCollections ?? null,
          receivables: input.receivables ?? null,
          receivablesOverdue: input.receivablesOverdue ?? null,
          payables: input.payables ?? null,
          payablesOverdue: input.payablesOverdue ?? null,
          upcomingEmi: input.upcomingEmi ?? null,
          rentDue: input.rentDue ?? null,
          salaryDue: input.salaryDue ?? null,
          vendorDue: input.vendorDue ?? null,
          taxDue: input.taxDue ?? null,
          ownerWithdrawal: input.ownerWithdrawal ?? null,
          notes: input.notes ?? null,
          dataConfidenceScore: confidence.dataConfidenceScore,
          missingCriticalData: confidence.missingCritical,
        },
      });

      await emitAuditEvent(
        {
          eventName: AUDIT_EVENTS.OWNER_CASHFLOW_SNAPSHOT_RECORDED,
          actorId,
          workspaceId,
          entityType: "OwnerCashflowSnapshot",
          entityId: snapshot.id,
          payload: { businessId, periodStart: input.periodStart, periodEnd: input.periodEnd },
        },
        tx
      );
      return snapshot;
    });
  } catch (error) {
    // A create that lost to another connection on the unique index is the same "entry exists" answer.
    if (isUniqueViolation(error)) throw await periodExistsConflict(workspaceId, businessId, periodStart, periodEnd);
    throw error;
  }
}

export async function getCashflowSnapshot(snapshotId: string, workspaceId: string) {
  const snapshot = await db.ownerCashflowSnapshot.findFirst({
    where: { id: snapshotId, workspaceId },
  });
  if (!snapshot) throw new NotFoundError("OwnerCashflowSnapshot", snapshotId);
  return snapshot;
}

export async function listCashflowSnapshots(businessId: string, workspaceId: string) {
  await getBusiness(businessId, workspaceId);
  return db.ownerCashflowSnapshot.findMany({
    where: { businessId, workspaceId },
    orderBy: { periodEnd: "desc" },
  });
}

/** The figures an owner sees and edits (null = not recorded). */
function figuresOf(row: { bankBalance: number | null; cashInHand: number | null }): CashflowFigures {
  return { bankBalance: row.bankBalance ?? null, cashInHand: row.cashInHand ?? null };
}

export interface AmendCashflowResult {
  snapshot: NonNullable<Awaited<ReturnType<typeof db.ownerCashflowSnapshot.findFirst>>>;
  /** False when the request changed nothing: no write, no new `updatedAt`, no audit event. */
  changed: boolean;
  changedFields: Record<string, { before: number | null; after: number | null }>;
}

/**
 * Amend the bank balance and/or cash in hand of a recorded Cashflow entry, in place, with the period and currency
 * untouched (the body schema is strict, so neither can be sent).
 *
 * Concurrency: one transaction takes the row FOR UPDATE, so two concurrent amendments are serialised, then compares
 * `updatedAt` with the owner's `expectedUpdatedAt` (CASHFLOW_STALE) and writes with a compare-and-set on that same
 * `updatedAt`. Freshness and replacement consent are INDEPENDENT guards, checked in that order and each on its own:
 *   - a stale `expectedUpdatedAt` is refused even with `confirmReplace: true`;
 *   - a fresh `expectedUpdatedAt` does not authorise replacing a recorded value without `confirmReplace: true`.
 * Filling a previously-blank figure needs no confirmation. A request that changes nothing returns `changed:false`.
 * The audit event (before/after per changed field) is written in the SAME transaction as the change.
 * An unknown id and another workspace's id are the same NotFoundError.
 */
export async function amendCashflowSnapshot(
  snapshotId: string,
  input: CashflowSnapshotAmendInput,
  actorId: string,
  workspaceId: string
): Promise<AmendCashflowResult> {
  const expectedMs = new Date(input.expectedUpdatedAt).getTime();
  // Which business the entry belongs to (workspace-scoped: another workspace's id is indistinguishable from an unknown one).
  const owner = await db.ownerCashflowSnapshot.findFirst({ where: { id: snapshotId, workspaceId }, select: { businessId: true } });
  if (!owner) throw new NotFoundError("OwnerCashflowSnapshot", snapshotId);
  return db.$transaction(async (tx: Prisma.TransactionClient) => {
    // Cash-position lock first, then the row: the same order everywhere, so writers and "accept this read" cannot deadlock.
    await lockCashPositionExclusive(tx, owner.businessId);
    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM owner_cashflow_snapshots
      WHERE id = ${snapshotId}::uuid AND workspace_id = ${workspaceId}::uuid
      FOR UPDATE
    `;
    if (locked.length === 0) throw new NotFoundError("OwnerCashflowSnapshot", snapshotId);
    const current = await tx.ownerCashflowSnapshot.findFirst({ where: { id: snapshotId, workspaceId } });
    if (!current) throw new NotFoundError("OwnerCashflowSnapshot", snapshotId);

    const currentFigures = figuresOf(current);
    const currentView = { snapshotId, updatedAt: current.updatedAt.toISOString(), current: currentFigures };

    // 1. FRESHNESS — independent of consent.
    if (current.updatedAt.getTime() !== expectedMs) {
      throw new CashflowConflictError(CASHFLOW_CONFLICT_CODES.STALE, CASHFLOW_STALE_MESSAGE, currentView);
    }

    const plan = planCashflowAmend(currentFigures, { bankBalance: input.bankBalance, cashInHand: input.cashInHand });
    if (plan.noOp) return { snapshot: current, changed: false, changedFields: {} };

    // 2. REPLACEMENT CONSENT — independent of freshness.
    if (plan.needsConfirmation && input.confirmReplace !== true) {
      throw new CashflowConflictError(CASHFLOW_CONFLICT_CODES.REPLACEMENT_CONFIRMATION_REQUIRED, CASHFLOW_REPLACEMENT_MESSAGE, {
        ...currentView,
        proposed: Object.fromEntries(plan.changes.map((c) => [c.field, c.after])),
      });
    }

    const changedFields: AmendCashflowResult["changedFields"] = {};
    const data: Prisma.OwnerCashflowSnapshotUpdateManyMutationInput = {};
    for (const c of plan.changes) {
      changedFields[c.field] = { before: c.before, after: c.after };
      data[c.field] = c.after;
    }
    const merged = { ...current, ...Object.fromEntries(plan.changes.map((c) => [c.field, c.after])) };
    const confidence = calculateDataConfidence(rowToCashflowInput(merged));
    // Strictly later than the version the owner saw, so a stale holder of the old `updatedAt` can never match again.
    const nextUpdatedAt = new Date(Math.max((await databaseNow(tx)).getTime(), current.updatedAt.getTime() + 1));

    const written = await tx.ownerCashflowSnapshot.updateMany({
      where: { id: snapshotId, workspaceId, updatedAt: current.updatedAt },
      data: {
        ...data,
        dataConfidenceScore: confidence.dataConfidenceScore,
        missingCriticalData: confidence.missingCritical,
        updatedAt: nextUpdatedAt,
      },
    });
    if (written.count !== 1) throw new CashflowConflictError(CASHFLOW_CONFLICT_CODES.STALE, CASHFLOW_STALE_MESSAGE, currentView);

    await emitAuditEvent(
      {
        eventName: AUDIT_EVENTS.CASHFLOW_SNAPSHOT_AMENDED,
        actorId,
        workspaceId,
        entityType: "OwnerCashflowSnapshot",
        entityId: snapshotId,
        payload: { snapshotId, businessId: current.businessId, changedFields },
      },
      tx
    );

    const snapshot = await tx.ownerCashflowSnapshot.findFirst({ where: { id: snapshotId, workspaceId } });
    if (!snapshot) throw new NotFoundError("OwnerCashflowSnapshot", snapshotId);
    return { snapshot, changed: true, changedFields };
  });
}
