/**
 * Holdout First-Run Evaluation Script.
 *
 * Runs all 10 holdout cases through the OpsIQ engine pipeline and prints
 * results to stdout. Output is captured for HOLDOUT_FIRST_RUN_REPORT.md.
 *
 * This is the genuine first run — the engine has not been tuned against
 * these cases. Results are preserved verbatim.
 *
 * Run: npx ts-node -r tsconfig-paths/register tests/owner-mode/holdout/runHoldoutFirstRun.ts
 */
import { runAllHoldoutCases } from "./runHoldoutValidation";

async function main(): Promise<void> {
  console.log("=== HOLDOUT FIRST-RUN EVALUATION ===");
  console.log(`Date: ${new Date().toISOString()}`);
  console.log("");

  const results = await runAllHoldoutCases();

  let passed = 0;
  let failed = 0;
  let trapTaken = 0;
  let engineGap = 0;
  let scoringLimitation = 0;
  let totalScore = 0;
  let badRecFails = 0;

  for (const result of results) {
    const score = result.score;
    const classification = result.failureClassification;

    if (score.passed) passed++;
    else failed++;

    if (classification === "HOL_TRAP_TAKEN") trapTaken++;
    else if (classification === "HOL_ENGINE_GAP") engineGap++;
    else if (classification === "HOL_SCORING_LIMITATION") scoringLimitation++;

    if (!score.dimensionResults.badRecommendationAvoidance.passed) badRecFails++;
    totalScore += score.totalScore;

    console.log(`--- ${result.caseId}: ${result.title} ---`);
    console.log(`  Result: ${classification}`);
    console.log(`  Total score: ${score.totalScore.toFixed(3)}`);
    console.log(`  Passed: ${score.passed}`);
    console.log(`  rootCause: ${score.dimensionResults.rootCause.score.toFixed(3)} (${score.dimensionResults.rootCause.matchedTerms.join(", ")})`);
    console.log(`  firstAction: ${score.dimensionResults.firstAction.score.toFixed(3)}`);
    console.log(`  missingInputRequests: ${score.dimensionResults.missingInputRequests.score.toFixed(3)}`);
    console.log(`  badRecAvoidance: ${score.dimensionResults.badRecommendationAvoidance.passed ? "PASS" : "FAIL"}`);
    console.log(`  evidenceDiscipline: ${score.dimensionResults.evidenceDiscipline.passed ? "PASS" : "FAIL"}`);
    if (!result.unsupportedArchetype) {
      console.log(`  Diagnosed archetype: ${result.diagnosisResult.primaryRootCause.type}`);
    }
    if (score.criticalFailures.length > 0) {
      console.log(`  Critical failures: ${score.criticalFailures.join("; ")}`);
    }
    if (score.dimensionResults.rootCause.missingTerms.length > 0) {
      console.log(`  Missing terms: ${score.dimensionResults.rootCause.missingTerms.join(", ")}`);
    }
    console.log("");
  }

  const avgScore = totalScore / results.length;
  const passRate = (passed / results.length) * 100;

  console.log("=== SUMMARY ===");
  console.log(`Total cases: ${results.length}`);
  console.log(`Pass: ${passed} / Fail: ${failed}`);
  console.log(`Pass rate: ${passRate.toFixed(1)}%`);
  console.log(`Average score: ${avgScore.toFixed(3)}`);
  console.log(`Bad rec failures: ${badRecFails}`);
  console.log(`HOL_TRAP_TAKEN: ${trapTaken}`);
  console.log(`HOL_ENGINE_GAP: ${engineGap}`);
  console.log(`HOL_SCORING_LIMITATION: ${scoringLimitation}`);
}

main().catch((err: unknown) => {
  console.error("HOLDOUT_RUN_ERROR:", err);
  process.exit(1);
});
