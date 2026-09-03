/**
 * Factory Stage Closure — Invariant Proof Enforcement (Stage 7 closure condition 5)
 *
 * Single source of truth for the fifth Stage 7 closure condition, frozen in PR-1A
 * (amendment A7, owner decision D-5 option b) and made executable here in PR-1B.
 *
 * ─── The governance gap this closes ──────────────────────────────────────────
 * Before PR-1B, neither scripts/validate-stage-acceptance.mjs nor
 * scripts/validate-bundle-manifests.mjs read the `invariants` block of a
 * factory_stage_closure manifest. Both checked only `status` plus four metadata
 * fields (pr_sha, merge_sha, main_integration_run, db_verification_run). A stage
 * closure manifest could therefore be flipped to CLOSED with four identifiers
 * pasted in while every invariant remained PENDING with empty proof_artifacts,
 * and both gates would exit 0. Metadata about a merged PR proved the stage.
 *
 * ─── Enforcement is validator-owned, never manifest-owned ────────────────────
 * The first implementation asked the manifest whether enforcement should apply,
 * by testing for `closure_conditions.5_invariant_proof`. A hostile audit showed
 * that deleting that key, renaming it, or writing `closure_conditions` as a list
 * silently disabled enforcement, and that deleting invariants from the manifest
 * shrank the set the validator checked. The manifest could opt itself out of the
 * rules that govern it.
 *
 * Enforcement is now decided by STAGE_CLOSURE_ENFORCEMENT_REGISTRY below, which
 * lives in this file and cannot be edited from a bundle manifest. For a stage the
 * registry governs:
 *
 *   - the manifest MUST declare closure_conditions.5_invariant_proof. Missing,
 *     renamed, malformed, or non-object closure_conditions is a violation, not a
 *     reason to skip checking.
 *   - the manifest MUST carry exactly the canonical invariant id set. Missing ids
 *     and undeclared extra ids are both violations.
 *
 * These are STRUCTURAL violations: they are evaluated for every governed manifest
 * regardless of its status, so a contract cannot be quietly disarmed while PENDING
 * and closed later. PROOF violations (status/proof_artifacts/waivers) are evaluated
 * by the callers only when the bundle is CLOSED.
 *
 * Legacy stages are exempt by explicit registry entry, never by manifest omission:
 * factory-stage-5-closure (free-text invariants) and factory-stage-6-closure
 * (LANE_A_PROVEN / LANE_B_PROVEN statuses) were both accepted under the four-field
 * rule before condition 5 existed. Retro-enforcing them would change accepted-stage
 * behaviour and requires an owner decision.
 *
 * A factory_stage_closure manifest that the registry does not know about is itself
 * a violation — a stage closure contract no validator governs is the original hole.
 *
 * ─── The rule ────────────────────────────────────────────────────────────────
 * Every invariant in a governed manifest must satisfy one of:
 *   (a) status === 'PROVEN' AND proof_artifacts contains >= 1 canonical artifact
 *       reference that resolves to an eligible ACCEPTED evidence artifact bound to
 *       that invariant, or
 *   (b) a complete owner waiver naming that invariant exists in invariant_waivers.
 *
 * ─── G-1: proof references are resolved, not counted ─────────────────────────
 * PR-1B required >= 1 non-empty proof_artifacts entry but never interpreted it, so
 * the string "proved it" satisfied the same test as a captured, signed,
 * provenance-verified observation. Proof references are now canonical artifact ids
 * resolved through scripts/lib/evidence-artifact.mjs — the same authoritative path
 * validate-evidence-artifacts.mjs uses, so the structural gate and the closure gate
 * can never disagree about an artifact.
 *
 * Owner decision D-8: an UNVERIFIED artifact may be committed and structurally
 * validated, but may never satisfy a PROVEN invariant. Acceptance requires a
 * verified signature and verified provenance, which this library only ever reports
 * when a caller supplies the protected context. A gate without that context reports
 * what it could not check and fails closed; it never certifies closure by default.
 *
 * A waiver is never a default and is never implied by silence. An incomplete
 * waiver is not a waiver: it is reported as a violation and does not satisfy (b).
 */

import { join as pathJoin } from 'node:path';

import {
  EVIDENCE_ARTIFACTS_DIR,
  collectSupersededIds,
  evaluateProofReference,
  explainReferenceRejection,
  isCanonicalArtifactReference,
  loadEvidenceArtifactIndex,
  resolveSubjectShaPolicy,
} from './evidence-artifact.mjs';

/**
 * The four closure metadata fields (conditions 1-4).
 *
 * Previously duplicated verbatim in validate-stage-acceptance.mjs and
 * validate-bundle-manifests.mjs, so the two gates could drift apart. Same
 * root-cause class as the invariant gap: closure logic living in more than one
 * place is closure logic that can be updated in one place only.
 */
export const REQUIRED_EVIDENCE_FIELDS = Object.freeze([
  'pr_sha',
  'merge_sha',
  'main_integration_run',
  'db_verification_run',
]);

/** Manifest key a governed closure contract is required to declare. */
const CLOSURE_CONDITION_5_KEY = '5_invariant_proof';

/** The only invariant status that satisfies condition 5 without a waiver. */
const REQUIRED_INVARIANT_STATUS = 'PROVEN';

/** artifact_type that identifies a stage closure contract. */
const STAGE_CLOSURE_ARTIFACT_TYPE = 'factory_stage_closure';

/**
 * Canonical Stage 7 invariant set, owned by the validator.
 *
 * factory-stage-7-closure.yaml must declare exactly these ids. The manifest does
 * not get to shrink this list by deleting entries, nor extend it by adding ids
 * that were never authorised.
 */
const CANONICAL_STAGE_7_INVARIANT_IDS = Object.freeze([
  'S7-I1', 'S7-I2', 'S7-I3', 'S7-I4', 'S7-I5', 'S7-I6', 'S7-I7', 'S7-I8',
  'S7-I9', 'S7-I10', 'S7-I11', 'S7-I12', 'S7-I13', 'S7-I14', 'S7-I15', 'S7-I16',
]);

/**
 * Which stage closure contracts this validator governs, and how.
 *
 * `requiresCondition5: false` is an explicit, reasoned legacy exemption. It is the
 * only way a stage closure contract escapes invariant enforcement — a manifest can
 * never grant itself one.
 */
const STAGE_CLOSURE_ENFORCEMENT_REGISTRY = Object.freeze({
  'factory-stage-5-closure': Object.freeze({
    requiresCondition5: false,
    legacyReason:
      'Accepted under the four-field rule before condition 5 existed. Its invariants are free-text prose, not structured entries, so there is no status or proof_artifacts to evaluate. Retro-enforcement requires an owner decision.',
  }),
  'factory-stage-6-closure': Object.freeze({
    requiresCondition5: false,
    legacyReason:
      'Accepted under the four-field rule before condition 5 existed. Its invariant statuses are LANE_A_PROVEN / LANE_B_PROVEN, not PROVEN. Retro-enforcement requires an owner decision.',
  }),
  'factory-stage-7-closure': Object.freeze({
    requiresCondition5: true,
    canonicalInvariantIds: CANONICAL_STAGE_7_INVARIANT_IDS,
  }),
});

/**
 * Fields every owner waiver must carry.
 *
 * The frozen contract requires the invariant, the owner, the date and the reason.
 * `acknowledgement` is additionally required so that a waiver cannot be recorded
 * without an explicit, written owner acknowledgement of what is being waived.
 * Stricter than the contract text, so it can never admit a waiver the contract
 * would reject.
 */
const WAIVER_REQUIRED_FIELDS = Object.freeze([
  'invariant',
  'owner',
  'reason',
  'date',
  'acknowledgement',
]);

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function describeType(value) {
  if (value === null) return 'null';
  if (value === undefined) return 'absent';
  if (Array.isArray(value)) return 'list';
  if (value instanceof Date) return 'date';
  return typeof value;
}

/**
 * Normalise a waiver field before validation.
 *
 * YAML parses an unquoted `date: 2026-08-02` into a JS Date, which is a correct
 * and natural way for an owner to write a waiver. Converting it to an ISO string
 * lets it satisfy the same non-empty-string rule as a quoted date instead of being
 * rejected as the wrong type. No other field is normalised: owner, reason and
 * acknowledgement remain strict non-empty strings.
 */
function normalizeWaiverFieldValue(field, value) {
  if (field === 'date' && value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  return value;
}

/**
 * Sort invariant ids so S7-I2 precedes S7-I10 (plain string sort would not).
 * Falls back to lexicographic ordering for ids without a trailing number.
 */
function compareInvariantIds(a, b) {
  const parse = (id) => {
    const match = /^(.*?)(\d+)$/.exec(String(id));
    return match ? [match[1], Number(match[2])] : [String(id), Number.NaN];
  };
  const [prefixA, numA] = parse(a);
  const [prefixB, numB] = parse(b);
  if (prefixA !== prefixB) return prefixA < prefixB ? -1 : 1;
  if (Number.isNaN(numA) || Number.isNaN(numB)) return String(a) < String(b) ? -1 : 1;
  return numA - numB;
}

/** Registry entry governing a bundle id, or undefined when unregistered. */
function getStageClosureEnforcement(bundleId) {
  return STAGE_CLOSURE_ENFORCEMENT_REGISTRY[bundleId];
}

/**
 * True when the validator requires invariant proof for this bundle id.
 *
 * Reads the registry only. Deliberately takes no manifest argument: the manifest
 * has no say in whether it is enforced.
 */
export function requiresInvariantProof(bundleId) {
  const entry = getStageClosureEnforcement(bundleId);
  return Boolean(entry && entry.requiresCondition5);
}

/**
 * Lanes the contract permits for one invariant.
 *
 * The frozen contract writes a compound lane as `LANE_C+LANE_E` (S7-I10), which
 * means either lane may carry the observation. An absent proof_lane leaves the
 * set empty, which the resolver reads as unconstrained rather than as a licence
 * to accept anything — every other eligibility rule still applies.
 */
function contractLanesFor(invariantEntry) {
  const declared = invariantEntry?.proof_lane;
  if (typeof declared !== 'string' || declared.trim() === '') return [];
  return declared.split('+').map((lane) => lane.trim()).filter(Boolean);
}

/**
 * Validate one waiver entry.
 *
 * @returns {{ valid: boolean, invariant: string|null, problems: string[] }}
 */
function validateWaiver(waiver, index, knownInvariantIds) {
  if (!isPlainObject(waiver)) {
    return {
      valid: false,
      invariant: null,
      problems: [
        `invariant_waivers[${index}] is not a waiver object (got ${describeType(waiver)}) — a waiver must be a mapping with fields: ${WAIVER_REQUIRED_FIELDS.join(', ')}`,
      ],
    };
  }

  const problems = [];
  const missing = WAIVER_REQUIRED_FIELDS.filter(
    (field) => !isNonEmptyString(normalizeWaiverFieldValue(field, waiver[field])),
  );
  const label = isNonEmptyString(waiver.invariant)
    ? `invariant_waivers[${index}] (invariant=${waiver.invariant.trim()})`
    : `invariant_waivers[${index}]`;

  if (missing.length > 0) {
    problems.push(
      `${label} is incomplete — missing or empty required waiver field(s): ${missing.join(', ')} (every waiver requires: ${WAIVER_REQUIRED_FIELDS.join(', ')}). An incomplete waiver does not waive anything.`,
    );
  }

  const invariantId = isNonEmptyString(waiver.invariant) ? waiver.invariant.trim() : null;

  if (invariantId && !knownInvariantIds.includes(invariantId)) {
    problems.push(
      `${label} waives '${invariantId}', which is not an invariant declared by this contract (declared: ${knownInvariantIds.join(', ')})`,
    );
  }

  return { valid: problems.length === 0, invariant: invariantId, problems };
}

/**
 * Structural checks: does this governed manifest still declare the enforcement it
 * is subject to, and does it carry the canonical invariant set?
 *
 * Evaluated for every governed manifest whatever its status. A contract cannot be
 * disarmed while PENDING and closed afterwards.
 */
function evaluateStructure(manifest, bundleId, entry) {
  const violations = [];
  const conditions = manifest.closure_conditions;

  if (!isPlainObject(conditions)) {
    violations.push(
      `${bundleId}: closure_conditions is ${describeType(conditions)} — this contract is governed by closure condition 5 and must declare 'closure_conditions.${CLOSURE_CONDITION_5_KEY}' as a mapping entry. A manifest cannot opt itself out of invariant enforcement.`,
    );
  } else if (!Object.prototype.hasOwnProperty.call(conditions, CLOSURE_CONDITION_5_KEY)) {
    violations.push(
      `${bundleId}: closure_conditions does not declare '${CLOSURE_CONDITION_5_KEY}' (declared: ${Object.keys(conditions).join(', ') || 'none'}) — this contract is governed by closure condition 5 and must declare it. A manifest cannot opt itself out of invariant enforcement.`,
    );
  }

  const invariants = manifest.invariants;
  if (!isPlainObject(invariants) || Object.keys(invariants).length === 0) {
    violations.push(
      `${bundleId}: 'invariants' is ${isPlainObject(invariants) ? 'empty' : describeType(invariants)} — this contract must declare the canonical invariant set: ${entry.canonicalInvariantIds.join(', ')}`,
    );
    return { violations, invariantIds: [] };
  }

  const declared = Object.keys(invariants);
  const canonical = entry.canonicalInvariantIds;
  const missing = canonical.filter((id) => !declared.includes(id));
  const extra = declared.filter((id) => !canonical.includes(id));

  if (missing.length > 0) {
    violations.push(
      `${bundleId}: canonical invariant(s) missing from the manifest: ${missing.join(', ')} — the validator owns the Stage 7 invariant set (${canonical.length} invariants); a manifest cannot shrink it by deleting entries`,
    );
  }
  if (extra.length > 0) {
    violations.push(
      `${bundleId}: undeclared invariant(s) present in the manifest: ${extra.join(', ')} — not part of the canonical invariant set (${canonical.join(', ')}); a manifest cannot extend it`,
    );
  }

  return { violations, invariantIds: declared.sort(compareInvariantIds) };
}

/**
 * Evaluate closure condition 5 for a single stage-closure manifest.
 *
 * Pure: reads the parsed manifest and the validator-owned registry only, performs
 * no I/O.
 *
 * @param {object} manifest  Parsed bundle manifest YAML.
 * @param {{ bundleId: string }} options  bundleId keys the enforcement registry.
 * @returns {{
 *   enforced: boolean,               // is this bundle governed by condition 5?
 *   registered: boolean,             // is this bundle id known to the registry?
 *   structuralViolations: string[],  // blocking at ANY status
 *   proofViolations: string[],       // blocking when the bundle is CLOSED
 *   proven: string[],
 *   waived: string[],
 *   unmet: string[],
 *   total: number,
 * }}
 */
export function evaluateInvariantClosure(manifest, options = {}) {
  const bundleId = options.bundleId || (isPlainObject(manifest) ? manifest.id : null) || 'unknown-bundle';
  const entry = getStageClosureEnforcement(bundleId);
  const base = {
    enforced: false,
    registered: Boolean(entry),
    structuralViolations: [],
    proofViolations: [],
    proven: [],
    waived: [],
    unmet: [],
    total: 0,
  };

  // An unregistered stage closure contract is governed by nothing. Fail closed.
  if (!entry) {
    if (isPlainObject(manifest) && manifest.artifact_type === STAGE_CLOSURE_ARTIFACT_TYPE) {
      return {
        ...base,
        structuralViolations: [
          `${bundleId}: artifact_type=${STAGE_CLOSURE_ARTIFACT_TYPE} but this bundle id is not present in STAGE_CLOSURE_ENFORCEMENT_REGISTRY (scripts/lib/invariant-closure.mjs) — a stage closure contract no validator governs cannot be validated; register it with its canonical invariant set, or with an explicit reasoned legacy exemption`,
        ],
      };
    }
    return base;
  }

  // Explicit, reasoned legacy exemption. Never inferred from the manifest.
  if (!entry.requiresCondition5) return base;

  if (!isPlainObject(manifest)) {
    return {
      ...base,
      enforced: true,
      structuralViolations: [
        `${bundleId}: manifest is ${describeType(manifest)}, not a mapping — a contract governed by closure condition 5 cannot be evaluated`,
      ],
    };
  }

  const { violations: structuralViolations, invariantIds } = evaluateStructure(manifest, bundleId, entry);
  const proofViolations = [];

  if (invariantIds.length === 0) {
    return { ...base, enforced: true, structuralViolations, proofViolations };
  }

  // ─── Waivers must be complete and attributable ────────────────────────────
  const rawWaivers = manifest.invariant_waivers;
  const waiverByInvariant = new Map();

  if (rawWaivers != null && !Array.isArray(rawWaivers)) {
    proofViolations.push(
      `${bundleId}: 'invariant_waivers' must be a list (got ${describeType(rawWaivers)}) — cannot evaluate owner waivers, closure blocked`,
    );
  } else {
    const waivers = Array.isArray(rawWaivers) ? rawWaivers : [];
    waivers.forEach((waiver, index) => {
      const result = validateWaiver(waiver, index, invariantIds);
      for (const problem of result.problems) {
        proofViolations.push(`${bundleId}: ${problem}`);
      }
      if (!result.valid || !result.invariant) return;
      if (waiverByInvariant.has(result.invariant)) {
        proofViolations.push(
          `${bundleId}: duplicate owner waiver for invariant ${result.invariant} at invariant_waivers[${index}] — record exactly one waiver per invariant`,
        );
        return;
      }
      waiverByInvariant.set(result.invariant, waiver);
    });
  }

  // ─── Evidence index (G-1) ─────────────────────────────────────────────────
  //
  // Loaded once per evaluation and shared by every invariant, so two invariants
  // can never disagree about the same artifact. Options are injected rather than
  // read from the environment here, which is what lets the tests drive a real
  // temporary artifact directory instead of a mock.
  const evidenceIndex = loadEvidenceArtifactIndex({
    dir: options.evidenceDir ?? pathJoin(options.repoRoot ?? process.cwd(), EVIDENCE_ARTIFACTS_DIR),
    signingKey: options.signingKey ?? null,
    provenance: options.provenance ?? null,
    // Signature verification against the registry that was authoritative at each
    // artifact's OWN AUTH_SHA. Without it the only options are the working-tree
    // registry (an INF_SHA binding) or a merged key set (which would let a key
    // active at one AUTH_SHA verify an artifact bound to another) — see
    // scripts/lib/closure-evidence-context.mjs. Absent, signatures stay UNCHECKED
    // and nothing reaches ACCEPTED, which is the correct fail-closed default.
    resolveSigningKey: typeof options.resolveSigningKey === 'function' ? options.resolveSigningKey : null,
    // D-4/A4 S7-I11 enforcement reads its authorized environment target out of the
    // raw contract text. The governing contract here is the one being evaluated, so
    // an artifact cited as proof must satisfy the D-4 of the contract citing it.
    // Absent raw YAML the guard fails closed, which is the correct default.
    // Per-artifact AUTH_SHA resolution when the caller supplies it; otherwise the
    // raw text of the contract being evaluated, unchanged from before.
    resolveClosureManifest: typeof options.resolveClosureManifest === 'function'
      ? options.resolveClosureManifest
      : (typeof options.manifestYaml === 'string' && options.manifestYaml.length > 0
        ? () => options.manifestYaml
        : null),
  });
  const supersededIds = collectSupersededIds(evidenceIndex.records, evidenceIndex.byId);

  // Which commit the contract's evidence must describe. Resolved by the shared
  // library so this gate cannot hold a different opinion from any other caller.
  //
  // An absent policy is a refusal, not a licence. Before this was explicit, an
  // empty allowlist skipped the check entirely, and the live Stage 7 contract —
  // whose four required_evidence fields are all still null — therefore had no
  // subject-SHA enforcement at all. A rule that reads as enforced while checking
  // nothing is worse than no rule, because it is trusted.
  const subjectShaPolicy = resolveSubjectShaPolicy(manifest);
  for (const violation of subjectShaPolicy.violations) {
    structuralViolations.push(`${bundleId}: ${violation}`);
  }

  // ─── Every invariant proven, or explicitly waived ─────────────────────────
  const proven = [];
  const waived = [];
  const unmet = [];

  for (const id of invariantIds) {
    const invariantEntry = manifest.invariants[id];

    if (!isPlainObject(invariantEntry)) {
      unmet.push(id);
      proofViolations.push(
        `${bundleId}: invariant ${id} blocks closure — its entry is not a structured invariant (got ${describeType(invariantEntry)}); required: a mapping carrying status: ${REQUIRED_INVARIANT_STATUS} and proof_artifacts; missing proof: entire entry; missing waiver: no complete owner waiver for ${id} in invariant_waivers`,
      );
      continue;
    }

    const status = invariantEntry.status;
    const statusOk = status === REQUIRED_INVARIANT_STATUS;

    // G-1: a non-empty string is no longer proof. Every listed reference must
    // resolve to an eligible ACCEPTED artifact bound to THIS invariant.
    //
    // Structural rejection of a malformed reference applies at every status, so
    // a PENDING contract cannot quietly carry junk that only fails at closure
    // time. Eligibility (existence, acceptance, lane, supersession) is required
    // only where the contract claims the invariant is PROVEN — a truthful
    // PENDING invariant with no proof_artifacts remains valid and unaffected.
    const references = Array.isArray(invariantEntry.proof_artifacts) ? invariantEntry.proof_artifacts : [];
    const seenReferences = new Set();
    let referencesEligible = true;

    for (const reference of references) {
      if (!isCanonicalArtifactReference(reference)) {
        structuralViolations.push(
          `${bundleId}: invariant ${id} proof reference ${JSON.stringify(reference)} ${explainReferenceRejection(reference)}`,
        );
        referencesEligible = false;
        continue;
      }
      if (seenReferences.has(reference)) {
        structuralViolations.push(
          `${bundleId}: invariant ${id} lists proof reference ${reference} more than once — citing one observation twice does not make it two`,
        );
        referencesEligible = false;
        continue;
      }
      seenReferences.add(reference);

      if (!statusOk) continue;
      const problems = evaluateProofReference(reference, {
        invariantId: id,
        allowedLanes: contractLanesFor(invariantEntry),
        expectedProofType: typeof invariantEntry.proof_type === 'string' ? invariantEntry.proof_type : null,
        byId: evidenceIndex.byId,
        superseded: supersededIds,
        subjectShaPolicy,
      });
      if (problems.length > 0) {
        referencesEligible = false;
        for (const problem of problems) proofViolations.push(`${bundleId}: invariant ${id} — ${problem}`);
      }
    }

    const proofOk = seenReferences.size >= 1 && referencesEligible;

    if (statusOk && proofOk) {
      proven.push(id);
      continue;
    }

    if (waiverByInvariant.has(id)) {
      waived.push(id);
      continue;
    }

    unmet.push(id);

    // Never a generic error. Name the invariant, the unmet requirement, the
    // missing proof, and the missing waiver.
    const requirementParts = [];
    if (!statusOk) {
      requirementParts.push(
        `status is ${status === undefined ? 'absent' : `'${status}'`} (required: '${REQUIRED_INVARIANT_STATUS}')`,
      );
    }
    if (!proofOk) {
      const observed = Array.isArray(invariantEntry.proof_artifacts)
        ? `${invariantEntry.proof_artifacts.length} entr${invariantEntry.proof_artifacts.length === 1 ? 'y' : 'ies'}, ${referencesEligible ? seenReferences.size : 0} eligible`
        : invariantEntry.proof_artifacts === undefined
          ? 'absent'
          : `not a list (${describeType(invariantEntry.proof_artifacts)})`;
      requirementParts.push(
        `proof_artifacts ${observed} (required: >= 1 entry resolving to an ACCEPTED evidence artifact bound to ${id})`,
      );
    }

    proofViolations.push(
      `${bundleId}: invariant ${id} blocks closure — unmet requirement: ${requirementParts.join('; ')}; missing proof: ${proofOk ? 'none' : `no eligible ACCEPTED evidence artifact for ${id}`}; missing waiver: no complete owner waiver for ${id} in invariant_waivers (a waiver requires ${WAIVER_REQUIRED_FIELDS.join(', ')})`,
    );
  }

  return {
    enforced: true,
    registered: true,
    structuralViolations,
    proofViolations,
    proven,
    waived,
    unmet,
    total: invariantIds.length,
  };
}

/**
 * Human-readable one-line summary of an evaluation, for gate output.
 */
export function summarizeInvariantClosure(result) {
  if (!result || !result.enforced) return '';
  return `${result.proven.length}/${result.total} invariants proven, ${result.waived.length} waived, ${result.unmet.length} unmet`;
}
