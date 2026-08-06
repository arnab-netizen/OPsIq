#!/usr/bin/env node
/**
 * Vercel Ignored Build Step
 *
 * Determines whether the current deployment can be skipped because all changed
 * files are governance-only (docs, CI metadata, test evidence).
 *
 * EXIT CODE CONTRACT (inverted from normal CLI convention — this is Vercel's API):
 *   exit 0 — SKIP the deployment (every changed file is governance-only)
 *   exit 1 — CONTINUE the deployment (any runtime-relevant file changed, or
 *             classification is uncertain due to missing history or empty diff)
 *
 * Fail-open: errors, missing history, unknown paths, and empty diffs all exit 1.
 * The script must never suppress a required deployment.
 */

import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// ── Decision constants ────────────────────────────────────────────────────────

export const SKIP_DEPLOYMENT_GOVERNANCE_ONLY = 'SKIP_DEPLOYMENT_GOVERNANCE_ONLY';
export const CONTINUE_DEPLOYMENT_RUNTIME_OR_AMBIGUOUS = 'CONTINUE_DEPLOYMENT_RUNTIME_OR_AMBIGUOUS';
export const CONTINUE_DEPLOYMENT_DIFF_UNAVAILABLE = 'CONTINUE_DEPLOYMENT_DIFF_UNAVAILABLE';

// ── Path policy ───────────────────────────────────────────────────────────────
//
// A file is governance-only if its path starts with one of these prefixes.
// Every other path is treated as runtime-relevant (deploy).
//
// The prefix list is an explicit allowlist — not a heuristic. An unknown path
// is ALWAYS treated as runtime-relevant (fail-open = continue deployment).
//
// Self-classification: this script (scripts/vercel-ignore-build.mjs), vercel.json,
// and any test for this script are all outside these prefixes and therefore
// runtime-relevant — changes to them always trigger deployment.

export const GOVERNANCE_PREFIXES = Object.freeze([
  'docs/',
  '.claude/',
  '.governance/',
  'src/__tests__/',
]);

// ── Pure classification functions (exported for tests) ─────────────────────────

/**
 * Returns true if the file path is governance-only (no runtime impact).
 * Uses exact prefix matching against the frozen GOVERNANCE_PREFIXES list.
 * Anything not matched is treated as runtime-relevant.
 *
 * @param {string} filePath — repo-relative path from git diff --name-only
 * @returns {boolean}
 */
export function isGovernanceOnly(filePath) {
  if (typeof filePath !== 'string' || filePath.length === 0) return false;
  return GOVERNANCE_PREFIXES.some(prefix => filePath.startsWith(prefix));
}

/**
 * Classifies a list of changed files and returns the deployment decision.
 *
 * Rules:
 *   - Empty list → CONTINUE (ambiguous; fail-open)
 *   - All governance-only → SKIP
 *   - Any runtime file → CONTINUE
 *
 * @param {string[]} changedFiles
 * @returns {{ decision: string, classifications: Array<{file: string, kind: string}> }}
 */
export function classifyFiles(changedFiles) {
  if (!Array.isArray(changedFiles) || changedFiles.length === 0) {
    return {
      decision: CONTINUE_DEPLOYMENT_RUNTIME_OR_AMBIGUOUS,
      reason: 'empty-diff-fail-open',
      classifications: [],
    };
  }

  const classifications = changedFiles.map(file => ({
    file,
    kind: isGovernanceOnly(file) ? 'governance-only' : 'runtime',
  }));

  const hasRuntime = classifications.some(c => c.kind === 'runtime');

  return {
    decision: hasRuntime
      ? CONTINUE_DEPLOYMENT_RUNTIME_OR_AMBIGUOUS
      : SKIP_DEPLOYMENT_GOVERNANCE_ONLY,
    classifications,
  };
}

// ── Git helpers ───────────────────────────────────────────────────────────────

function revParse(ref) {
  return execSync(`git rev-parse ${ref}`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
}

function getDiffNames(base, head = 'HEAD') {
  const raw = execSync(`git diff --name-only ${base} ${head}`, {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    maxBuffer: 10 * 1024 * 1024,
  }).trim();
  if (!raw) return [];
  return raw.split('\n').filter(Boolean);
}

function fetchDepth2() {
  try {
    execSync('git fetch --depth 2 origin HEAD', {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 30000,
    });
    return true;
  } catch {
    return false;
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const log = (msg) => console.log(`[vercel-ignore] ${msg}`);

  let headSha;
  try {
    headSha = revParse('HEAD');
  } catch (err) {
    log(`Cannot resolve HEAD: ${err.message}`);
    log(`Decision: ${CONTINUE_DEPLOYMENT_DIFF_UNAVAILABLE}`);
    process.exit(1);
  }

  log(`HEAD: ${headSha}`);

  // Determine the comparison base. For merge commits, HEAD^1 is the first
  // parent (the prior main HEAD), which captures the full PR delta. For
  // regular commits, HEAD^1 is the parent commit.
  const parentRef = 'HEAD^1';
  let parentSha;
  let changedFiles;

  try {
    parentSha = revParse(parentRef);
    changedFiles = getDiffNames(parentSha);
  } catch (firstErr) {
    log(`Parent ref ${parentRef} unavailable (shallow clone?): ${firstErr.message}`);
    log('Attempting bounded fetch (--depth 2)...');

    const fetched = fetchDepth2();
    if (!fetched) {
      log('Fetch failed. Cannot determine changed files.');
      log(`Decision: ${CONTINUE_DEPLOYMENT_DIFF_UNAVAILABLE}`);
      process.exit(1);
    }

    try {
      parentSha = revParse(parentRef);
      changedFiles = getDiffNames(parentSha);
    } catch (secondErr) {
      log(`Still cannot access parent after fetch: ${secondErr.message}`);
      log(`Decision: ${CONTINUE_DEPLOYMENT_DIFF_UNAVAILABLE}`);
      process.exit(1);
    }
  }

  log(`Comparison base: ${parentSha}`);
  log(`Changed files (${changedFiles.length}):`);

  const result = classifyFiles(changedFiles);

  for (const { file, kind } of result.classifications) {
    log(`  [${kind.padEnd(16)}] ${file}`);
  }

  if (changedFiles.length === 0) {
    log('No changed files detected (empty diff — ambiguous; failing open).');
  } else if (result.decision === SKIP_DEPLOYMENT_GOVERNANCE_ONLY) {
    log(`All ${changedFiles.length} changed file(s) are governance-only.`);
  }

  log(`Decision: ${result.decision}`);

  if (result.decision === SKIP_DEPLOYMENT_GOVERNANCE_ONLY) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

// Guard: only run main() when executed directly (not when imported for tests).
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(err => {
    console.error(`[vercel-ignore] Fatal: ${err.message}`);
    process.exit(1);
  });
}
