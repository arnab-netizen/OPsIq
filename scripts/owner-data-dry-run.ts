/**
 * Slice 26 — Real Owner-Data Dry Run preparation/execution script.
 *
 * Usage:
 *   npx tsx scripts/owner-data-dry-run.ts                 # print blank intake template + checklist
 *   npx tsx scripts/owner-data-dry-run.ts <owner-data.json>  # assess readiness over REAL data
 *
 * This script NEVER fabricates owner data. With no file it emits the exact intake
 * checklist + a blank template for the owner to fill. With a file it loads the
 * owner's real JSON, runs the fail-closed readiness assessor, prints which inputs
 * are still blocking and which of the four product dimensions are uncovered, and
 * exits non-zero unless the data is ready for a supervised dry run.
 *
 * Exit codes: 0 = ready, 1 = blocked (missing required data), 2 = template printed
 * (no data supplied), 3 = bad input file.
 */

import { readFileSync } from "node:fs";
import {
  OWNER_DATA_INTAKE_CHECKLIST,
  assessDryRunReadiness,
  buildBlankIntakeTemplate,
} from "../src/domain/execution/owner-data-dry-run";
import type { TrialPackInput } from "../src/domain/execution/trial-pack";

function printChecklist(): void {
  console.log("\n=== OpsIQ Owner-Data Intake Checklist ===\n");
  for (const item of OWNER_DATA_INTAKE_CHECKLIST) {
    const tag = item.blocking ? "REQUIRED" : "optional";
    console.log(`• [${tag}] ${item.label}  (dimension: ${item.dimension})`);
    console.log(`    section: ${item.section}`);
    console.log(`    fields:  ${item.requiredFields.join(", ")}`);
    console.log(`    format:  ${item.format}`);
    console.log(`    why:     ${item.why}\n`);
  }
}

function main(): number {
  const file = process.argv[2];

  if (!file) {
    printChecklist();
    console.log("=== Blank intake template (fill this in, then re-run with the file path) ===\n");
    console.log(JSON.stringify(buildBlankIntakeTemplate(), null, 2));
    console.log(
      "\nNo owner data supplied — nothing was assumed or fabricated. Provide the file to assess readiness."
    );
    return 2;
  }

  let input: TrialPackInput;
  try {
    input = JSON.parse(readFileSync(file, "utf8")) as TrialPackInput;
  } catch (err) {
    console.error(`Could not read/parse owner data file '${file}': ${(err as Error).message}`);
    return 3;
  }

  const r = assessDryRunReadiness(input);
  console.log("\n=== OpsIQ Owner-Data Dry Run Readiness ===\n");
  console.log(`Verdict:            ${r.verdict}`);
  console.log(`Completeness score: ${(r.completeness.score * 100).toFixed(0)}%  (confidence: ${r.completeness.confidence})`);
  console.log(`Provisional only:   ${r.provisional.safeProvisionalOnly}  (owner approval required: ${r.provisional.requiresOwnerApproval})`);

  if (r.blockingGaps.length > 0) {
    console.log(`\nBLOCKING gaps (${r.blockingGaps.length}):`);
    for (const g of r.blockingGaps) console.log(`  - ${g.label} [${g.section}] → ${g.dimension}`);
  }
  if (r.uncoveredDimensions.length > 0) {
    console.log(`\nUncovered product dimensions: ${r.uncoveredDimensions.join(", ")}`);
  }
  if (r.nonBlockingGaps.length > 0) {
    console.log(`\nOptional gaps (raise confidence): ${r.nonBlockingGaps.map((g) => g.label).join(", ")}`);
  }

  console.log("\nNext actions:");
  for (const a of r.nextActions) console.log(`  • ${a}`);
  console.log("");

  return r.ready ? 0 : 1;
}

process.exit(main());
