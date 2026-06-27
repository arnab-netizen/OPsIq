/* eslint-disable @typescript-eslint/no-explicit-any -- Prisma `db` proxy rows are untyped; pragmatic any at the persistence boundary */
/**
 * Owner Budget service — DB-backed, workspace-scoped wiring for the Dynamic
 * Budget, Capital Allocation & Profit Governance module.
 *
 * Persists budget structure (period/lines), spend governance state, and IMMUTABLE
 * plan snapshots. Financial signals are REUSED from the latest OwnerFinancialSnapshot
 * (no duplicate finance storage). Material mutations (budget line amount, spend
 * entry, proof status) trigger reassessment through the real service path. The
 * pure decision logic lives in `@/domain/owner-budget`; this layer only assembles
 * inputs, persists results atomically/idempotently, and emits audit events.
 */
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { getBusiness } from "@/services/founder-recovery/business.service";
import { rowToFinanceInput } from "@/services/owner-finance/snapshot.service";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import {
  composeUpdatedPlan,
  evaluateSpend,
  classifyMaterialChange,
  evaluateReconciliation,
  reconciliationToSpendState,
  computeCashForecast,
  type ReconciliationInput,
  type ForecastResult,
  type AllocationCandidate,
  type AllocationCategory,
  type BudgetAssessmentInput,
  type CashObligation,
  type UpdatedOwnerPlan,
  type ChangeDescriptor,
  type SpendGovernanceResult,
  type MaterialChangeKind,
} from "@/domain/owner-budget";
import type { FinancialSnapshotInput } from "@/domain/owner-finance/types";
import { syncBudgetActions } from "@/services/owner-budget/action-link.service";
import { deriveAgeingForReassessment } from "@/services/owner-budget/working-capital.service";
import { deriveArchetypeSignalsForReassessment } from "@/services/owner-budget/archetype-metrics.service";
import { routeReassessmentSignals } from "@/services/owner-budget/signal-router.service";

const ALLOCATION_CATEGORIES: ReadonlySet<string> = new Set<AllocationCategory>([
  "statutory_payroll_tax", "cash_survival", "critical_fixed_obligations",
  "service_continuity_safety", "fraud_control_containment", "essential_operations",
  "profit_protection", "customer_retention_quality", "growth_roi",
  "scale_after_readiness", "strategic_experiment", "discretionary",
]);

function asCategory(s: string): AllocationCategory {
  return (ALLOCATION_CATEGORIES.has(s) ? s : "essential_operations") as AllocationCategory;
}

// ---------------------------------------------------------------------------
// Budget structure
// ---------------------------------------------------------------------------

export interface CreateBudgetPeriodInput {
  label: string;
  periodStart: string;
  periodEnd: string;
  currency: string;
  approvedBudget?: number | null;
  cashReserveTarget?: number | null;
  statutoryReserveRequired?: number | null;
  ownerGoal?: string | null;
}

export async function createBudgetPeriod(
  businessId: string,
  input: CreateBudgetPeriodInput,
  actorId: string,
  workspaceId: string
) {
  await getBusiness(businessId, workspaceId);
  const period = await db.budgetPeriod.create({
    data: {
      id: randomUUID(),
      workspaceId,
      businessId,
      label: input.label,
      periodStart: new Date(input.periodStart),
      periodEnd: new Date(input.periodEnd),
      currency: input.currency,
      approvedBudget: input.approvedBudget ?? null,
      cashReserveTarget: input.cashReserveTarget ?? null,
      statutoryReserveRequired: input.statutoryReserveRequired ?? null,
      ownerGoal: input.ownerGoal ?? null,
      status: "active",
      createdBy: actorId,
      updatedAt: new Date(),
    },
  });
  await emitAuditEvent({
    eventName: AUDIT_EVENTS.OWNER_BUDGET_PERIOD_CREATED,
    actorId, workspaceId, entityType: "BudgetPeriod", entityId: period.id,
    payload: { businessId, label: input.label },
  });
  return period;
}

export interface AddBudgetLineInput {
  periodId: string;
  label: string;
  category: AllocationCategory;
  plannedAmount: number;
  ownerRole?: string | null;
  approvalThreshold?: number | null;
}

export async function addBudgetLine(
  businessId: string,
  input: AddBudgetLineInput,
  actorId: string,
  workspaceId: string
) {
  await getBusiness(businessId, workspaceId);
  const line = await db.budgetLine.create({
    data: {
      id: randomUUID(),
      workspaceId, businessId, periodId: input.periodId,
      label: input.label, category: input.category, plannedAmount: input.plannedAmount,
      ownerRole: input.ownerRole ?? null, approvalThreshold: input.approvalThreshold ?? null,
      createdBy: actorId, updatedAt: new Date(),
    },
  });
  await emitAuditEvent({
    eventName: AUDIT_EVENTS.OWNER_BUDGET_LINE_CHANGED,
    actorId, workspaceId, entityType: "BudgetLine", entityId: line.id,
    payload: { businessId, change: "added", amount: input.plannedAmount },
  });
  return reassessBudget(businessId, workspaceId, {
    actorId, kind: "budget_line_added", triggerEventId: `line_add:${line.id}`,
    change: { field: "budgetLine", newValue: input.label },
  });
}

export async function updateBudgetLineAmount(
  businessId: string,
  lineId: string,
  newAmount: number,
  actorId: string,
  workspaceId: string
) {
  await getBusiness(businessId, workspaceId);
  const existing = await db.budgetLine.findFirst({ where: { id: lineId, workspaceId, businessId } });
  if (!existing) throw new Error("Budget line not found in workspace.");
  const line = await db.budgetLine.update({
    where: { id: lineId },
    data: { plannedAmount: newAmount, updatedAt: new Date() },
  });
  await emitAuditEvent({
    eventName: AUDIT_EVENTS.OWNER_BUDGET_LINE_CHANGED,
    actorId, workspaceId, entityType: "BudgetLine", entityId: lineId,
    payload: { businessId, change: "amount", previous: existing.plannedAmount, next: newAmount },
  });
  void line;
  return reassessBudget(businessId, workspaceId, {
    actorId, kind: "budget_line_amount_changed", triggerEventId: `line_amt:${lineId}:${newAmount}`,
    change: { field: "budgetLine.plannedAmount", previousValue: existing.plannedAmount, newValue: newAmount },
  });
}

// ---------------------------------------------------------------------------
// Spend governance
// ---------------------------------------------------------------------------

export interface RecordSpendInput {
  periodId?: string | null;
  budgetLineId?: string | null;
  label: string;
  category: string;
  amount: number;
  state?: string;
  sourceType?: string;
  obligationKind?: CashObligation["kind"] | null;
  dueInDays?: number | null;
  requestedByUserId: string;
  approvedByUserId?: string | null;
  isNewVendor?: boolean;
  vendorBankChanged?: boolean;
  vendorId?: string | null;
  /** Invoice content hash for duplicate-invoice detection. */
  invoiceHash?: string | null;
  ownerApprovalThreshold: number;
  recentSameCategoryAmounts?: number[];
  emergency?: boolean;
}

export interface RecordSpendResult {
  spend: any;
  governance: SpendGovernanceResult;
  plan: UpdatedOwnerPlan;
}

export async function recordSpendEntry(
  businessId: string,
  input: RecordSpendInput,
  actorId: string,
  workspaceId: string
): Promise<RecordSpendResult> {
  await getBusiness(businessId, workspaceId);

  const governance = evaluateSpend({
    amount: input.amount,
    category: input.category,
    requestedByUserId: input.requestedByUserId,
    approvedByUserId: input.approvedByUserId ?? null,
    ownerApprovalThreshold: input.ownerApprovalThreshold,
    isNewVendor: input.isNewVendor,
    vendorBankChanged: input.vendorBankChanged,
    recentSameCategoryAmounts: input.recentSameCategoryAmounts,
    proofStatus: "missing",
    emergency: input.emergency,
  });

  const spend = await db.spendEntry.create({
    data: {
      id: randomUUID(),
      workspaceId, businessId,
      periodId: input.periodId ?? null,
      budgetLineId: input.budgetLineId ?? null,
      label: input.label, category: input.category, amount: input.amount,
      state: input.state ?? "requested",
      sourceType: input.sourceType ?? "MANUAL",
      obligationKind: input.obligationKind ?? null,
      dueInDays: input.dueInDays ?? null,
      requestedByUserId: input.requestedByUserId,
      approvedByUserId: input.approvedByUserId ?? null,
      isNewVendor: input.isNewVendor ?? false,
      vendorBankChanged: input.vendorBankChanged ?? false,
      vendorId: input.vendorId ?? null,
      invoiceHash: input.invoiceHash ?? null,
      proofStatus: "missing",
      riskLevel: governance.riskLevel,
      updatedAt: new Date(),
    },
  });

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.OWNER_BUDGET_SPEND_RECORDED,
    actorId, workspaceId, entityType: "SpendEntry", entityId: spend.id,
    payload: { businessId, amount: input.amount, risk: governance.riskLevel, decision: governance.decision },
  });

  const plan = await reassessBudget(businessId, workspaceId, {
    actorId, kind: "spend_entry_added", triggerEventId: `spend:${spend.id}`,
    change: { field: "spendEntry", newValue: `${input.label}:${input.amount}` },
  });

  return { spend, governance, plan };
}

export async function updateSpendProofStatus(
  businessId: string,
  spendId: string,
  proofStatus: "missing" | "uploaded" | "matched" | "disputed" | "reconciled",
  actorId: string,
  workspaceId: string
) {
  await getBusiness(businessId, workspaceId);
  const existing = await db.spendEntry.findFirst({ where: { id: spendId, workspaceId, businessId } });
  if (!existing) throw new Error("Spend entry not found in workspace.");
  const spend = await db.spendEntry.update({
    where: { id: spendId },
    data: { proofStatus, updatedAt: new Date() },
  });
  await emitAuditEvent({
    eventName: AUDIT_EVENTS.OWNER_BUDGET_SPEND_PROOF_UPDATED,
    actorId, workspaceId, entityType: "SpendEntry", entityId: spendId,
    payload: { businessId, proofStatus },
  });
  await reassessBudget(businessId, workspaceId, {
    actorId,
    kind: proofStatus === "disputed" ? "spend_proof_disputed" : "spend_proof_uploaded",
    triggerEventId: `proof:${spendId}:${proofStatus}`,
    change: { field: "spendEntry.proofStatus", previousValue: existing.proofStatus, newValue: proofStatus },
  });
  return spend;
}

/**
 * Advance a spend through reconciliation. A receipt alone is never "verified";
 * full reconciliation requires proof + invoice + payment + bank match. Mismatches
 * become disputed and surface a reconciliation exception in the next plan.
 */
export async function updateSpendReconciliation(
  businessId: string,
  spendId: string,
  signals: ReconciliationInput,
  actorId: string,
  workspaceId: string
) {
  await getBusiness(businessId, workspaceId);
  const existing = await db.spendEntry.findFirst({ where: { id: spendId, workspaceId, businessId } });
  if (!existing) throw new Error("Spend entry not found in workspace.");

  const recon = evaluateReconciliation(signals);
  const spend = await db.spendEntry.update({
    where: { id: spendId },
    data: {
      state: reconciliationToSpendState(recon.status),
      proofStatus: recon.status === "RECONCILED" ? "reconciled" : recon.mismatch ? "disputed" : existing.proofStatus,
      updatedAt: new Date(),
    },
  });
  await emitAuditEvent({
    eventName: AUDIT_EVENTS.OWNER_BUDGET_SPEND_PROOF_UPDATED,
    actorId, workspaceId, entityType: "SpendEntry", entityId: spendId,
    payload: { businessId, reconciliation: recon.status, mismatch: recon.mismatch },
  });
  const plan = await reassessBudget(businessId, workspaceId, {
    actorId, kind: "reconciliation_changed", triggerEventId: `recon:${spendId}:${recon.status}`,
    change: { field: "spendEntry.reconciliation", newValue: recon.status },
  });
  return { spend, reconciliation: recon, plan };
}

/** Rolling 13-week cash forecast (base / downside / cash-stress) for the business. */
export async function getBudgetForecast(workspaceId: string, businessId: string): Promise<ForecastResult & { hasData: boolean }> {
  await getBusiness(businessId, workspaceId);
  const period = await db.budgetPeriod.findFirst({ where: { workspaceId, businessId, status: "active" }, orderBy: { createdAt: "desc" } });
  const snap = await db.ownerFinancialSnapshot.findFirst({ where: { workspaceId, businessId }, orderBy: { periodEnd: "desc" } });
  const committed = await db.spendEntry.findMany({
    where: { workspaceId, businessId, voidedAt: null, state: { in: ["committed", "approved", "requested"] }, dueInDays: { not: null } },
  });
  const obligations = committed.map((s: any) => ({ label: s.label, amount: s.amount, dueInDays: s.dueInDays as number, kind: (s.obligationKind as any) ?? "other" }));

  const WEEKS_PER_MONTH = 4.345;
  const cashOnHand = snap?.cashOnHand ?? 0;
  const monthlyRevenue = snap?.revenue ?? 0;
  const monthlyOutflow = (snap?.costOfGoods ?? 0) + (snap?.fixedCosts ?? 0) + (snap?.variableCosts ?? 0);
  const reserveRequired = Math.max(0, period?.statutoryReserveRequired ?? 0, period?.cashReserveTarget ?? 0);

  const forecast = computeCashForecast({
    cashOnHand,
    weeklyRevenue: monthlyRevenue / WEEKS_PER_MONTH,
    weeklyOutflow: monthlyOutflow / WEEKS_PER_MONTH,
    obligations,
    reserveRequired,
  });
  return { ...forecast, hasData: snap !== null };
}

// ---------------------------------------------------------------------------
// Reassessment (atomic, idempotent, snapshot-versioned)
// ---------------------------------------------------------------------------

export interface ReassessOptions {
  actorId: string;
  kind: MaterialChangeKind;
  triggerEventId: string;
  change?: ChangeDescriptor;
  /** Optional finance override (else latest OwnerFinancialSnapshot is used). */
  financeOverride?: FinancialSnapshotInput | null;
}

async function assembleAssessment(
  businessId: string,
  workspaceId: string,
  financeOverride?: FinancialSnapshotInput | null
): Promise<{ assessment: BudgetAssessmentInput; candidates: AllocationCandidate[]; periodId: string | null; approvedBudget: number | null }> {
  const period = await db.budgetPeriod.findFirst({
    where: { workspaceId, businessId, status: "active" },
    orderBy: { createdAt: "desc" },
  });

  let finance: FinancialSnapshotInput;
  const criticalMissingInputs: string[] = [];
  if (financeOverride) {
    finance = financeOverride;
  } else {
    const snap = await db.ownerFinancialSnapshot.findFirst({
      where: { workspaceId, businessId },
      orderBy: { periodEnd: "desc" },
    });
    if (snap) {
      finance = rowToFinanceInput(snap);
    } else {
      finance = {
        periodStart: period?.periodStart?.toISOString() ?? new Date(0).toISOString(),
        periodEnd: period?.periodEnd?.toISOString() ?? new Date(0).toISOString(),
        currency: period?.currency ?? "INR",
      };
      criticalMissingInputs.push("revenue", "cashOnHand", "fixedCosts");
    }
  }

  // Obligations from committed/approved spend entries that carry a due date.
  const committed = await db.spendEntry.findMany({
    where: {
      workspaceId, businessId, voidedAt: null,
      state: { in: ["committed", "approved", "requested"] },
      dueInDays: { not: null },
    },
  });
  const obligations: CashObligation[] = committed.map((s: any) => ({
    label: s.label,
    amount: s.amount,
    dueInDays: s.dueInDays as number,
    kind: (s.obligationKind as CashObligation["kind"]) ?? "other",
  }));

  // Candidates from non-voided budget lines.
  const lines = await db.budgetLine.findMany({
    where: { workspaceId, businessId, voidedAt: null, ...(period ? { periodId: period.id } : {}) },
  });
  const candidates: AllocationCandidate[] = lines.map((l: any) => ({
    id: l.id,
    label: l.label,
    category: asCategory(l.category),
    amount: l.plannedAmount,
    reversible: l.category !== "scale_after_readiness",
    accountableRole: l.ownerRole ?? undefined,
  }));

  // Vendor/procurement control signal aggregated from flagged spend entries +
  // the vendor master + invoice-hash duplicate detection.
  const riskyVendorSpend = await db.spendEntry.findFirst({
    where: {
      workspaceId, businessId, voidedAt: null,
      OR: [{ vendorBankChanged: true }, { isNewVendor: true }],
    },
    orderBy: { createdAt: "desc" },
  });

  // Duplicate invoice: any invoice hash appearing on >1 non-voided spend.
  const hashed = await db.spendEntry.findMany({
    where: { workspaceId, businessId, voidedAt: null, invoiceHash: { not: null } },
    select: { invoiceHash: true },
  });
  const hashCounts = new Map<string, number>();
  for (const r of hashed) {
    const h = r.invoiceHash as string;
    hashCounts.set(h, (hashCounts.get(h) ?? 0) + 1);
  }
  const duplicateInvoiceSuspected = [...hashCounts.values()].some((c) => c > 1);

  // Resolve bank verification from the vendor master when the spend is linked.
  let bankVerified = riskyVendorSpend?.proofStatus === "reconciled";
  if (riskyVendorSpend?.vendorId) {
    const vendor = await db.vendorRecord.findFirst({ where: { id: riskyVendorSpend.vendorId, workspaceId, businessId } });
    if (vendor) bankVerified = vendor.bankVerified;
  }

  const vendorControl =
    riskyVendorSpend || duplicateInvoiceSuspected
      ? {
          isNewVendor: riskyVendorSpend?.isNewVendor ?? false,
          vendorBankChanged: riskyVendorSpend?.vendorBankChanged ?? false,
          vendorBankVerified: bankVerified,
          duplicateInvoiceSuspected,
        }
      : undefined;

  // Reconciliation exceptions: disputed/mismatched spend that cannot be counted as verified.
  const reconciliationExceptionCount = await db.spendEntry.count({
    where: {
      workspaceId, businessId, voidedAt: null,
      OR: [{ state: "disputed" }, { proofStatus: "disputed" }],
    },
  });

  // Working-capital ageing (Dynamic Budget ageing slice): derive ageing from
  // persisted manual/import-ready items and feed the EXISTING engines — overdue
  // payables become a real cash obligation (so mode/allocation react), the
  // collection gap drives the existing gap-survival check, and the ageing result
  // is attached for the plan composer to emit ageing signals/actions. No new
  // reassessment engine is introduced.
  let workingCapital: BudgetAssessmentInput["workingCapital"];
  const ageingForReassessment = await deriveAgeingForReassessment(
    workspaceId, businessId, finance, period?.statutoryReserveRequired ?? null, new Date()
  );
  if (ageingForReassessment) {
    if (ageingForReassessment.overduePayables > 0) {
      obligations.push({
        label: "Overdue payables (working-capital ageing)",
        amount: ageingForReassessment.overduePayables,
        dueInDays: 0,
        kind: "vendor",
      });
    }
    workingCapital = {
      collectionGapDays: ageingForReassessment.collectionGapDays,
      pendingReceiptValue: ageingForReassessment.pendingReceiptValue,
      ageing: ageingForReassessment.ageing,
    };
  }

  // Archetype operational metrics (archetype-metrics slice): derive the archetype-pack
  // signal inputs from persisted manual/import-ready metrics so the archetype packs +
  // working-capital × archetype cross-integration run through real reassessment. Null
  // when generic / no usable metrics ⇒ packs fall back to archetype_data_insufficient.
  const archetypeSignals = await deriveArchetypeSignalsForReassessment(
    workspaceId, businessId, finance.industryTemplate, new Date()
  );

  const assessment: BudgetAssessmentInput = {
    finance,
    cashReserveTarget: period?.cashReserveTarget ?? null,
    statutoryReserveRequired: period?.statutoryReserveRequired ?? null,
    obligations,
    ownerGoal: (period?.ownerGoal as BudgetAssessmentInput["ownerGoal"]) ?? undefined,
    criticalMissingInputs: criticalMissingInputs.length ? criticalMissingInputs : undefined,
    vendorControl,
    reconciliationExceptionCount: reconciliationExceptionCount || undefined,
    workingCapital,
    archetypeSignals: archetypeSignals ?? undefined,
  };

  return { assessment, candidates, periodId: period?.id ?? null, approvedBudget: period?.approvedBudget ?? null };
}

/**
 * Reassess the budget from current persisted state. Idempotent per
 * (workspace, business, triggerEventId): a repeated trigger returns the existing
 * plan without creating a duplicate snapshot. Snapshot versioning is atomic — the
 * prior current snapshot is preserved (isCurrent=false) and a new one is created
 * in one transaction.
 */
export async function reassessBudget(
  businessId: string,
  workspaceId: string,
  opts: ReassessOptions
): Promise<UpdatedOwnerPlan> {
  await getBusiness(businessId, workspaceId);

  // Idempotency: same trigger → return the already-computed plan.
  const existing = await db.budgetReassessment.findFirst({
    where: { workspaceId, businessId, triggerEventId: opts.triggerEventId },
  });
  if (existing) {
    return existing.plan as unknown as UpdatedOwnerPlan;
  }

  const triggerClass = classifyMaterialChange(opts.kind).triggerClass;
  const { assessment, candidates, periodId, approvedBudget } = await assembleAssessment(
    businessId, workspaceId, opts.financeOverride
  );

  const plan = composeUpdatedPlan({
    assessment,
    change: opts.change ?? null,
    candidates,
    allocationContext: { approvedBudget },
  });

  // Persist atomically: new immutable snapshot, prior marked non-current,
  // reassessment row recorded (unique trigger guards against duplicates).
  let reassessmentId = "";
  let snapshotId = "";
  await db.$transaction(async (tx: any) => {
    const current = await tx.budgetPlanSnapshot.findFirst({
      where: { workspaceId, businessId, isCurrent: true },
      orderBy: { version: "desc" },
    });
    const nextVersion = (current?.version ?? 0) + 1;
    if (current) {
      await tx.budgetPlanSnapshot.update({ where: { id: current.id }, data: { isCurrent: false } });
    }
    const reassessment = await tx.budgetReassessment.create({
      data: {
        id: randomUUID(),
        workspaceId, businessId, periodId,
        triggerEventId: opts.triggerEventId,
        triggerClass,
        changeField: opts.change?.field ?? null,
        mode: plan.mode, confidence: plan.confidence,
        topConstraint: plan.topConstraint, nextBestAction: plan.nextBestAction,
        decisionType: plan.decisionType,
        plan: plan as unknown as object,
      },
    });
    reassessmentId = reassessment.id;
    const snapshot = await tx.budgetPlanSnapshot.create({
      data: {
        id: randomUUID(),
        workspaceId, businessId, periodId,
        reassessmentId: reassessment.id,
        version: nextVersion, isCurrent: true,
        mode: plan.mode, confidence: plan.confidence,
        changeReason: opts.change?.field ?? opts.kind,
        plan: plan as unknown as object,
      },
    });
    snapshotId = snapshot.id;
  });

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.OWNER_BUDGET_REASSESSED,
    actorId: opts.actorId, workspaceId, entityType: "BudgetPlanSnapshot", entityId: businessId,
    payload: { businessId, mode: plan.mode, trigger: opts.kind, decision: plan.decisionType },
  });

  // Deep action linkage: persist/link the plan's advisory actions as owner
  // execution tasks (idempotent by sourceKey — no duplicate open tasks).
  await syncBudgetActions(businessId, workspaceId, {
    plan, reassessmentId, planSnapshotId: snapshotId, periodId, actorId: opts.actorId,
  });

  // Cross-module signal wiring (Slice 6): deliver the plan's signals to real
  // consumers (audit/owner-risk ledger + finance re-diagnosis for financially
  // material signals). Advisory — never fails the reassessment.
  await routeReassessmentSignals({
    businessId, workspaceId, actorId: opts.actorId,
    reassessmentId, signals: plan.signals,
  });

  return plan;
}

// ---------------------------------------------------------------------------
// Owner guidance adapter
// ---------------------------------------------------------------------------

export interface BudgetGuidance {
  hasPlan: boolean;
  mode: UpdatedOwnerPlan["mode"] | null;
  confidence: UpdatedOwnerPlan["confidence"] | null;
  topRisk: string | null;
  nextBestAction: string | null;
  decisionType: UpdatedOwnerPlan["decisionType"] | null;
  pendingDecisions: string[];
  signals: UpdatedOwnerPlan["signals"];
  generatedActions: UpdatedOwnerPlan["generatedActions"];
  reassessedAt: string | null;
  version: number | null;
}

/** Expose the current budget plan for the owner dashboard/guidance surface. */
export async function getBudgetGuidance(workspaceId: string, businessId: string): Promise<BudgetGuidance> {
  await getBusiness(businessId, workspaceId);
  const snapshot = await db.budgetPlanSnapshot.findFirst({
    where: { workspaceId, businessId, isCurrent: true },
    orderBy: { version: "desc" },
  });
  if (!snapshot) {
    return {
      hasPlan: false, mode: null, confidence: null, topRisk: null, nextBestAction: null,
      decisionType: null, pendingDecisions: [], signals: [], generatedActions: [],
      reassessedAt: null, version: null,
    };
  }
  const plan = snapshot.plan as unknown as UpdatedOwnerPlan;
  const pendingDecisions = plan.generatedActions
    .filter((a) => ["BLOCK", "DEFER", "INVESTIGATE", "ESCALATE", "COLLECT_EVIDENCE"].includes(a.decisionType))
    .map((a) => `${a.decisionType}: ${a.title}`);
  return {
    hasPlan: true,
    mode: plan.mode,
    confidence: plan.confidence,
    topRisk: plan.topConstraint,
    nextBestAction: plan.nextBestAction,
    decisionType: plan.decisionType,
    pendingDecisions,
    signals: plan.signals,
    generatedActions: plan.generatedActions,
    reassessedAt: snapshot.createdAt instanceof Date ? snapshot.createdAt.toISOString() : String(snapshot.createdAt),
    version: snapshot.version,
  };
}

/** List immutable plan snapshots (history) newest-first. */
export async function listBudgetSnapshots(workspaceId: string, businessId: string) {
  await getBusiness(businessId, workspaceId);
  return db.budgetPlanSnapshot.findMany({
    where: { workspaceId, businessId },
    orderBy: { version: "desc" },
  });
}
