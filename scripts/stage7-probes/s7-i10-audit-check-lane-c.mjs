#!/usr/bin/env node
/**
 * S7-I10 (LANE_C) — Audit and provenance completeness (production)
 *
 * Governed statement (docs/opsiq/bundles/factory-stage-7-closure.yaml):
 *   Material owner decisions, approvals, executions, state transitions,
 *   provider actions and outcome records must be attributable to: workspace,
 *   actor, time, source evidence, affected record, and result.
 *   Protected raw payloads must not be copied into audit records.
 * Governed executable evidence:
 *   audit records for PILOT TRANSITIONS inspected; all six attribution fields
 *   present; no raw payload copied into audit record.
 *
 * Six required attribution fields per audit record:
 *   1. workspaceId  — which workspace the event belongs to
 *   2. actorId      — which user performed the action
 *   3. occurredAt   — when the event occurred
 *   4. entityType   — which kind of entity was affected
 *   5. entityId     — which specific entity was affected
 *   6. eventName    — what action occurred (result/outcome proxy)
 *
 * ─── Why the owner-facing audit route, not /api/audit ──────────────────────
 * This probe previously read `/api/audit` (falling back to `/api/audit/events`)
 * with an owner session. `/api/audit` is declared
 * `requireCapabilities: [CAPABILITIES.AUDIT_VIEW]` and `/api/audit/events`
 * `[CAPABILITIES.SYSTEM_VIEW_AUDIT]`. Neither capability belongs to the scoped
 * self-serve owner — and neither belongs to the UN-narrowed
 * `admin_or_portfolio_manager` bundle either: both are held only by
 * `system_admin`. They are internal/operator audit surfaces by construction, so
 * the 403 they returned was correct product behaviour recorded as a failed
 * invariant.
 *
 * The owner-facing equivalent is `/api/owner/trust/audit-trail?entityId=`:
 * `requireCapabilities: [CAPABILITIES.OWNER_VIEW]`, `requireWorkspace: true`,
 * read-only, workspace-scoped through `queryAuditEvents`, which hard-filters
 * `where: { workspaceId }` against the wrapper's verified workspace.
 *
 * Its DTO previously carried five of the six attribution fields and omitted
 * `workspaceId`; that field is now emitted from the persisted audit row (see
 * getEntityAuditTrail in src/services/owner-trust/trust.service.ts), so the
 * owner-accessible surface can evidence workspace attribution without granting
 * the owner any internal capability.
 *
 * Required env vars:
 *   DEPLOYMENT_ID          — Vercel deployment id
 *   PROBE_BASE_URL         — (alternative) direct URL override
 *   PROBE_OWNER_EMAIL      — owner email. Used to authenticate; never emitted
 *                            to the observation.
 *   PROBE_OWNER_PASSWORD   — owner password
 *   PROBE_PILOT_ENTITY_ID  — uuid of the governed pilot record whose transition
 *                            history is being inspected. REQUIRED: the
 *                            invariant is about pilot transitions, not about
 *                            whatever audit rows happen to exist.
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

/** Owner-visible, workspace-scoped audit read. OWNER_VIEW + requireWorkspace. */
const OWNER_AUDIT_ROUTE = "/api/owner/trust/audit-trail";

const SIX_ATTRIBUTION_FIELDS = [
  "workspaceId",
  "actorId",
  "occurredAt",
  "entityType",
  "entityId",
  "eventName",
];

/**
 * Action segments that denote a governed STATE TRANSITION.
 *
 * The invariant is scoped to "audit records for pilot transitions". The prior
 * revision accepted any audit row at all, so a workspace containing only
 * incidental rows (a login, a metrics access) would have satisfied a check
 * about decisions, approvals, executions and state transitions. Event names are
 * `<entity>.<action>`; this is the action allow-list, drawn from the governed
 * vocabulary in src/domain/constants/audit-events.ts. Read/access-shaped
 * actions are deliberately excluded.
 */
const TRANSITION_ACTIONS = new Set([
  "accepted", "activated", "approved", "blocked", "cancelled", "closed",
  "completed", "created", "deactivated", "decided", "denied", "evaluated",
  "executed", "execution_failed", "execution_started", "execution_success",
  "failed", "granted", "initialized", "issued", "locked", "overridden",
  "promoted", "reactivated", "recorded", "rejected", "requested", "resolved",
  "state_initialized", "status_changed", "submitted", "superseded",
  "transitioned", "unblocked", "validated", "verified",
]);

function isTransitionEvent(eventName) {
  if (typeof eventName !== "string") return false;
  const dot = eventName.lastIndexOf(".");
  if (dot < 0) return false;
  return TRANSITION_ACTIONS.has(eventName.slice(dot + 1));
}

/**
 * Patterns that indicate a raw payload was copied into an audit record.
 * Hardened to cover the governed classes: database URLs, password material,
 * authorization/bearer values, private keys, signing-key material and OAuth
 * access/refresh tokens.
 */
const RAW_PAYLOAD_PATTERNS = [
  /sk-[A-Za-z0-9_-]{20,}/,
  /-----BEGIN[^-]*PRIVATE KEY-----/,
  /postgres:\/\/[^@]+@/,
  /postgresql:\/\/[^@]+@/,
  /neon:\/\/[^@]+@/,
  /mysql:\/\/[^@]+@/,
  /SIGNING_KEY/i,
  /EVIDENCE_SIGNING_KEY/i,
  /DATABASE_URL/i,
  /AUTH_SECRET/i,
  /CRON_SECRET/i,
  /OPSIQ_DIAGNOSTIC_KEY/i,
  /hashedPassword/i,
  /\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}/,          // bcrypt hash
  /password\s*[:=]\s*["'][^"']{8,}["']/i,
  // Matches "Authorization: Bearer <tok>" and bare "bearer <tok>" as they appear
  // once JSON-encoded, where the separator is a quote/colon/space run rather than
  // a bare colon.
  /\b(?:authorization|bearer)\b["'\s:=]+(?:bearer\s+)?[A-Za-z0-9._-]{20,}/i,
  /\b(?:access|refresh)_token\b["'\s]*[:=]["'\s]*[^"'\s]{16,}/i,
  /\bgh[pusor]_[A-Za-z0-9]{20,}/,                 // GitHub token forms
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\./, // JWT
];

/** An audit payload larger than this is treated as a raw request copy. */
const MAX_PAYLOAD_BYTES = 10000;

const observations = [];
let failed = false;

/** Record one observation. `pass` is REQUIRED and has no default. */
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
  const missing = [];
  for (const field of SIX_ATTRIBUTION_FIELDS) {
    const value = event[field];
    if (value === null || value === undefined || value === "") missing.push(field);
  }
  if (missing.length > 0) {
    fail(
      `event_${index}_missing_attribution_fields`,
      { missing, eventName: event.eventName ?? "UNKNOWN" }
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
  if (payloadStr.length > MAX_PAYLOAD_BYTES) {
    fail(
      `event_${index}_payload_suspiciously_large`,
      { bytes: payloadStr.length, eventName: event.eventName }
    );
    return false;
  }
  return true;
}

/**
 * Fetch the governed audit trail for the configured pilot entity from the
 * owner-facing route. There is deliberately NO fallback endpoint: the previous
 * revision fell through to `/api/audit/events`, an internal route the owner
 * cannot reach, which only turned one authorization denial into two.
 */
async function fetchOwnerAuditEvents(baseUrl, sessionToken) {
  const url = `${baseUrl}${OWNER_AUDIT_ROUTE}?entityId=${encodeURIComponent(PILOT_ENTITY_ID)}`;
  let res;
  try {
    res = await fetch(url, {
      headers: {
        Cookie: `opsiq_session=${sessionToken}`,
        Accept: "application/json",
      },
    });
  } catch (err) {
    fail("owner_audit_network_error", String(err));
    return null;
  }

  const ok = res.status === 200;
  record("owner_audit_http_status", res.status, ok);
  if (!ok) {
    fail(
      "owner_audit_unavailable",
      `Expected 200 from ${OWNER_AUDIT_ROUTE} (OWNER_VIEW, workspace-scoped); got ${res.status}`
    );
    return null;
  }

  let body;
  try {
    body = await res.json();
  } catch {
    fail("owner_audit_not_json", "Failed to parse owner audit-trail response");
    return null;
  }

  const events = body?.events ?? [];
  if (!Array.isArray(events)) {
    fail("owner_audit_events_not_array", typeof events);
    return null;
  }
  record("audit_events_count", events.length, true);
  return events;
}

async function main() {
  console.log("=== S7-I10 (LANE_C): Audit and provenance completeness (production) ===");
  console.log(`DEPLOYMENT_ID: ${DEPLOYMENT_ID || "(not set)"}`);
  // Presence only. The address is used to authenticate and is never printed:
  // this line is copied verbatim into the signed observation.
  console.log(`PROBE_OWNER_EMAIL: ${OWNER_EMAIL ? "set" : "not set"}`);
  // A record identifier: presence only, never emitted.
  console.log(`PROBE_PILOT_ENTITY_ID: ${PILOT_ENTITY_ID ? "set" : "not set"}`);

  if (!OWNER_EMAIL || !OWNER_PASSWORD) {
    fail(
      "owner_credentials",
      "REFUSED: PROBE_OWNER_EMAIL and PROBE_OWNER_PASSWORD must be set."
    );
    console.log("\nRESULT: FAIL");
    process.exit(1);
  }

  if (!PILOT_ENTITY_ID) {
    fail(
      "pilot_entity_prerequisite_missing",
      "REFUSED: PROBE_PILOT_ENTITY_ID must name the governed pilot record " +
        "whose transitions are inspected. S7-I10 is scoped to pilot " +
        "transitions; an arbitrary audit row cannot evidence it."
    );
    console.log("\nRESULT: FAIL");
    process.exit(1);
  }

  const baseUrl = await resolveBaseUrl();
  record("probe_base_url", baseUrl, true);
  record("owner_audit_route_under_test", OWNER_AUDIT_ROUTE, true);

  let sessionToken;
  try {
    sessionToken = await getOwnerSession(baseUrl);
    record("owner_session_obtained", true, true);
  } catch (err) {
    fail("owner_login_failed", String(err));
    console.log("\nRESULT: FAIL");
    process.exit(1);
  }

  const events = await fetchOwnerAuditEvents(baseUrl, sessionToken);
  if (!events) {
    console.log("\nRESULT: FAIL");
    process.exit(1);
  }

  // Zero events is NOT a pass. S7-I10 requires real pilot transitions to have
  // been captured; an empty set evidences nothing. Preserved deliberately.
  if (events.length === 0) {
    fail(
      "no_audit_events",
      "Zero audit events found for the configured pilot entity. S7-I10 " +
        "requires at least one pilot transition to be captured before this " +
        "invariant can be verified."
    );
    console.log("\nRESULT: FAIL");
    process.exit(1);
  }

  // ─── Qualifying pilot transitions ────────────────────────────────────────
  const transitionCount = events.filter((e) => isTransitionEvent(e.eventName)).length;
  record(
    "qualifying_pilot_transition_events",
    `${transitionCount}/${events.length} are state transitions`,
    transitionCount > 0
  );
  if (transitionCount === 0) {
    fail(
      "no_qualifying_pilot_transition",
      "The configured pilot entity has audit rows but none is a governed " +
        "state transition. S7-I10 is about decisions, approvals, executions " +
        "and state transitions, not incidental audit activity."
    );
  }

  // ─── Attribution completeness and raw-payload absence, every record ──────
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
    `${events.length} records checked`,
    allClean
  );

  // ─── Workspace attribution is single-valued and server-derived ───────────
  // Every row comes from a query hard-filtered on the wrapper's verified
  // workspace, so a second distinct workspaceId in one response would mean the
  // scoping had been bypassed. Reported as a count, never as an identifier.
  const distinctWorkspaces = new Set(
    events.map((e) => e.workspaceId).filter((w) => w !== null && w !== undefined)
  );
  record(
    "audit_events_single_workspace_attribution",
    `${distinctWorkspaces.size} distinct workspaceId across ${events.length} records`,
    distinctWorkspaces.size === 1
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
