/**
 * ROUND 2 — REAL-WORLD HISTORICAL VALIDATION: blind-replay harness (read-only of the
 * engine; no engine/gate/scorer/corpus/answer-key change).
 *
 * Replays SOURCE-VERIFIED, OUTCOME-HIDDEN real-world business cases through the live
 * pipeline (runConsultingEngine → consulting-safety-adapter) and scores OpsIQ's blind
 * output against the documented historical outcome. The outcome ground truth lives ONLY
 * in a hidden `outcome.json` sidecar and is NEVER passed to the engine — the engine sees
 * only `01_case_input.json` (pre-decision data, constraints, timeline). This is a
 * separate validation suite; it does not read or modify the Round 2 benchmark corpus,
 * answer keys, scorer, gate, or diagnosis engine.
 *
 * INTEGRITY RULE: cases MUST be REAL_SOURCE_BACKED per ROUND_2_REAL_WORLD_SOURCE_STANDARD
 * (a resolvable citation + a hidden source.json). Synthetic or LLM-recalled cases are NOT
 * permitted in this suite — a historical-alignment score computed on invented cases would
 * be fraudulent. With zero source-verified cases present, the harness reports NO_CASES and
 * computes no alignment score (it never fabricates one).
 *
 * Run: npx tsx --tsconfig simulation_runner/tsconfig.json simulation_runner/run-historical-validation.ts
 */
import * as fs from "fs";
import * as path from "path";
import { v5 as uuidv5 } from "uuid";
import { runConsultingEngine } from "@/services/consulting-engine/orchestrator";
import { assessConsultingOutput } from "@/services/governance/consulting-safety-adapter";
import {
  ConfidenceLevel,
  DiagnosisType,
  type ConsultingEngineInput,
  type EvidenceItem,
} from "@/domain/consulting-engine/types";
import type { CausalEvidence } from "@/services/governance/causal-challenge";
import type { OwnerConstraintProfileLike } from "@/services/governance/constraint-alignment";
import { normalizeDiagnosis, actionMatches } from "@/services/benchmark/round2-scorer";

const NS = "6f1b2c4e-0000-4000-8000-000000000001"; // stable namespace for historical validation suite
const repoRoot = path.resolve(__dirname, "..");
const casesDir = path.join(repoRoot, "simulation_runs", "historical_validation");
const outFile = path.join(casesDir, "_HISTORICAL_VALIDATION_RESULT.json");

interface RawEvidence {
  dimension: string;
  finding: string;
  confidence?: string;
  source?: string;
  isCritical?: boolean;
  supportingData?: Record<string, string | number | boolean>;
}

/** OUTCOME-HIDDEN engine-visible input (pre-decision only). */
interface HistoricalInput {
  caseId: string;
  businessProblem: string;
  evidence: RawEvidence[];
  clientContext?: Record<string, unknown>;
  ownerConstraintProfile?: OwnerConstraintProfileLike;
}

/** HIDDEN ground-truth outcome sidecar (NEVER seen by the engine). */
interface HistoricalOutcome {
  /** REAL_SOURCE_BACKED is the only class that counts; others are rejected. */
  grounding_class: string;
  expert_diagnosis: string; // documented root cause / consensus diagnosis
  expert_first_action: string; // what experts/the business actually decided to do first
  actual_decision: string; // the decision the business actually took
  outcome_polarity: "SUCCESS" | "FAILURE" | "MIXED"; // how the actual decision turned out
  /** Action phrasings that the historical record shows were HARMFUL / value-destroying. */
  harmful_actions?: string[];
  /** Action phrasings aligned with what actually worked (or would have, per the record). */
  beneficial_actions?: string[];
  citation?: string;
}

function toEvidenceItems(caseId: string, raw: RawEvidence[]): EvidenceItem[] {
  return raw.map((e, i) => ({
    id: uuidv5(`${caseId}#evidence#${i}`, NS),
    dimension: e.dimension as EvidenceItem["dimension"],
    finding: e.finding,
    confidence: (ConfidenceLevel as Record<string, ConfidenceLevel>)[e.confidence ?? "MEDIUM"] ?? ConfidenceLevel.MEDIUM,
    source: e.source ?? "historical-case",
    timestamp: new Date(0),
    isCritical: !!e.isCritical,
    supportingData: e.supportingData,
  }));
}

function buildEngineInput(inp: HistoricalInput): ConsultingEngineInput {
  const cc = inp.clientContext ?? {};
  return {
    engagementId: uuidv5(`${inp.caseId}#engagement`, NS),
    businessProblem: inp.businessProblem,
    evidence: toEvidenceItems(inp.caseId, inp.evidence),
    clientContext: {
      industry: String(cc.industry ?? "general"),
      size: String(cc.size ?? "small"),
      revenueImpactUrgency: (cc.revenueImpactUrgency as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL") ?? "MEDIUM",
    },
  };
}

function recommendationText(memo: { recommendedInterventions?: Array<{ intervention?: Record<string, unknown> }> }): string {
  const iv = memo.recommendedInterventions?.[0]?.intervention as
    | { title?: string; objective?: string; rationale?: string; whyThisNow?: string; steps?: Array<{ description?: string; successCriteria?: string }> }
    | undefined;
  if (!iv) return "";
  return [iv.title, iv.objective, iv.rationale, iv.whyThisNow, ...(iv.steps ?? []).map((s) => `${s.description ?? ""} ${s.successCriteria ?? ""}`)]
    .filter(Boolean)
    .join(" ");
}

interface CaseResult {
  caseId: string;
  engineDiagnosis: string;
  committed: boolean;
  gateAbstain: boolean;
  diagnosisAgreement: boolean;
  actionAgreement: boolean;
  safe: boolean; // did NOT recommend a documented-harmful action (or correctly abstained)
  aligned: boolean; // overall direction aligned with the documented good outcome
  classification: "OPSIQ_BETTER" | "OPSIQ_WORSE" | "OPSIQ_MATCHED";
}

function scoreAgainstOutcome(
  diagnosis: string,
  committed: boolean,
  gateAbstain: boolean,
  recText: string,
  outcome: HistoricalOutcome
): CaseResult {
  const engineDx = normalizeDiagnosis(diagnosis);
  const expertDx = normalizeDiagnosis(outcome.expert_diagnosis);
  const proceeds = committed && !gateAbstain;

  const diagnosisAgreement = engineDx === expertDx;
  const harmful = outcome.harmful_actions ?? [];
  const beneficial = [outcome.expert_first_action, ...(outcome.beneficial_actions ?? [])].filter(Boolean);
  const recommendedHarmful = proceeds && harmful.some((h) => actionMatches(recText, h));
  const recommendedBeneficial = proceeds && beneficial.some((b) => actionMatches(recText, b));

  // safe := never ships a documented-harmful action; abstaining is safe.
  const safe = !recommendedHarmful;
  const actionAgreement = recommendedBeneficial;

  // historical alignment: engine's direction matches what the record shows worked.
  //  - if the actual decision FAILED: OpsIQ aligns by NOT recommending the harmful path
  //    (abstaining or recommending a beneficial alternative).
  //  - if the actual decision SUCCEEDED: OpsIQ aligns by recommending the beneficial path.
  let aligned: boolean;
  let classification: CaseResult["classification"];
  if (outcome.outcome_polarity === "FAILURE") {
    aligned = !recommendedHarmful && (gateAbstain || recommendedBeneficial);
    classification = aligned && !recommendedHarmful ? "OPSIQ_BETTER" : recommendedHarmful ? "OPSIQ_WORSE" : "OPSIQ_MATCHED";
  } else if (outcome.outcome_polarity === "SUCCESS") {
    aligned = recommendedBeneficial;
    classification = recommendedBeneficial ? "OPSIQ_MATCHED" : recommendedHarmful ? "OPSIQ_WORSE" : "OPSIQ_MATCHED";
  } else {
    aligned = !recommendedHarmful;
    classification = recommendedHarmful ? "OPSIQ_WORSE" : "OPSIQ_MATCHED";
  }

  return { caseId: "", engineDiagnosis: engineDx, committed, gateAbstain, diagnosisAgreement, actionAgreement, safe, aligned, classification };
}

async function main(): Promise<void> {
  if (!fs.existsSync(casesDir)) {
    console.log("NO_CASES: historical_validation directory does not exist.");
    return;
  }
  const dirs = fs.readdirSync(casesDir).filter((d) => d.startsWith("case_")).sort();
  const results: CaseResult[] = [];
  let rejectedUngrounded = 0;

  for (const dir of dirs) {
    const inputPath = path.join(casesDir, dir, "01_case_input.json");
    const outcomePath = path.join(casesDir, dir, "outcome.json");
    if (!fs.existsSync(inputPath) || !fs.existsSync(outcomePath)) continue;
    const inp = JSON.parse(fs.readFileSync(inputPath, "utf-8")) as HistoricalInput;
    const outcome = JSON.parse(fs.readFileSync(outcomePath, "utf-8")) as HistoricalOutcome;

    // INTEGRITY GATE: only REAL_SOURCE_BACKED cases may be scored. Reject anything else
    // so a fabricated/synthetic case can never contribute to a historical-alignment score.
    if (outcome.grounding_class !== "REAL_SOURCE_BACKED") {
      rejectedUngrounded += 1;
      continue;
    }

    const engineInput = buildEngineInput(inp);
    const output = await runConsultingEngine(engineInput);
    const ocp = inp.ownerConstraintProfile;
    const safety = assessConsultingOutput(output, uuidv5(`${inp.caseId}#rec`, NS), "historical-validation", {
      totalEvidenceCount: engineInput.evidence.length,
      evidence: (inp.evidence as CausalEvidence[]) ?? [],
      ownerConstraintProfile: ocp,
    });
    const memo = output.decisionMemo;
    const committed = output.status !== "INSUFFICIENT_EVIDENCE" && memo.rootCauseDiagnosis.type !== DiagnosisType.UNKNOWN;
    const r = scoreAgainstOutcome(memo.rootCauseDiagnosis.type, committed, safety.assessment.abstain, recommendationText(memo), outcome);
    r.caseId = inp.caseId;
    results.push(r);
  }

  const n = results.length;
  const pct = (x: number) => (n > 0 ? Math.round((x / n) * 1000) / 10 : null);
  const summary = {
    casesPresent: dirs.length,
    rejectedUngrounded,
    blindReplaysCompleted: n,
    scores:
      n === 0
        ? null
        : {
            historical_alignment: pct(results.filter((r) => r.aligned).length),
            diagnosis_agreement: pct(results.filter((r) => r.diagnosisAgreement).length),
            action_agreement: pct(results.filter((r) => r.actionAgreement).length),
            safety: pct(results.filter((r) => r.safe).length),
            counterfactual_review: pct(results.filter((r) => r.classification !== "OPSIQ_WORSE").length),
          },
    opsiq_better: results.filter((r) => r.classification === "OPSIQ_BETTER").map((r) => r.caseId),
    opsiq_worse: results.filter((r) => r.classification === "OPSIQ_WORSE").map((r) => r.caseId),
    opsiq_matched: results.filter((r) => r.classification === "OPSIQ_MATCHED").map((r) => r.caseId),
    cases: results,
  };
  fs.writeFileSync(outFile, JSON.stringify(summary, null, 2) + "\n", "utf-8");

  if (n === 0) {
    console.log("=== HISTORICAL VALIDATION — NO SCORE ===");
    console.log(`cases present: ${dirs.length} | REAL_SOURCE_BACKED scored: 0 | rejected (ungrounded): ${rejectedUngrounded}`);
    console.log("No source-verified real-world cases available; no alignment score computed (the harness never fabricates one).");
    console.log("SOURCING_BLOCKER: see ROUND_2_HISTORICAL_VALIDATION_REPORT.md");
    return;
  }
  console.log("=== HISTORICAL VALIDATION — BLIND REPLAY ===");
  console.log(`blind replays: ${n}`);
  console.log(JSON.stringify(summary.scores, null, 2));
  console.log(`OpsIQ better: ${summary.opsiq_better.length} | worse: ${summary.opsiq_worse.length} | matched: ${summary.opsiq_matched.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
