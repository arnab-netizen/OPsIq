/**
 * Batch 1 score dump — post-Wave-4 baseline for regression lock.
 * Run with: npx tsx tests/owner-mode/real-world-simulation/runBatch1ScoreDump.ts
 */
import { loadSimulationFixtures, getSimulationCaseById } from "./loadSimulationFixtures";
import { runSimulationCaseAgainstOpsiq } from "./runSimulationCaseAgainstOpsiq";

const BATCH_1 = [
  "SIM-01-001", "SIM-01-002",
  "SIM-02-001", "SIM-02-002",
  "SIM-03-001", "SIM-03-002",
  "SIM-04-001", "SIM-04-002",
  "SIM-05-001", "SIM-05-002",
  "SIM-06-001", "SIM-06-002",
];

async function main() {
  const corpus = loadSimulationFixtures();
  if (corpus.status !== "READY") {
    console.error("Corpus not ready:", corpus.status);
    process.exit(1);
  }

  console.log("case_id,unsupported,total,passed,rootCause,firstAction,missingInputs,badRecAvoidance,evidenceDiscipline,failureClass");

  for (const caseId of BATCH_1) {
    const fixture = getSimulationCaseById(caseId);
    const result = await runSimulationCaseAgainstOpsiq(fixture);

    if (result.unsupportedArchetype) {
      const s = result.score;
      const d = s.dimensionResults;
      console.log(`${caseId},true,${s.totalScore.toFixed(3)},${s.passed},${d.rootCause.score.toFixed(3)},${d.firstAction.score.toFixed(3)},${d.missingInputRequests.score.toFixed(3)},${d.badRecommendationAvoidance.score.toFixed(3)},${d.evidenceDiscipline.score.toFixed(3)},SIM_ENGINE_GAP`);
    } else {
      const s = result.score;
      const d = s.dimensionResults;
      console.log(`${caseId},false,${s.totalScore.toFixed(3)},${s.passed},${d.rootCause.score.toFixed(3)},${d.firstAction.score.toFixed(3)},${d.missingInputRequests.score.toFixed(3)},${d.badRecommendationAvoidance.score.toFixed(3)},${d.evidenceDiscipline.score.toFixed(3)},${result.failureClassification}`);
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
