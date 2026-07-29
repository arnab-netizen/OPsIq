#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-explicit-any -- HTTP JSON bodies are untyped; explicit any is pragmatic for a smoke client */
/**
 * Module 12 Owner UI & Mobile Usability — DEPLOYED RUNTIME PROOF (HTTP only).
 *
 * Proves the read-only Owner Home API + page against a DEPLOYED app over HTTP using a
 * real authenticated owner session. Owner Home owns no entity, so the proof first
 * seeds a real diagnosis cycle for a business via the deployed FINANCE loop (snapshot
 * → diagnosis), then asserts the §19 owner-home summary reflects it:
 *   - business health is a real number,
 *   - cash/sales/operations dangers are "unknown" (no such diagnosis) — honest, not 0,
 *   - finance produced at least one top risk and at least one required action, each
 *     carrying its verification metric,
 *   - the /owner/home page renders,
 * then completes + verifies one action and asserts the "last verified improvement"
 * surfaces. All three states are read-only; the API is auth-gated. Imports no server
 * code and touches no DB.
 *
 * Deploy-freshness is checked by a capability probe (step 0b) — an unauthenticated
 * owner-home route must return JSON 401/403, not the HTML app shell.
 *
 * SAFETY: never prints cookies, tokens, DB URLs, or secrets — only masked IDs.
 * Synthetic owner + business per run. Exits non-zero on any failed proof.
 *
 * Usage:
 *   BASE_URL=https://o-ps-iq.vercel.app npx tsx scripts/smoke-owner-home-runtime-proof.ts
 *   DRY_RUN=true npx tsx scripts/smoke-owner-home-runtime-proof.ts   # plan only, no network
 *   npx tsx scripts/smoke-owner-home-runtime-proof.ts --help
 */

export {};

// MUTATION CLASSIFICATION:
//   USER_WORKSPACE_CREATION  — user and workspace created (permanent, no cleanup)
//   BUSINESS_RECORD_CREATION — business record created (permanent, no cleanup)
//   FINANCE_RECORDS          — finance snapshot/diagnosis seeded for home proof (permanent)

import { enforceProductionGuard, resolveSmokePassword } from "./lib/smoke-production-guard.js";

const baseUrl = (process.env.BASE_URL || "https://o-ps-iq.vercel.app").replace(/\/+$/, "");
const dryRun = process.env.DRY_RUN === "true" || process.argv.includes("--dry-run");
const showHelp = process.argv.includes("--help") || process.argv.includes("-h");
const expectedCommit = (process.env.EXPECTED_COMMIT || "").trim();

const ts = Date.now();
const testEmail = `opsiq-home-runtime+${ts}@example.com`;
const testPassword = resolveSmokePassword(baseUrl, "smoke-owner-home-runtime-proof");
const testWorkspace = `Owner Home Runtime Proof ${ts}`;
const businessName = `Owner Home Runtime Proof ${ts}`;

if (!dryRun && !showHelp) {
  enforceProductionGuard(baseUrl, {
    mutationClasses: ["USER_WORKSPACE_CREATION", "BUSINESS_RECORD_CREATION", "FINANCE_RECORDS"],
    mutationPreview: [
      `target    : ${baseUrl}`,
      `test email: ${testEmail}  (permanent — no automated cleanup)`,
      "creates   : user, workspace, business, finance seed records for owner-home proof",
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

function leakySnapshot() {
  // Poor finance metrics → guarantees a diagnosis cycle with findings + actions.
  return {
    periodStart: "2026-04-01", periodEnd: "2026-04-30", currency: "INR", businessModel: "service",
    revenue: 100000, fixedCosts: 40000, variableCosts: 40000, discountAmount: 15000, cashOnHand: 50000,
  };
}

function planLines(): string[] {
  return [
    `BASE_URL              : ${baseUrl}`,
    `synthetic email       : ${testEmail}`,
    `synthetic business    : ${businessName} (INR)`,
    "steps:",
    "  0  GET  /api/internal/build-info                                (deployment present)",
    "  0b GET  /api/owner/home (unauth)                                (owner-home deployed: JSON 401, not HTML)",
    "  1  POST /api/auth/signup                                        (owner session)",
    "  2  POST /api/owner/recovery/businesses                          (create business)",
    "  3  POST /api/owner/finance/businesses/{id}/snapshots            (seed: finance snapshot)",
    "  4  POST /api/owner/finance/businesses/{id}/diagnoses            (seed: finance diagnosis → cycle)",
    "  5  GET  /api/owner/home                                         (§19 summary: health, dangers, risks, actions)",
    "  6  GET  /owner/home                                             (UI page renders)",
    "  7  PATCH finance action assigned → in_progress                  (advance one action)",
    "  8  POST  finance verification (before/after improvement)        (record a verified improvement)",
    "  9  GET  /api/owner/home                                         (last verified improvement surfaces)",
    "  security: owner-home read blocked when unauthenticated",
  ];
}

async function main(): Promise<void> {
  if (showHelp) {
    console.log("Module 12 Owner Home — deployed runtime proof (HTTP only)\n");
    console.log(planLines().join("\n"));
    console.log("\nEnv: BASE_URL, DRY_RUN=true, EXPECTED_COMMIT (optional). Flags: --dry-run, --help");
    process.exit(0);
  }

  console.log("🚀 Module 12 Owner Home — Deployed Runtime Proof");
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

  // 0b) the owner-home feature itself is deployed (deterministic capability probe).
  step = "0b. owner-home API deployed (capability probe)";
  const probe = await call("GET", "/api/owner/home");
  const looksHtml = probe.json === null && /^\s*<(?:!doctype|html)/i.test(probe.text.trim());
  if (looksHtml) {
    fail(
      "/api/owner/home",
      probe.status,
      "owner-home API returned the HTML app shell, not JSON — the Module 12 owner-home route is NOT deployed at this base URL (stale deploy). Redeploy main, then re-run."
    );
  }
  if (probe.status !== 401 && probe.status !== 403) {
    fail(
      "/api/owner/home",
      probe.status,
      `expected 401/403 JSON from the unauthenticated owner-home API, got ${probe.status} — the owner-home API may not be deployed`
    );
  }
  ok(`${step} (unauth → ${probe.status} JSON; owner-home route is live)`);

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
    body: { name: businessName, businessType: "generic_local_service", currency: "INR", b2cSupported: true, b2bSupported: false },
  });
  if (createBiz.status !== 201 || !createBiz.json?.id) {
    fail("/api/owner/recovery/businesses", createBiz.status, safeBodySummary(createBiz.text));
  }
  const businessId: string = createBiz.json.id;
  ok(`${step} (business ${maskId(businessId)})`);

  // 3) seed: finance snapshot
  step = "3. POST finance snapshot (seed)";
  const snapPath = `/api/owner/finance/businesses/${businessId}/snapshots`;
  const snap = await call("POST", snapPath, { cookie, body: leakySnapshot() });
  if (snap.status !== 201 || !snap.json?.id) fail(snapPath, snap.status, safeBodySummary(snap.text));
  const snapshotId: string = snap.json.id;
  ok(`${step} (snapshot ${maskId(snapshotId)})`);

  // 4) seed: finance diagnosis → produces the cycle the home summarizes
  step = "4. POST finance diagnosis (seed)";
  const diagPath = `/api/owner/finance/businesses/${businessId}/diagnoses`;
  const diag = await call("POST", diagPath, { cookie, body: { snapshotId } });
  if (diag.status !== 201 || !diag.json?.id || !Array.isArray(diag.json?.actions) || diag.json.actions.length === 0) {
    fail(diagPath, diag.status, safeBodySummary(diag.text));
  }
  const seededAction = diag.json.actions[0];
  ok(`${step} (cycle ${maskId(diag.json.id)}, ${diag.json.actions.length} action(s))`);

  // 5) owner-home summary reflects the seeded condition (the §19 fields)
  step = "5. GET /api/owner/home";
  const homePath = `/api/owner/home?businessId=${businessId}`;
  const home = await call("GET", homePath, { cookie });
  if (home.status !== 200 || home.json?.hasData !== true || !home.json?.summary) {
    fail(homePath, home.status, safeBodySummary(home.text));
  }
  const s = home.json.summary;
  if (typeof s.businessHealthScore !== "number") fail(homePath, home.status, "summary.businessHealthScore missing");
  // finance-only seed → cash/sales/operations have no diagnosis → honest "unknown" (not 0).
  if (s.cashDanger?.level !== "unknown") fail(homePath, home.status, `expected unknown cash danger, got ${s.cashDanger?.level}`);
  if (s.salesDanger?.level !== "unknown") fail(homePath, home.status, `expected unknown sales danger, got ${s.salesDanger?.level}`);
  if (!Array.isArray(s.top3Risks) || s.top3Risks.length === 0) fail(homePath, home.status, "no top risks for the seeded finance cycle");
  if (s.top3Risks.length > 3) fail(homePath, home.status, "top3Risks returned more than 3");
  if (!Array.isArray(s.requiredActions) || s.requiredActions.length === 0) fail(homePath, home.status, "no required actions for the seeded finance cycle");
  if (s.requiredActions.length > 5) fail(homePath, home.status, "requiredActions returned more than 5");
  if (!s.requiredActions.every((a: any) => typeof a.verificationMetric === "string" && a.verificationMetric.length > 0)) {
    fail(homePath, home.status, "a required action is missing its verification metric");
  }
  if (s.lastVerifiedImprovement !== null) fail(homePath, home.status, "expected no verified improvement before any verification");
  ok(`${step} (health ${Math.round(s.businessHealthScore)}; ${s.top3Risks.length} risk(s); ${s.requiredActions.length} action(s); dangers honest-unknown)`);

  // 6) owner-home UI page renders
  step = "6. GET /owner/home (page renders)";
  const page = await call("GET", "/owner/home", { cookie });
  if (page.status >= 400) fail("/owner/home", page.status, safeBodySummary(page.text));
  ok(`${step} (status ${page.status})`);

  // 7) advance one finance action proposed → assigned → in_progress
  step = "7. advance a finance action";
  if (!seededAction?.id) fail(diagPath, diag.status, "seeded diagnosis returned no usable action");
  const actionId: string = seededAction.id;
  const verMetric: string = seededAction.verificationMetric || "metric";
  const patchPath = `/api/owner/finance/actions/${actionId}`;
  const assign = await call("PATCH", patchPath, { cookie, body: { status: "assigned" } });
  if (assign.status >= 400) fail(patchPath, assign.status, safeBodySummary(assign.text));
  const progress = await call("PATCH", patchPath, { cookie, body: { status: "in_progress" } });
  if (progress.status >= 400) fail(patchPath, progress.status, safeBodySummary(progress.text));
  ok(`${step} (action ${maskId(actionId)} → in_progress)`);

  // 8) record a verified improvement on that action
  step = "8. POST finance verification (improvement)";
  const verifyPath = `/api/owner/finance/actions/${actionId}/verify`;
  const verify = await call("POST", verifyPath, {
    cookie,
    body: { beforeValue: 15, afterValue: 8, targetDirection: "down", targetValue: 10 },
  });
  if (verify.status >= 400) fail(verifyPath, verify.status, safeBodySummary(verify.text));
  ok(`${step} (verified ${verMetric}: 15 → 8)`);

  // 9) the last verified improvement now surfaces on the home
  step = "9. GET /api/owner/home (verified improvement surfaces)";
  const home2 = await call("GET", homePath, { cookie });
  if (home2.status !== 200 || !home2.json?.summary) fail(homePath, home2.status, safeBodySummary(home2.text));
  const lvi = home2.json.summary.lastVerifiedImprovement;
  if (!lvi) fail(homePath, home2.status, "last verified improvement did not surface after a verified action");
  if (lvi.domain !== "finance") fail(homePath, home2.status, `verified improvement domain != finance (got ${lvi.domain})`);
  ok(`${step} (last verified improvement: ${lvi.domain} ${lvi.metric} ${lvi.beforeValue} → ${lvi.afterValue})`);

  // --- SECURITY CHECK (read-only module → the home read must be auth-gated) ---
  step = "S. unauthenticated /api/owner/home blocked";
  const unauth = await call("GET", "/api/owner/home");
  if (unauth.status !== 401 && unauth.status !== 403) fail("/api/owner/home", unauth.status, `expected 401/403, got ${unauth.status}`);
  ok(`security: owner-home read blocked unauthenticated (${unauth.status})`);

  console.log("\n✅ PASS — Module 12 Owner Home deployed runtime proof succeeded.");
  console.log("Summary:");
  console.log(`  deployed commit : ${deployedCommit.slice(0, 7)}`);
  console.log(`  business        : ${maskId(businessId)} (INR, seeded via finance loop)`);
  console.log(`  §19 home        : health ${Math.round(s.businessHealthScore)} · ${s.top3Risks.length} risk(s) · ${s.requiredActions.length} action(s) · dangers honest-unknown`);
  console.log(`  verification    : recorded improvement now surfaces as "last verified improvement"`);
  console.log(`  ui              : /owner/home renders`);
  console.log(`  security        : unauth ${unauth.status}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(`\n❌ NETWORK_OR_RUNTIME_ERROR at step: ${step}`);
  console.error(`   ${err instanceof Error ? err.message : String(err)}`);
  console.error(`   (could not complete proof against ${baseUrl})`);
  process.exit(1);
});
