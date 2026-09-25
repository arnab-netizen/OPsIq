/* eslint-disable @typescript-eslint/no-explicit-any -- Prisma `db` proxy returns untyped rows; explicit any is pragmatic here */
/**
 * Owner Finance (Module 2) — financial snapshot service.
 *
 * Persists a validated financial snapshot for a business (workspace-scoped,
 * unique reporting period). Computes data-confidence + missing-critical-data
 * deterministically at persist time (never invented). Reuses Module 1's
 * OwnerBusiness ownership guard.
 */
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { ConflictError, NotFoundError } from "@/infra/errors";
import { getBusiness } from "@/services/founder-recovery/business.service";
import { calculateDataConfidence } from "@/domain/owner-finance/data-confidence";
import type { FinancialSnapshotInput } from "@/domain/owner-finance/types";
import type { FinancialSnapshotCreateInput, FinancialSnapshotAmendInput } from "@/domain/owner-finance/validation";

/** Map the validated API input to the engine input shape (refund/rework/complaint merged). */
export function toFinanceInput(input: FinancialSnapshotCreateInput): FinancialSnapshotInput {
  const refundReworkComplaint = [input.refundAmount, input.reworkCost, input.complaintCost]
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  const refundMerged =
    refundReworkComplaint.length > 0 ? refundReworkComplaint.reduce((s, v) => s + v, 0) : undefined;
  return {
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    currency: input.currency,
    businessModel: input.businessModel,
    industryTemplate: input.industryTemplate,
    revenue: input.revenue,
    b2cRevenue: input.b2cRevenue,
    b2bRevenue: input.b2bRevenue,
    costOfGoodsOrServices: input.costOfGoodsOrServices,
    fixedCosts: input.fixedCosts,
    variableCosts: input.variableCosts,
    rent: input.rent,
    salaryPayroll: input.salaryPayroll,
    utilities: input.utilities,
    deliveryFulfilmentCost: input.deliveryFulfilmentCost,
    marketingSpend: input.marketingSpend,
    discountAmount: input.discountAmount,
    refundAmount: refundMerged,
    loanEmiDebtPayments: input.loanEmiDebtPayments,
    totalDebtOutstanding: input.totalDebtOutstanding,
    cashOnHand: input.cashOnHand,
    receivables: input.receivables,
    receivablesOverdue: input.receivablesOverdue,
    payables: input.payables,
    payablesOverdue: input.payablesOverdue,
    ownerWithdrawals: input.ownerWithdrawals,
    inventoryStockCashLock: input.inventoryStockCashLock,
    orderCount: input.orderCount,
    customerCount: input.customerCount,
    notes: input.notes,
  };
}

/** Map a persisted snapshot row back to the engine input shape. */
export function rowToFinanceInput(row: any): FinancialSnapshotInput {
  return {
    periodStart: row.periodStart instanceof Date ? row.periodStart.toISOString() : row.periodStart,
    periodEnd: row.periodEnd instanceof Date ? row.periodEnd.toISOString() : row.periodEnd,
    currency: row.currency,
    businessModel: row.businessModelType ?? undefined,
    industryTemplate: row.industryTemplate ?? undefined,
    revenue: row.revenue ?? undefined,
    b2cRevenue: row.b2cRevenue ?? undefined,
    b2bRevenue: row.b2bRevenue ?? undefined,
    costOfGoodsOrServices: row.costOfGoods ?? undefined,
    fixedCosts: row.fixedCosts ?? undefined,
    variableCosts: row.variableCosts ?? undefined,
    rent: row.rent ?? undefined,
    salaryPayroll: row.payroll ?? undefined,
    utilities: row.utilities ?? undefined,
    deliveryFulfilmentCost: row.deliveryCost ?? undefined,
    marketingSpend: row.marketingSpend ?? undefined,
    discountAmount: row.discountAmount ?? undefined,
    refundAmount: row.refundReworkCost ?? undefined,
    loanEmiDebtPayments: row.debtPayments ?? undefined,
    totalDebtOutstanding: row.totalDebtOutstanding ?? undefined,
    cashOnHand: row.cashOnHand ?? undefined,
    receivables: row.receivables ?? undefined,
    receivablesOverdue: row.overdueReceivables ?? undefined,
    payables: row.payables ?? undefined,
    payablesOverdue: row.overduePayables ?? undefined,
    ownerWithdrawals: row.ownerWithdrawals ?? undefined,
    inventoryStockCashLock: row.inventoryCashLock ?? undefined,
    orderCount: row.orderCount ?? undefined,
    customerCount: row.customerCount ?? undefined,
    notes: row.notes ?? undefined,
  };
}

export async function createFinancialSnapshot(
  businessId: string,
  input: FinancialSnapshotCreateInput,
  actorId: string,
  workspaceId: string
) {
  await getBusiness(businessId, workspaceId); // workspace ownership + existence

  const periodStart = new Date(input.periodStart);
  const periodEnd = new Date(input.periodEnd);

  const existing = await db.ownerFinancialSnapshot.findFirst({
    where: { businessId, periodStart, periodEnd, supersededById: null },
    select: { id: true },
  });
  if (existing) {
    throw new ConflictError(
      "A financial snapshot for this business and reporting period already exists. Amend it instead of creating a duplicate."
    );
  }

  const engineInput = toFinanceInput(input);
  const refundReworkComplaint = [input.refundAmount, input.reworkCost, input.complaintCost]
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  const confidence = calculateDataConfidence(engineInput);

  // D3-03: snapshot create and audit in a single transaction so an audit
  // failure prevents a partially-recorded snapshot with no audit trail.
  const snapshot = await db.$transaction(async (tx: Prisma.TransactionClient) => {
    const created = await tx.ownerFinancialSnapshot.create({
      data: {
        id: randomUUID(),
        workspaceId,
        businessId,
        periodStart,
        periodEnd,
        currency: input.currency,
        businessModelType: input.businessModel ?? null,
        industryTemplate: input.industryTemplate ?? null,
        revenue: input.revenue ?? null,
        costOfGoods: input.costOfGoodsOrServices ?? null,
        fixedCosts: input.fixedCosts ?? null,
        variableCosts: input.variableCosts ?? null,
        rent: input.rent ?? null,
        payroll: input.salaryPayroll ?? null,
        utilities: input.utilities ?? null,
        deliveryCost: input.deliveryFulfilmentCost ?? null,
        marketingSpend: input.marketingSpend ?? null,
        discountAmount: input.discountAmount ?? null,
        refundReworkCost: refundReworkComplaint.length > 0 ? refundReworkComplaint.reduce((s, v) => s + v, 0) : null,
        debtPayments: input.loanEmiDebtPayments ?? null,
        totalDebtOutstanding: input.totalDebtOutstanding ?? null,
        cashOnHand: input.cashOnHand ?? null,
        receivables: input.receivables ?? null,
        overdueReceivables: input.receivablesOverdue ?? null,
        payables: input.payables ?? null,
        overduePayables: input.payablesOverdue ?? null,
        ownerWithdrawals: input.ownerWithdrawals ?? null,
        inventoryCashLock: input.inventoryStockCashLock ?? null,
        orderCount: input.orderCount ?? null,
        customerCount: input.customerCount ?? null,
        repeatCustomerCount: input.repeatCustomerCount ?? null,
        b2bRevenue: input.b2bRevenue ?? null,
        b2cRevenue: input.b2cRevenue ?? null,
        notes: input.notes ?? null,
        dataConfidenceScore: confidence.dataConfidenceScore,
        missingCriticalData: confidence.missingCritical,
      },
    });

    await emitAuditEvent({
      eventName: AUDIT_EVENTS.OWNER_FINANCE_SNAPSHOT_RECORDED,
      actorId,
      workspaceId,
      entityType: "OwnerFinancialSnapshot",
      entityId: created.id,
      payload: { businessId, periodStart: input.periodStart, periodEnd: input.periodEnd },
    }, tx);

    return created;
  });

  return snapshot;
}

export async function getFinancialSnapshot(snapshotId: string, workspaceId: string) {
  const snapshot = await db.ownerFinancialSnapshot.findFirst({
    where: { id: snapshotId, workspaceId },
  });
  if (!snapshot) throw new NotFoundError("OwnerFinancialSnapshot", snapshotId);
  return snapshot;
}

export async function listFinancialSnapshots(businessId: string, workspaceId: string) {
  await getBusiness(businessId, workspaceId);
  // Return only current (non-superseded) versions — amended snapshots are visible by their new ID
  return db.ownerFinancialSnapshot.findMany({
    where: { businessId, workspaceId, supersededById: null },
    orderBy: { periodEnd: "desc" },
  });
}

/**
 * Walk the supersession chain forward from a given snapshot ID to find the
 * current (non-superseded) version. Returns the original ID if not superseded.
 * Follows the chain to its head however many amendments exist (a fixed hop cap
 * returned a still-superseded version once a snapshot had been amended more than
 * 20 times, so retracted values were treated as current). A cycle or a dangling
 * link is data corruption and fails closed rather than returning a superseded id.
 */
export async function resolveCurrentSnapshotId(originalId: string): Promise<string> {
  const visited = new Set<string>();
  let id = originalId;
  for (;;) {
    if (visited.has(id)) {
      throw new Error("Financial snapshot supersession chain is cyclic (data corruption).");
    }
    visited.add(id);
    const row = await db.ownerFinancialSnapshot.findFirst({
      where: { id },
      select: { id: true, supersededById: true },
    });
    if (!row) {
      if (id === originalId) return id;
      throw new Error("Financial snapshot supersession chain has a dangling link (data corruption).");
    }
    if (!row.supersededById) return id;
    id = row.supersededById;
  }
}

/**
 * Amend a financial snapshot by creating a new version with corrected/added fields.
 * The original row is preserved and marked superseded (supersededById = newId).
 * Uses SELECT FOR UPDATE to prevent concurrent amendments from branching the chain.
 * Recomputes dataConfidenceScore and missingCriticalData from the merged field set.
 */
export async function amendFinancialSnapshot(
  snapshotId: string,
  input: FinancialSnapshotAmendInput,
  actorId: string,
  workspaceId: string
): Promise<{ snapshot: Awaited<ReturnType<typeof db.ownerFinancialSnapshot.findFirst>>; previousSnapshotId: string }> {
  const newId = randomUUID();

  const amended = await db.$transaction(async (tx: Prisma.TransactionClient) => {
    // Lock the row — prevents concurrent amendments from branching the version chain
    const guard = await tx.$queryRaw<
      Array<{ id: string; version: number; superseded_by_id: string | null; workspace_id: string }>
    >`
      SELECT id, version, superseded_by_id, workspace_id
      FROM owner_financial_snapshots
      WHERE id = ${snapshotId}
      FOR UPDATE
    `;
    if (guard.length === 0) throw new NotFoundError("OwnerFinancialSnapshot", snapshotId);
    const g = guard[0];

    if (g.workspace_id !== workspaceId) throw new NotFoundError("OwnerFinancialSnapshot", snapshotId);

    if (g.superseded_by_id !== null) {
      throw new ConflictError(
        `Snapshot ${snapshotId} has already been superseded by ${g.superseded_by_id}. Amend the latest version instead.`
      );
    }

    // Read full row within the same transaction (row is already locked)
    const current = await tx.ownerFinancialSnapshot.findFirst({ where: { id: snapshotId } });
    if (!current) throw new NotFoundError("OwnerFinancialSnapshot", snapshotId);

    // Compute refundReworkCost: amendment input uses refundAmount as the merged value
    const refundReworkCost = input.refundAmount !== undefined ? input.refundAmount ?? null : current.refundReworkCost;

    // Build merged row for confidence recomputation
    const mergedRow = {
      periodStart: current.periodStart,
      periodEnd: current.periodEnd,
      currency: current.currency,
      businessModelType: current.businessModelType,
      industryTemplate: current.industryTemplate,
      revenue: input.revenue ?? current.revenue,
      costOfGoods: input.costOfGoodsOrServices ?? current.costOfGoods,
      fixedCosts: input.fixedCosts ?? current.fixedCosts,
      variableCosts: input.variableCosts ?? current.variableCosts,
      rent: input.rent ?? current.rent,
      payroll: input.salaryPayroll ?? current.payroll,
      utilities: input.utilities ?? current.utilities,
      deliveryCost: input.deliveryFulfilmentCost ?? current.deliveryCost,
      marketingSpend: input.marketingSpend ?? current.marketingSpend,
      discountAmount: input.discountAmount ?? current.discountAmount,
      refundReworkCost,
      debtPayments: input.loanEmiDebtPayments ?? current.debtPayments,
      totalDebtOutstanding: input.totalDebtOutstanding ?? current.totalDebtOutstanding,
      cashOnHand: input.cashOnHand ?? current.cashOnHand,
      receivables: input.receivables ?? current.receivables,
      overdueReceivables: input.receivablesOverdue ?? current.overdueReceivables,
      payables: input.payables ?? current.payables,
      overduePayables: input.payablesOverdue ?? current.overduePayables,
      ownerWithdrawals: input.ownerWithdrawals ?? current.ownerWithdrawals,
      inventoryCashLock: input.inventoryStockCashLock ?? current.inventoryCashLock,
      orderCount: input.orderCount ?? current.orderCount,
      customerCount: input.customerCount ?? current.customerCount,
      notes: input.notes ?? current.notes,
    };
    const engineInput = rowToFinanceInput(mergedRow);
    const confidence = calculateDataConfidence(engineInput);

    // Track which fields are being added/corrected for provenance
    const changedFields: string[] = [];
    const fieldMap: Array<[keyof FinancialSnapshotAmendInput, unknown]> = [
      ["revenue", input.revenue], ["b2cRevenue", input.b2cRevenue], ["b2bRevenue", input.b2bRevenue],
      ["costOfGoodsOrServices", input.costOfGoodsOrServices], ["fixedCosts", input.fixedCosts],
      ["variableCosts", input.variableCosts], ["rent", input.rent], ["salaryPayroll", input.salaryPayroll],
      ["utilities", input.utilities], ["deliveryFulfilmentCost", input.deliveryFulfilmentCost],
      ["marketingSpend", input.marketingSpend], ["discountAmount", input.discountAmount],
      ["refundAmount", input.refundAmount], ["loanEmiDebtPayments", input.loanEmiDebtPayments],
      ["totalDebtOutstanding", input.totalDebtOutstanding], ["cashOnHand", input.cashOnHand],
      ["receivables", input.receivables], ["receivablesOverdue", input.receivablesOverdue],
      ["payables", input.payables], ["payablesOverdue", input.payablesOverdue],
      ["ownerWithdrawals", input.ownerWithdrawals], ["inventoryStockCashLock", input.inventoryStockCashLock],
      ["orderCount", input.orderCount], ["customerCount", input.customerCount],
      ["repeatCustomerCount", input.repeatCustomerCount], ["notes", input.notes],
    ];
    for (const [key, val] of fieldMap) {
      if (val !== undefined) changedFields.push(key);
    }

    const created = await tx.ownerFinancialSnapshot.create({
      data: {
        id: newId,
        workspaceId,
        businessId: current.businessId,
        periodStart: current.periodStart,
        periodEnd: current.periodEnd,
        currency: current.currency,
        businessModelType: current.businessModelType,
        industryTemplate: current.industryTemplate,
        revenue: mergedRow.revenue ?? null,
        costOfGoods: mergedRow.costOfGoods ?? null,
        fixedCosts: mergedRow.fixedCosts ?? null,
        variableCosts: mergedRow.variableCosts ?? null,
        rent: mergedRow.rent ?? null,
        payroll: mergedRow.payroll ?? null,
        utilities: mergedRow.utilities ?? null,
        deliveryCost: mergedRow.deliveryCost ?? null,
        marketingSpend: mergedRow.marketingSpend ?? null,
        discountAmount: mergedRow.discountAmount ?? null,
        refundReworkCost: mergedRow.refundReworkCost ?? null,
        debtPayments: mergedRow.debtPayments ?? null,
        totalDebtOutstanding: mergedRow.totalDebtOutstanding ?? null,
        cashOnHand: mergedRow.cashOnHand ?? null,
        receivables: mergedRow.receivables ?? null,
        overdueReceivables: mergedRow.overdueReceivables ?? null,
        payables: mergedRow.payables ?? null,
        overduePayables: mergedRow.overduePayables ?? null,
        ownerWithdrawals: mergedRow.ownerWithdrawals ?? null,
        inventoryCashLock: mergedRow.inventoryCashLock ?? null,
        orderCount: mergedRow.orderCount ?? null,
        customerCount: mergedRow.customerCount ?? null,
        repeatCustomerCount: input.repeatCustomerCount ?? current.repeatCustomerCount ?? null,
        b2bRevenue: input.b2bRevenue ?? current.b2bRevenue ?? null,
        b2cRevenue: input.b2cRevenue ?? current.b2cRevenue ?? null,
        notes: mergedRow.notes ?? null,
        dataConfidenceScore: confidence.dataConfidenceScore,
        missingCriticalData: confidence.missingCritical as object,
        version: g.version + 1,
        supersededById: null,
        amendmentReason: input.amendmentReason,
        changedFields: changedFields as unknown as object,
        amendedByActorId: actorId,
      },
    });

    // Stamp old version as superseded (the only mutation to the original row)
    await tx.ownerFinancialSnapshot.update({
      where: { id: snapshotId },
      data: { supersededById: newId },
    });

    await emitAuditEvent(
      {
        eventName: AUDIT_EVENTS.OWNER_FINANCE_SNAPSHOT_AMENDED,
        actorId,
        workspaceId,
        entityType: "OwnerFinancialSnapshot",
        entityId: created.id,
        payload: {
          previousSnapshotId: snapshotId,
          businessId: current.businessId,
          periodStart: current.periodStart.toISOString(),
          periodEnd: current.periodEnd.toISOString(),
          version: created.version,
          changedFields,
          amendmentReason: input.amendmentReason,
        },
      },
      tx
    );

    return created;
  });

  return { snapshot: amended, previousSnapshotId: snapshotId };
}
