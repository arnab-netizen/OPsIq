/**
 * D-4 / A4 governance resolver — S7-I11 environment target enforcement.
 *
 * Reads factory-stage-7-closure.yaml YAML content and resolves whether owner
 * decision D-4 has named a concrete isolated environment target for S7-I11.
 * Until D-4 is made and amendment A4 is applied to the contract, no S7-I11
 * evidence is accepted.
 *
 * Pure, I/O-free function. Callers inject the YAML content so it is testable
 * without git access. Production callers fetch from origin/main. Test callers
 * pass fixture strings.
 *
 * Threat model:
 *   - Caller cannot inject a target. Target is extracted from governance contract
 *     YAML only — there is no parameter for the caller to supply a target value.
 *   - Generic purpose labels ('isolated_simulation', 'staging_or_isolated_simulation')
 *     are rejected: they name a purpose category, not a concrete authorized target.
 *   - The caller may supply any YAML content as the manifest, but only content that
 *     carries a non-deferred A4 and a non-generic s7_i11_environment_target resolves OK.
 */

/**
 * Generic purpose labels that do not constitute a concrete environment target.
 * These describe categories or purposes, not specific infrastructure targets.
 * D-4 must name something that is NOT in this list.
 */
export const GENERIC_ENVIRONMENT_LABELS = Object.freeze([
  'isolated_simulation',
  'staging_or_isolated_simulation',
]);

/**
 * Structured reasons returned when D-4 resolution fails.
 */
export const D4_REJECTION_REASONS = Object.freeze({
  MANIFEST_UNREADABLE: 'MANIFEST_UNREADABLE',
  D4_NOT_YET_DECIDED: 'D4_NOT_YET_DECIDED',
  TARGET_ABSENT:       'TARGET_ABSENT',
  TARGET_IS_GENERIC:   'TARGET_IS_GENERIC',
});

/**
 * Check whether amendment A4 is still listed in deferred_amendments.
 * A4 in deferred_amendments means owner decision D-4 has NOT been made.
 *
 * When A4 is applied (D-4 decided), A4 moves from deferred_amendments to
 * amendments and s7_i11_environment_target is populated. At that point this
 * check returns false and the target check proceeds.
 *
 * @param {string} manifestYaml
 * @returns {boolean} true if A4 is still deferred
 */
function isA4Deferred(manifestYaml) {
  // Extract only the deferred_amendments block: the content between
  // 'deferred_amendments:' and the next top-level YAML key (a line
  // starting with a non-space character). A4 in the sibling 'amendments:'
  // section must NOT be matched — that signals A4 has been applied.
  const match = /deferred_amendments:([\s\S]*?)(?:\n(?=[a-zA-Z_#])|\s*$)/.exec(manifestYaml);
  if (!match) return false;
  return /\bid:\s*A4\b/.test(match[1]);
}

/**
 * Extract the s7_i11_environment_target field value from the manifest.
 * Only non-commented lines are matched.
 *
 * @param {string} manifestYaml
 * @returns {string | null}
 */
function extractEnvironmentTarget(manifestYaml) {
  // Match non-commented lines: line must start with optional whitespace then the field name.
  const match = /^\s*s7_i11_environment_target:\s*["']?([^\s"'#\n]+)["']?\s*(?:#.*)?$/m.exec(manifestYaml);
  if (!match) return null;
  const value = match[1].trim();
  return value.length > 0 ? value : null;
}

/**
 * Resolve the D-4 authorized isolated environment target for S7-I11.
 *
 * Call this before building or accepting any S7-I11 evidence artifact.
 * The function is entirely determined by the manifest content — the caller
 * cannot supply a target value directly.
 *
 * @param {object} opts
 * @param {string | null | undefined} opts.manifestYaml
 *   Raw YAML content of factory-stage-7-closure.yaml.
 *   Production callers fetch this from origin/main (not the working tree).
 *   Test callers pass fixture strings.
 * @returns {{ ok: true, target: string } | { ok: false, reason: string, detail: string }}
 */
export function resolveD4GovernanceTarget({ manifestYaml }) {
  if (typeof manifestYaml !== 'string' || manifestYaml.trim().length === 0) {
    return {
      ok: false,
      reason: D4_REJECTION_REASONS.MANIFEST_UNREADABLE,
      detail:
        'factory-stage-7-closure.yaml content is empty or not provided. ' +
        'The caller must supply the manifest YAML fetched from origin/main. ' +
        'Passing no manifest is not equivalent to a resolved D-4.',
    };
  }

  if (isA4Deferred(manifestYaml)) {
    return {
      ok: false,
      reason: D4_REJECTION_REASONS.D4_NOT_YET_DECIDED,
      detail:
        'Amendment A4 is still listed in deferred_amendments: owner decision D-4 has not been ' +
        'made. No S7-I11 evidence is accepted until D-4 is recorded and A4 is applied to ' +
        'factory-stage-7-closure.yaml by removing A4 from deferred_amendments and adding a ' +
        'concrete s7_i11_environment_target field.',
    };
  }

  const target = extractEnvironmentTarget(manifestYaml);
  if (target === null) {
    return {
      ok: false,
      reason: D4_REJECTION_REASONS.TARGET_ABSENT,
      detail:
        'Amendment A4 is not in deferred_amendments, but s7_i11_environment_target is absent ' +
        'from the contract. When A4 is applied, it must add a concrete s7_i11_environment_target ' +
        'field naming the specific isolated environment authorized for S7-I11 evidence capture.',
    };
  }

  if (GENERIC_ENVIRONMENT_LABELS.includes(target)) {
    return {
      ok: false,
      reason: D4_REJECTION_REASONS.TARGET_IS_GENERIC,
      detail:
        `s7_i11_environment_target '${target}' is a generic purpose label, not a concrete ` +
        `authorized environment target. D-4 must name a specific isolated environment (e.g. ` +
        `'ci' for GitHub Actions CI, or a custom identifier) rather than reusing a purpose ` +
        `category label. The label 'staging_or_isolated_simulation' in environment_model names ` +
        `a purpose, not a target — that is exactly what A4 was opened to fix.`,
    };
  }

  return { ok: true, target };
}
