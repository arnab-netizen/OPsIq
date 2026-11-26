/**
 * CHAOS REPLAY runtime — runs a real-world chaos scenario through the APPROVED production runtime and
 * captures the supervisor output for the auditor. It reuses `runOwnerAdvice` (advisor + arbitration +
 * whole-plan + collective scorer + learning + domain ingestion) exactly as production does, then
 * reproduces the production `owner-whole-business-plan.service` mapping (plan + ingestion + arbitration →
 * SupervisorInput → buildSupervisorSummary) so the captured supervisor summary is genuine runtime output —
 * never a static/harness fallback.
 *
 * The runtime is NOT influenced by the auditor: replay produces output FIRST; the auditor reads it AFTER.
 */
import { runOwnerAdvice, type OwnerAdviceResult } from "@/services/owner-mode/owner-advice-runtime.service";
import { caseToContext } from "../whole-business/production-runner";
import type { LearningStore } from "../learning-store";
import type { Constraint } from "../whole-business/arbitration";
import type { PublicCase } from "../public-cases/schema";
import { buildSupervisorSummary, type SupervisorInput, type SupervisorSummary } from "@/domain/owner-mode/supervisor-summary";

/** Display label for the dominant constraint — mirrors the production service (display only). */
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

/** Reproduce the production service mapping: runtime result → SupervisorInput. */
export function runtimeToSupervisorInput(result: OwnerAdviceResult): SupervisorInput {
  const { plan, ingestion } = result;
  const dominant = plan.arbitration.dominantConstraint;
  const realProviderDomains = (Object.keys(ingestion.byDomain) as Array<keyof typeof ingestion.byDomain>)
    .filter((d) => ingestion.byDomain[d].realData === true)
    .map((d) => String(d));
  return {
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
  };
}

export interface ChaosReplayResult {
  scenarioId: string;
  workspaceId: string;
  businessId: string;
  producedFromRuntime: true;
  dominantConstraint: string;
  modulesUsed: string[];
  acceptedModules: string[];
  rejectedModules: Array<{ action: string; blockedBy: string; reason: string }>;
  realProviderDomains: string[];
  dataSourceMissing: string[];
  criticalDomainsAllReal: boolean;
  overallConfidence: string;
  unsafeCount: number;
  learningApplied: boolean;
  supervisor: SupervisorSummary;
  /** Retained raw runtime outputs for the auditor (read-only). */
  runtime: {
    nextBestAction: string;
    whatNotToDo: string[];
    proofRequired: string[];
    reassessmentTriggers: string[];
    ownerApprovalRequired: boolean;
    impact: { financeCash: string; marginPricing: string; staffWorkload: string; customerQuality: string };
    collectiveTotal: number;
    learningArtifactIds: string[];
  };
}

/** Deterministic per-scenario ids — isolate every scenario into its own workspace+business. */
export function scenarioIds(scenarioId: string): { workspaceId: string; businessId: string } {
  return { workspaceId: `chaos-ws-${scenarioId}`, businessId: `chaos-biz-${scenarioId}` };
}

/**
 * Replay ONE scenario through the production runtime. The PublicCase carries the case state; the dominant
 * constraint anchor is supplied as the expected top priority exactly as the corpus runner does.
 */
export async function replayScenario(pc: PublicCase, store: LearningStore): Promise<ChaosReplayResult> {
  const scenarioId = `CHAOS-${pc.meta.caseId}`;
  const { workspaceId, businessId } = scenarioIds(scenarioId);
  const result = await runOwnerAdvice(
    { workspaceId, context: caseToContext(pc.case, pc.meta.dominantConstraint) },
    { store },
  );
  const supervisor = buildSupervisorSummary(runtimeToSupervisorInput(result));
  return {
    scenarioId,
    workspaceId,
    businessId,
    producedFromRuntime: true,
    dominantConstraint: String(result.plan.arbitration.dominantConstraint),
    modulesUsed: Object.keys(result.ingestion.byDomain).map(String),
    acceptedModules: result.arbitration.acceptedAlternatives.map((a) => a.action),
    rejectedModules: result.arbitration.rejectedAlternatives.map((r) => ({
      action: r.candidate.action, blockedBy: String(r.blockedBy), reason: r.reason,
    })),
    realProviderDomains: (Object.keys(result.ingestion.byDomain) as Array<keyof typeof result.ingestion.byDomain>)
      .filter((d) => result.ingestion.byDomain[d].realData === true).map(String),
    dataSourceMissing: result.ingestion.dataSourceMissing.map(String),
    criticalDomainsAllReal: result.ingestion.criticalDomainsAllReal,
    overallConfidence: result.ingestion.overallConfidence,
    unsafeCount: result.unsafeCount,
    learningApplied: result.learningApplied,
    supervisor,
    runtime: {
      nextBestAction: result.plan.nextBestAction,
      whatNotToDo: result.plan.stopDoNotDoList,
      proofRequired: result.plan.proofRequired,
      reassessmentTriggers: result.plan.reassessmentTriggers,
      ownerApprovalRequired: result.plan.ownerApprovalRequired,
      impact: {
        financeCash: result.plan.financeCashImpact,
        marginPricing: result.plan.marginPricingImpact,
        staffWorkload: result.plan.staffTrainingImpact,
        customerQuality: result.plan.customerReputationImpact,
      },
      collectiveTotal: result.collective.total,
      learningArtifactIds: result.learningArtifactIds,
    },
  };
}

// ─── Locked expected-outcome contract (§6) ─────────────────────────────────────────────────────────
import type { ChaosScenario } from "./chaos-schema";

export interface LockedExpectation {
  readonly scenarioId: string;
  readonly lockHash: string;
  readonly expectation: Readonly<ChaosScenario>;
}

/** A stable, order-independent hash of the expectation content (FNV-1a; no Date/random). */
export function hashExpectation(scenario: ChaosScenario): string {
  const json = JSON.stringify(scenario, Object.keys(scenario).sort());
  let h = 0x811c9dc5;
  for (let i = 0; i < json.length; i++) {
    h ^= json.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

function deepFreeze<T>(o: T): T {
  if (o && typeof o === "object") {
    Object.values(o as Record<string, unknown>).forEach(deepFreeze);
    Object.freeze(o);
  }
  return o;
}

/** Lock a scenario's expectation BEFORE replay output exists. The returned object is deeply frozen so the
 *  auditor cannot mutate it; the hash detects any post-output tampering. */
export function lockExpectations(scenario: ChaosScenario): LockedExpectation {
  const expectation = deepFreeze(JSON.parse(JSON.stringify(scenario)) as ChaosScenario);
  return Object.freeze({ scenarioId: scenario.scenarioId, lockHash: hashExpectation(expectation), expectation });
}
