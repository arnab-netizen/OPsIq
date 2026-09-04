/**
 * Stage 7 — no session-credential material reaches the observation.
 *
 * S7-I4 logs in as the owner and holds the resulting `opsiq_session` cookie so
 * it can exercise the authenticated, logout and revocation paths. On its way it
 * printed a slice of that live credential:
 *
 *   console.log(`  Session cookie obtained (first 8 chars): ${sessionToken.slice(0, 8)}...`)
 *
 * Everything the probe prints becomes the raw observation, which is hashed,
 * signed and committed to docs/opsiq/evidence/stage-7/artifacts/. Artifacts are
 * append-only, so a correction is a new artifact rather than an edit and the
 * disclosure could not be withdrawn. A prefix of a session token is credential
 * material, and it carries no proof value: `login_session_cookie_set` already
 * records that a cookie was obtained and the flag checks assert its hardening,
 * so nothing the invariant asserts depends on the value.
 *
 * Owner decision: NO SESSION CREDENTIAL MATERIAL IN OBSERVATION.
 *
 * The token itself is unchanged — still parsed, still held, still sent on the
 * follow-up requests. Only the output is redacted. These tests pin both halves:
 * no fragment of the credential is emitted, and every S7-I4 verdict (including
 * the failing ones) is exactly what it was before the redaction.
 */
import { afterEach, describe, expect, it } from "vitest";
import { spawn, spawnSync } from "child_process";
import { readFileSync } from "fs";
import { join } from "path";

const REPO_ROOT = process.cwd();
const S7_I4 = "scripts/stage7-probes/s7-i4-auth-check.mjs";

const SENTINEL_EMAIL = "sentinel-owner-stage7@example.invalid";
const SENTINEL_PASSWORD = "SENTINEL_PW_cookie_zz9";

/**
 * A synthetic session credential with separately searchable components, so a
 * leak of any part of it — whole value, leading slice, trailing slice, or the
 * secret core — is distinguishable from a leak of any other part.
 */
const SENTINEL_COOKIE = "stage7-cookie-SUPERSECRET-1234567890";
const COOKIE_PREFIX_8 = SENTINEL_COOKIE.slice(0, 8); // "stage7-c"
const COOKIE_SUFFIX_10 = SENTINEL_COOKIE.slice(-10); // "1234567890"
const COOKIE_SECRET_COMPONENT = "SUPERSECRET";

/**
 * A stub deployment. `STUB_COOKIE` empty omits the set-cookie header entirely
 * (login succeeds, no session), `STUB_INVALIDATE` issues a cookie the server
 * then refuses (invalid session), and `STUB_RETURNED_EMAIL` drives the
 * owner-identity mismatch path.
 */
const STUB = `
import { createServer } from "node:http";
const OWNER = process.env.STUB_OWNER_EMAIL;
const PW = process.env.STUB_OWNER_PASSWORD;
const RETURNED = process.env.STUB_RETURNED_EMAIL || OWNER;
const COOKIE = process.env.STUB_COOKIE ?? "";
const INVALIDATE = process.env.STUB_INVALIDATE === "1";
let revoked = false;
const srv = createServer((req, res) => {
  let b = "";
  req.on("data", (c) => (b += c));
  req.on("end", () => {
    const j = (o, c = 200, h = {}) => {
      res.writeHead(c, { "content-type": "application/json", ...h });
      res.end(JSON.stringify(o));
    };
    const cookieHdr = req.headers.cookie ?? "";
    const hasValidSession =
      COOKIE !== "" && !revoked && !INVALIDATE &&
      cookieHdr.includes("opsiq_session=" + COOKIE);
    if (req.url.startsWith("/api/auth/login")) {
      let p = {};
      try { p = JSON.parse(b); } catch {}
      if (p.email !== OWNER || p.password !== PW) return j({ error: "Invalid credentials" }, 401);
      revoked = false;
      const expires = new Date(Date.now() + 24 * 60 * 60 * 1000).toUTCString();
      const h = COOKIE === ""
        ? {}
        : { "set-cookie": "opsiq_session=" + COOKIE + "; HttpOnly; Secure; SameSite=Lax; Path=/; Expires=" + expires };
      return j({ user: { id: "u1", email: RETURNED, workspaceId: "w1" } }, 200, h);
    }
    if (req.url.startsWith("/api/auth/logout")) {
      revoked = true;
      return j({ success: true }, 200, { "set-cookie": "opsiq_session=; Max-Age=0; Path=/" });
    }
    // The authenticated-session target is the OWNER_VIEW route the designated
    // owner is actually entitled to — see the s7-i4 probe header for why it is
    // no longer /api/operator (ACTION_VIEW), whose 403 for a scoped owner is
    // intended product behaviour rather than a rejected session.
    if (req.url.startsWith("/api/owner/home"))
      return hasValidSession ? j({ businesses: [], selectedBusinessId: null, hasData: false }) : j({ error: "Unauthorized" }, 401);
    // Owner-visible audit read, used by the cross-workspace scoping check.
    if (req.url.startsWith("/api/owner/trust/audit-trail"))
      return hasValidSession ? j({ entityId: "e", events: [] }) : j({ error: "Unauthorized" }, 401);
    if (req.url.startsWith("/api/health"))
      return j({ status: "healthy", timestamp: "t", checks: { database: { status: "healthy" } } });
    return j({ error: "not found" }, 404);
  });
});
srv.listen(0, "127.0.0.1", () => console.log("PORT=" + srv.address().port));
`;

type StubOptions = {
  cookie?: string;
  invalidate?: boolean;
  returnedEmail?: string;
};

let stub: ReturnType<typeof spawn> | undefined;

async function startStub(opts: StubOptions = {}): Promise<string> {
  stub = spawn("node", ["--input-type=module", "-e", STUB], {
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      STUB_OWNER_EMAIL: SENTINEL_EMAIL,
      STUB_OWNER_PASSWORD: SENTINEL_PASSWORD,
      STUB_COOKIE: opts.cookie ?? SENTINEL_COOKIE,
      STUB_INVALIDATE: opts.invalidate ? "1" : "0",
      STUB_RETURNED_EMAIL: opts.returnedEmail ?? SENTINEL_EMAIL,
    },
  });
  return new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("stub did not start")), 20000);
    stub?.stdout?.on("data", (chunk: Buffer) => {
      const m = /PORT=(\d+)/.exec(chunk.toString());
      if (m) {
        clearTimeout(timer);
        resolve(`http://127.0.0.1:${m[1]}`);
      }
    });
  });
}

/** Everything the probe generates: stdout, stderr and its exit status. */
function runProbe(baseUrl: string): { output: string; exitCode: number } {
  const r = spawnSync("node", [join(REPO_ROOT, S7_I4)], {
    encoding: "utf-8",
    timeout: 60000,
    env: {
      PATH: process.env.PATH ?? "",
      DEPLOYMENT_ID: "dpl_fixture",
      PROBE_BASE_URL: baseUrl,
      PROBE_OWNER_EMAIL: SENTINEL_EMAIL,
      PROBE_OWNER_PASSWORD: SENTINEL_PASSWORD,
      // Cross-workspace rejection fails closed without a foreign-workspace
      // fixture. Supplied here so these redaction cases exercise the full
      // sequence rather than aborting on a missing prerequisite.
      PROBE_FOREIGN_WORKSPACE_ID: "22222222-2222-4222-8222-222222222222",
      PROBE_FOREIGN_ENTITY_ID: "33333333-3333-4333-8333-333333333333",
    },
  });
  return { output: `${r.stdout ?? ""}${r.stderr ?? ""}`, exitCode: r.status ?? -1 };
}

async function probeWith(opts: StubOptions = {}): Promise<{ output: string; exitCode: number }> {
  const baseUrl = await startStub(opts);
  return runProbe(baseUrl);
}

/** The `label: pass` verdict map — what the observation actually asserts. */
function verdicts(output: string): Record<string, boolean> {
  const map: Record<string, boolean> = {};
  for (const line of output.split("\n")) {
    const m = /^\[(PASS|FAIL)\] ([a-z0-9_]+):/.exec(line);
    if (m) map[m[2]] = m[1] === "PASS";
  }
  return map;
}

afterEach(() => {
  stub?.kill();
  stub = undefined;
});

describe("no session-credential material reaches the observation", () => {
  it.each([
    ["successful login", {} as StubOptions],
    ["invalid session cookie", { invalidate: true } as StubOptions],
    ["owner identity mismatch", { returnedEmail: "someone-else@example.invalid" } as StubOptions],
  ])("%s emits no fragment of the session cookie", async (_case, opts) => {
    const { output } = await probeWith(opts);

    // The probe must have actually reached the cookie, or this proves nothing.
    expect(output).toContain("login_session_cookie_set");

    expect(output).not.toContain(SENTINEL_COOKIE);
    expect(output).not.toContain(COOKIE_PREFIX_8);
    expect(output).not.toContain(COOKIE_SUFFIX_10);
    expect(output).not.toContain(COOKIE_SECRET_COMPONENT);
    // The raw Set-Cookie header carries the value too.
    expect(output).not.toContain(`opsiq_session=${SENTINEL_COOKIE}`);
    // Neither of the other two credentials may appear either.
    expect(output).not.toContain(SENTINEL_PASSWORD);
    expect(output).not.toContain(SENTINEL_EMAIL);
  }, 60000);

  it("still reports that a session cookie was obtained", async () => {
    const { output } = await probeWith();
    expect(output).toMatch(/Session cookie obtained \(value withheld from observation\)/);
    expect(output).toMatch(/\[PASS\] login_session_cookie_set: true/);
  }, 60000);

  it("emits no derived form of the credential from its source", () => {
    const src = readFileSync(join(REPO_ROOT, S7_I4), "utf-8");

    // No derived form of the token may be computed at all — a slice, a length,
    // a hash and an encoding are each credential material wherever they go.
    expect(src).not.toMatch(/sessionToken\s*\.\s*(slice|substring|substr|charAt|at)\s*\(/);
    expect(src).not.toMatch(/sessionToken\s*\.\s*length/);
    expect(src).not.toMatch(/createHash\(/);
    expect(src).not.toMatch(/toString\(\s*["']base64/);

    // The token, the raw Set-Cookie header and its parsed list may be *used* —
    // that is how the authenticated requests are made — and an output callsite
    // may state a *fact about* them, because a boolean carries no credential
    // material. What it may never do is emit anything that evaluates to the
    // value. So scan every output callsite, discount the boolean reductions the
    // invariant legitimately reports, and require nothing to be left.
    const CREDENTIAL_SYMBOLS = /\b(sessionToken|rawCookie|setCookies)\b/;
    const OUTPUT_CALLSITE = /\b(console\.(log|error|warn|info)|record|fail)\s*\(/;
    const BOOLEAN_REDUCTIONS: RegExp[] = [
      // !!sessionToken — "a cookie was obtained"
      /!!\s*(?:sessionToken|rawCookie|setCookies)\b/g,
      // /httponly/i.test(rawCookie) — "the cookie is hardened"
      /\/[^/\n]+\/[a-z]*\s*\.\s*test\(\s*(?:sessionToken|rawCookie)\s*\)/g,
      // setCookies.length >= 0 — "a header was present"
      /(?:sessionToken|rawCookie|setCookies)\s*\.\s*length\s*(?:>=|>|<=|<|===|!==)\s*\d+/g,
    ];
    const offenders = src
      .split("\n")
      .map((line, i) => ({ line, n: i + 1 }))
      .filter(({ line }) => OUTPUT_CALLSITE.test(line))
      .map(({ line, n }) => ({
        n,
        residue: BOOLEAN_REDUCTIONS.reduce((acc, re) => acc.replace(re, ""), line),
        line,
      }))
      .filter(({ residue }) => CREDENTIAL_SYMBOLS.test(residue));
    expect(offenders.map(({ n, line }) => `${n}: ${line.trim()}`)).toEqual([]);
  });
});

describe("the session cookie is still acquired and used", () => {
  it("sends the token on the authenticated, logout and revocation requests", async () => {
    const { output, exitCode } = await probeWith();
    // Each of these can only pass if the probe presented the real cookie value.
    expect(output).toMatch(/\[PASS\] owner_route_with_session: 200/);
    expect(output).toMatch(/\[PASS\] logout_http_status: 200/);
    expect(output).toMatch(/\[PASS\] revoked_session_rejected: 401/);
    expect(output).toMatch(/\[PASS\] session_cookie_httponly: true/);
    expect(output).toMatch(/\[PASS\] session_cookie_samesite_set: true/);
    expect(output).toMatch(/\[PASS\] session_cookie_secure: true/);
    expect(exitCode).toBe(0);
  }, 60000);
});

describe("S7-I4 verdicts are unchanged by the redaction", () => {
  /**
   * The verdict maps below are the pre-redaction output of this exact probe,
   * captured against these same stub configurations. Redacting an output line
   * must not move any assertion, and must never turn a failure into a pass.
   */
  it("successful login: every check passes, RESULT PASS", async () => {
    const { output, exitCode } = await probeWith();
    expect(verdicts(output)).toEqual({
      probe_base_url: true,
      owner_entitled_route_under_test: true,
      rejection_http_status: true,
      rejection_does_not_leak_credentials: true,
      wrong_password_http_status: true,
      unauthenticated_request_rejected: true,
      unknown_session_rejected: true,
      login_http_status: true,
      login_response_has_user: true,
      login_response_user_has_email: true,
      login_response_user_matches_configured_owner: true,
      login_session_cookie_set: true,
      session_cookie_httponly: true,
      session_cookie_samesite_set: true,
      session_cookie_secure: true,
      session_cookie_expiry_attribute_present: true,
      session_cookie_expiry_bounded_to_configured_lifetime: true,
      owner_route_with_session: true,
      cross_workspace_fixture_configured: true,
      cross_workspace_status_safe: true,
      cross_workspace_response_excludes_foreign_workspace: true,
      cross_workspace_returns_no_foreign_records: true,
      logout_http_status: true,
      logout_response_success: true,
      logout_clears_session_cookie: true,
      revoked_session_rejected: true,
    });
    expect(output).toMatch(/RESULT: PASS/);
    expect(exitCode).toBe(0);
  }, 60000);

  it("missing session cookie still aborts the sequence and fails", async () => {
    const { output, exitCode } = await probeWith({ cookie: "" });
    const v = verdicts(output);
    expect(v.login_http_status).toBe(true);
    expect(v.login_session_cookie_set).toBe(false);
    expect(v.session_cookie_absent).toBe(false);
    expect(v.auth_sequence_aborted).toBe(false);
    // The dependent tests must be skipped, not silently passed.
    expect(v.protected_route_with_session).toBeUndefined();
    expect(v.revoked_session_rejected).toBeUndefined();
    expect(output).toMatch(/RESULT: FAIL/);
    expect(exitCode).toBe(1);
  }, 60000);

  it("invalid session cookie still fails the authenticated request", async () => {
    const { output, exitCode } = await probeWith({ invalidate: true });
    const v = verdicts(output);
    expect(v.login_session_cookie_set).toBe(true);
    expect(v.owner_route_with_session).toBe(false);
    expect(v.owner_session_not_accepted_on_entitled_route).toBe(false);
    expect(output).toMatch(/RESULT: FAIL/);
    expect(exitCode).toBe(1);
  }, 60000);

  it("owner identity mismatch still fails the binding assertion", async () => {
    const { output, exitCode } = await probeWith({
      returnedEmail: "someone-else@example.invalid",
    });
    const v = verdicts(output);
    expect(v.login_response_user_matches_configured_owner).toBe(false);
    expect(v.login_session_cookie_set).toBe(true);
    expect(output).toMatch(/RESULT: FAIL/);
    expect(exitCode).toBe(1);
  }, 60000);

  it("wrong-password and unauthorized rejections are unaffected", async () => {
    const { output } = await probeWith();
    expect(output).toMatch(/\[PASS\] wrong_password_http_status: 401/);
    expect(output).toMatch(/\[PASS\] rejection_http_status: 401/);
    expect(output).toMatch(/\[PASS\] unauthenticated_request_rejected: 401/);
  }, 60000);
});
