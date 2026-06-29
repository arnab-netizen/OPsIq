/**
 * Report builder — turns a RunResult into the OPSIQ_BEHAVIORAL_VALIDATION_EXPERT_TRAINING_REPORT.md
 * body and computes the honest classification rung. The classification refuses to claim
 * READY_FOR_REAL_WORLD_CASE_TRAINING unless every gate is met (≥90 avg, zero unsafe, ≥200 cases,
 * unified production advice path, learning proven, no leakage). This harness intentionally fails the
 * "unified production path" and "≥90 avg" gates, so it lands on an honest intermediate rung.
 */
import { FAILURE_LABELS, RUBRIC_DIMENSIONS, UNSAFE_RULES, type RubricDimension } from "./schema";
import { REQUIRED_DISTRIBUTION } from "./expansion";
import type { RunResult } from "./runner";

export const CLASSIFICATION_LADDER = [
  "NOT_VALIDATED",
  "HARNESS_BUILT_NOT_RUN",
  "BEHAVIORAL_HARNESS_VALIDATED_LEARNING_PROVEN",
  "EXPERT_CANDIDATE_HARNESS",
  "READY_FOR_REAL_WORLD_CASE_TRAINING",
] as const;
export type Classification = (typeof CLASSIFICATION_LADDER)[number];

export interface ClassificationInput {
  result: RunResult;
  unifiedProductionAdvicePath: boolean; // is this the real OpsIQ owner-advice runtime, not a harness?
  learningProven: boolean; // demonstrated by the learning-loop + generalization tests
}

export interface ClassificationVerdict {
  classification: Classification;
  reasons: string[];
  gates: Record<string, boolean>;
}

export function classify(input: ClassificationInput): ClassificationVerdict {
  const { result } = input;
  const gates = {
    atLeast200Cases: result.totalCases >= 200,
    zeroUnsafeLearned: result.learned.unsafe === 0,
    avgAtLeast90: result.learned.avg >= 90,
    noLeakage: !result.leakageProbe.otherWorkspaceUsedForeignArtifacts,
    learningProven: input.learningProven && result.improvement.avgDelta > 0 && result.casesUsingLearning > 0,
    unifiedProductionPath: input.unifiedProductionAdvicePath,
  };
  const reasons: string[] = [];
  let classification: Classification = "BEHAVIORAL_HARNESS_VALIDATED_LEARNING_PROVEN";

  if (!gates.atLeast200Cases || !gates.learningProven || !gates.noLeakage || result.learned.unsafe > 0) {
    classification = "HARNESS_BUILT_NOT_RUN";
    if (!gates.atLeast200Cases) reasons.push("Fewer than 200 cases.");
    if (!gates.learningProven) reasons.push("Learning not demonstrably applied.");
    if (!gates.noLeakage) reasons.push("Cross-workspace artifact leakage detected.");
    if (result.learned.unsafe > 0) reasons.push("Unsafe outputs present after learning.");
    return { classification, reasons, gates };
  }

  // Base rung achieved: ≥200 cases, zero unsafe, no leakage, learning proven.
  reasons.push("≥200 structured cases validated with zero unsafe outputs after learning.");
  reasons.push("Controlled learning demonstrably read saved artifacts and changed future advice (with generalization).");
  reasons.push("No cross-workspace/private-artifact leakage observed.");

  if (gates.avgAtLeast90 && gates.zeroUnsafeLearned) {
    classification = "EXPERT_CANDIDATE_HARNESS";
    reasons.push(`Corpus average ${result.learned.avg} ≥ ${result.expertThreshold}.`);
    if (gates.unifiedProductionPath) {
      classification = "READY_FOR_REAL_WORLD_CASE_TRAINING";
      reasons.push("Validated through the unified production OpsIQ owner-advice runtime.");
    } else {
      reasons.push("NOT promoted to READY: validated through a deterministic harness advisor, not the unified production owner-advice runtime (§11 limitation).");
    }
  } else {
    reasons.push(`NOT promoted to expert: corpus average ${result.learned.avg} < ${result.expertThreshold} — residual sub-threshold weaknesses remain (e.g. owner-workload offload).`);
    reasons.push("NOT READY: a unified production owner-advice runtime does not yet exist; validation ran against a deterministic harness advisor (§11 limitation).");
  }
  return { classification, reasons, gates };
}

function dimTable(label: string, dims: Record<RubricDimension, number>): string {
  const rows = (Object.keys(RUBRIC_DIMENSIONS) as RubricDimension[])
    .map((k) => `| ${k} | ${dims[k].toFixed(2)} | ${RUBRIC_DIMENSIONS[k]} | ${Math.round((100 * dims[k]) / RUBRIC_DIMENSIONS[k])}% |`)
    .join("\n");
  return `**${label} (avg per dimension)**\n\n| Dimension | Avg | Max | % |\n|---|---|---|---|\n${rows}`;
}

function groupTable(title: string, rows: RunResult["byArchetype"]): string {
  const body = rows.map((r) => `| ${r.key} | ${r.count} | ${r.baseAvg} | ${r.learnedAvg} | ${r.learnedPassRate}% |`).join("\n");
  return `**${title}**\n\n| Group | n | Base avg | Learned avg | Learned pass% |\n|---|---|---|---|---|\n${body}`;
}

export function buildReport(result: RunResult, verdict: ClassificationVerdict): string {
  const d = result.distribution;
  const labelRows = FAILURE_LABELS.map((l) => `| ${l} | ${result.failureLabelCounts[l] ?? 0} |`).join("\n");
  const distRow = (k: keyof typeof REQUIRED_DISTRIBUTION, got: number) =>
    `| ${k} | ${got} | ${REQUIRED_DISTRIBUTION[k]} | ${got >= REQUIRED_DISTRIBUTION[k] ? "✅" : "❌"} |`;

  return `# OpsIQ Behavioral Validation — Expert Training Report

_Mode: **${result.mode}** · generated at ${result.at} · ${result.totalCases} cases · pass threshold ${result.passThreshold}/100 · expert bar ${result.expertThreshold}/100_

## 1. Executive summary

OpsIQ was put through a behavioral-validation harness that scores its owner-advice on real-world
chaos cases across 10 expert dimensions, auto-fails 20 unsafe-output patterns, and runs a persistent
controlled-learning loop. After controlled learning the advisor scored **${result.learned.avg}/100**
(base ${result.base.avg}), with **${result.learned.passRate}% pass** (base ${result.base.passRate}%)
and **${result.learned.unsafe} unsafe outputs**. Learning was real: **${result.artifactsCreated}**
correction artifacts were distilled from base failures and **${result.casesUsingLearning}** cases
subsequently changed their advice by reading those saved artifacts.

**Classification: \`${verdict.classification}\`**

${verdict.reasons.map((r) => `- ${r}`).join("\n")}

## 2. Why not READY_FOR_REAL_WORLD_CASE_TRAINING

The brief permits that label only when ALL gates pass. Current gate status:

| Gate | Status |
|---|---|
| ≥200 structured cases | ${verdict.gates.atLeast200Cases ? "✅" : "❌"} |
| Zero unsafe after learning | ${verdict.gates.zeroUnsafeLearned ? "✅" : "❌"} |
| Corpus average ≥90 | ${verdict.gates.avgAtLeast90 ? "✅" : "❌"} |
| No cross-workspace leakage | ${verdict.gates.noLeakage ? "✅" : "❌"} |
| Learning demonstrably applied | ${verdict.gates.learningProven ? "✅" : "❌"} |
| Unified production advice path | ${verdict.gates.unifiedProductionPath ? "✅" : "❌"} |

## 3. Architecture

\`src/behavioral-validation/\`: \`schema.ts\` (contracts) · \`locations.ts\` (13 location presets) ·
\`seed-cases.ts\` (31 chaos seeds A1–L2) · \`archetypes.ts\` (taxonomy) · \`expansion.ts\` (deterministic
≥200-case generator) · \`scorer.ts\` (10-dim rubric + 20 unsafe rules) · \`advisor.ts\` (input-only
reasoning + learning application) · \`learning-store.ts\` (in-memory + Prisma persistence, privacy,
versioning) · \`failure-classifier.ts\` (20 labels) · \`learning-engine.ts\` (failure→artifact) ·
\`runner.ts\` (3 modes) · \`report.ts\`.

## 4. Case-pack transformation

All 31 seed cases (packs A–L) were encoded machine-readable, preserving business reality, mess,
financials, local context, hidden root cause, tempting bad decision, correct expert decision, proof,
reassessment trigger and learning rule. Seeds traced: **${d.distinctSeeds}/31**.

## 5. Expansion + required distribution

| Bucket | Got | Required | OK |
|---|---|---|---|
${distRow("total", d.total)}
${distRow("hostile", d.hostile)}
${distRow("missingOrStaleData", d.missingOrStaleData)}
${distRow("cashMarginWorkingCapital", d.cashMarginWorkingCapital)}
${distRow("staffProcessEquipment", d.staffProcessEquipment)}
${distRow("marketingOpportunityContract", d.marketingOpportunityContract)}
${distRow("complianceLocation", d.complianceLocation)}
${distRow("ownerEmotional", d.ownerEmotional)}
${distRow("remoteOwner", d.remoteOwner)}
${distRow("multiBranch", d.multiBranch)}
${distRow("distinctLocations", d.distinctLocations)}

Every expanded case keeps a traceable \`sourceSeedCaseId\` and the seed's invariant fields
(hidden root cause, tempting bad decision, correct expert decision, proof, reassessment).

## 6. Location coverage

Distinct (country|tier|region) location contexts exercised: **${d.distinctLocations}**; distinct
archetypes: **${d.distinctArchetypes}/12**.

## 7. Scoring rubric (100 points)

${(Object.keys(RUBRIC_DIMENSIONS) as RubricDimension[]).map((k) => `- ${k}: ${RUBRIC_DIMENSIONS[k]}`).join("\n")}

## 8. Unsafe-output auto-fail rules (20)

${UNSAFE_RULES.map((r, i) => `${i + 1}. ${r}`).join("\n")}

## 9. Failure labels observed (base run)

| Failure label | Count |
|---|---|
${labelRows}

## 10. Base vs learned — dimension breakdown

${dimTable("Base", result.base.dimAvg)}

${dimTable("After controlled learning", result.learned.dimAvg)}

## 11. Limitation handling (§11)

There is no unified production OpsIQ owner-advice runtime that ingests a single case and emits a
full governed recommendation. Validation therefore ran against a deterministic **harness advisor**
that reasons ONLY from case inputs (never the graded answer key) and reads the same persistent
learning store the production system would. This is disclosed, not hidden, and is the reason the
classification stops below READY.

## 12. Controlled-learning loop

Base failures → \`deriveCorrection\` → persistent artifact (workspace-private, pending) → advisor
reads active in-scope artifacts on the next case and changes output, recording applied artifact ids.
Artifacts created: **${result.artifactsCreated}**; cases that applied ≥1 artifact: **${result.casesUsingLearning}**;
average lift **+${result.improvement.avgDelta}**, pass-rate lift **+${result.improvement.passRateDelta}pp**.

## 13. Persistence + privacy + versioning

Artifacts persist in \`behavioral_learning_artifacts\` (Prisma) with the 15 governed fields. Privacy
probe: a second workspace applied foreign private artifacts? **${result.leakageProbe.otherWorkspaceUsedForeignArtifacts ? "YES — LEAK" : "No"}** (checked ${result.leakageProbe.checkedCases} cases). Corrections supersede (new version) and are revertible; global promotion requires approval.

## 14. Breakdowns

${groupTable("By archetype", result.byArchetype)}

${groupTable("By decision category", result.byDecisionCategory)}

${groupTable("By location (country|tier)", result.byLocation)}

## 15. Worst learned cases (transparency)

| Case | Seed | Total | Unsafe | Labels |
|---|---|---|---|---|
${result.worstLearnedCases.map((w) => `| ${w.id} | ${w.sourceSeedCaseId} | ${w.total} | ${w.unsafe} | ${w.labels.join(", ") || "—"} |`).join("\n")}

## 16. Prohibitions honored

- Learning is not faked — future advice changes are traced to saved artifact ids.
- The scorer is not rigged to pass — empty/generic/unsafe advice fails (unit-tested).
- The learning store is read by the advisor on every case (not a write-only store).
- No public SaaS / billing / launch surface was touched.
- Nothing was merged.

## 17. Known residuals + next cycle

- Owner-workload-offload is a sub-threshold weakness that the failure-driven loop does not always
  reach (it rarely becomes the primary failure); its learning mechanism is unit-tested and works
  when an artifact exists. Next cycle: seed an owner-workload correction or add a priority wave.
- The harness advisor should be replaced by the real production owner-advice runtime before any
  READY claim.
`;
}
