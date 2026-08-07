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

import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ACCEPTANCE,
  CI_LANES,
  OWNER_LANES,
  PROVENANCE_STATE,
  classifyAcceptance,
  evaluateOwnerProvenance,
  evaluateRunProvenance,
  evaluateSupersessionChain,
  explainAcceptance,
  loadEvidenceArtifactIndex,
  loadKeyRegistry,
} from './lib/evidence-artifact.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const DEFAULT_DIR = join(repoRoot, 'docs', 'opsiq', 'evidence', 'stage-7', 'artifacts');

const KNOWN_FLAGS = ['--require-accepted', '--require-provenance', '--from-auth-sha-registry', '--dir', '--json'];

function usageError(message) {
  console.error(`ERROR: ${message}`);
  console.error(`Usage: node scripts/validate-evidence-artifacts.mjs [${KNOWN_FLAGS.join('] [')} <path>]`);
  process.exit(2);
}

const argv = process.argv.slice(2);
const options = {
  requireAccepted: false,
  requireProvenance: false,
  fromAuthShaRegistry: false,
  dir: DEFAULT_DIR,
  json: false,
};

for (let i = 0; i < argv.length; i += 1) {
  const token = argv[i];
  if (token === '--require-accepted') options.requireAccepted = true;
  else if (token === '--require-provenance') options.requireProvenance = true;
  else if (token === '--from-auth-sha-registry') options.fromAuthShaRegistry = true;
  else if (token === '--json') options.json = true;
  else if (token === '--dir') {
    const value = argv[i + 1];
    if (!value) usageError('--dir requires a path');
    options.dir = value;
    i += 1;
  } else usageError(`unknown flag '${token}'`);
}

// Load the key registry from the fixed path — no runtime path override.
// When the registry has active keys (production post-provisioning), use it.
// When the registry has no active keys (pending_owner_provisioning placeholder),
// fall back to EVIDENCE_SIGNING_KEY env var so tests can still verify signatures.
const KEY_REGISTRY_PATH = join(repoRoot, '.governance', 'stage7-signing-keys.yaml');
let keyRegistry = new Map();
try {
  keyRegistry = loadKeyRegistry(KEY_REGISTRY_PATH);
} catch {
  // Registry file absent or unreadable — proceed with empty registry.
  // Signature state will be UNCHECKED or rely on env var fallback below.
}
const evidenceSigningKeyPem = process.env.EVIDENCE_SIGNING_KEY?.trim() || null;
// Registry takes precedence; env var is a fallback for test suites that
// cannot commit an active key but need signature verification.
const signingKey = keyRegistry.size > 0 ? keyRegistry : evidenceSigningKeyPem;

const githubToken = process.env.GH_TOKEN?.trim() || process.env.GITHUB_TOKEN?.trim() || null;
const ownerLogins = (process.env.EVIDENCE_OWNER_LOGINS ?? '')
  .split(',')
  .map((login) => login.trim())
  .filter((login) => login.length > 0);

if (options.requireProvenance && !githubToken) {
  usageError('--require-provenance needs GH_TOKEN or GITHUB_TOKEN to cross-check runs and owner attestations. Refusing to report provenance as verified without checking it.');
}

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

// Structural load, duplicate detection and supersession all come from the shared
// resolution layer in scripts/lib/evidence-artifact.mjs.
// In --from-auth-sha-registry mode, pass no signingKey here: signature state is
// set by the per-artifact AUTH_SHA pass immediately below.
const { records, byId } = loadEvidenceArtifactIndex({
  dir: options.dir,
  signingKey: options.fromAuthShaRegistry ? null : signingKey,
  displayRoot: repoRoot,
});

// --from-auth-sha-registry: load each artifact's key registry from its own
// authorization_manifest_sha via `git show`. This ensures the trusted verifier
// never uses the working-tree registry (which is at INF_SHA, not AUTH_SHA).
if (options.fromAuthShaRegistry) {
  for (const record of records) {
    if (record.violations.length > 0) continue;
    let parsed;
    try {
      parsed = JSON.parse(readFileSync(record.absolutePath, 'utf8'));
    } catch {
      record.violations.push(`${record.path}: could not re-read artifact for AUTH_SHA registry lookup`);
      record.level = ACCEPTANCE.REJECTED;
      continue;
    }
    const authSha = parsed.authorization_manifest_sha;
    if (!authSha || !/^[0-9a-f]{40}$/.test(authSha)) {
      record.violations.push(
        `${record.path}: authorization_manifest_sha '${authSha}' is not a valid 40-char lowercase SHA — `
        + `cannot load key registry for signature verification`,
      );
      record.level = ACCEPTANCE.REJECTED;
      continue;
    }
    const registry = loadKeyRegistryAtSha(authSha);
    const sigState = verifySignature(parsed, registry.size > 0 ? registry : null);
    record.signatureState = sigState;
    record.level = classifyAcceptance({
      violations: record.violations,
      signatureState: sigState,
      provenanceState: record.provenanceState,
    });
  }
}

// Provenance is the one check this gate can perform that the closure library
// cannot: it needs the network and a token. Layered on top of the shared result
// rather than duplicating the structural pass.
if (options.requireProvenance) {
  for (const record of records) {
    if (record.violations.length > 0) continue;
    // Serial by design: artifacts are few, and GitHub secondary rate limits
    // punish a burst of concurrent API calls far more than they cost here.
    // Re-read from the path the record was actually loaded from. Reconstructing it
    // from the canonical directory would read the wrong file whenever --dir points
    // somewhere else, which is exactly how the hostile suite drives this gate.
    const parsed = JSON.parse(readFileSync(record.absolutePath, 'utf8'));
    const provenanceViolations = await verifyProvenance(parsed);
    if (provenanceViolations.length > 0) {
      record.provenanceState = PROVENANCE_STATE.FAILED;
      record.violations.push(...provenanceViolations.map((violation) => `${record.path}: ${violation}`));
    } else {
      record.provenanceState = PROVENANCE_STATE.VERIFIED;
    }
    record.level = classifyAcceptance({
      violations: record.violations,
      signatureState: record.signatureState,
      provenanceState: record.provenanceState,
    });
  }
}

// A supersession chain that is missing a link, cycles, self-references or crosses
// invariants is unauditable, and an unauditable chain is not evidence.
for (const record of records) {
  if (record.violations.length > 0) continue;
  const chainViolations = evaluateSupersessionChain(record, byId);
  if (chainViolations.length > 0) {
    record.violations.push(...chainViolations.map((violation) => `${record.path}: ${violation}`));
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
