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
import { NotFoundError, ValidationError } from "@/infra/errors";
import { FINANCE_CONFLICT_CODES } from "@/domain/owner-finance/snapshot-conflict";
import { FinanceConflictError } from "./finance-conflict";
import { findFinanceContradictions } from "@/domain/owner-finance/validation";
import { getBusiness } from "@/services/founder-recovery/business.service";
import { calculateDataConfidence } from "@/domain/owner-finance/data-confidence";
import type { FinancialSnapshotInput } from "@/domain/owner-finance/types";
import type { CashSemantics } from "@/domain/owner-finance/liquidity";
import { isEvidenceQuality, provenanceOf, resolveAmendedEvidenceQuality } from "@/domain/owner-finance/evidence-quality";
import { qboSourcedFinancialSnapshotIds } from "@/services/quickbooks/qbo-provenance.service";
import { LEAKAGE_COMPONENT_CONTRACT_V1, leakageColumns, resolveAmendedLeakage } from "./leakage-components";
import type { FinancialSnapshotCreateInput, FinancialSnapshotAmendInput } from "@/domain/owner-finance/validation";

/** True when an amendment changes any numeric figure — setting one or returning one to UNKNOWN (notes, reason and quality alone are not numbers). */
function amendChangesNumbers(input: FinancialSnapshotAmendInput): boolean {
  return Object.entries(input).some(([k, v]) => k !== "amendmentReason" && k !== "notes" && k !== "evidenceQuality" && (typeof v === "number" || v === null));
}

/** Amend merge: omitted keeps the recorded value; a number sets it; null returns it to UNKNOWN. Never `??`, which cannot clear. */
function mergeAmended<T>(incoming: T | null | undefined, recorded: T | null | undefined): T | null {
  return incoming === undefined ? recorded ?? null : incoming;
}

/** Map the validated API input to the engine input shape (refund / rework / complaint stay separate; omitted = UNKNOWN). */
export function toFinanceInput(input: FinancialSnapshotCreateInput): FinancialSnapshotInput {
  return {
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    currency: input.currency,
    evidenceQuality: input.evidenceQuality ?? null,
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
    refundAmount: input.refundAmount,
    reworkCost: input.reworkCost,
    complaintCost: input.complaintCost,
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

/**
 * Map a persisted snapshot row back to the engine input shape.
 * `cashSemantics` is the meaning of the row's `cashOnHand`, resolved through the amendment lineage by
 * `loadFinanceEngineInput` (liquidity.service.ts). A bare row has no lineage context, so the fallback is
 * the conservative LEGACY_AMBIGUOUS: bank is never added on top of a value that may already include it.
 */
export function rowToFinanceInput(row: any, cashSemantics: CashSemantics = "LEGACY_AMBIGUOUS"): FinancialSnapshotInput {
  return {
    periodStart: row.periodStart instanceof Date ? row.periodStart.toISOString() : row.periodStart,
    periodEnd: row.periodEnd instanceof Date ? row.periodEnd.toISOString() : row.periodEnd,
    currency: row.currency,
    evidenceQuality: isEvidenceQuality(row.evidenceQuality) ? row.evidenceQuality : null,
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
    // Component-aware row: the three components are authoritative and independently known/unknown. Legacy row (marker absent,
    // or any marker this code does not know): ONLY the combined figure exists; it is carried as an explicitly ambiguous
    // lower-bound amount and is NEVER attributed to a component (the components stay UNKNOWN).
    ...(row.leakageCompVersion === LEAKAGE_COMPONENT_CONTRACT_V1
      ? {
          refundAmount: row.refundAmount ?? undefined,
          reworkCost: row.reworkCost ?? undefined,
          complaintCost: row.complaintCost ?? undefined,
        }
      : { legacyCombinedLeakage: row.refundReworkCost ?? undefined }),
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
    // Which meaning of cashOnHand the row carries (physical-only vs pre-#586 "cash and bank").
    cashSemantics,
  };
}

/**
 * Every version of ONE Finance snapshot (the rows sharing a workspace, business and period) with only the
 * fields cash-lineage resolution needs. Workspace + business scoped; a read of the model by its own
 * service, used to resolve how `cashOnHand` should be read through amendments.
 */
export async function listFinancialSnapshotVersions(
  workspaceId: string,
  businessId: string,
  periodStart: Date,
  periodEnd: Date
) {
  return db.ownerFinancialSnapshot.findMany({
    where: { workspaceId, businessId, periodStart, periodEnd },
    select: { id: true, version: true, supersededById: true, createdAt: true, cashOnHand: true, changedFields: true },
  });
}

const PERIOD_EXISTS_MESSAGE =
  "A financial snapshot for this business and reporting period already exists. Amend it instead of creating a duplicate.";

/** Who an audit event is attributed to: a user, or the system (scheduler / integration) with no actor id. */
export interface FinanceWriteActor {
  actorId?: string;
  actorType?: "user" | "system";
}

/**
 * The transactional core of createFinancialSnapshot: advisory period lock, race re-check, insert and audit, all on the CALLER's
 * transaction client. Extracted unchanged so integrations (QuickBooks materialization) can create a canonical snapshot and
 * their own provenance row atomically. Input is expected to be already validated by financialSnapshotCreateSchema.
 */
export async function createFinancialSnapshotInTx(
  tx: Prisma.TransactionClient,
  p: {
    businessId: string;
    workspaceId: string;
    input: FinancialSnapshotCreateInput;
    currency: string;
    confidence: ReturnType<typeof calculateDataConfidence>;
    audit: FinanceWriteActor;
    auditExtra?: Record<string, unknown>;
  },
) {
  const { businessId, workspaceId, input, confidence } = p;
  const periodStart = new Date(input.periodStart);
  const periodEnd = new Date(input.periodEnd);
  // Two simultaneous submits for the same period (double click, second tab, client retry) serialise on this lock, so the
  // loser sees the winner's row and gets the same 409 as a sequential duplicate — never a unique-constraint 500.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`owner_financial_snapshot:${businessId}:${periodStart.toISOString()}:${periodEnd.toISOString()}`}))`;
  const raced = await tx.ownerFinancialSnapshot.findFirst({
    where: { businessId, periodStart, periodEnd, supersededById: null },
    select: { id: true },
  });
  if (raced) {
    throw new FinanceConflictError(FINANCE_CONFLICT_CODES.PERIOD_EXISTS, PERIOD_EXISTS_MESSAGE, { snapshotId: raced.id });
  }
  const created = await tx.ownerFinancialSnapshot.create({
    data: {
      id: randomUUID(),
      workspaceId,
      businessId,
      periodStart,
      periodEnd,
      currency: p.currency,
      evidenceQuality: input.evidenceQuality ?? null,
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
      ...leakageColumns(input),
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
    actorId: p.audit.actorId,
    actorType: p.audit.actorType,
    workspaceId,
    entityType: "OwnerFinancialSnapshot",
    entityId: created.id,
    payload: { businessId, periodStart: input.periodStart, periodEnd: input.periodEnd, ...(p.auditExtra ?? {}) },
  }, tx);

  return created;
}

export async function createFinancialSnapshot(
  businessId: string,
  input: FinancialSnapshotCreateInput,
  actorId: string,
  workspaceId: string
) {
  const business = await getBusiness(businessId, workspaceId); // workspace ownership + existence

  // The snapshot's currency IS the business's currency: a different or malformed code would silently mislabel every
  // figure on the read (the client always sends the business currency; the API must hold the same line).
  if (input.currency.trim().toUpperCase() !== String(business.currency).toUpperCase()) {
    throw new ValidationError("These figures must be in the same currency as your business.", {
      fieldErrors: [{ path: "currency", message: "Must match the business currency" }],
    });
  }

  const periodStart = new Date(input.periodStart);
  const periodEnd = new Date(input.periodEnd);

  const existing = await db.ownerFinancialSnapshot.findFirst({
    where: { businessId, periodStart, periodEnd, supersededById: null },
    select: { id: true },
  });
  if (existing) {
    throw new FinanceConflictError(FINANCE_CONFLICT_CODES.PERIOD_EXISTS, PERIOD_EXISTS_MESSAGE, { snapshotId: existing.id });
  }

  const engineInput = toFinanceInput(input);
  const confidence = calculateDataConfidence(engineInput);

  // D3-03: snapshot create and audit in a single transaction so an audit
  // failure prevents a partially-recorded snapshot with no audit trail.
  const snapshot = await db.$transaction((tx: Prisma.TransactionClient) =>
    createFinancialSnapshotInTx(tx, { businessId, workspaceId, input, currency: String(business.currency).toUpperCase(), confidence, audit: { actorId } })
  );

  return snapshot;
}

/**
 * The CURRENT (un-superseded) version of ONE exact period, on the caller's transaction. A write-path guard for integrations that
 * must decide create-vs-amend under the per-period advisory lock — it is keyed by the exact period, so it never selects "the
 * current evidence" (that is currentEffectiveFinancialSnapshotQuery's job).
 */
export async function findCurrentFinancialSnapshotForPeriodInTx(
  tx: Prisma.TransactionClient,
  scope: { workspaceId: string; businessId: string; periodStart: Date; periodEnd: Date },
) {
  return tx.ownerFinancialSnapshot.findFirst({
    where: { workspaceId: scope.workspaceId, businessId: scope.businessId, periodStart: scope.periodStart, periodEnd: scope.periodEnd, supersededById: null },
  });
}

/**
 * Ids of current Finance versions whose period overlaps (but is not identical to) the given period — QuickBooks uses it so a
 * calendar-month import never becomes "newer evidence" next to an owner-entered quarter, year-to-date or custom range.
 */
export async function listOverlappingCurrentFinancialSnapshotIdsInTx(
  tx: Prisma.TransactionClient,
  scope: { workspaceId: string; businessId: string; periodStart: Date; periodEnd: Date },
): Promise<string[]> {
  const rows = await tx.ownerFinancialSnapshot.findMany({
    where: {
      workspaceId: scope.workspaceId, businessId: scope.businessId, supersededById: null,
      periodStart: { lte: scope.periodEnd }, periodEnd: { gte: scope.periodStart },
      NOT: { periodStart: scope.periodStart, periodEnd: scope.periodEnd },
    },
    select: { id: true },
  });
  return rows.map((r: { id: string }) => r.id);
}

/**
 * Which recent periods hold a current Finance version, and who authored it (QuickBooks vs the owner) — for the QuickBooks
 * connection status. A per-period listing, unordered: it never answers "which snapshot is current" (that is the selector's job).
 */
export async function listFinancialSnapshotPeriodSources(workspaceId: string, businessId: string, since: Date) {
  const rows = await db.ownerFinancialSnapshot.findMany({
    where: { workspaceId, businessId, supersededById: null, periodStart: { gte: since } },
    select: { id: true, periodStart: true, periodEnd: true },
  });
  const qbo = await qboSourcedFinancialSnapshotIds(workspaceId, businessId, rows.map((r: { id: string }) => r.id));
  return rows.map((r: { id: string; periodStart: Date; periodEnd: Date }) => ({
    periodStart: r.periodStart, periodEnd: r.periodEnd, source: qbo.has(r.id) ? ("QUICKBOOKS" as const) : ("MANUAL" as const),
  }));
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
  // HISTORICAL LIST: every current (non-superseded) version, newest period first — amended snapshots
  // are visible by their new ID. Deterministic order (same tie-break as the current-effective selector);
  // "the current snapshot" is never taken from this list (currentEffectiveFinancialSnapshotQuery).
  const rows = await db.ownerFinancialSnapshot.findMany({
    where: { businessId, workspaceId, supersededById: null },
    orderBy: [{ periodEnd: "desc" }, { createdAt: "desc" }, { id: "desc" }],
  });
  // Where each current version came from: QuickBooks (a provenance row points at exactly this version) or the owner.
  const qbo = await qboSourcedFinancialSnapshotIds(workspaceId, businessId, rows.map((r: { id: string }) => r.id));
  return rows.map((r: { id: string }) => ({ ...r, source: qbo.has(r.id) ? ("QUICKBOOKS" as const) : ("MANUAL" as const) }));
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
 * Share-lock one snapshot row (workspace + business scoped) and report whether it is still un-superseded. Amendment takes
 * the same row FOR UPDATE, so a caller that holds this lock inside its own transaction and then commits is serialised
 * against any concurrent amendment: either the amendment committed first (this returns false) or it waits for the caller.
 * Used by compare-at-write checks ("the evidence this decision was made on is still current").
 */
export async function lockUnsupersededFinancialSnapshotShared(
  tx: Prisma.TransactionClient, workspaceId: string, businessId: string, snapshotId: string,
): Promise<boolean> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM owner_financial_snapshots
    WHERE id = ${snapshotId} AND workspace_id = ${workspaceId} AND business_id = ${businessId} AND superseded_by_id IS NULL
    FOR SHARE
  `;
  return rows.length > 0;
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
  const amended = await db.$transaction((tx: Prisma.TransactionClient) =>
    amendFinancialSnapshotInTx(tx, snapshotId, input, { actorId }, workspaceId),
  );
  return { snapshot: amended, previousSnapshotId: snapshotId };
}

/**
 * The transactional core of amendFinancialSnapshot (row lock, merge, contradiction check, new version, supersession, audit) on
 * the CALLER's transaction client — extracted unchanged so integrations can amend a canonical snapshot and write their own
 * provenance row atomically. Input must already be validated by financialSnapshotAmendSchema.
 */
export async function amendFinancialSnapshotInTx(
  tx: Prisma.TransactionClient,
  snapshotId: string,
  input: FinancialSnapshotAmendInput,
  actor: FinanceWriteActor,
  workspaceId: string,
) {
  const newId = randomUUID();
  const actorId = actor.actorId;
  {
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
      throw new FinanceConflictError(
        FINANCE_CONFLICT_CODES.SUPERSEDED,
        `Snapshot ${snapshotId} has already been superseded by ${g.superseded_by_id}. Amend the latest version instead.`,
        { currentSnapshotId: g.superseded_by_id }
      );
    }

    // Read full row within the same transaction (row is already locked)
    const current = await tx.ownerFinancialSnapshot.findFirst({ where: { id: snapshotId } });
    if (!current) throw new NotFoundError("OwnerFinancialSnapshot", snapshotId);

    // Leakage components: merged per component (never as one combined number); a legacy row is never promoted to complete.
    const leakage = resolveAmendedLeakage(current, input);

    // Build merged row for confidence recomputation
    const mergedRow = {
      periodStart: current.periodStart,
      periodEnd: current.periodEnd,
      currency: current.currency,
      evidenceQuality: resolveAmendedEvidenceQuality(current.evidenceQuality, input.evidenceQuality, amendChangesNumbers(input)),
      businessModelType: current.businessModelType,
      industryTemplate: current.industryTemplate,
      revenue: mergeAmended(input.revenue, current.revenue),
      costOfGoods: mergeAmended(input.costOfGoodsOrServices, current.costOfGoods),
      fixedCosts: mergeAmended(input.fixedCosts, current.fixedCosts),
      variableCosts: mergeAmended(input.variableCosts, current.variableCosts),
      rent: mergeAmended(input.rent, current.rent),
      payroll: mergeAmended(input.salaryPayroll, current.payroll),
      utilities: mergeAmended(input.utilities, current.utilities),
      deliveryCost: mergeAmended(input.deliveryFulfilmentCost, current.deliveryCost),
      marketingSpend: mergeAmended(input.marketingSpend, current.marketingSpend),
      discountAmount: mergeAmended(input.discountAmount, current.discountAmount),
      refundReworkCost: leakage.refundReworkCost,
      refundAmount: leakage.refundAmount,
      reworkCost: leakage.reworkCost,
      complaintCost: leakage.complaintCost,
      leakageCompVersion: leakage.leakageCompVersion,
      debtPayments: mergeAmended(input.loanEmiDebtPayments, current.debtPayments),
      totalDebtOutstanding: mergeAmended(input.totalDebtOutstanding, current.totalDebtOutstanding),
      cashOnHand: mergeAmended(input.cashOnHand, current.cashOnHand),
      receivables: mergeAmended(input.receivables, current.receivables),
      overdueReceivables: mergeAmended(input.receivablesOverdue, current.overdueReceivables),
      payables: mergeAmended(input.payables, current.payables),
      overduePayables: mergeAmended(input.payablesOverdue, current.overduePayables),
      ownerWithdrawals: mergeAmended(input.ownerWithdrawals, current.ownerWithdrawals),
      inventoryCashLock: mergeAmended(input.inventoryStockCashLock, current.inventoryCashLock),
      orderCount: mergeAmended(input.orderCount, current.orderCount),
      customerCount: mergeAmended(input.customerCount, current.customerCount),
      notes: input.notes ?? current.notes,
    };
    // A correction must not introduce a contradiction the original entry would have been refused for (merged values).
    // Only contradictions this amendment INTRODUCES are refused: a record that already held one (entered before these checks
    // existed) must stay correctable on any other field.
    const figures = (r: { revenue?: unknown; b2cRevenue?: unknown; b2bRevenue?: unknown; rent?: unknown; payroll?: unknown; utilities?: unknown; fixedCosts?: unknown; receivables?: unknown; overdueReceivables?: unknown; payables?: unknown; overduePayables?: unknown; customerCount?: unknown; repeatCustomerCount?: unknown }) => ({
      revenue: r.revenue, b2cRevenue: r.b2cRevenue, b2bRevenue: r.b2bRevenue, rent: r.rent, salaryPayroll: r.payroll, utilities: r.utilities, fixedCosts: r.fixedCosts,
      receivables: r.receivables, receivablesOverdue: r.overdueReceivables, payables: r.payables, payablesOverdue: r.overduePayables,
      customerCount: r.customerCount, repeatCustomerCount: r.repeatCustomerCount,
    }) as Record<string, number | null | undefined>;
    const before = new Set(findFinanceContradictions(figures(current)).map((c) => `${c.path}|${c.message}`));
    const contradictions = findFinanceContradictions(
      figures({ ...mergedRow, b2cRevenue: mergeAmended(input.b2cRevenue, current.b2cRevenue), b2bRevenue: mergeAmended(input.b2bRevenue, current.b2bRevenue), repeatCustomerCount: mergeAmended(input.repeatCustomerCount, current.repeatCustomerCount) }),
    ).filter((c) => !before.has(`${c.path}|${c.message}`));
    if (contradictions.length > 0) {
      throw new ValidationError("Some of these figures contradict each other", { fieldErrors: contradictions.map((c) => ({ path: c.path, message: c.message })) });
    }
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
      ["refundAmount", input.refundAmount], ["reworkCost", input.reworkCost], ["complaintCost", input.complaintCost], ["loanEmiDebtPayments", input.loanEmiDebtPayments],
      ["totalDebtOutstanding", input.totalDebtOutstanding], ["cashOnHand", input.cashOnHand],
      ["receivables", input.receivables], ["receivablesOverdue", input.receivablesOverdue],
      ["payables", input.payables], ["payablesOverdue", input.payablesOverdue],
      ["ownerWithdrawals", input.ownerWithdrawals], ["inventoryStockCashLock", input.inventoryStockCashLock],
      ["orderCount", input.orderCount], ["customerCount", input.customerCount],
      ["repeatCustomerCount", input.repeatCustomerCount], ["notes", input.notes],
    ];
    // Fields returned to UNKNOWN (null) are recorded separately so the audit trail can tell "cleared" from "replaced".
    const clearedFields: string[] = [];
    for (const [key, val] of fieldMap) {
      if (val !== undefined) changedFields.push(key);
      if (val === null) clearedFields.push(key);
    }
    // Provenance can move WITHOUT being passed (changed numbers step ACTUAL down to GOOD_ESTIMATE). Any change is
    // recorded, with before/after, in the snapshot's own lineage (changedFields) and in the amendment audit event.
    const qualityBefore = provenanceOf(current.evidenceQuality);
    const qualityAfter = provenanceOf(mergedRow.evidenceQuality);
    // Only a real change is recorded: restating the same quality is not a change of provenance.
    if (qualityBefore !== qualityAfter) changedFields.push("evidenceQuality");

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
        refundAmount: mergedRow.refundAmount ?? null,
        reworkCost: mergedRow.reworkCost ?? null,
        complaintCost: mergedRow.complaintCost ?? null,
        leakageCompVersion: mergedRow.leakageCompVersion ?? null,
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
        repeatCustomerCount: mergeAmended(input.repeatCustomerCount, current.repeatCustomerCount),
        b2bRevenue: mergeAmended(input.b2bRevenue, current.b2bRevenue),
        b2cRevenue: mergeAmended(input.b2cRevenue, current.b2cRevenue),
        notes: mergedRow.notes ?? null,
        evidenceQuality: mergedRow.evidenceQuality,
        dataConfidenceScore: confidence.dataConfidenceScore,
        missingCriticalData: confidence.missingCritical as object,
        version: g.version + 1,
        supersededById: null,
        amendmentReason: input.amendmentReason,
        changedFields: changedFields as unknown as object,
        amendedByActorId: actorId ?? null,
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
        actorType: actor.actorType,
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
          clearedFields,
          amendmentReason: input.amendmentReason,
          // A legacy combined figure replaced by an explicit three-way split: the superseded value is recorded here (and stays
          // in the previous, immutable version), never silently dropped.
          ...(leakage.upgradedFromLegacy ? { leakageContractUpgraded: true, legacyCombinedLeakageSuperseded: current.refundReworkCost ?? null } : {}),
          evidenceQualityBefore: qualityBefore,
          evidenceQualityAfter: qualityAfter,
        },
      },
      tx
    );

    return created;
  }
}
