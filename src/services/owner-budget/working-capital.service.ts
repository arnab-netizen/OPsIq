/* eslint-disable @typescript-eslint/no-explicit-any -- Prisma `db` proxy rows are untyped at the persistence boundary */
/**
 * Working-Capital Ageing service (Dynamic Budget ageing slice).
 *
 * Persists manual / import-ready receivable & payable line items (NOT a live feed),
 * and derives an ageing assessment for the Dynamic Budget reassessment flow. It does
 * NOT contain a second finance/reassessment engine — it loads items, runs the pure
 * `assessWorkingCapitalAgeing` engine, and returns inputs the existing plan composer
 * + capital-allocation already understand (ageing result, overdue payables as a cash
 * obligation, and a collection gap). All reads/writes are workspace-scoped.
 */
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { getBusiness } from "@/services/founder-recovery/business.service";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { netMarginPct } from "@/domain/owner-finance/metrics";
import { resolveLiquidity } from "@/domain/owner-finance/liquidity";
import type { FinancialSnapshotInput } from "@/domain/owner-finance/types";
import {
  assessWorkingCapitalAgeing,
  type WorkingCapitalAgeingResult,
  type WorkingCapitalLineItem,
} from "@/domain/owner-budget/working-capital-ageing";

export interface WorkingCapitalItemInput {
  kind: "receivable" | "payable";
  counterparty: string;
  amount: number;
  dueDate?: string | null;
  status?: string;
  sourceType?: string;
  sourceRef?: string | null;
}

/** Persist a manual / import-ready working-capital line item (workspace-scoped, audited). */
export async function recordWorkingCapitalItem(
  businessId: string,
  input: WorkingCapitalItemInput,
  actorId: string,
  workspaceId: string
) {
  await getBusiness(businessId, workspaceId); // ownership guard (throws if foreign)
  const id = randomUUID();
  const item = await db.ownerWorkingCapitalItem.create({
    data: {
      id, workspaceId, businessId,
      kind: input.kind,
      counterparty: input.counterparty,
      amount: input.amount,
      dueDate: input.dueDate ? new Date(input.dueDate) : null,
      status: input.status ?? "open",
      sourceType: input.sourceType ?? "MANUAL",
      sourceRef: input.sourceRef ?? null,
      confidenceState: "unverified", // manual/import data is never auto-verified
      createdBy: actorId,
      updatedAt: new Date(),
    },
  });
  await emitAuditEvent({
    eventName: AUDIT_EVENTS.OWNER_BUDGET_WORKING_CAPITAL_ITEM_RECORDED,
    actorId, workspaceId, entityType: "OwnerWorkingCapitalItem", entityId: id,
    payload: { businessId, kind: input.kind, amount: input.amount, sourceType: input.sourceType ?? "MANUAL" },
  });
  return item;
}

/** List working-capital items for a business (workspace-scoped; foreign workspace denied). */
export async function listWorkingCapitalItems(workspaceId: string, businessId: string) {
  await getBusiness(businessId, workspaceId);
  return db.ownerWorkingCapitalItem.findMany({
    where: { workspaceId, businessId },
    orderBy: { dueDate: "asc" },
  });
}

export interface AgeingForReassessment {
  ageing: WorkingCapitalAgeingResult;
  /** Overdue payables to feed the existing cash posture / allocation as a real obligation. */
  overduePayables: number;
  /** Collection gap inputs for the existing working-capital (gap-survival) engine. */
  collectionGapDays: number | null;
  pendingReceiptValue: number | null;
}

/**
 * Load working-capital items and derive an ageing assessment for reassessment.
 * Returns null when there are no items (no behaviour change for existing flows).
 */
export async function deriveAgeingForReassessment(
  workspaceId: string,
  businessId: string,
  finance: FinancialSnapshotInput,
  reserveRequired: number | null,
  asOf: Date
): Promise<AgeingForReassessment | null> {
  const rows = await db.ownerWorkingCapitalItem.findMany({ where: { workspaceId, businessId } });
  if (rows.length === 0) return null;

  const items: WorkingCapitalLineItem[] = rows.map((r: any) => ({
    kind: r.kind,
    amount: r.amount,
    dueDate: r.dueDate ?? null,
    counterparty: r.counterparty,
    status: r.status,
    sourceType: r.sourceType,
    updatedAt: r.updatedAt ?? null,
  }));

  const reserve = Math.max(0, reserveRequired ?? 0);
  const cash = resolveLiquidity(finance).totalLiquidFunds;
  const freeCashAfterReserve = cash === null ? null : cash - reserve;
  const margin = netMarginPct(finance);
  const netProfitable = margin === null ? null : margin > 0;

  const ageing = assessWorkingCapitalAgeing({ asOf, items, freeCashAfterReserve, netProfitable });

  // Pending (not-yet-due) receivables form the collection gap for the existing
  // gap-survival engine: the largest future due date is the gap horizon.
  const futureReceivables = rows.filter((r: any) => r.kind === "receivable" && r.dueDate && new Date(r.dueDate).getTime() > asOf.getTime());
  const pendingReceiptValue = futureReceivables.reduce((s: number, r: any) => s + Math.max(0, r.amount), 0) || null;
  const collectionGapDays = futureReceivables.length
    ? Math.max(...futureReceivables.map((r: any) => Math.ceil((new Date(r.dueDate).getTime() - asOf.getTime()) / 86_400_000)))
    : null;

  return { ageing, overduePayables: ageing.payablesOverdue, collectionGapDays, pendingReceiptValue };
}
