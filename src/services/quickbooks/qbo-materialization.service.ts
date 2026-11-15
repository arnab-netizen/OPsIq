/**
 * QuickBooks Online V1 — governed materialization of QuickBooks evidence into OpsIQ's canonical Finance / Cashflow snapshots.
 *
 * This module supplies EVIDENCE only. It never runs a diagnosis (the owner re-runs analysis; OpsIQ's existing
 * "newer figures exist" detection marks the previous analysis out of date), and it never bypasses the existing snapshot
 * services: creation and amendment go through the very same transactional cores manual entry uses
 * (createFinancialSnapshotInTx / amendFinancialSnapshotInTx / createCashflowSnapshotInTx), so validation, contradiction
 * checks, data-confidence scoring, versioning/supersession and audit are identical.
 *
 * SOURCE PRECEDENCE (frozen V1 policy)
 *   - Owner-authored period (a snapshot with no QuickBooks provenance) .......... owner wins; QuickBooks never touches it.
 *   - Empty period ............................................................ QuickBooks creates the canonical snapshot.
 *   - QuickBooks-controlled period (CURRENT version has provenance) ............ a changed QuickBooks figure AMENDS it through
 *       the normal versioning path (old version kept, superseded); unchanged figures write nothing.
 *   - Owner amends a QuickBooks-derived Finance period ......................... that amendment is a NEW version with no
 *       provenance, so the period is owner-controlled from then on: control is derived from the data, not from a mutable flag.
 *   - Cashflow rows are updated in place by the existing amend path, so control is a compare-and-set on `updatedAt` against the
 *       stamp recorded in the latest provenance row: any owner write since breaks the match and the period stays the owner's.
 *   - A period whose provenance came from a DIFFERENT QuickBooks company is never overwritten by this one (REALM_MISMATCH).
 *
 * ATOMICITY: each canonical write and its provenance row commit in ONE transaction (the DB also forbids provenance that
 * crosses workspace/business/connection/realm, and Sandbox evidence into a real business, or production evidence into a fixture).
 *
 * CURRENCY / BASIS: no conversion, no mixing — see deriveMonthlyFigures.
 */
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { ValidationError } from "@/infra/errors";
import { calculateDataConfidence } from "@/domain/owner-finance/data-confidence";
import { financialSnapshotAmendSchema, financialSnapshotCreateSchema } from "@/domain/owner-finance/validation";
import { cashflowSnapshotCreateSchema } from "@/domain/owner-cashflow/validation";
import { calculateDataConfidence as calculateCashflowConfidence } from "@/domain/owner-cashflow/data-confidence";
import { CashflowConflictError } from "@/services/owner-cashflow/cashflow-conflict";
import { amendFinancialSnapshotInTx, createFinancialSnapshotInTx, findCurrentFinancialSnapshotForPeriodInTx, listOverlappingCurrentFinancialSnapshotIdsInTx, toFinanceInput } from "@/services/owner-finance/snapshot.service";
import { createCashflowSnapshotInTx, findCashflowSnapshotForPeriodInTx, toCashflowInput, updateCashflowFiguresFromIntegrationInTx } from "@/services/owner-cashflow/snapshot.service";
import { deriveMonthlyFigures, figuresDiffer, type DerivedFigures, type QboMaterializationRefusal } from "@/domain/quickbooks/qbo-derivation";
import {
  fromIsoDate,
  isClosedMonth,
  type MonthPeriod,
  type QboAccountingBasis,
} from "@/domain/quickbooks/qbo-report-model";
import { loadMonthObservations, type QboConnectionIdentity } from "./qbo-observation.service";

type Tx = Prisma.TransactionClient;

export type TargetResult =
  | { result: "CREATED" | "AMENDED" | "UPDATED"; snapshotId: string }
  | { result: "UNCHANGED" }
  | { result: "OWNER_CONTROLLED" }
  | { result: "REFUSED"; refusal: QboMaterializationRefusal };

export interface MaterializeMonthResult {
  month: string;
  finance: TargetResult;
  cashflow: TargetResult;
}

export interface MaterializeDeps {
  client?: typeof db;
  now?: () => Date;
}

const SYSTEM = { actorType: "system" as const };

function isoPeriod(m: MonthPeriod) {
  return { periodStart: m.start, periodEnd: m.end };
}

async function insertProvenance(
  tx: Tx,
  p: {
    connection: QboConnectionIdentity;
    month: MonthPeriod;
    targetType: "FINANCIAL_SNAPSHOT" | "CASHFLOW_SNAPSHOT";
    financialSnapshotId?: string;
    cashflowSnapshotId?: string;
    action: "CREATED" | "AMENDED" | "UPDATED";
    figures: DerivedFigures;
    targetUpdatedAt: Date | null;
    now: Date;
  },
): Promise<void> {
  const c = p.connection;
  const ids = p.figures.observationIds;
  await tx.qboCanonicalProvenance.create({
    data: {
      id: randomUUID(),
      workspaceId: c.workspaceId,
      businessId: c.businessId,
      connectionId: c.id,
      environment: c.environment,
      realmId: c.realmId,
      targetType: p.targetType,
      financialSnapshotId: p.financialSnapshotId ?? null,
      cashflowSnapshotId: p.cashflowSnapshotId ?? null,
      periodStart: fromIsoDate(p.month.start),
      periodEnd: fromIsoDate(p.month.end),
      action: p.action,
      accountingBasis: p.figures.basis,
      currency: p.figures.currency,
      plObservationId: ids.pl,
      bsObservationId: ids.bs,
      arObservationId: ids.ar,
      apObservationId: ids.ap,
      derivedValues: { finance: p.figures.finance, cashflow: p.figures.cashflow, omitted: p.figures.omitted } as unknown as Prisma.InputJsonValue,
      targetUpdatedAt: p.targetUpdatedAt,
      materializedAt: p.now,
    },
  });
}

async function auditMaterialized(
  tx: Tx,
  p: { connection: QboConnectionIdentity; month: MonthPeriod; target: string; entityId: string; action: string; changed: string[] },
): Promise<void> {
  await emitAuditEvent(
    {
      eventName: AUDIT_EVENTS.QBO_CANONICAL_MATERIALIZED,
      workspaceId: p.connection.workspaceId,
      actorType: "system",
      entityType: p.target,
      entityId: p.entityId,
      visibility: "internal",
      payload: {
        businessId: p.connection.businessId,
        connectionId: p.connection.id,
        environment: p.connection.environment,
        periodStart: p.month.start,
        periodEnd: p.month.end,
        action: p.action,
        changedFigures: p.changed,
      },
    },
    tx,
  );
}

/**
 * Share-lock the connection row and confirm it is still ACTIVE inside the canonical transaction. A disconnect (an UPDATE of this
 * row) serialises against it: either the disconnect committed first and nothing is written, or the write commits first. So a sync
 * that was already running when the owner disconnected cannot add canonical evidence afterwards.
 */
async function connectionStillActive(tx: Tx, c: QboConnectionIdentity): Promise<boolean> {
  const rows = await tx.$queryRaw<Array<{ status: string }>>`
    SELECT status FROM qbo_connections WHERE id = ${c.id}::uuid AND workspace_id = ${c.workspaceId}::uuid FOR SHARE`;
  return rows[0]?.status === "ACTIVE";
}

/** Differing connection/realm between the connection being synced and the one that produced the current canonical row. */
function foreignOrigin(prov: { connectionId: string; environment: string; realmId: string }, c: QboConnectionIdentity): boolean {
  return prov.realmId !== c.realmId || prov.environment !== c.environment || prov.connectionId !== c.id;
}

async function materializeFinance(
  client: typeof db,
  c: QboConnectionIdentity,
  month: MonthPeriod,
  figures: DerivedFigures,
  businessCurrency: string,
  now: Date,
): Promise<TargetResult> {
  const f = figures.finance;
  const candidate = {
    revenue: f.revenue, costOfGoods: f.costOfGoods, receivables: f.receivables,
    overdueReceivables: f.overdueReceivables, payables: f.payables, overduePayables: f.overduePayables,
  };
  const nothingSupplied = Object.values(candidate).every((v) => v === null);
  const { periodStart, periodEnd } = isoPeriod(month);
  const start = fromIsoDate(month.start);
  const end = fromIsoDate(month.end);

  try {
    return await client.$transaction(async (tx: Tx): Promise<TargetResult> => {
      if (!(await connectionStillActive(tx, c))) return { result: "REFUSED", refusal: "CONNECTION_NOT_ACTIVE" };
      // The same advisory key the manual create path uses, so a manual entry and a QuickBooks write for one period serialise.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`owner_financial_snapshot:${c.businessId}:${start.toISOString()}:${end.toISOString()}`}))`;
      const current = await findCurrentFinancialSnapshotForPeriodInTx(tx, { workspaceId: c.workspaceId, businessId: c.businessId, periodStart: start, periodEnd: end });

      if (!current) {
        if (nothingSupplied) return { result: "UNCHANGED" };
        // An owner-entered period that overlaps this month (a quarter, year-to-date, custom range) stays the owner's evidence.
        const overlapping = await listOverlappingCurrentFinancialSnapshotIdsInTx(tx, { workspaceId: c.workspaceId, businessId: c.businessId, periodStart: start, periodEnd: end });
        if (overlapping.length > 0) {
          const sourced = await tx.qboCanonicalProvenance.findMany({
            where: { workspaceId: c.workspaceId, financialSnapshotId: { in: overlapping } },
            select: { financialSnapshotId: true },
          });
          const sourcedIds = new Set((sourced as Array<{ financialSnapshotId: string | null }>).map((p) => p.financialSnapshotId));
          if (overlapping.some((id) => !sourcedIds.has(id))) return { result: "OWNER_CONTROLLED" };
        }
        const parsed = financialSnapshotCreateSchema.safeParse({
          periodStart, periodEnd, currency: businessCurrency, evidenceQuality: "ACTUAL",
          revenue: f.revenue ?? undefined, costOfGoodsOrServices: f.costOfGoods ?? undefined,
          receivables: f.receivables ?? undefined, receivablesOverdue: f.overdueReceivables ?? undefined,
          payables: f.payables ?? undefined, payablesOverdue: f.overduePayables ?? undefined,
          notes: "Imported from QuickBooks Online.",
        });
        if (!parsed.success) return { result: "REFUSED", refusal: "FINANCE_VALIDATION_REFUSED" };
        const confidence = calculateDataConfidence(toFinanceInput(parsed.data));
        const created = await createFinancialSnapshotInTx(tx, {
          businessId: c.businessId, workspaceId: c.workspaceId, input: parsed.data, currency: businessCurrency, confidence,
          audit: SYSTEM, auditExtra: { source: "QUICKBOOKS_ONLINE", connectionId: c.id },
        });
        await insertProvenance(tx, { connection: c, month, targetType: "FINANCIAL_SNAPSHOT", financialSnapshotId: created.id, action: "CREATED", figures, targetUpdatedAt: null, now });
        await auditMaterialized(tx, { connection: c, month, target: "OwnerFinancialSnapshot", entityId: created.id, action: "CREATED", changed: Object.entries(candidate).filter(([, v]) => v !== null).map(([k]) => k) });
        return { result: "CREATED", snapshotId: created.id };
      }

      const prov = await tx.qboCanonicalProvenance.findFirst({
        where: { workspaceId: c.workspaceId, financialSnapshotId: current.id },
        orderBy: { materializedAt: "desc" },
      });
      if (!prov) return { result: "OWNER_CONTROLLED" };
      if (foreignOrigin(prov, c)) return { result: "REFUSED", refusal: "REALM_MISMATCH" };

      const changed: string[] = [];
      const amend: Record<string, number | null> = {};
      const cmp: Array<[string, number | null | undefined, number | null, string]> = [
        ["revenue", current.revenue, f.revenue, "revenue"],
        ["costOfGoods", current.costOfGoods, f.costOfGoods, "costOfGoodsOrServices"],
        ["receivables", current.receivables, f.receivables, "receivables"],
        ["overdueReceivables", current.overdueReceivables, f.overdueReceivables, "receivablesOverdue"],
        ["payables", current.payables, f.payables, "payables"],
        ["overduePayables", current.overduePayables, f.overduePayables, "payablesOverdue"],
      ];
      const amendPatch: Record<string, number | null> = {};
      for (const [name, recorded, incoming, inputKey] of cmp) {
        if (incoming !== null && figuresDiffer(recorded, incoming)) {
          changed.push(name);
          amendPatch[inputKey] = incoming;
        } else if (incoming === null && recorded !== null && recorded !== undefined) {
          // This version is QuickBooks-authored (it has provenance), so every recorded value among these six figures came from a
          // QuickBooks read. The newest read no longer supplies it (absent section, ambiguous, or not derivable): it returns to
          // UNKNOWN. A stated 0 is a number and never takes this branch. Carrying it forward would present a stale figure under
          // the newest observation's provenance.
          changed.push(`${name}:withdrawn`);
          amendPatch[inputKey] = null;
        }
      }
      Object.assign(amend, amendPatch);
      if (changed.length === 0) return { result: "UNCHANGED" };

      const input = financialSnapshotAmendSchema.safeParse({
        amendmentReason: "Updated from QuickBooks Online: the books for this closed month changed.",
        evidenceQuality: "ACTUAL",
        ...amend,
      });
      if (!input.success) return { result: "REFUSED", refusal: "FINANCE_VALIDATION_REFUSED" };
      const created = await amendFinancialSnapshotInTx(tx, current.id, input.data, SYSTEM, c.workspaceId);
      await insertProvenance(tx, { connection: c, month, targetType: "FINANCIAL_SNAPSHOT", financialSnapshotId: created.id, action: "AMENDED", figures, targetUpdatedAt: null, now });
      await auditMaterialized(tx, { connection: c, month, target: "OwnerFinancialSnapshot", entityId: created.id, action: "AMENDED", changed });
      return { result: "AMENDED", snapshotId: created.id };
    }, { timeout: 30_000 });
  } catch (e) {
    // A contradiction among the merged figures is a domain refusal (nothing was written); anything else is a real fault.
    if (e instanceof ValidationError) return { result: "REFUSED", refusal: "FINANCE_VALIDATION_REFUSED" };
    throw e;
  }
}

async function materializeCashflow(
  client: typeof db,
  c: QboConnectionIdentity,
  month: MonthPeriod,
  figures: DerivedFigures,
  businessCurrency: string,
  now: Date,
): Promise<TargetResult> {
  const f = figures.cashflow;
  const present = Object.fromEntries(Object.entries(f).filter(([, v]) => v !== null)) as Record<string, number>;
  const start = fromIsoDate(month.start);
  const end = fromIsoDate(month.end);

  try {
    return await client.$transaction(async (tx: Tx): Promise<TargetResult> => {
      if (!(await connectionStillActive(tx, c))) return { result: "REFUSED", refusal: "CONNECTION_NOT_ACTIVE" };
      const existing = await findCashflowSnapshotForPeriodInTx(tx, { workspaceId: c.workspaceId, businessId: c.businessId, periodStart: start, periodEnd: end });

      if (!existing) {
        if (Object.keys(present).length === 0) return { result: "UNCHANGED" };
        const parsed = cashflowSnapshotCreateSchema.safeParse({
          periodStart: month.start, periodEnd: month.end, currency: businessCurrency,
          bankBalance: f.bankBalance ?? undefined, receivables: f.receivables ?? undefined,
          receivablesOverdue: f.receivablesOverdue ?? undefined, payables: f.payables ?? undefined,
          payablesOverdue: f.payablesOverdue ?? undefined, notes: "Imported from QuickBooks Online.",
        });
        if (!parsed.success) return { result: "REFUSED", refusal: "FINANCE_VALIDATION_REFUSED" };
        const confidence = calculateCashflowConfidence(toCashflowInput(parsed.data));
        const created = await createCashflowSnapshotInTx(tx, { businessId: c.businessId, workspaceId: c.workspaceId, input: parsed.data, confidence, audit: SYSTEM });
        await insertProvenance(tx, { connection: c, month, targetType: "CASHFLOW_SNAPSHOT", cashflowSnapshotId: created.id, action: "CREATED", figures, targetUpdatedAt: created.updatedAt, now });
        await auditMaterialized(tx, { connection: c, month, target: "OwnerCashflowSnapshot", entityId: created.id, action: "CREATED", changed: Object.keys(present) });
        return { result: "CREATED", snapshotId: created.id };
      }

      const prov = await tx.qboCanonicalProvenance.findFirst({
        where: { workspaceId: c.workspaceId, cashflowSnapshotId: existing.id },
        orderBy: { materializedAt: "desc" },
      });
      if (!prov || !prov.targetUpdatedAt) return { result: "OWNER_CONTROLLED" };
      if (foreignOrigin(prov, c)) return { result: "REFUSED", refusal: "REALM_MISMATCH" };

      const upd = await updateCashflowFiguresFromIntegrationInTx(tx, {
        snapshotId: existing.id, workspaceId: c.workspaceId, expectedUpdatedAt: prov.targetUpdatedAt, figures: f,
        audit: SYSTEM, auditExtra: { source: "QUICKBOOKS_ONLINE", connectionId: c.id },
      });
      if (!upd.ok) return { result: "OWNER_CONTROLLED" }; // the owner (or anyone) wrote the row since QuickBooks last did
      if (!upd.changed) return { result: "UNCHANGED" };
      await insertProvenance(tx, { connection: c, month, targetType: "CASHFLOW_SNAPSHOT", cashflowSnapshotId: existing.id, action: "UPDATED", figures, targetUpdatedAt: upd.snapshot.updatedAt, now });
      await auditMaterialized(tx, { connection: c, month, target: "OwnerCashflowSnapshot", entityId: existing.id, action: "UPDATED", changed: Object.keys(upd.changedFields) });
      return { result: "UPDATED", snapshotId: existing.id };
    }, { timeout: 30_000 });
  } catch (e) {
    if (e instanceof ValidationError) return { result: "REFUSED", refusal: "FINANCE_VALIDATION_REFUSED" };
    // The owner created this period between our read and our create: it is theirs.
    if (e instanceof CashflowConflictError) return { result: "OWNER_CONTROLLED" };
    throw e;
  }
}

/**
 * Materialize ONE closed month for one connection. Reads the CURRENT observations from the database (so materialization is a
 * pure function of persisted, versioned evidence — re-runnable, idempotent), applies the policy above and returns what happened
 * to each canonical target. Never throws for a policy refusal; a thrown error is a genuine fault.
 */
export async function materializeQboMonth(
  input: { connection: QboConnectionIdentity; month: MonthPeriod; expectedBasis: QboAccountingBasis },
  deps: MaterializeDeps = {},
): Promise<MaterializeMonthResult> {
  const client = deps.client ?? db;
  const now = (deps.now ?? (() => new Date()))();
  const { connection: c, month } = input;
  const refuse = (refusal: QboMaterializationRefusal): MaterializeMonthResult => ({
    month: month.start,
    finance: { result: "REFUSED", refusal },
    cashflow: { result: "REFUSED", refusal },
  });

  if (!isClosedMonth(month, now)) return refuse("PERIOD_NOT_CLOSED");

  const conn = await client.qboConnection.findFirst({
    where: { id: c.id, workspaceId: c.workspaceId, businessId: c.businessId },
    select: { status: true, environment: true, realmId: true },
  });
  if (!conn || conn.status !== "ACTIVE" || conn.environment !== c.environment || conn.realmId !== c.realmId) return refuse("CONNECTION_NOT_ACTIVE");

  const business = await client.ownerBusiness.findFirst({
    where: { id: c.businessId, workspaceId: c.workspaceId },
    select: { currency: true, isFixtureBusiness: true },
  });
  if (!business) return refuse("CONNECTION_NOT_ACTIVE");
  // Sandbox evidence only ever reaches a fixture business; production evidence only a real one (the DB trigger is the backstop).
  if ((c.environment === "sandbox") !== business.isFixtureBusiness) return refuse("SANDBOX_ISOLATION");

  const observations = await loadMonthObservations(client, { workspaceId: c.workspaceId, connectionId: c.id }, month);
  const derived = deriveMonthlyFigures(observations, { businessCurrency: String(business.currency), expectedBasis: input.expectedBasis });
  if (!derived.ok) return refuse(derived.refusal);

  const currency = derived.figures.currency;
  const finance = await materializeFinance(client, c, month, derived.figures, currency, now);
  const cashflow = await materializeCashflow(client, c, month, derived.figures, currency, now);
  return { month: month.start, finance, cashflow };
}
