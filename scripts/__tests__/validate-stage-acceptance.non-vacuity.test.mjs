#!/usr/bin/env node
/**
 * Non-vacuity tests for validate-stage-acceptance.mjs
 *
 * Proves the validator is not vacuous: it exits 1 (blocking) for every
 * category of invalid input and exits 0 for well-formed input, for BOTH modes.
 *
 * Integrity mode cases (--mode integrity, default):
 *  1  valid-closed.yaml                → exit 0 (complete CLOSED bundle passes)
 *  2  closed-null-pr-sha.yaml          → exit 1 (CLOSED bundle, pr_sha null)
 *  3  closed-null-merge-sha.yaml       → exit 1 (CLOSED bundle, merge_sha null)
 *  4  missing-artifact-type.yaml       → exit 1 (artifact_type field absent)
 *  5  wrong-artifact-type.yaml         → exit 1 (artifact_type=infrastructure_component)
 *  6  closed-partial-evidence.yaml     → exit 1 (db_verification_run field absent)
 *  7  all-pending.yaml                 → exit 0 (PENDING = normal development, integrity passes)
 *  8  mixed-closed-pending.yaml        → exit 0 (integrity: only checks CLOSED bundles)
 *
 * Closure mode cases (--mode closure):
 *  9  valid-closed.yaml                → exit 0 (all CLOSED with full evidence)
 * 10  all-pending.yaml                 → exit 1 (PENDING not allowed in closure mode)
 * 11  mixed-closed-pending.yaml        → exit 1 (one PENDING bundle blocks closure)
 * 12  closed-null-pr-sha.yaml          → exit 1 (CLOSED but evidence missing)
 *
 * Run: node scripts/__tests__/validate-stage-acceptance.non-vacuity.test.mjs
 * Exit 0 → all cases behave as expected; exit 1 → one or more cases misbehaved.
 */

import { spawnSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const validator = join(__dirname, '..', 'validate-stage-acceptance.mjs');
const fixturesDir = join(__dirname, 'fixtures', 'stage-acceptance');

let passed = 0;
let failed = 0;

function run(fixture, { stage = 'all', mode = null } = {}) {
  const ledgerPath = join(fixturesDir, fixture);
  const modeArgs = mode ? ['--mode', mode] : [];
  return spawnSync('node', [validator, '--stage', stage, ...modeArgs, '--ledger', ledgerPath], {
    encoding: 'utf8',
  });
}

function expectExit(label, fixture, expectedCode, opts = {}) {
  const result = run(fixture, opts);
  const actual = result.status;
  if (actual === expectedCode) {
    console.log(`  ✓ ${label}: exit ${actual} (expected ${expectedCode})`);
    passed++;
  } else {
    console.error(`  ✗ ${label}: exit ${actual} (expected ${expectedCode})`);
    if (result.stdout) process.stdout.write('    stdout: ' + result.stdout.slice(0, 400) + '\n');
    if (result.stderr) process.stderr.write('    stderr: ' + result.stderr.slice(0, 400) + '\n');
    failed++;
  }
}

console.log('Non-vacuity tests for validate-stage-acceptance.mjs\n');
console.log('── Integrity mode (--mode integrity / default) ──────────────────────────\n');

// Case 1: valid complete CLOSED bundle — must PASS
expectExit('valid CLOSED bundle with full evidence', 'valid-closed.yaml', 0, { mode: 'integrity' });

// Case 2: CLOSED bundle, pr_sha null — must FAIL
expectExit('CLOSED bundle with null pr_sha', 'closed-null-pr-sha.yaml', 1, { mode: 'integrity' });

// Case 3: CLOSED bundle, merge_sha null — must FAIL
expectExit('CLOSED bundle with null merge_sha', 'closed-null-merge-sha.yaml', 1, { mode: 'integrity' });

// Case 4: bundle entry missing artifact_type entirely — must FAIL
expectExit('CLOSED bundle missing artifact_type', 'missing-artifact-type.yaml', 1, { mode: 'integrity' });

// Case 5: bundle entry with wrong artifact_type — must FAIL
expectExit('CLOSED bundle with artifact_type=infrastructure_component', 'wrong-artifact-type.yaml', 1, { mode: 'integrity' });

// Case 6: CLOSED bundle with partial evidence (db_verification_run absent) — must FAIL
expectExit('CLOSED bundle with db_verification_run absent', 'closed-partial-evidence.yaml', 1, { mode: 'integrity' });

// Case 7: all-PENDING bundles → integrity mode passes (PENDING is development-normal)
expectExit('all PENDING bundles (integrity mode) → exit 0', 'all-pending.yaml', 0, { mode: 'integrity' });

// Case 8: mixed CLOSED+PENDING → integrity only checks CLOSED bundles → passes
expectExit('mixed CLOSED+PENDING (integrity mode) → exit 0', 'mixed-closed-pending.yaml', 0, { mode: 'integrity' });

console.log('\n── Closure mode (--mode closure) ────────────────────────────────────────\n');

// Case 9: all CLOSED with full evidence → closure passes
expectExit('all CLOSED with full evidence (closure mode) → exit 0', 'valid-closed.yaml', 0, { mode: 'closure' });

// Case 10: all PENDING → closure fails (must all be CLOSED)
expectExit('all PENDING bundles (closure mode) → exit 1', 'all-pending.yaml', 1, { mode: 'closure' });

// Case 11: one PENDING in otherwise-CLOSED set → closure fails
expectExit('mixed CLOSED+PENDING (closure mode) → exit 1', 'mixed-closed-pending.yaml', 1, { mode: 'closure' });

// Case 12: CLOSED but evidence missing → closure fails (evidence still required)
expectExit('CLOSED with null pr_sha (closure mode) → exit 1', 'closed-null-pr-sha.yaml', 1, { mode: 'closure' });

console.log(`\n${passed} passed, ${failed} failed`);

if (failed > 0) {
  console.error(`\n❌ Non-vacuity proof FAILED: validator does not correctly handle ${failed} case(s)`);
  process.exit(1);
} else {
  console.log(`\n✅ Non-vacuity proof passed: validator correctly accepts valid input and rejects all invalid inputs (${passed} cases)`);
  process.exit(0);
}
