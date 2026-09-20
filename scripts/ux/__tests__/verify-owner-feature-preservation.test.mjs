#!/usr/bin/env node
/**
 * Synthetic, deterministic tests for the UX-00B preservation verifier and the generator's own
 * mutation-coverage invariant. Uses Node's built-in test runner (node:test/node:assert) — zero
 * external dependency, runnable with a bare `node`, no npm install required.
 *
 * Run: node --test scripts/ux/__tests__/verify-owner-feature-preservation.test.mjs
 *
 * Deliberately tiny, hand-built fixtures (NOT the real ~5000-line committed baseline) — each test
 * asserts one specific regression class is detected, with everything else held constant.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { runAllChecks } from "../verify-owner-feature-preservation.mjs";
import { validateMutationCoverage } from "../generate-owner-feature-baseline.mjs";

// ── minimal shared fixture builder ──────────────────────────────────────────
// A tiny but structurally complete baseline: one page, one API route, one owner-action family,
// one non-workflow family, one Cockpit dependency. Each test clones this and candidate-mutates
// exactly the field under test.

function makeBaseline() {
  return {
    baselineSha: "TEST_SHA",
    ownerPageRoutes: [
      {
        route: "/owner/finance",
        pageAccessGate: "OWNER_VIEW",
        navigationState: "IN_SIDEBAR",
        apiCapabilityRequirements: [{ endpoint: "/api/owner/finance/actions/:param", method: "PATCH", capabilities: ["OWNER_MANAGE"] }],
        majorActions: [{ endpoint: "/api/owner/finance/actions/:param", method: "PATCH" }],
        readApis: [{ method: "GET", path: "/api/owner/finance/dashboard" }],
        writeApis: [{ method: "PATCH", path: "/api/owner/finance/actions/:param" }],
      },
      {
        route: "/owner/risks",
        pageAccessGate: "OWNER_VIEW",
        navigationState: "HIDDEN_FOR_SAFETY_NO_NAV_ENTRY",
        apiCapabilityRequirements: [],
        majorActions: [],
        readApis: [],
        writeApis: [],
      },
    ],
    ownerApiRoutes: [
      { path: "/api/owner/finance/actions/[actionId]", httpMethods: ["GET", "PATCH"], capability: ["OWNER_MANAGE"] },
      { path: "/api/owner/finance/dashboard", httpMethods: ["GET"], capability: ["OWNER_VIEW"] },
    ],
    hiddenSafetyRoutes: [{ route: "/owner/risks", reason: "test" }],
    ownerNowViewFields: ["view", "topConstraint"],
    ownerNowViewCoreFields: ["businessId", "confidence"],
    ownerActions: [
      {
        family: "finance_actions",
        commands: [],
        workflowStatuses: [{ typeName: "RecoveryActionStatus", values: ["proposed", "blocked", "completed"] }],
        mutationEndpoints: [{ path: "/api/owner/finance/actions/[actionId]", methods: ["PATCH"] }],
      },
      {
        family: "process_execution",
        commands: [{ typeName: "ProcessExecutionAction", values: ["START", "APPROVE", "COMPLETE"] }],
        workflowStatuses: [],
        mutationEndpoints: [],
      },
    ],
    nonWorkflowMutationFamilies: [{ family: "feedback_submission", mutationEndpoints: [{ path: "/api/feedback", methods: ["POST"] }] }],
    workflowStateFamilies: [{ family: "finance_actions", states: [{ typeName: "RecoveryActionStatus", values: ["proposed", "blocked", "completed"] }] }],
    cockpitExternalFeeds: [{ endpoint: "/api/owner/recovery-status", method: "GET", responseUsage: "FIELDS", fieldsConsumed: ["recoveryStatus", "stabilizationGate"] }],
  };
}

function clone(o) {
  return JSON.parse(JSON.stringify(o));
}

function assertOnly(findings, type, count = 1) {
  const matching = findings.filter((f) => f.type === type);
  assert.equal(matching.length, count, `expected exactly ${count} ${type} finding(s), got ${matching.length}: ${JSON.stringify(findings)}`);
}

function assertNone(findings) {
  assert.deepEqual(findings, [], `expected zero findings, got: ${JSON.stringify(findings)}`);
}

// ── 0. sanity: identical baseline/candidate produces zero findings ─────────

test("identical baseline and candidate => no findings", () => {
  const baseline = makeBaseline();
  const candidate = clone(baseline);
  assertNone(runAllChecks(baseline, candidate));
});

test("candidate with an ADDED page/API/field never fails (subset comparison)", () => {
  const baseline = makeBaseline();
  const candidate = clone(baseline);
  candidate.ownerPageRoutes.push({ route: "/owner/new-page", pageAccessGate: "OWNER_VIEW", navigationState: "IN_SIDEBAR", apiCapabilityRequirements: [], majorActions: [] });
  candidate.ownerApiRoutes.push({ path: "/api/owner/new", httpMethods: ["GET"] });
  candidate.ownerNowViewFields.push("newField");
  assertNone(runAllChecks(baseline, candidate));
});

// ── 1. removed owner page ───────────────────────────────────────────────────

test("detects a removed owner page", () => {
  const baseline = makeBaseline();
  const candidate = clone(baseline);
  candidate.ownerPageRoutes = candidate.ownerPageRoutes.filter((p) => p.route !== "/owner/finance");
  const findings = runAllChecks(baseline, candidate);
  assertOnly(findings, "REMOVED_OWNER_PAGE");
  assert.deepEqual(findings.find((f) => f.type === "REMOVED_OWNER_PAGE").lines, ["/owner/finance"]);
});

// ── 2. removed API method ───────────────────────────────────────────────────

test("detects a removed HTTP method on a still-present route", () => {
  const baseline = makeBaseline();
  const candidate = clone(baseline);
  candidate.ownerApiRoutes[0].httpMethods = ["GET"]; // PATCH dropped
  const findings = runAllChecks(baseline, candidate);
  const removed = findings.filter((f) => f.type === "REMOVED_API_METHOD");
  assert.equal(removed.length, 1);
  assert.equal(removed[0].lines[0], "PATCH /api/owner/finance/actions/[actionId]");
});

// ── 3. changed API capability ────────────────────────────────────────────────

test("detects a changed method-specific API capability", () => {
  const baseline = makeBaseline();
  const candidate = clone(baseline);
  candidate.ownerPageRoutes[0].apiCapabilityRequirements[0].capabilities = []; // capability silently dropped
  const findings = runAllChecks(baseline, candidate);
  assertOnly(findings, "CAPABILITY_CHANGED");
});

test("detects a BROADENED API capability too (not just narrowed/removed)", () => {
  const baseline = makeBaseline();
  const candidate = clone(baseline);
  candidate.ownerPageRoutes[0].apiCapabilityRequirements[0].capabilities = ["OWNER_MANAGE", "SYSTEM_ADMIN"];
  const findings = runAllChecks(baseline, candidate);
  assertOnly(findings, "CAPABILITY_CHANGED");
});

// ── UX-00B.1: page-level read/write API dependency loss (A, B, C) ──────────

test("(A) detects a removed page READ API dependency", () => {
  const baseline = makeBaseline();
  const candidate = clone(baseline);
  candidate.ownerPageRoutes[0].readApis = []; // GET /api/owner/finance/dashboard dropped
  const findings = runAllChecks(baseline, candidate);
  assertOnly(findings, "REMOVED_PAGE_API_DEPENDENCY");
  assert.deepEqual(findings[0].lines, ["/owner/finance", "GET /api/owner/finance/dashboard"]);
});

test("(B) detects a removed page WRITE API dependency", () => {
  const baseline = makeBaseline();
  const candidate = clone(baseline);
  candidate.ownerPageRoutes[0].writeApis = []; // PATCH .../actions/:param dropped
  const findings = runAllChecks(baseline, candidate);
  const removed = findings.filter((f) => f.type === "REMOVED_PAGE_API_DEPENDENCY");
  assert.equal(removed.length, 1);
  assert.deepEqual(removed[0].lines, ["/owner/finance", "PATCH /api/owner/finance/actions/:param"]);
});

test("(C) a newly added page API dependency does not fail", () => {
  const baseline = makeBaseline();
  const candidate = clone(baseline);
  candidate.ownerPageRoutes[0].readApis.push({ method: "GET", path: "/api/owner/finance/new-widget" });
  candidate.ownerPageRoutes[0].writeApis.push({ method: "POST", path: "/api/owner/finance/new-widget" });
  assertNone(runAllChecks(baseline, candidate));
});

// ── UX-00B.1: whole-route owner API capability-set safety net (D, E) ───────

test("(D) detects a whole-route owner API capability-set removal", () => {
  const baseline = makeBaseline();
  const candidate = clone(baseline);
  candidate.ownerApiRoutes[0].capability = []; // OWNER_MANAGE dropped from the route file entirely
  const findings = runAllChecks(baseline, candidate);
  assertOnly(findings, "OWNER_API_CAPABILITY_SET_CHANGED");
  assert.equal(findings[0].lines[0], "/api/owner/finance/actions/[actionId]");
});

test("(E) detects a whole-route owner API capability-set change (incl. addition)", () => {
  const baseline = makeBaseline();
  const candidate = clone(baseline);
  candidate.ownerApiRoutes[1].capability = ["OWNER_VIEW", "SYSTEM_ADMIN"]; // silently broadened
  const findings = runAllChecks(baseline, candidate);
  assertOnly(findings, "OWNER_API_CAPABILITY_SET_CHANGED");
  assert.equal(findings[0].lines[0], "/api/owner/finance/dashboard");
});

// ── 4. hidden-for-safety route becoming visible ─────────────────────────────

test("detects a hidden-for-safety route becoming visible", () => {
  const baseline = makeBaseline();
  const candidate = clone(baseline);
  candidate.ownerPageRoutes.find((p) => p.route === "/owner/risks").navigationState = "IN_SIDEBAR";
  const findings = runAllChecks(baseline, candidate);
  // Both the hiddenSafetyRoutes-driven check and the generic "any HIDDEN_FOR_SAFETY page" check
  // fire on the same route — both are legitimate independent detections of the same real change.
  const changed = findings.filter((f) => f.type === "SAFETY_VISIBILITY_CHANGED");
  assert.ok(changed.length >= 1, "expected at least one SAFETY_VISIBILITY_CHANGED finding");
  assert.equal(changed[0].lines[0], "/owner/risks");
});

test("page access gate change is detected independently of hidden-safety state", () => {
  const baseline = makeBaseline();
  const candidate = clone(baseline);
  candidate.ownerPageRoutes[0].pageAccessGate = "AUTHENTICATED_SESSION_ONLY"; // silently broadened
  const findings = runAllChecks(baseline, candidate);
  assertOnly(findings, "PAGE_ACCESS_GATE_CHANGED");
});

// ── 5. removed OwnerNowView field ───────────────────────────────────────────

test("detects a removed OwnerNowViewPayload field", () => {
  const baseline = makeBaseline();
  const candidate = clone(baseline);
  candidate.ownerNowViewFields = ["view"]; // "topConstraint" dropped
  const findings = runAllChecks(baseline, candidate);
  assertOnly(findings, "REMOVED_OWNERNOWVIEW_FIELD");
  assert.deepEqual(findings[0].lines, ["topConstraint"]);
});

test("detects a removed core OwnerNowView field", () => {
  const baseline = makeBaseline();
  const candidate = clone(baseline);
  candidate.ownerNowViewCoreFields = ["businessId"]; // "confidence" dropped
  const findings = runAllChecks(baseline, candidate);
  assertOnly(findings, "REMOVED_OWNERNOWVIEW_CORE_FIELD");
});

// ── 6. removed page majorAction ─────────────────────────────────────────────

test("detects a removed page majorAction", () => {
  const baseline = makeBaseline();
  const candidate = clone(baseline);
  candidate.ownerPageRoutes[0].majorActions = [];
  const findings = runAllChecks(baseline, candidate);
  assertOnly(findings, "REMOVED_ACTION");
  assert.deepEqual(findings[0].lines, ["/owner/finance", "PATCH /api/owner/finance/actions/:param"]);
});

// ── 7. removed ProcessExecutionAction command ───────────────────────────────

test("detects a removed ProcessExecutionAction command", () => {
  const baseline = makeBaseline();
  const candidate = clone(baseline);
  candidate.ownerActions.find((f) => f.family === "process_execution").commands[0].values = ["START", "APPROVE"]; // "COMPLETE" dropped
  const findings = runAllChecks(baseline, candidate);
  assertOnly(findings, "REMOVED_PROCESS_EXECUTION_COMMAND");
  assert.deepEqual(findings[0].lines, ["COMPLETE"]);
});

test("detects an entire removed owner-action family", () => {
  const baseline = makeBaseline();
  const candidate = clone(baseline);
  candidate.ownerActions = candidate.ownerActions.filter((f) => f.family !== "finance_actions");
  const findings = runAllChecks(baseline, candidate);
  // Removing the whole family also removes its mutation endpoint and workflow state coverage —
  // all are legitimate, independent findings of the same underlying loss.
  assert.ok(findings.some((f) => f.type === "REMOVED_ACTION_FAMILY" && f.lines[0] === "finance_actions"));
});

// ── 8. removed shared/family workflow state ─────────────────────────────────

test("detects a removed workflow state value", () => {
  const baseline = makeBaseline();
  const candidate = clone(baseline);
  candidate.workflowStateFamilies[0].states[0].values = ["proposed", "completed"]; // "blocked" dropped
  const findings = runAllChecks(baseline, candidate);
  assertOnly(findings, "REMOVED_WORKFLOW_STATE");
  assert.deepEqual(findings[0].lines, ["finance_actions", "blocked"]);
});

// ── 9. removed non-workflow mutation ────────────────────────────────────────

test("detects a removed non-workflow mutation", () => {
  const baseline = makeBaseline();
  const candidate = clone(baseline);
  candidate.nonWorkflowMutationFamilies[0].mutationEndpoints = [];
  const findings = runAllChecks(baseline, candidate);
  assertOnly(findings, "REMOVED_NON_WORKFLOW_MUTATION");
  assert.deepEqual(findings[0].lines, ["feedback_submission", "POST /api/feedback"]);
});

// ── 10. removed Cockpit consumed field / dependency ─────────────────────────

test("detects a removed Cockpit consumed field (responseUsage=FIELDS)", () => {
  const baseline = makeBaseline();
  const candidate = clone(baseline);
  candidate.cockpitExternalFeeds[0].fieldsConsumed = ["recoveryStatus"]; // "stabilizationGate" dropped
  const findings = runAllChecks(baseline, candidate);
  assertOnly(findings, "COCKPIT_FIELD_REMOVED");
  assert.deepEqual(findings[0].lines, ["GET /api/owner/recovery-status", "stabilizationGate"]);
});

test("detects an entirely removed Cockpit dependency", () => {
  const baseline = makeBaseline();
  const candidate = clone(baseline);
  candidate.cockpitExternalFeeds = [];
  const findings = runAllChecks(baseline, candidate);
  assertOnly(findings, "REMOVED_COCKPIT_DEPENDENCY");
});

test("a Cockpit dependency whose baseline responseUsage is not FIELDS is not field-checked", () => {
  const baseline = makeBaseline();
  baseline.cockpitExternalFeeds[0].responseUsage = "SUCCESS_STATUS_ONLY";
  baseline.cockpitExternalFeeds[0].fieldsConsumed = [];
  const candidate = clone(baseline);
  assertNone(runAllChecks(baseline, candidate));
});

// ── 11 & 12. mutation-coverage invariant (generator-side, not the verifier) ─
// validateMutationCoverage is what the generator itself hard-fails on; the verifier only ever
// sees its output (a successfully generated, self-consistent candidate) or a generation failure.
// Tested directly here with tiny synthetic fixtures matching its real (pageRoutes, ownerActions,
// nonWorkflowFamilies) input shape.

test("mutation coverage: detects an unaccounted major action", () => {
  const pages = [{ route: "/owner/x", majorActions: [{ method: "POST", endpoint: "/api/owner/x/do-thing" }] }];
  const ownerActions = []; // nothing claims it
  const nonWorkflow = []; // nothing claims it either
  const result = validateMutationCoverage(pages, ownerActions, nonWorkflow);
  assert.equal(result.unaccounted.length, 1);
  assert.equal(result.unaccounted[0].call, "POST /api/owner/x/do-thing");
  assert.equal(result.duplicates.length, 0);
});

test("mutation coverage: detects duplicately-accounted major action", () => {
  const pages = [{ route: "/owner/x", majorActions: [{ method: "POST", endpoint: "/api/owner/x/do-thing" }] }];
  const ownerActions = [{ family: "fam_a", mutationEndpoints: [{ path: "/api/owner/x/do-thing", methods: ["POST"] }] }];
  const nonWorkflow = [{ family: "fam_b", mutationEndpoints: [{ path: "/api/owner/x/do-thing", methods: ["POST"] }] }];
  const result = validateMutationCoverage(pages, ownerActions, nonWorkflow);
  assert.equal(result.duplicates.length, 1);
  assert.deepEqual(result.duplicates[0].families.sort(), ["fam_a", "fam_b"]);
  assert.equal(result.unaccounted.length, 0);
});

test("mutation coverage: exactly-once coverage produces zero unaccounted/duplicate", () => {
  const pages = [{ route: "/owner/x", majorActions: [{ method: "POST", endpoint: "/api/owner/x/do-thing" }] }];
  const ownerActions = [{ family: "fam_a", mutationEndpoints: [{ path: "/api/owner/x/do-thing", methods: ["POST"] }] }];
  const result = validateMutationCoverage(pages, ownerActions, []);
  assert.equal(result.unaccounted.length, 0);
  assert.equal(result.duplicates.length, 0);
  assert.equal(result.coveredByOwnerActions, 1);
});

test("mutation coverage: bracket-vs-:param route notation normalizes identically", () => {
  const pages = [{ route: "/owner/x", majorActions: [{ method: "PATCH", endpoint: "/api/owner/x/:param/thing" }] }];
  const ownerActions = [{ family: "fam_a", mutationEndpoints: [{ path: "/api/owner/x/[id]/thing", methods: ["PATCH"] }] }];
  const result = validateMutationCoverage(pages, ownerActions, []);
  assert.equal(result.unaccounted.length, 0, "bracket and :param forms of the same route must be recognized as the same endpoint");
  assert.equal(result.coveredByOwnerActions, 1);
});
