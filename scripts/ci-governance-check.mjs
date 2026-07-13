#!/usr/bin/env node
/**
 * CI Governance Check — enforces workflow policy after the 2026-07-12 cost remediation.
 *
 * Violations checked:
 *  1. Scenario packs must NOT have pull_request triggers
 *  2. ci.yml must NOT have push triggers to feature/** or claude/**
 *  3. b12-s3-db-verification.yml must NOT have a push trigger with no branch filter
 *  4. Cron schedules must NOT exist on smoke test workflows
 *  5. ci-cd-foundations.yml and mvp-readiness.yml must NOT have push/PR automatic triggers
 */

import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const workflowsDir = join(__dirname, '..', '.github', 'workflows');

const SCENARIO_PACKS = [
  'chaos-exhaustive.yml',
  'customer-vendor-market.yml',
  'daily-operations.yml',
  'finance-cash.yml',
  'growth-profit-scaling.yml',
  'local-legal-professional-boundary.yml',
  'sequential-simulations.yml',
  'staff-proof-anti-gaming.yml',
  'ugly-tail-risk-crisis.yml',
  'unknown-ood.yml',
  'weekly-management-trend.yml',
];

const CRON_BANNED = [
  'smoke-production-signup-dashboard.yml',
  'smoke-production-diagnosis-dashboard.yml',
];

const PUSH_BANNED_OVERLAPPING = [
  'ci-cd-foundations.yml',
  'mvp-readiness.yml',
];

let violations = 0;

function check(condition, message) {
  if (!condition) {
    console.error(`VIOLATION: ${message}`);
    violations++;
  }
}

function readWorkflow(name) {
  try {
    return readFileSync(join(workflowsDir, name), 'utf8');
  } catch {
    return null;
  }
}

// 1. Scenario packs must not have pull_request triggers
for (const pack of SCENARIO_PACKS) {
  const content = readWorkflow(pack);
  if (!content) {
    console.warn(`WARN: ${pack} not found — skipping`);
    continue;
  }
  const hasPR = /^\s+pull_request:/m.test(content);
  check(!hasPR, `${pack} has a pull_request trigger (scenario packs must be dispatch-only)`);
}

// 2. ci.yml must not have push to feature/** or claude/**
const ciContent = readWorkflow('ci.yml');
if (ciContent) {
  const hasFeaturePush = /feature\/\*\*/.test(ciContent);
  const hasClaudePush = /claude\/\*\*/.test(ciContent);
  // ci.yml may still have push to main (for the branch-protection job to work correctly
  // in some configurations). Flag only the broad branch patterns.
  check(!hasFeaturePush, 'ci.yml has push trigger to feature/** (broad push increases cost)');
  check(!hasClaudePush, 'ci.yml has push trigger to claude/** (broad push increases cost)');
}

// 3. b12-s3-db-verification.yml must not have a push trigger with no branch filter
const b12s3 = readWorkflow('b12-s3-db-verification.yml');
if (b12s3) {
  // A push trigger with no branches: means it fires on every push to any branch
  const hasDangerousPush = /^\s*push:\s*\n\s+paths:/m.test(b12s3);
  check(!hasDangerousPush, 'b12-s3-db-verification.yml has push trigger with no branch filter (fires on ALL branches)');
}

// 4. Cron schedules must not exist on smoke test workflows
for (const smoke of CRON_BANNED) {
  const content = readWorkflow(smoke);
  if (!content) {
    console.warn(`WARN: ${smoke} not found — skipping`);
    continue;
  }
  const hasCron = /^\s*cron:/m.test(content);
  check(!hasCron, `${smoke} has a cron schedule (production smoke tests must be dispatch-only)`);
}

// 5. Overlapping core CI workflows must not have automatic push/PR triggers
for (const workflow of PUSH_BANNED_OVERLAPPING) {
  const content = readWorkflow(workflow);
  if (!content) {
    console.warn(`WARN: ${workflow} not found — skipping`);
    continue;
  }
  // Look for push: or pull_request: in the on: block (not inside comments)
  const lines = content.split('\n');
  let inOn = false;
  let inJobs = false;
  for (const line of lines) {
    if (/^on:/.test(line)) { inOn = true; inJobs = false; continue; }
    if (/^jobs:/.test(line)) { inOn = false; inJobs = true; continue; }
    if (inOn && /^\s+(push|pull_request):/.test(line) && !line.trimStart().startsWith('#')) {
      const trigger = line.trim().replace(':', '');
      check(false, `${workflow} has an automatic '${trigger}:' trigger (must be dispatch-only — duplicates ci.yml)`);
    }
  }
}

// 6. db-verification.yml must use canonical glob for DB test execution
//    (hardcoded per-file lists silently omit new *.db.test.ts files)
const dbVerifyContent = readWorkflow('db-verification.yml');
if (dbVerifyContent) {
  const hasGlob = dbVerifyContent.includes("'.db.test.ts'");
  check(hasGlob, "db-verification.yml must use filter '.db.test.ts' for LANE_B/LANE_A test execution — hardcoded file lists omit newly added DB tests");
}

// Summary
if (violations === 0) {
  console.log(`✓ CI governance check passed (${SCENARIO_PACKS.length + CRON_BANNED.length + PUSH_BANNED_OVERLAPPING.length + 3} rules checked)`);
  process.exit(0);
} else {
  console.error(`\n✗ CI governance check FAILED: ${violations} violation(s)`);
  console.error('See docs/audits/2026-07-12/FINAL_CI_ARCHITECTURE.md for the approved workflow policy.');
  process.exit(1);
}
