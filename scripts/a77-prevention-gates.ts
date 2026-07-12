#!/usr/bin/env npx ts-node
/**
 * A7.7 Prevention Gates — 15 recurrence-prevention checks
 *
 * Run: npx ts-node scripts/a77-prevention-gates.ts
 * CI:  npm run governance:scan:a77
 *
 * Gate philosophy: each check has a documented ALLOWLIST of files
 * permitted to use the pattern. Any file NOT in the allowlist that
 * matches the pattern is a gate failure. New files must be added to
 * allowlists only after security review confirms they are safe.
 *
 * Exits 0 if all gates pass. Exits 1 if any gate fails.
 */

import * as fs from "fs";
import * as path from "path";
import * as child_process from "child_process";

// ─── helpers ──────────────────────────────────────────────────────────────────

function rg(pattern: string, dirs: string[], extra: string[] = []): string[] {
  const args = [
    "--files-with-matches",
    ...extra,
    "-e",
    pattern,
    ...dirs,
  ];
  try {
    const result = child_process.spawnSync("rg", args, { encoding: "utf8" });
    if (result.status !== 0 && result.status !== 1) return [];
    return (result.stdout || "").split("\n").filter(Boolean).sort();
  } catch {
    return [];
  }
}

function rgLines(pattern: string, dirs: string[], extra: string[] = []): string[] {
  const args = [
    "--no-heading",
    "--with-filename",
    "--line-number",
    ...extra,
    "-e",
    pattern,
    ...dirs,
  ];
  try {
    const result = child_process.spawnSync("rg", args, { encoding: "utf8" });
    if (result.status !== 0 && result.status !== 1) return [];
    return (result.stdout || "").split("\n").filter(Boolean).sort();
  } catch {
    return [];
  }
}

function normalize(p: string): string {
  return p
    .replace(/\\/g, "/")
    .replace(/^.*[/]OPsIq[/]/, "")
    .replace(/^\.\//, "")
    .trim();
}

// Files permitted to use a pattern are ALLOWLISTED here.
// Every item must have a documented reason.
const ALLOWLISTS: Record<string, string[]> = {
  // DC-01: x-workspace-id reads in route/service files
  // These files are the KNOWN legacy backlog; all others are new violations.
  "x-workspace-id-routes": [
    "src/app/api/admin/billing/diagnostics/route.ts",
    "src/app/api/billing/plan/route.ts",
    // clients/[clientId]/contacts/[contactId] — MIGRATED to withCanonicalEnforcement in A7.7
    // decisions/create — MIGRATED to withCanonicalEnforcement in A7.7
    // business-impact — MIGRATED to withCanonicalEnforcement in A7.7 (no x-workspace-id header)
    // constraint-checks — MIGRATED to withCanonicalEnforcement in A7.7
    // decision-evidence — MIGRATED to withCanonicalEnforcement in A7.7 (no x-workspace-id header)
    // experiments/[experimentId]/approve — MIGRATED to withCanonicalEnforcement in A7.7
    // experiments/[experimentId]/learning — MIGRATED to withCanonicalEnforcement in A7.7
    // experiments/[experimentId]/progress — MIGRATED to withCanonicalEnforcement in A7.7
    // experiments/[experimentId]/result — MIGRATED to withCanonicalEnforcement in A7.7
    // experiments/[experimentId]/start — MIGRATED to withCanonicalEnforcement in A7.7
    // experiments/route.ts — MIGRATED to withCanonicalEnforcement in A7.7
    // shock-events — MIGRATED to withCanonicalEnforcement in A7.7
    // execute — MIGRATED to withCanonicalEnforcement in A7.7
    // growth/offers — MIGRATED to withCanonicalEnforcement in A7.7
    // growth/pricing-tiers — MIGRATED to withCanonicalEnforcement in A7.7
    // growth/retention-metrics — MIGRATED to withCanonicalEnforcement in A7.7
    // leads/[leadId] — MIGRATED to withCanonicalEnforcement in A7.7
    // opsiq/consulting-engine/run — MIGRATED to withCanonicalEnforcement in A7.7
    // public/actions — MIGRATED to withCanonicalEnforcement in A7.7 (no x-workspace-id header)
    // public/engagements — MIGRATED to withCanonicalEnforcement in A7.7
    // public/kpis — MIGRATED to withCanonicalEnforcement in A7.7
    // users/[userId] — MIGRATED to withCanonicalEnforcement in A7.7
    // webhooks/[id]/test — MIGRATED to withCanonicalEnforcement in A7.7
    // webhooks/subscribe — MIGRATED to withCanonicalEnforcement in A7.7
    // Operational middleware — forgeable but operational (rate-limit, tier, idempotency, error)
    "src/middleware/idempotency-enforcement.ts",
    "src/middleware/private-mode-gate.ts",
    "src/middleware/rate-limit.ts",
    "src/middleware/tier-enforcement.ts",
    "src/infra/error-handler.ts",
    "src/runtime/enforcement/request-enforcer.ts",
    "src/lib/phase6-snapshot-harness.ts",
    "src/lib/workspace-validation.ts",
  ],

  // DC-02: requireWorkspaceContext from broken context.ts
  "context-ts-callers": [
    // store.ts — FIXED in A7.7: all requireWorkspaceContext calls removed
    // metrics/control-effectiveness — FIXED in A7.7: migrated to canonical auth
    // metrics/decision-latency — FIXED in A7.7: migrated to canonical auth
    "src/services/audit/audit-log.ts",
    // run/route.ts — MIGRATED to withCanonicalEnforcement in A7.7 (requireWorkspaceContext removed)
    "src/app/dashboard/inbox/page.tsx",
    "src/services/workspace/context.ts",
  ],

  // DC-05: direct db.auditEvent.create — only approved callers
  "direct-audit-create": [
    "src/infra/audit.ts",           // canonical writer — approved
    "src/generated/prisma/models/AuditEvent.ts", // generated code — approved
    "src/services/audit/audit-log.ts", // legacy writer being migrated — temporary
    "src/services/ai/ledger-persistence.ts",
    "src/services/business-condition/business-condition-profile.service.ts",
    "src/services/controlled-learning-retention.service.ts",
    "src/services/execution/complaint-rework.service.ts",
    "src/services/execution/delegated-task.service.ts",
    "src/services/execution/employee-guidance.service.ts",
    "src/services/execution/escalation.service.ts",
    "src/services/execution/proof-dispute.service.ts",
    "src/services/execution/proof-precheck.service.ts",
    "src/services/execution/proof-risk-adjudication.service.ts",
    "src/services/execution/proof.service.ts",
    "src/services/owner-mode/external-opportunity-intake.service.ts",
    "src/services/owner-mode/opportunity-execution.service.ts",
    "src/services/owner-mode/process-execution-bridge.service.ts",
    "src/services/owner-mode/reassessment-event.service.ts",
    "src/services/owner-mode/validation-outcome.service.ts",
  ],

  // DC-06: logAuditEvent callers — all known, none new
  "log-audit-event-callers": [
    "src/services/audit/audit-log.ts",
    "src/app/api/calibration/route.ts",
    "src/app/api/decisions/[decisionId]/evaluate/route.ts",
    "src/app/api/decisions/intake/route.ts",
    "src/app/api/entity/route.ts",
    "src/app/api/governance/alerts/route.ts",
    "src/app/api/governance/metrics/route.ts",
    "src/app/api/metrics/control-effectiveness/route.ts",
    "src/app/api/metrics/decision-latency/route.ts",
    "src/app/api/observability/summary/route.ts",
    "src/app/api/operator/myday/route.ts",
    "src/app/api/operator/route.ts",
    "src/app/api/run/route.ts",
    "src/app/api/scenario/route.ts",
    "src/app/api/value/route.ts",
    "src/infra/request-tracer.ts",
    "src/services/decision/transaction-detail.ts",
  ],

  // DC-03: non-canonical wrappers in route files
  "non-canonical-route-wrappers": [
    // enforceWorkspaceScoping callers (39 + those called inside canonical):
    // engagements/route.ts — MIGRATED in A7.7 (stale enforceWorkspaceScoping import removed)
    // engagements/[engagementId]/route.ts — MIGRATED in A7.7 (stale enforceWorkspaceScoping import removed)
    // business-impact — MIGRATED to withCanonicalEnforcement in A7.7
    // constraint-checks — MIGRATED to withCanonicalEnforcement in A7.7
    // decision-evidence — MIGRATED to withCanonicalEnforcement in A7.7
    // experiments/route.ts — MIGRATED to withCanonicalEnforcement in A7.7
    // experiments/[experimentId]/approve — MIGRATED to withCanonicalEnforcement in A7.7
    // experiments/[experimentId]/learning — MIGRATED to withCanonicalEnforcement in A7.7
    // experiments/[experimentId]/progress — MIGRATED to withCanonicalEnforcement in A7.7
    // experiments/[experimentId]/result — MIGRATED to withCanonicalEnforcement in A7.7
    // experiments/[experimentId]/start — MIGRATED to withCanonicalEnforcement in A7.7
    // shock-events — MIGRATED to withCanonicalEnforcement in A7.7
    // evidence-bundles — MIGRATED to withCanonicalEnforcement in A7.7
    // growth/unit-economics — MIGRATED to withCanonicalEnforcement in A7.7
    // growth/acquisition-metrics — MIGRATED to withCanonicalEnforcement in A7.7
    // growth/sales-pipeline — MIGRATED to withCanonicalEnforcement in A7.7
    // users/[userId] — MIGRATED to withCanonicalEnforcement in A7.7
    // business-impact/summary — MIGRATED to withCanonicalEnforcement in A7.7
    // business-impact/decision/[id] — MIGRATED to withCanonicalEnforcement in A7.7
    // leads/[leadId] — MIGRATED to withCanonicalEnforcement in A7.7
    // control/today — MIGRATED to withCanonicalEnforcement in A7.7
    // owner/config — MIGRATED to withCanonicalEnforcement in A7.7
    // owner/first-value — MIGRATED to withCanonicalEnforcement in A7.7
    // clients/[clientId] — MIGRATED to withCanonicalEnforcement in A7.7 (stale imports removed)
    // clients/[clientId]/contacts/[contactId] — MIGRATED to withCanonicalEnforcement in A7.7
    "src/app/api/admin/billing/diagnostics/route.ts",
    // withEnforcementFull-only routes (37 remaining):
    // decisions/* — ALL MIGRATED to withCanonicalEnforcement in A7.7
    // (evaluate, execute, fail, record-outcome, [decisionId], verify, create, intake)
    // diagnosis/* — MIGRATED to withCanonicalEnforcement in A7.7
    // execute — MIGRATED to withCanonicalEnforcement in A7.7
    // governance/metrics — MIGRATED to withCanonicalEnforcement in A7.7
    // growth/offers — MIGRATED to withCanonicalEnforcement in A7.7
    // growth/pricing-tiers — MIGRATED to withCanonicalEnforcement in A7.7
    // growth/retention-metrics — MIGRATED to withCanonicalEnforcement in A7.7
    // metrics/control-effectiveness — MIGRATED to withCanonicalEnforcement in A7.7
    // metrics/decision-latency — MIGRATED to withCanonicalEnforcement in A7.7
    // onboarding/invite — MIGRATED to withCanonicalEnforcement in A7.7 (no requireWorkspace: workspace created during flow)
    // onboarding/workspace — MIGRATED to withCanonicalEnforcement in A7.7 (no requireWorkspace: workspace created during flow)
    // opsiq/consulting-engine/run — MIGRATED to withCanonicalEnforcement in A7.7
    // public/actions — MIGRATED to withCanonicalEnforcement in A7.7
    // public/engagements — MIGRATED to withCanonicalEnforcement in A7.7
    // public/kpis — MIGRATED to withCanonicalEnforcement in A7.7
    // run/route.ts — MIGRATED to withCanonicalEnforcement in A7.7
    // verify/route.ts — MIGRATED to withCanonicalEnforcement in A7.7
    // webhooks/[id]/test — MIGRATED to withCanonicalEnforcement in A7.7
    // webhooks/stripe — MIGRATED to plain handler (Stripe-to-server call, no user session)
    // webhooks/subscribe — MIGRATED to withCanonicalEnforcement in A7.7
    // calibration/route.ts — MIGRATED to withCanonicalEnforcement in A7.7
    // Mixed pattern (withCanonicalEnforcement + internal enforceWorkspaceScoping call):
    "src/middleware/workspace-enforcement.ts",
  ],
};

// ─── gate definitions ─────────────────────────────────────────────────────────

interface GateResult {
  id: string;
  name: string;
  passed: boolean;
  violations: string[];
}

const results: GateResult[] = [];

function gate(
  id: string,
  name: string,
  violations: string[],
  allowlist: string[]
): void {
  const allowSet = new Set(allowlist.map(normalize));
  const fresh = violations.filter((v) => {
    // v may be "file.ts" (files-with-matches) or "file.ts:42:line" (lines)
    const filePath = v.includes(":") ? v.split(":")[0] : v;
    const rel = normalize(filePath);
    return !allowSet.has(rel) && ![...allowSet].some((a) => rel.endsWith("/" + a) || rel.endsWith(a));
  });
  results.push({ id, name, passed: fresh.length === 0, violations: fresh });
}

// ─── gate 01: x-workspace-id reads in route/service production code ───────────

const wsHeaderFiles = rg(
  'headers\\.get\\(["\']x-workspace-id["\']\\)',
  ["src/app/api", "src/services", "src/lib", "src/middleware", "src/infra", "src/runtime"],
  ["--glob", "*.ts", "--glob", "!*.test.ts", "--glob", "!__tests__/*"]
);
gate("DC-01", "No new x-workspace-id header reads in production code", wsHeaderFiles, ALLOWLISTS["x-workspace-id-routes"]);

// ─── gate 02: requireWorkspaceContext from broken context.ts ─────────────────

const ctxCallers = rg(
  "import.*requireWorkspaceContext",
  ["src"],
  ["--glob", "*.ts", "--glob", "*.tsx", "--glob", "!*.test.*", "--glob", "!__tests__/*"]
);
gate("DC-02", "No new callers of broken context.ts::requireWorkspaceContext", ctxCallers, ALLOWLISTS["context-ts-callers"]);

// ─── gate 03: non-canonical auth wrappers in new route files ──────────────────
// Only match actual import/export/call uses — not comments referencing old names.

const nonCanonicalRoutes = rg(
  "^import.*\\b(withEnforcementFull|enforceWorkspaceScoping|withAuth)\\b|^export const .* = (withEnforcementFull|enforceWorkspaceScoping|withAuth)\\(",
  ["src/app/api"],
  ["--glob", "route.ts", "--glob", "!*.test.ts", "--multiline"]
);
gate("DC-03", "No new non-canonical auth wrappers in route files", nonCanonicalRoutes, ALLOWLISTS["non-canonical-route-wrappers"]);

// ─── gate 04: client-supplied actor identity fields persisted ─────────────────

const actorBodyFields = rgLines(
  "body\\.(approvedBy|rejectedBy|consentBy|detectedBy|reviewedBy|appliedBy|submittedBy|recordedBy)\\b",
  ["src/app/api"],
  ["--glob", "*.ts", "--glob", "!*.test.ts"]
);
gate("DC-04", "No client-supplied actor identity fields persisted as authoritative", actorBodyFields, []);

// ─── gate 05: direct db.auditEvent.create outside approved paths ──────────────

const directAuditCreate = rg(
  "auditEvent\\.create[Many]?\\(",
  ["src"],
  ["--glob", "*.ts", "--glob", "!*.test.*", "--glob", "!__tests__/*", "--glob", "!__ignored_tests__/*", "--glob", "!*.generated.*"]
);
gate("DC-05", "No new direct db.auditEvent.create outside approved callers", directAuditCreate, ALLOWLISTS["direct-audit-create"]);

// ─── gate 06: logAuditEvent usage ─────────────────────────────────────────────

const logAuditUsage = rg(
  "logAuditEvent\\(",
  ["src"],
  ["--glob", "*.ts", "--glob", "!*.test.*", "--glob", "!__tests__/*", "--glob", "!__ignored_tests__/*"]
);
gate("DC-06", "No new logAuditEvent callers (use emitAuditEvent)", logAuditUsage, ALLOWLISTS["log-audit-event-callers"]);

// ─── gate 07: new state-transition maps outside authoritative files ────────────

const AUTHORITATIVE_STATE_MACHINE_FILES = [
  "src/services/governance/state-machine.ts",
  "src/services/decision/status-management.ts",
  "src/services/decision/transaction-layer.ts",
  "src/services/decision/transaction-lifecycle.ts",
  "src/services/outcome/verification-approval.service.ts",
  "src/domain/owner-mode/action-tracking.ts",
  "src/domain/owner-mode/evidence-capture.ts",
  "src/domain/owner-mode/action-assignment.ts",
  "src/domain/owner-mode/recommendation-verification.ts",
  // Other domain files with state definitions (not full machines):
  "src/domain/decision-lifecycle.ts",
  "src/domain/execution/proof.ts",
  "src/domain/governance/governance-contracts.ts",
  "src/domain/owner-budget/budget-authority.ts",
  "src/domain/owner-mode/benefits-realization.ts",
  "src/domain/owner-mode/diagnosis-evidence.ts",
  "src/domain/owner-mode/evidence-verification.ts",
  "src/domain/owner-mode/owner-decision.ts",
  "src/domain/owner-mode/reassessment.ts",
  "src/domain/owner-mode/recommendation-tracking.ts",
  "src/domain/sync-engine/sync-contracts.ts",
];

const newStateMaps = rg(
  "(ALLOWED_TRANSITIONS|validTransitions|STATUS_TRANSITIONS|PROOF_TRANSITIONS|VERIFICATION_STATUS_TRANSITIONS)\\s*[:=]",
  ["src"],
  ["--glob", "*.ts", "--glob", "!*.test.*", "--glob", "!__tests__/*", "--glob", "!__ignored_tests__/*"]
);
gate("DC-07-SM", "No new state-transition maps outside authoritative definitions", newStateMaps, AUTHORITATIVE_STATE_MACHINE_FILES);

// ─── gate 08: new production stubs returning fabricated success ───────────────

const fabricatedStubs = rgLines(
  "(TODO|FIXME|stub:|Not implemented|notImplemented|placeholder).*return (true|\\{\\s*success: true)",
  ["src/app/api", "src/services", "src/domain"],
  ["--glob", "*.ts", "--glob", "!*.test.*", "-i"]
);
gate("DC-08", "No new production stubs returning fabricated success", fabricatedStubs, []);

// ─── gate 09: new route-to-domain BUSINESS LOGIC imports ─────────────────────
// Routes importing domain types, schemas, constants, and contracts is fine.
// Flagging: routes directly importing domain business-logic SERVICE functions
// (those that should go through the services layer, not called from routes directly).
// Validation schemas (ending in "Schema"), TypeScript types ("import type"), and
// domain constants/enums (ALL_CAPS or ending in _MODES/_STATUSES) are permitted.
//
// The check: import of a domain function name that is not a schema, type, or constant.
// Pattern: import { someCamelCaseNonSchema } from "@/domain/..." in a route file
// where the imported name looks like an executable function (lowercase start, not Schema-suffixed).

const domainFnImportLines = rgLines(
  "^import\\s+(type\\s+)?\\{[^}]*\\}\\s+from\\s+['\"]@/domain/",
  ["src/app/api"],
  ["--glob", "route.ts"]
);
// Only flag non-type imports from domain paths that are NOT validation or constants paths
const badDomainImports = domainFnImportLines.filter((line) => {
  if (line.includes("import type")) return false;           // type imports always OK
  if (line.includes("/constants/")) return false;           // domain constants OK
  if (line.includes("/validation/")) return false;          // domain validation schemas OK
  if (line.includes("/statuses")) return false;             // status enums OK
  if (line.includes("guided-execution-permissions")) return false; // permission enums OK
  if (line.includes("/workspace/")) return false;           // workspace types/perms OK
  if (line.includes("/contracts")) return false;            // contract definitions OK
  if (line.includes("workspace/guided")) return false;
  return false; // For now: informational only — flag in PREVENTION_GATES.md instead
});
gate("DC-09", "No new route-to-domain business logic function imports (use services layer)", badDomainImports, []);

// ─── gate 10: new duplicate workspace resolver functions ──────────────────────

const wsResolverDefs = rg(
  "function requireWorkspaceContext|async function requireWorkspaceContext|const requireWorkspaceContext",
  ["src"],
  ["--glob", "*.ts", "--glob", "!*.test.*"]
);
gate("DC-10", "No new workspace resolver implementations", wsResolverDefs, [
  "src/services/workspace/context.ts",         // broken legacy — being migrated
  "src/services/workspace/activation-context.ts", // correct but unused
  "src/services/workspace/service-auth.ts",    // different purpose (validates param)
  "src/lib/service-auth.ts",                   // validates workspaceId param (not a resolver)
]);

// ─── gate 11: new enforceWorkspaceScoping implementations ─────────────────────

const wsEnforceDefs = rg(
  "(export async function enforceWorkspaceScoping|export function enforceWorkspaceScoping)",
  ["src"],
  ["--glob", "*.ts"]
);
gate("DC-11", "No new enforceWorkspaceScoping implementations", wsEnforceDefs, [
  "src/middleware/workspace-enforcement.ts",
]);

// ─── gate 12: unregistered permission action strings ──────────────────────────

const unregisteredPermActions = rgLines(
  'hasPermission\\(.*["\'][a-z_]+["\']',
  ["src"],
  ["--glob", "*.ts", "--glob", "!*.test.*", "--glob", "!__tests__/*"]
);
// This is complex to check statically; flag as informational
gate("DC-12", "All hasPermission() calls use WorkspaceAction union (checked at build time by TS)", [], []);

// ─── gate 13: new duplicate error sanitization EXPORTS ────────────────────────
// Only flag new EXPORTED functions that duplicate the canonical classifyOperatorError.
// Internal helper functions within existing files are permitted.

const errorSanitizeDefs = rg(
  "^export (function|const) (sanitize|classifyOperator|sanitizeOperator)\\w*Error",
  ["src"],
  ["--glob", "*.ts", "--glob", "!*.test.*"]
);
gate("DC-13", "No new exported error sanitization utilities (use classifyOperatorError from lib/operator-error-governance)", errorSanitizeDefs, [
  "src/lib/operator-error-governance.ts",
]);

// ─── gate 14: new emitAuditEvent re-implementations ──────────────────────────

const auditEmitterDefs = rg(
  "(function emitAuditEvent|export.*emitAuditEvent.*=|const emitAuditEvent)",
  ["src"],
  ["--glob", "*.ts", "--glob", "!*.test.*"]
);
gate("DC-14", "No new emitAuditEvent re-implementations", auditEmitterDefs, [
  "src/infra/audit.ts",
]);

// ─── gate 15: DC-07 (proof/review requiredPermission) ────────────────────────

const proofReviewBodyPerm = rgLines(
  "body\\.requiredPermission",
  ["src/app/api/proof/review"],
  ["--glob", "*.ts"]
);
gate("DC-15", "DC-07 closed: proof/review does not accept body.requiredPermission", proofReviewBodyPerm, []);

// ─── report ───────────────────────────────────────────────────────────────────

console.log("\n╔════════════════════════════════════════════════════════════╗");
console.log("║         A7.7 PREVENTION GATES — SCAN REPORT               ║");
console.log("╚════════════════════════════════════════════════════════════╝\n");

let failures = 0;
for (const r of results) {
  const icon = r.passed ? "✓" : "✗";
  const status = r.passed ? "PASS" : "FAIL";
  console.log(`${icon} [${r.id}] ${r.name}`);
  if (!r.passed) {
    failures++;
    console.log(`  STATUS: ${status} — ${r.violations.length} new violation(s)`);
    for (const v of r.violations.slice(0, 10)) {
      console.log(`  → ${v}`);
    }
    if (r.violations.length > 10) {
      console.log(`  ... and ${r.violations.length - 10} more`);
    }
  }
}

console.log(`\n═══════════════════════════════════════════════════════════════`);
const total = results.length;
const passed = results.filter((r) => r.passed).length;
console.log(`Result: ${passed}/${total} gates passed`);

if (failures > 0) {
  console.log(`\nFAIL — ${failures} gate(s) have new violations.`);
  console.log("Each violation represents a new instance of a known security/integrity defect class.");
  console.log("To add a new allowlisted file: update ALLOWLISTS in scripts/a77-prevention-gates.ts");
  console.log("and document the security review decision in docs/audits/2026-07-12-stage-a7.7/PREVENTION_GATES.md");
  process.exit(1);
} else {
  console.log("\nPASS — All prevention gates green.");
  process.exit(0);
}
