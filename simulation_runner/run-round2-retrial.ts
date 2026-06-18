/**
 * Round 2 — R0 full-pipeline re-trial harness (deterministic, reproducible).
 *
 * For every authored Round 2 case it:
 *   1. maps the case input → ConsultingEngineInput (deterministic uuid v5 ids),
 *   2. runs the REAL runConsultingEngine (no engine change),
 *   3. runs the REAL consulting-safety-adapter (frozen abstain-only gate),
 *   4. FREEZES one immutable bundle per case under
 *      simulation_runs/round_002_retrial_current/case_<id>/ (engine output +
 *      safety assessment + deterministic scored facts) — it NEVER writes into
 *      simulation_runs/round_002/ (inputs/keys are preserved untouched),
 *   5. scores the frozen facts against the hidden key with the R0 six-axis
 *      scorer (round2-scorer.ts), and
 *   6. emits the corpus score, failure flags, and the two reports.
 *
 * Held-out: the documented real-world outcome / provenance in each key is NOT
 * read into scoring (blind validation). Determinism: engagement/evidence ids are
 * uuid v5 over a fixed namespace; the engine's internal intervention uuids are
 * randomized but do NOT affect any axis score, so every score and report is
 * reproducible. No /tmp, no network, no LLM.
 *
 * Usage:
 *   npx tsx --tsconfig simulation_runner/tsconfig.json simulation_runner/run-round2-retrial.ts [--round 002]
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
import {
  scoreCase,
  aggregateCorpus,
  type EngineRunFacts,
  type CaseKeyFacts,
  type CaseScore,
  type CorpusScore,
} from "@/services/benchmark/round2-scorer";

// Fixed namespace (RFC-4122 DNS namespace) so all derived uuids are stable
// across runs (deterministic v5 derivation).
const NS = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";

const args = process.argv.slice(2);
const round = (args.includes("--round") ? args[args.indexOf("--round") + 1] : undefined) ?? "002";
// --label selects the output directory suffix so a re-trial (e.g. an engine-fix
// variant) writes to its own frozen dir and never overwrites the committed R0
// baseline. The default `current` preserves the original R0 behavior. The two R0
// markdown reports are (re)written ONLY for the `current` label; other labels emit
// their own corpus-score JSON and leave the R0 reports untouched.
const label = (args.includes("--label") ? args[args.indexOf("--label") + 1] : undefined) ?? "current";
const repoRoot = path.resolve(__dirname, "..");
const roundDir = path.join(repoRoot, "simulation_runs", `round_${round}`);
const outDir = path.join(repoRoot, "simulation_runs", `round_${round}_retrial_${label}`);

interface RawEvidence {
  dimension: string;
  finding: string;
  confidence?: string;
  source?: string;
  isCritical?: boolean;
  supportingData?: Record<string, string | number | boolean>;
}

function toEvidenceItems(caseId: string, raw: RawEvidence[]): EvidenceItem[] {
  return raw.map((e, i) => ({
    id: uuidv5(`${caseId}#evidence#${i}`, NS),
    dimension: e.dimension as EvidenceItem["dimension"],
    finding: e.finding,
    confidence: (ConfidenceLevel as Record<string, ConfidenceLevel>)[e.confidence ?? "MEDIUM"] ?? ConfidenceLevel.MEDIUM,
    source: e.source ?? "round2-case",
    timestamp: new Date(0),
    isCritical: !!e.isCritical,
    supportingData: e.supportingData,
  }));
}

function toCausalEvidence(raw: RawEvidence[]): CausalEvidence[] {
  return raw.map((e) => ({
    dimension: e.dimension,
    finding: e.finding,
    isCritical: !!e.isCritical,
    supportingData: e.supportingData,
  }));
}

function buildEngineInput(caseId: string, input: Record<string, unknown>): ConsultingEngineInput {
  const rawEvidence = (input.evidence as RawEvidence[]) ?? [];
  const cc = (input.clientContext as Record<string, unknown>) ?? {};
  return {
    engagementId: uuidv5(`${caseId}#engagement`, NS),
    businessProblem: String(input.businessProblem ?? ""),
    evidence: toEvidenceItems(caseId, rawEvidence),
    clientContext: {
      industry: String(cc.industry ?? input.industry ?? "general"),
      size: String(cc.size ?? "small"),
      revenueImpactUrgency:
        (cc.revenueImpactUrgency as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL") ?? "MEDIUM",
    },
  };
}

function recommendationText(memo: { recommendedInterventions?: Array<{ intervention?: Record<string, unknown> }> }): string | null {
  const iv = memo.recommendedInterventions?.[0]?.intervention as
    | {
        title?: string;
        objective?: string;
        rationale?: string;
        whyThisNow?: string;
        steps?: Array<{ description?: string; successCriteria?: string }>;
      }
    | undefined;
  if (!iv) return null;
  return [
    iv.title,
    iv.objective,
    iv.rationale,
    iv.whyThisNow,
    ...(iv.steps ?? []).map((s) => `${s.description ?? ""} ${s.successCriteria ?? ""}`),
  ]
    .filter(Boolean)
    .join(" ");
}

function toKeyFacts(key: Record<string, unknown>): CaseKeyFacts {
  return {
    truePrimaryDiagnosis: String(key.true_primary_diagnosis ?? "unknown"),
    trueSecondaryDiagnosis: key.true_secondary_diagnosis
      ? String(key.true_secondary_diagnosis)
      : undefined,
    expectedGateOutcome:
      (key.expected_gate_outcome as "PROCEED" | "ABSTAIN") ?? "PROCEED",
    expectedSafetyLabel:
      (key.expected_safety_label as CaseKeyFacts["expectedSafetyLabel"]) ??
      "SAFE_TO_PROCEED",
    abstentionEligible: !!key.abstention_eligible,
    expectedFirstAction: String(key.expected_first_action ?? ""),
    acceptableFirstActions: (key.acceptable_first_actions as string[]) ?? [],
    unsafeFirstActions: (key.unsafe_first_actions as string[]) ?? [],
  };
}

function writeJson(file: string, data: unknown): void {
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

async function main(): Promise<void> {
  const caseDirs = fs
    .readdirSync(roundDir)
    .filter((d) => d.startsWith("case_"))
    .sort();

  // Fresh re-trial output dir (never the round_002 inputs/keys dir).
  fs.mkdirSync(outDir, { recursive: true });

  const scores: CaseScore[] = [];

  for (const dir of caseDirs) {
    const inputPath = path.join(roundDir, dir, "01_case_input.json");
    const keyPath = path.join(roundDir, dir, "key.json");
    if (!fs.existsSync(inputPath) || !fs.existsSync(keyPath)) continue;

    const input = JSON.parse(fs.readFileSync(inputPath, "utf-8")) as Record<string, unknown>;
    const key = JSON.parse(fs.readFileSync(keyPath, "utf-8")) as Record<string, unknown>;
    const caseId = String(input.caseId ?? dir.replace(/^case_/, ""));

    const engineInput = buildEngineInput(caseId, input);
    const output = await runConsultingEngine(engineInput);

    const ocp = input.ownerConstraintProfile as OwnerConstraintProfileLike | undefined;
    const safety = assessConsultingOutput(
      output,
      uuidv5(`${caseId}#recommendation`, NS),
      "round2-retrial",
      {
        totalEvidenceCount: engineInput.evidence.length,
        evidence: toCausalEvidence((input.evidence as RawEvidence[]) ?? []),
        ownerConstraintProfile: ocp,
      }
    );

    const memo = output.decisionMemo;
    const committed =
      output.status !== "INSUFFICIENT_EVIDENCE" &&
      memo.rootCauseDiagnosis.type !== DiagnosisType.UNKNOWN;

    const facts: EngineRunFacts = {
      committed,
      status: output.status,
      primaryDiagnosis: memo.rootCauseDiagnosis.type,
      diagnosisConfidence: memo.diagnosisConfidence,
      evidenceIdsUsedCount: memo.rootCauseDiagnosis.evidenceIds?.length ?? 0,
      totalEvidenceCount: engineInput.evidence.length,
      recommendationText: recommendationText(memo),
      gateAbstain: safety.assessment.abstain,
      constraintConflict: safety.constraint_alignment.conflict,
    };

    const keyFacts = toKeyFacts(key);
    const score = scoreCase(caseId, facts, keyFacts);
    scores.push(score);

    // Freeze the per-case bundle (immutable record of THIS re-trial).
    const caseOut = path.join(outDir, `case_${caseId}`);
    fs.mkdirSync(caseOut, { recursive: true });
    writeJson(path.join(caseOut, "engine_output.json"), {
      status: output.status,
      warnings: output.warnings,
      decisionMemo: output.decisionMemo,
    });
    writeJson(path.join(caseOut, "safety_assessment.json"), {
      inputs: safety.inputs,
      assessment: safety.assessment,
      escalation_required: safety.escalation_required,
      causal_challenge: safety.causal_challenge,
      constraint_alignment: safety.constraint_alignment,
      decision: safety.decision,
    });
    writeJson(path.join(caseOut, "scored_facts.json"), { facts, score });
  }

  const corpus = aggregateCorpus(scores);
  writeJson(path.join(outDir, "_CORPUS_SCORE.json"), corpus);
  writeJson(
    path.join(outDir, "_FAILURE_FLAGS.json"),
    Object.fromEntries(Object.entries(corpus.flags).map(([k, v]) => [k, v]))
  );

  // Only the canonical R0 run rewrites the R0 markdown reports; labeled variants
  // (e.g. r1_lexical_hardening) leave them untouched and are reported separately.
  if (label === "current") writeReports(corpus, scores);
  printSummary(corpus, scores.length);
}

// ─── Report generation (deterministic markdown from the aggregate) ────────────

function pct(rate: number | null): string {
  return rate === null ? "n/a" : `${(rate * 100).toFixed(1)}%`;
}

const AXIS_LABELS: Array<[keyof CorpusScore["axes"], string]> = [
  ["diagnosis", "1. Diagnosis correctness"],
  ["evidenceUse", "2. Evidence use"],
  ["firstAction", "3. First-action correctness"],
  ["constraintFit", "4. Owner-constraint fit"],
  ["safetyOutcome", "5. Safety outcome"],
  ["abstention", "6. Abstention correctness"],
];

const FLAG_LABELS: Array<[keyof CorpusScore["flags"], string]> = [
  ["unsafe_proceed", "Unsafe proceed (proceeded when must abstain)"],
  ["dangerous_proceed", "DANGEROUS proceed (proceeded on a dangerous action)"],
  ["over_abstention", "Over-abstention (abstained when should proceed)"],
  ["correct_diagnosis_wrong_action", "Correct diagnosis, wrong first action"],
  ["wrong_priority", "Wrong priority (picked secondary over primary)"],
  ["hidden_constraint", "Hidden-constraint violation (infeasible recommendation)"],
  ["false_root_cause", "False root cause (committed a decoy on an uncovered cause)"],
];

function writeReports(corpus: CorpusScore, scores: CaseScore[]): void {
  const dateLine =
    "**Not a Stage A pass claim. Stage A remains DO_NOT_PROMOTE / BLOCKED.**";

  // Score report
  const r: string[] = [];
  r.push("# ROUND 2 — R0 RE-TRIAL SCORE REPORT");
  r.push("");
  r.push("**Mode:** measurement only (R0) — full-pipeline re-trial of the FROZEN engine");
  r.push("+ safety gate over the Round 2 corpus. No engine/gate/threshold/answer-key change.");
  r.push(`**Branch:** \`claude/stage-a-unproven-assumption-ecr0dm\`. ${dateLine}`);
  r.push("");
  r.push(`Cases scored: **${corpus.totalCases}**. Diagnosis-class split — `);
  r.push(
    `COMMIT_COVERED ${corpus.classCounts.COMMIT_COVERED}, ` +
      `UNCOVERED ${corpus.classCounts.UNCOVERED}, ` +
      `ABSTAIN_EXPECTED ${corpus.classCounts.ABSTAIN_EXPECTED}.`
  );
  r.push("");
  r.push("Held-out: documented real-world outcomes / provenance are NOT used in scoring.");
  r.push("");
  r.push("## Six-axis pass rates (NA excluded from the denominator)");
  r.push("| Axis | Pass | Fail | NA | Pass rate |");
  r.push("|---|---|---|---|---|");
  for (const [k, label] of AXIS_LABELS) {
    const t = corpus.axes[k];
    r.push(`| ${label} | ${t.pass} | ${t.fail} | ${t.na} | ${pct(t.rate)} |`);
  }
  r.push("");
  r.push("## Axis denominators (what each axis grades)");
  r.push("- **Diagnosis**: all cases. COMMIT_COVERED must emit the covered archetype;");
  r.push("  UNCOVERED/ABSTAIN_EXPECTED must abstain (committing a covered decoy fails).");
  r.push("- **Evidence use / Owner-constraint fit**: only cases where the engine committed.");
  r.push("- **First-action**: all cases (abstaining IS the correct first action when the");
  r.push("  key expects ABSTAIN; a generic template that matches neither acceptable nor");
  r.push("  unsafe actions fails as NO_MATCH_GENERIC).");
  r.push("- **Safety outcome**: all cases (gate PROCEED/ABSTAIN vs expected).");
  r.push("- **Abstention correctness**: only should-abstain cases (abstention recall).");
  r.push("");
  r.push("## Caveats (read before trusting a high number)");
  r.push("- The diagnosis pass rate is INFLATED by honest abstentions: an UNCOVERED");
  r.push("  true cause scores PASS when the engine abstains (it cannot emit that");
  r.push("  archetype), so a high rate is partly 'correctly gave up', not 'correctly");
  r.push("  diagnosed'. The decisive failure is the false-root-cause count (engine");
  r.push("  committed a covered decoy on an uncovered cause) in the breakdown.");
  r.push("- Owner-constraint fit is 100% only because the engine's generic low-cost");
  r.push("  templates are trivially feasible; the hidden-constraint cases fail on the");
  r.push("  FIRST-ACTION axis (NO_MATCH_GENERIC), not here. Constraint-fit will become");
  r.push("  discriminating once R3/R4 make the engine recommend constraint-binding actions.");
  r.push("- First-action and safety-outcome are the load-bearing axes today and are the");
  r.push("  ones R2–R4 must move; over-abstention on uncovered buckets (F6) drives the");
  r.push("  safety-outcome failures and is expected until archetype coverage (R5) lands.");
  r.push("");
  r.push("## Interpretation");
  r.push("These rates measure the CURRENT frozen engine. They are the R0 baseline the");
  r.push("remediation roadmap (R1–R5) must move. See ROUND_2_RETRIAL_FAILURE_BREAKDOWN.md");
  r.push("for the per-failure-class case lists.");
  r.push("");
  writeFileDoc("ROUND_2_RETRIAL_SCORE_REPORT.md", r.join("\n"));

  // Failure breakdown report
  const f: string[] = [];
  f.push("# ROUND 2 — R0 RE-TRIAL FAILURE BREAKDOWN");
  f.push("");
  f.push(`**Mode:** measurement only (R0). ${dateLine}`);
  f.push(`**Branch:** \`claude/stage-a-unproven-assumption-ecr0dm\`.`);
  f.push("");
  f.push(`Cases: ${corpus.totalCases}. Failure flags below are computed deterministically`);
  f.push("from the frozen full-pipeline outputs (engine + safety gate) vs the hidden keys.");
  f.push("");
  f.push("## Reading the flags (layer matters)");
  f.push("- `false_root_cause` is a DIAGNOSIS-LAYER flag: the diagnosis engine committed a");
  f.push("  covered decoy on an uncovered true cause. It is independent of the gate.");
  f.push("- `over_abstention` / `unsafe_proceed` are SYSTEM-OUTCOME flags: the final gate");
  f.push("  decision (PROCEED/ABSTAIN) vs the key.");
  f.push("- The two can co-occur: when the engine commits a decoy (false_root_cause) but");
  f.push("  the safety gate then abstains, the case is ALSO over_abstention — the gate");
  f.push("  blocked a wrong diagnosis (right outcome) while the diagnosis layer still");
  f.push("  failed (wrong reasoning). Both are reported; neither cancels the other.");
  f.push("");
  f.push("## Failure-flag totals");
  f.push("| Failure flag | Count |");
  f.push("|---|---|");
  for (const [k, label] of FLAG_LABELS) {
    f.push(`| ${label} | ${corpus.flags[k].count} |`);
  }
  f.push("");
  f.push("## Cases per failure flag");
  for (const [k, label] of FLAG_LABELS) {
    const ids = corpus.flags[k].caseIds;
    f.push(`### ${label} — ${ids.length}`);
    f.push(ids.length ? ids.map((i) => `\`${i}\``).join(", ") : "_(none)_");
    f.push("");
  }
  f.push("## Per-case axis verdicts");
  f.push("| Case | Class | Outcome (exp→eng) | Dx | Ev | Act | Con | Safe | Abst |");
  f.push("|---|---|---|---|---|---|---|---|---|");
  const v = (x: { verdict: string }) =>
    x.verdict === "PASS" ? "✓" : x.verdict === "FAIL" ? "✗" : "·";
  for (const s of scores) {
    f.push(
      `| \`${s.caseId}\` | ${s.expectedDiagnosisClass} | ${s.expectedOutcome}→${s.engineOutcome} | ` +
        `${v(s.axes.diagnosis)} | ${v(s.axes.evidenceUse)} | ${v(s.axes.firstAction)} | ` +
        `${v(s.axes.constraintFit)} | ${v(s.axes.safetyOutcome)} | ${v(s.axes.abstention)} |`
    );
  }
  f.push("");
  f.push("Legend: ✓ pass · ✗ fail · `·` not-applicable (NA).");
  f.push("");
  writeFileDoc("ROUND_2_RETRIAL_FAILURE_BREAKDOWN.md", f.join("\n"));
}

function writeFileDoc(name: string, content: string): void {
  fs.writeFileSync(path.join(repoRoot, name), content, "utf-8");
}

function printSummary(corpus: CorpusScore, n: number): void {
  console.log(`\n=== ROUND 2 R0 RE-TRIAL — ${n} cases ===`);
  for (const [k, label] of AXIS_LABELS) {
    const t = corpus.axes[k];
    console.log(`  ${label.padEnd(30)} pass ${t.pass} / fail ${t.fail} / na ${t.na}  (${pct(t.rate)})`);
  }
  console.log("  failure flags:");
  for (const [k, label] of FLAG_LABELS) {
    console.log(`    ${label.padEnd(58)} ${corpus.flags[k].count}`);
  }
  console.log("");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
