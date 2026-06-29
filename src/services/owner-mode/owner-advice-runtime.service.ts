/**
 * Production owner-advice runtime (foundation) — slice F.
 *
 * The validated whole-business expert behaviour, exposed as a production service rather than harness
 * code. It ingests a workspace-scoped business context, reads stored learning artifacts (workspace
 * private; no cross-workspace leakage), runs cross-domain arbitration, and returns ONE integrated
 * whole-business operating plan plus its collective score.
 *
 * This is the smallest safe composition foundation: it reuses the existing validated engines
 * (advisor, arbitration, whole-plan, collective scorer) and the persistent learning store. It does
 * NOT duplicate engines. Full per-domain ingestion from every owner-mode DB service is the documented
 * production gap; the context contract below is the seam those services populate.
 */
import { advise } from "@/behavioral-validation/advisor";
import { detectUnsafe } from "@/behavioral-validation/scorer";
import { ingestBusinessState, type DomainIngestionReport, type OwnerDomainProviders } from "./owner-domain-ingestion";
import { type ArbitrationResult, type Constraint } from "@/behavioral-validation/whole-business/arbitration";
import { buildWholeBusinessPlan, type WholeBusinessPlan } from "@/behavioral-validation/whole-business/whole-plan";
import { scoreCollectivePlan, type CollectiveScore } from "@/behavioral-validation/whole-business/collective-scorer";
import type { LearningStore } from "@/behavioral-validation/learning-store";
import {
  behavioralCaseSchema,
  type BehavioralCase,
  type BusinessArchetype,
  type CaseFlags,
  type DecisionCategory,
  type LocationContext,
} from "@/behavioral-validation/schema";

/** Real business state the runtime reasons over. In production these fields are assembled from the
 *  owner-mode domain services (finance, capacity, compliance, etc.) for one workspace+business. */
export interface OwnerBusinessContext {
  businessType: string;
  archetype: BusinessArchetype;
  decisionCategory: DecisionCategory;
  location: LocationContext;
  ownerGoal: string;
  numbers: Record<string, number | string>;
  riskFlags: Partial<CaseFlags>;
  messyFacts: string[];
  /** Optional caller-declared expert top priority (used only for validation scoring, never to drive advice). */
  expectedTopPriority?: Constraint;
}

export interface OwnerAdviceRequest {
  workspaceId: string;
  context: OwnerBusinessContext;
}

export interface OwnerAdviceRuntimeDeps {
  store: LearningStore;
  /** Optional real DB/service-backed domain providers (production wires the owner-mode services here). */
  providers?: OwnerDomainProviders;
}

export interface OwnerAdviceResult {
  workspaceId: string;
  plan: WholeBusinessPlan;
  arbitration: ArbitrationResult;
  collective: CollectiveScore;
  learningApplied: boolean;
  learningArtifactIds: string[];
  unsafeCount: number;
  ingestion: DomainIngestionReport;
}

const FULL_FLAGS = (p: Partial<CaseFlags>): CaseFlags => ({
  hostile: false, missingOrStaleData: false, cashRisk: false, capacityRisk: false,
  complianceRisk: false, ownerEmotional: false, remoteOwner: false, multiBranch: false, ...p,
});

/** Map a production business context to the internal case the validated engines consume. The
 *  answer-key fields are placeholders the advisor never reads — the runtime has no gold answer, it
 *  generates advice for live input. */
export function contextToCase(ctx: OwnerBusinessContext, id = "runtime-case"): BehavioralCase {
  const root = ctx.messyFacts[0] ?? `${ctx.businessType} decision: ${ctx.decisionCategory}`;
  const placeholder = "Resolved at runtime from the observed business signals.";
  const candidate: BehavioralCase = {
    id,
    sourceSeedCaseId: id,
    title: `${ctx.businessType} — ${ctx.decisionCategory}`,
    archetype: ctx.archetype,
    businessType: ctx.businessType,
    decisionCategory: ctx.decisionCategory,
    ownerGoal: ctx.ownerGoal,
    location: ctx.location,
    messyFacts: ctx.messyFacts.length ? ctx.messyFacts : [root],
    numbers: ctx.numbers,
    hiddenRootCause: placeholder,
    temptingBadDecision: placeholder,
    correctExpertDecision: placeholder,
    opsiqShouldSay: [placeholder],
    opsiqShouldBlock: [placeholder],
    proofRequired: [placeholder],
    reassessmentTrigger: placeholder,
    learningRuleIfFails: placeholder,
    flags: FULL_FLAGS(ctx.riskFlags),
  };
  return behavioralCaseSchema.parse(candidate);
}

/**
 * Run the production owner-advice runtime: workspace-scoped, learning-aware, arbitration-driven,
 * returning one whole-business operating plan. Reads (never writes) the learning store.
 */
export async function runOwnerAdvice(req: OwnerAdviceRequest, deps: OwnerAdviceRuntimeDeps): Promise<OwnerAdviceResult> {
  if (!req.workspaceId) throw new Error("owner-advice runtime requires a workspaceId (workspace scope)");
  const c = contextToCase(req.context, `${req.workspaceId}-case`);
  // advise() queries the store for active, in-scope, workspace-private artifacts only → no leakage.
  const advice = await advise(c, { store: deps.store, workspaceId: req.workspaceId });
  const learningArtifactIds = advice.learningNotesApplied ?? [];

  // Per-domain ingestion: which domain state is real (db/service/context) vs DATA_SOURCE_MISSING.
  const ingestion = ingestBusinessState(req.context, {
    providers: deps.providers,
    learningStore: deps.store,
    hasLearningArtifacts: learningArtifactIds.length > 0,
  });
  // Missing critical domain data lowers the runtime's stated confidence (never hidden).
  if (ingestion.overallConfidence === "low") advice.dataConfidence = "low";

  const plan = buildWholeBusinessPlan(c, advice);
  const arbitration = plan.arbitration;
  const collective = scoreCollectivePlan(plan, req.context.expectedTopPriority);
  return {
    workspaceId: req.workspaceId,
    plan,
    arbitration,
    collective,
    learningApplied: learningArtifactIds.length > 0,
    learningArtifactIds,
    unsafeCount: detectUnsafe(c, advice).length,
    ingestion,
  };
}

/** A compact summary the command center can surface above the full plan. */
export function commandCenterSummary(result: OwnerAdviceResult): {
  topPriority: string;
  nextAction: string;
  doNotDo: string[];
  ownerApprovalRequired: boolean;
  redDomains: string[];
  collectiveScore: number;
} {
  return {
    topPriority: result.plan.highestPriorityConstraint,
    nextAction: result.plan.nextBestAction,
    doNotDo: result.plan.stopDoNotDoList.slice(0, 5),
    ownerApprovalRequired: result.plan.ownerApprovalRequired,
    redDomains: result.plan.domainHealthTable.filter((d) => d.status === "red").map((d) => d.domain),
    collectiveScore: result.collective.total,
  };
}
