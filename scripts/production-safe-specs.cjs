#!/usr/bin/env node
/**
 * Single fail-closed resolver for the LIVE Production acceptance lane.
 *
 * The lane runs ONLY the specs that tests/production/production-spec-manifest.json marks safeLane=true.
 * Playwright's own *.spec.ts discovery is never used. This module is consumed by:
 *   - playwright.production.config.ts  (testMatch)
 *   - .github/workflows/production-owner-acceptance.yml  (explicit file list: `node scripts/production-safe-specs.mjs`)
 *
 * It throws (CLI: exit 1, nothing on stdout) when ANY of these hold, so a new or mis-declared spec can never
 * reach Production silently:
 *   - a tests/production/*.spec.ts file is missing from the manifest (unclassified)
 *   - a manifest entry has no file on disk
 *   - a classification is not one of the five allowed values, or is UNKNOWN
 *   - safeLane=true on anything other than READ_ONLY_REAL_DATA / FIXTURE_ISOLATED_MUTATION / REVERSIBLE_REAL_DATA_MUTATION
 *   - a FIXTURE_ISOLATED_MUTATION spec with no fixtureMechanism
 *   - a REVERSIBLE_REAL_DATA_MUTATION spec with no rollback
 *   - a NON_FIXTURE_PERSISTENT_MUTATION / UNKNOWN spec that is safeLane=true, or an excluded spec with no exclusionReason
 *   - duplicate files, or no safe spec at all
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const PRODUCTION_TESTS_DIR = path.resolve(__dirname, "..", "tests", "production");
const MANIFEST_PATH = path.join(PRODUCTION_TESTS_DIR, "production-spec-manifest.json");

const CLASSIFICATIONS = [
  "READ_ONLY_REAL_DATA",
  "FIXTURE_ISOLATED_MUTATION",
  "REVERSIBLE_REAL_DATA_MUTATION",
  "NON_FIXTURE_PERSISTENT_MUTATION",
  "UNKNOWN",
];
const SAFE_CLASSIFICATIONS = new Set(["READ_ONLY_REAL_DATA", "FIXTURE_ISOLATED_MUTATION", "REVERSIBLE_REAL_DATA_MUTATION"]);

function listSpecFiles(dir = PRODUCTION_TESTS_DIR) {
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".spec.ts"))
    .sort();
}

function loadManifest(manifestPath = MANIFEST_PATH) {
  return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
}

/** Returns every violation as a string; empty means the manifest is a valid, complete classification. */
function validateManifest(manifest, onDisk) {
  const problems = [];
  if (!manifest || !Array.isArray(manifest.specs)) return ["manifest has no specs array"];
  const seen = new Set();
  for (const spec of manifest.specs) {
    const f = spec && spec.file;
    if (typeof f !== "string" || !f.endsWith(".spec.ts") || f.includes("/") || f.includes("..")) {
      problems.push(`invalid spec file entry: ${JSON.stringify(f)}`);
      continue;
    }
    if (seen.has(f)) problems.push(`${f}: duplicate manifest entry`);
    seen.add(f);
    if (!onDisk.includes(f)) problems.push(`${f}: listed in the manifest but not present in tests/production`);
    if (!CLASSIFICATIONS.includes(spec.classification)) {
      problems.push(`${f}: classification ${JSON.stringify(spec.classification)} is not one of ${CLASSIFICATIONS.join(", ")}`);
      continue;
    }
    if (typeof spec.safeLane !== "boolean") problems.push(`${f}: safeLane must be a boolean`);
    if (spec.safeLane === true && !SAFE_CLASSIFICATIONS.has(spec.classification)) {
      problems.push(`${f}: ${spec.classification} can never be in the safe lane`);
    }
    if (spec.safeLane === true && spec.classification === "FIXTURE_ISOLATED_MUTATION" && !spec.fixtureMechanism) {
      problems.push(`${f}: FIXTURE_ISOLATED_MUTATION requires a fixtureMechanism`);
    }
    if (spec.safeLane === true && spec.classification === "REVERSIBLE_REAL_DATA_MUTATION" && !spec.rollback) {
      problems.push(`${f}: REVERSIBLE_REAL_DATA_MUTATION requires a rollback`);
    }
    if (spec.safeLane === false && !spec.exclusionReason) problems.push(`${f}: excluded specs require an exclusionReason`);
  }
  for (const f of onDisk) {
    if (!seen.has(f)) problems.push(`${f}: present in tests/production but NOT classified in the manifest (unclassified specs fail closed)`);
  }
  if (!manifest.specs.some((s) => s && s.safeLane === true)) problems.push("the manifest has no safe spec");
  return problems;
}

/** The safe spec basenames, sorted. Throws with every problem if the manifest is not fully valid. */
function resolveSafeSpecs({ manifestPath = MANIFEST_PATH, dir = PRODUCTION_TESTS_DIR } = {}) {
  const manifest = loadManifest(manifestPath);
  const problems = validateManifest(manifest, listSpecFiles(dir));
  if (problems.length > 0) {
    throw new Error(`Production acceptance manifest is invalid (fail closed):\n  - ${problems.join("\n  - ")}`);
  }
  return manifest.specs
    .filter((s) => s.safeLane === true)
    .map((s) => s.file)
    .sort();
}

module.exports = { PRODUCTION_TESTS_DIR, MANIFEST_PATH, CLASSIFICATIONS, listSpecFiles, loadManifest, validateManifest, resolveSafeSpecs };

if (require.main === module) {
  try {
    for (const file of resolveSafeSpecs()) console.log(`tests/production/${file}`);
  } catch (error) {
    console.error(`✗ ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
