#!/usr/bin/env node
/**
 * CI Governance Check — enforces workflow policy after the 2026-07-12 cost remediation.
 *
 * Violations checked:
 *  1. Scenario packs must NOT have pull_request triggers
 *  2. ci.yml must NOT have push triggers to feature/** or claude/**
 *  3. b12-s3-db-verification.yml must NOT have a push trigger with no branch filter
 *  4. Cron schedules must NOT exist on smoke test workflows
 *  5. ci-cd-foundations.yml, mvp-readiness.yml, and (CI-MIN-01) the three
 *     owner-mode consulting-engine workflows must NOT have push/PR automatic
 *     triggers (their tests are already covered by ci.yml's broad suite)
 *  14. db-verification.yml must NOT have a pull_request trigger (CI-MIN-01:
 *      DB validation moved into ci.yml's own db-verify job)
 *  15. ci.yml must wire db_required from the classifier directly into a
 *      db-verify job — one authoritative DB-risk signal, no second system
 */

import { readFileSync } from 'fs';
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
  // CI-MIN-01 owner correction, item 4: these three workflows' own test
  // paths (tests/owner-mode/holdout/**, real-world-smb-cases/**,
  // real-world-simulation/**) are already covered by ci.yml's build-and-test
  // broad non-DB suite (vitest.config.ts include: "tests/owner-mode/**/*.test.ts").
  // Automatic push/pull_request triggers here duplicated that run on every
  // consulting-engine-touching PR unconditionally.
  'owner-mode-holdout.yml',
  'owner-real-world-smb-cases.yml',
  'owner-real-world-simulation.yml',
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
  for (const line of lines) {
    if (/^on:/.test(line)) { inOn = true; continue; }
    if (/^jobs:/.test(line)) { inOn = false; continue; }
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

// 7. reusable-pr-validation.yml must use workflow_call (not push/PR) to prevent accidental direct triggers
const reusableContent = readWorkflow('reusable-pr-validation.yml');
if (reusableContent) {
  const hasWorkflowCall = /^\s+workflow_call:/m.test(reusableContent);
  check(hasWorkflowCall, 'reusable-pr-validation.yml must use workflow_call trigger (not push/PR)');
  const hasDirectPush = /^\s+push:/m.test(reusableContent);
  const hasDirectPR = /^\s+pull_request:/m.test(reusableContent);
  check(!hasDirectPush, 'reusable-pr-validation.yml must NOT have a push trigger (reusable only)');
  check(!hasDirectPR, 'reusable-pr-validation.yml must NOT have a pull_request trigger (reusable only)');
}

// 8. merge-candidate-validation.yml must be dispatch-only (workflow_dispatch)
const mergeCandidateContent = readWorkflow('merge-candidate-validation.yml');
if (mergeCandidateContent) {
  const hasDispatch = /^\s+workflow_dispatch:/m.test(mergeCandidateContent);
  check(hasDispatch, 'merge-candidate-validation.yml must have workflow_dispatch trigger');
  const hasDirectPush = /^\s+push:/m.test(mergeCandidateContent);
  const hasDirectPR = /^\s+pull_request:/m.test(mergeCandidateContent);
  check(!hasDirectPush, 'merge-candidate-validation.yml must NOT have a push trigger (dispatch-only)');
  check(!hasDirectPR, 'merge-candidate-validation.yml must NOT have a pull_request trigger (dispatch-only)');
}

// 9. ci.yml must include ready_for_review in pull_request types (CI_TRIGGER_GAP_PR284)
//    A PR converted from draft to ready fires this event. Without it, CI does not run
//    when a PR is marked ready and the merged HEAD has no CI evidence.
if (ciContent) {
  const hasReadyForReview = /ready_for_review/.test(ciContent);
  check(hasReadyForReview, 'ci.yml must include ready_for_review in pull_request types — absence caused CI_TRIGGER_GAP_PR284 (draft→ready PRs got no CI run)');
}

// 10. main-integration.yml must have workflow_dispatch trigger (CI_RECOVERY_DISPATCH_ABSENT)
//     Without this, a missing or stale main-integration run requires a dummy push to recover.
const mainIntContent = readWorkflow('main-integration.yml');
if (mainIntContent) {
  const hasDispatch = /^\s+workflow_dispatch:/m.test(mainIntContent);
  check(hasDispatch, 'main-integration.yml must have workflow_dispatch trigger — absence made manual CI recovery require a dummy push (CI_RECOVERY_DISPATCH_ABSENT)');

  // 11. workflow_dispatch on main-integration.yml must not expose an arbitrary SHA or branch input.
  //     Such an input would let a caller run the full DB suite on a commit that never went through
  //     PR CI, bypassing the staged gate structure entirely.
  const hasShaInput = /\bsha\b\s*:/.test(mainIntContent) && /workflow_dispatch/.test(mainIntContent);
  check(!hasShaInput, 'main-integration.yml workflow_dispatch must NOT expose a sha input — callers cannot target arbitrary commits');
}

// 12. stage7-trusted-verifier.yml must use repository_dispatch (not workflow_dispatch).
//     Rationale: repository_dispatch requires Contents: write only.
//     workflow_dispatch requires Actions: write — unnecessary privilege escalation.
//     Evidence persistence already needs Contents: write; no broader grant should be added.
const verifierContent = readWorkflow('stage7-trusted-verifier.yml');
if (verifierContent) {
  const hasRepositoryDispatch = /^\s+repository_dispatch:/m.test(verifierContent);
  const hasWorkflowDispatch = /^\s+workflow_dispatch:/m.test(verifierContent);
  check(hasRepositoryDispatch, 'stage7-trusted-verifier.yml must use repository_dispatch trigger (Contents: write only — Actions: write is unnecessary)');
  check(!hasWorkflowDispatch, 'stage7-trusted-verifier.yml must NOT use workflow_dispatch trigger (requires Actions: write — privilege escalation beyond Contents: write)');
  const hasCorrectEventType = /types:\s*\[\s*stage7-verify-artifacts\s*\]/.test(verifierContent);
  check(hasCorrectEventType, 'stage7-trusted-verifier.yml repository_dispatch must specify types: [stage7-verify-artifacts]');
}

// 13. The stage7-capture CALLER must match the verifier's declared trigger.
//     Rule 12 governs only the verifier side. On 2026-08-xx the verifier was
//     converted to repository_dispatch to satisfy rule 12 while stage7-capture was
//     left POSTing the workflow_dispatch envelope — a dispatch that can never
//     arrive, discovered only by a manual audit. A one-sided rule cannot see that,
//     so the pairing itself is now governed: trigger, endpoint, event type and
//     payload envelope are checked together, on both files, as one contract.
const captureContent = readWorkflow('stage7-capture.yml');
if (captureContent && verifierContent) {
  const usesRepoDispatchEndpoint = /api\.github\.com\/repos\/\$\{?REPO\}?\/dispatches/.test(captureContent);
  check(
    usesRepoDispatchEndpoint,
    'stage7-capture.yml must dispatch the trusted verifier via POST /repos/$REPO/dispatches — the verifier declares repository_dispatch and reads client_payload',
  );

  const usesWorkflowDispatchEndpoint = /actions\/workflows\/stage7-trusted-verifier\.yml\/dispatches/.test(captureContent);
  check(
    !usesWorkflowDispatchEndpoint,
    'stage7-capture.yml must NOT POST to the workflow_dispatch endpoint for stage7-trusted-verifier.yml — that trigger does not exist on the verifier and the endpoint requires Actions: write',
  );

  check(
    /event_type["' ]*[:=][^\n]*stage7-verify-artifacts|--arg\s+event_type\s+"stage7-verify-artifacts"/.test(captureContent),
    "stage7-capture.yml dispatch payload must set event_type to 'stage7-verify-artifacts' to match the verifier's repository_dispatch types",
  );

  check(
    /client_payload/.test(captureContent),
    'stage7-capture.yml dispatch payload must use a client_payload envelope — the verifier reads github.event.client_payload.*',
  );

  // Every client_payload field the verifier consumes must be one the caller sends.
  const consumed = [...verifierContent.matchAll(/github\.event\.client_payload\.([A-Za-z0-9_]+)/g)]
    .map((m) => m[1]);
  const consumedUnique = [...new Set(consumed)];
  const payloadBlock = (/client_payload:\s*\{([^}]*)\}/.exec(captureContent) || [null, ''])[1];
  for (const field of consumedUnique) {
    check(
      new RegExp(`\\b${field}\\b`).test(payloadBlock),
      `stage7-capture.yml client_payload must supply '${field}' — stage7-trusted-verifier.yml reads github.event.client_payload.${field}`,
    );
  }

  // The capture job must not have widened its grant to keep a workflow_dispatch
  // call alive. repository_dispatch needs Contents: write, which it already holds.
  const capturePerms = (/^permissions:\n((?:\s{2}\S.*\n)+)/m.exec(captureContent) || [null, ''])[1];
  check(
    !/actions:\s*write/.test(capturePerms),
    'stage7-capture.yml must NOT grant actions: write — repository_dispatch needs only contents: write (rule 12 rationale)',
  );
  check(
    /contents:\s*write/.test(capturePerms),
    'stage7-capture.yml must grant contents: write — required by POST /repos/{owner}/{repo}/dispatches',
  );
}

// 14. db-verification.yml must NOT have a pull_request trigger (CI-MIN-01
//     owner correction, items 1-3): DB validation now runs inside ci.yml's
//     own db-verify job, gated by the classifier's db_required output --
//     branch-protection is the ONLY required GitHub status check on main
//     (confirmed via the repo's branch ruleset), so a separate workflow's
//     own passing check was never actually a merge gate. db-verification.yml
//     stays workflow_dispatch-only, for explicit Neon/throwaway-Postgres
//     re-verification, never a second source of truth for DB risk.
const dbVerificationContent = readWorkflow('db-verification.yml');
if (dbVerificationContent) {
  const hasPullRequest = /^\s+pull_request:/m.test(dbVerificationContent);
  check(!hasPullRequest, 'db-verification.yml must NOT have a pull_request trigger — DB validation runs pre-merge inside ci.yml\'s own db-verify job now (CI-MIN-01)');
  const hasDispatch = /^\s+workflow_dispatch:/m.test(dbVerificationContent);
  check(hasDispatch, 'db-verification.yml must have a workflow_dispatch trigger — kept for explicit Neon/throwaway-Postgres re-verification');
}

// 15. ci.yml must wire a single authoritative DB-risk signal: the classify
//     job must expose db_required, and the db-verify job must be gated on
//     it directly (needs.classify.outputs.db_required == 'true') -- not on
//     any second, separate path-filter mechanism.
if (ciContent) {
  const hasDbRequiredOutput = /db_required:\s*\$\{\{\s*steps\.classify\.outputs\.db_required\s*\}\}/.test(ciContent);
  check(hasDbRequiredOutput, "ci.yml's classify job must output db_required from the classifier script");
  const hasDbVerifyJob = /^\s*db-verify:/m.test(ciContent);
  check(hasDbVerifyJob, 'ci.yml must have a db-verify job (CI-MIN-01 owner correction, item 1)');
  const dbVerifyGatedOnClassifier = /db-verify:[\s\S]*?if:\s*needs\.classify\.outputs\.db_required\s*==\s*'true'/.test(ciContent);
  check(dbVerifyGatedOnClassifier, "ci.yml's db-verify job must be gated on needs.classify.outputs.db_required == 'true' — one classifier, one decision");
}

// Summary
const rulesChecked = SCENARIO_PACKS.length + CRON_BANNED.length + PUSH_BANNED_OVERLAPPING.length + 14;
if (violations === 0) {
  console.log(`✓ CI governance check passed (${rulesChecked} rules checked)`);
  process.exit(0);
} else {
  console.error(`\n✗ CI governance check FAILED: ${violations} violation(s)`);
  console.error('See docs/audits/2026-07-12/FINAL_CI_ARCHITECTURE.md for the approved workflow policy.');
  process.exit(1);
}
