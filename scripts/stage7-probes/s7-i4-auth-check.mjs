#!/usr/bin/env node
/**
 * S7-I4 — Private owner authentication and workspace binding
 *
 * LANE_C production auth check.
 *
 * Governed statement (docs/opsiq/bundles/factory-stage-7-closure.yaml):
 *   The designated owner must authenticate successfully and be bound to the
 *   correct private workspace. Prove: login, logout, session renewal or expiry,
 *   unauthorized-user rejection, cross-workspace rejection, and secure
 *   production cookie behavior.
 *
 * ─── Why the authenticated-session target is an owner route, not /api/operator ─
 * This probe previously sent its authenticated request to `/api/operator` and
 * treated anything other than 200/404 as "session not accepted". `/api/operator`
 * is declared `requireCapabilities: [CAPABILITIES.ACTION_VIEW]`. A scoped
 * self-serve owner is DELIBERATELY not granted `action:view`: signup writes
 * `WorkspaceMembership.role = "owner"`, which narrows the role's bundle to
 * OWNER_SCOPED_CAPABILITIES (see src/policies/capability-check.ts). The route
 * therefore answers 403 — an AUTHORIZATION outcome reached only AFTER the
 * session and the workspace-scoped policy context both resolved successfully.
 * The probe reported that as an authentication failure, which inverted the
 * invariant: intended product behaviour was recorded as a product defect.
 *
 * The authenticated target is now `/api/owner/home` —
 * `requireCapabilities: [CAPABILITIES.OWNER_VIEW]`, `requireWorkspace: true`,
 * GET-only, and read-only through its whole call graph (listBusinesses /
 * getBusiness / findFirst / findMany; no write, no audit emission). It is a
 * route the designated owner IS entitled to, so a non-200 from it is a real
 * finding rather than a mislabelled capability denial. `/api/control/today` and
 * `/api/entitlement` were both rejected as targets: the first reaches
 * `enforceDecisionControl`, which performs `db.alert.create` and
 * `db.operatorItem.update`; the second emits a PRIVATE_MODE_ENTITLEMENT_ACTIVE
 * audit event on first call for the private workspace. Neither is safe to send
 * at a frozen production deployment.
 *
 * Required env vars:
 *   DEPLOYMENT_ID          — Vercel deployment id (for URL resolution)
 *   PROBE_BASE_URL         — (alternative) direct URL override
 *   PROBE_OWNER_EMAIL      — owner email on the production deployment. Used to
 *                            authenticate; never emitted to the observation.
 *   PROBE_OWNER_PASSWORD   — owner password on the production deployment
 *
 * Cross-workspace fixture (REQUIRED — this probe fails closed without it):
 *   PROBE_FOREIGN_WORKSPACE_ID — uuid of a workspace the designated owner is
 *                                NOT a member of
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
const FOREIGN_WORKSPACE_ID = process.env.PROBE_FOREIGN_WORKSPACE_ID ?? "";
const FOREIGN_ENTITY_ID = process.env.PROBE_FOREIGN_ENTITY_ID ?? "";

/**
 * The authenticated-session target: OWNER_VIEW + requireWorkspace, GET,
 * read-only. See the header note for why this is not /api/operator.
 */
const OWNER_ROUTE = "/api/owner/home";
/** Owner-visible, workspace-scoped audit read — used for cross-workspace scoping. */
const OWNER_AUDIT_ROUTE = "/api/owner/trust/audit-trail";

/** Server-side session lifetime (src/services/auth.ts SESSION_DURATION_MS). */
const EXPECTED_SESSION_DURATION_MS = 24 * 60 * 60 * 1000;
/** Tolerance for clock skew and request latency when bounding the cookie expiry. */
const EXPIRY_SKEW_TOLERANCE_MS = 10 * 60 * 1000;

const observations = [];
let failed = false;

/**
 * Record one observation. `pass` is REQUIRED and has no default: the prior
 * revision defaulted it to true, which let "denied" outcomes be filed as
 * passing checks. Every call site must state its verdict explicitly.
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
  // Headers can have multiple set-cookie entries
  const cookies = [];
  // Node fetch / undici surfaces raw set-cookie as an iterable
  if (typeof headers.getSetCookie === "function") {
    cookies.push(...headers.getSetCookie());
  } else {
    const raw = headers.get("set-cookie");
    if (raw) cookies.push(raw);
  }
  return cookies;
}

function parseCookieToken(setCookieHeaders, cookieName = "opsiq_session") {
  for (const header of setCookieHeaders) {
    const parts = header.split(";")[0].trim();
    const [name, value] = parts.split("=");
    if (name.trim() === cookieName) return value?.trim() ?? null;
  }
  return null;
}

/** Authenticated GET helper — the session token never reaches the observation. */
function authedGet(baseUrl, path, sessionToken) {
  return fetch(`${baseUrl}${path}`, {
    headers: {
      Cookie: `opsiq_session=${sessionToken}`,
      Accept: "application/json",
    },
  });
}

async function testOwnerLogin(baseUrl) {
  const url = `${baseUrl}/api/auth/login`;
  console.log(`\nTest: owner login → ${url}`);

  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: OWNER_EMAIL, password: OWNER_PASSWORD }),
    });
  } catch (err) {
    fail("login_network_error", String(err));
    return null;
  }

  record("login_http_status", res.status, res.status === 200);
  if (res.status !== 200) {
    let body;
    try { body = await res.json(); } catch { body = null; }
    fail("login_failed_body", body);
    return null;
  }

  let body;
  try {
    body = await res.json();
  } catch {
    fail("login_response_not_json", "Failed to parse login response");
    return null;
  }

  record("login_response_has_user", "user" in body, "user" in body);

  // ─── Owner identity: assert the binding, never record the identifier ────────
  // The assertion S7-I4 needs is "the account that logged in is the configured
  // owner". That is a comparison, and a comparison can be evidenced by its
  // outcome. Recording the address itself put the owner's email into a signed,
  // committed artifact and into the evidence PR that carries it — a disclosure
  // the invariant never required. Owner decision: no owner identifier appears
  // verbatim in signed evidence.
  const returnedEmail = body.user?.email;
  const returnedIsString = typeof returnedEmail === "string" && returnedEmail.length > 0;
  const ownerIdentityMatches = returnedIsString && returnedEmail === OWNER_EMAIL;
  record("login_response_user_has_email", returnedIsString, returnedIsString);
  record("login_response_user_matches_configured_owner", ownerIdentityMatches, ownerIdentityMatches);

  const setCookies = extractSetCookieHeader(res.headers);
  const sessionToken = parseCookieToken(setCookies);
  record("login_session_cookie_set", !!sessionToken, !!sessionToken);

  if (!sessionToken) {
    fail("session_cookie_absent", "opsiq_session cookie not in set-cookie header");
    return null;
  }

  // ─── Secure production cookie behavior ─────────────────────────────────────
  const rawCookie = setCookies.find((c) => c.startsWith("opsiq_session=")) ?? "";
  const isHttpOnly = /;\s*httponly\b/i.test(rawCookie);
  const isSameSiteSet = /;\s*samesite=/i.test(rawCookie);
  // NODE_ENV === "production" makes the login route set `secure: true`. On the
  // governed production deployment its ABSENCE is a real finding, so this is a
  // verdict rather than the untested informational line it used to be.
  const isSecure = /;\s*secure\b/i.test(rawCookie);
  record("session_cookie_httponly", isHttpOnly, isHttpOnly);
  record("session_cookie_samesite_set", isSameSiteSet, isSameSiteSet);
  record("session_cookie_secure", isSecure, isSecure);

  // ─── Session expiry: bound, not merely present ─────────────────────────────
  // "session renewal or expiry" is a literal S7-I4 requirement. Waiting out a
  // real 24h expiry is impossible inside a capture, so expiry is evidenced by
  // the two facts that actually constitute it: the issued credential carries a
  // bounded absolute lifetime, and the server rejects a credential that is not
  // a live session row (asserted by unknown-token and post-logout checks below,
  // which exercise the same getSession() guards that reject an expired
  // `expires_at`). A cookie with no expiry, or one beyond the configured
  // lifetime, is a real defect and fails here.
  const expiresMatch = /;\s*expires=([^;]+)/i.exec(rawCookie);
  const maxAgeMatch = /;\s*max-age=(-?\d+)/i.exec(rawCookie);
  let expiryMs = null;
  if (expiresMatch) {
    const parsed = Date.parse(expiresMatch[1].trim());
    if (!Number.isNaN(parsed)) expiryMs = parsed - Date.now();
  } else if (maxAgeMatch) {
    expiryMs = Number(maxAgeMatch[1]) * 1000;
  }
  const hasExpiry = expiryMs !== null;
  record("session_cookie_expiry_attribute_present", hasExpiry, hasExpiry);
  const expiryBounded =
    hasExpiry &&
    expiryMs > 0 &&
    expiryMs <= EXPECTED_SESSION_DURATION_MS + EXPIRY_SKEW_TOLERANCE_MS;
  record(
    "session_cookie_expiry_bounded_to_configured_lifetime",
    expiryBounded
      ? "within configured session lifetime"
      : "absent, already elapsed, or beyond configured lifetime",
    expiryBounded
  );

  // ─── Session credential: report acquisition, never any of its value ─────────
  // Everything this probe prints becomes the raw observation, which is hashed,
  // signed and committed to the artifacts directory — permanently, since
  // artifacts are append-only. A prefix of a live session cookie is credential
  // material and carries no proof: `login_session_cookie_set` above already
  // records that a cookie was obtained, and the flag checks assert its
  // hardening. The token stays in memory for the authenticated requests below.
  console.log("  Session cookie obtained (value withheld from observation)");
  return sessionToken;
}

async function testUnauthorizedRejection(baseUrl) {
  const url = `${baseUrl}/api/auth/login`;
  console.log(`\nTest: unauthorized-user rejection → ${url}`);

  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "nonexistent-user-probe@example-invalid.test",
        password: "definitely-wrong-password-probe",
      }),
    });
  } catch (err) {
    fail("rejection_probe_network_error", String(err));
    return;
  }

  record("rejection_http_status", res.status, res.status === 401);
  if (res.status !== 401) {
    fail("unauthorized_not_rejected_correctly", `Expected 401, got ${res.status}`);
  }

  let body;
  try { body = await res.json(); } catch { body = null; }
  // Must not leak internal details
  const bodyStr = JSON.stringify(body ?? "");
  const leaksInternals =
    bodyStr.includes("password") && bodyStr.length > 200;
  record("rejection_does_not_leak_credentials", !leaksInternals, !leaksInternals);
}

async function testWrongPasswordRejection(baseUrl) {
  const url = `${baseUrl}/api/auth/login`;
  console.log(`\nTest: wrong-password rejection for known user → ${url}`);

  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: OWNER_EMAIL,
        password: "wrong-password-stage7-probe",
      }),
    });
  } catch (err) {
    fail("wrong_password_probe_error", String(err));
    return;
  }

  record("wrong_password_http_status", res.status, res.status === 401);
  if (res.status !== 401) {
    fail("wrong_password_not_rejected", `Expected 401, got ${res.status}`);
  }
}

async function testProtectedRouteWithSession(baseUrl, sessionToken) {
  console.log(`\nTest: owner-entitled route accessible with valid session → ${OWNER_ROUTE}`);

  let res;
  try {
    res = await authedGet(baseUrl, OWNER_ROUTE, sessionToken);
  } catch (err) {
    fail("owner_route_network_error", String(err));
    return;
  }

  // 200 is the only correct outcome. This route is OWNER_VIEW + requireWorkspace,
  // and the designated owner holds OWNER_VIEW, so 401 (session/policy) and 403
  // (workspace or capability) are BOTH genuine failures here — unlike on
  // /api/operator, where 403 was the product working as designed.
  const accepted = res.status === 200;
  record("owner_route_with_session", res.status, accepted);
  if (!accepted) {
    fail(
      "owner_session_not_accepted_on_entitled_route",
      `Expected 200 from an OWNER_VIEW route, got ${res.status}`
    );
  }
}

async function testProtectedRouteWithoutSession(baseUrl) {
  console.log(`\nTest: owner route rejected without session → ${OWNER_ROUTE}`);
  let res;
  try {
    res = await fetch(`${baseUrl}${OWNER_ROUTE}`, {
      headers: { Accept: "application/json" },
    });
  } catch (err) {
    fail("unauthenticated_probe_error", String(err));
    return;
  }
  // Must be 401 or 403, not 200
  const rejected = [401, 403].includes(res.status);
  record("unauthenticated_request_rejected", res.status, rejected);
  if (!rejected) {
    fail("unauthenticated_not_rejected", `Expected 401/403, got ${res.status}`);
  }
}

/**
 * A well-formed credential that is not a live session row must be rejected.
 *
 * This is the deterministic, production-safe half of the expiry requirement:
 * getSession() resolves the cookie against persisted session state and returns
 * null for a token that is absent, revoked, or past `expires_at`, all three of
 * which surface identically as 401. Accepting an unknown token would mean the
 * server trusts cookie presence rather than session state — the defect class
 * that makes an expiry policy unenforceable.
 */
async function testUnknownSessionRejection(baseUrl) {
  console.log(`\nTest: well-formed but unknown session credential rejected`);
  const unknownToken = crypto.randomUUID();
  let res;
  try {
    res = await authedGet(baseUrl, OWNER_ROUTE, unknownToken);
  } catch (err) {
    fail("unknown_session_probe_error", String(err));
    return;
  }
  const rejected = [401, 403].includes(res.status);
  record("unknown_session_rejected", res.status, rejected);
  if (!rejected) {
    fail(
      "unknown_session_accepted",
      `A session token matching no session row returned ${res.status}; expected 401/403`
    );
  }
}

/**
 * Cross-workspace rejection — a literal S7-I4 requirement.
 *
 * FAILS CLOSED without a foreign-workspace fixture. An anonymous request to a
 * workspace-scoped route proves nothing about tenant isolation (it is rejected
 * for having no session at all), and a fabricated random uuid is
 * indistinguishable from a simply-nonexistent record, so neither can stand in
 * for this. Proving it needs a record that really does live in another
 * workspace. This probe will not manufacture one against production, so when
 * the fixture is absent the requirement is reported unmet rather than skipped.
 */
async function testCrossWorkspaceRejection(baseUrl, sessionToken) {
  console.log(`\nTest: cross-workspace rejection with a valid owner session`);

  record("cross_workspace_fixture_configured", !!(FOREIGN_WORKSPACE_ID && FOREIGN_ENTITY_ID),
    !!(FOREIGN_WORKSPACE_ID && FOREIGN_ENTITY_ID));

  if (!FOREIGN_WORKSPACE_ID || !FOREIGN_ENTITY_ID) {
    fail(
      "cross_workspace_probe_prerequisite_missing",
      "PROBE_FOREIGN_WORKSPACE_ID and PROBE_FOREIGN_ENTITY_ID are required to " +
        "prove cross-workspace rejection. Refusing to record this S7-I4 " +
        "requirement as met without a real foreign-workspace record."
    );
    return;
  }

  let res;
  try {
    res = await authedGet(
      baseUrl,
      `${OWNER_AUDIT_ROUTE}?entityId=${encodeURIComponent(FOREIGN_ENTITY_ID)}`,
      sessionToken
    );
  } catch (err) {
    fail("cross_workspace_probe_error", String(err));
    return;
  }

  let bodyStr = "";
  try { bodyStr = await res.text(); } catch { /* body already unusable */ }

  // Correct behaviour is either an explicit rejection or a workspace-scoped
  // empty result. What must never happen is foreign data coming back.
  const statusSafe = [200, 400, 403, 404].includes(res.status);
  record("cross_workspace_status_safe", res.status, statusSafe);

  const leaksForeignWorkspace = bodyStr.includes(FOREIGN_WORKSPACE_ID);
  record("cross_workspace_response_excludes_foreign_workspace", !leaksForeignWorkspace,
    !leaksForeignWorkspace);

  let foreignEventCount = null;
  if (res.status === 200) {
    try {
      const parsed = JSON.parse(bodyStr);
      const events = parsed?.events ?? parsed?.data?.events ?? [];
      foreignEventCount = Array.isArray(events) ? events.length : null;
    } catch {
      foreignEventCount = null;
    }
    const noForeignRecords = foreignEventCount === 0;
    record("cross_workspace_returns_no_foreign_records", foreignEventCount, noForeignRecords);
  }
}

async function testLogout(baseUrl, sessionToken) {
  const url = `${baseUrl}/api/auth/logout`;
  console.log(`\nTest: logout → ${url}`);

  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        Cookie: `opsiq_session=${sessionToken}`,
        "Content-Type": "application/json",
      },
    });
  } catch (err) {
    fail("logout_network_error", String(err));
    return;
  }

  record("logout_http_status", res.status, res.status === 200);
  if (res.status !== 200) {
    fail("logout_failed", `Expected 200, got ${res.status}`);
    return;
  }

  let body;
  try { body = await res.json(); } catch { body = null; }
  record("logout_response_success", body?.success === true, body?.success === true);

  // The cleared cookie must actually be an expiry instruction. The prior
  // revision ended in `cookieDeleted || setCookies.length >= 0` — a tautology
  // that passed unconditionally, including when no Set-Cookie was sent at all.
  const setCookies = extractSetCookieHeader(res.headers);
  const cookieCleared = setCookies.some(
    (c) =>
      c.startsWith("opsiq_session") &&
      (/;\s*max-age=0\b/i.test(c) ||
        /expires=[^;]*1970/i.test(c) ||
        /^opsiq_session=\s*;/.test(c))
  );
  record("logout_clears_session_cookie", cookieCleared, cookieCleared);
}

async function testRevokedSessionRejection(baseUrl, sessionToken) {
  console.log(`\nTest: revoked session rejected after logout`);
  let res;
  try {
    res = await authedGet(baseUrl, OWNER_ROUTE, sessionToken);
  } catch (err) {
    fail("revoked_session_probe_error", String(err));
    return;
  }
  const rejected = [401, 403].includes(res.status);
  record("revoked_session_rejected", res.status, rejected);
  if (!rejected) {
    fail("revoked_session_not_rejected", `Expected 401/403 after logout, got ${res.status}`);
  }
}

async function main() {
  console.log("=== S7-I4: Private owner authentication and workspace binding ===");
  console.log(`DEPLOYMENT_ID: ${DEPLOYMENT_ID || "(not set)"}`);
  // Presence only. The address is used to authenticate and is never printed:
  // this line is copied verbatim into the signed observation.
  console.log(`PROBE_OWNER_EMAIL: ${OWNER_EMAIL ? "set" : "not set"}`);
  // Fixture identifiers are workspace/record identifiers. Presence only —
  // the values are used in requests and compared, never emitted.
  console.log(`PROBE_FOREIGN_WORKSPACE_ID: ${FOREIGN_WORKSPACE_ID ? "set" : "not set"}`);
  console.log(`PROBE_FOREIGN_ENTITY_ID: ${FOREIGN_ENTITY_ID ? "set" : "not set"}`);

  if (!OWNER_EMAIL || !OWNER_PASSWORD) {
    fail(
      "owner_credentials",
      "REFUSED: PROBE_OWNER_EMAIL and PROBE_OWNER_PASSWORD must be set. " +
        "Cannot probe authentication without owner credentials."
    );
    console.log("\nRESULT: FAIL");
    process.exit(1);
  }

  const baseUrl = await resolveBaseUrl();
  record("probe_base_url", baseUrl, true);
  record("owner_entitled_route_under_test", OWNER_ROUTE, true);

  // Test sequence
  await testUnauthorizedRejection(baseUrl);
  await testWrongPasswordRejection(baseUrl);
  await testProtectedRouteWithoutSession(baseUrl);
  await testUnknownSessionRejection(baseUrl);

  const sessionToken = await testOwnerLogin(baseUrl);
  if (sessionToken) {
    await testProtectedRouteWithSession(baseUrl, sessionToken);
    await testCrossWorkspaceRejection(baseUrl, sessionToken);
    await testLogout(baseUrl, sessionToken);
    await testRevokedSessionRejection(baseUrl, sessionToken);
  } else {
    fail(
      "auth_sequence_aborted",
      "Owner login failed — logout, session validation, cross-workspace and " +
        "revocation tests skipped"
    );
  }

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
