#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-explicit-any -- HTTP JSON bodies are untyped; explicit any is pragmatic for a smoke client */
/**
 * Module 9 Multi-Business Portfolio Command Center — DEPLOYED RUNTIME PROOF
 * (HTTP only).
 *
 * Proves the read-only Portfolio API against a DEPLOYED app over HTTP using a real
 * authenticated owner session. The portfolio owns no entity, so the proof first
 * seeds a real condition profile for a business via the deployed FINANCE loop
 * (snapshot → diagnosis), then asserts the portfolio dashboard/ranking/actions/
 * risks reflect it and the `/owner/portfolio` page renders. It never touches the
 * DB directly and imports no server code.
 *
 * Deploy-freshness is checked by a capability probe (step 0b) — an unauthenticated
 * portfolio route must return JSON 401/403, not the HTML app shell.
 *
 * SAFETY: never prints cookies, tokens, DB URLs, or secrets — only masked IDs.
 * Synthetic owner + business per run. Exits non-zero on any failed proof.
 *
 * Usage:
 *   BASE_URL=https://o-ps-iq.vercel.app npx tsx scripts/smoke-owner-portfolio-runtime-proof.ts
 *   DRY_RUN=true npx tsx scripts/smoke-owner-portfolio-runtime-proof.ts   # plan only, no network
 *   npx tsx scripts/smoke-owner-portfolio-runtime-proof.ts --help
 */

export {};

// MUTATION CLASSIFICATION:
//   USER_WORKSPACE_CREATION  — user and workspace created (permanent, no cleanup)
//   BUSINESS_RECORD_CREATION — business record created (permanent, no cleanup)
//   FINANCE_RECORDS          — finance seed records created for portfolio proof (permanent)

import { enforceProductionGuard, resolveSmokePassword } from "./lib/smoke-production-guard.js";

const baseUrl = (process.env.BASE_URL || "https://o-ps-iq.vercel.app").replace(/\/+$/, "");
const dryRun = process.env.DRY_RUN === "true" || process.argv.includes("--dry-run");
const showHelp = process.argv.includes("--help") || process.argv.includes("-h");
const expectedCommit = (process.env.EXPECTED_COMMIT || "").trim();

const ts = Date.now();
const testEmail = `opsiq-portfolio-runtime+${ts}@example.com`;
const testPassword = resolveSmokePassword(baseUrl, "smoke-owner-portfolio-runtime-proof");
const testWorkspace = `Portfolio Runtime Proof ${ts}`;
const businessName = `Portfolio Runtime Proof ${ts}`;

if (!dryRun && !showHelp) {
  enforceProductionGuard(baseUrl, {
    mutationClasses: ["USER_WORKSPACE_CREATION", "BUSINESS_RECORD_CREATION", "FINANCE_RECORDS"],
    mutationPreview: [
      `target    : ${baseUrl}`,
      `test email: ${testEmail}  (permanent — no automated cleanup)`,
      "creates   : user, workspace, business, finance seed records for portfolio proof",
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
  // Poor finance metrics → guarantees a condition profile with findings + actions.
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
    "  0b GET  /api/owner/portfolio/dashboard (unauth)                 (portfolio feature deployed: JSON 401, not HTML)",
    "  1  POST /api/auth/signup                                        (owner session)",
    "  2  POST /api/owner/recovery/businesses                          (create business)",
    "  3  POST /api/owner/finance/businesses/{id}/snapshots            (seed: finance snapshot)",
    "  4  POST /api/owner/finance/businesses/{id}/diagnoses            (seed: finance diagnosis → condition profile)",
    "  5  GET  /api/owner/portfolio/dashboard                          (reflects the business + scores)",
    "  6  GET  /api/owner/portfolio/ranking                            (most-urgent business identified)",
    "  7  GET  /api/owner/portfolio/actions                            (top-3 priorities / action queue)",
    "  8  GET  /api/owner/portfolio/risks                              (risk alerts + investment rec)",
    "  9  GET  /owner/portfolio                                        (UI page renders)",
    "  10 GET  /owner                                                  (command center home renders)",
    "  security: all 4 portfolio reads blocked when unauthenticated",
  ];
}

async function main(): Promise<void> {
  if (showHelp) {
    console.log("Module 9 Portfolio — deployed runtime proof (HTTP only)\n");
    console.log(planLines().join("\n"));
    console.log("\nEnv: BASE_URL, DRY_RUN=true, EXPECTED_COMMIT (optional). Flags: --dry-run, --help");
    process.exit(0);
  }

  console.log("🚀 Module 9 Portfolio — Deployed Runtime Proof");
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

  // 0b) the portfolio feature itself is deployed (deterministic capability probe).
  step = "0b. portfolio API deployed (capability probe)";
  const probe = await call("GET", "/api/owner/portfolio/dashboard");
  const looksHtml = probe.json === null && /^\s*<(?:!doctype|html)/i.test(probe.text.trim());
  if (looksHtml) {
    fail(
      "/api/owner/portfolio/dashboard",
      probe.status,
      "portfolio API returned the HTML app shell, not JSON — the Module 9 portfolio routes are NOT deployed at this base URL (stale deploy). Redeploy main, then re-run."
    );
  }
  if (probe.status !== 401 && probe.status !== 403) {
    fail(
      "/api/owner/portfolio/dashboard",
      probe.status,
      `expected 401/403 JSON from the unauthenticated portfolio API, got ${probe.status} — the portfolio API may not be deployed`
    );
  }
  ok(`${step} (unauth → ${probe.status} JSON; portfolio routes are live)`);

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

  // 4) seed: finance diagnosis → produces the business condition profile
  step = "4. POST finance diagnosis (seed)";
  const diagPath = `/api/owner/finance/businesses/${businessId}/diagnoses`;
  const diag = await call("POST", diagPath, { cookie, body: { snapshotId } });
  if (diag.status !== 201 || !diag.json?.id) fail(diagPath, diag.status, safeBodySummary(diag.text));
  ok(`${step} (cycle ${maskId(diag.json.id)})`);

  // 5) portfolio dashboard reflects the business
  step = "5. GET /api/owner/portfolio/dashboard";
  const dash = await call("GET", "/api/owner/portfolio/dashboard", { cookie });
  if (dash.status !== 200 || dash.json?.hasData !== true) fail("/api/owner/portfolio/dashboard", dash.status, safeBodySummary(dash.text));
  const businesses: any[] = Array.isArray(dash.json.businesses) ? dash.json.businesses : [];
  const mine = businesses.find((b) => b.businessId === businessId);
  if (!mine) fail("/api/owner/portfolio/dashboard", dash.status, "portfolio does not include the seeded business");
  if (mine.hasData !== true) fail("/api/owner/portfolio/dashboard", dash.status, "seeded business shows hasData=false");
  if (mine.financialScore === null || mine.financialScore === undefined) fail("/api/owner/portfolio/dashboard", dash.status, "seeded business has no financialScore");
  if (typeof dash.json.portfolioHealthScore !== "number") fail("/api/owner/portfolio/dashboard", dash.status, "portfolioHealthScore missing");
  ok(`${step} (businessCount ${dash.json.businessCount}, portfolioHealth ${Math.round(dash.json.portfolioHealthScore)}, financialScore ${mine.financialScore})`);

  // 6) ranking identifies the most-urgent business
  step = "6. GET /api/owner/portfolio/ranking";
  const ranking = await call("GET", "/api/owner/portfolio/ranking", { cookie });
  if (ranking.status !== 200 || ranking.json?.hasData !== true) fail("/api/owner/portfolio/ranking", ranking.status, safeBodySummary(ranking.text));
  if (ranking.json?.ranking?.mostUrgentBusinessId !== businessId) {
    fail("/api/owner/portfolio/ranking", ranking.status, `mostUrgentBusinessId != seeded business (got ${maskId(ranking.json?.ranking?.mostUrgentBusinessId)})`);
  }
  ok(`${step} (most urgent = seeded business)`);

  // 7) actions: top-3 priorities + per-business action queue
  step = "7. GET /api/owner/portfolio/actions";
  const acts = await call("GET", "/api/owner/portfolio/actions", { cookie });
  if (acts.status !== 200 || !Array.isArray(acts.json?.top3Priorities) || !Array.isArray(acts.json?.actionQueue)) {
    fail("/api/owner/portfolio/actions", acts.status, safeBodySummary(acts.text));
  }
  const queued = acts.json.actionQueue.find((q: any) => q.businessId === businessId);
  if (!queued || !queued.recommendedNextAction) fail("/api/owner/portfolio/actions", acts.status, "seeded business has no recommended next action in the queue");
  ok(`${step} (top3 ${acts.json.top3Priorities.length}; seeded business has a next action)`);

  // 8) risks: alerts + investment recommendation
  step = "8. GET /api/owner/portfolio/risks";
  const risks = await call("GET", "/api/owner/portfolio/risks", { cookie });
  if (risks.status !== 200 || !Array.isArray(risks.json?.riskAlerts)) fail("/api/owner/portfolio/risks", risks.status, safeBodySummary(risks.text));
  ok(`${step} (${risks.json.riskAlerts.length} alert(s))`);

  // 9) portfolio UI page renders
  step = "9. GET /owner/portfolio (page renders)";
  const page = await call("GET", "/owner/portfolio", { cookie });
  if (page.status >= 400) fail("/owner/portfolio", page.status, safeBodySummary(page.text));
  ok(`${step} (status ${page.status})`);

  // 10) owner command-center home renders
  step = "10. GET /owner (command center page renders)";
  const home = await call("GET", "/owner", { cookie });
  if (home.status >= 400) fail("/owner", home.status, safeBodySummary(home.text));
  ok(`${step} (status ${home.status})`);

  // --- SECURITY CHECKS (read-only module → all four reads must be auth-gated) ---
  const readRoutes = [
    "/api/owner/portfolio/dashboard",
    "/api/owner/portfolio/ranking",
    "/api/owner/portfolio/actions",
    "/api/owner/portfolio/risks",
  ];
  const unauthStatuses: number[] = [];
  for (const r of readRoutes) {
    step = `S. unauthenticated ${r} blocked`;
    const u = await call("GET", r);
    if (u.status !== 401 && u.status !== 403) fail(r, u.status, `expected 401/403, got ${u.status}`);
    unauthStatuses.push(u.status);
  }
  ok(`security: all 4 portfolio reads blocked unauthenticated (${unauthStatuses.join(", ")})`);

  console.log("\n✅ PASS — Module 9 Portfolio deployed runtime proof succeeded.");
  console.log("Summary:");
  console.log(`  deployed commit : ${deployedCommit.slice(0, 7)}`);
  console.log(`  business        : ${maskId(businessId)} (INR, seeded via finance loop)`);
  console.log(`  portfolio       : businessCount ${dash.json.businessCount} · health ${Math.round(dash.json.portfolioHealthScore)} · most-urgent = seeded`);
  console.log(`  reads           : dashboard/ranking/actions/risks all 200; UI /owner/portfolio + /owner render`);
  console.log(`  security        : unauth ${unauthStatuses.join("/")}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(`\n❌ NETWORK_OR_RUNTIME_ERROR at step: ${step}`);
  console.error(`   ${err instanceof Error ? err.message : String(err)}`);
  console.error(`   (could not complete proof against ${baseUrl})`);
  process.exit(1);
});
