/**
 * Standalone public-corpus LEARNING PERSISTENCE loop.
 *
 * Runs public cases through a deliberately weak advisor to surface failures, then for each failure:
 * classifies it, derives a GOVERNED correction artifact + regression case (via the validated learning
 * engine), persists it to the governed store, regenerates domain + whole-business playbooks + do-not-
 * repeat rules, reruns the corrected advisor and proves the output improved. Governance is preserved:
 * artifacts are workspace_private + local_only + pending (no auto global promotion), scope-limited, and
 * never learned from holdout cases. Nothing here weakens a scorer or gate.
 */
import { genericAdvise, advise } from "../advisor";
import { scoreAdvice } from "../scorer";
import { learnFromFailure, deriveCorrection } from "../learning-engine";
import { InMemoryLearningStore, type LearningStore } from "../learning-store";
import type { LearningArtifact } from "../schema";
import { PUBLIC_CORPUS } from "./library";
import type { PublicCase } from "./schema";
import { findPII, hasLongCopiedText } from "./source-register";

const AT = "2026-06-29T00:00:00Z";

export interface LearningPersistenceReport {
  workspaceId: string;
  casesProcessed: number;
  artifactsPersisted: number;
  domainPlaybooks: number;
  wholeBusinessPlaybooks: number;
  regressionCases: number;
  doNotRepeatRules: number;
  cautionRules: number;
  proofRules: number;
  offloadRules: number;
  rerunImprovements: number;
  artifactsAllScopeLimited: boolean;
  artifactsAllLocalPending: boolean;
  noHoldoutLearned: boolean;
  noCrossWorkspaceLeak: boolean;
  noSourceTextLeak: boolean;
  store: LearningStore;
}

const isHoldout = (pc: PublicCase) => pc.meta.split === "holdout";

/**
 * Run the governed learning loop over the training/regression/validation splits (NEVER holdout).
 * `limit` caps the number of cases for speed; the loop is deterministic.
 */
export async function runPublicLearningLoop(opts: { limit?: number; workspaceId?: string } = {}): Promise<LearningPersistenceReport> {
  const workspaceId = opts.workspaceId ?? "public-learn-ws";
  const otherWs = "public-learn-other-ws";
  const store = new InMemoryLearningStore();

  // learn ONLY from non-holdout splits (holdout is reserved for unbiased scoring)
  const learnable = PUBLIC_CORPUS.filter((pc) => !isHoldout(pc) && (pc.meta.split === "training" || pc.meta.split === "regression" || pc.meta.split === "validation"));
  // sample ACROSS the corpus (stride) so every pattern/domain is represented, not just the first plays
  const stride = opts.limit ? Math.max(1, Math.floor(learnable.length / opts.limit)) : 1;
  const cases = learnable.filter((_, i) => i % stride === 0);

  const domainPlaybooks = new Set<string>();
  const wholeBusinessPlaybooks = new Set<string>();
  const doNotRepeat = new Set<string>();
  const caution = new Set<string>();
  const proof = new Set<string>();
  const offload = new Set<string>();
  const regressionIds = new Set<string>();
  let artifacts = 0;
  let rerunImprovements = 0;
  let scopeLimited = 0;
  let localPending = 0;
  let sourceTextLeak = false;
  const persisted: LearningArtifact[] = [];

  for (const pc of cases) {
    const c = pc.case;
    // 1) weak advisor fails → a real failure to learn from
    const weak = scoreAdvice(c, genericAdvise());
    const correction = deriveCorrection(c, weak, { workspaceId, actor: "public-learning", at: AT });
    if (!correction) continue;
    await learnFromFailure(c, weak, store, { workspaceId, actor: "public-learning", at: AT });
    artifacts++;
    persisted.push(correction.artifact);

    // 2) governance + provenance bookkeeping
    const a = correction.artifact;
    if (a.applicabilityScope.archetype !== null || a.applicabilityScope.decisionCategory !== null || a.applicabilityScope.locationKey !== null) scopeLimited++;
    if (a.scope === "local_only" && a.approvalStatus === "pending" && a.privacyClassification === "workspace_private") localPending++;
    const blob = `${a.correctedBehavior} ${a.originalFailedBehavior}`;
    if (findPII(blob).length > 0 || hasLongCopiedText(a.correctedBehavior)) sourceTextLeak = true;

    // 3) playbooks + rules + regression
    for (const d of pc.meta.domains) domainPlaybooks.add(d);
    wholeBusinessPlaybooks.add(pc.meta.patternId);
    doNotRepeat.add(`${a.failureLabel}|${pc.meta.businessCategory}`);
    caution.add(`${a.failureLabel}|${a.riskLevel}`);
    if (pc.case.proofRequired[0]) proof.add(`${pc.meta.patternId}|${pc.case.proofRequired[0]}`);
    if (a.failureLabel === "owner_workload_increased" || pc.meta.dominantConstraint === "owner_workload") offload.add(`${pc.meta.businessCategory}|${pc.meta.patternId}`);
    regressionIds.add(correction.regressionCase.id);

    // 4) rerun the corrected advisor — prove improvement over the weak advice
    const improved = scoreAdvice(c, await advise(c, { store, workspaceId }));
    if (improved.total > weak.total) rerunImprovements++;
  }

  // 5) governance proofs: no cross-workspace visibility; global promotion blocked (all local/pending)
  const otherVisible = await store.findApplicable({
    archetype: cases[0]?.case.archetype ?? "laundry_dry_cleaning",
    decisionCategory: cases[0]?.case.decisionCategory ?? "cash_margin_working_capital",
    locationKey: "India|tier1", workspaceId: otherWs,
  });
  const noHoldoutLearned = persisted.every((a) => !a.sourceCaseId.includes("holdout") && !PUBLIC_CORPUS.some((pc) => isHoldout(pc) && pc.case.id === a.sourceCaseId));

  return {
    workspaceId,
    casesProcessed: cases.length,
    artifactsPersisted: artifacts,
    domainPlaybooks: domainPlaybooks.size,
    wholeBusinessPlaybooks: wholeBusinessPlaybooks.size,
    regressionCases: regressionIds.size,
    doNotRepeatRules: doNotRepeat.size,
    cautionRules: caution.size,
    proofRules: proof.size,
    offloadRules: offload.size,
    rerunImprovements,
    artifactsAllScopeLimited: scopeLimited === artifacts,
    artifactsAllLocalPending: localPending === artifacts,
    noHoldoutLearned,
    noCrossWorkspaceLeak: otherVisible.length === 0,
    noSourceTextLeak: !sourceTextLeak,
    store,
  };
}
