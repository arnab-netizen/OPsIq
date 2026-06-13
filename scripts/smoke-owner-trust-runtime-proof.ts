#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-explicit-any -- HTTP JSON bodies are untyped; explicit any is pragmatic for a smoke client */
/**
 * Module 11 Trust, Audit & Explainability — DEPLOYED RUNTIME PROOF (HTTP only).
 *
 * Proves the read-only Trust API against a DEPLOYED app over HTTP using a real
 * authenticated owner session. Trust owns no entity, so the proof first seeds a real
 * diagnosis cycle for a business via the deployed FINANCE loop (snapshot → diagnosis),
 * then asserts:
 *   - /api/owner/trust/cycles surfaces that finance cycle for the business,
 *   - /api/owner/trust/explanations returns credible §18 cards that never invent
 *     values (every card carries the eight fields and hasInventedValues === false),
 *   - /api/owner/trust/audit-trail surfaces the governed diagnosis-run event,
 *   - the /owner/trust page renders,
 * and that all three trust reads are auth-gated. It never touches the DB directly and
 * imports no server code.
 *
 * Deploy-freshness is checked by a capability probe (step 0b) — an unauthenticated
 * trust route must return JSON 401/403, not the HTML app shell.
 *
 * SAFETY: never prints cookies, tokens, DB URLs, or secrets — only masked IDs.
 * Synthetic owner + business per run. Exits non-zero on any failed proof.
 *
 * Usage:
 *   BASE_URL=https://o-ps-iq.vercel.app npx tsx scripts/smoke-owner-trust-runtime-proof.ts
 *   DRY_RUN=true npx tsx scripts/smoke-owner-trust-runtime-proof.ts   # plan only, no network
 *   npx tsx scripts/smoke-owner-trust-runtime-proof.ts --help
 */

export {};

const baseUrl = (process.env.BASE_URL || "https://o-ps-iq.vercel.app").replace(/\/+$/, "");
const dryRun = process.env.DRY_RUN === "true" || process.argv.includes("--dry-run");
const showHelp = process.argv.includes("--help") || process.argv.includes("-h");
const expectedCommit = (process.env.EXPECTED_COMMIT || "").trim();

const FINANCE_DIAGNOSIS_RUN_EVENT = "owner.finance_diagnosis_run";

const ts = Date.now();
const testEmail = `opsiq-trust-runtime+${ts}@example.com`;
const testPassword = "TrustRuntimeProof123!";
const testWorkspace = `Trust Runtime Proof ${ts}`;
const businessName = `Trust Runtime Proof ${ts}`;

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
    "  0b GET  /api/owner/trust/cycles (unauth)                        (trust feature deployed: JSON 401, not HTML)",
    "  1  POST /api/auth/signup                                        (owner session)",
    "  2  POST /api/owner/recovery/businesses                          (create business)",
    "  3  POST /api/owner/finance/businesses/{id}/snapshots            (seed: finance snapshot)",
    "  4  POST /api/owner/finance/businesses/{id}/diagnoses            (seed: finance diagnosis → cycle)",
    "  5  GET  /api/owner/trust/cycles                                 (surfaces the finance cycle for the business)",
    "  6  GET  /api/owner/trust/explanations?domain=finance&cycleId=   (§18 cards; no invented values)",
    "  7  GET  /api/owner/trust/audit-trail?entityId={cycleId}         (governed diagnosis-run event present)",
    "  8  GET  /owner/trust                                            (UI page renders)",
    "  9  GET  /owner                                                  (command center home renders)",
    "  security: all 3 trust reads blocked when unauthenticated",
  ];
}

async function main(): Promise<void> {
  if (showHelp) {
    console.log("Module 11 Trust & Explainability — deployed runtime proof (HTTP only)\n");
    console.log(planLines().join("\n"));
    console.log("\nEnv: BASE_URL, DRY_RUN=true, EXPECTED_COMMIT (optional). Flags: --dry-run, --help");
    process.exit(0);
  }

  console.log("🚀 Module 11 Trust & Explainability — Deployed Runtime Proof");
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

  // 0b) the trust feature itself is deployed (deterministic capability probe).
  step = "0b. trust API deployed (capability probe)";
  const probe = await call("GET", "/api/owner/trust/cycles");
  const looksHtml = probe.json === null && /^\s*<(?:!doctype|html)/i.test(probe.text.trim());
  if (looksHtml) {
    fail(
      "/api/owner/trust/cycles",
      probe.status,
      "trust API returned the HTML app shell, not JSON — the Module 11 trust routes are NOT deployed at this base URL (stale deploy). Redeploy main, then re-run."
    );
  }
  if (probe.status !== 401 && probe.status !== 403) {
    fail(
      "/api/owner/trust/cycles",
      probe.status,
      `expected 401/403 JSON from the unauthenticated trust API, got ${probe.status} — the trust API may not be deployed`
    );
  }
  ok(`${step} (unauth → ${probe.status} JSON; trust routes are live)`);

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

  // 4) seed: finance diagnosis → produces the diagnosis cycle to explain
  step = "4. POST finance diagnosis (seed)";
  const diagPath = `/api/owner/finance/businesses/${businessId}/diagnoses`;
  const diag = await call("POST", diagPath, { cookie, body: { snapshotId } });
  if (diag.status !== 201 || !diag.json?.id) fail(diagPath, diag.status, safeBodySummary(diag.text));
  const diagCycleId: string = diag.json.id;
  ok(`${step} (cycle ${maskId(diagCycleId)})`);

  // 5) trust cycles surfaces the finance cycle for the business
  step = "5. GET /api/owner/trust/cycles";
  const cyclesPath = `/api/owner/trust/cycles?businessId=${businessId}`;
  const cyclesRes = await call("GET", cyclesPath, { cookie });
  if (cyclesRes.status !== 200 || !Array.isArray(cyclesRes.json?.cycles)) {
    fail(cyclesPath, cyclesRes.status, safeBodySummary(cyclesRes.text));
  }
  const financeCycle = cyclesRes.json.cycles.find((c: any) => c.domain === "finance");
  if (!financeCycle) fail(cyclesPath, cyclesRes.status, "trust cycles does not include the seeded finance cycle");
  if (financeCycle.cycleId !== diagCycleId) {
    fail(cyclesPath, cyclesRes.status, `latest finance cycleId != seeded cycle (got ${maskId(financeCycle.cycleId)})`);
  }
  const cycleId: string = financeCycle.cycleId;
  ok(`${step} (finance cycle #${financeCycle.sequenceNumber} = seeded cycle)`);

  // 6) explanations: credible §18 cards that never invent values
  step = "6. GET /api/owner/trust/explanations (finance)";
  const explPath = `/api/owner/trust/explanations?domain=finance&cycleId=${cycleId}`;
  const expl = await call("GET", explPath, { cookie });
  if (expl.status !== 200 || !Array.isArray(expl.json?.explanations)) {
    fail(explPath, expl.status, safeBodySummary(expl.text));
  }
  const cards: any[] = expl.json.explanations;
  if (cards.length === 0) fail(explPath, expl.status, "no explanation cards for the seeded diagnosis cycle");
  for (const c of cards) {
    const eightFields =
      typeof c.whatWasDetected === "string" && c.whatWasDetected.length > 0 &&
      typeof c.whyItMatters === "string" && c.whyItMatters.length > 0 &&
      c.sourceDataUsed && typeof c.sourceDataUsed.metric === "string" &&
      typeof c.calculationUsed === "string" && c.calculationUsed.length > 0 &&
      c.confidence && ["low", "moderate", "high"].includes(c.confidence.label) &&
      typeof c.riskIfIgnored === "string" && c.riskIfIgnored.length > 0 &&
      c.expectedImpact && ["low", "moderate", "high"].includes(c.expectedImpact.label) &&
      c.verification && ("metric" in c.verification) && ("method" in c.verification);
    if (!eightFields) fail(explPath, expl.status, `card ${c.findingCode} is missing one of the eight §18 fields`);
    if (c.hasInventedValues !== false) fail(explPath, expl.status, `card ${c.findingCode} does not assert hasInventedValues=false (anti-hallucination invariant)`);
    // A null source value must be honestly labeled "missing" and surfaced as a gap.
    if (c.sourceDataUsed.value === null) {
      if (c.sourceDataUsed.valueLabel !== "missing") fail(explPath, expl.status, `card ${c.findingCode} has a null source value not labeled "missing"`);
      if (!Array.isArray(c.dataGaps) || !c.dataGaps.includes(c.sourceDataUsed.metric)) {
        fail(explPath, expl.status, `card ${c.findingCode} missing source value not surfaced as a data gap`);
      }
    }
  }
  ok(`${step} (${cards.length} card(s); all eight §18 fields present; no invented values)`);

  // 7) audit trail surfaces the governed diagnosis-run event for the cycle
  step = "7. GET /api/owner/trust/audit-trail";
  const auditPath = `/api/owner/trust/audit-trail?entityId=${cycleId}`;
  const audit = await call("GET", auditPath, { cookie });
  if (audit.status !== 200 || !Array.isArray(audit.json?.events)) fail(auditPath, audit.status, safeBodySummary(audit.text));
  const events: any[] = audit.json.events;
  if (events.length === 0) fail(auditPath, audit.status, "audit trail is empty for the seeded cycle");
  if (!events.some((e) => e.eventName === FINANCE_DIAGNOSIS_RUN_EVENT)) {
    fail(auditPath, audit.status, `audit trail missing the governed ${FINANCE_DIAGNOSIS_RUN_EVENT} event`);
  }
  if (!events.every((e) => e.entityId === cycleId)) {
    fail(auditPath, audit.status, "audit trail leaked events for a different entity");
  }
  ok(`${step} (${events.length} event(s); diagnosis-run event present; entity-scoped)`);

  // 8) trust UI page renders
  step = "8. GET /owner/trust (page renders)";
  const page = await call("GET", "/owner/trust", { cookie });
  if (page.status >= 400) fail("/owner/trust", page.status, safeBodySummary(page.text));
  ok(`${step} (status ${page.status})`);

  // 9) owner command-center home renders
  step = "9. GET /owner (command center page renders)";
  const home = await call("GET", "/owner", { cookie });
  if (home.status >= 400) fail("/owner", home.status, safeBodySummary(home.text));
  ok(`${step} (status ${home.status})`);

  // --- SECURITY CHECKS (read-only module → all three reads must be auth-gated) ---
  const readRoutes = [
    `/api/owner/trust/cycles?businessId=${businessId}`,
    `/api/owner/trust/explanations?domain=finance&cycleId=${cycleId}`,
    `/api/owner/trust/audit-trail?entityId=${cycleId}`,
  ];
  const unauthStatuses: number[] = [];
  for (const r of readRoutes) {
    step = `S. unauthenticated ${r.split("?")[0]} blocked`;
    const u = await call("GET", r);
    if (u.status !== 401 && u.status !== 403) fail(r, u.status, `expected 401/403, got ${u.status}`);
    unauthStatuses.push(u.status);
  }
  ok(`security: all 3 trust reads blocked unauthenticated (${unauthStatuses.join(", ")})`);

  console.log("\n✅ PASS — Module 11 Trust & Explainability deployed runtime proof succeeded.");
  console.log("Summary:");
  console.log(`  deployed commit : ${deployedCommit.slice(0, 7)}`);
  console.log(`  business        : ${maskId(businessId)} (INR, seeded via finance loop)`);
  console.log(`  cycle           : ${maskId(cycleId)} (finance #${financeCycle.sequenceNumber})`);
  console.log(`  explanations    : ${cards.length} §18 card(s); hasInventedValues=false on every card`);
  console.log(`  audit trail     : ${events.length} entity-scoped event(s); diagnosis-run present`);
  console.log(`  ui              : /owner/trust + /owner render`);
  console.log(`  security        : unauth ${unauthStatuses.join("/")}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(`\n❌ NETWORK_OR_RUNTIME_ERROR at step: ${step}`);
  console.error(`   ${err instanceof Error ? err.message : String(err)}`);
  console.error(`   (could not complete proof against ${baseUrl})`);
  process.exit(1);
});
