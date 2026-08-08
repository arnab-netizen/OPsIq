#!/usr/bin/env node
/**
 * S7-I10 (LANE_C) — Audit and provenance completeness (production)
 *
 * LANE_C production audit check.
 *
 * Assertion: All six attribution fields present in audit records for pilot
 *            transitions; no raw payload copied into any audit record.
 *
 * Six required attribution fields per audit record:
 *   1. workspaceId  — which workspace the event belongs to
 *   2. actorId      — which user performed the action
 *   3. occurredAt   — when the event occurred
 *   4. entityType   — which kind of entity was affected
 *   5. entityId     — which specific entity was affected
 *   6. eventName    — what action occurred (result/outcome proxy)
 *
 * Required env vars:
 *   DEPLOYMENT_ID          — Vercel deployment id
 *   PROBE_BASE_URL         — (alternative) direct URL override
 *   PROBE_OWNER_EMAIL      — owner email
 *   PROBE_OWNER_PASSWORD   — owner password
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

// Patterns that indicate a raw payload was copied into an audit record
// (secrets, credentials, internal implementation details)
const RAW_PAYLOAD_PATTERNS = [
  /sk-[A-Za-z0-9_-]{20,}/,
  /-----BEGIN.*PRIVATE KEY-----/,
  /postgres:\/\/[^@]+@/,
  /postgresql:\/\/[^@]+@/,
  /SIGNING_KEY/i,
  /DATABASE_URL/i,
  /hashedPassword/i,
  /password.*:\s*["'][^"']{8,}["']/i,
];

const observations = [];
let failed = false;

function record(label, value, pass = true) {
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
  if (typeof headers.getSetCookie === "function") return headers.getSetCookie();
  const raw = headers.get("set-cookie");
  return raw ? [raw] : [];
}

function parseCookieToken(headers, name = "opsiq_session") {
  const cookies = extractSetCookieHeader(headers);
  for (const header of cookies) {
    const [nameVal] = header.split(";")[0].trim().split("=");
    if (nameVal.trim() === name) {
      return header.split(";")[0].split("=").slice(1).join("=").trim();
    }
  }
  return null;
}

async function getOwnerSession(baseUrl) {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: OWNER_EMAIL, password: OWNER_PASSWORD }),
  });
  if (res.status !== 200) {
    throw new Error(`Login failed: HTTP ${res.status}`);
  }
  const token = parseCookieToken(res.headers);
  if (!token) throw new Error("No session cookie after login");
  return token;
}

function checkSixAttributionFields(event, index) {
  const SIX_FIELDS = ["workspaceId", "actorId", "occurredAt", "entityType", "entityId", "eventName"];
  const missing = [];
  for (const field of SIX_FIELDS) {
    if (!event[field]) missing.push(field);
  }
  if (missing.length > 0) {
    fail(
      `event_${index}_missing_attribution_fields`,
      { missing, eventName: event.eventName ?? "UNKNOWN", entityId: event.entityId ?? "UNKNOWN" }
    );
    return false;
  }
  return true;
}

function checkNoRawPayload(event, index) {
  const payloadStr = JSON.stringify(event.payload ?? {});
  for (const pattern of RAW_PAYLOAD_PATTERNS) {
    if (pattern.test(payloadStr)) {
      fail(
        `event_${index}_raw_payload_leak`,
        { pattern: pattern.toString(), eventName: event.eventName }
      );
      return false;
    }
  }
  // Also ensure payload is not excessively large (raw request copies would be large)
  if (payloadStr.length > 10000) {
    fail(
      `event_${index}_payload_suspiciously_large`,
      { bytes: payloadStr.length, eventName: event.eventName }
    );
    return false;
  }
  return true;
}

async function fetchAuditEvents(baseUrl, sessionToken, limit = 50) {
  const url = `${baseUrl}/api/audit?limit=${limit}`;
  let res;
  try {
    res = await fetch(url, {
      headers: {
        Cookie: `opsiq_session=${sessionToken}`,
        Accept: "application/json",
      },
    });
  } catch (err) {
    fail("audit_api_network_error", String(err));
    return null;
  }

  record("audit_api_http_status", res.status, [200, 404].includes(res.status));
  if (res.status === 404) {
    record("audit_events_count", 0, true);
    return [];
  }
  if (res.status !== 200) {
    fail("audit_api_failed", `HTTP ${res.status}`);
    return null;
  }

  let body;
  try {
    body = await res.json();
  } catch {
    fail("audit_api_not_json", "Failed to parse response");
    return null;
  }

  const events = body.events ?? [];
  record("audit_events_count", events.length);
  return events;
}

async function fetchAuditEventsAlternate(baseUrl, sessionToken, limit = 50) {
  // Try alternate endpoint if primary fails
  const url = `${baseUrl}/api/audit/events?limit=${limit}`;
  try {
    const res = await fetch(url, {
      headers: {
        Cookie: `opsiq_session=${sessionToken}`,
        Accept: "application/json",
      },
    });
    if (res.status === 200) {
      const body = await res.json();
      return body.events ?? body.data ?? [];
    }
  } catch { /* fall through */ }
  return null;
}

async function main() {
  console.log("=== S7-I10 (LANE_C): Audit and provenance completeness (production) ===");
  console.log(`DEPLOYMENT_ID: ${DEPLOYMENT_ID || "(not set)"}`);
  console.log(`PROBE_OWNER_EMAIL: ${OWNER_EMAIL || "(not set)"}`);

  if (!OWNER_EMAIL || !OWNER_PASSWORD) {
    fail(
      "owner_credentials",
      "REFUSED: PROBE_OWNER_EMAIL and PROBE_OWNER_PASSWORD must be set."
    );
    console.log("\nRESULT: FAIL");
    process.exit(1);
  }

  const baseUrl = await resolveBaseUrl();
  record("probe_base_url", baseUrl);

  let sessionToken;
  try {
    sessionToken = await getOwnerSession(baseUrl);
    record("owner_session_obtained", true);
  } catch (err) {
    fail("owner_login_failed", String(err));
    console.log("\nRESULT: FAIL");
    process.exit(1);
  }

  let events = await fetchAuditEvents(baseUrl, sessionToken);
  if (!events) {
    // Try alternate endpoint
    const alt = await fetchAuditEventsAlternate(baseUrl, sessionToken);
    if (alt) {
      events = alt;
      record("audit_events_from_alternate_endpoint", events.length);
    } else {
      fail("audit_events_unavailable", "Both audit endpoints returned unusable responses");
      console.log("\nRESULT: FAIL");
      process.exit(1);
    }
  }

  if (events.length === 0) {
    // Zero events may mean no pilot activity yet — this is not a PASS for S7-I10
    fail(
      "no_audit_events",
      "Zero audit events found. S7-I10 requires at least one pilot transition " +
        "to be captured before this invariant can be verified."
    );
    console.log("\nRESULT: FAIL");
    process.exit(1);
  }

  // Check each event for the six attribution fields and no raw payload
  let allFieldsPresent = true;
  let allClean = true;
  let compliantCount = 0;

  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    const fieldsOk = checkSixAttributionFields(event, i);
    const cleanOk = checkNoRawPayload(event, i);
    if (fieldsOk && cleanOk) compliantCount++;
    if (!fieldsOk) allFieldsPresent = false;
    if (!cleanOk) allClean = false;
  }

  record(
    "all_events_have_six_attribution_fields",
    `${compliantCount}/${events.length} compliant`,
    allFieldsPresent
  );
  record(
    "no_raw_payload_in_audit_records",
    `${events.filter((_, i) => allClean).length} checked`,
    allClean
  );

  // Verify visibility field is present (should be internal or owner)
  const visibilityMissing = events.filter(
    (e) => !e.visibility || !["internal", "owner", "public"].includes(e.visibility)
  );
  record(
    "all_events_have_visibility",
    visibilityMissing.length === 0 ? "OK" : `${visibilityMissing.length} missing`,
    visibilityMissing.length === 0
  );

  console.log("\n=== OBSERVATION SUMMARY ===");
  const passes = observations.filter((o) => o.pass).length;
  const failures = observations.filter((o) => !o.pass).length;
  console.log(`Checks: ${passes} PASS, ${failures} FAIL`);
  console.log(`Total audit events inspected: ${events.length}`);

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
