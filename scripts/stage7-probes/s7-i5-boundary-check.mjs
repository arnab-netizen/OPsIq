#!/usr/bin/env node
/**
 * S7-I5 — Live tenant and secret boundary
 *
 * LANE_C production boundary check.
 *
 * Governed statement (docs/opsiq/bundles/factory-stage-7-closure.yaml):
 *   The owner must not be able to access or infer another workspace's records.
 *   Secrets, provider tokens, raw internal errors and protected payloads must
 *   not appear in owner-visible responses, logs, diagnostics or audit events.
 * Governed executable evidence:
 *   cross-workspace rejection confirmed on production; secret values absent
 *   from all owner-visible API responses, health output, AND AUDIT EVENTS.
 *
 * ─── What this revision repairs ────────────────────────────────────────────
 * The prior revision reported "11 PASS, 0 FAIL" while proving almost none of
 * the above. Four defects, each fixed at root cause:
 *
 *   1. Cross-workspace isolation was "proved" by an UNAUTHENTICATED request to
 *      a workspace-scoped route. A 401 there is just the anonymous rejection
 *      every route gives; it carries no tenant-isolation content. Now the check
 *      requires a real owner session AND a record that genuinely lives in
 *      another workspace, and FAILS CLOSED when that fixture is absent.
 *   2. The authenticated workspace-binding test was invoked as
 *      `testWorkspaceBindingWithSession(baseUrl, sessionToken, null)` — a
 *      hardcoded null at the call site that its own first line short-circuited
 *      on. The test was dead code and always recorded SKIPPED as a pass. The
 *      null path is gone.
 *   3. The secret scan ran only inside an `if ([200, 404].includes(status))`
 *      branch; every 403 fell to an `else` that recorded `_auth_required` with
 *      the default-true verdict. All three probed routes 403'd, so ZERO owner
 *      responses were ever scanned and a total loss of owner access scored as
 *      PASS. The scan now targets a route the owner IS entitled to and treats
 *      a non-200 as a failure, because a denied response proves nothing about
 *      the content of an authorized one.
 *   4. The raw-error check tested only anonymous malformed login JSON, and the
 *      audit-events clause of the governed evidence had been silently dropped
 *      from the assertion. Both are restored against authenticated surfaces.
 *
 * `record()` no longer defaults its verdict — see the note on the function.
 *
 * Required env vars:
 *   DEPLOYMENT_ID          — Vercel deployment id
 *   PROBE_BASE_URL         — (alternative) direct URL override
 *   PROBE_OWNER_EMAIL      — owner email. Used to authenticate; never emitted
 *                            to the observation.
 *   PROBE_OWNER_PASSWORD   — owner password
 *
 * Fixtures (REQUIRED — this probe fails closed without them):
 *   PROBE_PILOT_ENTITY_ID      — uuid of a record in the OWNER's own workspace
 *                                that has audit events (audit-event secret scan)
 *   PROBE_FOREIGN_WORKSPACE_ID — uuid of a workspace the owner is NOT in
 *   PROBE_FOREIGN_ENTITY_ID    — uuid of a record inside that foreign workspace
 *
 * Optional env vars:
 *   VERCEL_TOKEN           — enables URL resolution from DEPLOYMENT_ID
 *
 * Exit 0 = PASS. Non-zero = FAIL. Observations on stdout.
 */

const DEFAULT_PRODUCTION_URL = "https://o-ps-iq.vercel.app";
const DEPLOYMENT_ID = process.env.DEPLOYMENT_ID ?? "";
const VERCEL_TOKEN = process.env.VERCEL_TOKEN ?? "";
const PROBE_BASE_URL_OVERRIDE = process.env.PROBE_BASE_URL ?? "";
const OWNER_EMAIL = process.env.PROBE_OWNER_EMAIL ?? "";
const OWNER_PASSWORD = process.env.PROBE_OWNER_PASSWORD ?? "";
const PILOT_ENTITY_ID = process.env.PROBE_PILOT_ENTITY_ID ?? "";
const FOREIGN_WORKSPACE_ID = process.env.PROBE_FOREIGN_WORKSPACE_ID ?? "";
const FOREIGN_ENTITY_ID = process.env.PROBE_FOREIGN_ENTITY_ID ?? "";

/** OWNER_VIEW + requireWorkspace, GET, read-only. The owner IS entitled to it. */
const OWNER_ROUTE = "/api/owner/home";
/** Owner-visible, workspace-scoped audit read. OWNER_VIEW + requireWorkspace. */
const OWNER_AUDIT_ROUTE = "/api/owner/trust/audit-trail";

const observations = [];
let failed = false;

/**
 * Record one observation. `pass` is REQUIRED and has no default — defect 3
 * above existed precisely because it did default to true.
 */
function record(label, value, pass) {
  if (typeof pass !== "boolean") {
    throw new Error(`record("${label}") requires an explicit boolean verdict`);
  }
  observations.push({ label, value, pass });
  console.log(`[${pass ? "PASS" : "FAIL"}] ${label}: ${JSON.stringify(value)}`);
  if (!pass) failed = true;
}

function fail(label, value) {
  record(label, value, false);
}

async function resolveBaseUrl() {
  if (PROBE_BASE_URL_OVERRIDE) return PROBE_BASE_URL_OVERRIDE;
  if (VERCEL_TOKEN && DEPLOYMENT_ID) {
    try {
      const res = await fetch(
        `https://api.vercel.com/v13/deployments/${encodeURIComponent(DEPLOYMENT_ID)}`,
        { headers: { Authorization: `Bearer ${VERCEL_TOKEN}` } }
      );
      if (res.ok) {
        const data = await res.json();
        if (data.url) return `https://${data.url}`;
      }
    } catch { /* fall through */ }
  }
  return DEFAULT_PRODUCTION_URL;
}

function extractSetCookieHeader(headers) {
  if (typeof headers.getSetCookie === "function") {
    return headers.getSetCookie();
  }
  const raw = headers.get("set-cookie");
  return raw ? [raw] : [];
}

function parseCookieToken(setCookieHeaders, name = "opsiq_session") {
  for (const header of setCookieHeaders) {
    const [nameVal] = header.split(";")[0].trim().split("=");
    if (nameVal.trim() === name) {
      return header.split(";")[0].split("=").slice(1).join("=").trim();
    }
  }
  return null;
}

// Patterns that indicate a secret was leaked
const SECRET_PATTERNS = [
  /sk-[A-Za-z0-9_-]{20,}/,          // OpenAI API key
  /OPENAI_API_KEY\s*=/i,
  /ANTHROPIC_API_KEY\s*=/i,
  /DATABASE_URL\s*=/i,
  /postgres:\/\/[^@]+@/,            // raw DB connection string
  /postgresql:\/\/[^@]+@/,
  /neon:\/\/[^@]+@/,
  /VERCEL_TOKEN\s*=/i,
  /EVIDENCE_SIGNING_KEY/i,
  /-----BEGIN[^-]*PRIVATE KEY-----/,
  /NEXTAUTH_SECRET\s*=/i,
  /SESSION_SECRET\s*=/i,
  /AUTH_SECRET\s*=/i,
  /CRON_SECRET\s*=/i,
  /OPSIQ_DIAGNOSTIC_KEY/i,
  /\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}/, // raw bcrypt hash in response
  /\bhashedPassword\b/i,
  // Matches "Authorization: Bearer <tok>" and bare "bearer <tok>" as they appear
  // once JSON-encoded, where the separator is a quote/colon/space run rather than
  // a bare colon.
  /\b(?:authorization|bearer)\b["'\s:=]+(?:bearer\s+)?[A-Za-z0-9._-]{20,}/i,
  /\bgh[pusor]_[A-Za-z0-9]{20,}/,   // GitHub token forms
  /\b(?:access|refresh)_token\b["'\s]*[:=]["'\s]*[^"'\s]{16,}/i,
];

function containsSecretLeak(bodyStr) {
  for (const pattern of SECRET_PATTERNS) {
    if (pattern.test(bodyStr)) {
      return pattern.toString();
    }
  }
  return null;
}

/** Raw internal error / stack trace / database detail exposure. */
function containsRawErrorDetail(bodyStr) {
  const RAW_ERROR_PATTERNS = [
    /\bat\s+[\w.<>[\]]+\s+\([^)]*:\d+:\d+\)/,   // V8 stack frame
    /\bat\s+Object\.</,
    /\b(?:SyntaxError|TypeError|ReferenceError|PrismaClientKnownRequestError|PrismaClientValidationError)\b/,
    /\bnode_modules[/\\]/,
    /\bInvalid `?(?:prisma|db)\.[\w.]+\(\)/i,
    /\brelation "[^"]+" does not exist/i,
    /\bcolumn "[^"]+" does not exist/i,
    /\bP\d{4}\b/,                                 // Prisma error code
  ];
  for (const pattern of RAW_ERROR_PATTERNS) {
    if (pattern.test(bodyStr)) return pattern.toString();
  }
  return null;
}

async function getOwnerSession(baseUrl) {
  try {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: OWNER_EMAIL, password: OWNER_PASSWORD }),
    });
    if (res.status !== 200) return null;
    const setCookies = extractSetCookieHeader(res.headers);
    return parseCookieToken(setCookies);
  } catch {
    return null;
  }
}

function authedGet(baseUrl, path, sessionToken) {
  return fetch(`${baseUrl}${path}`, {
    headers: {
      Cookie: `opsiq_session=${sessionToken}`,
      Accept: "application/json",
    },
  });
}

async function testHealthResponseForSecrets(baseUrl) {
  console.log("\nTest: health endpoint does not leak secrets");
  let res;
  try {
    res = await fetch(`${baseUrl}/api/health`);
  } catch (err) {
    fail("health_probe_error", String(err));
    return;
  }

  let bodyStr = "";
  try { bodyStr = await res.text(); } catch { /* body unusable */ }

  const leak = containsSecretLeak(bodyStr);
  record("health_response_no_secrets", !leak, !leak);
  if (leak) {
    fail("health_secret_leak_detected", `Pattern matched: ${leak}`);
  }

  // Health endpoint must not expose raw env vars
  const exposesEnv = bodyStr.includes("process.env") || bodyStr.includes("__ENV");
  record("health_does_not_expose_env_vars", !exposesEnv, !exposesEnv);
}

/**
 * The governed evidence is about the content of responses the owner can
 * actually SEE. A 401/403 body is not one of those: it proves the route
 * refused, not that an authorized payload is clean. This therefore demands a
 * 200 from a route the scoped owner is entitled to, and fails when it cannot
 * obtain one.
 */
async function testAuthorizedOwnerResponseForSecrets(baseUrl, sessionToken) {
  console.log(`\nTest: authorized owner response is secret-free → ${OWNER_ROUTE}`);
  let res;
  try {
    res = await authedGet(baseUrl, OWNER_ROUTE, sessionToken);
  } catch (err) {
    fail("authorized_owner_response_error", String(err));
    return;
  }

  const authorized = res.status === 200;
  record("authorized_owner_response_status", res.status, authorized);
  if (!authorized) {
    fail(
      "authorized_owner_response_unavailable",
      `Expected 200 from an OWNER_VIEW route to scan a real authorized ` +
        `response; got ${res.status}. A denied response cannot evidence that ` +
        `authorized owner output is secret-free.`
    );
    return;
  }

  let bodyStr = "";
  try { bodyStr = await res.text(); } catch { /* body unusable */ }
  record("authorized_owner_response_non_empty", bodyStr.length > 0, bodyStr.length > 0);

  const leak = containsSecretLeak(bodyStr);
  record("authorized_owner_response_no_secrets", !leak, !leak);
  if (leak) {
    fail("authorized_owner_response_secret_leak", `Pattern matched: ${leak}`);
  }

  const rawError = containsRawErrorDetail(bodyStr);
  record("authorized_owner_response_no_raw_internals", !rawError, !rawError);
}

/**
 * Audit events are named explicitly in the governed executable evidence and had
 * been dropped from the assertion. Scanned through the owner-facing audit route
 * (OWNER_VIEW + requireWorkspace), which is the only audit surface a scoped
 * owner can reach — /api/audit and /api/audit/events require audit:view and
 * system:view_audit, which the owner is intentionally not granted.
 */
async function testAuditEventsForSecrets(baseUrl, sessionToken) {
  console.log(`\nTest: owner-visible audit events do not leak secrets`);

  record("pilot_entity_fixture_configured", !!PILOT_ENTITY_ID, !!PILOT_ENTITY_ID);
  if (!PILOT_ENTITY_ID) {
    fail(
      "audit_event_secret_scan_prerequisite_missing",
      "PROBE_PILOT_ENTITY_ID is required to scan real owner-visible audit " +
        "events. Refusing to record the audit-events clause of S7-I5 as met " +
        "without audit records to inspect."
    );
    return;
  }

  let res;
  try {
    res = await authedGet(
      baseUrl,
      `${OWNER_AUDIT_ROUTE}?entityId=${encodeURIComponent(PILOT_ENTITY_ID)}`,
      sessionToken
    );
  } catch (err) {
    fail("audit_event_scan_error", String(err));
    return;
  }

  const ok = res.status === 200;
  record("audit_events_http_status", res.status, ok);
  if (!ok) {
    fail("audit_events_unavailable_for_scan", `Expected 200, got ${res.status}`);
    return;
  }

  let bodyStr = "";
  try { bodyStr = await res.text(); } catch { /* body unusable */ }

  let events = [];
  try {
    const parsed = JSON.parse(bodyStr);
    events = parsed?.events ?? parsed?.data?.events ?? [];
  } catch {
    fail("audit_events_not_json", "Failed to parse owner audit-trail response");
    return;
  }

  const hasEvents = Array.isArray(events) && events.length > 0;
  record("audit_events_available_to_scan", Array.isArray(events) ? events.length : 0, hasEvents);
  if (!hasEvents) {
    fail(
      "audit_event_secret_scan_vacuous",
      "Zero audit events returned for the configured pilot entity; the " +
        "audit-events secret clause cannot be evidenced against an empty set."
    );
    return;
  }

  const leak = containsSecretLeak(bodyStr);
  record("audit_events_no_secrets", !leak, !leak);
  if (leak) {
    fail("audit_event_secret_leak", `Pattern matched: ${leak}`);
  }

  const rawError = containsRawErrorDetail(bodyStr);
  record("audit_events_no_raw_internals", !rawError, !rawError);
}

/**
 * Cross-workspace isolation with a REAL session and a REAL foreign record.
 * Fails closed without the fixture — see the header note, defect 1.
 */
async function testCrossWorkspaceIsolation(baseUrl, sessionToken) {
  console.log("\nTest: authenticated cross-workspace isolation");

  const fixtureReady = !!(FOREIGN_WORKSPACE_ID && FOREIGN_ENTITY_ID);
  record("cross_workspace_fixture_configured", fixtureReady, fixtureReady);

  if (!fixtureReady) {
    fail(
      "cross_workspace_probe_prerequisite_missing",
      "PROBE_FOREIGN_WORKSPACE_ID and PROBE_FOREIGN_ENTITY_ID are required. " +
        "An unauthenticated request, or a fabricated uuid indistinguishable " +
        "from a nonexistent record, cannot evidence tenant isolation."
    );
    return;
  }

  // 1. Owner-visible audit read scoped to a foreign record.
  let auditRes;
  try {
    auditRes = await authedGet(
      baseUrl,
      `${OWNER_AUDIT_ROUTE}?entityId=${encodeURIComponent(FOREIGN_ENTITY_ID)}`,
      sessionToken
    );
  } catch (err) {
    fail("cross_workspace_audit_probe_error", String(err));
    return;
  }

  let auditBody = "";
  try { auditBody = await auditRes.text(); } catch { /* body unusable */ }

  const auditStatusSafe = [200, 400, 403, 404].includes(auditRes.status);
  record("cross_workspace_audit_status_safe", auditRes.status, auditStatusSafe);

  if (auditRes.status === 200) {
    let count = null;
    try {
      const parsed = JSON.parse(auditBody);
      const evs = parsed?.events ?? parsed?.data?.events ?? [];
      count = Array.isArray(evs) ? evs.length : null;
    } catch { count = null; }
    record("cross_workspace_audit_returns_no_foreign_records", count, count === 0);
  }

  const auditLeaks = auditBody.includes(FOREIGN_WORKSPACE_ID);
  record("cross_workspace_audit_excludes_foreign_workspace", !auditLeaks, !auditLeaks);

  // 2. Owner surface asked to scope itself to a foreign record id. The route
  //    must resolve against the session's own workspace and must never echo or
  //    select the foreign record.
  let homeRes;
  try {
    homeRes = await authedGet(
      baseUrl,
      `${OWNER_ROUTE}?businessId=${encodeURIComponent(FOREIGN_ENTITY_ID)}`,
      sessionToken
    );
  } catch (err) {
    fail("cross_workspace_owner_probe_error", String(err));
    return;
  }

  let homeBody = "";
  try { homeBody = await homeRes.text(); } catch { /* body unusable */ }

  const homeStatusSafe = [200, 400, 403, 404].includes(homeRes.status);
  record("cross_workspace_owner_route_status_safe", homeRes.status, homeStatusSafe);

  const echoesForeignEntity = homeBody.includes(FOREIGN_ENTITY_ID);
  const echoesForeignWorkspace = homeBody.includes(FOREIGN_WORKSPACE_ID);
  record("cross_workspace_owner_route_excludes_foreign_entity", !echoesForeignEntity,
    !echoesForeignEntity);
  record("cross_workspace_owner_route_excludes_foreign_workspace", !echoesForeignWorkspace,
    !echoesForeignWorkspace);
}

/**
 * Workspace binding, evidenced without printing identifiers.
 *
 * Replaces the dead `verifiedWorkspaceId = null` path. The assertion is a
 * comparison, so it is reported as the comparison's outcome: the same owner
 * route resolves to a stable own-workspace result whether or not a foreign
 * scope hint is supplied, which is what "bound to the correct private
 * workspace, server-derived" means operationally.
 */
async function testWorkspaceBinding(baseUrl, sessionToken) {
  console.log("\nTest: session is bound to a server-derived workspace");

  let plainRes;
  let hintedRes;
  try {
    plainRes = await authedGet(baseUrl, OWNER_ROUTE, sessionToken);
    hintedRes = await authedGet(
      baseUrl,
      `${OWNER_ROUTE}?businessId=${encodeURIComponent("00000000-0000-4000-8000-000000000001")}`,
      sessionToken
    );
  } catch (err) {
    fail("workspace_binding_probe_error", String(err));
    return;
  }

  const bothAuthorized = plainRes.status === 200 && hintedRes.status === 200;
  record("workspace_binding_route_authorized", [plainRes.status, hintedRes.status],
    bothAuthorized);
  if (!bothAuthorized) {
    fail(
      "workspace_binding_not_observable",
      "Could not obtain two authorized owner responses to compare; workspace " +
        "binding cannot be evidenced from denied responses."
    );
    return;
  }

  let plainBody = "";
  let hintedBody = "";
  try { plainBody = await plainRes.text(); } catch { /* body unusable */ }
  try { hintedBody = await hintedRes.text(); } catch { /* body unusable */ }

  // A caller-supplied scope hint must not change which workspace answered.
  const identical = plainBody === hintedBody;
  record("workspace_binding_unaffected_by_caller_supplied_scope", identical, identical);

  const echoesInjected = hintedBody.includes("00000000-0000-4000-8000-000000000001");
  record("workspace_binding_does_not_echo_injected_scope", !echoesInjected, !echoesInjected);
}

/**
 * Raw internal error exposure on an AUTHENTICATED owner-visible error path.
 * The anonymous malformed-login case is kept as well, but it alone never
 * evidenced "raw internal errors must not appear in owner-visible responses".
 */
async function testAuthenticatedErrorDoesNotLeak(baseUrl, sessionToken) {
  console.log("\nTest: authenticated owner-visible error path leaks no internals");
  let res;
  try {
    // A syntactically invalid entityId drives the route's own validation error.
    res = await authedGet(baseUrl, `${OWNER_AUDIT_ROUTE}?entityId=not-a-uuid`, sessionToken);
  } catch (err) {
    fail("authenticated_error_probe_error", String(err));
    return;
  }

  let bodyStr = "";
  try { bodyStr = await res.text(); } catch { /* body unusable */ }

  const isErrorStatus = res.status >= 400 && res.status < 500;
  record("authenticated_error_path_status", res.status, isErrorStatus);

  const rawError = containsRawErrorDetail(bodyStr);
  record("authenticated_error_no_raw_internals", !rawError, !rawError);
  if (rawError) {
    fail("authenticated_error_leaked_internals", `Pattern matched: ${rawError}`);
  }

  const leak = containsSecretLeak(bodyStr);
  record("authenticated_error_no_secrets", !leak, !leak);
}

async function testInternalErrorDoesNotLeakStack(baseUrl) {
  console.log("\nTest: malformed anonymous request does not leak stack traces");
  let res;
  try {
    // Send malformed JSON to trigger parse error
    res = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{invalid json",
    });
  } catch (err) {
    fail("malformed_request_error", String(err));
    return;
  }

  let bodyStr = "";
  try { bodyStr = await res.text(); } catch { /* body unusable */ }

  const rawError = containsRawErrorDetail(bodyStr);
  record("malformed_request_no_raw_error", !rawError, !rawError);
  if (rawError) {
    fail("stack_trace_leaked", `Pattern matched: ${rawError}`);
  }
}

async function main() {
  console.log("=== S7-I5: Live tenant and secret boundary ===");
  console.log(`DEPLOYMENT_ID: ${DEPLOYMENT_ID || "(not set)"}`);
  // Presence only. The address is used to authenticate and is never printed:
  // this line is copied verbatim into the signed observation.
  console.log(`PROBE_OWNER_EMAIL: ${OWNER_EMAIL ? "set" : "not set"}`);
  // Fixture identifiers are workspace/record identifiers: presence only.
  console.log(`PROBE_PILOT_ENTITY_ID: ${PILOT_ENTITY_ID ? "set" : "not set"}`);
  console.log(`PROBE_FOREIGN_WORKSPACE_ID: ${FOREIGN_WORKSPACE_ID ? "set" : "not set"}`);
  console.log(`PROBE_FOREIGN_ENTITY_ID: ${FOREIGN_ENTITY_ID ? "set" : "not set"}`);

  if (!OWNER_EMAIL || !OWNER_PASSWORD) {
    fail(
      "owner_credentials",
      "REFUSED: PROBE_OWNER_EMAIL and PROBE_OWNER_PASSWORD must be set. " +
        "Cannot probe boundary controls without owner credentials."
    );
    console.log("\nRESULT: FAIL");
    process.exit(1);
  }

  const baseUrl = await resolveBaseUrl();
  record("probe_base_url", baseUrl, true);

  await testHealthResponseForSecrets(baseUrl);
  await testInternalErrorDoesNotLeakStack(baseUrl);

  const sessionToken = await getOwnerSession(baseUrl);
  record("owner_session_obtained", !!sessionToken, !!sessionToken);

  if (!sessionToken) {
    fail(
      "session_unavailable",
      "Could not obtain owner session — every authenticated boundary check " +
        "below is unproven."
    );
    console.log("\nRESULT: FAIL");
    process.exit(1);
  }

  await testAuthorizedOwnerResponseForSecrets(baseUrl, sessionToken);
  await testAuditEventsForSecrets(baseUrl, sessionToken);
  await testWorkspaceBinding(baseUrl, sessionToken);
  await testCrossWorkspaceIsolation(baseUrl, sessionToken);
  await testAuthenticatedErrorDoesNotLeak(baseUrl, sessionToken);

  console.log("\n=== OBSERVATION SUMMARY ===");
  const passes = observations.filter((o) => o.pass).length;
  const failures = observations.filter((o) => !o.pass).length;
  console.log(`Checks: ${passes} PASS, ${failures} FAIL`);

  if (failed) {
    console.log("\nRESULT: FAIL");
    process.exit(1);
  }
  console.log("\nRESULT: PASS");
  process.exit(0);
}

main().catch((err) => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
