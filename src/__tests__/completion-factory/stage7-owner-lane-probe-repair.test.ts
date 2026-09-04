/**
 * Stage 7 — owner-lane LANE_C probe repair (S7-I4 / S7-I5 / S7-I10).
 *
 * The three production probes asserted against routes the designated owner is
 * DELIBERATELY not entitled to reach, and then reported the resulting
 * authorization denials as invariant failures — or, worse, as passes.
 *
 *   S7-I4   sent its authenticated-session request to /api/operator
 *           (requireCapabilities: [ACTION_VIEW]). A scoped self-serve owner is
 *           narrowed to OWNER_SCOPED_CAPABILITIES, which excludes action:view,
 *           so the route answered 403 — an AUTHORIZATION outcome reached only
 *           after the session AND the workspace-scoped policy context both
 *           resolved. The probe recorded it as "session not accepted".
 *
 *   S7-I10  read /api/audit (audit:view) and /api/audit/events
 *           (system:view_audit). Both capabilities belong only to system_admin,
 *           so neither is reachable by the owner under any configuration.
 *
 *   S7-I5   scanned for secrets only inside `if ([200,404].includes(status))`,
 *           let every 403 fall to an `else` branch that recorded a
 *           default-true verdict, invoked its workspace-binding test with a
 *           hardcoded `null` that the test's own first line short-circuited on,
 *           and "proved" cross-workspace isolation with an UNAUTHENTICATED
 *           request. It reported 11 PASS / 0 FAIL having scanned no authorized
 *           owner response at all.
 *
 * These tests fail if any of that returns. The probe cases are executable, not
 * source greps: a stub deployment runs OUT OF PROCESS (the probes are driven
 * with spawnSync, which blocks this process's event loop, so an in-process
 * server would never accept the connection) and its behaviour is steered
 * through a JSON state file it re-reads per request.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { spawn, spawnSync } from "child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import yaml from "js-yaml";

const REPO_ROOT = process.cwd();
const PROBE_DIR = join(REPO_ROOT, "scripts/stage7-probes");
const I4_PROBE = join(PROBE_DIR, "s7-i4-auth-check.mjs");
const I5_PROBE = join(PROBE_DIR, "s7-i5-boundary-check.mjs");
const I10_PROBE = join(PROBE_DIR, "s7-i10-audit-check-lane-c.mjs");

const I4_SRC = readFileSync(I4_PROBE, "utf-8");
const I5_SRC = readFileSync(I5_PROBE, "utf-8");
const I10_SRC = readFileSync(I10_PROBE, "utf-8");

const OWNER_EMAIL = "owner@example.invalid";
const OWNER_PASSWORD = "probe-password-fixture";
const OWN_WORKSPACE = "11111111-1111-4111-8111-111111111111";
const FOREIGN_WORKSPACE = "22222222-2222-4222-8222-222222222222";
const FOREIGN_ENTITY = "33333333-3333-4333-8333-333333333333";
const PILOT_ENTITY = "44444444-4444-4444-8444-444444444444";

// ─── Static probe-target contract ────────────────────────────────────────────

describe("S7-I4 — the authenticated-session target is a route the owner is entitled to", () => {
  it("does not send its authenticated request to /api/operator", () => {
    const active = I4_SRC.split("\n")
      .filter((l) => !l.trim().startsWith("*") && !l.trim().startsWith("//"))
      .join("\n");
    expect(active).not.toContain("/api/operator");
  });

  it("targets an OWNER_VIEW route", () => {
    expect(I4_SRC).toContain('const OWNER_ROUTE = "/api/owner/home"');
  });

  it("keeps the target's contract asserted in the repo it was verified against", () => {
    const route = readFileSync(join(REPO_ROOT, "src/app/api/owner/home/route.ts"), "utf-8");
    expect(route).toContain("CAPABILITIES.OWNER_VIEW");
    expect(route).toContain("requireWorkspace: true");
    // Read-only: a GET handler and no other verb.
    expect(route).toContain("export const GET");
    expect(route).not.toMatch(/export const (POST|PUT|PATCH|DELETE)\b/);
  });
});

describe("S7-I10 — the audit target is the owner-facing route", () => {
  it("does not read the internal audit routes", () => {
    const active = I10_SRC.split("\n")
      .filter((l) => !l.trim().startsWith("*") && !l.trim().startsWith("//"))
      .join("\n");
    expect(active).not.toContain('"/api/audit"');
    expect(active).not.toContain("/api/audit/events");
  });

  it("targets /api/owner/trust/audit-trail", () => {
    expect(I10_SRC).toContain('const OWNER_AUDIT_ROUTE = "/api/owner/trust/audit-trail"');
  });

  it("keeps the target's contract asserted in the repo it was verified against", () => {
    const route = readFileSync(
      join(REPO_ROOT, "src/app/api/owner/trust/audit-trail/route.ts"),
      "utf-8",
    );
    expect(route).toContain("CAPABILITIES.OWNER_VIEW");
    expect(route).toContain("requireWorkspace: true");
    expect(route).toContain("export const GET");
    expect(route).not.toMatch(/export const (POST|PUT|PATCH|DELETE)\b/);
  });
});

describe("every probe verdict is explicit — no default-true observations", () => {
  it.each([
    ["s7-i4-auth-check.mjs", I4_SRC],
    ["s7-i5-boundary-check.mjs", I5_SRC],
    ["s7-i10-audit-check-lane-c.mjs", I10_SRC],
  ])("%s declares record() with a required verdict", (_name, src) => {
    // The vacuity root cause: `function record(label, value, pass = true)`.
    expect(src).not.toMatch(/function record\([^)]*pass\s*=/);
    expect(src).toContain("requires an explicit boolean verdict");
  });

  it("S7-I5 no longer invokes its workspace-binding test with a hardcoded null", () => {
    // Comment lines are excluded: the header deliberately quotes the removed
    // call so the defect stays legible to a future reader.
    const active = I5_SRC.split("\n")
      .filter((l) => !l.trim().startsWith("*") && !l.trim().startsWith("//"))
      .join("\n");
    expect(active).not.toContain("testWorkspaceBindingWithSession");
    expect(active).not.toMatch(/sessionToken,\s*null\s*\)/);
    // A skipped assertion must never be able to score as a passing observation.
    expect(active).not.toContain("SKIPPED");
  });

  it("S7-I5 keeps the audit-events clause of the governed evidence", () => {
    expect(I5_SRC).toContain("testAuditEventsForSecrets");
    expect(I5_SRC).toMatch(/audit_events_no_secrets/);
  });
});

describe("capture workflow — governed assertion text and fail-closed fixtures", () => {
  const WORKFLOW_SRC = readFileSync(
    join(REPO_ROOT, ".github/workflows/stage7-capture.yml"),
    "utf-8",
  );
  const WORKFLOW = yaml.load(WORKFLOW_SRC) as {
    jobs: { capture: { steps: Array<{ id?: string; name?: string; env?: Record<string, string> }> } };
  };

  it("S7-I5's assertion names audit events, as the canonical evidence does", () => {
    const governance = readFileSync(
      join(REPO_ROOT, "docs/opsiq/bundles/factory-stage-7-closure.yaml"),
      "utf-8",
    );
    // The canonical executable_evidence lists three surfaces; the assertion must too.
    expect(governance).toContain("health output, and audit events");
    const assertionLine = WORKFLOW_SRC.split("\n").find(
      (l) => l.includes("assertion=Cross-workspace rejection confirmed"),
    );
    expect(assertionLine).toBeDefined();
    expect(assertionLine).toContain("audit events");
  });

  it("declares the cross-workspace fixture as a required input for S7-I4 and S7-I5", () => {
    for (const id of ["S7-I4", "S7-I5"]) {
      const block = WORKFLOW_SRC.slice(
        WORKFLOW_SRC.indexOf(`${id})`),
        WORKFLOW_SRC.indexOf(`${id})`) + 1600,
      );
      expect(block, id).toContain("PROBE_FOREIGN_WORKSPACE_ID");
      expect(block, id).toContain("PROBE_FOREIGN_ENTITY_ID");
    }
  });

  it("declares the pilot-entity fixture as a required input for S7-I5 and S7-I10-LANE_C", () => {
    for (const id of ["S7-I5", "S7-I10-LANE_C"]) {
      const block = WORKFLOW_SRC.slice(
        WORKFLOW_SRC.indexOf(`${id})`),
        WORKFLOW_SRC.indexOf(`${id})`) + 1600,
      );
      expect(block, id).toContain("PROBE_PILOT_ENTITY_ID");
    }
  });

  it("supplies the fixtures to the observation step", () => {
    const observe = WORKFLOW.jobs.capture.steps.find((s) => s.id === "observe");
    expect(observe?.env?.PROBE_PILOT_ENTITY_ID).toContain("secrets.");
    expect(observe?.env?.PROBE_FOREIGN_WORKSPACE_ID).toContain("secrets.");
    expect(observe?.env?.PROBE_FOREIGN_ENTITY_ID).toContain("secrets.");
  });
});

// ─── Hermetic stub deployment ────────────────────────────────────────────────

interface StubState {
  /** status returned by GET /api/owner/home */
  ownerHomeStatus: number;
  /** body returned by GET /api/owner/home */
  ownerHomeBody: unknown;
  /** status returned by GET /api/operator (the route the owner is denied) */
  operatorStatus: number;
  /** audit events returned by GET /api/owner/trust/audit-trail */
  auditEvents: unknown[];
  auditStatus: number;
  /** audit events returned for the FOREIGN entity id */
  foreignAuditEvents: unknown[];
  /** true → an unknown/revoked session token is (wrongly) accepted */
  acceptAnyToken: boolean;
  loginStatus: number;
  cookieAttrs: string;
  /**
   * Milliseconds until the session cookie's Expires attribute, mirroring the
   * login route's `expires: expiresAt`. `null` omits the attribute entirely.
   */
  cookieExpiryMs: number | null;
  logoutSetCookie: string;
  healthBody: unknown;
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const DEFAULT_STATE: StubState = {
  ownerHomeStatus: 200,
  ownerHomeBody: { businesses: [], selectedBusinessId: null, hasData: false },
  operatorStatus: 403,
  auditEvents: [],
  auditStatus: 200,
  foreignAuditEvents: [],
  acceptAnyToken: false,
  loginStatus: 200,
  cookieAttrs: "; Path=/; HttpOnly; Secure; SameSite=Lax",
  cookieExpiryMs: ONE_DAY_MS,
  logoutSetCookie: "opsiq_session=; Path=/; Max-Age=0",
  healthBody: { status: "healthy", checks: { database: { status: "healthy" } } },
};

const STUB_SERVER = `
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
const statePath = process.argv[2];
const VALID = "valid-session-token-fixture";
const FOREIGN_ENTITY = ${JSON.stringify(FOREIGN_ENTITY)};
const read = () => JSON.parse(readFileSync(statePath, "utf-8"));
const json = (res, code, body) => {
  res.writeHead(code, { "content-type": "application/json" });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
};
let loggedOut = false;
const server = createServer(async (req, res) => {
  const s = read();
  const url = new URL(req.url, "http://x");
  const cookie = req.headers.cookie || "";
  const token = /opsiq_session=([^;]+)/.exec(cookie)?.[1] ?? null;
  const authed = token !== null && (s.acceptAnyToken || (token === VALID && !loggedOut));

  if (url.pathname === "/api/health") return json(res, 200, s.healthBody);

  if (url.pathname === "/api/auth/login" && req.method === "POST") {
    let raw = "";
    for await (const c of req) raw += c;
    let body = null;
    try { body = JSON.parse(raw); } catch {
      return json(res, 400, { error: "Invalid request body" });
    }
    if (body.email !== ${JSON.stringify(OWNER_EMAIL)} || body.password !== ${JSON.stringify(OWNER_PASSWORD)}) {
      return json(res, 401, { error: "Unauthorized" });
    }
    if (s.loginStatus !== 200) return json(res, s.loginStatus, { error: "Unauthorized" });
    loggedOut = false;
    const expiry = s.cookieExpiryMs === null
      ? ""
      : "; Expires=" + new Date(Date.now() + s.cookieExpiryMs).toUTCString();
    res.setHeader("set-cookie", "opsiq_session=" + VALID + s.cookieAttrs + expiry);
    return json(res, 200, { user: { id: "u1", email: ${JSON.stringify(OWNER_EMAIL)}, name: "Owner" } });
  }

  if (url.pathname === "/api/auth/logout" && req.method === "POST") {
    loggedOut = true;
    res.setHeader("set-cookie", s.logoutSetCookie);
    return json(res, 200, { success: true });
  }

  if (url.pathname === "/api/operator") {
    if (!authed) return json(res, 401, { error: "Unauthorized" });
    return json(res, s.operatorStatus, { error: "Insufficient permissions" });
  }

  if (url.pathname === "/api/owner/home") {
    if (!authed) return json(res, 401, { error: "Unauthorized" });
    return json(res, s.ownerHomeStatus, s.ownerHomeBody);
  }

  if (url.pathname === "/api/owner/trust/audit-trail") {
    if (!authed) return json(res, 401, { error: "Unauthorized" });
    const entityId = url.searchParams.get("entityId");
    if (!entityId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(entityId)) {
      return json(res, 400, { error: "Validation failed" });
    }
    if (s.auditStatus !== 200) return json(res, s.auditStatus, { error: "Insufficient permissions" });
    const events = entityId === FOREIGN_ENTITY ? s.foreignAuditEvents : s.auditEvents;
    return json(res, 200, { entityId, events });
  }

  return json(res, 404, {});
});
server.listen(0, "127.0.0.1", () => console.log("PORT=" + server.address().port));
`;

let stubProc: ReturnType<typeof spawn>;
let stubDir = "";
let statePath = "";
let baseUrl = "";

function setStub(patch: Partial<StubState>): void {
  writeFileSync(statePath, JSON.stringify({ ...DEFAULT_STATE, ...patch }), "utf-8");
}

beforeAll(async () => {
  stubDir = mkdtempSync(join(tmpdir(), "s7-owner-lane-stub-"));
  statePath = join(stubDir, "state.json");
  writeFileSync(statePath, JSON.stringify(DEFAULT_STATE), "utf-8");
  const serverPath = join(stubDir, "stub-server.mjs");
  writeFileSync(serverPath, STUB_SERVER, "utf-8");

  stubProc = spawn("node", [serverPath, statePath], { stdio: ["ignore", "pipe", "pipe"] });
  baseUrl = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("stub server did not start")), 20000);
    stubProc.stdout?.on("data", (chunk: Buffer) => {
      const m = /PORT=(\d+)/.exec(chunk.toString());
      if (m) {
        clearTimeout(timer);
        resolve(`http://127.0.0.1:${m[1]}`);
      }
    });
  });
}, 30000);

afterAll(() => {
  stubProc?.kill();
  if (stubDir) rmSync(stubDir, { recursive: true, force: true });
});

interface ProbeResult {
  exitCode: number;
  out: string;
  result: "PASS" | "FAIL" | "NONE";
}

function runProbe(probePath: string, env: Record<string, string> = {}): ProbeResult {
  const r = spawnSync("node", [probePath], {
    encoding: "utf-8",
    env: {
      PATH: process.env.PATH ?? "",
      PROBE_BASE_URL: baseUrl,
      DEPLOYMENT_ID: "dpl_fixture",
      PROBE_OWNER_EMAIL: OWNER_EMAIL,
      PROBE_OWNER_PASSWORD: OWNER_PASSWORD,
      PROBE_PILOT_ENTITY_ID: PILOT_ENTITY,
      PROBE_FOREIGN_WORKSPACE_ID: FOREIGN_WORKSPACE,
      PROBE_FOREIGN_ENTITY_ID: FOREIGN_ENTITY,
      ...env,
    },
  });
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  const result = /^RESULT: PASS$/m.test(out)
    ? "PASS"
    : /^RESULT: FAIL$/m.test(out)
      ? "FAIL"
      : "NONE";
  return { exitCode: r.status ?? -1, out, result };
}

function auditEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: "e1",
    workspaceId: OWN_WORKSPACE,
    eventName: "decision.status_changed",
    entityType: "OperatorItem",
    entityId: PILOT_ENTITY,
    actorId: "u1",
    occurredAt: "2026-09-01T00:00:00.000Z",
    payload: { before: "pending", after: "in_progress" },
    ...overrides,
  };
}

// ─── S7-I4 executable behaviour ──────────────────────────────────────────────

describe("S7-I4 — a capability denial is not an authentication failure", () => {
  it("passes while /api/operator still 403s, because that route is no longer the test", () => {
    // The exact production shape: the owner is denied action:view but holds
    // owner:view. Under the old probe this was RESULT: FAIL.
    setStub({ operatorStatus: 403, ownerHomeStatus: 200 });
    const r = runProbe(I4_PROBE);
    expect(r.result).toBe("PASS");
    expect(r.exitCode).toBe(0);
    expect(r.out).toContain("owner_route_with_session");
  });

  it("fails when the owner-entitled route itself denies the session", () => {
    // A 403 HERE is a real finding: the owner does hold owner:view.
    setStub({ ownerHomeStatus: 403 });
    const r = runProbe(I4_PROBE);
    expect(r.result).toBe("FAIL");
    expect(r.out).toContain("owner_session_not_accepted_on_entitled_route");
  });

  it("fails closed when the cross-workspace fixture is absent", () => {
    setStub({});
    const r = runProbe(I4_PROBE, {
      PROBE_FOREIGN_WORKSPACE_ID: "",
      PROBE_FOREIGN_ENTITY_ID: "",
    });
    expect(r.result).toBe("FAIL");
    expect(r.out).toContain("cross_workspace_probe_prerequisite_missing");
    // It must not quietly skip.
    expect(r.out).not.toContain("SKIPPED");
  });

  it("fails when foreign-workspace records come back to the owner session", () => {
    setStub({ foreignAuditEvents: [auditEvent({ workspaceId: FOREIGN_WORKSPACE })] });
    const r = runProbe(I4_PROBE);
    expect(r.result).toBe("FAIL");
    expect(r.out).toMatch(/cross_workspace_(returns_no_foreign_records|response_excludes_foreign_workspace)/);
  });

  it("fails when a session token matching no session row is accepted", () => {
    setStub({ acceptAnyToken: true });
    const r = runProbe(I4_PROBE);
    expect(r.result).toBe("FAIL");
    expect(r.out).toContain("unknown_session_accepted");
  });

  it("fails when the session cookie carries no Secure flag in production", () => {
    setStub({ cookieAttrs: "; Path=/; HttpOnly; SameSite=Lax" });
    const r = runProbe(I4_PROBE);
    expect(r.result).toBe("FAIL");
    expect(r.out).toContain("session_cookie_secure");
  });

  it("fails when the session cookie carries no expiry attribute at all", () => {
    setStub({ cookieExpiryMs: null });
    const r = runProbe(I4_PROBE);
    expect(r.result).toBe("FAIL");
    expect(r.out).toContain("session_cookie_expiry_attribute_present");
  });

  it("fails when the session cookie outlives the configured session lifetime", () => {
    setStub({ cookieExpiryMs: 30 * ONE_DAY_MS });
    const r = runProbe(I4_PROBE);
    expect(r.result).toBe("FAIL");
    expect(r.out).toContain("session_cookie_expiry_bounded_to_configured_lifetime");
  });

  it("fails when logout does not actually clear the session cookie", () => {
    setStub({ logoutSetCookie: "opsiq_session=still-live; Path=/" });
    const r = runProbe(I4_PROBE);
    expect(r.result).toBe("FAIL");
    expect(r.out).toContain("logout_clears_session_cookie");
  });
});

// ─── S7-I5 executable behaviour ──────────────────────────────────────────────

describe("S7-I5 — denial can never stand in for an authorized-response scan", () => {
  it("fails when the owner route denies, instead of recording the denial as a pass", () => {
    setStub({ ownerHomeStatus: 403, auditEvents: [auditEvent()] });
    const r = runProbe(I5_PROBE);
    expect(r.result).toBe("FAIL");
    expect(r.out).toContain("authorized_owner_response_unavailable");
  });

  it("passes on a clean authorized response with real audit events", () => {
    setStub({ auditEvents: [auditEvent()] });
    const r = runProbe(I5_PROBE);
    expect(r.result).toBe("PASS");
    expect(r.out).toContain("authorized_owner_response_no_secrets");
    expect(r.out).toContain("audit_events_no_secrets");
  });

  it("fails when the authorized owner response contains secret material", () => {
    setStub({
      auditEvents: [auditEvent()],
      ownerHomeBody: { note: "postgresql://user:pw@db.example.invalid/app" },
    });
    const r = runProbe(I5_PROBE);
    expect(r.result).toBe("FAIL");
    expect(r.out).toContain("authorized_owner_response_secret_leak");
  });

  it("fails closed when no pilot entity is configured for the audit-events clause", () => {
    setStub({ auditEvents: [auditEvent()] });
    const r = runProbe(I5_PROBE, { PROBE_PILOT_ENTITY_ID: "" });
    expect(r.result).toBe("FAIL");
    expect(r.out).toContain("audit_event_secret_scan_prerequisite_missing");
  });

  it("refuses to score an empty audit set as a clean audit scan", () => {
    setStub({ auditEvents: [] });
    const r = runProbe(I5_PROBE);
    expect(r.result).toBe("FAIL");
    expect(r.out).toContain("audit_event_secret_scan_vacuous");
  });

  it("fails when a secret is present in an owner-visible audit event", () => {
    setStub({
      auditEvents: [
        auditEvent({ payload: { hashedPassword: "$2b$10$" + "a".repeat(53) } }),
      ],
    });
    const r = runProbe(I5_PROBE);
    expect(r.result).toBe("FAIL");
    expect(r.out).toContain("audit_event_secret_leak");
  });

  it("fails closed when the cross-workspace fixture is absent", () => {
    setStub({ auditEvents: [auditEvent()] });
    const r = runProbe(I5_PROBE, {
      PROBE_FOREIGN_WORKSPACE_ID: "",
      PROBE_FOREIGN_ENTITY_ID: "",
    });
    expect(r.result).toBe("FAIL");
    expect(r.out).toContain("cross_workspace_probe_prerequisite_missing");
  });

  it("fails when a foreign workspace's audit records reach the owner", () => {
    setStub({
      auditEvents: [auditEvent()],
      foreignAuditEvents: [auditEvent({ workspaceId: FOREIGN_WORKSPACE })],
    });
    const r = runProbe(I5_PROBE);
    expect(r.result).toBe("FAIL");
    expect(r.out).toMatch(/cross_workspace_audit_(returns_no_foreign_records|excludes_foreign_workspace)/);
  });

  it("fails when an authenticated error path leaks internal detail", () => {
    setStub({ auditEvents: [auditEvent()], auditStatus: 200 });
    // The stub answers a malformed entityId with a clean 400; assert the probe
    // actually exercised that authenticated error path.
    const r = runProbe(I5_PROBE);
    expect(r.out).toContain("authenticated_error_no_raw_internals");
  });
});

// ─── S7-I10 executable behaviour ─────────────────────────────────────────────

describe("S7-I10 — owner-facing audit trail with complete attribution", () => {
  it("passes on transition events carrying all six attribution fields", () => {
    setStub({ auditEvents: [auditEvent()] });
    const r = runProbe(I10_PROBE);
    expect(r.result).toBe("PASS");
    expect(r.out).toContain("all_events_have_six_attribution_fields");
    expect(r.out).toContain("qualifying_pilot_transition_events");
  });

  it("still fails closed on zero events", () => {
    setStub({ auditEvents: [] });
    const r = runProbe(I10_PROBE);
    expect(r.result).toBe("FAIL");
    expect(r.out).toContain("no_audit_events");
  });

  it("fails closed when no pilot entity is named", () => {
    setStub({ auditEvents: [auditEvent()] });
    const r = runProbe(I10_PROBE, { PROBE_PILOT_ENTITY_ID: "" });
    expect(r.result).toBe("FAIL");
    expect(r.out).toContain("pilot_entity_prerequisite_missing");
  });

  it("fails when workspaceId is missing from the owner audit DTO", () => {
    // The exact pre-repair DTO shape: five of six attribution fields.
    setStub({ auditEvents: [auditEvent({ workspaceId: undefined })] });
    const r = runProbe(I10_PROBE);
    expect(r.result).toBe("FAIL");
    expect(r.out).toContain("missing_attribution_fields");
    expect(r.out).toContain("workspaceId");
  });

  it("fails when the trail holds no governed state transition", () => {
    setStub({ auditEvents: [auditEvent({ eventName: "metrics.decision_latency_accessed" })] });
    const r = runProbe(I10_PROBE);
    expect(r.result).toBe("FAIL");
    expect(r.out).toContain("no_qualifying_pilot_transition");
  });

  it("fails when more than one workspace appears in one workspace-scoped response", () => {
    setStub({
      auditEvents: [auditEvent(), auditEvent({ id: "e2", workspaceId: FOREIGN_WORKSPACE })],
    });
    const r = runProbe(I10_PROBE);
    expect(r.result).toBe("FAIL");
    expect(r.out).toContain("audit_events_single_workspace_attribution");
  });

  it.each([
    ["database URL", { conn: "postgres://u:p@host.invalid/db" }],
    ["password material", { hashedPassword: "$2a$10$" + "b".repeat(53) }],
    ["bearer value", { header: "Authorization: Bearer " + "T".repeat(32) }],
    ["private key", { pem: "-----BEGIN RSA PRIVATE KEY-----" }],
    ["signing key material", { note: "EVIDENCE_SIGNING_KEY rotated" }],
    ["oauth token", { access_token: "x".repeat(24) }],
    ["github token", { t: "ghp_" + "z".repeat(30) }],
  ])("fails on a raw %s copied into an audit payload", (_label, payload) => {
    setStub({ auditEvents: [auditEvent({ payload })] });
    const r = runProbe(I10_PROBE);
    expect(r.result).toBe("FAIL");
    expect(r.out).toContain("raw_payload_leak");
  });

  it("fails on an oversized raw request copy", () => {
    setStub({ auditEvents: [auditEvent({ payload: { blob: "x".repeat(11000) } })] });
    const r = runProbe(I10_PROBE);
    expect(r.result).toBe("FAIL");
    expect(r.out).toContain("payload_suspiciously_large");
  });

  it("fails when the owner audit route denies, rather than falling back to an internal one", () => {
    setStub({ auditStatus: 403, auditEvents: [auditEvent()] });
    const r = runProbe(I10_PROBE);
    expect(r.result).toBe("FAIL");
    expect(r.out).toContain("owner_audit_unavailable");
    // No silent second attempt at an internal route.
    expect(r.out).not.toContain("/api/audit/events");
  });
});

// ─── Owner audit DTO — workspaceId is server-derived and tenant-safe ─────────

const auditMocks = vi.hoisted(() => ({ queryAuditEvents: vi.fn() }));
vi.mock("@/infra/audit", () => ({ queryAuditEvents: auditMocks.queryAuditEvents }));
// getDbInstance is part of the vitest.setup.ts db-mock contract (gate DC-20).
vi.mock("@/lib/db", () => ({ db: {}, getDbInstance: vi.fn().mockResolvedValue({}) }));

describe("getEntityAuditTrail — explicit workspace attribution", () => {
  it("emits workspaceId from the persisted row", async () => {
    const { getEntityAuditTrail } = await import("@/services/owner-trust/trust.service");
    auditMocks.queryAuditEvents.mockResolvedValue([
      {
        id: "e1",
        workspaceId: OWN_WORKSPACE,
        eventName: "decision.status_changed",
        entityType: "OperatorItem",
        entityId: PILOT_ENTITY,
        actorId: "u1",
        occurredAt: new Date("2026-09-01T00:00:00.000Z"),
        payload: { after: "done" },
      },
    ]);

    const events = await getEntityAuditTrail(PILOT_ENTITY, OWN_WORKSPACE);
    expect(events).toHaveLength(1);
    for (const field of [
      "workspaceId",
      "actorId",
      "occurredAt",
      "entityType",
      "entityId",
      "eventName",
    ]) {
      expect(events[0], `missing ${field}`).toHaveProperty(field);
      expect((events[0] as Record<string, unknown>)[field]).toBeTruthy();
    }
    expect(events[0].workspaceId).toBe(OWN_WORKSPACE);
  });

  it("reports the row's workspace, never the caller's argument", async () => {
    const { getEntityAuditTrail } = await import("@/services/owner-trust/trust.service");
    // A row whose persisted workspace disagrees with the argument must surface
    // the ROW's value. Reflecting the parameter would make the field
    // self-fulfilling and worthless as attribution evidence.
    auditMocks.queryAuditEvents.mockResolvedValue([
      { id: "e1", workspaceId: FOREIGN_WORKSPACE, eventName: "decision.closed",
        entityType: "OperatorItem", entityId: PILOT_ENTITY, actorId: "u1",
        occurredAt: new Date("2026-09-01T00:00:00.000Z"), payload: null },
    ]);

    const events = await getEntityAuditTrail(PILOT_ENTITY, OWN_WORKSPACE);
    expect(events[0].workspaceId).toBe(FOREIGN_WORKSPACE);
    expect(events[0].workspaceId).not.toBe(OWN_WORKSPACE);
  });

  it("scopes the underlying query to the verified workspace, not a caller-selected one", async () => {
    const { getEntityAuditTrail } = await import("@/services/owner-trust/trust.service");
    auditMocks.queryAuditEvents.mockResolvedValue([]);

    await getEntityAuditTrail(PILOT_ENTITY, OWN_WORKSPACE);
    expect(auditMocks.queryAuditEvents).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: OWN_WORKSPACE, entityId: PILOT_ENTITY }),
    );
  });

  it("adds no other internal audit column to the owner-facing DTO", async () => {
    const { getEntityAuditTrail } = await import("@/services/owner-trust/trust.service");
    auditMocks.queryAuditEvents.mockResolvedValue([
      { id: "e1", workspaceId: OWN_WORKSPACE, eventName: "decision.closed",
        entityType: "OperatorItem", entityId: PILOT_ENTITY, actorId: "u1",
        occurredAt: new Date("2026-09-01T00:00:00.000Z"), payload: null,
        previousHash: "deadbeef", correlationId: "corr-1", visibility: "internal" },
    ]);

    const events = await getEntityAuditTrail(PILOT_ENTITY, OWN_WORKSPACE);
    expect(Object.keys(events[0]).sort()).toEqual(
      ["actorId", "entityId", "entityType", "eventName", "id", "occurredAt", "payload", "workspaceId"],
    );
  });
});
