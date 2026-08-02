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
 * ─── Opt-in is declared by the contract, not hardcoded here ──────────────────
 * A manifest is subject to invariant-proof enforcement if and only if it declares
 * `closure_conditions.5_invariant_proof`. This is deliberate:
 *
 *   - factory-stage-7-closure.yaml declares it (frozen in PR-1A) → enforced.
 *   - factory-stage-6-closure.yaml does not declare it, and its invariants use
 *     LANE_A_PROVEN / LANE_B_PROVEN statuses rather than PROVEN → untouched.
 *   - factory-stage-5-closure.yaml does not declare it, and its invariants are
 *     free-text strings rather than structured entries → untouched.
 *
 * Keying off the contract rather than off a stage number means Stage 6 behaviour
 * is unchanged by construction, and a future stage opts in by freezing the same
 * condition into its own manifest — not by editing this file.
 *
 * ─── The rule ────────────────────────────────────────────────────────────────
 * Every invariant in an enforced manifest must satisfy one of:
 *   (a) status === 'PROVEN' AND proof_artifacts contains >= 1 non-empty entry, or
 *   (b) a complete owner waiver naming that invariant exists in invariant_waivers.
 *
 * A waiver is never a default and is never implied by silence. An incomplete
 * waiver is not a waiver: it is reported as a violation and does not satisfy (b).
 */

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

/** Manifest key that opts a closure contract into invariant-proof enforcement. */
export const CLOSURE_CONDITION_5_KEY = '5_invariant_proof';

/** The only invariant status that satisfies condition 5 without a waiver. */
export const REQUIRED_INVARIANT_STATUS = 'PROVEN';

/**
 * Fields every owner waiver must carry.
 *
 * The frozen contract requires the invariant, the owner, the date and the reason.
 * `acknowledgement` is additionally required so that a waiver cannot be recorded
 * without an explicit, written owner acknowledgement of what is being waived.
 * Stricter than the contract text, so it can never admit a waiver the contract
 * would reject.
 */
export const WAIVER_REQUIRED_FIELDS = Object.freeze([
  'invariant',
  'owner',
  'reason',
  'date',
  'acknowledgement',
]);

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
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

/**
 * True when `manifest` opts into invariant-proof enforcement by declaring the
 * fifth closure condition.
 */
export function declaresInvariantProofCondition(manifest) {
  if (!isPlainObject(manifest)) return false;
  const conditions = manifest.closure_conditions;
  if (!isPlainObject(conditions)) return false;
  return Object.prototype.hasOwnProperty.call(conditions, CLOSURE_CONDITION_5_KEY);
}

/**
 * Count proof artifacts that actually constitute proof. Entries that are empty,
 * whitespace-only, or not strings do not count — an empty string in the list is
 * not evidence.
 */
function countUsableProofArtifacts(proofArtifacts) {
  if (!Array.isArray(proofArtifacts)) return 0;
  return proofArtifacts.filter(isNonEmptyString).length;
}

/**
 * Validate one waiver entry against Rule 2.
 *
 * @returns {{ valid: boolean, invariant: string|null, problems: string[] }}
 */
function validateWaiver(waiver, index, knownInvariantIds) {
  const problems = [];

  if (!isPlainObject(waiver)) {
    return {
      valid: false,
      invariant: null,
      problems: [
        `invariant_waivers[${index}] is not a waiver object (got ${Array.isArray(waiver) ? 'array' : typeof waiver}) — a waiver must be a mapping with fields: ${WAIVER_REQUIRED_FIELDS.join(', ')}`,
      ],
    };
  }

  const missing = WAIVER_REQUIRED_FIELDS.filter((field) => !isNonEmptyString(waiver[field]));
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
 * Evaluate closure condition 5 for a single stage-closure manifest.
 *
 * Pure: reads the parsed manifest only, performs no I/O.
 *
 * @param {object} manifest  Parsed bundle manifest YAML.
 * @param {{ bundleId?: string }} [options]
 * @returns {{
 *   enforced: boolean,          // did this manifest opt into condition 5?
 *   violations: string[],       // blocking messages, each naming the invariant
 *   proven: string[],           // invariant ids satisfied by proof
 *   waived: string[],           // invariant ids satisfied by a complete waiver
 *   unmet: string[],            // invariant ids satisfying neither
 *   total: number,              // invariants declared
 * }}
 */
export function evaluateInvariantClosure(manifest, options = {}) {
  const bundleId = options.bundleId || (isPlainObject(manifest) ? manifest.id : null) || 'unknown-bundle';
  const empty = { enforced: false, violations: [], proven: [], waived: [], unmet: [], total: 0 };

  if (!declaresInvariantProofCondition(manifest)) return empty;

  const violations = [];
  const invariants = manifest.invariants;

  if (!isPlainObject(invariants) || Object.keys(invariants).length === 0) {
    violations.push(
      `${bundleId}: declares closure condition '${CLOSURE_CONDITION_5_KEY}' but has no usable 'invariants' block — condition 5 cannot be satisfied and closure is blocked`,
    );
    return { enforced: true, violations, proven: [], waived: [], unmet: [], total: 0 };
  }

  const invariantIds = Object.keys(invariants).sort(compareInvariantIds);

  // ─── Rule 2: waivers must be complete and attributable ────────────────────
  const rawWaivers = manifest.invariant_waivers;
  const waiverByInvariant = new Map();

  if (rawWaivers != null && !Array.isArray(rawWaivers)) {
    violations.push(
      `${bundleId}: 'invariant_waivers' must be a list (got ${typeof rawWaivers}) — cannot evaluate owner waivers, closure blocked`,
    );
  } else {
    const waivers = Array.isArray(rawWaivers) ? rawWaivers : [];
    waivers.forEach((waiver, index) => {
      const result = validateWaiver(waiver, index, invariantIds);
      for (const problem of result.problems) {
        violations.push(`${bundleId}: ${problem}`);
      }
      if (!result.valid || !result.invariant) return;
      if (waiverByInvariant.has(result.invariant)) {
        violations.push(
          `${bundleId}: duplicate owner waiver for invariant ${result.invariant} at invariant_waivers[${index}] — record exactly one waiver per invariant`,
        );
        return;
      }
      waiverByInvariant.set(result.invariant, waiver);
    });
  }

  // ─── Rule 1 + Rule 3: every invariant proven, or explicitly waived ────────
  const proven = [];
  const waived = [];
  const unmet = [];

  for (const id of invariantIds) {
    const entry = invariants[id];

    if (!isPlainObject(entry)) {
      unmet.push(id);
      violations.push(
        `${bundleId}: invariant ${id} blocks closure — its entry is not a structured invariant (got ${Array.isArray(entry) ? 'list' : typeof entry}); required: a mapping carrying status: ${REQUIRED_INVARIANT_STATUS} and proof_artifacts; missing proof: entire entry; missing waiver: no complete owner waiver for ${id} in invariant_waivers`,
      );
      continue;
    }

    const status = entry.status;
    const artifactCount = countUsableProofArtifacts(entry.proof_artifacts);
    const statusOk = status === REQUIRED_INVARIANT_STATUS;
    const proofOk = artifactCount >= 1;

    if (statusOk && proofOk) {
      proven.push(id);
      continue;
    }

    if (waiverByInvariant.has(id)) {
      waived.push(id);
      continue;
    }

    unmet.push(id);

    // Rule 3: never a generic error. Name the invariant, the unmet requirement,
    // the missing proof, and the missing waiver.
    const requirementParts = [];
    if (!statusOk) {
      requirementParts.push(
        `status is ${status === undefined ? 'absent' : `'${status}'`} (required: '${REQUIRED_INVARIANT_STATUS}')`,
      );
    }
    if (!proofOk) {
      const observed = Array.isArray(entry.proof_artifacts)
        ? `${entry.proof_artifacts.length} entr${entry.proof_artifacts.length === 1 ? 'y' : 'ies'}, ${artifactCount} usable`
        : entry.proof_artifacts === undefined
          ? 'absent'
          : `not a list (${typeof entry.proof_artifacts})`;
      requirementParts.push(`proof_artifacts ${observed} (required: >= 1 non-empty entry)`);
    }

    violations.push(
      `${bundleId}: invariant ${id} blocks closure — unmet requirement: ${requirementParts.join('; ')}; missing proof: ${proofOk ? 'none' : `no usable proof_artifacts entry for ${id}`}; missing waiver: no complete owner waiver for ${id} in invariant_waivers (a waiver requires ${WAIVER_REQUIRED_FIELDS.join(', ')})`,
    );
  }

  return { enforced: true, violations, proven, waived, unmet, total: invariantIds.length };
}

/**
 * Human-readable one-line summary of an evaluation, for gate output.
 */
export function summarizeInvariantClosure(result) {
  if (!result || !result.enforced) return '';
  return `${result.proven.length}/${result.total} invariants proven, ${result.waived.length} waived, ${result.unmet.length} unmet`;
}
