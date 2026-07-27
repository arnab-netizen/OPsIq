#!/usr/bin/env node
/**
 * Completion Factory — Bundle Manifest Validator
 *
 * Validates that:
 *  1. Every bundle YAML in docs/opsiq/bundles/ is syntactically valid
 *  2. Every CLOSED bundle has full post_merge_evidence (no null fields)
 *  3. Every PENDING bundle has null post_merge_evidence (no stale SHAs)
 *  4. The REMAINING_STAGE_ACCEPTANCE.yaml ledger is consistent with all bundle files
 *  5. No bundle is marked CLOSED without post_merge_evidence
 *  6. Dependency ordering is respected (no CLOSED bundle depends on PENDING)
 *
 * Exit codes:
 *   0 — all checks pass
 *   1 — one or more violations (blocking)
 */

import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { load as yamlLoad } from 'js-yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const bundlesDir = join(root, 'docs', 'opsiq', 'bundles');
const ledgerPath = join(root, 'docs', 'opsiq', 'status', 'REMAINING_STAGE_ACCEPTANCE.yaml');

let violations = 0;

function fail(message) {
  console.error(`VIOLATION: ${message}`);
  violations++;
}

function warn(message) {
  console.warn(`WARN: ${message}`);
}

function loadYaml(filePath) {
  return yamlLoad(readFileSync(filePath, 'utf8'));
}

// ─── Load and validate each bundle manifest ───────────────────────────────────

const bundleFiles = readdirSync(bundlesDir)
  .filter(f => f.endsWith('.yaml'))
  .sort();

const bundles = {};

for (const file of bundleFiles) {
  const path = join(bundlesDir, file);
  let parsed;
  try {
    parsed = loadYaml(path);
  } catch (e) {
    fail(`Cannot parse ${file}: ${e.message}`);
    continue;
  }

  const id = parsed.id;
  const status = parsed.status;
  const evidence = parsed.post_merge_evidence || {};

  if (!id) {
    fail(`${file}: missing required field 'id'`);
    continue;
  }
  if (!status) {
    fail(`${file}: missing required field 'status'`);
    continue;
  }
  if (!['PENDING', 'IN_PROGRESS', 'CLOSED'].includes(status)) {
    fail(`${file}: unknown status '${status}' (must be PENDING | IN_PROGRESS | CLOSED)`);
  }

  // factory_stage_closure is a distinct artifact type for Factory Stage closure contracts.
  // It lives in the bundles directory but has different evidence requirements.
  const VALID_ARTIFACT_TYPES = ['development_bundle', 'infrastructure_component', 'factory_stage_closure'];
  if (!parsed.artifact_type) {
    fail(`${file}: missing required field 'artifact_type' (must be: ${VALID_ARTIFACT_TYPES.join(' | ')})`);
  } else if (!VALID_ARTIFACT_TYPES.includes(parsed.artifact_type)) {
    fail(`${file}: unknown artifact_type '${parsed.artifact_type}' (must be: ${VALID_ARTIFACT_TYPES.join(' | ')})`);
  } else if (parsed.artifact_type !== 'development_bundle' && parsed.artifact_type !== 'factory_stage_closure') {
    fail(`${file}: bundle manifest artifact_type must be 'development_bundle' or 'factory_stage_closure', got '${parsed.artifact_type}'`);
  }

  if (status === 'CLOSED') {
    const required = ['pr_sha', 'merge_sha', 'main_integration_run', 'db_verification_run'];
    // factory_stage_closure uses required_evidence instead of post_merge_evidence when CLOSED
    const evidenceObj = parsed.artifact_type === 'factory_stage_closure'
      ? (parsed.required_evidence || {})
      : evidence;
    for (const field of required) {
      if (evidenceObj[field] == null) {
        fail(`${file}: status=CLOSED but evidence.${field} is null or missing`);
      }
    }
  }

  if (status === 'PENDING') {
    const fields = ['pr_sha', 'merge_sha', 'main_integration_run', 'db_verification_run'];
    // factory_stage_closure PENDING is expected to have null required_evidence fields
    const evidenceObj = parsed.artifact_type === 'factory_stage_closure'
      ? (parsed.required_evidence || {})
      : evidence;
    for (const field of fields) {
      if (evidenceObj[field] != null) {
        fail(`${file}: status=PENDING but evidence.${field} is non-null — clear stale evidence or mark CLOSED`);
      }
    }
  }

  bundles[id] = { id, status, file, parsed };
  console.log(`  ✓ ${file}: id=${id} status=${status}`);
}

// ─── Load and validate the ledger ─────────────────────────────────────────────

let ledger;
try {
  ledger = loadYaml(ledgerPath);
} catch (e) {
  fail(`Cannot read REMAINING_STAGE_ACCEPTANCE.yaml: ${e.message}`);
  ledger = null;
}

if (ledger) {
  const stages = ledger.stages || {};
  for (const [, stageData] of Object.entries(stages)) {
    const ledgerBundles = Array.isArray(stageData.bundles) ? stageData.bundles : [];
    for (const lb of ledgerBundles) {
      if (!lb || !lb.id) continue;

      const bundleFile = bundles[lb.id];
      if (!bundleFile) {
        warn(`Ledger references bundle ${lb.id} but no matching bundle YAML found in docs/opsiq/bundles/`);
        continue;
      }

      // artifact_type on ledger bundle entries
      const VALID_LEDGER_ARTIFACT_TYPES = ['development_bundle', 'factory_stage_closure'];
      if (!lb.artifact_type) {
        fail(`Ledger/${lb.id}: missing required field 'artifact_type' (must be: ${VALID_LEDGER_ARTIFACT_TYPES.join(' | ')})`);
      } else if (!VALID_LEDGER_ARTIFACT_TYPES.includes(lb.artifact_type)) {
        fail(`Ledger/${lb.id}: bundle entry artifact_type must be 'development_bundle' or 'factory_stage_closure', got '${lb.artifact_type}'`);
      }

      // Status consistency
      if (lb.status !== bundleFile.status) {
        fail(`Ledger/${lb.id}: status '${lb.status}' contradicts bundle file status '${bundleFile.status}'`);
      }

      // CLOSED in ledger = must have full evidence in ledger too
      if (lb.status === 'CLOSED') {
        const le = lb.artifact_type === 'factory_stage_closure'
          ? (lb.required_evidence || {})
          : (lb.post_merge_evidence || {});
        const required = ['pr_sha', 'merge_sha', 'main_integration_run', 'db_verification_run'];
        for (const field of required) {
          if (le[field] == null) {
            fail(`Ledger/${lb.id}: status=CLOSED but ledger evidence.${field} is null`);
          }
        }
      }
    }
  }

  // ─── Validate completion_factory.components artifact_type ──────────────────
  const cf = ledger.completion_factory || {};
  const cfComponents = Array.isArray(cf.components) ? cf.components : [];
  for (const comp of cfComponents) {
    if (!comp || !comp.id) continue;
    if (!comp.artifact_type) {
      fail(`completion_factory/${comp.id}: missing required field 'artifact_type' (expected 'infrastructure_component')`);
    } else if (comp.artifact_type !== 'infrastructure_component') {
      fail(`completion_factory/${comp.id}: component artifact_type must be 'infrastructure_component', got '${comp.artifact_type}'`);
    } else {
      console.log(`  ✓ completion_factory/${comp.id}: artifact_type=${comp.artifact_type}`);
    }
  }

  // Every bundle in docs/opsiq/bundles/ must appear in the ledger
  for (const id of Object.keys(bundles)) {
    let found = false;
    for (const stageData of Object.values(stages)) {
      const ledgerBundles = Array.isArray(stageData.bundles) ? stageData.bundles : [];
      if (ledgerBundles.some(lb => lb && lb.id === id)) {
        found = true;
        break;
      }
    }
    if (!found) {
      fail(`Bundle ${id} exists in docs/opsiq/bundles/ but is NOT listed in REMAINING_STAGE_ACCEPTANCE.yaml`);
    }
  }
}

// ─── Dependency ordering check ────────────────────────────────────────────────

for (const [id, bundle] of Object.entries(bundles)) {
  const dep = bundle.parsed.dependencies;
  if (!dep) continue;

  const depList = Array.isArray(dep) ? dep : [dep];
  for (const depId of depList) {
    const depBundle = bundles[depId];
    if (!depBundle) {
      warn(`Bundle ${id} declares dependency '${depId}' but no such bundle manifest exists`);
      continue;
    }
    if (bundle.status === 'CLOSED' && depBundle.status !== 'CLOSED') {
      fail(`Bundle ${id} is CLOSED but its dependency ${depId} is ${depBundle.status} — dependency must be CLOSED first`);
    }
  }
}

// ─── Report ───────────────────────────────────────────────────────────────────

console.log('');
if (violations === 0) {
  console.log(`✅ Bundle manifest validation passed (${Object.keys(bundles).length} bundles, 0 violations)`);
  process.exit(0);
} else {
  console.error(`❌ Bundle manifest validation FAILED: ${violations} violation(s)`);
  process.exit(1);
}
