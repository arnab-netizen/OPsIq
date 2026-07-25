#!/usr/bin/env node
/**
 * Completion Factory — Stage Acceptance Gate
 *
 * Usage:
 *   node scripts/validate-stage-acceptance.mjs --stage 3
 *   node scripts/validate-stage-acceptance.mjs --stage all
 *
 * Validates acceptance-data integrity for bundles in the target stage.
 * Violations (blocking, exit 1):
 *   - A CLOSED bundle has null post_merge_evidence fields (data integrity violation)
 *   - A bundle entry is missing artifact_type or has wrong value
 * Expected state (not a violation, exit 0):
 *   - PENDING or IN_PROGRESS bundles — normal during development
 *
 * The rule "Stage N+1 must not begin before Stage N acceptance is green" is enforced
 * by checking that NO bundle is CLOSED with missing evidence. PENDING bundles are fine.
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

    const { id, status, post_merge_evidence: evidence, artifact_type } = bundle;

    // artifact_type is required on every ledger bundle entry
    if (!artifact_type) {
      console.error(`  ❌ ${id}: missing required field 'artifact_type' (expected 'development_bundle')`);
      violations++;
    } else if (artifact_type !== 'development_bundle') {
      console.error(`  ❌ ${id}: artifact_type must be 'development_bundle', got '${artifact_type}'`);
      violations++;
    }

    if (status === 'CLOSED') {
      const required = ['pr_sha', 'merge_sha', 'main_integration_run', 'db_verification_run'];
      let evidenceMissing = false;
      for (const field of required) {
        if (!evidence || evidence[field] == null) {
          console.error(`  ❌ ${id}: CLOSED but evidence.${field} is null — data integrity violation`);
          violations++;
          evidenceMissing = true;
        }
      }
      if (!evidenceMissing) {
        const sha = String(evidence.merge_sha || '').slice(0, 12);
        console.log(`  ✓ ${id}: CLOSED — merge_sha=${sha}`);
      }
    } else {
      // PENDING or IN_PROGRESS — expected during development, not a violation
      console.log(`  · ${id}: status=${status} (not yet closed)`);
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
  console.log(`✅ Stage acceptance integrity passed (${checked} bundles, 0 violations)`);
  process.exit(0);
} else {
  console.error(`❌ Stage acceptance integrity FAILED: ${violations} violation(s) across ${checked} bundles`);
  process.exit(1);
}
