/**
 * Factory Stage 7 — Evidence Artifact Library
 *
 * Pure, I/O-free authority for the canonical Stage 7 evidence artifact. Shared by
 * the CI capture helper (scripts/capture-evidence.mjs), the validator
 * (scripts/validate-evidence-artifacts.mjs) and the hostile-audit suites under
 * src/__tests__/completion-factory/, so the rule that governs capture is bit-for-bit
 * the rule that governs acceptance.
 *
 * Design and threat model: docs/opsiq/evidence/stage-7/EVIDENCE_ARTIFACT_SPEC.md
 * Documented schema:       docs/opsiq/evidence/stage-7/schema/evidence-artifact.v1.schema.json
 * Frozen standard (PR-1A): docs/opsiq/evidence/stage-7/README.md
 *
 * ─── Signature model (Ed25519, PR-A) ─────────────────────────────────────────
 * Signatures use Ed25519 asymmetric cryptography.
 *   - The signing payload includes `signature: { algorithm, key_id, value: null }`,
 *     binding the algorithm and key_id to the signature. Swapping either invalidates it.
 *   - `artifact_id` and `signature.value` are excluded from the payload:
 *       artifact_id — excluded so computeArtifactId and computeSignatureValue do
 *                     not circularly depend.
 *       signature.value — excluded so it can hold the signature of its own envelope.
 *   - `authorization_manifest_sha` IS inside the signed payload, binding the
 *     D-13 authorization to the artifact.
 *   - Key registry: artifact.signature.key_id is looked up in the versioned key
 *     registry (.governance/stage7-signing-keys.yaml). An unknown key_id is INVALID,
 *     not UNCHECKED. An unknown key is not the same as no key.
 *
 * ─── OPTION A authorization gate ─────────────────────────────────────────────
 * `resolveCaptureAuthorization` is a pure, injectable function. Production callers
 * pass real git I/O. Test callers pass fixture functions. No runtime env var bypass
 * exists in this library. The gate verifies that GITHUB_SHA equals the
 * closure_subject_sha declared in origin/main's factory-stage-7-closure.yaml.
 *
 * ─── What makes forgery fail ─────────────────────────────────────────────────
 * The adversary modelled here is an agent with full write access to the working
 * tree that cannot read a GitHub Actions secret and cannot post as the owner.
 *
 *   1. producer.type has exactly two legal values, github_actions and owner.
 *      There is no value an interactive session may truthfully use.
 *   2. artifact_id is derived from the content, so it cannot be chosen, and a
 *      copied artifact keeps the id — and therefore the invariant and observation
 *      — it was captured for.
 *   3. The Ed25519 signature covers the entire envelope including algorithm and
 *      key_id, binding run id, subject SHA, authorization SHA, capture time,
 *      content hash, assertion and signing identity to one another. Editing any
 *      one of them invalidates the artifact, and re-signing needs the CI-only key.
 *   4. Provenance cross-check (validator, online) proves the named run actually
 *      ran on that commit, or that the owner actually wrote that attestation.
 *
 * Fail-closed: an artifact that cannot be fully verified is UNVERIFIED, and
 * UNVERIFIED evidence may never back a PROVEN invariant.
 *
 * This library generates no evidence, changes no invariant status and creates no
 * waiver. Producing an artifact is a separate, owner-authorised act.
 */

import { createHash, sign as cryptoSign, verify as cryptoVerify, createPrivateKey, createPublicKey } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join as pathJoin, relative as pathRelative } from 'node:path';
import { resolveD4GovernanceTarget } from './d4-governance-resolver.mjs';

/** Schema version of the artifact form defined here. */
export const EVIDENCE_VERSION = '1.0.0';

/** Lanes whose artifacts must originate in CI. */
export const CI_LANES = Object.freeze(['LANE_C', 'LANE_D', 'LANE_E']);

/** Lanes whose artifacts must originate with the owner. */
export const OWNER_LANES = Object.freeze(['LANE_F', 'OWNER_ACCEPTANCE']);

export const LANES = Object.freeze([...CI_LANES, ...OWNER_LANES]);

/**
 * Canonical Stage 7 invariant ids, owned here rather than read from the manifest.
 * Same reasoning as STAGE_CLOSURE_ENFORCEMENT_REGISTRY in invariant-closure.mjs:
 * a contract that supplies the list of things it is checked against can shrink it.
 */
export const INVARIANT_IDS = Object.freeze([
  'S7-I1', 'S7-I2', 'S7-I3', 'S7-I4', 'S7-I5', 'S7-I6', 'S7-I7', 'S7-I8',
  'S7-I9', 'S7-I10', 'S7-I11', 'S7-I12', 'S7-I13', 'S7-I14', 'S7-I15', 'S7-I16',
]);

export const PRODUCER_TYPES = Object.freeze(['github_actions', 'owner']);
export const ENVIRONMENTS = Object.freeze(['production', 'isolated_simulation', 'ci']);
export const CLASSIFICATIONS = Object.freeze(['INTERNAL_ONLY', 'OWNER_VISIBLE', 'CLIENT_VISIBLE']);
export const RESULTS = Object.freeze(['PASS', 'FAIL', 'BLOCKED', 'NOT_TESTED']);
export const METHODS = Object.freeze([
  'http_probe', 'db_query', 'test_run', 'migration_check', 'preflight', 'owner_attestation',
]);

/** Acceptance levels. Only ACCEPTED may back a PROVEN invariant. */
export const ACCEPTANCE = Object.freeze({
  REJECTED: 'REJECTED',
  UNVERIFIED: 'UNVERIFIED',
  ACCEPTED: 'ACCEPTED',
});

/** Signature verification outcomes. */
export const SIGNATURE_STATE = Object.freeze({
  VERIFIED: 'VERIFIED',
  INVALID: 'INVALID',
  ABSENT: 'ABSENT',
  UNCHECKED: 'UNCHECKED',
});

/** Provenance verification outcomes. */
export const PROVENANCE_STATE = Object.freeze({
  VERIFIED: 'VERIFIED',
  FAILED: 'FAILED',
  UNCHECKED: 'UNCHECKED',
});

/** Default signing key id recorded in artifacts. */
export const DEFAULT_SIGNING_KEY_ID = 'stage7-evidence-v1';

export const SIGNATURE_ALGORITHM = 'Ed25519';

/**
 * Cap on a stored observation. Large enough for a full vitest run or a migration
 * status dump; small enough that git stays usable as the retention layer.
 */
export const MAX_OBSERVATION_BYTES = 256 * 1024;

export const REDACTION_STATEMENT =
  'No secret, token, credential value or connection string appears in this artifact.';

const TOP_LEVEL_KEYS = Object.freeze([
  'evidence_version', 'artifact_id', 'invariant_id', 'lane', 'proof_type',
  'artifact_classification', 'environment', 'method', 'captured_at_utc',
  'subject_sha', 'authorization_manifest_sha', 'deployment_id', 'producer', 'replay',
  'observation', 'assertion', 'result', 'redaction_attestation', 'supersedes', 'signature',
]);

const PRODUCER_KEYS = Object.freeze([
  'type', 'repository', 'workflow', 'workflow_ref', 'job', 'run_id', 'run_number',
  'run_attempt', 'run_started_at', 'actor', 'event_name', 'owner_identity',
  'owner_attestation_ref',
]);

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;
const SHA40 = /^[0-9a-f]{40}$/;
const ARTIFACT_ID = /^evd_[0-9a-f]{32}$/;
const CONTENT_HASH = /^sha256:[0-9a-f]{64}$/;
const HEX128 = /^[0-9a-f]{128}$/;
const REPO_SLUG = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;
const DECIMAL = /^[0-9]+$/;

// ─── Redaction scan ───────────────────────────────────────────────────────────

/**
 * Values that look like an assignment but carry no secret. Without this, an
 * artifact that honestly records `password: <redacted>` would be rejected for
 * containing a secret, which would push capture towards paraphrasing output —
 * exactly what the standard forbids.
 */
const PLACEHOLDER_VALUE =
  /^(?:\*+|x+|\.+|redacted|hidden|masked|omitted|placeholder|null|undefined|true|false|<[^>]*>|\[[^\]]*\]|\$\{[^}]*\}|\{\{[^}]*\}\})$/i;

function assignmentCarriesValue(text) {
  const pattern =
    /\b(?:password|passwd|secret|api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|private[_-]?key)\b\s*[:=]\s*["']?([^\s"',;)]{8,})/gi;
  for (const match of text.matchAll(pattern)) {
    if (!PLACEHOLDER_VALUE.test(match[1])) return true;
  }
  return false;
}

/**
 * Secret shapes refused in an observation. Presence-only evidence is the rule:
 * configuration artifacts record booleans, never values.
 */
export const REDACTION_PATTERNS = Object.freeze([
  { id: 'aws_access_key_id', test: (t) => /\bAKIA[0-9A-Z]{16}\b/.test(t) },
  { id: 'github_token', test: (t) => /\bgh[pousr]_[A-Za-z0-9]{36}\b/.test(t) },
  { id: 'github_fine_grained_pat', test: (t) => /\bgithub_pat_[A-Za-z0-9_]{22,}\b/.test(t) },
  { id: 'private_key_block', test: (t) => /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/.test(t) },
  { id: 'database_url_with_credentials', test: (t) => /\b(?:postgres|postgresql|mysql|mongodb(?:\+srv)?|redis|amqp):\/\/[^\s:@/]+:[^\s@/]+@/.test(t) },
  { id: 'stripe_live_secret', test: (t) => /\b[rs]k_live_[A-Za-z0-9]{16,}\b/.test(t) },
  { id: 'json_web_token', test: (t) => /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/.test(t) },
  { id: 'bearer_token', test: (t) => /\bBearer\s+[A-Za-z0-9._~+/-]{20,}={0,2}/.test(t) },
  { id: 'slack_token', test: (t) => /\bxox[abposr]-[A-Za-z0-9-]{10,}\b/.test(t) },
  { id: 'model_provider_key', test: (t) => /\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{24,}\b/.test(t) },
  { id: 'vercel_token', test: (t) => /\bvercel_[A-Za-z0-9]{24,}\b/.test(t) },
  { id: 'resend_api_key', test: (t) => /\bre_[A-Za-z0-9]{24,}\b/.test(t) },
  { id: 'google_api_key', test: (t) => /\bAIza[0-9A-Za-z_-]{35}\b/.test(t) },
  { id: 'secret_assignment_with_value', test: assignmentCarriesValue },
]);

export const REDACTION_SCANNER_ID = `evidence-redaction-scan@${REDACTION_PATTERNS.length}`;

/**
 * @param {string} text
 * @returns {string[]} ids of patterns that matched — never the matched text, so a
 *   secret cannot leak into a validator log while being reported.
 */
export function scanForSecrets(text) {
  if (typeof text !== 'string' || text.length === 0) return [];
  return REDACTION_PATTERNS.filter((pattern) => pattern.test(text)).map((pattern) => pattern.id);
}

// ─── Canonical form, hashing, identity ────────────────────────────────────────

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Deterministic JSON with sorted keys.
 *
 * Same convention as canonicalStringify in src/services/integrity/hash.ts. It is
 * restated here rather than imported because this library is plain ESM that CI
 * runs with no TypeScript build step; a test asserts the two agree so the
 * duplication cannot drift silently.
 */
export function canonicalStringify(value) {
  if (value === undefined) return undefined;
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => canonicalStringify(item) ?? 'null').join(',')}]`;
  const pairs = Object.keys(value)
    .sort()
    .map((key) => [key, canonicalStringify(value[key])])
    .filter(([, serialized]) => serialized !== undefined)
    .map(([key, serialized]) => `${JSON.stringify(key)}:${serialized}`);
  return `{${pairs.join(',')}}`;
}

export function sha256Hex(input) {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

/** sha256 over the UTF-8 bytes of the observation exactly as stored. */
export function computeContentHash(raw) {
  return `sha256:${sha256Hex(raw)}`;
}

function envelopeWithout(artifact, keys) {
  const copy = {};
  for (const key of Object.keys(artifact)) {
    if (!keys.includes(key)) copy[key] = artifact[key];
  }
  return copy;
}

/**
 * Derive the artifact id from its content. `artifact_id` and `signature` are
 * excluded, so the id is stable across signing and cannot be chosen by the author.
 * `authorization_manifest_sha` IS included — it is part of the artifact's content.
 */
export function computeArtifactId(artifact) {
  return `evd_${sha256Hex(canonicalStringify(envelopeWithout(artifact, ['artifact_id', 'signature']))).slice(0, 32)}`;
}

/**
 * The canonical byte string an artifact's signature is computed over.
 *
 * Returns `canonicalStringify(artifact)` as-is. The caller is responsible for
 * having set `signature.value = null` before calling this function, so that:
 *   - `algorithm` and `key_id` are INSIDE the signed payload (bound by the signature)
 *   - `signature.value` is excluded (holds the signature of its own envelope)
 *
 * This is the single authority on what is signed. `computeSignatureValue` and
 * `verifySignature` both call this function and enforce the null-value invariant
 * internally.
 */
export function signingPayload(artifact) {
  return canonicalStringify(artifact);
}

/**
 * Compute the Ed25519 signature value over the artifact's signing payload.
 * Sets `signature.value = null` internally before hashing so the result is stable.
 *
 * @param {object} artifact  must have `signature: { algorithm, key_id, value }` set
 * @param {string} privateKeyPem  Ed25519 private key in PKCS8 PEM format
 * @returns {string} 128-character lowercase hex string
 */
export function computeSignatureValue(artifact, privateKeyPem) {
  const sig = artifact.signature;
  const forSigning = {
    ...artifact,
    signature: sig ? { algorithm: sig.algorithm, key_id: sig.key_id, value: null } : sig,
  };
  const payload = Buffer.from(signingPayload(forSigning), 'utf8');
  return cryptoSign(null, payload, privateKeyPem).toString('hex');
}

/**
 * Verify an Ed25519 signature on an artifact.
 *
 * `signingKey` may be:
 *   - `null` / falsy           → UNCHECKED (key unavailable to this caller)
 *   - `Map<keyId, publicKeyPem>` → registry lookup; unknown key_id → INVALID (fail closed)
 *   - Ed25519 private key PEM  → public key is derived and used for verification
 *   - Ed25519 public key PEM   → used directly for verification
 *
 * @returns {'VERIFIED'|'INVALID'|'ABSENT'|'UNCHECKED'}
 */
export function verifySignature(artifact, signingKey) {
  if (!isPlainObject(artifact) || artifact.signature === null || artifact.signature === undefined) {
    return SIGNATURE_STATE.ABSENT;
  }
  if (!signingKey) return SIGNATURE_STATE.UNCHECKED;

  const signature = artifact.signature;

  if (!isPlainObject(signature)) return SIGNATURE_STATE.INVALID;
  if (signature.algorithm !== SIGNATURE_ALGORITHM) return SIGNATURE_STATE.INVALID;
  if (typeof signature.value !== 'string' || !HEX128.test(signature.value)) {
    return SIGNATURE_STATE.INVALID;
  }

  let publicKey;
  try {
    if (signingKey instanceof Map) {
      const keyId = signature.key_id;
      if (!keyId || !signingKey.has(keyId)) {
        // Unknown key_id in registry = INVALID. An unknown key is not the same as no key.
        return SIGNATURE_STATE.INVALID;
      }
      publicKey = createPublicKey(signingKey.get(keyId));
    } else if (typeof signingKey === 'string') {
      try {
        publicKey = createPublicKey(createPrivateKey(signingKey));
      } catch {
        publicKey = createPublicKey(signingKey);
      }
    } else {
      return SIGNATURE_STATE.UNCHECKED;
    }
  } catch {
    return SIGNATURE_STATE.INVALID;
  }

  const payloadArtifact = {
    ...artifact,
    signature: { algorithm: signature.algorithm, key_id: signature.key_id, value: null },
  };
  const payload = Buffer.from(signingPayload(payloadArtifact), 'utf8');
  const sigBytes = Buffer.from(signature.value, 'hex');

  try {
    return cryptoVerify(null, payload, publicKey, sigBytes)
      ? SIGNATURE_STATE.VERIFIED
      : SIGNATURE_STATE.INVALID;
  } catch {
    return SIGNATURE_STATE.INVALID;
  }
}

// ─── Builder ──────────────────────────────────────────────────────────────────

/**
 * Assemble a canonical artifact.
 *
 * Provenance fields are supplied by the caller, but the only supported caller —
 * scripts/capture-evidence.mjs — reads them exclusively from GITHUB_* environment
 * variables and exposes no flag that could override them.
 *
 * @param {object} input
 * @param {object} [opts]
 * @param {string|null} [opts.signingKey]       private key PEM; omitted → signature: null → UNVERIFIED
 * @param {string} [opts.signingKeyId]
 * @returns {object} the artifact, with artifact_id and signature filled in
 */
export function buildEvidenceArtifact(input, { signingKey = null, signingKeyId = DEFAULT_SIGNING_KEY_ID, closureManifestYaml = null } = {}) {
  const raw = String(input.raw_observation ?? '');
  const capped = Buffer.byteLength(raw, 'utf8') > MAX_OBSERVATION_BYTES;
  const stored = capped ? Buffer.from(raw, 'utf8').subarray(0, MAX_OBSERVATION_BYTES).toString('utf8') : raw;
  const isOwnerLane = OWNER_LANES.includes(input.lane);

  const producer = isOwnerLane
    ? {
        type: 'owner',
        repository: input.repository ?? null,
        workflow: null,
        workflow_ref: null,
        job: null,
        run_id: null,
        run_number: null,
        run_attempt: null,
        run_started_at: null,
        actor: null,
        event_name: null,
        owner_identity: input.owner_identity ?? null,
        owner_attestation_ref: input.owner_attestation_ref ?? null,
      }
    : {
        type: 'github_actions',
        repository: input.repository ?? null,
        workflow: input.workflow ?? null,
        workflow_ref: input.workflow_ref ?? null,
        job: input.job ?? null,
        run_id: input.run_id ?? null,
        run_number: input.run_number ?? null,
        run_attempt: input.run_attempt ?? null,
        run_started_at: input.run_started_at ?? null,
        actor: input.actor ?? null,
        event_name: input.event_name ?? null,
        owner_identity: null,
        owner_attestation_ref: null,
      };

  const artifact = {
    evidence_version: EVIDENCE_VERSION,
    artifact_id: null,
    invariant_id: input.invariant_id,
    lane: input.lane,
    proof_type: input.proof_type,
    artifact_classification: input.artifact_classification ?? 'INTERNAL_ONLY',
    environment: input.environment,
    method: input.method,
    captured_at_utc: input.captured_at_utc,
    subject_sha: input.subject_sha,
    authorization_manifest_sha: input.authorization_manifest_sha ?? null,
    deployment_id: input.deployment_id ?? null,
    producer,
    replay: isOwnerLane
      ? { replayable: false, command: null }
      : { replayable: true, command: input.replay_command ?? null },
    observation: {
      raw: stored,
      content_hash: computeContentHash(stored),
      byte_length: Buffer.byteLength(stored, 'utf8'),
      truncated: capped,
    },
    assertion: input.assertion,
    result: input.result,
    redaction_attestation: {
      attested: true,
      statement: REDACTION_STATEMENT,
      scanner: REDACTION_SCANNER_ID,
      patterns_checked: REDACTION_PATTERNS.length,
    },
    supersedes: input.supersedes ?? null,
    signature: null,
  };

  artifact.artifact_id = computeArtifactId(artifact);

  // D-4/A4 fail-closed guard — S7-I11 only. Runs BEFORE signing so a rejected
  // artifact is never signed, and BEFORE return so no artifact object escapes.
  // The target is extracted exclusively from the governance manifest; the caller
  // cannot supply a target value directly (there is no such parameter).
  if (artifact.invariant_id === 'S7-I11') {
    const d4 = resolveD4GovernanceTarget({ manifestYaml: closureManifestYaml });
    if (!d4.ok) {
      throw new Error(
        `S7-I11 evidence build blocked by D-4 enforcement (${d4.reason}): ${d4.detail}`,
      );
    }
    if (artifact.environment !== d4.target) {
      throw new Error(
        `S7-I11 evidence build blocked: artifact environment '${artifact.environment}' does not ` +
        `match D-4 authorized target '${d4.target}' from factory-stage-7-closure.yaml. ` +
        `The authorized target is read from the governance manifest and cannot be overridden ` +
        `by the caller.`,
      );
    }
  }

  if (signingKey) {
    artifact.signature = { algorithm: SIGNATURE_ALGORITHM, key_id: signingKeyId, value: null };
    artifact.signature.value = computeSignatureValue(artifact, signingKey);
  }

  return artifact;
}

// ─── Structural validation ────────────────────────────────────────────────────

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function describe(value) {
  if (value === null) return 'null';
  if (value === undefined) return 'absent';
  if (Array.isArray(value)) return 'list';
  return typeof value;
}

/**
 * Full structural, lane and integrity validation of one artifact.
 *
 * Mirrors evidence-artifact.v1.schema.json. The schema documents the contract;
 * this function is what CI enforces, so where a reader needs certainty, this is
 * the authority.
 *
 * @param {unknown} artifact
 * @param {object} [options]
 * @param {string|Map<string,string>|null} [options.signingKey]  enables signature verification
 * @param {string|null} [options.fileName]    basename, checked against artifact_id
 * @returns {{ violations: string[], signatureState: string }}
 */
export function validateEvidenceArtifact(artifact, options = {}) {
  const { signingKey = null, fileName = null, closureManifestYaml = null } = options;
  const violations = [];
  const fail = (message) => violations.push(message);

  if (!isPlainObject(artifact)) {
    return {
      violations: [`artifact is ${describe(artifact)}, not a JSON object`],
      signatureState: SIGNATURE_STATE.ABSENT,
    };
  }

  const label = nonEmptyString(artifact.artifact_id) ? artifact.artifact_id : '<no artifact_id>';
  const at = (message) => `${label}: ${message}`;

  for (const key of Object.keys(artifact)) {
    if (!TOP_LEVEL_KEYS.includes(key)) {
      fail(at(`unknown top-level field '${key}' — the artifact form is closed; an artifact may not carry fields the validator does not evaluate`));
    }
  }
  for (const key of TOP_LEVEL_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(artifact, key)) {
      fail(at(`required field '${key}' is absent`));
    }
  }

  if (artifact.evidence_version !== EVIDENCE_VERSION) {
    fail(at(`evidence_version is ${describe(artifact.evidence_version)} '${artifact.evidence_version}' (required: '${EVIDENCE_VERSION}')`));
  }
  if (!INVARIANT_IDS.includes(artifact.invariant_id)) {
    fail(at(`invariant_id '${artifact.invariant_id}' is not a canonical Stage 7 invariant (${INVARIANT_IDS.join(', ')})`));
  }
  // S7-I11 fail-closed guard: D-4 / A4 enforcement.
  // The guard verifies that amendment A4 has been applied (owner decision D-4 made),
  // that a concrete non-generic environment target is declared in the contract, and
  // that the artifact's environment field matches that authorized target.
  // The target is extracted exclusively from closureManifestYaml — the caller cannot
  // supply a target value through any other parameter.
  // When closureManifestYaml is null (no manifest provided), the resolver returns
  // MANIFEST_UNREADABLE, which is still a fail-closed rejection — not providing the
  // manifest is not equivalent to a resolved D-4.
  if (artifact.invariant_id === 'S7-I11') {
    const d4 = resolveD4GovernanceTarget({ manifestYaml: closureManifestYaml });
    if (!d4.ok) {
      fail(at(
        `S7-I11 proof blocked by D-4 enforcement (${d4.reason}): ${d4.detail}`,
      ));
    } else if (artifact.environment !== d4.target) {
      fail(at(
        `S7-I11 environment '${artifact.environment}' does not match D-4 authorized target ` +
        `'${d4.target}' from factory-stage-7-closure.yaml. The authorized target is read from ` +
        `the governance manifest and cannot be overridden by the caller.`,
      ));
    }
  }
  if (!LANES.includes(artifact.lane)) {
    fail(at(`lane '${artifact.lane}' is not one of ${LANES.join(', ')}`));
  }
  if (!nonEmptyString(artifact.proof_type)) {
    fail(at('proof_type must be the non-empty proof_type declared for this invariant by the contract'));
  }
  if (!CLASSIFICATIONS.includes(artifact.artifact_classification)) {
    fail(at(`artifact_classification '${artifact.artifact_classification}' is not one of ${CLASSIFICATIONS.join(', ')}`));
  }
  if (!ENVIRONMENTS.includes(artifact.environment)) {
    fail(at(`environment '${artifact.environment}' is not one of ${ENVIRONMENTS.join(', ')}`));
  }
  if (!METHODS.includes(artifact.method)) {
    fail(at(`method '${artifact.method}' is not one of ${METHODS.join(', ')}`));
  }
  if (typeof artifact.captured_at_utc !== 'string' || !ISO_UTC.test(artifact.captured_at_utc)) {
    fail(at(`captured_at_utc '${artifact.captured_at_utc}' is not an ISO-8601 UTC instant with a Z suffix`));
  }
  if (typeof artifact.subject_sha !== 'string' || !SHA40.test(artifact.subject_sha)) {
    fail(at(`subject_sha '${artifact.subject_sha}' is not a full 40-character lowercase commit SHA`));
  }
  if (artifact.authorization_manifest_sha !== null) {
    if (typeof artifact.authorization_manifest_sha !== 'string' || !SHA40.test(artifact.authorization_manifest_sha)) {
      fail(at(`authorization_manifest_sha '${artifact.authorization_manifest_sha}' must be null or a 40-character lowercase commit SHA`));
    }
  }
  if (!RESULTS.includes(artifact.result)) {
    fail(at(`result '${artifact.result}' is not one of ${RESULTS.join(', ')}`));
  }
  if (!nonEmptyString(artifact.assertion)) {
    fail(at('assertion must state the specific claim this observation supports'));
  }
  if (artifact.supersedes !== null && !(typeof artifact.supersedes === 'string' && ARTIFACT_ID.test(artifact.supersedes))) {
    fail(at(`supersedes '${artifact.supersedes}' must be null or an artifact_id — artifacts are append-only, a correction is a new artifact`));
  }

  validateRedaction(artifact, fail, at);
  validateObservation(artifact, fail, at);
  const producerOk = validateProducer(artifact, fail, at);
  if (producerOk) validateLaneBinding(artifact, fail, at);

  // ─── Identity: derived, never chosen ────────────────────────────────────────
  if (typeof artifact.artifact_id !== 'string' || !ARTIFACT_ID.test(artifact.artifact_id)) {
    fail(at(`artifact_id '${artifact.artifact_id}' is malformed (required: evd_ followed by 32 lowercase hex characters)`));
  } else {
    const derived = computeArtifactId(artifact);
    if (derived !== artifact.artifact_id) {
      fail(at(`artifact_id does not match its content — declared ${artifact.artifact_id}, derived ${derived}. The id is a hash of the artifact: a mismatch means a field was edited after capture, or the artifact was copied from another observation.`));
    }
    if (fileName !== null && fileName !== `${artifact.artifact_id}.json`) {
      fail(at(`file is named '${fileName}' but must be named '${artifact.artifact_id}.json' — the filename is part of duplicate detection`));
    }
  }

  // ─── Signature ──────────────────────────────────────────────────────────────
  const signatureState = verifySignature(artifact, signingKey);
  if (artifact.signature !== null && !isPlainObject(artifact.signature)) {
    fail(at(`signature is ${describe(artifact.signature)} — it must be an object or null`));
  } else if (isPlainObject(artifact.signature)) {
    const extra = Object.keys(artifact.signature).filter((k) => !['algorithm', 'key_id', 'value'].includes(k));
    if (extra.length > 0) fail(at(`signature carries unknown field(s): ${extra.join(', ')}`));
    if (artifact.signature.algorithm !== SIGNATURE_ALGORITHM) {
      fail(at(`signature.algorithm '${artifact.signature.algorithm}' is not ${SIGNATURE_ALGORITHM}`));
    }
    if (!nonEmptyString(artifact.signature.key_id)) fail(at('signature.key_id is required'));
    if (typeof artifact.signature.value !== 'string' || !HEX128.test(artifact.signature.value)) {
      fail(at(`signature.value '${String(artifact.signature.value).slice(0, 16)}...' is not 128 lowercase hex characters (Ed25519 signature)`));
    }
  }
  if (signatureState === SIGNATURE_STATE.INVALID) {
    fail(at('signature does not verify against the evidence signing key — the artifact was altered after capture, or was signed with a different key'));
  }

  return { violations, signatureState };
}

function validateRedaction(artifact, fail, at) {
  const attestation = artifact.redaction_attestation;
  if (!isPlainObject(attestation)) {
    fail(at(`redaction_attestation is ${describe(attestation)} — every artifact must attest that it carries no secret value`));
    return;
  }
  if (attestation.attested !== true) {
    fail(at('redaction_attestation.attested must be true — an artifact that does not attest redaction is not evidence'));
  }
  if (!nonEmptyString(attestation.statement)) fail(at('redaction_attestation.statement is required'));
  if (attestation.scanner !== REDACTION_SCANNER_ID) {
    fail(at(`redaction_attestation.scanner '${attestation.scanner}' does not match the current scanner '${REDACTION_SCANNER_ID}' — re-capture against the current pattern set`));
  }
  if (attestation.patterns_checked !== REDACTION_PATTERNS.length) {
    fail(at(`redaction_attestation.patterns_checked is ${describe(attestation.patterns_checked)} ${attestation.patterns_checked} (current scanner checks ${REDACTION_PATTERNS.length})`));
  }
}

function validateObservation(artifact, fail, at) {
  const observation = artifact.observation;
  if (!isPlainObject(observation)) {
    fail(at(`observation is ${describe(observation)} — required: { raw, content_hash, byte_length, truncated }`));
    return;
  }
  const extra = Object.keys(observation).filter((k) => !['raw', 'content_hash', 'byte_length', 'truncated'].includes(k));
  if (extra.length > 0) fail(at(`observation carries unknown field(s): ${extra.join(', ')}`));

  if (!nonEmptyString(observation.raw)) {
    fail(at('observation.raw must be the verbatim output, response or attestation — never paraphrased, never empty'));
    return;
  }
  if (typeof observation.content_hash !== 'string' || !CONTENT_HASH.test(observation.content_hash)) {
    fail(at(`observation.content_hash '${observation.content_hash}' is malformed (required: sha256:<64 hex>)`));
  } else {
    const expected = computeContentHash(observation.raw);
    if (expected !== observation.content_hash) {
      fail(at(`observation.content_hash does not hash observation.raw — declared ${observation.content_hash}, actual ${expected}. The observation was edited after capture.`));
    }
  }
  const byteLength = Buffer.byteLength(observation.raw, 'utf8');
  if (observation.byte_length !== byteLength) {
    fail(at(`observation.byte_length is ${describe(observation.byte_length)} ${observation.byte_length} but observation.raw is ${byteLength} bytes`));
  }
  if (byteLength > MAX_OBSERVATION_BYTES) {
    fail(at(`observation.raw is ${byteLength} bytes, over the ${MAX_OBSERVATION_BYTES}-byte cap`));
  }
  if (typeof observation.truncated !== 'boolean') {
    fail(at(`observation.truncated is ${describe(observation.truncated)} — required: boolean`));
  }

  const leaked = scanForSecrets(observation.raw);
  if (leaked.length > 0) {
    fail(at(`observation.raw matches secret pattern(s): ${leaked.join(', ')} — configuration evidence records presence booleans only, never values. Re-capture with the value removed; do not edit this artifact in place.`));
  }
}

function validateProducer(artifact, fail, at) {
  const producer = artifact.producer;
  if (!isPlainObject(producer)) {
    fail(at(`producer is ${describe(producer)} — required: an object naming who produced this artifact`));
    return false;
  }
  const extra = Object.keys(producer).filter((k) => !PRODUCER_KEYS.includes(k));
  if (extra.length > 0) fail(at(`producer carries unknown field(s): ${extra.join(', ')}`));

  if (!PRODUCER_TYPES.includes(producer.type)) {
    fail(at(`producer.type '${producer.type}' is not one of ${PRODUCER_TYPES.join(', ')} — an interactive agent session has no valid producer identity and therefore cannot produce evidence`));
    return false;
  }
  if (typeof producer.repository !== 'string' || !REPO_SLUG.test(producer.repository)) {
    fail(at(`producer.repository '${producer.repository}' is not an owner/name repository slug`));
  }
  return true;
}

/**
 * Lane → producer binding. The producer rule from the frozen standard, as a table
 * the validator reads rather than prose a reader has to remember.
 */
function validateLaneBinding(artifact, fail, at) {
  const producer = artifact.producer;
  const lane = artifact.lane;
  const replay = artifact.replay;
  const isCiLane = CI_LANES.includes(lane);
  const isOwnerLane = OWNER_LANES.includes(lane);

  if (!isPlainObject(replay)) {
    fail(at(`replay is ${describe(replay)} — required: { replayable, command }`));
  } else {
    const extra = Object.keys(replay).filter((k) => !['replayable', 'command'].includes(k));
    if (extra.length > 0) fail(at(`replay carries unknown field(s): ${extra.join(', ')}`));
  }

  if (isCiLane) {
    if (producer.type !== 'github_actions') {
      fail(at(`lane ${lane} requires producer.type 'github_actions' but the artifact declares '${producer.type}' — LANE_C, LANE_D and LANE_E evidence must originate in a CI run`));
    }
    if (typeof producer.run_id !== 'string' || !DECIMAL.test(producer.run_id)) {
      fail(at(`lane ${lane} requires producer.run_id (the GitHub Actions run that produced the observation); got ${describe(producer.run_id)} '${producer.run_id}'`));
    }
    for (const field of ['workflow', 'job', 'actor', 'event_name']) {
      if (!nonEmptyString(producer[field])) {
        fail(at(`lane ${lane} requires producer.${field}; got ${describe(producer[field])}`));
      }
    }
    if (!Number.isInteger(producer.run_number) || producer.run_number < 1) {
      fail(at(`lane ${lane} requires an integer producer.run_number; got ${describe(producer.run_number)} ${producer.run_number}`));
    }
    if (!Number.isInteger(producer.run_attempt) || producer.run_attempt < 1) {
      fail(at(`lane ${lane} requires an integer producer.run_attempt; got ${describe(producer.run_attempt)} ${producer.run_attempt}`));
    }
    if (typeof producer.run_started_at !== 'string' || !ISO_UTC.test(producer.run_started_at)) {
      fail(at(`lane ${lane} requires producer.run_started_at as an ISO-8601 UTC instant; got ${describe(producer.run_started_at)} '${producer.run_started_at}'`));
    }
    if (producer.owner_identity !== null || producer.owner_attestation_ref !== null) {
      fail(at(`lane ${lane} is a CI lane: producer.owner_identity and producer.owner_attestation_ref must both be null`));
    }
    if (isPlainObject(replay)) {
      if (replay.replayable !== true) {
        fail(at(`lane ${lane} evidence must be replayable — replay.replayable is ${describe(replay.replayable)} ${replay.replayable}`));
      }
      if (!nonEmptyString(replay.command)) {
        fail(at(`lane ${lane} evidence must name the command that reproduces it — replay.command is ${describe(replay.command)}`));
      }
    }
    if (artifact.method === 'owner_attestation') {
      fail(at(`method 'owner_attestation' is not available on CI lane ${lane}`));
    }
  }

  if (isOwnerLane) {
    if (producer.type !== 'owner') {
      fail(at(`lane ${lane} requires producer.type 'owner' but the artifact declares '${producer.type}' — LANE_F and OWNER_ACCEPTANCE evidence is produced by the owner and by no one else`));
    }
    if (producer.run_id !== null) {
      fail(at(`lane ${lane} must not claim a CI run id — owner judgment is not produced by CI; got producer.run_id '${producer.run_id}'`));
    }
    if (!nonEmptyString(producer.owner_identity)) {
      fail(at(`lane ${lane} requires producer.owner_identity (the owner's GitHub login)`));
    }
    if (!nonEmptyString(producer.owner_attestation_ref)) {
      fail(at(`lane ${lane} requires producer.owner_attestation_ref — the URL of a GitHub comment written by the owner that names this artifact_id and subject_sha`));
    }
    if (artifact.method !== 'owner_attestation') {
      fail(at(`lane ${lane} requires method 'owner_attestation'; got '${artifact.method}'`));
    }
    if (isPlainObject(replay)) {
      if (replay.replayable !== false) {
        fail(at(`lane ${lane} evidence is inherently non-replayable and must be marked so — replay.replayable is ${describe(replay.replayable)} ${replay.replayable}`));
      }
      if (replay.command !== null) {
        fail(at(`lane ${lane} evidence must not name a replay command; got '${replay.command}'`));
      }
    }
  }

  if (lane === 'LANE_C') {
    if (!nonEmptyString(artifact.deployment_id)) {
      fail(at('LANE_C evidence must name the deployment_id it was observed against — LANE_C evidence expires when the production deployment changes'));
    }
    if (artifact.environment !== 'production') {
      fail(at(`LANE_C evidence must be observed in environment 'production'; got '${artifact.environment}'`));
    }
  }
  if (lane === 'LANE_E') {
    if (artifact.deployment_id !== null) {
      fail(at(`LANE_E evidence is observed in an isolated environment and must not name a deployment_id; got '${artifact.deployment_id}'`));
    }
    if (!['isolated_simulation', 'ci'].includes(artifact.environment)) {
      fail(at(`LANE_E evidence must be observed in 'isolated_simulation' or 'ci'; got '${artifact.environment}'`));
    }
  }
  if (lane === 'OWNER_ACCEPTANCE' && artifact.deployment_id !== null) {
    fail(at(`OWNER_ACCEPTANCE evidence must not name a deployment_id; got '${artifact.deployment_id}'`));
  }
}

// ─── Provenance ───────────────────────────────────────────────────────────────

function toEpoch(value) {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * Cross-check a CI artifact against the GitHub Actions run it claims.
 *
 * Pure: the caller performs the API request and passes the run object in, so this
 * is unit-testable without network. A fabricated run id fails at the request; a
 * real run id borrowed from another workflow fails here.
 *
 * @param {object} artifact
 * @param {object|null} run  GitHub Actions run object, or null when not found
 * @returns {string[]} violations
 */
export function evaluateRunProvenance(artifact, run) {
  const producer = artifact.producer ?? {};
  const label = `${artifact.artifact_id}: `;
  if (run === null || run === undefined) {
    return [`${label}GitHub Actions run ${producer.run_id} was not found in ${producer.repository} — the artifact names a run that does not exist`];
  }

  const violations = [];
  const mismatch = (field, declared, actual) =>
    violations.push(`${label}${field} declared '${declared}' but run ${producer.run_id} reports '${actual}'`);

  if (String(run.id) !== String(producer.run_id)) mismatch('producer.run_id', producer.run_id, run.id);
  if (run.repository?.full_name && run.repository.full_name !== producer.repository) {
    mismatch('producer.repository', producer.repository, run.repository.full_name);
  }
  if (run.head_sha !== artifact.subject_sha) {
    violations.push(`${label}subject_sha '${artifact.subject_sha}' is not the commit run ${producer.run_id} executed ('${run.head_sha}') — the observation was not made against the commit it claims`);
  }
  if (run.name !== producer.workflow) mismatch('producer.workflow', producer.workflow, run.name);
  if (Number(run.run_number) !== Number(producer.run_number)) mismatch('producer.run_number', producer.run_number, run.run_number);
  if (Number(run.run_attempt) !== Number(producer.run_attempt)) mismatch('producer.run_attempt', producer.run_attempt, run.run_attempt);
  if (run.event !== producer.event_name) mismatch('producer.event_name', producer.event_name, run.event);

  const declaredStart = toEpoch(producer.run_started_at);
  const actualStart = toEpoch(run.run_started_at ?? run.created_at);
  if (declaredStart === null || actualStart === null || declaredStart !== actualStart) {
    mismatch('producer.run_started_at', producer.run_started_at, run.run_started_at ?? run.created_at);
  }

  const captured = toEpoch(artifact.captured_at_utc);
  const windowEnd = toEpoch(run.updated_at ?? run.completed_at) ?? Number.POSITIVE_INFINITY;
  if (captured === null) {
    violations.push(`${label}captured_at_utc '${artifact.captured_at_utc}' is not a parseable instant`);
  } else if (actualStart !== null && (captured < actualStart || captured > windowEnd)) {
    violations.push(`${label}captured_at_utc '${artifact.captured_at_utc}' falls outside the window of run ${producer.run_id} (${run.run_started_at ?? run.created_at} … ${run.updated_at ?? run.completed_at}) — the observation was not taken during that run`);
  }

  return violations;
}

/**
 * Cross-check an owner artifact against the GitHub comment it names.
 *
 * An agent can write any file, but cannot post a comment as the owner's account.
 * That asymmetry is the whole basis of owner-lane provenance.
 *
 * @param {object} artifact
 * @param {object|null} comment  GitHub comment object, or null when not found
 * @param {string[]} allowedLogins  owner allowlist (case-insensitive)
 * @returns {string[]} violations
 */
export function evaluateOwnerProvenance(artifact, comment, allowedLogins) {
  const producer = artifact.producer ?? {};
  const label = `${artifact.artifact_id}: `;
  const allowed = (allowedLogins ?? []).map((login) => String(login).toLowerCase());

  if (allowed.length === 0) {
    return [`${label}no owner login allowlist is configured — owner-lane provenance cannot be verified (set EVIDENCE_OWNER_LOGINS)`];
  }
  if (comment === null || comment === undefined) {
    return [`${label}owner attestation ${producer.owner_attestation_ref} could not be retrieved — the artifact names an attestation that does not exist or is not readable`];
  }

  const violations = [];
  const author = String(comment.user?.login ?? '');
  if (!allowed.includes(author.toLowerCase())) {
    violations.push(`${label}owner attestation was written by '${author || '<unknown>'}', who is not in the owner allowlist (${allowed.join(', ')}) — LANE_F and OWNER_ACCEPTANCE evidence is produced by the owner and by no one else`);
  }
  if (nonEmptyString(producer.owner_identity) && author.toLowerCase() !== String(producer.owner_identity).toLowerCase()) {
    violations.push(`${label}producer.owner_identity declares '${producer.owner_identity}' but the attestation was written by '${author}'`);
  }
  const body = String(comment.body ?? '');
  if (!body.includes(artifact.artifact_id)) {
    violations.push(`${label}the owner attestation does not name this artifact_id — an attestation must be bound to the artifact it attests, or it can be pointed at by any number of fabricated artifacts`);
  }
  if (!body.includes(artifact.subject_sha)) {
    violations.push(`${label}the owner attestation does not name subject_sha ${artifact.subject_sha}`);
  }
  return violations;
}

// ─── Acceptance ───────────────────────────────────────────────────────────────

/**
 * Combine the three checks into one acceptance level. Fail-closed: anything short
 * of structural + signature + provenance is UNVERIFIED, and UNVERIFIED evidence
 * may never back a PROVEN invariant.
 *
 * @param {{ violations: string[], signatureState: string, provenanceState: string }} input
 * @returns {'REJECTED'|'UNVERIFIED'|'ACCEPTED'}
 */
export function classifyAcceptance({ violations, signatureState, provenanceState }) {
  if (violations.length > 0) return ACCEPTANCE.REJECTED;
  if (signatureState === SIGNATURE_STATE.INVALID) return ACCEPTANCE.REJECTED;
  if (provenanceState === PROVENANCE_STATE.FAILED) return ACCEPTANCE.REJECTED;
  if (signatureState !== SIGNATURE_STATE.VERIFIED) return ACCEPTANCE.UNVERIFIED;
  if (provenanceState !== PROVENANCE_STATE.VERIFIED) return ACCEPTANCE.UNVERIFIED;
  return ACCEPTANCE.ACCEPTED;
}

/**
 * Why an artifact did not reach ACCEPTED. Gate output must always name the
 * unmet requirement, never print a bare level.
 */
export function explainAcceptance({ signatureState, provenanceState }) {
  const reasons = [];
  if (signatureState === SIGNATURE_STATE.ABSENT) {
    reasons.push('unsigned (EVIDENCE_SIGNING_KEY was not available at capture time)');
  } else if (signatureState === SIGNATURE_STATE.UNCHECKED) {
    reasons.push('signature not checked (EVIDENCE_SIGNING_KEY not available to the validator)');
  } else if (signatureState === SIGNATURE_STATE.INVALID) {
    reasons.push('signature does not verify');
  }
  if (provenanceState === PROVENANCE_STATE.UNCHECKED) {
    reasons.push('provenance not checked (run with --require-provenance and a GitHub token)');
  } else if (provenanceState === PROVENANCE_STATE.FAILED) {
    reasons.push('provenance cross-check failed');
  }
  return reasons.join('; ');
}

// ─── OPTION A authorization gate ─────────────────────────────────────────────

/**
 * Verify that the run's GITHUB_SHA is authorized by D-13 in origin/main.
 *
 * This is a pure, I/O-free function. Callers inject the I/O operations so it is
 * unit-testable without git. Production callers pass real git operations.
 * Test callers pass fixture functions. No runtime env var bypass exists.
 *
 * AUTH_SHA model: the gate reads `closure_subject_sha` from the bundle manifest at
 * origin/main, verifies it equals `subjectSha`, and then — if `fetchKeyRegistryYaml`
 * is provided — loads the Ed25519 key registry from that same AUTH_SHA commit. The
 * returned `keyRegistry` is used for immediate post-signing verification, so the
 * public key never needs to exist at INF_SHA: it is read from AUTH_SHA at runtime.
 *
 * @param {object} opts
 * @param {string} opts.subjectSha        GITHUB_SHA of the current run (40 hex chars)
 * @param {() => string} opts.fetchMainManifest
 *   Returns the YAML content of docs/opsiq/bundles/factory-stage-7-closure.yaml
 *   at origin/main. Must throw on failure.
 * @param {() => string} opts.resolveMainSha
 *   Returns the 40-char lowercase SHA of origin/main HEAD. Must throw on failure.
 * @param {((sha: string) => string) | null} [opts.fetchKeyRegistryYaml]
 *   Optional. Given AUTH_SHA, returns the YAML content of
 *   .governance/stage7-signing-keys.yaml at that commit. When provided, the
 *   returned `keyRegistry` will contain the active Ed25519 public keys from AUTH_SHA.
 *   When omitted, `keyRegistry` is an empty Map (backward-compatible for tests).
 * @returns {{ authorizationManifestSha: string, keyRegistry: Map<string, string> }}
 *   `authorizationManifestSha` is recorded in the artifact; `keyRegistry` is used
 *   for immediate signature verification. Both are derived from the same AUTH_SHA.
 * @throws {Error} Message contains 'OPTION A authorization gate' when authorization fails.
 */
export function resolveCaptureAuthorization({
  subjectSha,
  fetchMainManifest,
  resolveMainSha,
  fetchKeyRegistryYaml = null,
}) {
  let rawManifest;
  try {
    rawManifest = fetchMainManifest();
  } catch (error) {
    throw new Error(
      `OPTION A authorization gate: failed to read factory-stage-7-closure.yaml from ` +
      `origin/main — ${error.message}. Stage 7 evidence capture requires explicit ` +
      `authorization via D-13. Ensure the repository has a reachable remote origin and ` +
      `that factory-stage-7-closure.yaml exists on origin/main with a closure_subject_sha ` +
      `matching GITHUB_SHA.`,
    );
  }

  if (typeof rawManifest !== 'string' || rawManifest.trim().length === 0) {
    throw new Error(
      `OPTION A authorization gate: factory-stage-7-closure.yaml at origin/main is empty ` +
      `or unreadable. The manifest must contain a well-formed closure_subject_sha.`,
    );
  }

  const match = /^\s*closure_subject_sha:\s*["']?([0-9a-f]{40})["']?\s*(?:#.*)?$/m.exec(rawManifest);
  if (!match) {
    throw new Error(
      `OPTION A authorization gate: factory-stage-7-closure.yaml at origin/main does not ` +
      `contain a well-formed closure_subject_sha (must be a 40-character lowercase commit SHA). ` +
      `The owner must commit D-13 to authorize evidence capture against a specific commit.`,
    );
  }

  const closureSubjectSha = match[1];
  if (closureSubjectSha !== subjectSha) {
    throw new Error(
      `OPTION A authorization gate: GITHUB_SHA=${subjectSha} is NOT authorized. ` +
      `factory-stage-7-closure.yaml at origin/main has closure_subject_sha=${closureSubjectSha}. ` +
      `Stage 7 evidence may only be captured against the exact commit authorized by D-13. ` +
      `If INF_SHA has changed, the owner must update factory-stage-7-closure.yaml on main ` +
      `before re-running the evidence capture workflow.`,
    );
  }

  let mainSha;
  try {
    mainSha = resolveMainSha();
  } catch (error) {
    throw new Error(
      `OPTION A authorization gate: could not resolve origin/main HEAD SHA — ${error.message}`,
    );
  }

  if (typeof mainSha !== 'string' || !SHA40.test(mainSha.trim())) {
    throw new Error(
      `OPTION A authorization gate: resolveMainSha returned '${mainSha}' which is not a ` +
      `valid 40-character lowercase SHA`,
    );
  }

  const authorizationManifestSha = mainSha.trim();

  // AUTH_SHA model: load key registry from AUTH_SHA so the public key does not need
  // to exist at INF_SHA. The owner commits the public key to main (AUTH_SHA) as a
  // governance-only commit AFTER PR-A merges, before dispatching the capture workflow.
  let keyRegistry = new Map();
  if (typeof fetchKeyRegistryYaml === 'function') {
    let yamlContent;
    try {
      yamlContent = fetchKeyRegistryYaml(authorizationManifestSha);
    } catch (error) {
      throw new Error(
        `OPTION A authorization gate: could not load key registry from AUTH_SHA ` +
        `${authorizationManifestSha} — ${error.message}. ` +
        `The owner must commit the Ed25519 public key to ` +
        `.governance/stage7-signing-keys.yaml on main before dispatching capture.`,
      );
    }
    keyRegistry = parseKeyRegistryYaml(yamlContent);
  }

  return { authorizationManifestSha, keyRegistry };
}

// ─── Key registry ─────────────────────────────────────────────────────────────

/**
 * Parse an Ed25519 public key registry from a YAML string.
 *
 * Returns a Map<keyId, publicKeyPem> containing only `status: active` Ed25519 keys.
 * Keys with status `pending_owner_provisioning` or `revoked` are skipped.
 *
 * Accepts the YAML content directly so callers can supply it from any source —
 * a file, a git-show command, or a test fixture.
 *
 * @param {string} yamlContent  YAML content of the key registry
 * @returns {Map<string, string>} key_id → public key in PEM format
 */
export function parseKeyRegistryYaml(yamlContent) {
  const keyMap = new Map();
  const lines = String(yamlContent ?? '').split('\n');
  let current = null;

  const unquote = (s) => {
    const t = s.trim();
    if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
      return t.slice(1, -1);
    }
    return t;
  };

  const finalize = (entry) => {
    if (!entry) return;
    if (entry.status !== 'active') return;
    if (entry.algorithm !== 'Ed25519') return;
    if (!entry.key_id || !entry.public_key_spki_der_base64) return;
    const b64 = entry.public_key_spki_der_base64.replace(/\s/g, '');
    const wrapped = b64.match(/.{1,64}/g)?.join('\n') ?? b64;
    const pem = `-----BEGIN PUBLIC KEY-----\n${wrapped}\n-----END PUBLIC KEY-----\n`;
    keyMap.set(entry.key_id, pem);
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (/^-\s*key_id:/.test(trimmed)) {
      finalize(current);
      current = {};
      const m = /^-\s*key_id:\s*(.+)$/.exec(trimmed);
      if (m) current.key_id = unquote(m[1]);
      continue;
    }
    if (!current) continue;
    for (const [field, pat] of [
      ['algorithm', /^\s*algorithm:\s*(.+)$/],
      ['status', /^\s*status:\s*(.+)$/],
      ['public_key_spki_der_base64', /^\s*public_key_spki_der_base64:\s*(.+)$/],
    ]) {
      const m = pat.exec(line);
      if (m) {
        current[field] = unquote(m[1]);
        break;
      }
    }
  }
  finalize(current);

  return keyMap;
}

/**
 * Load the Ed25519 public key registry from a YAML file.
 *
 * Reads the file and delegates to parseKeyRegistryYaml. The file format is the
 * versioned registry at .governance/stage7-signing-keys.yaml. No runtime path
 * override is accepted — callers always pass the hardcoded path.
 *
 * @param {string} filePath  absolute path to the registry YAML file
 * @returns {Map<string, string>} key_id → public key in PEM format
 */
export function loadKeyRegistry(filePath) {
  let raw;
  try {
    raw = readFileSync(filePath, 'utf8');
  } catch (error) {
    throw new Error(`could not read key registry from ${filePath}: ${error.message}`);
  }
  return parseKeyRegistryYaml(raw);
}

// ─── Proof-artifact resolution (G-1) ──────────────────────────────────────────
//
// Before G-1 a Stage 7 invariant satisfied its proof requirement with any
// non-empty string in proof_artifacts, so the literal text "proved it" counted
// as evidence. The evidence artifact format existed but nothing consumed it.
//
// This section is the single authoritative resolution path. Both
// validate-evidence-artifacts.mjs (structural gate) and invariant-closure.mjs
// (proof/closure gate) consume it, so structural validity, acceptance, invariant
// proof and stage closure can never diverge in their reading of an artifact.
//
// Owner decision D-8 is implemented here: an UNVERIFIED artifact may be
// committed and structurally validated, but may never satisfy a PROVEN
// invariant. Resolution fails closed — anything it cannot positively verify is
// a violation, never a pass.

/** Canonical artifact-id reference form. Exported so gates never re-derive it. */
export const ARTIFACT_ID_PATTERN = ARTIFACT_ID;

/** Repository-relative directory that holds Stage 7 evidence artifacts. */
export const EVIDENCE_ARTIFACTS_DIR = 'docs/opsiq/evidence/stage-7/artifacts';

/**
 * A proof_artifacts entry is a canonical artifact id and nothing else.
 * Prose, paths, URLs, uppercase, and shortened ids are all rejected — an
 * unresolvable reference is not evidence.
 */
export function isCanonicalArtifactReference(reference) {
  return typeof reference === 'string' && ARTIFACT_ID.test(reference);
}

/**
 * Why a reference is not a canonical artifact id. Gate output must name the
 * defect, never print a bare rejection.
 */
export function explainReferenceRejection(reference) {
  if (typeof reference !== 'string') return `is ${describe(reference)}, not a string`;
  const trimmed = reference.trim();
  if (trimmed.length === 0) return 'is empty';
  if (/^https?:\/\//i.test(trimmed)) return 'is a URL — a link is not a captured observation';
  if (trimmed.includes('/') || trimmed.includes('\\')) return 'is a path — reference the artifact_id, not a location on disk';
  if (/^evd_/i.test(trimmed) && !/^evd_/.test(trimmed)) return 'has a non-lowercase evd_ prefix — artifact ids are lowercase';
  if (/^evd_[0-9a-fA-F]*$/.test(trimmed) && trimmed.length !== 36) {
    return `is ${trimmed.length - 4} hex character(s) long — a canonical artifact id carries exactly 32`;
  }
  if (/^evd_/.test(trimmed) && /[^0-9a-f]/.test(trimmed.slice(4))) return 'contains non-hexadecimal characters after evd_';
  if (trimmed !== reference) return 'carries surrounding whitespace';
  return 'is free text — a proof reference must be a canonical artifact id of the form evd_ followed by 32 lowercase hex characters';
}

/**
 * Every `.json` file at or below `dir`, depth-first and sorted, as
 * `{ full, relativeToDir }`.
 */
function collectArtifactFiles(dir, prefix = '') {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const found = [];
  for (const entry of entries.sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const full = pathJoin(dir, entry.name);
    const relativeToDir = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) found.push(...collectArtifactFiles(full, relativeToDir));
    else if (entry.name.endsWith('.json')) found.push({ full, relativeToDir });
  }
  return found;
}

/**
 * Read and validate every artifact at or below `dir`, returning an index keyed by
 * artifact_id plus the flat record list.
 *
 * @param {object} [options]
 * @param {string} [options.dir]              absolute artifacts directory
 * @param {string|Map<string,string>|null} [options.signingKey]  enables signature verification
 * @param {Map<string,string>} [options.provenance] artifact_id -> PROVENANCE_STATE
 * @param {string} [options.displayRoot]      root that reported paths are shown against
 * @param {((authorizationManifestSha: string|null) => string|null)|null} [options.resolveClosureManifest]
 *   Optional. Given an artifact's own `authorization_manifest_sha`, returns the
 *   factory-stage-7-closure.yaml content at that commit. Supplied to the validator as
 *   `closureManifestYaml`, which the D-4/A4 S7-I11 guard reads its authorized
 *   environment target from.
 *
 *   Resolution is per artifact, and deliberately keyed on the artifact's OWN AUTH_SHA
 *   rather than the working tree — the same reasoning as the existing
 *   `--from-auth-sha-registry` key-registry pass in validate-evidence-artifacts.mjs:
 *   the working tree is at INF_SHA, which is not where governance is authored.
 *
 *   When omitted, `closureManifestYaml` stays null and the S7-I11 guard fails closed
 *   with MANIFEST_UNREADABLE. That is the correct default: a caller that supplies no
 *   governance input has not demonstrated a resolved D-4.
 * @param {((authorizationManifestSha: string|null) => (string|Map<string,string>|null))|null} [options.resolveSigningKey]
 *   Optional. Given an artifact's own `authorization_manifest_sha`, returns the key
 *   material its signature must verify against. Takes precedence over `signingKey`
 *   for that artifact; when it returns null the signature stays UNCHECKED.
 *
 *   Per artifact, and keyed on the artifact's OWN AUTH_SHA, for the same reason
 *   `resolveClosureManifest` is: governance is authored on main and the working tree
 *   is at INF_SHA. A single `signingKey` cannot express that — it would have to be
 *   either the working-tree registry (an INF_SHA binding, which is the thing
 *   --from-auth-sha-registry exists to avoid) or the union of several AUTH_SHA
 *   registries, which would let a key active at one AUTH_SHA verify an artifact
 *   bound to a different one. Neither preserves the binding, so the resolution has
 *   to happen per artifact, here.
 * @returns {{ records: object[], byId: Map<string, object>, duplicates: string[] }}
 */
export function loadEvidenceArtifactIndex({ dir, signingKey = null, provenance = null, displayRoot = process.cwd(), resolveClosureManifest = null, resolveSigningKey = null } = {}) {
  const records = [];
  const byId = new Map();
  const duplicates = [];

  for (const { full, relativeToDir } of collectArtifactFiles(dir)) {
    const name = relativeToDir.slice(relativeToDir.lastIndexOf('/') + 1);
    const nested = relativeToDir.includes('/');
    const relPath = pathRelative(displayRoot, full);
    let parsed;
    try {
      parsed = JSON.parse(readFileSync(full, 'utf8'));
    } catch (error) {
      records.push({
        path: relPath, absolutePath: full, fileName: name, nested,
        artifactId: null, invariantId: null, lane: null,
        proofType: null, subjectSha: null, supersedes: null,
        level: ACCEPTANCE.REJECTED,
        violations: [`${relPath}: not parseable as JSON — ${error.message}`],
        signatureState: SIGNATURE_STATE.ABSENT,
        provenanceState: PROVENANCE_STATE.UNCHECKED,
      });
      continue;
    }

    // Resolve this artifact's governance manifest from the AUTH_SHA it names. A
    // resolver failure is not fatal here: it yields null, and the S7-I11 guard then
    // fails closed on its own terms rather than this loop inventing a verdict.
    let closureManifestYaml = null;
    if (resolveClosureManifest) {
      try {
        closureManifestYaml = resolveClosureManifest(
          typeof parsed?.authorization_manifest_sha === 'string' ? parsed.authorization_manifest_sha : null,
        );
      } catch {
        closureManifestYaml = null;
      }
    }

    // Key material for THIS artifact, resolved from the AUTH_SHA it names when a
    // resolver is supplied. Falls back to the index-wide signingKey otherwise, so
    // every existing caller keeps its current behaviour exactly.
    let artifactSigningKey = signingKey;
    if (resolveSigningKey) {
      try {
        artifactSigningKey = resolveSigningKey(
          typeof parsed?.authorization_manifest_sha === 'string' ? parsed.authorization_manifest_sha : null,
        ) ?? null;
      } catch {
        artifactSigningKey = null;
      }
    }

    const { violations, signatureState } = validateEvidenceArtifact(parsed, { signingKey: artifactSigningKey, fileName: name, closureManifestYaml });
    const scoped = violations.map((v) => `${relPath}: ${v}`);
    const artifactId = typeof parsed?.artifact_id === 'string' ? parsed.artifact_id : null;

    if (nested) {
      scoped.push(`${relPath}: is filed in a subdirectory of ${EVIDENCE_ARTIFACTS_DIR} — an artifact must sit directly in that directory under its canonical filename, because that is the only path a proof reference resolves through`);
    }

    if (artifactId && !nested) {
      if (byId.has(artifactId)) {
        duplicates.push(artifactId);
        scoped.push(`${relPath}: duplicate artifact_id ${artifactId}, already recorded by ${byId.get(artifactId).path} — an artifact copied and re-filed is not a second observation`);
      }
    }

    const provenanceState = provenance?.get(artifactId) ?? PROVENANCE_STATE.UNCHECKED;
    const record = {
      path: relPath,
      absolutePath: full,
      fileName: name,
      nested,
      artifactId,
      invariantId: parsed?.invariant_id ?? null,
      lane: parsed?.lane ?? null,
      proofType: parsed?.proof_type ?? null,
      subjectSha: parsed?.subject_sha ?? null,
      supersedes: parsed?.supersedes ?? null,
      level: classifyAcceptance({ violations: scoped, signatureState, provenanceState }),
      violations: scoped,
      signatureState,
      provenanceState,
    };
    records.push(record);
    if (artifactId && !nested && !byId.has(artifactId)) byId.set(artifactId, record);
  }

  return { records, byId, duplicates };
}

/**
 * State of a contract's authorized subject-SHA policy.
 */
export const SUBJECT_SHA_POLICY = Object.freeze({
  PRESENT: 'SUBJECT_SHA_POLICY_PRESENT',
  MISSING: 'SUBJECT_SHA_POLICY_MISSING',
  MALFORMED: 'SUBJECT_SHA_POLICY_MALFORMED',
});

export const SUBJECT_SHA_NOT_AUTHORIZED = 'SUBJECT_SHA_NOT_AUTHORIZED';

const SUBJECT_SHA_POLICY_FIELDS = Object.freeze([
  ['closure_subject_sha', (m) => m?.closure_subject_sha],
  ['required_evidence.merge_sha', (m) => m?.required_evidence?.merge_sha],
  ['required_evidence.pr_sha', (m) => m?.required_evidence?.pr_sha],
  ['post_merge_evidence.merge_sha', (m) => m?.post_merge_evidence?.merge_sha],
]);

/**
 * Resolve one manifest's authorized subject-SHA policy.
 */
export function resolveSubjectShaPolicy(manifest) {
  const authorized = [];
  const violations = [];

  for (const [field, read] of SUBJECT_SHA_POLICY_FIELDS) {
    let value;
    try {
      value = read(manifest);
    } catch {
      value = undefined;
    }
    if (value === undefined || value === null) continue;
    if (typeof value === 'string' && SHA40.test(value)) {
      if (!authorized.includes(value)) authorized.push(value);
      continue;
    }
    violations.push(
      `${SUBJECT_SHA_POLICY.MALFORMED}: ${field} is ${describe(value)}${typeof value === 'string' ? ` '${value}'` : ''} — an authorized subject SHA must be a 40-character lowercase commit SHA. A field filled in wrongly is a defect in the contract, not a reason to fall back to a shorter allowlist`,
    );
  }

  if (violations.length > 0) return { state: SUBJECT_SHA_POLICY.MALFORMED, authorized: [], violations };
  if (authorized.length === 0) return { state: SUBJECT_SHA_POLICY.MISSING, authorized: [], violations };
  return { state: SUBJECT_SHA_POLICY.PRESENT, authorized, violations };
}

/**
 * Resolve the supersession chain for one artifact.
 */
export function evaluateSupersessionChain(record, byId) {
  const violations = [];
  const seen = new Set([record.artifactId]);
  let cursor = record;

  while (cursor?.supersedes) {
    const target = cursor.supersedes;
    if (target === cursor.artifactId) {
      violations.push(`${cursor.artifactId} supersedes itself — a correction must be a different artifact`);
      break;
    }
    if (seen.has(target)) {
      violations.push(`supersession cycle detected at ${target} — the chain from ${record.artifactId} never terminates`);
      break;
    }
    seen.add(target);
    const next = byId.get(target);
    if (!next) {
      violations.push(`supersedes ${target}, which is not present in ${EVIDENCE_ARTIFACTS_DIR} — a superseding artifact must be auditable against the artifact it replaces`);
      break;
    }
    if (next.invariantId !== cursor.invariantId) {
      violations.push(`${cursor.artifactId} (${cursor.invariantId}) supersedes ${target} (${next.invariantId}) — supersession is only meaningful within one invariant`);
      break;
    }
    if (next.lane !== cursor.lane) {
      violations.push(`${cursor.artifactId} (lane ${cursor.lane}) supersedes ${target} (lane ${next.lane}) — a correction must observe the same lane as the artifact it replaces, or the two are not comparable observations`);
      break;
    }
    if (next.subjectSha !== cursor.subjectSha) {
      violations.push(`${cursor.artifactId} (subject_sha ${cursor.subjectSha}) supersedes ${target} (subject_sha ${next.subjectSha}) — a correction must observe the same subject commit as the artifact it replaces, or it is a new observation, not a correction`);
      break;
    }
    if (next.level === ACCEPTANCE.REJECTED) {
      violations.push(`supersession chain passes through ${target}, which is REJECTED — a chain is only as auditable as its weakest link`);
      break;
    }
    cursor = next;
  }
  return violations;
}

export function collectSupersededIds(records, byId) {
  const superseded = new Set();
  for (const record of records) {
    if (!record.supersedes || record.violations.length > 0) continue;
    const target = byId.get(record.supersedes);
    if (target && target.invariantId === record.invariantId && target.artifactId !== record.artifactId) {
      superseded.add(record.supersedes);
    }
  }
  return superseded;
}

/**
 * Decide whether one proof reference may back a PROVEN invariant.
 */
export function evaluateProofReference(reference, context) {
  const { invariantId, allowedLanes, expectedProofType, byId, superseded, subjectShaPolicy } = context;

  if (!isCanonicalArtifactReference(reference)) {
    return [`proof reference ${JSON.stringify(reference)} ${explainReferenceRejection(reference)}`];
  }

  const record = byId.get(reference);
  if (!record) {
    return [`proof reference ${reference} resolves to no artifact — expected ${EVIDENCE_ARTIFACTS_DIR}/${reference}.json`];
  }

  const violations = [];
  if (record.violations.length > 0) {
    violations.push(`proof reference ${reference} names a structurally invalid artifact: ${record.violations[0]}`);
  }
  if (record.invariantId !== invariantId) {
    violations.push(`proof reference ${reference} is bound to invariant ${record.invariantId}, not ${invariantId} — an artifact does not change what it observed by being cited elsewhere`);
  }
  if (allowedLanes.length > 0 && !allowedLanes.includes(record.lane)) {
    violations.push(`proof reference ${reference} is lane ${record.lane}, but ${invariantId} requires ${allowedLanes.join(' or ')}`);
  }
  if (expectedProofType && record.proofType !== expectedProofType) {
    violations.push(`proof reference ${reference} declares proof_type ${record.proofType}, but ${invariantId} requires ${expectedProofType}`);
  }
  if (subjectShaPolicy.state === SUBJECT_SHA_POLICY.MISSING) {
    violations.push(`proof reference ${reference}: ${SUBJECT_SHA_POLICY.MISSING} — the contract names no authorized subject SHA, so no commit is authorized and no artifact may back a PROVEN invariant. An empty allowlist is not permission to use any commit; it is the absence of an authorization. Name the authorized commit in closure_subject_sha or required_evidence before citing evidence`);
  } else if (subjectShaPolicy.state === SUBJECT_SHA_POLICY.MALFORMED) {
    violations.push(`proof reference ${reference}: ${SUBJECT_SHA_POLICY.MALFORMED} — the contract's subject-SHA policy is not readable, so nothing can be authorized against it`);
  } else if (!subjectShaPolicy.authorized.includes(record.subjectSha)) {
    violations.push(`proof reference ${reference}: ${SUBJECT_SHA_NOT_AUTHORIZED} — observed subject_sha ${record.subjectSha}, which is not an authorized closure subject SHA (${subjectShaPolicy.authorized.join(', ')}). Evidence captured against another commit does not describe this one`);
  }
  if (superseded.has(reference)) {
    violations.push(`proof reference ${reference} has been superseded by a later artifact — only the terminal artifact in a supersession chain may back a proof`);
  }
  violations.push(...evaluateSupersessionChain(record, byId).map((v) => `proof reference ${reference}: ${v}`));

  if (record.level !== ACCEPTANCE.ACCEPTED) {
    const why = explainAcceptance(record) || 'acceptance requirements not met';
    violations.push(`proof reference ${reference} is ${record.level}, not ACCEPTED — ${why}. Owner decision D-8: an artifact that has not been verified may be committed, but may never satisfy a PROVEN invariant`);
  }

  return violations;
}
