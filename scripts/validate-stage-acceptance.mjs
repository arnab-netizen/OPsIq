#!/usr/bin/env node
/**
 * Completion Factory — Stage Acceptance Gate
 *
 * Usage:
 *   node scripts/validate-stage-acceptance.mjs --stage 3 [--mode integrity|closure]
 *   node scripts/validate-stage-acceptance.mjs --stage all
 *
 * Modes:
 *   --mode integrity (default)
 *     Data-integrity gate. PENDING/IN_PROGRESS bundles are normal during development
 *     and pass (exit 0). Only CLOSED bundles with missing evidence fields fail (exit 1).
 *     Wire this to PR/main validation CI steps.
 *
 *   --mode closure
 *     Stage-closure gate. ALL bundles in the target stage must be CLOSED with full
 *     evidence. Any PENDING or IN_PROGRESS bundle fails (exit 1).
 *     Wire this to the explicit stage-closure authorization gate.
 *
 * Violations (exit 1 in both modes):
 *   - A CLOSED bundle has null post_merge_evidence fields (data integrity violation)
 *   - A bundle entry is missing artifact_type or has wrong value
 *   - A CLOSED bundle whose manifest declares closure condition 5 has an invariant
 *     that is neither PROVEN with proof nor covered by a complete owner waiver
 *     (see scripts/lib/invariant-closure.mjs)
 * Additional violation in closure mode only:
 *   - Any bundle that is not CLOSED
 *
 * Closure condition 5 is checked in BOTH modes on CLOSED bundles. Flipping a stage
 * closure manifest to CLOSED with the four metadata fields filled in, while its
 * invariants remain unproven, is a data-integrity violation — not merely a closure
 * concern — so integrity mode rejects it too. A passing integrity gate therefore
 * never permits, and must never be cited as, stage closure.
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { load as yamlLoad } from 'js-yaml';
import {
  REQUIRED_EVIDENCE_FIELDS,
  evaluateInvariantClosure,
  requiresInvariantProof,
  summarizeInvariantClosure,
} from './lib/invariant-closure.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const args = process.argv.slice(2);
const stageIdx = args.indexOf('--stage');

if (stageIdx === -1 || !args[stageIdx + 1]) {
  console.error('Usage: node validate-stage-acceptance.mjs --stage <N|all> [--mode integrity|closure] [--ledger <path>] [--bundles-dir <path>]');
  process.exit(2);
}

// --mode integrity (default) | closure
const modeIdx = args.indexOf('--mode');
const mode = (modeIdx !== -1 && args[modeIdx + 1]) ? args[modeIdx + 1] : 'integrity';
if (mode !== 'integrity' && mode !== 'closure') {
  console.error(`Invalid --mode value '${mode}'. Must be 'integrity' or 'closure'.`);
  process.exit(2);
}

const stageArg = args[stageIdx + 1];

// --ledger <path> overrides the default ledger path (used by non-vacuity tests)
const ledgerIdx = args.indexOf('--ledger');
const ledgerPath = (ledgerIdx !== -1 && args[ledgerIdx + 1])
  ? args[ledgerIdx + 1]
  : join(root, 'docs', 'opsiq', 'status', 'REMAINING_STAGE_ACCEPTANCE.yaml');

// --bundles-dir <path> overrides where stage-closure manifests are resolved from.
// Manifests carry the invariant block; the ledger does not.
const bundlesDirIdx = args.indexOf('--bundles-dir');
const bundlesDir = (bundlesDirIdx !== -1 && args[bundlesDirIdx + 1])
  ? args[bundlesDirIdx + 1]
  : join(root, 'docs', 'opsiq', 'bundles');

// --evidence-dir <path> overrides where proof_artifacts references are resolved
// from (G-1). Used by the hostile suite to drive a real artifact directory rather
// than mocking the resolution path. It cannot loosen any rule: an artifact in the
// supplied directory still has to satisfy every eligibility check.
const evidenceDirIdx = args.indexOf('--evidence-dir');
const evidenceDir = (evidenceDirIdx !== -1 && args[evidenceDirIdx + 1])
  ? args[evidenceDirIdx + 1]
  : join(root, 'docs', 'opsiq', 'evidence', 'stage-7', 'artifacts');

let ledger;
try {
  ledger = yamlLoad(readFileSync(ledgerPath, 'utf8'));
} catch (e) {
  console.error(`Cannot read ledger: ${e.message}`);
  process.exit(1);
}

const stages = ledger.stages || {};
let violations = 0;
let checked = 0;
// Bundles whose manifest declares closure condition 5 but which are not CLOSED.
// Reported at the end of integrity runs so a green integrity gate is never read
// as stage progress.
const unclosedInvariantContracts = [];

/**
 * Load a stage-closure manifest by bundle id.
 * @returns {{ manifest: object|null, error: string|null, missing: boolean }}
 */
function loadBundleManifest(bundleId) {
  const path = join(bundlesDir, `${bundleId}.yaml`);
  let raw;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    return { manifest: null, error: null, missing: true };
  }
  let parsed;
  try {
    parsed = yamlLoad(raw);
  } catch (e) {
    return { manifest: null, error: `${path}: ${e.message}`, missing: false };
  }
  // An empty file parses to undefined. Treat anything that is not a mapping as
  // unreadable rather than as "nothing to check".
  if (parsed === null || parsed === undefined) {
    return { manifest: null, error: `${path}: file is empty — no manifest to validate`, missing: false };
  }
  return { manifest: parsed, error: null, missing: false };
}

function checkStage(stageKey) {
  const stageData = stages[stageKey];
  if (!stageData) {
    console.error(`Stage '${stageKey}' not found in ledger`);
    violations++;
    return;
  }

  const bundles = Array.isArray(stageData.bundles) ? stageData.bundles : [];
  console.log(`\nChecking ${stageKey}: ${stageData.name || ''}`);

  for (const bundle of bundles) {
    if (!bundle || !bundle.id) continue;
    checked++;

    const { id, status, post_merge_evidence: evidence, required_evidence, artifact_type } = bundle;
    // factory_stage_closure uses required_evidence field; development_bundle uses post_merge_evidence
    const effectiveEvidence = artifact_type === 'factory_stage_closure' ? required_evidence : evidence;

    // artifact_type is required on every ledger bundle entry
    const VALID_ARTIFACT_TYPES = ['development_bundle', 'factory_stage_closure'];
    if (!artifact_type) {
      console.error(`  ❌ ${id}: missing required field 'artifact_type' (must be: ${VALID_ARTIFACT_TYPES.join(' | ')})`);
      violations++;
    } else if (!VALID_ARTIFACT_TYPES.includes(artifact_type)) {
      console.error(`  ❌ ${id}: artifact_type must be 'development_bundle' or 'factory_stage_closure', got '${artifact_type}'`);
      violations++;
    }

    // Stage-closure manifests carry the invariant block that condition 5 governs.
    // The ledger does not, so it is loaded here for both CLOSED evaluation and the
    // integrity-mode non-progress notice below.
    // Load the manifest when the ledger says this is a stage closure OR when the
    // validator-owned registry governs this bundle id. Keying solely off the
    // ledger's artifact_type would let a ledger edit (reclassifying the bundle as
    // a development_bundle with post_merge_evidence) skip invariant evaluation.
    const isStageClosure = artifact_type === 'factory_stage_closure';
    const isGoverned = requiresInvariantProof(id);
    const { manifest, error: manifestError, missing: manifestMissing } = (isStageClosure || isGoverned)
      ? loadBundleManifest(id)
      : { manifest: null, error: null, missing: true };

    if (manifestError) {
      console.error(`  ❌ ${id}: cannot parse stage-closure manifest — ${manifestError}`);
      violations++;
    }

    // Structural enforcement — evaluated at EVERY status, not just CLOSED. The
    // validator, not the manifest, decides whether a contract is governed; a
    // contract that has dropped its enforcement declaration or altered the
    // canonical invariant set must fail while it is still PENDING, rather than
    // being quietly disarmed now and closed later.
    let closure = null;
    if (manifest) {
      closure = evaluateInvariantClosure(manifest, { bundleId: id, evidenceDir });
      for (const violation of closure.structuralViolations) {
        console.error(`  ❌ ${violation}`);
        violations++;
      }
    }

    // A governed contract whose manifest could not be read is unverifiable. Fail
    // closed at any status: this check reads the registry, never the manifest.
    if (manifestMissing && isGoverned) {
      console.error(
        `  ❌ ${id}: governed by closure condition 5 but no manifest found at ${join(bundlesDir, `${id}.yaml`)} — the canonical invariant set cannot be verified`,
      );
      violations++;
    }

    if (status === 'CLOSED') {
      const required = REQUIRED_EVIDENCE_FIELDS;
      let evidenceMissing = false;
      for (const field of required) {
        if (!effectiveEvidence || effectiveEvidence[field] == null) {
          console.error(`  ❌ ${id}: CLOSED but evidence.${field} is null — data integrity violation`);
          violations++;
          evidenceMissing = true;
        }
      }

      // Closure condition 5 — invariant-level proof or explicit owner waiver.
      // The four fields above prove only that a PR merged and CI ran; they prove
      // nothing about the stage itself.
      let invariantsUnmet = closure ? closure.structuralViolations.length > 0 : false;
      if (isStageClosure && manifestMissing) {
        console.error(
          `  ❌ ${id}: CLOSED factory_stage_closure but no manifest found at ${join(bundlesDir, `${id}.yaml`)} — the invariant block that closure condition 5 governs cannot be read`,
        );
        violations++;
        invariantsUnmet = true;
      } else if (closure && closure.enforced) {
        for (const violation of closure.proofViolations) {
          console.error(`  ❌ ${violation}`);
          violations++;
        }
        if (closure.proofViolations.length > 0) {
          invariantsUnmet = true;
        } else if (!invariantsUnmet) {
          console.log(`  ✓ ${id}: closure condition 5 satisfied — ${summarizeInvariantClosure(closure)}`);
        }
      }

      if (!evidenceMissing && !invariantsUnmet) {
        const sha = String((effectiveEvidence || {}).merge_sha || '').slice(0, 12);
        console.log(`  ✓ ${id}: CLOSED — merge_sha=${sha}`);
      }
    } else {
      // Keyed off the registry, not off anything the manifest declares, so the
      // notice cannot be silenced by editing the contract.
      if (requiresInvariantProof(id)) {
        unclosedInvariantContracts.push({
          id,
          status,
          summary: closure && closure.enforced
            ? summarizeInvariantClosure(closure)
            : 'invariant state unreadable',
        });
      }
      if (mode === 'closure') {
        // Closure gate: every bundle must be CLOSED
        console.error(`  ❌ ${id}: status=${status} — closure mode requires all bundles CLOSED`);
        violations++;
      } else {
        // Integrity gate: PENDING or IN_PROGRESS is expected during development
        console.log(`  · ${id}: status=${status} (not yet closed)`);
      }
    }
  }
}

if (stageArg === 'all') {
  for (const key of Object.keys(stages)) {
    checkStage(key);
  }
} else if (stageArg === 'factory-5') {
  checkStage('factory-stage-5');
} else if (stageArg === 'factory-6') {
  checkStage('factory-stage-6');
} else if (stageArg === 'factory-7') {
  checkStage('factory-stage-7');
} else {
  checkStage(`stage-${stageArg}`);
}

console.log('');
const modeLabel = mode === 'closure' ? 'closure' : 'integrity';

// A passing integrity gate must never be readable as stage closure. Say so
// explicitly, and name every stage that still has unmet invariant proof.
if (mode === 'integrity' && unclosedInvariantContracts.length > 0) {
  console.log('Not closed — closure condition 5 (invariant proof) still outstanding:');
  for (const entry of unclosedInvariantContracts) {
    console.log(`  · ${entry.id}: status=${entry.status}, ${entry.summary}`);
  }
  console.log('An integrity pass checks data consistency only. It is NOT stage progress');
  console.log('and must not be cited as closure evidence. Stage closure requires');
  console.log('--mode closure and every invariant PROVEN with proof, or explicitly waived.');
  console.log('');
}

if (violations === 0) {
  console.log(`✅ Stage acceptance ${modeLabel} passed (${checked} bundles, 0 violations)`);
  process.exit(0);
} else {
  console.error(`❌ Stage acceptance ${modeLabel} FAILED: ${violations} violation(s) across ${checked} bundles`);
  process.exit(1);
}
