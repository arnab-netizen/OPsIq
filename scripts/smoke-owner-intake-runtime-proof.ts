#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-explicit-any -- HTTP JSON bodies are untyped; explicit any is pragmatic for a smoke client */
/**
 * Module 10 Connectors & Data Intake — DEPLOYED RUNTIME PROOF (HTTP only).
 *
 * Proves the Intake API loop against a DEPLOYED app over HTTP using a real
 * authenticated owner session. Exercises /api/owner/intake/* end to end: upload a
 * valid CSV → a normalized candidate (unconfirmed) → owner confirm; upload an
 * invalid CSV → a candidate that CANNOT be confirmed (fails closed, execution.md
 * §17); plus dashboard, the `/owner/intake` page, and auth-gating. It never touches
 * the DB directly and imports no server code.
 *
 * Deploy-freshness is checked by a capability probe (step 0b).
 *
 * SAFETY: never prints cookies, tokens, DB URLs, or secrets — only masked IDs.
 * Synthetic owner + business per run. Exits non-zero on any failed proof.
 *
 * Usage:
 *   BASE_URL=https://o-ps-iq.vercel.app npx tsx scripts/smoke-owner-intake-runtime-proof.ts
 *   DRY_RUN=true npx tsx scripts/smoke-owner-intake-runtime-proof.ts   # plan only, no network
 *   npx tsx scripts/smoke-owner-intake-runtime-proof.ts --help
 */

export {};

const baseUrl = (process.env.BASE_URL || "https://o-ps-iq.vercel.app").replace(/\/+$/, "");
const dryRun = process.env.DRY_RUN === "true" || process.argv.includes("--dry-run");
const showHelp = process.argv.includes("--help") || process.argv.includes("-h");
const expectedCommit = (process.env.EXPECTED_COMMIT || "").trim();

const ts = Date.now();
const testEmail = `opsiq-intake-runtime+${ts}@example.com`;
const testPassword = "IntakeRuntimeProof123!";
const testWorkspace = `Intake Runtime Proof ${ts}`;
const businessName = `Intake Runtime Proof ${ts}`;

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

const VALID_CSV = "periodStart,periodEnd,currency,revenue,fixedCosts\n2026-05-01,2026-05-31,INR,100000,40000";
// Breaks a REQUIRED field (periodStart is a required date) → validationStatus "invalid".
const INVALID_CSV = "periodStart,periodEnd,currency,revenue\nnotadate,2026-05-31,INR,100000";

function planLines(): string[] {
  return [
    `BASE_URL              : ${baseUrl}`,
    `synthetic email       : ${testEmail}`,
    `synthetic business    : ${businessName} (INR)`,
    "steps:",
    "  0  GET  /api/internal/build-info                                (deployment present)",
    "  0b GET  /api/owner/intake/dashboard (unauth)                    (intake feature deployed: JSON 401, not HTML)",
    "  1  POST /api/auth/signup                                        (owner session)",
    "  2  POST /api/owner/recovery/businesses                          (create business)",
    "  3  POST /api/owner/intake/businesses/{id}/uploads               (valid CSV → candidate)",
    "  4  GET  /api/owner/intake/uploads/{id}                          (read candidate, unconfirmed)",
    "  5  POST /api/owner/intake/uploads/{id}/confirm                  (owner confirm → confirmed)",
    "  6  POST /api/owner/intake/businesses/{id}/uploads               (invalid CSV → candidate)",
    "  7  POST /api/owner/intake/uploads/{invalidId}/confirm           (must FAIL: invalid cannot confirm)",
    "  8  GET  /api/owner/intake/dashboard?businessId={id}             (history reflects both)",
    "  9  GET  /owner/intake                                           (UI page renders)",
    "  10 GET  /owner                                                  (command center home renders)",
    "  security: unauth blocked; foreign business blocked; invalid payload rejected",
  ];
}

async function main(): Promise<void> {
  if (showHelp) {
    console.log("Module 10 Data Intake — deployed runtime proof (HTTP only)\n");
    console.log(planLines().join("\n"));
    console.log("\nEnv: BASE_URL, DRY_RUN=true, EXPECTED_COMMIT (optional). Flags: --dry-run, --help");
    process.exit(0);
  }

  console.log("🚀 Module 10 Data Intake — Deployed Runtime Proof");
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

  // 0b) the intake feature itself is deployed (deterministic capability probe).
  step = "0b. intake API deployed (capability probe)";
  const probe = await call("GET", "/api/owner/intake/dashboard");
  const looksHtml = probe.json === null && /^\s*<(?:!doctype|html)/i.test(probe.text.trim());
  if (looksHtml) {
    fail(
      "/api/owner/intake/dashboard",
      probe.status,
      "intake API returned the HTML app shell, not JSON — the Module 10 intake routes are NOT deployed at this base URL (stale deploy). Redeploy main, then re-run."
    );
  }
  if (probe.status !== 401 && probe.status !== 403) {
    fail("/api/owner/intake/dashboard", probe.status, `expected 401/403 JSON from the unauthenticated intake API, got ${probe.status}`);
  }
  ok(`${step} (unauth → ${probe.status} JSON; intake routes are live)`);

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

  // 3) upload a valid CSV → candidate
  step = "3. POST valid CSV upload";
  const uploadPath = `/api/owner/intake/businesses/${businessId}/uploads`;
  const up = await call("POST", uploadPath, { cookie, body: { source: "csv_upload", targetDomain: "finance", csvText: VALID_CSV } });
  if (up.status !== 201 || !up.json?.id) fail(uploadPath, up.status, safeBodySummary(up.text));
  const intakeId: string = up.json.id;
  if (up.json.validationStatus !== "valid") fail(uploadPath, up.status, `expected validationStatus=valid, got ${up.json.validationStatus}`);
  if (up.json.ownerConfirmed !== false) fail(uploadPath, up.status, "candidate was auto-confirmed (must be false)");
  ok(`${step} (intake ${maskId(intakeId)}, validation ${up.json.validationStatus}, ownerConfirmed false)`);

  // 4) read the candidate
  step = "4. GET candidate";
  const getIntake = await call("GET", `/api/owner/intake/uploads/${intakeId}`, { cookie });
  if (getIntake.status !== 200 || getIntake.json?.id !== intakeId) fail(`/api/owner/intake/uploads/${intakeId}`, getIntake.status, safeBodySummary(getIntake.text));
  if (getIntake.json.ownerConfirmed !== false) fail(`/api/owner/intake/uploads/${intakeId}`, getIntake.status, "candidate should be unconfirmed before confirm");
  ok(step);

  // 5) owner confirm → confirmed
  step = "5. POST confirm (valid candidate)";
  const confirm = await call("POST", `/api/owner/intake/uploads/${intakeId}/confirm`, { cookie });
  if (confirm.status !== 200 || confirm.json?.ownerConfirmed !== true || !confirm.json?.confirmedAt) {
    fail(`/api/owner/intake/uploads/${intakeId}/confirm`, confirm.status, safeBodySummary(confirm.text));
  }
  ok(`${step} (ownerConfirmed true)`);

  // 6) upload an invalid CSV → candidate (persisted but invalid)
  step = "6. POST invalid CSV upload";
  const upBad = await call("POST", uploadPath, { cookie, body: { source: "csv_upload", targetDomain: "finance", csvText: INVALID_CSV } });
  if (upBad.status !== 201 || !upBad.json?.id) fail(uploadPath, upBad.status, safeBodySummary(upBad.text));
  const invalidId: string = upBad.json.id;
  if (upBad.json.validationStatus !== "invalid") fail(uploadPath, upBad.status, `expected validationStatus=invalid, got ${upBad.json.validationStatus}`);
  ok(`${step} (intake ${maskId(invalidId)}, validation invalid, ${(upBad.json.errorReport ?? []).length} error(s))`);

  // 7) confirming an invalid candidate must FAIL closed
  step = "7. POST confirm (invalid candidate) must fail";
  const badConfirm = await call("POST", `/api/owner/intake/uploads/${invalidId}/confirm`, { cookie });
  if (badConfirm.status < 400 || badConfirm.status >= 500) {
    fail(`/api/owner/intake/uploads/${invalidId}/confirm`, badConfirm.status, `expected 4xx (invalid cannot confirm), got ${badConfirm.status}`);
  }
  ok(`${step} (status ${badConfirm.status} — invalid intake cannot be confirmed)`);

  // 8) dashboard reflects both intakes
  step = "8. GET dashboard";
  const dashPath = `/api/owner/intake/dashboard?businessId=${businessId}`;
  const dash = await call("GET", dashPath, { cookie });
  if (dash.status !== 200 || dash.json?.hasData !== true) fail(dashPath, dash.status, safeBodySummary(dash.text));
  const intakes: any[] = Array.isArray(dash.json.intakes) ? dash.json.intakes : [];
  if (intakes.length < 2) fail(dashPath, dash.status, `expected ≥2 intakes in history, got ${intakes.length}`);
  const confirmed = intakes.find((i) => i.id === intakeId);
  if (!confirmed || confirmed.ownerConfirmed !== true) fail(dashPath, dash.status, "confirmed intake not reflected in history");
  ok(`${step} (${intakes.length} intakes; confirmed one reflected)`);

  // 9) intake UI page renders
  step = "9. GET /owner/intake (page renders)";
  const page = await call("GET", "/owner/intake", { cookie });
  if (page.status >= 400) fail("/owner/intake", page.status, safeBodySummary(page.text));
  ok(`${step} (status ${page.status})`);

  // 10) owner command-center home renders
  step = "10. GET /owner (command center page renders)";
  const home = await call("GET", "/owner", { cookie });
  if (home.status >= 400) fail("/owner", home.status, safeBodySummary(home.text));
  ok(`${step} (status ${home.status})`);

  // --- SECURITY CHECKS ---
  step = "S1. unauthenticated intake endpoint blocked";
  const unauth = await call("GET", dashPath);
  if (unauth.status !== 401 && unauth.status !== 403) fail(dashPath, unauth.status, `expected 401/403, got ${unauth.status}`);
  ok(`${step} (status ${unauth.status})`);

  step = "S2. foreign business blocked";
  const foreignPath = `/api/owner/intake/businesses/00000000-0000-4000-8000-000000000000/uploads`;
  const foreign = await call("GET", foreignPath, { cookie });
  if (foreign.status < 400) fail(foreignPath, foreign.status, `expected >=400, got ${foreign.status}`);
  ok(`${step} (status ${foreign.status})`);

  step = "S3. invalid payload rejected (unsupported target domain)";
  const badPayload = await call("POST", uploadPath, { cookie, body: { source: "csv_upload", targetDomain: "portfolio", csvText: VALID_CSV } });
  if (badPayload.status < 400 || badPayload.status >= 500) fail(uploadPath, badPayload.status, `expected 4xx for unsupported targetDomain, got ${badPayload.status}`);
  ok(`${step} (status ${badPayload.status})`);

  console.log("\n✅ PASS — Module 10 Data Intake deployed runtime proof succeeded.");
  console.log("Summary:");
  console.log(`  deployed commit : ${deployedCommit.slice(0, 7)}`);
  console.log(`  business        : ${maskId(businessId)} (INR)`);
  console.log(`  valid intake    : ${maskId(intakeId)} -> confirmed`);
  console.log(`  invalid intake  : ${maskId(invalidId)} -> confirm rejected (${badConfirm.status})`);
  console.log(`  security        : unauth ${unauth.status} · foreign ${foreign.status} · invalid-payload ${badPayload.status}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(`\n❌ NETWORK_OR_RUNTIME_ERROR at step: ${step}`);
  console.error(`   ${err instanceof Error ? err.message : String(err)}`);
  console.error(`   (could not complete proof against ${baseUrl})`);
  process.exit(1);
});
