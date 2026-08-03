#!/usr/bin/env node
/**
 * Factory Stage 7 — Evidence Artifact Validator
 *
 * Reads every artifact under docs/opsiq/evidence/stage-7/artifacts/, validates it
 * against the canonical form, and assigns each an acceptance level.
 *
 * Design and threat model: docs/opsiq/evidence/stage-7/EVIDENCE_ARTIFACT_SPEC.md
 * Authority for the rules: scripts/lib/evidence-artifact.mjs
 *
 * ─── Acceptance levels ───────────────────────────────────────────────────────
 *   REJECTED    structural, lane, hash, signature or provenance violation
 *   UNVERIFIED  well-formed, but signature or provenance was not verified
 *   ACCEPTED    structural + signature verified + provenance verified
 *
 * Only ACCEPTED may back a PROVEN invariant. UNVERIFIED is the fail-closed default
 * when the signing key or a GitHub token is unavailable, so a gate that cannot
 * check provenance can never conclude that provenance holds.
 *
 * ─── Modes ───────────────────────────────────────────────────────────────────
 *   default                  exit 1 if any artifact is REJECTED. Runs on every PR,
 *                            so a malformed artifact is caught where it is added.
 *   --require-accepted       additionally exit 1 for any UNVERIFIED artifact.
 *   --require-provenance     cross-check each artifact against the GitHub Actions
 *                            run or owner comment it names, and require subject_sha
 *                            to be an ancestor of origin/main. Needs GH_TOKEN.
 *
 * Environment:
 *   EVIDENCE_SIGNING_KEY   enables signature verification
 *   GH_TOKEN / GITHUB_TOKEN enables provenance cross-check
 *   EVIDENCE_OWNER_LOGINS  comma-separated owner allowlist for owner-lane provenance
 *
 * This validator reports on artifacts. It never marks an invariant PROVEN, never
 * writes to a bundle manifest, and never reports Stage 7 progress. An empty
 * artifact directory is reported as empty — it is neither a pass nor a failure.
 *
 * Exit codes:
 *   0 — no blocking violation in the selected mode
 *   1 — one or more blocking violations
 *   2 — the validator could not run as asked (bad flag, missing token)
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, relative, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ACCEPTANCE,
  CI_LANES,
  OWNER_LANES,
  PROVENANCE_STATE,
  SIGNATURE_STATE,
  classifyAcceptance,
  evaluateOwnerProvenance,
  evaluateRunProvenance,
  explainAcceptance,
  validateEvidenceArtifact,
} from './lib/evidence-artifact.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const DEFAULT_DIR = join(repoRoot, 'docs', 'opsiq', 'evidence', 'stage-7', 'artifacts');

const KNOWN_FLAGS = ['--require-accepted', '--require-provenance', '--dir', '--json'];

function usageError(message) {
  console.error(`ERROR: ${message}`);
  console.error(`Usage: node scripts/validate-evidence-artifacts.mjs [${KNOWN_FLAGS.join('] [')} <path>]`);
  process.exit(2);
}

const argv = process.argv.slice(2);
const options = { requireAccepted: false, requireProvenance: false, dir: DEFAULT_DIR, json: false };

for (let i = 0; i < argv.length; i += 1) {
  const token = argv[i];
  if (token === '--require-accepted') options.requireAccepted = true;
  else if (token === '--require-provenance') options.requireProvenance = true;
  else if (token === '--json') options.json = true;
  else if (token === '--dir') {
    const value = argv[i + 1];
    if (!value) usageError('--dir requires a path');
    options.dir = value;
    i += 1;
  } else usageError(`unknown flag '${token}'`);
}

const signingKey = process.env.EVIDENCE_SIGNING_KEY?.trim() || null;
const githubToken = process.env.GH_TOKEN?.trim() || process.env.GITHUB_TOKEN?.trim() || null;
const ownerLogins = (process.env.EVIDENCE_OWNER_LOGINS ?? '')
  .split(',')
  .map((login) => login.trim())
  .filter((login) => login.length > 0);

if (options.requireProvenance && !githubToken) {
  usageError('--require-provenance needs GH_TOKEN or GITHUB_TOKEN to cross-check runs and owner attestations. Refusing to report provenance as verified without checking it.');
}

// ─── Collect artifact files ───────────────────────────────────────────────────

function collectJsonFiles(dir) {
  if (!existsSync(dir)) return [];
  const found = [];
  for (const entry of readdirSync(dir).sort()) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) found.push(...collectJsonFiles(full));
    else if (entry.endsWith('.json')) found.push(full);
  }
  return found;
}

const files = collectJsonFiles(options.dir);

// ─── GitHub cross-checks ──────────────────────────────────────────────────────

async function githubJson(url) {
  const response = await fetch(url, {
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${githubToken}`,
      'user-agent': 'opsiq-stage7-evidence-validator',
      'x-github-api-version': '2022-11-28',
    },
  });
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`GitHub API ${response.status} for ${url}`);
  }
  return response.json();
}

/** `https://github.com/o/r/issues/12#issuecomment-345` → issue-comment API URL. */
function ownerCommentApiUrl(ref) {
  const match = /^https:\/\/github\.com\/([^/]+\/[^/]+)\/(?:issues|pull)\/\d+#issuecomment-(\d+)$/.exec(String(ref ?? ''));
  if (!match) return null;
  return `https://api.github.com/repos/${match[1]}/issues/comments/${match[2]}`;
}

let ancestryChecked = false;
let mainRef = null;

function resolveMainRef() {
  for (const ref of ['origin/main', 'main']) {
    const probe = spawnSync('git', ['rev-parse', '--verify', `${ref}^{commit}`], { cwd: repoRoot, encoding: 'utf8' });
    if (probe.status === 0) return ref;
  }
  return null;
}

function checkAncestry(sha) {
  if (!ancestryChecked) {
    mainRef = resolveMainRef();
    ancestryChecked = true;
  }
  if (mainRef === null) {
    return [`subject_sha ${sha}: cannot verify ancestry — neither origin/main nor main is present in this clone (fetch-depth: 0 is required)`];
  }
  const known = spawnSync('git', ['cat-file', '-e', `${sha}^{commit}`], { cwd: repoRoot, encoding: 'utf8' });
  if (known.status !== 0) {
    return [`subject_sha ${sha} is not present in this clone — git is the retention layer for Stage 7 evidence, so an unknown commit cannot be evidence`];
  }
  const ancestor = spawnSync('git', ['merge-base', '--is-ancestor', sha, mainRef], { cwd: repoRoot, encoding: 'utf8' });
  if (ancestor.status !== 0) {
    return [`subject_sha ${sha} is not an ancestor of ${mainRef} — the frozen standard invalidates any artifact whose subject_sha is not an ancestor of main`];
  }
  return [];
}

async function verifyProvenance(artifact) {
  const violations = [];
  if (CI_LANES.includes(artifact.lane)) {
    let run = null;
    try {
      run = await githubJson(`https://api.github.com/repos/${artifact.producer.repository}/actions/runs/${artifact.producer.run_id}`);
    } catch (error) {
      return [`${artifact.artifact_id}: could not retrieve run ${artifact.producer.run_id} — ${error.message}`];
    }
    violations.push(...evaluateRunProvenance(artifact, run));
  } else if (OWNER_LANES.includes(artifact.lane)) {
    const apiUrl = ownerCommentApiUrl(artifact.producer.owner_attestation_ref);
    if (apiUrl === null) {
      return [`${artifact.artifact_id}: producer.owner_attestation_ref '${artifact.producer.owner_attestation_ref}' is not a GitHub issue- or PR-comment URL of the form https://github.com/<owner>/<repo>/issues/<n>#issuecomment-<id>`];
    }
    let comment = null;
    try {
      comment = await githubJson(apiUrl);
    } catch (error) {
      return [`${artifact.artifact_id}: could not retrieve owner attestation — ${error.message}`];
    }
    const allowed = ownerLogins.length > 0
      ? ownerLogins
      : [String(artifact.producer.repository ?? '').split('/')[0]].filter(Boolean);
    violations.push(...evaluateOwnerProvenance(artifact, comment, allowed));
  }
  violations.push(...checkAncestry(artifact.subject_sha).map((v) => `${artifact.artifact_id}: ${v}`));
  return violations;
}

// ─── Evaluate every artifact ──────────────────────────────────────────────────

const records = [];
const seenIds = new Map();

for (const file of files) {
  const relPath = relative(repoRoot, file);
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    records.push({
      path: relPath,
      artifactId: null,
      level: ACCEPTANCE.REJECTED,
      violations: [`${relPath}: not parseable as JSON — ${error.message}`],
      signatureState: SIGNATURE_STATE.ABSENT,
      provenanceState: PROVENANCE_STATE.UNCHECKED,
    });
    continue;
  }

  const { violations, signatureState } = validateEvidenceArtifact(parsed, {
    signingKey,
    fileName: basename(file),
  });
  const scoped = violations.map((violation) => `${relPath}: ${violation}`);

  const artifactId = typeof parsed?.artifact_id === 'string' ? parsed.artifact_id : null;
  if (artifactId) {
    if (seenIds.has(artifactId)) {
      scoped.push(`${relPath}: duplicate artifact_id ${artifactId}, already recorded by ${seenIds.get(artifactId)} — an artifact copied and re-filed is not a second observation`);
    } else {
      seenIds.set(artifactId, relPath);
    }
  }

  let provenanceState = PROVENANCE_STATE.UNCHECKED;
  if (options.requireProvenance && scoped.length === 0) {
    // Serial by design: artifacts are few, and GitHub secondary rate limits
    // punish a burst of concurrent API calls far more than they cost here.
    const provenanceViolations = await verifyProvenance(parsed);
    if (provenanceViolations.length > 0) {
      provenanceState = PROVENANCE_STATE.FAILED;
      scoped.push(...provenanceViolations.map((violation) => `${relPath}: ${violation}`));
    } else {
      provenanceState = PROVENANCE_STATE.VERIFIED;
    }
  }

  records.push({
    path: relPath,
    artifactId,
    lane: parsed?.lane ?? null,
    invariantId: parsed?.invariant_id ?? null,
    level: classifyAcceptance({ violations: scoped, signatureState, provenanceState }),
    violations: scoped,
    signatureState,
    provenanceState,
  });
}

// `supersedes` must name an artifact that exists, or the chain is unauditable.
for (const record of records) {
  if (record.violations.length > 0) continue;
  const parsed = JSON.parse(readFileSync(join(repoRoot, record.path), 'utf8'));
  if (parsed.supersedes && !seenIds.has(parsed.supersedes)) {
    record.violations.push(`${record.path}: supersedes ${parsed.supersedes}, which is not present in ${relative(repoRoot, options.dir)} — a superseding artifact must be auditable against the artifact it replaces`);
    record.level = ACCEPTANCE.REJECTED;
  }
}

// ─── Report ───────────────────────────────────────────────────────────────────

const rejected = records.filter((r) => r.level === ACCEPTANCE.REJECTED);
const unverified = records.filter((r) => r.level === ACCEPTANCE.UNVERIFIED);
const accepted = records.filter((r) => r.level === ACCEPTANCE.ACCEPTED);

if (options.json) {
  console.log(JSON.stringify({ dir: relative(repoRoot, options.dir), total: records.length, records }, null, 2));
} else {
  console.log(`Stage 7 evidence artifacts — ${relative(repoRoot, options.dir)}`);
  console.log(`  mode: ${options.requireAccepted ? 'require-accepted' : 'default'}`
    + `${options.requireProvenance ? ' + provenance' : ''}`
    + `, signing key ${signingKey ? 'available' : 'NOT available'}`);
  console.log('');

  if (records.length === 0) {
    console.log('  0 artifacts present.');
    console.log('');
    console.log('  An empty artifact directory is neither a pass nor a failure. It means no Stage 7');
    console.log('  observation has been captured. It is not evidence of progress and must never be');
    console.log('  cited as such.');
  } else {
    for (const record of records) {
      const detail = record.level === ACCEPTANCE.ACCEPTED
        ? ''
        : ` — ${explainAcceptance(record) || 'see violations'}`;
      console.log(`  ${record.level.padEnd(10)} ${record.artifactId ?? record.path} `
        + `${record.invariantId ?? '?'} ${record.lane ?? '?'}${detail}`);
      for (const violation of record.violations) console.log(`      VIOLATION: ${violation}`);
    }
    console.log('');
    console.log(`  ${accepted.length} accepted, ${unverified.length} unverified, ${rejected.length} rejected, ${records.length} total`);
    console.log('');
    console.log('  Acceptance level describes an artifact, not an invariant. No invariant is PROVEN');
    console.log('  by this validator; recording an artifact against an invariant is a separate,');
    console.log('  owner-authorised act.');
  }
}

const blocking = options.requireAccepted ? rejected.length + unverified.length : rejected.length;
if (blocking > 0) {
  console.error('');
  console.error(`BLOCKING: ${blocking} artifact(s) do not satisfy the ${options.requireAccepted ? 'require-accepted' : 'default'} mode.`);
  process.exit(1);
}
process.exit(0);
