#!/usr/bin/env node
/**
 * Factory Stage 7 — CI Evidence Capture Helper
 *
 * The only supported producer of a Stage 7 evidence artifact.
 *
 * Design and threat model: docs/opsiq/evidence/stage-7/EVIDENCE_ARTIFACT_SPEC.md
 * Frozen standard (PR-1A): docs/opsiq/evidence/stage-7/README.md
 *
 * ─── Why this script refuses to run interactively ────────────────────────────
 * The frozen evidence standard states that "an artifact produced by an interactive
 * agent session is not valid evidence", because a prior session asserted a
 * STAGE_8_PRIVATE_OWNER_PRODUCTION_CLOSED status that existed in no commit, no
 * ledger entry and no bundle manifest. This script therefore exits non-zero unless
 * GITHUB_ACTIONS=true and a full GitHub Actions run context is present.
 *
 * Refusing to run is a guard rail, not the security boundary — a determined author
 * can write JSON by hand. The boundary is that a hand-written artifact cannot reach
 * acceptance level ACCEPTED: it carries no valid HMAC signature (the key exists only
 * as a CI secret) and it names no GitHub Actions run that the validator's API
 * cross-check will confirm.
 *
 * ─── Provenance is read from the environment, never from arguments ───────────
 * Run id, run number, attempt, workflow, workflow ref, job, actor, event and subject
 * SHA come from GITHUB_* variables and nowhere else. There is deliberately no
 * --run-id, --sha or --workflow flag: a caller must not be able to state its own
 * provenance.
 *
 * ─── What this script does NOT do ────────────────────────────────────────────
 * It writes one artifact file. It does not touch any bundle manifest, does not set
 * any invariant to PROVEN, does not create a waiver and does not modify the ledger.
 * Recording an artifact against an invariant is a separate, owner-authorised act.
 *
 * Usage (inside a GitHub Actions job):
 *   node scripts/capture-evidence.mjs \
 *     --invariant S7-I11 \
 *     --lane LANE_E \
 *     --proof-type simulation_adversarial \
 *     --environment isolated_simulation \
 *     --method test_run \
 *     --assertion "Nine adversarial failure scenarios each fail safely." \
 *     --result PASS \
 *     --replay-command "npx vitest run src/__tests__/... --reporter=basic" \
 *     --observation-file "$RUNNER_TEMP/observation.txt"
 *
 * Exit codes:
 *   0 — artifact written
 *   2 — refused: not a GitHub Actions run, or the run context is incomplete
 *   3 — refused: the observation matched a secret pattern, or arguments are invalid
 *   4 — refused: the assembled artifact failed validation (a bug — report it)
 *   5 — refused: an artifact with this id already exists (artifacts are append-only)
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CI_LANES,
  OWNER_LANES,
  LANES,
  INVARIANT_IDS,
  METHODS,
  RESULTS,
  ENVIRONMENTS,
  CLASSIFICATIONS,
  DEFAULT_SIGNING_KEY_ID,
  buildEvidenceArtifact,
  scanForSecrets,
  validateEvidenceArtifact,
} from './lib/evidence-artifact.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const DEFAULT_OUT_DIR = join(repoRoot, 'docs', 'opsiq', 'evidence', 'stage-7', 'artifacts');

const FLAGS = [
  'invariant', 'lane', 'proof-type', 'environment', 'method', 'assertion', 'result',
  'replay-command', 'deployment-id', 'classification', 'observation-file', 'supersedes',
  'owner-attestation-ref', 'out-dir',
];

function refuse(code, message) {
  console.error(`REFUSED: ${message}`);
  process.exit(code);
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) refuse(3, `unexpected argument '${token}' — every input is a --flag with a value`);
    const name = token.slice(2);
    if (!FLAGS.includes(name)) {
      refuse(3, `unknown flag '--${name}'. Provenance is read from the GitHub Actions environment and cannot be supplied as an argument. Known flags: ${FLAGS.map((f) => `--${f}`).join(', ')}`);
    }
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) refuse(3, `flag '--${name}' requires a value`);
    args[name] = value;
    i += 1;
  }
  return args;
}

function requireEnv(name) {
  const value = process.env[name];
  if (typeof value !== 'string' || value.trim().length === 0) {
    refuse(2, `${name} is not set. This helper only runs inside a GitHub Actions job — an interactive session cannot produce Stage 7 evidence.`);
  }
  return value.trim();
}

function requireOneOf(args, flag, allowed) {
  const value = args[flag];
  if (!allowed.includes(value)) {
    refuse(3, `--${flag} '${value ?? '<absent>'}' is not one of: ${allowed.join(', ')}`);
  }
  return value;
}

function requireText(args, flag) {
  const value = args[flag];
  if (typeof value !== 'string' || value.trim().length === 0) refuse(3, `--${flag} is required`);
  return value.trim();
}

/** ISO-8601 with millisecond precision and an explicit Z, matching the schema. */
function nowUtc() {
  return `${new Date().toISOString().slice(0, 23)}Z`;
}

/** GitHub gives run_started_at only via the API; derive the workflow start from env. */
function runStartedAt() {
  // GITHUB_RUN_STARTED_AT is not a standard variable; the capture workflow sets it
  // from the run context so the artifact can be cross-checked against the API.
  const declared = process.env.GITHUB_RUN_STARTED_AT;
  if (typeof declared === 'string' && declared.trim().length > 0) {
    const parsed = Date.parse(declared.trim());
    if (!Number.isNaN(parsed)) return `${new Date(parsed).toISOString().slice(0, 19)}Z`;
  }
  refuse(2, 'GITHUB_RUN_STARTED_AT is not set. The capture workflow must export it from github.event.workflow_run or the run context so the artifact can be cross-checked against the GitHub Actions API.');
  return null;
}

// ─── Refuse outside CI ────────────────────────────────────────────────────────

if (process.env.GITHUB_ACTIONS !== 'true') {
  refuse(
    2,
    'GITHUB_ACTIONS is not "true". Stage 7 evidence may only be produced by a CI run '
      + '(docs/opsiq/evidence/stage-7/README.md: "An artifact produced by an interactive agent session is not valid evidence"). '
      + 'Nothing was written.',
  );
}

const args = parseArgs(process.argv.slice(2));

const repository = requireEnv('GITHUB_REPOSITORY');
const runId = requireEnv('GITHUB_RUN_ID');
const runNumber = Number(requireEnv('GITHUB_RUN_NUMBER'));
const runAttempt = Number(requireEnv('GITHUB_RUN_ATTEMPT'));
const workflow = requireEnv('GITHUB_WORKFLOW');
const workflowRef = process.env.GITHUB_WORKFLOW_REF?.trim() || null;
const job = requireEnv('GITHUB_JOB');
const actor = requireEnv('GITHUB_ACTOR');
const eventName = requireEnv('GITHUB_EVENT_NAME');
const subjectSha = requireEnv('GITHUB_SHA');
const startedAt = runStartedAt();

if (!Number.isInteger(runNumber) || !Number.isInteger(runAttempt)) {
  refuse(2, 'GITHUB_RUN_NUMBER and GITHUB_RUN_ATTEMPT must both be integers');
}

// ─── Inputs ───────────────────────────────────────────────────────────────────

const invariantId = requireOneOf(args, 'invariant', INVARIANT_IDS);
const lane = requireOneOf(args, 'lane', LANES);
const method = requireOneOf(args, 'method', METHODS);
const result = requireOneOf(args, 'result', RESULTS);
const environment = requireOneOf(args, 'environment', ENVIRONMENTS);
const classification = args.classification
  ? requireOneOf(args, 'classification', CLASSIFICATIONS)
  : 'INTERNAL_ONLY';
const proofType = requireText(args, 'proof-type');
const assertion = requireText(args, 'assertion');

const isOwnerLane = OWNER_LANES.includes(lane);
if (CI_LANES.includes(lane) && !args['replay-command']) {
  refuse(3, `--replay-command is required for lane ${lane}: every LANE_C, LANE_D and LANE_E artifact must name a command that reproduces it`);
}
if (isOwnerLane && !args['owner-attestation-ref']) {
  refuse(3, `--owner-attestation-ref is required for lane ${lane}: the URL of a GitHub comment written by the owner that names this artifact and its subject SHA`);
}
if (isOwnerLane && args['replay-command']) {
  refuse(3, `--replay-command is not valid for lane ${lane}: owner judgment is inherently non-replayable`);
}

const observationPath = requireText(args, 'observation-file');
const resolvedObservation = resolve(observationPath);
if (!existsSync(resolvedObservation)) {
  refuse(3, `--observation-file '${observationPath}' does not exist. Write the verbatim output to a file first; it is never paraphrased and never passed inline.`);
}
const rawObservation = readFileSync(resolvedObservation, 'utf8');
if (rawObservation.trim().length === 0) {
  refuse(3, `--observation-file '${observationPath}' is empty — an artifact with no observation records nothing`);
}

// ─── Redaction: refuse before writing, never after ────────────────────────────

const leaked = scanForSecrets(rawObservation);
if (leaked.length > 0) {
  refuse(3, `the observation matches secret pattern(s): ${leaked.join(', ')}. Configuration evidence records presence booleans only, never values. Nothing was written.`);
}

// ─── Assemble ─────────────────────────────────────────────────────────────────

const signingKey = process.env.EVIDENCE_SIGNING_KEY?.trim() || null;
const signingKeyId = process.env.EVIDENCE_SIGNING_KEY_ID?.trim() || DEFAULT_SIGNING_KEY_ID;
if (!signingKey) {
  console.warn(
    'WARN: EVIDENCE_SIGNING_KEY is not available to this job. The artifact will be written '
      + 'unsigned and can never exceed acceptance level UNVERIFIED, which may not back a PROVEN '
      + 'invariant. Provision the secret (spec gap G-2) and re-capture.',
  );
}

const artifact = buildEvidenceArtifact(
  {
    invariant_id: invariantId,
    lane,
    proof_type: proofType,
    artifact_classification: classification,
    environment,
    method,
    captured_at_utc: nowUtc(),
    subject_sha: subjectSha,
    deployment_id: args['deployment-id'] ?? null,
    repository,
    workflow,
    workflow_ref: workflowRef,
    job,
    run_id: runId,
    run_number: runNumber,
    run_attempt: runAttempt,
    run_started_at: startedAt,
    actor,
    event_name: eventName,
    // Owner lanes: the owner dispatches the run, so the dispatching actor is the
    // claimed owner identity. It is taken from the environment, never from a flag,
    // and the validator still requires the named comment to have been written by
    // that account.
    owner_identity: isOwnerLane ? actor : null,
    owner_attestation_ref: isOwnerLane ? args['owner-attestation-ref'] : null,
    replay_command: isOwnerLane ? null : args['replay-command'],
    raw_observation: rawObservation,
    assertion,
    result,
    supersedes: args.supersedes ?? null,
  },
  { signingKey, signingKeyId },
);

const { violations } = validateEvidenceArtifact(artifact, { signingKey, fileName: `${artifact.artifact_id}.json` });
if (violations.length > 0) {
  console.error('REFUSED: the assembled artifact does not satisfy the evidence schema. Nothing was written.');
  for (const violation of violations) console.error(`  - ${violation}`);
  process.exit(4);
}

// ─── Write, append-only ───────────────────────────────────────────────────────

const outDir = args['out-dir'] ? resolve(args['out-dir']) : DEFAULT_OUT_DIR;
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, `${artifact.artifact_id}.json`);

if (existsSync(outPath)) {
  refuse(5, `${outPath} already exists. Artifacts are append-only: an identical observation is already recorded, and a correction must be a new artifact with 'supersedes' set. Nothing was written.`);
}

writeFileSync(outPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');

console.log(`Wrote ${outPath}`);
console.log(`  artifact_id  ${artifact.artifact_id}`);
console.log(`  invariant    ${artifact.invariant_id} (${artifact.lane})`);
console.log(`  subject_sha  ${artifact.subject_sha}`);
console.log(`  run          ${repository} run ${runId} attempt ${runAttempt}`);
console.log(`  signed       ${artifact.signature ? `yes (${artifact.signature.key_id})` : 'no — UNVERIFIED, cannot back a PROVEN invariant'}`);
console.log('');
console.log('This artifact records one observation. It sets no invariant to PROVEN, creates no');
console.log('waiver, and is not Stage 7 progress until an owner-authorised change records it.');

if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `artifact_id=${artifact.artifact_id}\nartifact_path=${outPath}\n`, 'utf8');
}
