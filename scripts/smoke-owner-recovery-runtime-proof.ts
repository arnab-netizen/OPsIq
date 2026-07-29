#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-explicit-any -- HTTP JSON bodies are untyped; explicit any is pragmatic for a smoke client */
/**
 * Module 1 Owner Recovery — DEPLOYED RUNTIME PROOF (HTTP only).
 *
 * Proves the Owner Recovery loop against a DEPLOYED app over HTTP, using a real
 * authenticated owner session (signup -> session cookie). It exercises ONLY the
 * public deployed routes under /api/owner/recovery/* — it never touches the
 * database directly and never imports server code, so it needs no DATABASE_URL
 * and no Prisma client.
 *
 * Flow proven:
 *   build-info -> signup(owner session) -> /owner/recovery page ->
 *   create business (INR) -> snapshot -> diagnosis cycle -> findings+actions ->
 *   dashboard -> complete an action (with evidence) -> verification ->
 *   dashboard reflects verification -> security checks.
 *
 * Security checks proven:
 *   - unauthenticated request is blocked (401/403)
 *   - cross-business access with a foreign id is blocked (>=400)
 *   - invalid action state transition is rejected (>=400)
 *
 * SAFETY:
 *   - Never prints cookies, tokens, DB URLs, or secrets — only masked/truncated IDs.
 *   - Uses a synthetic business name and a unique synthetic email per run.
 *   - Exits non-zero on any failed required proof; reports exact endpoint+status.
 *
 * Usage:
 *   BASE_URL=https://o-ps-iq.vercel.app npx tsx scripts/smoke-owner-recovery-runtime-proof.ts
 *   DRY_RUN=true npx tsx scripts/smoke-owner-recovery-runtime-proof.ts   # plan only, no network
 *   npx tsx scripts/smoke-owner-recovery-runtime-proof.ts --help
 */

export {};

// MUTATION CLASSIFICATION:
//   USER_WORKSPACE_CREATION  — user and workspace created (permanent, no cleanup)
//   BUSINESS_RECORD_CREATION — business record created (permanent, no cleanup)
//   RECOVERY_RECORDS         — snapshots, diagnosis cycles, actions, verifications (permanent)

import { enforceProductionGuard, resolveSmokePassword } from "./lib/smoke-production-guard.js";

const baseUrl = (process.env.BASE_URL || "https://o-ps-iq.vercel.app").replace(/\/+$/, "");
const dryRun = process.env.DRY_RUN === "true" || process.argv.includes("--dry-run");
const showHelp = process.argv.includes("--help") || process.argv.includes("-h");
const expectedCommit = (process.env.EXPECTED_COMMIT || "").trim();

const ts = Date.now();
const testEmail = `opsiq-owner-runtime+${ts}@example.com`;
const testPassword = resolveSmokePassword(baseUrl, "smoke-owner-recovery-runtime-proof");
const testWorkspace = `Owner Runtime Proof ${ts}`;
const businessName = `Tumbledry Mukundapur Runtime Proof ${ts}`;

if (!dryRun && !showHelp) {
  enforceProductionGuard(baseUrl, {
    mutationClasses: ["USER_WORKSPACE_CREATION", "BUSINESS_RECORD_CREATION", "RECOVERY_RECORDS"],
    mutationPreview: [
      `target    : ${baseUrl}`,
      `test email: ${testEmail}  (permanent — no automated cleanup)`,
      "creates   : user, workspace, business, recovery snapshots/cycles/actions/verifications",
    ],
  });
}

/** Mask an ID for safe logging: first4...last4. Never logs full IDs/secrets. */
function maskId(id: unknown): string {
  const s = typeof id === "string" ? id : String(id ?? "");
  if (!s || s.length < 8) return "***";
  return `${s.slice(0, 4)}...${s.slice(-4)}`;
}

/** Summarize a body for failure reporting without leaking secrets (truncated). */
function safeBodySummary(body: string): string {
  const collapsed = body.replace(/\s+/g, " ").trim();
  return collapsed.length > 240 ? `${collapsed.slice(0, 240)}…` : collapsed;
}

let step = "init";
function ok(msg: string): void {
  console.log(`  ✓ ${msg}`);
}
function fail(endpoint: string, status: number | string, bodySummary: string): never {
  console.error(`\n❌ FAIL at step: ${step}`);
  console.error(`   endpoint: ${endpoint}`);
  console.error(`   status:   ${status}`);
  console.error(`   body:     ${bodySummary}`);
  process.exit(1);
}

interface Resp {
  status: number;
  json: any;
  text: string;
  setCookie: string | null;
}

async function call(
  method: string,
  path: string,
  opts: { cookie?: string; body?: any } = {}
): Promise<Resp> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (opts.cookie) headers["Cookie"] = opts.cookie;
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: res.status, json, text, setCookie: res.headers.get("set-cookie") };
}

function planLines(): string[] {
  return [
    `BASE_URL                 : ${baseUrl}`,
    `synthetic email          : ${testEmail}`,
    `synthetic business       : ${businessName} (currency INR)`,
    "steps:",
    "  0  GET  /api/internal/build-info                                 (deployment present)",
    "  1  POST /api/auth/signup                                          (owner session cookie)",
    "  2  GET  /owner/recovery                                          (route reachable)",
    "  3  POST /api/owner/recovery/businesses                            (create INR business)",
    "  4  POST /api/owner/recovery/businesses/{id}/snapshots            (metric snapshot)",
    "  5  POST /api/owner/recovery/businesses/{id}/cycles               (run diagnosis)",
    "  6  assert findings persisted + actions persisted",
    "  7  GET  /api/owner/recovery/dashboard?businessId={id}            (dashboard reads)",
    "  8  PATCH/api/owner/recovery/actions/{id}  proposed->assigned->in_progress->completed",
    "  9  POST /api/owner/recovery/actions/{id}/verify                  (verification)",
    "  10 GET  dashboard again -> reflects verification",
    "  security: unauth blocked; foreign business blocked; invalid transition rejected",
  ];
}

async function main(): Promise<void> {
  if (showHelp) {
    console.log("Module 1 Owner Recovery — deployed runtime proof (HTTP only)\n");
    console.log(planLines().join("\n"));
    console.log("\nEnv: BASE_URL, DRY_RUN=true, EXPECTED_COMMIT (optional). Flags: --dry-run, --help");
    process.exit(0);
  }

  console.log("🚀 Module 1 Owner Recovery — Deployed Runtime Proof");
  console.log(`📍 Base URL: ${baseUrl}`);
  console.log(`📧 Owner email: ${testEmail}`);
  console.log(`🏢 Business: ${businessName} (INR)\n`);

  if (dryRun) {
    console.log("DRY_RUN=true — no network calls. Planned flow:");
    console.log(planLines().join("\n"));
    console.log("\n✅ DRY-RUN OK (script loaded, plan rendered, no requests sent).");
    process.exit(0);
  }

  // 0) Deployment present
  step = "0. GET /api/internal/build-info";
  const bi = await call("GET", "/api/internal/build-info");
  if (bi.status !== 200 || !bi.json || typeof bi.json.commit !== "string" || bi.json.commit === "unknown") {
    fail("/api/internal/build-info", bi.status, safeBodySummary(bi.text));
  }
  const deployedCommit: string = bi.json.commit;
  console.log(`  ℹ deployed commit: ${deployedCommit.slice(0, 7)} (env: ${bi.json.environment ?? "unknown"})`);
  if (expectedCommit && !deployedCommit.startsWith(expectedCommit.slice(0, 7))) {
    fail("/api/internal/build-info", `commit ${deployedCommit.slice(0, 7)} != expected ${expectedCommit.slice(0, 7)}`, "deployment may be stale");
  }
  ok(step);

  // 1) Owner session via signup
  step = "1. POST /api/auth/signup";
  const signup = await call("POST", "/api/auth/signup", {
    body: { email: testEmail, password: testPassword, workspaceName: testWorkspace },
  });
  if (signup.status !== 201 || !signup.json?.success || !signup.json?.user?.id || !signup.json?.workspace?.id) {
    fail("/api/auth/signup", signup.status, safeBodySummary(signup.text));
  }
  if (!signup.setCookie) fail("/api/auth/signup", signup.status, "no set-cookie (session) header");
  const cookie = signup.setCookie.split(";")[0].trim();
  const workspaceId: string = signup.json.workspace.id;
  ok(`${step} (owner ${maskId(signup.json.user.id)}, workspace ${maskId(workspaceId)}, session ${maskId(cookie)})`);

  // 2) Owner recovery route reachable (page may 200 or redirect; must not 5xx)
  step = "2. GET /owner/recovery";
  const page = await call("GET", "/owner/recovery", { cookie });
  if (page.status >= 500) fail("/owner/recovery", page.status, safeBodySummary(page.text));
  ok(`${step} (status ${page.status})`);

  // 3) Create INR business
  step = "3. POST /api/owner/recovery/businesses";
  const createBiz = await call("POST", "/api/owner/recovery/businesses", {
    cookie,
    body: {
      name: businessName,
      businessType: "laundry_local_service",
      currency: "INR",
      b2cSupported: true,
      b2bSupported: true,
    },
  });
  if (createBiz.status !== 201 || !createBiz.json?.id) {
    fail("/api/owner/recovery/businesses", createBiz.status, safeBodySummary(createBiz.text));
  }
  if (createBiz.json.currency !== "INR") {
    fail("/api/owner/recovery/businesses", createBiz.status, `currency != INR (${createBiz.json.currency})`);
  }
  const businessId: string = createBiz.json.id;
  ok(`${step} (business ${maskId(businessId)}, INR)`);

  // 4) Metric snapshot (poor metrics to trigger findings)
  step = "4. POST snapshots";
  const snapPath = `/api/owner/recovery/businesses/${businessId}/snapshots`;
  const snap = await call("POST", snapPath, {
    cookie,
    body: {
      periodStart: "2026-04-01",
      periodEnd: "2026-04-30",
      currency: "INR",
      revenue: 100000,
      totalCosts: 96000,
      orderCount: 1000,
      newCustomers: 70,
      repeatCustomers: 30,
      deliveryCost: 12000,
      refundAmount: 4000,
      complaintCount: 40,
    },
  });
  if (snap.status !== 201 || !snap.json?.snapshot?.id) {
    fail(snapPath, snap.status, safeBodySummary(snap.text));
  }
  const snapshotId: string = snap.json.snapshot.id;
  ok(`${step} (snapshot ${maskId(snapshotId)})`);

  // 5) Run diagnosis cycle
  step = "5. POST cycles (diagnosis)";
  const cyclePath = `/api/owner/recovery/businesses/${businessId}/cycles`;
  const cycle = await call("POST", cyclePath, { cookie, body: { snapshotId } });
  if (cycle.status !== 201 || !cycle.json?.id) {
    fail(cyclePath, cycle.status, safeBodySummary(cycle.text));
  }
  ok(`${step} (cycle ${maskId(cycle.json.id)}, number ${cycle.json.cycleNumber})`);

  // 6) Findings + actions persisted
  step = "6. findings + actions persisted";
  const findings: any[] = Array.isArray(cycle.json.findings) ? cycle.json.findings : [];
  const actions: any[] = Array.isArray(cycle.json.actions) ? cycle.json.actions : [];
  if (findings.length === 0) fail(cyclePath, cycle.status, "diagnosis produced 0 findings for a poor-metric snapshot");
  if (actions.length === 0) fail(cyclePath, cycle.status, "diagnosis produced 0 recovery actions");
  const action = actions[0];
  if (!action?.id || action.status !== "proposed" || typeof action.version !== "number") {
    fail(cyclePath, cycle.status, `first action malformed (status ${action?.status}, version ${action?.version})`);
  }
  ok(`${step} (${findings.length} finding(s): ${findings.map((f) => f.code).join(", ")}; ${actions.length} action(s))`);

  // 7) Dashboard reads current business
  step = "7. GET dashboard";
  const dashPath = `/api/owner/recovery/dashboard?businessId=${businessId}`;
  const dash1 = await call("GET", dashPath, { cookie });
  if (dash1.status !== 200 || dash1.json?.hasData !== true) {
    fail(dashPath, dash1.status, safeBodySummary(dash1.text));
  }
  ok(`${step} (hasData=true, latest cycle ${maskId(dash1.json?.latestCycle?.id)})`);

  // 8) Complete an action: proposed -> assigned -> in_progress -> completed
  const actionPath = `/api/owner/recovery/actions/${action.id}`;
  step = "8a. PATCH action -> assigned";
  const a1 = await call("PATCH", actionPath, { cookie, body: { status: "assigned", version: action.version } });
  if (a1.status !== 200 || a1.json?.status !== "assigned") fail(actionPath, a1.status, safeBodySummary(a1.text));
  ok(step);

  step = "8b. PATCH action -> in_progress";
  const a2 = await call("PATCH", actionPath, { cookie, body: { status: "in_progress", version: a1.json.version } });
  if (a2.status !== 200 || a2.json?.status !== "in_progress") fail(actionPath, a2.status, safeBodySummary(a2.text));
  ok(step);

  step = "8c. PATCH action -> completed (with evidence)";
  const a3 = await call("PATCH", actionPath, {
    cookie,
    body: {
      status: "completed",
      version: a2.json.version,
      completionNotes: "Runtime proof: executed the recommended action.",
      actualOutcome: "Runtime proof: outcome recorded for verification.",
    },
  });
  if (a3.status !== 200 || a3.json?.status !== "completed" || !a3.json?.completedAt) {
    fail(actionPath, a3.status, safeBodySummary(a3.text));
  }
  ok(`${step} (completed ${maskId(action.id)})`);

  // 9) Verification
  step = "9. POST verify";
  const verifyPath = `/api/owner/recovery/actions/${action.id}/verify`;
  const verify = await call("POST", verifyPath, { cookie, body: { afterValue: 55, evidence: "Runtime proof verification." } });
  if (verify.status !== 201 || !verify.json?.result?.status) {
    fail(verifyPath, verify.status, safeBodySummary(verify.text));
  }
  ok(`${step} (verification status: ${verify.json.result.status})`);

  // 10) Dashboard reflects verification + completed action
  step = "10. dashboard reflects verification";
  const dash2 = await call("GET", dashPath, { cookie });
  if (dash2.status !== 200) fail(dashPath, dash2.status, safeBodySummary(dash2.text));
  const dashActions: any[] = dash2.json?.latestCycle?.actions ?? [];
  const dashAction = dashActions.find((a) => a.id === action.id);
  if (!dashAction) fail(dashPath, dash2.status, "completed action not found in dashboard latestCycle");
  if (dashAction.status !== "completed") fail(dashPath, dash2.status, `dashboard action status ${dashAction.status} != completed`);
  const verifications: any[] = dashAction.verifications ?? [];
  if (verifications.length === 0) fail(dashPath, dash2.status, "dashboard action has no verification reflected");
  ok(`${step} (action completed + ${verifications.length} verification(s); status ${verifications[0].status})`);

  // --- SECURITY CHECKS ---
  step = "S1. unauthenticated request blocked";
  const unauth = await call("GET", dashPath);
  if (unauth.status !== 401 && unauth.status !== 403) {
    fail(dashPath, unauth.status, `expected 401/403 without session, got ${unauth.status}`);
  }
  ok(`${step} (status ${unauth.status})`);

  step = "S2. foreign business access blocked";
  const foreignId = "00000000-0000-4000-8000-000000000000";
  const foreignPath = `/api/owner/recovery/businesses/${foreignId}`;
  const foreign = await call("GET", foreignPath, { cookie });
  if (foreign.status < 400) {
    fail(foreignPath, foreign.status, `expected >=400 for foreign business, got ${foreign.status}`);
  }
  ok(`${step} (status ${foreign.status})`);

  step = "S3. invalid state transition rejected";
  // 'completed' is terminal; completed -> in_progress must be rejected.
  const current = await call("GET", actionPath, { cookie });
  const curVersion = typeof current.json?.version === "number" ? current.json.version : a3.json.version;
  const invalid = await call("PATCH", actionPath, { cookie, body: { status: "in_progress", version: curVersion } });
  if (invalid.status < 400) {
    fail(actionPath, invalid.status, `expected >=400 for completed->in_progress, got ${invalid.status}`);
  }
  ok(`${step} (status ${invalid.status})`);

  console.log("\n✅ PASS — Owner Recovery deployed runtime proof succeeded.");
  console.log("Summary:");
  console.log(`  deployed commit : ${deployedCommit.slice(0, 7)}`);
  console.log(`  workspace       : ${maskId(workspaceId)}`);
  console.log(`  business        : ${maskId(businessId)} (INR)`);
  console.log(`  cycle           : ${maskId(cycle.json.id)} (#${cycle.json.cycleNumber})`);
  console.log(`  findings/actions: ${findings.length}/${actions.length}`);
  console.log(`  action          : ${maskId(action.id)} -> completed -> verified`);
  console.log(`  security        : unauth ${unauth.status} · foreign ${foreign.status} · invalid-transition ${invalid.status}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(`\n❌ NETWORK_OR_RUNTIME_ERROR at step: ${step}`);
  console.error(`   ${err instanceof Error ? err.message : String(err)}`);
  console.error(`   (could not complete proof against ${baseUrl})`);
  process.exit(1);
});
