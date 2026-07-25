#!/usr/bin/env node
/**
 * Non-vacuity tests for validate-stage-acceptance.mjs
 *
 * Proves the validator is not vacuous: it exits 1 (blocking) for every
 * category of invalid input and exits 0 for well-formed input.
 *
 * Cases:
 *  1  valid-closed.yaml         → exit 0 (complete CLOSED bundle passes)
 *  2  closed-null-pr-sha.yaml   → exit 1 (CLOSED bundle, pr_sha null)
 *  3  closed-null-merge-sha.yaml → exit 1 (CLOSED bundle, merge_sha null)
 *  4  missing-artifact-type.yaml → exit 1 (artifact_type field absent)
 *  5  wrong-artifact-type.yaml  → exit 1 (artifact_type=infrastructure_component on bundle)
 *  6  closed-partial-evidence.yaml → exit 1 (db_verification_run field absent = null)
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

function run(fixture, stageArg = 'all') {
  const ledgerPath = join(fixturesDir, fixture);
  return spawnSync('node', [validator, '--stage', stageArg, '--ledger', ledgerPath], {
    encoding: 'utf8',
  });
}

function expectExit(label, fixture, expectedCode) {
  const result = run(fixture);
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

// Case 1: valid complete CLOSED bundle — must PASS
expectExit(
  'valid CLOSED bundle with full evidence',
  'valid-closed.yaml',
  0
);

// Case 2: CLOSED bundle, pr_sha null — must FAIL
expectExit(
  'CLOSED bundle with null pr_sha',
  'closed-null-pr-sha.yaml',
  1
);

// Case 3: CLOSED bundle, merge_sha null — must FAIL
expectExit(
  'CLOSED bundle with null merge_sha',
  'closed-null-merge-sha.yaml',
  1
);

// Case 4: bundle entry missing artifact_type entirely — must FAIL
expectExit(
  'CLOSED bundle missing artifact_type',
  'missing-artifact-type.yaml',
  1
);

// Case 5: bundle entry with wrong artifact_type (infrastructure_component) — must FAIL
expectExit(
  'CLOSED bundle with artifact_type=infrastructure_component',
  'wrong-artifact-type.yaml',
  1
);

// Case 6: CLOSED bundle with partial evidence (db_verification_run absent) — must FAIL
expectExit(
  'CLOSED bundle with db_verification_run absent',
  'closed-partial-evidence.yaml',
  1
);

console.log(`\n${passed} passed, ${failed} failed`);

if (failed > 0) {
  console.error(`\n❌ Non-vacuity proof FAILED: validator does not correctly reject ${failed} invalid input(s)`);
  process.exit(1);
} else {
  console.log(`\n✅ Non-vacuity proof passed: validator correctly accepts valid input and rejects all ${passed - 1} invalid inputs`);
  process.exit(0);
}
