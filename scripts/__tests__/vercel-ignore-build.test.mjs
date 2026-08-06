#!/usr/bin/env node
/**
 * vercel-ignore-build.mjs — classification unit tests
 *
 * Proves the script's path classification logic is correct for all 20 cases
 * below, including: governance-only paths, runtime paths, mixed inputs, empty
 * inputs, self-classification, and historical regression.
 *
 * Tests the exported pure functions directly — no git calls, no subprocesses.
 *
 * Run: node scripts/__tests__/vercel-ignore-build.test.mjs
 * Exit 0 → all cases pass; exit 1 → one or more cases misbehaved.
 *
 * Exit code semantics reminder (Vercel, not normal CLI convention):
 *   SKIP_DEPLOYMENT_GOVERNANCE_ONLY        → script exits 0 (skip)
 *   CONTINUE_DEPLOYMENT_RUNTIME_OR_AMBIGUOUS → script exits 1 (continue)
 *   CONTINUE_DEPLOYMENT_DIFF_UNAVAILABLE   → script exits 1 (continue)
 */

import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Import the exported pure functions from the script under test.
const {
  isGovernanceOnly,
  classifyFiles,
  SKIP_DEPLOYMENT_GOVERNANCE_ONLY,
  CONTINUE_DEPLOYMENT_RUNTIME_OR_AMBIGUOUS,
  GOVERNANCE_PREFIXES,
} = await import(join(__dirname, '..', 'vercel-ignore-build.mjs'));

let passed = 0;
let failed = 0;

function assert(label, actual, expected) {
  if (actual === expected) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}`);
    console.error(`    expected: ${JSON.stringify(expected)}`);
    console.error(`    actual:   ${JSON.stringify(actual)}`);
    failed++;
  }
}

function assertDecision(label, files, expectedDecision) {
  const result = classifyFiles(files);
  assert(label, result.decision, expectedDecision);
}

function assertGovernance(label, path, expected) {
  assert(label, isGovernanceOnly(path), expected);
}

// ── isGovernanceOnly: governance prefixes ─────────────────────────────────────

console.log('\n── isGovernanceOnly: governance-only paths ──');

assertGovernance(
  'case 01 — docs/ root file',
  'docs/opsiq/bundles/factory-stage-7-closure.yaml',
  true,
);
assertGovernance(
  'case 02 — docs/ nested file',
  'docs/opsiq/status/REMAINING_STAGE_ACCEPTANCE.yaml',
  true,
);
assertGovernance(
  'case 03 — .claude/ active-state',
  '.claude/active-state.json',
  true,
);
assertGovernance(
  'case 04 — .claude/ test-quarantine',
  '.claude/test-quarantine.json',
  true,
);
assertGovernance(
  'case 05 — .governance/ nested file',
  '.governance/policy.yaml',
  true,
);
assertGovernance(
  'case 06 — src/__tests__/ completion-factory evidence test',
  'src/__tests__/completion-factory/stage7-g1-proof-binding.test.ts',
  true,
);
assertGovernance(
  'case 07 — src/__tests__/ deeply nested test',
  'src/__tests__/completion-factory/stage7-evidence-artifact.test.ts',
  true,
);

// ── isGovernanceOnly: runtime paths ──────────────────────────────────────────

console.log('\n── isGovernanceOnly: runtime-relevant paths ──');

assertGovernance(
  'case 08 — src/ application code (not __tests__)',
  'src/app/owner/data-hub/page.tsx',
  false,
);
assertGovernance(
  'case 09 — app/ Next.js route',
  'app/api/internal/route.ts',
  false,
);
assertGovernance(
  'case 10 — scripts/ (including this script itself)',
  'scripts/vercel-ignore-build.mjs',
  false,
);
assertGovernance(
  'case 11 — vercel.json self-classification',
  'vercel.json',
  false,
);
assertGovernance(
  'case 12 — scripts/__tests__/ (not src/__tests__/)',
  'scripts/__tests__/vercel-ignore-build.test.mjs',
  false,
);
assertGovernance(
  'case 13 — prisma schema',
  'prisma/schema.prisma',
  false,
);
assertGovernance(
  'case 14 — package.json',
  'package.json',
  false,
);
assertGovernance(
  'case 15 — .github/ workflow',
  '.github/workflows/ci.yml',
  false,
);
assertGovernance(
  'case 16 — package-lock.json',
  'package-lock.json',
  false,
);

// ── isGovernanceOnly: edge cases ─────────────────────────────────────────────

console.log('\n── isGovernanceOnly: edge / hostile cases ──');

assertGovernance(
  'case 17 — empty string is not governance-only (fail-open)',
  '',
  false,
);
assertGovernance(
  'case 18 — path that is docs without trailing slash is not matched',
  'docs',
  false,
);
assertGovernance(
  'case 19 — uppercase DOCS/ is not matched (case-sensitive)',
  'DOCS/something.yaml',
  false,
);
assertGovernance(
  'case 20 — path containing .claude/ but not starting with it is not matched',
  'src/.claude/something',
  false,
);

// ── classifyFiles: decision logic ─────────────────────────────────────────────

console.log('\n── classifyFiles: decision rules ──');

assertDecision(
  'decision 01 — empty list → CONTINUE (fail-open)',
  [],
  CONTINUE_DEPLOYMENT_RUNTIME_OR_AMBIGUOUS,
);

assertDecision(
  'decision 02 — all governance-only files → SKIP',
  [
    '.claude/active-state.json',
    'docs/opsiq/bundles/factory-stage-7-closure.yaml',
    'src/__tests__/completion-factory/stage7-g1-proof-binding.test.ts',
  ],
  SKIP_DEPLOYMENT_GOVERNANCE_ONLY,
);

assertDecision(
  'decision 03 — any runtime file → CONTINUE',
  [
    'docs/opsiq/status/REMAINING_STAGE_ACCEPTANCE.yaml',
    'src/app/owner/page.tsx',
  ],
  CONTINUE_DEPLOYMENT_RUNTIME_OR_AMBIGUOUS,
);

assertDecision(
  'decision 04 — single runtime file → CONTINUE',
  ['package.json'],
  CONTINUE_DEPLOYMENT_RUNTIME_OR_AMBIGUOUS,
);

assertDecision(
  'decision 05 — single governance file → SKIP',
  ['docs/opsiq/evidence/stage-7/README.md'],
  SKIP_DEPLOYMENT_GOVERNANCE_ONLY,
);

// ── Historical regression: PR #282 (governance-only, should SKIP) ─────────────

console.log('\n── Historical regression ──');

assertDecision(
  'regression PR #282 — governance-only merge → SKIP',
  [
    '.claude/active-state.json',
    'docs/opsiq/bundles/factory-stage-7-closure.yaml',
    'src/__tests__/completion-factory/stage7-g1-proof-binding.test.ts',
  ],
  SKIP_DEPLOYMENT_GOVERNANCE_ONLY,
);

// PR #281 introduced runtime files: routes, services, Prisma schema, etc.
assertDecision(
  'regression PR #281 — runtime changes → CONTINUE',
  [
    'src/app/owner/data-hub/page.tsx',
    'src/app/owner/data-hub/intake/page.tsx',
    'src/app/api/owner/data-hub/intake/route.ts',
    'src/services/data-intake/data-intake.service.ts',
    'prisma/schema.prisma',
    'src/__tests__/completion-factory/stage7-g1-proof-binding.test.ts',
  ],
  CONTINUE_DEPLOYMENT_RUNTIME_OR_AMBIGUOUS,
);

// A docs-only PR should skip.
assertDecision(
  'regression docs-only PR — all docs → SKIP',
  [
    'docs/opsiq/ci/NON_DB_SUITE_CAPACITY.md',
    'docs/opsiq/evidence/stage-7/README.md',
  ],
  SKIP_DEPLOYMENT_GOVERNANCE_ONLY,
);

// A package-lock-only update must deploy (dependency changes affect runtime).
assertDecision(
  'regression package-lock.json update → CONTINUE',
  ['package-lock.json'],
  CONTINUE_DEPLOYMENT_RUNTIME_OR_AMBIGUOUS,
);

// ── Self-classification: script and config changes must deploy ─────────────────

console.log('\n── Self-classification ──');

assertDecision(
  'self 01 — this script itself → CONTINUE',
  ['scripts/vercel-ignore-build.mjs'],
  CONTINUE_DEPLOYMENT_RUNTIME_OR_AMBIGUOUS,
);

assertDecision(
  'self 02 — vercel.json → CONTINUE',
  ['vercel.json'],
  CONTINUE_DEPLOYMENT_RUNTIME_OR_AMBIGUOUS,
);

assertDecision(
  'self 03 — test for this script → CONTINUE',
  ['scripts/__tests__/vercel-ignore-build.test.mjs'],
  CONTINUE_DEPLOYMENT_RUNTIME_OR_AMBIGUOUS,
);

assertDecision(
  'self 04 — all three together → CONTINUE',
  [
    'scripts/vercel-ignore-build.mjs',
    'vercel.json',
    'scripts/__tests__/vercel-ignore-build.test.mjs',
  ],
  CONTINUE_DEPLOYMENT_RUNTIME_OR_AMBIGUOUS,
);

// ── Summary ───────────────────────────────────────────────────────────────────

const total = passed + failed;
console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'} — ${passed}/${total} cases`);

if (failed > 0) {
  process.exit(1);
}
