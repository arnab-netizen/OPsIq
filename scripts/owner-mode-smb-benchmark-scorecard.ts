/**
 * Owner Mode SMB Benchmark Scorecard (read-only runner).
 *
 * Reuses the EXISTING scored harness (loadRealWorldSmbFixtures + runCaseAgainstOpsiq
 * + scoreOutput) — no new scoring logic — and prints a per-dimension scorecard so the
 * deterministic Owner Mode benchmark can be reported and reclassified. This is a
 * benchmark RUNNER/report (Decision-OS §15/§34), not a product feature: it changes no
 * app behavior and is invoked manually (`npx tsx scripts/owner-mode-smb-benchmark-scorecard.ts`).
 */
import { loadRealWorldSmbFixtures } from "../tests/owner-mode/real-world-smb-cases/loadFixtures";
import { scoreOutput, type CaseScore } from "../tests/owner-mode/real-world-smb-cases/scoringContract";
import { runCaseAgainstOpsiq } from "../tests/owner-mode/real-world-smb-cases/runCaseAgainstOpsiq";

function pct(n: number, d: number): string {
  return d === 0 ? "n/a" : `${Math.round((n / d) * 1000) / 10}%`;
}

async function main(): Promise<void> {
  const fixtures = loadRealWorldSmbFixtures();
  const supported: Array<{ id: string; score: CaseScore }> = [];
  const gapCases: string[] = [];

  for (const f of fixtures) {
    const run = await runCaseAgainstOpsiq(f);
    if (run.unsupportedArchetype) {
      gapCases.push(f.case_id);
      continue; // expected abstention — excluded from the scored denominator
    }
    supported.push({ id: f.case_id, score: scoreOutput(run.output, f) });
  }

  const n = supported.length;
  const rootCausePass = supported.filter((s) => s.score.dimensionResults.ROOT_CAUSE_ALIGNMENT.passed).length;
  const firstActionPass = supported.filter((s) => s.score.dimensionResults.FIRST_ACTION_QUALITY.passed).length;
  const missingInputPass = supported.filter((s) => s.score.dimensionResults.MISSING_INPUT_REQUESTS.passed).length;
  const badRecFail = supported.filter((s) => !s.score.dimensionResults.BAD_RECOMMENDATION_AVOIDANCE.passed).length;
  const overallPass = supported.filter((s) => s.score.passed).length;
  const avg = n === 0 ? 0 : supported.reduce((a, s) => a + s.score.totalScore, 0) / n;

  console.log("\n================ OWNER MODE SMB BENCHMARK SCORECARD ================");
  console.log(`Total fixtures: ${fixtures.length} | scored (supported): ${n} | gap/abstention (excluded): ${gapCases.length} [${gapCases.join(", ")}]`);
  console.log("\nPer-case totals:");
  for (const s of supported) {
    const crit = s.score.criticalFailures.join(",") || "-";
    console.log(`  ${s.id.padEnd(28)} total=${s.score.totalScore.toFixed(2)} passed=${String(s.score.passed).padEnd(5)} crit_fail=${crit}`);
  }
  console.log("\n--- Scored dimensions (denominator = supported cases) ---");
  console.log(`  root-cause accuracy        : ${pct(rootCausePass, n)}  (${rootCausePass}/${n})`);
  console.log(`  first-action accuracy      : ${pct(firstActionPass, n)}  (${firstActionPass}/${n})`);
  console.log(`  missing-input request rate : ${pct(missingInputPass, n)}  (${missingInputPass}/${n})`);
  console.log(`  dangerous recommendation   : ${pct(badRecFail, n)}  (${badRecFail}/${n})  [target 0]`);
  console.log(`  overall pass rate          : ${pct(overallPass, n)}  (${overallPass}/${n})`);
  console.log(`  average score              : ${avg.toFixed(3)}  [gate >= 0.65]`);
  console.log("\nNOTE: this harness scores diagnosis quality (root-cause / first-action / missing-input /");
  console.log("bad-recommendation). Hallucinated-evidence, confidence-overclaim, false-learning-eligibility,");
  console.log("workspace-leakage and dashboard-misleading are covered by other suites (see reliability report).");
  console.log("====================================================================\n");
}

main().catch((e) => {
  console.error("benchmark scorecard failed:", e);
  process.exit(1);
});
