#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-explicit-any -- HTTP JSON bodies are untyped; explicit any is pragmatic for a smoke client */
/**
 * Module 7 SOP & Execution Accountability — DEPLOYED RUNTIME PROOF (HTTP only).
 *
 * Proves the SOP API loop against a DEPLOYED app over HTTP using a real
 * authenticated owner session (signup -> session cookie). It exercises only the
 * deployed routes under /api/owner/sop/* (business created via the existing
 * /api/owner/recovery/businesses route, since sop reuses OwnerBusiness). It never
 * touches the DB directly and imports no server code.
 *
 * Deploy-freshness is checked by a capability probe (step 0b) — an unauthenticated
 * sop route must return JSON 401/403, not the HTML app shell — which proves the
 * feature is deployed without coupling to an exact commit SHA.
 *
 * SAFETY: never prints cookies, tokens, DB URLs, or secrets — only masked IDs.
 * Synthetic owner + business per run. Exits non-zero on any failed proof and
 * reports the exact endpoint + status.
 *
 * Usage:
 *   BASE_URL=https://o-ps-iq.vercel.app npx tsx scripts/smoke-owner-sop-runtime-proof.ts
 *   DRY_RUN=true npx tsx scripts/smoke-owner-sop-runtime-proof.ts   # plan only, no network
 *   npx tsx scripts/smoke-owner-sop-runtime-proof.ts --help
 */

export {};

// MUTATION CLASSIFICATION:
//   USER_WORKSPACE_CREATION  — user and workspace created (permanent, no cleanup)
//   BUSINESS_RECORD_CREATION — business record created (permanent, no cleanup)
//   SOP_RECORDS              — SOP documents, process executions, actions (permanent)

import { enforceProductionGuard, resolveSmokePassword } from "./lib/smoke-production-guard.js";

const baseUrl = (process.env.BASE_URL || "https://o-ps-iq.vercel.app").replace(/\/+$/, "");
const dryRun = process.env.DRY_RUN === "true" || process.argv.includes("--dry-run");
const showHelp = process.argv.includes("--help") || process.argv.includes("-h");
const expectedCommit = (process.env.EXPECTED_COMMIT || "").trim();

const ts = Date.now();
const testEmail = `opsiq-sop-runtime+${ts}@example.com`;
const testPassword = resolveSmokePassword(baseUrl, "smoke-owner-sop-runtime-proof");
const testWorkspace = `SOP Runtime Proof ${ts}`;
const businessName = `SOP Runtime Proof ${ts}`;

if (!dryRun && !showHelp) {
  enforceProductionGuard(baseUrl, {
    mutationClasses: ["USER_WORKSPACE_CREATION", "BUSINESS_RECORD_CREATION", "SOP_RECORDS"],
    mutationPreview: [
      `target    : ${baseUrl}`,
      `test email: ${testEmail}  (permanent — no automated cleanup)`,
      "creates   : user, workspace, business, SOP documents and process execution records",
    ],
  });
}

function maskId(id: unknown): string {
  const s = typeof id === "string" ? id : String(id ?? "");
  if (!s || s.length < 8) return "***";
  return `${s.slice(0, 4)}...${s.slice(-4)}`;
}
function safeBodySummary(body: string): string {
  const c = body.replace(/\s+/g, " ").trim();
  return c.length > 240 ? `${c.slice(0, 240)}…` : c;
}

let step = "init";
const ok = (m: string) => console.log(`  ✓ ${m}`);
function fail(endpoint: string, status: number | string, bodySummary: string): never {
  console.error(`\n❌ FAIL at step: ${step}`);
  console.error(`   endpoint: ${endpoint}`);
  console.error(`   status:   ${status}`);
  console.error(`   body:     ${bodySummary}`);
  process.exit(1);
}

interface Resp { status: number; json: any; text: string; setCookie: string | null }
async function call(method: string, path: string, opts: { cookie?: string; body?: any } = {}): Promise<Resp> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (opts.cookie) headers["Cookie"] = opts.cookie;
  const res = await fetch(`${baseUrl}${path}`, {
    method, headers, body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  return { status: res.status, json, text, setCookie: res.headers.get("set-cookie") };
}

function breakdownSnapshot() {
  // Low completion/verification + overdue + repeated failures + no SOPs → guarantees findings + actions.
  return {
    periodStart: "2026-05-01", periodEnd: "2026-05-31", currency: "INR", businessModel: "service",
    actionsAssigned: 100, actionsCompleted: 50, actionsVerified: 10, actionsOverdue: 40,
    actionsDisputed: 8, actionsReassigned: 30, repeatedFailures: 30,
    proofRequired: 40, proofProvided: 10, recurringProcesses: 20, documentedSops: 5,
  };
}

function planLines(): string[] {
  return [
    `BASE_URL              : ${baseUrl}`,
    `synthetic email       : ${testEmail}`,
    `synthetic business    : ${businessName} (INR)`,
    "steps:",
    "  0  GET  /api/internal/build-info                                (deployment present)",
    "  0b GET  /api/owner/sop/dashboard (unauth)                       (sop feature deployed: JSON 401, not HTML)",
    "  1  POST /api/auth/signup                                        (owner session)",
    "  2  POST /api/owner/recovery/businesses                          (create business)",
    "  3  POST /api/owner/sop/businesses/{id}/snapshots                (execution snapshot)",
    "  4  GET  /api/owner/sop/snapshots/{snapshotId}                   (read snapshot)",
    "  5  POST /api/owner/sop/businesses/{id}/diagnoses                (diagnosis)",
    "  6  GET  /api/owner/sop/diagnoses/{cycleId}                      (read diagnosis)",
    "  7  GET  /api/owner/sop/diagnoses/{cycleId}/findings",
    "  8  GET  /api/owner/sop/diagnoses/{cycleId}/actions",
    "  9  PATCH/api/owner/sop/actions/{id}  proposed->assigned->in_progress->completed",
    "  10 POST /api/owner/sop/actions/{id}/verify",
    "  11 GET  /api/owner/sop/dashboard?businessId={id}                (reflects all)",
    "  12 GET  /owner/execution                                        (UI page renders)",
    "  13 GET  /api/owner/command-center?businessId={id}               (reflects sop + next action)",
    "  14 GET  /owner                                                  (command center home renders)",
    "  security: unauth blocked; foreign business blocked; invalid payload rejected; invalid transition rejected",
  ];
}

async function main(): Promise<void> {
  if (showHelp) {
    console.log("Module 7 SOP — deployed runtime proof (HTTP only)\n");
    console.log(planLines().join("\n"));
    console.log("\nEnv: BASE_URL, DRY_RUN=true, EXPECTED_COMMIT (optional). Flags: --dry-run, --help");
    process.exit(0);
  }

  console.log("🚀 Module 7 SOP — Deployed Runtime Proof");
  console.log(`📍 Base URL: ${baseUrl}`);
  console.log(`📧 Owner email: ${testEmail}`);
  console.log(`🏢 Business: ${businessName} (INR)\n`);

  if (dryRun) {
    console.log("DRY_RUN=true — no network calls. Planned flow:");
    console.log(planLines().join("\n"));
    console.log("\n✅ DRY-RUN OK (script loaded, plan rendered, no requests sent).");
    process.exit(0);
  }

  // 0) deployment present
  step = "0. GET /api/internal/build-info";
  const bi = await call("GET", "/api/internal/build-info");
  if (bi.status !== 200 || !bi.json || typeof bi.json.commit !== "string" || bi.json.commit === "unknown") {
    fail("/api/internal/build-info", bi.status, safeBodySummary(bi.text));
  }
  const deployedCommit: string = bi.json.commit;
  console.log(`  ℹ deployed commit: ${deployedCommit.slice(0, 7)} (env: ${bi.json.environment ?? "unknown"})`);
  if (expectedCommit && !deployedCommit.startsWith(expectedCommit.slice(0, 7))) {
    fail("/api/internal/build-info", `commit ${deployedCommit.slice(0, 7)} != expected ${expectedCommit.slice(0, 7)}`, "deployment may be stale (EXPECTED_COMMIT override set)");
  }
  ok(step);

  // 0b) the sop feature itself is deployed (deterministic capability probe).
  step = "0b. sop API deployed (capability probe)";
  const probe = await call("GET", "/api/owner/sop/dashboard");
  const looksHtml = probe.json === null && /^\s*<(?:!doctype|html)/i.test(probe.text.trim());
  if (looksHtml) {
    fail(
      "/api/owner/sop/dashboard",
      probe.status,
      "sop API returned the HTML app shell, not JSON — the Module 7 sop routes are NOT deployed at this base URL (stale deploy). Redeploy main, then re-run."
    );
  }
  if (probe.status !== 401 && probe.status !== 403) {
    fail(
      "/api/owner/sop/dashboard",
      probe.status,
      `expected 401/403 JSON from the unauthenticated sop API, got ${probe.status} — the sop API may not be deployed`
    );
  }
  ok(`${step} (unauth → ${probe.status} JSON; sop routes are live)`);

  // 1) owner session
  step = "1. POST /api/auth/signup";
  const signup = await call("POST", "/api/auth/signup", {
    body: { email: testEmail, password: testPassword, workspaceName: testWorkspace },
  });
  if (signup.status !== 201 || !signup.json?.success || !signup.json?.user?.id || !signup.json?.workspace?.id) {
    fail("/api/auth/signup", signup.status, safeBodySummary(signup.text));
  }
  if (!signup.setCookie) fail("/api/auth/signup", signup.status, "no set-cookie (session) header");
  const cookie = signup.setCookie.split(";")[0].trim();
  ok(`${step} (owner ${maskId(signup.json.user.id)}, workspace ${maskId(signup.json.workspace.id)}, session ${maskId(cookie)})`);

  // 2) create business
  step = "2. POST /api/owner/recovery/businesses";
  const createBiz = await call("POST", "/api/owner/recovery/businesses", {
    cookie,
    body: { name: businessName, businessType: "generic_local_service", currency: "INR", b2cSupported: true, b2bSupported: true },
  });
  if (createBiz.status !== 201 || !createBiz.json?.id) {
    fail("/api/owner/recovery/businesses", createBiz.status, safeBodySummary(createBiz.text));
  }
  const businessId: string = createBiz.json.id;
  ok(`${step} (business ${maskId(businessId)})`);

  // 3) execution snapshot
  step = "3. POST sop snapshot";
  const snapPath = `/api/owner/sop/businesses/${businessId}/snapshots`;
  const snap = await call("POST", snapPath, { cookie, body: breakdownSnapshot() });
  if (snap.status !== 201 || !snap.json?.id) fail(snapPath, snap.status, safeBodySummary(snap.text));
  const snapshotId: string = snap.json.id;
  ok(`${step} (snapshot ${maskId(snapshotId)}, dataConfidence ${snap.json.dataConfidenceScore})`);

  // 4) read snapshot
  step = "4. GET snapshot";
  const getSnap = await call("GET", `/api/owner/sop/snapshots/${snapshotId}`, { cookie });
  if (getSnap.status !== 200 || getSnap.json?.id !== snapshotId) fail(`/api/owner/sop/snapshots/${snapshotId}`, getSnap.status, safeBodySummary(getSnap.text));
  ok(step);

  // 5) diagnosis
  step = "5. POST diagnosis";
  const diagPath = `/api/owner/sop/businesses/${businessId}/diagnoses`;
  const diag = await call("POST", diagPath, { cookie, body: { snapshotId } });
  if (diag.status !== 201 || !diag.json?.id) fail(diagPath, diag.status, safeBodySummary(diag.text));
  const cycleId: string = diag.json.id;
  const findings: any[] = Array.isArray(diag.json.findings) ? diag.json.findings : [];
  const actions: any[] = Array.isArray(diag.json.actions) ? diag.json.actions : [];
  if (findings.length === 0) fail(diagPath, diag.status, "diagnosis produced 0 findings for a breakdown snapshot");
  if (actions.length === 0) fail(diagPath, diag.status, "diagnosis produced 0 actions");
  ok(`${step} (cycle ${maskId(cycleId)}, ${findings.length} finding(s), ${actions.length} action(s))`);

  // 6) read diagnosis
  step = "6. GET diagnosis";
  const getDiag = await call("GET", `/api/owner/sop/diagnoses/${cycleId}`, { cookie });
  if (getDiag.status !== 200 || getDiag.json?.id !== cycleId) fail(`/api/owner/sop/diagnoses/${cycleId}`, getDiag.status, safeBodySummary(getDiag.text));
  ok(step);

  // 7) findings
  step = "7. GET findings";
  const fRes = await call("GET", `/api/owner/sop/diagnoses/${cycleId}/findings`, { cookie });
  if (fRes.status !== 200 || !Array.isArray(fRes.json) || fRes.json.length === 0) fail(`/api/owner/sop/diagnoses/${cycleId}/findings`, fRes.status, safeBodySummary(fRes.text));
  ok(`${step} (${fRes.json.length})`);

  // 8) actions
  step = "8. GET actions";
  const aRes = await call("GET", `/api/owner/sop/diagnoses/${cycleId}/actions`, { cookie });
  if (aRes.status !== 200 || !Array.isArray(aRes.json) || aRes.json.length === 0) fail(`/api/owner/sop/diagnoses/${cycleId}/actions`, aRes.status, safeBodySummary(aRes.text));
  const action = aRes.json[0];
  if (!action?.id || action.status !== "proposed") fail(`/api/owner/sop/diagnoses/${cycleId}/actions`, aRes.status, `first action malformed (status ${action?.status})`);
  ok(`${step} (${aRes.json.length}; top ${maskId(action.id)})`);

  // 9) complete an action: proposed -> assigned -> in_progress -> completed
  const actionPath = `/api/owner/sop/actions/${action.id}`;
  step = "9a. PATCH action -> assigned";
  const a1 = await call("PATCH", actionPath, { cookie, body: { status: "assigned" } });
  if (a1.status !== 200 || a1.json?.status !== "assigned") fail(actionPath, a1.status, safeBodySummary(a1.text));
  ok(step);

  step = "9b. PATCH action -> in_progress";
  const a2 = await call("PATCH", actionPath, { cookie, body: { status: "in_progress" } });
  if (a2.status !== 200 || a2.json?.status !== "in_progress") fail(actionPath, a2.status, safeBodySummary(a2.text));
  ok(step);

  step = "9c. PATCH action -> completed (with evidence)";
  const a3 = await call("PATCH", actionPath, {
    cookie,
    body: { status: "completed", completionNotes: "Runtime proof: executed.", completionEvidence: ["runtime proof evidence"] },
  });
  if (a3.status !== 200 || a3.json?.status !== "completed" || !a3.json?.completedAt) fail(actionPath, a3.status, safeBodySummary(a3.text));
  ok(`${step} (completed ${maskId(action.id)})`);

  // 10) verify (execution metric improves "up")
  step = "10. POST verify";
  const verifyPath = `/api/owner/sop/actions/${action.id}/verify`;
  const verify = await call("POST", verifyPath, { cookie, body: { beforeValue: 50, afterValue: 92, targetDirection: "up", targetValue: 90, evidence: ["runtime proof"] } });
  if (verify.status !== 201 || !verify.json?.result?.status) fail(verifyPath, verify.status, safeBodySummary(verify.text));
  ok(`${step} (verification status: ${verify.json.result.status})`);

  // 11) dashboard reflects all
  step = "11. GET dashboard";
  const dashPath = `/api/owner/sop/dashboard?businessId=${businessId}`;
  const dash = await call("GET", dashPath, { cookie });
  if (dash.status !== 200 || dash.json?.hasData !== true) fail(dashPath, dash.status, safeBodySummary(dash.text));
  if (dash.json?.domainScore?.domain !== "sop") fail(dashPath, dash.status, "dashboard domainScore.domain != sop");
  if (!dash.json?.latestCycle || dash.json.latestCycle.id !== cycleId) fail(dashPath, dash.status, "dashboard latestCycle missing/mismatch");
  if (!dash.json?.latestSnapshot || dash.json.latestSnapshot.id !== snapshotId) fail(dashPath, dash.status, "dashboard latestSnapshot missing/mismatch");
  const dashActions: any[] = dash.json.latestCycle.actions ?? [];
  const dashAction = dashActions.find((x) => x.id === action.id);
  if (!dashAction || dashAction.status !== "completed") fail(dashPath, dash.status, "dashboard completed action not reflected");
  if (!Array.isArray(dashAction.verifications) || dashAction.verifications.length === 0) fail(dashPath, dash.status, "dashboard verification not reflected");
  if (!dash.json?.recommendedNextAction) fail(dashPath, dash.status, "dashboard recommendedNextAction missing");
  ok(`${step} (business + snapshot + cycle + findings + actions + verification reflected)`);

  // 12) execution dashboard UI page renders for the authenticated owner
  step = "12. GET /owner/execution (page renders)";
  const page = await call("GET", "/owner/execution", { cookie });
  if (page.status >= 400) fail("/owner/execution", page.status, safeBodySummary(page.text));
  ok(`${step} (status ${page.status})`);

  // 13) owner command center reflects the sop domain + a prioritized next action
  step = "13. GET /api/owner/command-center";
  const ccPath = `/api/owner/command-center?businessId=${businessId}`;
  const cc = await call("GET", ccPath, { cookie });
  if (cc.status !== 200 || cc.json?.hasData !== true) fail(ccPath, cc.status, safeBodySummary(cc.text));
  if (!Array.isArray(cc.json?.domainsWired) || !cc.json.domainsWired.includes("sop")) {
    fail(ccPath, cc.status, `command center missing sop domain (got [${(cc.json?.domainsWired ?? []).join(",")}])`);
  }
  if (!cc.json?.profile?.recommendedNextAction) fail(ccPath, cc.status, "command center missing recommendedNextAction");
  ok(`${step} (domains: ${cc.json.domainsWired.join(",")}; condition health ${Math.round(cc.json.profile.overallHealthScore)}, execution risk ${Math.round(cc.json.profile.executionRiskScore)})`);

  // 14) owner command-center home page renders for the authenticated owner
  step = "14. GET /owner (command center page renders)";
  const home = await call("GET", "/owner", { cookie });
  if (home.status >= 400) fail("/owner", home.status, safeBodySummary(home.text));
  ok(`${step} (status ${home.status})`);

  // --- SECURITY CHECKS ---
  step = "S1. unauthenticated sop endpoint blocked";
  const unauth = await call("GET", dashPath);
  if (unauth.status !== 401 && unauth.status !== 403) fail(dashPath, unauth.status, `expected 401/403, got ${unauth.status}`);
  ok(`${step} (status ${unauth.status})`);

  step = "S2. foreign business blocked";
  const foreignPath = `/api/owner/sop/businesses/00000000-0000-4000-8000-000000000000/snapshots`;
  const foreign = await call("GET", foreignPath, { cookie });
  if (foreign.status < 400) fail(foreignPath, foreign.status, `expected >=400, got ${foreign.status}`);
  ok(`${step} (status ${foreign.status})`);

  step = "S3. invalid payload rejected";
  const badSnap = await call("POST", snapPath, { cookie, body: { ...breakdownSnapshot(), actionsAssigned: -1 } });
  if (badSnap.status < 400 || badSnap.status >= 500) fail(snapPath, badSnap.status, `expected 4xx for negative actionsAssigned, got ${badSnap.status}`);
  ok(`${step} (status ${badSnap.status})`);

  step = "S4. invalid action transition rejected";
  const invalid = await call("PATCH", actionPath, { cookie, body: { status: "in_progress" } });
  if (invalid.status < 400 || invalid.status >= 500) fail(actionPath, invalid.status, `expected 4xx for completed->in_progress, got ${invalid.status}`);
  ok(`${step} (status ${invalid.status})`);

  console.log("\n✅ PASS — Module 7 SOP deployed runtime proof succeeded.");
  console.log("Summary:");
  console.log(`  deployed commit : ${deployedCommit.slice(0, 7)}`);
  console.log(`  business        : ${maskId(businessId)} (INR)`);
  console.log(`  snapshot        : ${maskId(snapshotId)}`);
  console.log(`  cycle           : ${maskId(cycleId)} (${findings.length} findings / ${actions.length} actions)`);
  console.log(`  action          : ${maskId(action.id)} -> completed -> verified`);
  console.log(`  security        : unauth ${unauth.status} · foreign ${foreign.status} · invalid-payload ${badSnap.status} · invalid-transition ${invalid.status}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(`\n❌ NETWORK_OR_RUNTIME_ERROR at step: ${step}`);
  console.error(`   ${err instanceof Error ? err.message : String(err)}`);
  console.error(`   (could not complete proof against ${baseUrl})`);
  process.exit(1);
});
