/**
 * OpsIQ behavioral-validation CLI.
 *
 *   npx tsx scripts/behavioral-validate.ts <smoke|core|hostile> [--report]
 *
 * Runs the chosen validation mode against the deterministic harness advisor + persistent (in-memory)
 * learning store, prints a summary, and with --report writes
 * OPSIQ_BEHAVIORAL_VALIDATION_EXPERT_TRAINING_REPORT.md. No DB and no production surface is touched.
 */
import { writeFileSync } from "fs";
import { resolve } from "path";
import { runValidation, type ValidationMode } from "../src/behavioral-validation/runner";
import { buildReport, classify } from "../src/behavioral-validation/report";

async function main() {
  const mode = (process.argv[2] as ValidationMode) ?? "smoke";
  const writeReport = process.argv.includes("--report");
  if (!["smoke", "core", "hostile"].includes(mode)) {
    console.error(`Unknown mode "${mode}". Use smoke | core | hostile.`);
    process.exit(2);
  }

  const result = await runValidation(mode);
  const verdict = classify({ result, unifiedProductionAdvicePath: false, learningProven: true });

  console.log(`\nOpsIQ behavioral validation — mode=${mode}`);
  console.log(`  cases:        ${result.totalCases} (distinct seeds ${result.distribution.distinctSeeds}, locations ${result.distribution.distinctLocations}, archetypes ${result.distribution.distinctArchetypes})`);
  console.log(`  base:         avg ${result.base.avg}/100, pass ${result.base.passRate}%, unsafe ${result.base.unsafe}`);
  console.log(`  learned:      avg ${result.learned.avg}/100, pass ${result.learned.passRate}%, unsafe ${result.learned.unsafe}`);
  console.log(`  improvement:  +${result.improvement.avgDelta} avg, +${result.improvement.passRateDelta}pp pass`);
  console.log(`  learning:     ${result.artifactsCreated} artifacts, ${result.casesUsingLearning} cases applied learning`);
  console.log(`  leakage:      ${result.leakageProbe.otherWorkspaceUsedForeignArtifacts ? "LEAK DETECTED" : "none"}`);
  console.log(`  CLASS:        ${verdict.classification}`);

  if (writeReport) {
    const path = resolve(process.cwd(), "OPSIQ_BEHAVIORAL_VALIDATION_EXPERT_TRAINING_REPORT.md");
    writeFileSync(path, buildReport(result, verdict), "utf8");
    console.log(`\n  report written: ${path}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
