/**
 * QuickBooks Online — governed snapshot materialization.
 *
 * Turns a pulled month of QBO reports into OpsIQ's own canonical, audited
 * finance/cashflow records — never bypassing createFinancialSnapshot /
 * amendFinancialSnapshot / createCashflowSnapshot, and never touching a
 * snapshot the owner entered by hand. Links the resulting snapshot back to
 * the period through an OwnerConnectorRecord ("Link:..." rows) so a later
 * sync of the SAME period can tell "this is our own record, safe to amend"
 * apart from "the owner typed this in, leave it alone".
 *
 * Currency is never converted: a business whose OpsIQ currency does not
 * match QuickBooks' home currency for the period is skipped with an issue,
 * not silently coerced.
 */

import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { getBusiness } from "@/services/founder-recovery/business.service";
import { QBO_PROVIDER } from "@/domain/quickbooks/qbo-config";
import { deriveSnapshotInputsFromReports, type QboReportInput } from "@/domain/quickbooks/qbo-derivation";
import { financialSnapshotCreateSchema, financialSnapshotAmendSchema } from "@/domain/owner-finance/validation";
import { cashflowSnapshotCreateSchema } from "@/domain/owner-cashflow/validation";
import {
  createFinancialSnapshot,
  amendFinancialSnapshot,
  resolveCurrentSnapshotId,
  rowToFinanceInput,
} from "@/services/owner-finance/snapshot.service";
import { createCashflowSnapshot } from "@/services/owner-cashflow/snapshot.service";
import { ingestIntegrationEvent } from "@/services/integration-fabric/integration-event.service";

export type MaterializeOutcome = "CREATED" | "AMENDED" | "UNCHANGED" | "SKIPPED";

export interface MaterializeQuickBooksSnapshotsInput {
  workspaceId: string;
  connectorId: string;
  businessId: string;
  actorId: string;
  periodStart: string; // YYYY-MM-DD
  periodEnd: string; // YYYY-MM-DD
  reports: {
    profitAndLoss?: QboReportInput;
    balanceSheet?: QboReportInput;
    agedReceivables?: QboReportInput;
    agedPayables?: QboReportInput;
  };
  /** QuickBooks' own home currency for the period (Preferences.CurrencyPrefs.HomeCurrency.value / CompanyInfo). */
  homeCurrency: string;
}

export interface MaterializeQuickBooksSnapshotsResult {
  financial: MaterializeOutcome;
  cashflow: MaterializeOutcome;
  issues: string[];
}

const LINK_FINANCIAL_ENTITY_TYPE = "Link:OwnerFinancialSnapshot";
const LINK_CASHFLOW_ENTITY_TYPE = "Link:OwnerCashflowSnapshot";

/** Fields deriveSnapshotInputsFromReports can populate that also appear on FinancialSnapshotAmendInput. */
const AMENDABLE_DERIVED_FINANCIAL_FIELDS = [
  "revenue",
  "costOfGoodsOrServices",
  "fixedCosts",
  "receivables",
  "receivablesOverdue",
  "payables",
  "payablesOverdue",
  "cashOnHand",
] as const;

function numbersDiffer(a: number | undefined, b: number | undefined): boolean {
  if (a === undefined && b === undefined) return false;
  if (a === undefined || b === undefined) return true;
  // QBO reports are floating-point; treat sub-cent differences as noise.
  return Math.abs(a - b) >= 0.01;
}

async function upsertSnapshotLink(params: {
  workspaceId: string;
  businessId: string;
  connectorId: string;
  externalAccount: string;
  entityType: string;
  remoteId: string;
  opsiqEntityId: string;
  now: Date;
}): Promise<void> {
  await db.ownerConnectorRecord.upsert({
    where: {
      connectorId_entityType_remoteId: {
        connectorId: params.connectorId,
        entityType: params.entityType,
        remoteId: params.remoteId,
      },
    },
    create: {
      id: randomUUID(),
      workspaceId: params.workspaceId,
      businessId: params.businessId,
      connectorId: params.connectorId,
      provider: QBO_PROVIDER,
      externalAccount: params.externalAccount,
      entityType: params.entityType,
      remoteId: params.remoteId,
      remoteStatus: "ACTIVE",
      data: {},
      opsiqEntityType: params.entityType === LINK_FINANCIAL_ENTITY_TYPE ? "OwnerFinancialSnapshot" : "OwnerCashflowSnapshot",
      opsiqEntityId: params.opsiqEntityId,
      ingestedAt: params.now,
    },
    update: {
      opsiqEntityId: params.opsiqEntityId,
      ingestedAt: params.now,
    },
  });
}

export async function materializeQuickBooksSnapshots(
  input: MaterializeQuickBooksSnapshotsInput
): Promise<MaterializeQuickBooksSnapshotsResult> {
  const now = new Date();
  const issues: string[] = [];

  const business = await getBusiness(input.businessId, input.workspaceId); // workspace ownership + existence

  if (!input.homeCurrency || business.currency.trim().toUpperCase() !== input.homeCurrency.trim().toUpperCase()) {
    return {
      financial: "SKIPPED",
      cashflow: "SKIPPED",
      issues: [
        `Business currency (${business.currency}) does not match QuickBooks home currency (${input.homeCurrency || "unknown"}) for ${input.periodStart}..${input.periodEnd} — values not applied.`,
      ],
    };
  }

  const connector = await db.ownerConnector.findFirst({
    where: { id: input.connectorId, workspaceId: input.workspaceId },
    select: { externalAccountId: true },
  });
  const externalAccount = connector?.externalAccountId ?? "";
  const periodKey = `${input.periodStart}..${input.periodEnd}`;
  const periodStartDate = new Date(input.periodStart);
  const periodEndDate = new Date(input.periodEnd);

  const derived = deriveSnapshotInputsFromReports({
    profitAndLoss: input.reports.profitAndLoss,
    balanceSheet: input.reports.balanceSheet,
    agedReceivables: input.reports.agedReceivables,
    agedPayables: input.reports.agedPayables,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    currency: input.homeCurrency,
  });
  issues.push(...derived.issues);

  // ── Financial snapshot ───────────────────────────────────────────────────
  let financialOutcome: MaterializeOutcome = "SKIPPED";
  let financialSnapshotId: string | null = null;

  const currentFinancial = await db.ownerFinancialSnapshot.findFirst({
    where: { businessId: input.businessId, periodStart: periodStartDate, periodEnd: periodEndDate, supersededById: null },
  });
  const financialLink = await db.ownerConnectorRecord.findFirst({
    where: { connectorId: input.connectorId, entityType: LINK_FINANCIAL_ENTITY_TYPE, remoteId: periodKey },
    select: { opsiqEntityId: true },
  });

  if (!currentFinancial) {
    const parsed = financialSnapshotCreateSchema.parse({
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      currency: input.homeCurrency,
      revenue: derived.financial.revenue,
      costOfGoodsOrServices: derived.financial.costOfGoodsOrServices,
      fixedCosts: derived.financial.fixedCosts,
      receivables: derived.financial.receivables,
      receivablesOverdue: derived.financial.receivablesOverdue,
      payables: derived.financial.payables,
      payablesOverdue: derived.financial.payablesOverdue,
      cashOnHand: derived.financial.cashOnHand,
    });
    const created = await createFinancialSnapshot(input.businessId, parsed, input.actorId, input.workspaceId);
    financialSnapshotId = created.id;
    financialOutcome = "CREATED";
    await upsertSnapshotLink({
      workspaceId: input.workspaceId,
      businessId: input.businessId,
      connectorId: input.connectorId,
      externalAccount,
      entityType: LINK_FINANCIAL_ENTITY_TYPE,
      remoteId: periodKey,
      opsiqEntityId: created.id,
      now,
    });
  } else if (!financialLink?.opsiqEntityId || (await resolveCurrentSnapshotId(financialLink.opsiqEntityId)) !== currentFinancial.id) {
    issues.push(`Owner-entered financial snapshot exists for ${periodKey}; QuickBooks values not applied.`);
    financialOutcome = "SKIPPED";
  } else {
    const existingInput = rowToFinanceInput(currentFinancial);
    const changed: Record<string, number> = {};
    for (const field of AMENDABLE_DERIVED_FINANCIAL_FIELDS) {
      const derivedValue = derived.financial[field];
      if (derivedValue === undefined) continue;
      if (numbersDiffer(existingInput[field] as number | undefined, derivedValue)) {
        changed[field] = derivedValue;
      }
    }
    if (Object.keys(changed).length === 0) {
      financialOutcome = "UNCHANGED";
      financialSnapshotId = currentFinancial.id;
    } else {
      const amendInput = financialSnapshotAmendSchema.parse({
        amendmentReason: "QuickBooks sync: accounting values changed",
        ...changed,
      });
      const { snapshot: amended } = await amendFinancialSnapshot(currentFinancial.id, amendInput, input.actorId, input.workspaceId);
      financialSnapshotId = amended!.id;
      financialOutcome = "AMENDED";
      await upsertSnapshotLink({
        workspaceId: input.workspaceId,
        businessId: input.businessId,
        connectorId: input.connectorId,
        externalAccount,
        entityType: LINK_FINANCIAL_ENTITY_TYPE,
        remoteId: periodKey,
        opsiqEntityId: amended!.id,
        now,
      });
    }
  }

  // ── Cashflow snapshot (create-only; no amendment path exists) ───────────
  let cashflowOutcome: MaterializeOutcome = "SKIPPED";
  let cashflowSnapshotId: string | null = null;

  const currentCashflow = await db.ownerCashflowSnapshot.findFirst({
    where: { businessId: input.businessId, periodStart: periodStartDate, periodEnd: periodEndDate },
  });

  if (!currentCashflow) {
    const parsed = cashflowSnapshotCreateSchema.parse({
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      currency: input.homeCurrency,
      bankBalance: derived.cashflow.bankBalance,
      receivables: derived.cashflow.receivables,
      receivablesOverdue: derived.cashflow.receivablesOverdue,
      payables: derived.cashflow.payables,
      payablesOverdue: derived.cashflow.payablesOverdue,
    });
    const created = await createCashflowSnapshot(input.businessId, parsed, input.actorId, input.workspaceId);
    cashflowSnapshotId = created.id;
    cashflowOutcome = "CREATED";
    await upsertSnapshotLink({
      workspaceId: input.workspaceId,
      businessId: input.businessId,
      connectorId: input.connectorId,
      externalAccount,
      entityType: LINK_CASHFLOW_ENTITY_TYPE,
      remoteId: periodKey,
      opsiqEntityId: created.id,
      now,
    });
  } else {
    issues.push(`A cashflow snapshot for ${periodKey} already exists; QuickBooks values not applied (no amendment path).`);
    cashflowOutcome = "SKIPPED";
  }

  // ── Route through governed re-evaluation when anything actually changed ──
  if (financialOutcome === "CREATED" || financialOutcome === "AMENDED" || cashflowOutcome === "CREATED") {
    await emitAuditEvent({
      eventName: AUDIT_EVENTS.QUICKBOOKS_SNAPSHOT_MATERIALIZED,
      workspaceId: input.workspaceId,
      actorId: input.actorId,
      entityType: "OwnerConnector",
      entityId: input.connectorId,
      payload: {
        businessId: input.businessId,
        period: periodKey,
        financial: financialOutcome,
        cashflow: cashflowOutcome,
        financialSnapshotId,
        cashflowSnapshotId,
      },
    });

    await ingestIntegrationEvent(
      {
        id: randomUUID(),
        workspaceId: input.workspaceId,
        connectorId: input.connectorId,
        provider: QBO_PROVIDER,
        kind: "ACCOUNTING_PL_SYNCED",
        businessId: input.businessId,
        payload: { period: periodKey, financialSnapshotId, cashflowSnapshotId },
        occurredAt: now.toISOString(),
      },
      input.actorId
    ).catch(() => {
      /* governed re-evaluation is best-effort; the snapshot write itself is already durable and audited */
    });
  }

  return { financial: financialOutcome, cashflow: cashflowOutcome, issues };
}
