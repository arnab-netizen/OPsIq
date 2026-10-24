/**
 * Production whole-business plan service — surfaces the NEW owner-advice runtime for the command center.
 *
 * Composes the real DB providers + persisted-state context derivation + the workspace-private learning
 * store, runs the validated owner-advice runtime, and returns ONE serializable view the command-center
 * page renders. Workspace/business scoped end-to-end; nothing is fabricated — missing/stale provider
 * data lowers confidence (never invents certainty), and cross-workspace data never leaks (the providers'
 * queries and the learning store's privacy gate both enforce scope).
 *
 * This is the integration seam the FINAL UI-RUNTIME-WIRING gate requires: the browser command center
 * reflects provider-backed runtime output, not harness code.
 */
import type { PrismaClient } from "@/generated/prisma/client";
import { prefetchOwnerDomainRows, buildProvidersFromRows } from "./owner-db-providers";
import { deriveOwnerContext } from "./owner-context-derivation";
import { runOwnerAdvice } from "./owner-advice-runtime.service";
import { PrismaLearningStore } from "@/behavioral-validation/learning-store";
import type { Constraint } from "@/behavioral-validation/whole-business/arbitration";
import { scoreCollectivePlan } from "@/behavioral-validation/whole-business/collective-scorer";
import { evaluateCanonicalScaleGate, type CanonicalScaleGate } from "@/domain/owner-mode/canonical-scale-gate";
import { loadOwnerGateConstraints } from "./owner-action-gate.service";
import { applyCanonicalScaleGate } from "./owner-scale-gate-adapter";
import { logger } from "@/infra/logger";
import { buildSupervisorSummary, type SupervisorSummary, type SupervisorInput } from "@/domain/owner-mode/supervisor-summary";

export interface OwnerWholeBusinessPlanDeps {
  db: PrismaClient;
  workspaceId: string;
  businessId: string;
  now: Date;
  freshnessDays?: number;
}

/**
 * The explicit standing-instruction scope an owner uses to pre-approve a safe routine action class. Only an
 * active standing instruction with THIS scope makes a (otherwise owner-decision) safe action eligible for
 * cautious_proceed / proceed. Deliberate by design — a generic/incidental standing instruction does not count.
 */
export const SAFE_ACTION_SOP_SCOPE = "owner.safe-action-approved";

/** Human label for the dominant constraint (display only — never drives advice). */
const CONSTRAINT_LABEL: Record<Constraint, string> = {
  compliance_block: "Compliance / legal block",
  proof_fraud_block: "Proof / fraud block",
  cash_survival: "Cash survival",
  below_margin: "Below-margin work",
  capacity_feasibility: "Capacity / feasibility",
  customer_quality: "Customer quality",
  owner_workload: "Owner workload",
  profitable_growth: "Profitable growth",
  efficiency_scaling: "Efficiency / scaling",
  optimization: "Optimisation",
};

export interface OwnerWholeBusinessPlanView {
  workspaceId: string;
  businessId: string;
  /** Present ⇔ an owner business row exists for this workspace+business. */
  found: boolean;
  generatedFromRuntime: true;
  topPriority: { constraint: Constraint; label: string };
  dominantConstraint: Constraint;
  nextBestAction: string;
  rootCause: string;
  successMetrics: string[];
  /** Expected impact of the recommendation — computed by the runtime plan, surfaced for the owner. */
  impact: {
    financeCash: string;
    marginPricing: string;
    equipmentCapacity: string;
    staffWorkload: string;
    customerQuality: string;
    operationsProcess: string;
  };
  doNotDo: string[];
  redDomains: string[];
  domainHealth: Array<{ domain: string; status: string }>;
  ownerWorkload: { offload: string; delegatedWork: string[]; approvalRequired: boolean };
  proofRequired: string[];
  reassessmentTriggers: string[];
  arbitration: { dominantConstraint: Constraint; ownerApprovalNeeded: boolean; requiredProofToReconsider: string; rejectedCount: number };
  /**
   * Legacy gates AND the canonical owner scale gate (the same GROW evaluation Home / the action gate use).
   * `scaleAllowed` is true only when BOTH permit; `canonicalGate` names why the canonical side holds it.
   */
  growth: { scaleAllowed: boolean; blockedBy: string[]; canonicalGate: { allowed: boolean; reasons: string[] } };
  stage: string;
  plan: { businessHealthSummary: string; plan7Day: string; plan30Day: string; plan90Day: string };
  learning: { applied: boolean; artifactIds: string[]; notes: string[] };
  data: {
    criticalDomainsRealProviderBacked: boolean;
    criticalDomainsAllReal: boolean;
    overallConfidence: string;
    dataSourceMissing: string[];
    realProviderDomains: string[];
  };
  collectiveScore: number;
  unsafeCount: number;
  /** Concise governed supervisor summary derived from THIS runtime view (no new advice/model). */
  supervisor: SupervisorSummary;
}

/** A complete empty supervisor input (found:false path ignores the rest; keeps types honest). */
const EMPTY_SUPERVISOR_INPUT: SupervisorInput = {
  found: false, dominantConstraint: "profitable_growth", topPriorityLabel: "—", nextBestAction: "—", rootCause: "",
  doNotDo: [], proofRequired: [], reassessmentTriggers: [], successMetrics: [], redDomains: [],
  ownerApprovalRequired: false, ownerOffload: "—", delegatedWork: [], opsiqPreparedWork: [],
  growthScaleAllowed: false, growthBlockedBy: [], overallConfidence: "none", criticalDomainsAllReal: false,
  dataSourceMissing: [], realProviderDomains: [], assessedDomains: [], unsafeCount: 0,
  impact: { financeCash: "—", marginPricing: "—", equipmentCapacity: "—", staffWorkload: "—", customerQuality: "—" },
  ownerWorkloadOffload: "—", plan7Day: "", plan30Day: "",
};

/** A safe "business not found" view (no fabricated runtime output). */
function notFound(workspaceId: string, businessId: string): OwnerWholeBusinessPlanView {
  return {
    workspaceId, businessId, found: false, generatedFromRuntime: true,
    topPriority: { constraint: "profitable_growth", label: CONSTRAINT_LABEL.profitable_growth },
    dominantConstraint: "profitable_growth", nextBestAction: "No business data found for this workspace.",
    rootCause: "", successMetrics: [],
    impact: { financeCash: "—", marginPricing: "—", equipmentCapacity: "—", staffWorkload: "—", customerQuality: "—", operationsProcess: "—" },
    doNotDo: [], redDomains: [], domainHealth: [],
    ownerWorkload: { offload: "—", delegatedWork: [], approvalRequired: false },
    proofRequired: [], reassessmentTriggers: [],
    arbitration: { dominantConstraint: "profitable_growth", ownerApprovalNeeded: false, requiredProofToReconsider: "—", rejectedCount: 0 },
    growth: { scaleAllowed: false, blockedBy: [], canonicalGate: { allowed: false, reasons: [] } }, stage: "unknown",
    plan: { businessHealthSummary: "No persisted business data.", plan7Day: "", plan30Day: "", plan90Day: "" },
    learning: { applied: false, artifactIds: [], notes: [] },
    data: { criticalDomainsRealProviderBacked: false, criticalDomainsAllReal: false, overallConfidence: "none", dataSourceMissing: [], realProviderDomains: [] },
    collectiveScore: 0, unsafeCount: 0,
    supervisor: buildSupervisorSummary(EMPTY_SUPERVISOR_INPUT),
  };
}

/** The canonical scale gate for this business; an unloadable safety state fails closed (never permissive). */
async function resolveCanonicalScaleGate(db: PrismaClient, workspaceId: string, businessId: string, now: Date): Promise<CanonicalScaleGate> {
  try {
    const constraints = await loadOwnerGateConstraints(workspaceId, businessId, { db: db as never, now: () => now });
    return evaluateCanonicalScaleGate(constraints);
  } catch (err) {
    logger.warn("owner whole-business plan: canonical safety state unavailable; scale not affirmed", { workspaceId }, { errorName: err instanceof Error ? err.name : "UnknownError" });
    return evaluateCanonicalScaleGate(null);
  }
}

/**
 * Build the whole-business plan view for ONE workspace+business from real persisted state.
 * Reads (never writes) the DB and the learning store.
 */
export async function getOwnerWholeBusinessPlan(deps: OwnerWholeBusinessPlanDeps): Promise<OwnerWholeBusinessPlanView> {
  const { db, workspaceId, businessId, now } = deps;
  const rows = await prefetchOwnerDomainRows({ db, workspaceId, businessId, now, freshnessDays: deps.freshnessDays });
  if (!rows.business) return notFound(workspaceId, businessId);

  const providers = buildProvidersFromRows(rows, { db, workspaceId, businessId, now, freshnessDays: deps.freshnessDays });
  const context = deriveOwnerContext(rows, { now, freshnessDays: deps.freshnessDays });
  const store = new PrismaLearningStore(db as unknown as ConstructorParameters<typeof PrismaLearningStore>[0]);

  const result = await runOwnerAdvice({ workspaceId, context }, { store, providers });
  const { ingestion } = result;
  // ONE canonical safety source: the legacy planner derives its own cash/risk flags from raw rows (it cannot see
  // a Finance profit-driven AT_RISK, an unverified reading, etc.), so its growth permission and spend
  // recommendation are adapted from the canonical GROW gate — tightened only, never lifted.
  const scaleGate = await resolveCanonicalScaleGate(db, workspaceId, businessId, now);
  const plan = applyCanonicalScaleGate(result.plan, scaleGate);
  const arbitration = plan.arbitration;
  const collective = scaleGate.allowed ? result.collective : scoreCollectivePlan(plan);
  const dominant = plan.arbitration.dominantConstraint;

  const realProviderDomains = (Object.keys(ingestion.byDomain) as Array<keyof typeof ingestion.byDomain>)
    .filter((d) => ingestion.byDomain[d].realData === true)
    .map((d) => String(d));

  // Safe-action policy signals — populated ONLY for a genuinely-safe business so the supervisor may
  // downgrade an owner-decision to cautious_proceed / proceed. Conservative by construction: any binding
  // risk (unsafe / compliance / proof / cash / margin / capacity / quality / red domain / missing critical
  // data / low confidence / no covering standing instruction) leaves `safeAction` undefined, so the
  // disposition stays exactly as before. The action is "within approved SOP" only when a covering owner
  // standing instruction exists (owner approval pre-granted for this action class).
  // A red in any genuinely-risky financial / operational / quality / compliance / proof / vendor domain
  // blocks a safe action; advisory reds (business continuity, risk-management planning, self-evaluation,
  // local-market awareness) do not, since they are surfaced in the summary but do not make a routine,
  // reversible, SOP-approved action unsafe.
  const HARD_RISK_RED = new Set([
    "cash_flow", "finance", "pricing_margin", "working_capital", "budgeting_capital", "equipment_capacity",
    "operations", "staff_management", "quality_control", "reputation_complaints", "customer_retention",
    "compliance_review", "proof_anti_gaming", "fraud_collusion", "vendor_supplier", "delivery_logistics",
    "process_improvement", "contract_quote", "opportunity_eval",
  ]);
  const hardRiskRed = plan.domainHealthTable.some((d) => d.status === "red" && HARD_RISK_RED.has(d.domain));
  const SAFE_DOMINANTS = new Set(["profitable_growth", "efficiency_scaling", "optimization"]);
  // "Within approved SOP" requires a DELIBERATE, explicitly-scoped owner standing instruction that
  // pre-approves a safe routine action class — never a generic/incidental standing instruction. This is the
  // owner's explicit grant; absent it, the disposition stays an owner decision (unchanged behaviour). The
  // owner's declared risk class on that instruction decides proceed (low) vs cautious_proceed (medium).
  const sopApproval = await db.ownerStandingInstruction.findFirst({
    where: { workspaceId, businessId, status: "active", scope: SAFE_ACTION_SOP_SCOPE },
    select: { riskClass: true },
  });
  const withinApprovedSOP = sopApproval !== null;
  const lowRiskApproved = sopApproval?.riskClass === "low";
  // The safe-action claim asserts cash/capacity/margin safety (`cashImpactSafe`, `staffCapacityOk`, …): a canonical
  // DANGER (unsafe cash/finance state, unsafe capacity, margin below floor, expired compliance) withdraws it. The mere
  // ABSENCE of a diagnosed reading is not danger and is already covered by `criticalDomainsAllReal` above.
  const canonicalDanger = scaleGate.blocks.some((b) => b.code !== "cash_finance_reading_missing" && b.code !== "safety_state_unavailable");
  const safeEligible =
    result.unsafeCount === 0 &&
    ingestion.criticalDomainsAllReal &&
    SAFE_DOMINANTS.has(String(dominant)) &&
    !hardRiskRed &&
    withinApprovedSOP &&
    !canonicalDanger &&
    ingestion.overallConfidence !== "low" &&
    ingestion.overallConfidence !== "none" &&
    plan.proofRequired.length > 0 &&
    plan.reassessmentTriggers.length > 0;
  const safeAction = safeEligible
    ? {
        riskLevel: (lowRiskApproved ? "low" : "medium") as "low" | "medium",
        routine: lowRiskApproved,
        reversible: true,
        withinApprovedSOP: true,
        ownerApprovalNotRequiredOrGranted: true,
        evidenceSufficient: true,
        cashImpactSafe: true,
        staffCapacityOk: true,
        customerQualityControlled: true,
        hasStopLoss: true,
        hasProofReassessment: true,
        noMaterialComplianceRisk: true,
      }
    : undefined;

  // Governed supervisor summary — a pure derivation over THIS runtime output (no new advice/model).
  const supervisor = buildSupervisorSummary({
    found: true,
    dominantConstraint: String(dominant),
    topPriorityLabel: CONSTRAINT_LABEL[dominant],
    nextBestAction: plan.nextBestAction,
    rootCause: plan.rootCause,
    doNotDo: plan.stopDoNotDoList,
    proofRequired: plan.proofRequired,
    reassessmentTriggers: plan.reassessmentTriggers,
    successMetrics: plan.successMetrics,
    redDomains: plan.domainHealthTable.filter((d) => d.status === "red").map((d) => d.domain),
    ownerApprovalRequired: plan.ownerApprovalRequired,
    ownerOffload: plan.ownerWorkloadOffload,
    delegatedWork: plan.delegatedWork,
    opsiqPreparedWork: plan.opsiqPreparedWork,
    growthScaleAllowed: plan.growth.scaleAllowed,
    growthBlockedBy: plan.growth.blockedBy,
    overallConfidence: ingestion.overallConfidence,
    criticalDomainsAllReal: ingestion.criticalDomainsAllReal,
    dataSourceMissing: ingestion.dataSourceMissing.map((d) => String(d)),
    realProviderDomains,
    assessedDomains: Object.keys(ingestion.byDomain).map((d) => String(d)),
    unsafeCount: result.unsafeCount,
    impact: {
      financeCash: plan.financeCashImpact,
      marginPricing: plan.marginPricingImpact,
      equipmentCapacity: plan.equipmentCapacityImpact,
      staffWorkload: plan.staffTrainingImpact,
      customerQuality: plan.customerReputationImpact,
    },
    ownerWorkloadOffload: plan.ownerWorkloadOffload,
    plan7Day: plan.plan7Day,
    plan30Day: plan.plan30Day,
    safeAction,
    // Read-only supporting numbers the runtime already computed from real persisted inputs (never fabricated;
    // contract-margin / net-ROAS deliberately excluded until the M3 placeholder constants are removed).
    calcs: {
      cashRunwayDays: result.supportingCalcs.cashRunwayDays,
      monthlyRevenue: result.supportingCalcs.monthlyRevenue,
      monthlyCost: result.supportingCalcs.monthlyCost,
      receivablesRisk: result.supportingCalcs.receivablesRisk,
      capacityUtilization: result.supportingCalcs.capacityUtilization,
    },
    // Specific field-level inputs the runtime needs to quantify the decision (already computed; never invented).
    missingForQuantification: result.supportingCalcs.missingForDecision,
  });

  return {
    workspaceId, businessId, found: true, generatedFromRuntime: true,
    topPriority: { constraint: dominant, label: CONSTRAINT_LABEL[dominant] },
    dominantConstraint: dominant,
    nextBestAction: plan.nextBestAction,
    rootCause: plan.rootCause,
    successMetrics: plan.successMetrics,
    impact: {
      financeCash: plan.financeCashImpact,
      marginPricing: plan.marginPricingImpact,
      equipmentCapacity: plan.equipmentCapacityImpact,
      staffWorkload: plan.staffTrainingImpact,
      customerQuality: plan.customerReputationImpact,
      operationsProcess: plan.operationsProcessImpact,
    },
    doNotDo: plan.stopDoNotDoList,
    redDomains: plan.domainHealthTable.filter((d) => d.status === "red").map((d) => d.domain),
    domainHealth: plan.domainHealthTable.map((d) => ({ domain: d.domain, status: d.status })),
    ownerWorkload: { offload: plan.ownerWorkloadOffload, delegatedWork: plan.delegatedWork, approvalRequired: plan.ownerApprovalRequired },
    proofRequired: plan.proofRequired,
    reassessmentTriggers: plan.reassessmentTriggers,
    arbitration: {
      dominantConstraint: dominant,
      ownerApprovalNeeded: arbitration.ownerApprovalNeeded,
      requiredProofToReconsider: arbitration.requiredProofToReconsider,
      rejectedCount: arbitration.rejectedAlternatives.length,
    },
    growth: { scaleAllowed: plan.growth.scaleAllowed, blockedBy: plan.growth.blockedBy, canonicalGate: { allowed: scaleGate.allowed, reasons: scaleGate.blocks.map((b) => b.reason) } },
    stage: plan.stage,
    plan: { businessHealthSummary: plan.businessHealthSummary, plan7Day: plan.plan7Day, plan30Day: plan.plan30Day, plan90Day: plan.plan90Day },
    learning: { applied: result.learningApplied, artifactIds: result.learningArtifactIds, notes: plan.learningUsed },
    data: {
      criticalDomainsRealProviderBacked: ingestion.criticalDomainsRealProviderBacked,
      criticalDomainsAllReal: ingestion.criticalDomainsAllReal,
      overallConfidence: ingestion.overallConfidence,
      dataSourceMissing: ingestion.dataSourceMissing.map((d) => String(d)),
      realProviderDomains,
    },
    collectiveScore: collective.total,
    unsafeCount: result.unsafeCount,
    supervisor,
  };
}
