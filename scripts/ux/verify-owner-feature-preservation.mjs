#!/usr/bin/env node
/**
 * UX-00B — preservation CI gate.
 *
 * Compares the accepted, committed OWNER_FEATURE_PRESERVATION_BASELINE.json against a freshly
 * generated candidate from current source (via generate-owner-feature-baseline.mjs --stdout,
 * reused unchanged — this file adds no new extraction logic of its own). The accepted baseline is
 * never rewritten here; a real intentional preservation change is a separate, explicit, owner-
 * approved product-change PR that regenerates and re-commits the baseline itself (see
 * docs/opsiq/ux/PRESERVATION_CHANGE_PROCESS.md).
 *
 * Comparison direction (see the mission's "no-loss gate" framing):
 *  - Most protected sets are checked as BASELINE ⊆ CANDIDATE (an addition never fails the gate).
 *  - pageAccessGate, method-specific API capabilities, and hidden-for-safety navigation state are
 *    checked for exact equality in either direction — a security/access contract silently
 *    broadening is exactly as much a failure as it silently narrowing or disappearing.
 *
 * Run: node scripts/ux/verify-owner-feature-preservation.mjs
 * Exit 0 = PASS. Exit 1 = FAIL (structured findings printed to stderr, one line per finding).
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const BASELINE_PATH = path.join(ROOT, "docs/opsiq/ux/OWNER_FEATURE_PRESERVATION_BASELINE.json");
const GENERATOR_PATH = path.join(ROOT, "scripts/ux/generate-owner-feature-baseline.mjs");
const ACCEPTED_BASELINE_SHA = "646b06b97dee7283f5bf6db1d38027e843e3efbc";

function loadBaseline() {
  if (!fs.existsSync(BASELINE_PATH)) {
    console.error(`FATAL: accepted baseline not found at ${path.relative(ROOT, BASELINE_PATH)}`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8"));
}

function generateCandidate() {
  let stdout;
  try {
    stdout = execFileSync("node", [GENERATOR_PATH, "--stdout"], { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  } catch (e) {
    console.error("FATAL: candidate generation failed (the generator's own hard-fail invariants — route-method, capability, or mutation-coverage cross-validation — reject current source):");
    console.error(e.stdout ?? "");
    console.error(e.stderr ?? e.message);
    process.exit(1);
  }
  try {
    return JSON.parse(stdout);
  } catch (e) {
    console.error("FATAL: candidate generator did not produce valid JSON on stdout:", e.message);
    process.exit(1);
  }
}

// ── finding helpers ─────────────────────────────────────────────────────────
// Every check function below takes (baseline, candidate, add) and calls `add(type, lines)` on the
// findings array its caller owns — no shared module-level state, so runAllChecks (and each check
// individually) is a pure function of its inputs and is directly unit-testable with synthetic
// fixtures (see __tests__/verify-owner-feature-preservation.test.mjs).

function sortedEq(a, b) {
  const sa = [...(a ?? [])].sort();
  const sb = [...(b ?? [])].sort();
  return JSON.stringify(sa) === JSON.stringify(sb);
}

// ── individual protected-contract checks (A–P) ──────────────────────────────

function checkOwnerPages(baseline, candidate, add) {
  const candRoutes = new Set(candidate.ownerPageRoutes.map((p) => p.route));
  for (const p of baseline.ownerPageRoutes) {
    if (!candRoutes.has(p.route)) add("REMOVED_OWNER_PAGE", [p.route]);
  }
}

function checkOwnerApiRoutesAndMethods(baseline, candidate, add) {
  const candByPath = new Map(candidate.ownerApiRoutes.map((r) => [r.path, r]));
  for (const r of baseline.ownerApiRoutes) {
    const cand = candByPath.get(r.path);
    if (!cand) {
      add("REMOVED_OWNER_API_ROUTE", [r.path]);
      continue;
    }
    for (const m of r.httpMethods) {
      if (m === "NOT_VERIFIED") continue;
      if (!cand.httpMethods.includes(m)) add("REMOVED_API_METHOD", [`${m} ${r.path}`]);
    }
  }
}

/** Method-specific capability map aggregated from every page's apiCapabilityRequirements — the
 * only place the baseline records capability per (method, endpoint), since ownerApiRoutes[].
 * capability is a whole-file union, not method-scoped (see the generator's own comment on it). */
function buildCapabilityMap(pageRoutes) {
  const map = new Map();
  for (const page of pageRoutes) {
    for (const req of page.apiCapabilityRequirements ?? []) {
      const key = `${req.method} ${req.endpoint}`;
      if (!map.has(key)) map.set(key, req.capabilities);
    }
  }
  return map;
}

function checkPageAccessGates(baseline, candidate, add) {
  const candByRoute = new Map(candidate.ownerPageRoutes.map((p) => [p.route, p]));
  for (const p of baseline.ownerPageRoutes) {
    const cand = candByRoute.get(p.route);
    if (!cand) continue; // already reported by checkOwnerPages
    const before = JSON.stringify(p.pageAccessGate);
    const after = JSON.stringify(cand.pageAccessGate);
    if (before !== after) add("PAGE_ACCESS_GATE_CHANGED", [p.route, `baseline: ${before}`, `candidate: ${after}`]);
  }
}

function checkApiCapabilities(baseline, candidate, add) {
  const baseMap = buildCapabilityMap(baseline.ownerPageRoutes);
  const candMap = buildCapabilityMap(candidate.ownerPageRoutes);
  for (const [key, caps] of baseMap) {
    const candCaps = candMap.get(key);
    if (candCaps === undefined) continue; // endpoint no longer called by any page — covered by REMOVED_ACTION/page checks
    if (!sortedEq(caps, candCaps)) {
      add("CAPABILITY_CHANGED", [key, `baseline: ${JSON.stringify(caps)}`, `candidate: ${JSON.stringify(candCaps)}`]);
    }
  }
}

/** Uses the baseline's OWN hiddenSafetyRoutes list as source of truth (not a hardcoded route
 * list), per the mission's explicit instruction to prefer that over hardcoding. */
function checkHiddenForSafety(baseline, candidate, add) {
  const candByRoute = new Map(candidate.ownerPageRoutes.map((p) => [p.route, p]));
  for (const hr of baseline.hiddenSafetyRoutes) {
    const baselinePage = baseline.ownerPageRoutes.find((p) => p.route === hr.route);
    const baselineState = baselinePage?.navigationState ?? "HIDDEN_FOR_SAFETY_NO_NAV_ENTRY";
    const candPage = candByRoute.get(hr.route);
    const candState = candPage?.navigationState;
    if (candState !== baselineState) {
      add("SAFETY_VISIBILITY_CHANGED", [hr.route, `baseline: ${baselineState}`, `candidate: ${candState ?? "ROUTE_REMOVED"}`]);
    }
  }
  // Also protect any OTHER page whose baseline state was already hidden-for-safety even if it
  // isn't its own hiddenSafetyRoutes[] entry (e.g. /owner/risks/[id] inherits its parent's reason).
  for (const p of baseline.ownerPageRoutes) {
    if (p.navigationState !== "HIDDEN_FOR_SAFETY_NO_NAV_ENTRY") continue;
    const cand = candByRoute.get(p.route);
    if (cand && cand.navigationState !== "HIDDEN_FOR_SAFETY_NO_NAV_ENTRY") {
      add("SAFETY_VISIBILITY_CHANGED", [p.route, `baseline: HIDDEN_FOR_SAFETY_NO_NAV_ENTRY`, `candidate: ${cand.navigationState}`]);
    }
  }
}

function checkOwnerNowViewFields(baseline, candidate, add) {
  const candSet = new Set(candidate.ownerNowViewFields);
  for (const f of baseline.ownerNowViewFields) if (!candSet.has(f)) add("REMOVED_OWNERNOWVIEW_FIELD", [f]);
}

function checkOwnerNowViewCoreFields(baseline, candidate, add) {
  const candSet = new Set(candidate.ownerNowViewCoreFields);
  for (const f of baseline.ownerNowViewCoreFields) if (!candSet.has(f)) add("REMOVED_OWNERNOWVIEW_CORE_FIELD", [f]);
}

function checkPageMajorActions(baseline, candidate, add) {
  const candByRoute = new Map(candidate.ownerPageRoutes.map((p) => [p.route, p]));
  for (const p of baseline.ownerPageRoutes) {
    const cand = candByRoute.get(p.route);
    if (!cand) continue; // already reported by checkOwnerPages
    const candActions = new Set(cand.majorActions.map((a) => `${a.method} ${a.endpoint}`));
    for (const a of p.majorActions) {
      const key = `${a.method} ${a.endpoint}`;
      if (!candActions.has(key)) add("REMOVED_ACTION", [p.route, key]);
    }
  }
}

function checkOwnerActionFamilies(baseline, candidate, add) {
  const candFamilies = new Map(candidate.ownerActions.map((f) => [f.family, f]));
  for (const f of baseline.ownerActions) {
    if (!candFamilies.has(f.family)) add("REMOVED_ACTION_FAMILY", [f.family]);
  }
}

function checkWorkflowStates(baseline, candidate, add) {
  const candFamilies = new Map(candidate.workflowStateFamilies.map((f) => [f.family, f]));
  for (const f of baseline.workflowStateFamilies) {
    const cand = candFamilies.get(f.family);
    if (!cand) {
      for (const s of f.states) for (const v of s.values) add("REMOVED_WORKFLOW_STATE", [f.family, v]);
      continue;
    }
    const candValues = new Set(cand.states.flatMap((s) => s.values));
    for (const s of f.states) {
      for (const v of s.values) {
        if (!candValues.has(v)) add("REMOVED_WORKFLOW_STATE", [f.family, v]);
      }
    }
  }
}

function checkProcessExecutionCommands(baseline, candidate, add) {
  const baseFam = baseline.ownerActions.find((f) => f.family === "process_execution");
  const candFam = candidate.ownerActions.find((f) => f.family === "process_execution");
  if (!baseFam) return;
  const candValues = new Set((candFam?.commands ?? []).flatMap((c) => c.values));
  for (const c of baseFam.commands) {
    for (const v of c.values) {
      if (!candValues.has(v)) add("REMOVED_PROCESS_EXECUTION_COMMAND", [v]);
    }
  }
}

function checkNonWorkflowMutations(baseline, candidate, add) {
  const candFamilies = new Map((candidate.nonWorkflowMutationFamilies ?? []).map((f) => [f.family, f]));
  for (const f of baseline.nonWorkflowMutationFamilies ?? []) {
    const cand = candFamilies.get(f.family);
    const candKeys = new Set((cand?.mutationEndpoints ?? []).flatMap((m) => m.methods.map((meth) => `${meth} ${m.path}`)));
    for (const m of f.mutationEndpoints) {
      for (const meth of m.methods) {
        const key = `${meth} ${m.path}`;
        if (!candKeys.has(key)) add("REMOVED_NON_WORKFLOW_MUTATION", [f.family, key]);
      }
    }
  }
}

function checkCockpitDependencies(baseline, candidate, add) {
  const candByKey = new Map(candidate.cockpitExternalFeeds.map((f) => [`${f.method} ${f.endpoint}`, f]));
  for (const f of baseline.cockpitExternalFeeds) {
    const key = `${f.method} ${f.endpoint}`;
    const cand = candByKey.get(key);
    if (!cand) {
      add("REMOVED_COCKPIT_DEPENDENCY", [key]);
      continue;
    }
    if (f.responseUsage === "FIELDS") {
      const candFields = new Set(cand.fieldsConsumed ?? []);
      for (const field of f.fieldsConsumed ?? []) {
        if (!candFields.has(field)) add("COCKPIT_FIELD_REMOVED", [key, field]);
      }
    }
  }
}

// ── main ─────────────────────────────────────────────────────────────────────

/** Pure: runs every protected-contract check against the two supplied POJOs and returns the
 * findings array. No file I/O, no process exit — this is what __tests__/ exercises directly with
 * small synthetic fixtures instead of the real ~5000-line baseline. */
export function runAllChecks(baseline, candidate) {
  const findings = [];
  const add = (type, lines) => findings.push({ type, lines });

  checkOwnerPages(baseline, candidate, add);
  checkOwnerApiRoutesAndMethods(baseline, candidate, add);
  checkPageAccessGates(baseline, candidate, add);
  checkApiCapabilities(baseline, candidate, add);
  checkHiddenForSafety(baseline, candidate, add);
  checkOwnerNowViewFields(baseline, candidate, add);
  checkOwnerNowViewCoreFields(baseline, candidate, add);
  checkPageMajorActions(baseline, candidate, add);
  checkOwnerActionFamilies(baseline, candidate, add);
  checkWorkflowStates(baseline, candidate, add);
  checkProcessExecutionCommands(baseline, candidate, add);
  checkNonWorkflowMutations(baseline, candidate, add);
  checkCockpitDependencies(baseline, candidate, add);

  return findings;
}

function main() {
  const baseline = loadBaseline();

  if (baseline.baselineSha !== ACCEPTED_BASELINE_SHA) {
    console.error(`FATAL: committed baseline's baselineSha (${baseline.baselineSha}) does not match the accepted SHA (${ACCEPTED_BASELINE_SHA}).`);
    console.error("The accepted UX-00A preservation baseline must not be silently replaced. If this is an intentional, owner-approved baseline update, that is a separate explicit product-change PR — not something this verifier does.");
    process.exit(1);
  }

  const candidate = generateCandidate();
  const findings = runAllChecks(baseline, candidate);

  if (findings.length === 0) {
    console.log(`PASS — candidate generated from current source preserves everything in the accepted baseline (${ACCEPTED_BASELINE_SHA}).`);
    process.exit(0);
  }

  console.error(`FAIL — ${findings.length} preservation violation(s) found against baseline ${ACCEPTED_BASELINE_SHA}:\n`);
  for (const f of findings) {
    console.error(`${f.type}:`);
    for (const line of f.lines) console.error(`  ${line}`);
    console.error("");
  }
  console.error(
    "If this is an intentional, owner-approved product change (feature migration, removal, or capability change), see docs/opsiq/ux/PRESERVATION_CHANGE_PROCESS.md — the accepted baseline is updated only in that same explicit product-change PR, never automatically by this verifier."
  );
  process.exit(1);
}

// Only run when executed directly (`node verify-owner-feature-preservation.mjs`), not when
// imported by the test file for runAllChecks — importing this module must never itself load the
// real baseline, shell out to the generator, or call process.exit.
if (import.meta.url === `file://${process.argv[1]}`) main();
