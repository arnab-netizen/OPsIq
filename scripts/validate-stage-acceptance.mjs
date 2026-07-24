#!/usr/bin/env node
/**
 * Completion Factory — Stage Acceptance Gate
 *
 * Usage:
 *   node scripts/validate-stage-acceptance.mjs --stage 3
 *   node scripts/validate-stage-acceptance.mjs --stage all
 *
 * Validates that all bundles in the target stage are CLOSED with post-merge evidence.
 * Exits 0 only when every required bundle is CLOSED.
 * Exits 1 on any violation (blocking gate for next stage start).
 *
 * Enforces the rule: "Do not begin Stage N+1 until Stage N acceptance is green."
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { load as yamlLoad } from 'js-yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const ledgerPath = join(root, 'docs', 'opsiq', 'status', 'REMAINING_STAGE_ACCEPTANCE.yaml');

const args = process.argv.slice(2);
const stageIdx = args.indexOf('--stage');

if (stageIdx === -1 || !args[stageIdx + 1]) {
  console.error('Usage: node validate-stage-acceptance.mjs --stage <N|all>');
  process.exit(2);
}

const stageArg = args[stageIdx + 1];

let ledger;
try {
  ledger = yamlLoad(readFileSync(ledgerPath, 'utf8'));
} catch (e) {
  console.error(`Cannot read ledger: ${e.message}`);
  process.exit(1);
}

const stages = ledger.stages || {};
let violations = 0;
let checked = 0;

function checkStage(stageKey) {
  const stageData = stages[stageKey];
  if (!stageData) {
    console.error(`Stage '${stageKey}' not found in ledger`);
    violations++;
    return;
  }

  const bundles = Array.isArray(stageData.bundles) ? stageData.bundles : [];
  console.log(`\nChecking ${stageKey}: ${stageData.name || ''}`);

  for (const bundle of bundles) {
    if (!bundle || !bundle.id) continue;
    checked++;

    const { id, status, post_merge_evidence: evidence } = bundle;

    if (status !== 'CLOSED') {
      console.error(`  ❌ ${id}: status=${status} (must be CLOSED for stage acceptance)`);
      violations++;
      continue;
    }

    const required = ['pr_sha', 'merge_sha', 'main_integration_run', 'db_verification_run'];
    let evidenceMissing = false;
    for (const field of required) {
      if (!evidence || evidence[field] == null) {
        console.error(`  ❌ ${id}: CLOSED but evidence.${field} is null`);
        violations++;
        evidenceMissing = true;
      }
    }

    if (!evidenceMissing) {
      const sha = String(evidence.merge_sha || '').slice(0, 12);
      console.log(`  ✓ ${id}: CLOSED — merge_sha=${sha}`);
    }
  }
}

if (stageArg === 'all') {
  for (const key of Object.keys(stages)) {
    checkStage(key);
  }
} else {
  checkStage(`stage-${stageArg}`);
}

console.log('');
if (violations === 0) {
  console.log(`✅ Stage acceptance passed (${checked} bundles, 0 violations)`);
  process.exit(0);
} else {
  console.error(`❌ Stage acceptance FAILED: ${violations} violation(s) across ${checked} bundles`);
  process.exit(1);
}
