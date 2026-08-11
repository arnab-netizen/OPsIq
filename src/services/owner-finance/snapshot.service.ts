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
import type { FinancialSnapshotCreateInput } from "@/domain/owner-finance/validation";

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
    where: { businessId, periodStart, periodEnd },
    select: { id: true },
  });
  if (existing) {
    throw new ConflictError(
      "A financial snapshot for this business and reporting period already exists. Edit it instead of creating a duplicate."
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
  return db.ownerFinancialSnapshot.findMany({
    where: { businessId, workspaceId },
    orderBy: { periodEnd: "desc" },
  });
}
