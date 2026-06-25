/**
 * Synthetic-realistic owner dry-run executor.
 *
 * Loads a synthetic-realistic scenario file, runs the fail-closed readiness
 * assessor PLUS the governed diagnosis (progression gate, SOP modernization,
 * client retention), and prints a full report. It refuses to treat the data as
 * real and never writes learning.
 *
 * Usage: npx tsx scripts/synthetic-owner-dry-run.ts <scenario.json>
 * Exit codes: 0 = READY + diagnosed, 1 = BLOCKED, 3 = bad/!synthetic file.
 */

import { readFileSync } from "node:fs";
import { assessDryRunReadiness } from "../src/domain/execution/owner-data-dry-run";
import {
  canEnterVerifiedLearning,
  diagnoseProgression,
  recommendProcessModernization,
  recommendClientRetention,
  RecoveryStage,
  type DistressFinancials,
  type OpsSignals,
} from "../src/domain/execution/dry-run-diagnosis";
import { ProgressionMove } from "../src/domain/execution/progression-engine";

function main(): number {
  const file = process.argv[2];
  if (!file) {
    console.error("Provide a scenario file: npx tsx scripts/synthetic-owner-dry-run.ts <scenario.json>");
    return 3;
  }

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
  } catch (err) {
    console.error(`Cannot read/parse '${file}': ${(err as Error).message}`);
    return 3;
  }

  const meta = (data.metadata ?? {}) as { dataMode?: string; dataTruthStatus?: string };
  console.log("\n=== Synthetic-Realistic Owner Dry Run ===\n");
  console.log(`File:               ${file}`);
  console.log(`Data mode:          ${meta.dataMode ?? "(unset)"}`);
  console.log(`Data truth status:  ${meta.dataTruthStatus ?? "(unset)"}`);
  console.log(`Real owner data:    ${canEnterVerifiedLearning(meta)} (false = cannot enter verified learning)`);
  if (meta.dataMode !== "SYNTHETIC_REALISTIC") {
    console.error("Refusing to run: this executor only accepts SYNTHETIC_REALISTIC data.");
    return 3;
  }

  // 1. Readiness (fail-closed).
  const readiness = assessDryRunReadiness(data as never);
  console.log(`\nReadiness verdict:  ${readiness.verdict}`);
  console.log(`Completeness:       ${(readiness.completeness.score * 100).toFixed(0)}% (${readiness.completeness.confidence})`);
  console.log(`Provisional only:   ${readiness.provisional.safeProvisionalOnly} (owner approval required: ${readiness.provisional.requiresOwnerApproval})`);
  if (!readiness.ready) {
    console.log(`\nBLOCKED — missing: ${readiness.blockingGaps.map((g) => g.section).join(", ") || "(none)"}`);
    return 1;
  }

  // 2. Governed diagnosis.
  const fin = data.financials as DistressFinancials;
  const ops = data.opsSignals as OpsSignals;
  const progression = diagnoseProgression(fin, ops, ProgressionMove.SECOND_LOCATION);
  console.log(`\n--- Progression gate ---`);
  console.log(`Stage:              ${progression.stage}`);
  console.log(`Expansion allowed:  ${progression.expansionAllowed}`);
  console.log(`Growth class:       ${progression.classification}`);
  if (!progression.expansionAllowed) {
    console.log(`Blocked reasons:    ${progression.decision.blockedReasons.join(", ") || "client_loss"}`);
  }

  const processDefects = (data.processDefects as string[] | undefined) ?? [];
  const sop = recommendProcessModernization(processDefects);
  if (sop.length) {
    console.log(`\n--- SOP / process modernization (owner approval required) ---`);
    for (const s of sop) console.log(`  • ${s.defect} → ${s.recommendation}`);
  }

  const retention = recommendClientRetention(ops.lostCommercialClients, ops.atRiskCommercialClients);
  if (retention.length) {
    console.log(`\n--- Client recovery / retention (owner approval required) ---`);
    for (const r of retention) console.log(`  • [${r.kind}] ${r.description}`);
  }

  console.log(`\nLearning write allowed for this data: ${canEnterVerifiedLearning(meta)} (synthetic → never)`);
  console.log(`Required workflows: ${(data.requiredWorkflows as string[] | undefined)?.join(", ") ?? "(none listed)"}`);
  console.log(
    progression.stage === RecoveryStage.STABILIZATION_FIRST
      ? "\nVerdict: STABILIZATION/RECOVERY FIRST — expansion blocked.\n"
      : "\nVerdict: controlled growth may be considered after owner review.\n"
  );
  return 0;
}

process.exit(main());
