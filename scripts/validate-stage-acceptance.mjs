#!/usr/bin/env node
/**
 * Completion Factory — Stage Acceptance Gate
 *
 * Usage:
 *   node scripts/validate-stage-acceptance.mjs --stage 3 [--mode integrity|closure]
 *   node scripts/validate-stage-acceptance.mjs --stage all
 *
 * Modes:
 *   --mode integrity (default)
 *     Data-integrity gate. PENDING/IN_PROGRESS bundles are normal during development
 *     and pass (exit 0). Only CLOSED bundles with missing evidence fields fail (exit 1).
 *     Wire this to PR/main validation CI steps.
 *
 *   --mode closure
 *     Stage-closure gate. ALL bundles in the target stage must be CLOSED with full
 *     evidence. Any PENDING or IN_PROGRESS bundle fails (exit 1).
 *     Wire this to the explicit stage-closure authorization gate.
 *
 * Violations (exit 1 in both modes):
 *   - A CLOSED bundle has null post_merge_evidence fields (data integrity violation)
 *   - A bundle entry is missing artifact_type or has wrong value
 * Additional violation in closure mode only:
 *   - Any bundle that is not CLOSED
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { load as yamlLoad } from 'js-yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const args = process.argv.slice(2);
const stageIdx = args.indexOf('--stage');

if (stageIdx === -1 || !args[stageIdx + 1]) {
  console.error('Usage: node validate-stage-acceptance.mjs --stage <N|all> [--mode integrity|closure] [--ledger <path>]');
  process.exit(2);
}

// --mode integrity (default) | closure
const modeIdx = args.indexOf('--mode');
const mode = (modeIdx !== -1 && args[modeIdx + 1]) ? args[modeIdx + 1] : 'integrity';
if (mode !== 'integrity' && mode !== 'closure') {
  console.error(`Invalid --mode value '${mode}'. Must be 'integrity' or 'closure'.`);
  process.exit(2);
}

const stageArg = args[stageIdx + 1];

// --ledger <path> overrides the default ledger path (used by non-vacuity tests)
const ledgerIdx = args.indexOf('--ledger');
const ledgerPath = (ledgerIdx !== -1 && args[ledgerIdx + 1])
  ? args[ledgerIdx + 1]
  : join(root, 'docs', 'opsiq', 'status', 'REMAINING_STAGE_ACCEPTANCE.yaml');

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
      if (mode === 'closure') {
        // Closure gate: every bundle must be CLOSED
        console.error(`  ❌ ${id}: status=${status} — closure mode requires all bundles CLOSED`);
        violations++;
      } else {
        // Integrity gate: PENDING or IN_PROGRESS is expected during development
        console.log(`  · ${id}: status=${status} (not yet closed)`);
      }
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
const modeLabel = mode === 'closure' ? 'closure' : 'integrity';
if (violations === 0) {
  console.log(`✅ Stage acceptance ${modeLabel} passed (${checked} bundles, 0 violations)`);
  process.exit(0);
} else {
  console.error(`❌ Stage acceptance ${modeLabel} FAILED: ${violations} violation(s) across ${checked} bundles`);
  process.exit(1);
}
