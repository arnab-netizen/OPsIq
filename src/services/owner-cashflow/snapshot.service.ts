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

/** Who an audit event is attributed to: a user, or the system (integration) with no actor id. */
export interface CashflowWriteActor {
  actorId?: string;
  actorType?: "user" | "system";
}

/**
 * The transactional core of createCashflowSnapshot (cash-position lock, period check, DB-clock stamp, insert, audit) on the
 * CALLER's transaction client — extracted unchanged so an integration can create the row and its provenance atomically.
 * Input must already be validated by cashflowSnapshotCreateSchema.
 */
export async function createCashflowSnapshotInTx(
  tx: Prisma.TransactionClient,
  p: {
    businessId: string;
    workspaceId: string;
    input: CashflowSnapshotCreateInput;
    confidence: ReturnType<typeof calculateDataConfidence>;
    audit: CashflowWriteActor;
  },
) {
  const { businessId, workspaceId, input, confidence } = p;
  const periodStart = new Date(input.periodStart);
  const periodEnd = new Date(input.periodEnd);
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
      actorId: p.audit.actorId,
      actorType: p.audit.actorType,
      workspaceId,
      entityType: "OwnerCashflowSnapshot",
      entityId: snapshot.id,
      payload: { businessId, periodStart: input.periodStart, periodEnd: input.periodEnd },
    },
    tx,
  );
  return snapshot;
}

/** The figures an integration may refresh on a Cashflow row it controls (all others are untouched). */
export type IntegrationCashflowFigures = Partial<Record<"bankBalance" | "receivables" | "receivablesOverdue" | "payables" | "payablesOverdue", number | null>>;

export type IntegrationCashflowUpdateResult =
  | { ok: true; changed: boolean; snapshot: NonNullable<Awaited<ReturnType<typeof db.ownerCashflowSnapshot.findFirst>>>; changedFields: Record<string, { before: number | null; after: number | null }> }
  | { ok: false; reason: "NOT_FOUND" | "EDITED_SINCE" };

/**
 * Refresh integration-controlled figures of an existing Cashflow row IN PLACE, on the caller's transaction. Compare-and-set on
 * `expectedUpdatedAt`: if anyone (the owner) wrote the row since the integration last did, nothing is written and the caller
 * must treat the period as owner-controlled. Only the supplied figures change; a no-op writes nothing and emits no audit event.
 * The audit event records before/after per figure in the same transaction.
 */
export async function updateCashflowFiguresFromIntegrationInTx(
  tx: Prisma.TransactionClient,
  p: { snapshotId: string; workspaceId: string; expectedUpdatedAt: Date; figures: IntegrationCashflowFigures; audit: CashflowWriteActor; auditExtra?: Record<string, unknown> },
): Promise<IntegrationCashflowUpdateResult> {
  const owner = await tx.ownerCashflowSnapshot.findFirst({ where: { id: p.snapshotId, workspaceId: p.workspaceId }, select: { businessId: true } });
  if (!owner) return { ok: false, reason: "NOT_FOUND" };
  await lockCashPositionExclusive(tx, owner.businessId);
  const locked = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM owner_cashflow_snapshots
    WHERE id = ${p.snapshotId}::uuid AND workspace_id = ${p.workspaceId}::uuid
    FOR UPDATE
  `;
  if (locked.length === 0) return { ok: false, reason: "NOT_FOUND" };
  const current = await tx.ownerCashflowSnapshot.findFirst({ where: { id: p.snapshotId, workspaceId: p.workspaceId } });
  if (!current) return { ok: false, reason: "NOT_FOUND" };
  if (current.updatedAt.getTime() !== p.expectedUpdatedAt.getTime()) return { ok: false, reason: "EDITED_SINCE" };

  const changedFields: Record<string, { before: number | null; after: number | null }> = {};
  const data: Record<string, number | null> = {};
  // A number sets the figure; null returns it to UNKNOWN (the integration no longer supplies it). The row is integration-authored
  // here (the compare-and-set above proves nobody else wrote it), so a recorded value can only be the integration's own.
  for (const [field, after] of Object.entries(p.figures) as Array<[keyof IntegrationCashflowFigures, number | null]>) {
    const before = (current[field] as number | null) ?? null;
    if (after === null ? before === null : before !== null && Math.round(before * 100) === Math.round(after * 100)) continue;
    changedFields[field] = { before, after };
    data[field] = after;
  }
  if (Object.keys(changedFields).length === 0) return { ok: true, changed: false, snapshot: current, changedFields };

  const merged = { ...current, ...data };
  const confidence = calculateDataConfidence(rowToCashflowInput(merged));
  const nextUpdatedAt = new Date(Math.max((await databaseNow(tx)).getTime(), current.updatedAt.getTime() + 1));
  const written = await tx.ownerCashflowSnapshot.updateMany({
    where: { id: p.snapshotId, workspaceId: p.workspaceId, updatedAt: current.updatedAt },
    data: { ...data, dataConfidenceScore: confidence.dataConfidenceScore, missingCriticalData: confidence.missingCritical, updatedAt: nextUpdatedAt },
  });
  if (written.count !== 1) return { ok: false, reason: "EDITED_SINCE" };
  await emitAuditEvent(
    {
      eventName: AUDIT_EVENTS.CASHFLOW_SNAPSHOT_AMENDED,
      actorId: p.audit.actorId,
      actorType: p.audit.actorType,
      workspaceId: p.workspaceId,
      entityType: "OwnerCashflowSnapshot",
      entityId: p.snapshotId,
      payload: { snapshotId: p.snapshotId, businessId: current.businessId, changedFields, ...(p.auditExtra ?? {}) },
    },
    tx,
  );
  const snapshot = await tx.ownerCashflowSnapshot.findFirst({ where: { id: p.snapshotId, workspaceId: p.workspaceId } });
  if (!snapshot) return { ok: false, reason: "NOT_FOUND" };
  return { ok: true, changed: true, snapshot, changedFields };
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
    return await db.$transaction((tx: Prisma.TransactionClient) =>
      createCashflowSnapshotInTx(tx, { businessId, workspaceId, input, confidence, audit: { actorId } }),
    );
  } catch (error) {
    // A create that lost to another connection on the unique index is the same "entry exists" answer.
    if (isUniqueViolation(error)) throw await periodExistsConflict(workspaceId, businessId, periodStart, periodEnd);
    throw error;
  }
}

/** The Cashflow row of ONE exact period, on the caller's transaction (write-path guard for integrations; never selects current evidence). */
export async function findCashflowSnapshotForPeriodInTx(
  tx: Prisma.TransactionClient,
  scope: { workspaceId: string; businessId: string; periodStart: Date; periodEnd: Date },
) {
  return tx.ownerCashflowSnapshot.findFirst({
    where: { workspaceId: scope.workspaceId, businessId: scope.businessId, periodStart: scope.periodStart, periodEnd: scope.periodEnd },
  });
}

/** Recent Cashflow rows with their last-write stamp (to tell an integration-written row from an owner-edited one). Unordered; never selects current evidence. */
export async function listCashflowSnapshotPeriodStamps(workspaceId: string, businessId: string, since: Date) {
  return db.ownerCashflowSnapshot.findMany({
    where: { workspaceId, businessId, periodStart: { gte: since } },
    select: { id: true, periodStart: true, periodEnd: true, updatedAt: true },
  }) as Promise<Array<{ id: string; periodStart: Date; periodEnd: Date; updatedAt: Date }>>;
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
