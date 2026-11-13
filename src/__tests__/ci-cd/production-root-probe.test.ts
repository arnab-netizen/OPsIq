/**
 * Authenticated-root probe (scripts/production-root-probe.mjs + .github/workflows/production-root-probe.yml).
 *
 * The probe is a LIVE-production control, so its own behaviour is pinned here against a local fake server (no
 * network, no database, no real credentials): it must pass only when every assertion holds, fail closed on every
 * regression it exists to catch, never print secret material, and always revoke the session it created.
 */
import http from "node:http";
import type { AddressInfo } from "node:net";
import fs from "node:fs";
import path from "node:path";
import YAML from "js-yaml";
import { afterEach, describe, expect, it } from "vitest";

import {
  isAllowedAuthenticatedPath,
  runProbe,
  validateBaseUrl,
} from "../../../scripts/production-root-probe.mjs";

const EMAIL = "probe-identity@example.invalid";
const PASSWORD = "S3cret-Probe-Password-9f2c";
const COOKIE_VALUE = "tok_7d1c0b9a4e5f4a6bb2c3d4e5f6a7b8c9";
const COOKIE_NAME = "opsiq_session";

interface FakeOptions {
  rootAuthed?: (req: http.IncomingMessage) => { status: number; location?: string; body?: string; delayMs?: number };
  loginStatus?: number;
  issueCookie?: boolean;
  cookieFlags?: string;
  meAfterLogout?: number;
  revokeOnLogout?: boolean;
  logoutStatus?: number;
  healthStatus?: number;
  bodyForAnonymous?: string;
  cookieValue?: string;
}

function startFake(opts: FakeOptions = {}) {
  const cv = opts.cookieValue ?? COOKIE_VALUE;
  const state = { sessions: new Set<string>(), logins: 0, logouts: 0, requests: [] as string[] };
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    state.requests.push(`${req.method} ${url.pathname}`);
    const cookie = req.headers.cookie ?? "";
    const hasSession = cookie.includes(`${COOKIE_NAME}=${cv}`) && state.sessions.has(cv);
    const send = (status: number, body = "", headers: Record<string, string> = {}) => {
      res.writeHead(status, headers);
      res.end(body);
    };
    if (url.pathname === "/api/health" || url.pathname === "/api/readiness") {
      return send(opts.healthStatus ?? 200, "{}");
    }
    if (url.pathname === "/api/auth/login" && req.method === "POST") {
      state.logins += 1;
      const status = opts.loginStatus ?? 200;
      if (status !== 200) return send(status, "{}");
      if (opts.issueCookie === false) return send(200, "{}");
      state.sessions.add(cv);
      return send(200, "{}", {
        "set-cookie": `${COOKIE_NAME}=${cv}; ${opts.cookieFlags ?? "HttpOnly; Secure; SameSite=Lax; Path=/"}`,
      });
    }
    if (url.pathname === "/api/auth/logout" && req.method === "POST") {
      state.logouts += 1;
      if (opts.revokeOnLogout !== false) state.sessions.delete(cv);
      return send(opts.logoutStatus ?? 200, "{}");
    }
    if (url.pathname === "/api/me") {
      if (hasSession) return send(200, '{"user":{"id":"u"}}');
      return send(opts.meAfterLogout ?? 401, "{}");
    }
    if (url.pathname === "/") {
      if (!hasSession) return send(200, opts.bodyForAnonymous ?? "<html>OpsIQ landing</html>");
      const r = opts.rootAuthed?.(req) ?? { status: 307, location: "/dashboard" };
      const reply = () => send(r.status, r.body ?? "", r.location ? { location: r.location } : {});
      return r.delayMs ? setTimeout(reply, r.delayMs) : reply();
    }
    return send(404, "");
  });
  return new Promise<{ origin: string; state: typeof state; close: () => Promise<void> }>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        origin: `http://127.0.0.1:${port}`,
        state,
        close: () => new Promise((r) => server.close(() => r())),
      });
    });
  });
}

const ENV = { PROBE_ALLOW_LOOPBACK_HTTP: "1" };

async function run(origin: string, extra: { rootBudgetMs?: number } = {}) {
  const lines: string[] = [];
  const result = await runProbe({
    baseUrl: origin,
    email: EMAIL,
    password: PASSWORD,
    env: ENV,
    print: (l: string) => lines.push(l),
    ...extra,
  });
  return { ...result, lines };
}

describe("production root probe — behaviour", () => {
  let fake: Awaited<ReturnType<typeof startFake>>;
  afterEach(async () => {
    await fake?.close();
  });

  it("passes only when a valid session is redirected to an allowed path, is valid, and is revoked by logout", async () => {
    fake = await startFake();
    const r = await run(fake.origin);
    expect(r.pass).toBe(true);
    const names = r.steps.map((s) => s.step);
    expect(names).toEqual([
      "preflight_health",
      "anonymous_root",
      "login",
      "authenticated_root_1",
      "authenticated_root_2",
      "authenticated_root_3",
      "authenticated_root_latency",
      "session_valid",
      "logout",
      "session_revoked",
      "postflight_health",
    ]);
    // Side-effect minimisation: exactly one login and one logout, and only these endpoints.
    expect(fake.state.logins).toBe(1);
    expect(fake.state.logouts).toBe(1);
    const touched = new Set(fake.state.requests.map((q) => q.split(" ")[1]));
    expect([...touched].sort()).toEqual(["/", "/api/auth/login", "/api/auth/logout", "/api/health", "/api/me", "/api/readiness"]);
  });

  it("accepts the owner destinations the root decision can choose and nothing else", () => {
    expect(isAllowedAuthenticatedPath("/dashboard")).toBe(true);
    expect(isAllowedAuthenticatedPath("/owner/cockpit")).toBe(true);
    expect(isAllowedAuthenticatedPath("/owner/first-run")).toBe(true);
    expect(isAllowedAuthenticatedPath("/")).toBe(false);
    expect(isAllowedAuthenticatedPath("/login")).toBe(false);
    expect(isAllowedAuthenticatedPath("/admin/anything")).toBe(false);
  });

  it("FAILS when a valid session is shown the public landing page instead of being redirected", async () => {
    fake = await startFake({ rootAuthed: () => ({ status: 200, body: "<html>OpsIQ landing</html>" }) });
    const r = await run(fake.origin);
    expect(r.pass).toBe(false);
    expect(r.steps.at(-1)).toMatchObject({ step: "authenticated_root_1", ok: false, status: 200 });
    // the failure path still revokes the session it created
    expect(fake.state.logouts).toBe(1);
  });

  it("FAILS on a redirect to a login/other/cross-origin destination", async () => {
    for (const location of ["/login", "/somewhere-else", "https://evil.example/owner/x"]) {
      fake = await startFake({ rootAuthed: () => ({ status: 307, location }) });
      const r = await run(fake.origin);
      expect(r.pass, location).toBe(false);
      await fake.close();
    }
  });

  it("FAILS on a 5xx from the authenticated root and still revokes the session", async () => {
    fake = await startFake({ rootAuthed: () => ({ status: 500, body: "boom" }) });
    const r = await run(fake.origin);
    expect(r.pass).toBe(false);
    expect(fake.state.logouts).toBe(1);
  });

  it("FAILS when the authenticated root exceeds the latency budget", async () => {
    fake = await startFake({ rootAuthed: () => ({ status: 307, location: "/dashboard", delayMs: 400 }) });
    const r = await run(fake.origin, { rootBudgetMs: 150 });
    expect(r.pass).toBe(false);
    expect(r.steps.at(-1)).toMatchObject({ step: "authenticated_root_1", ok: false });
  });

  it("FAILS when any response carries a database/runtime error signature, without printing the body", async () => {
    fake = await startFake({
      rootAuthed: () => ({ status: 307, location: "/dashboard", body: "PrismaClientKnownRequestError 25P03 terminating connection due to idle-in-transaction timeout" }),
    });
    const r = await run(fake.origin);
    expect(r.pass).toBe(false);
    expect(r.steps.at(-1)).toMatchObject({ ok: false, runtimeErrorSignature: true });
    expect(r.lines.join("\n")).not.toMatch(/Prisma|25P03|idle-in-transaction/);
  });

  it("FAILS when logout does not revoke the session (old cookie still redirects / /api/me still 200)", async () => {
    fake = await startFake({ revokeOnLogout: false });
    const r = await run(fake.origin);
    expect(r.pass).toBe(false);
    expect(r.steps.at(-1)).toMatchObject({ step: "session_revoked", ok: false });
  });

  it("FAILS closed when the login is refused (e.g. rate-limited) and does not retry", async () => {
    fake = await startFake({ loginStatus: 429 });
    const r = await run(fake.origin);
    expect(r.pass).toBe(false);
    expect(fake.state.logins).toBe(1);
  });

  it("FAILS when the session cookie lacks HttpOnly", async () => {
    fake = await startFake({ cookieFlags: "Secure; SameSite=Lax; Path=/" });
    const r = await run(fake.origin);
    expect(r.pass).toBe(false);
    expect(fake.state.logouts).toBe(1);
  });

  it("FAILS fast without logging in when health/readiness is not 200", async () => {
    fake = await startFake({ healthStatus: 503 });
    const r = await run(fake.origin);
    expect(r.pass).toBe(false);
    expect(fake.state.logins).toBe(0);
  });

  it("NEVER prints the cookie value, the password, the identity, a query string or any response body", async () => {
    fake = await startFake({ rootAuthed: () => ({ status: 307, location: "/owner/home?businessId=11111111-2222-3333-4444-555555555555" }), bodyForAnonymous: "<html>SECRET-BODY-MARKER</html>" });
    const r = await run(fake.origin);
    expect(r.pass).toBe(true);
    const out = r.lines.join("\n");
    expect(out).not.toContain(COOKIE_VALUE);
    expect(out).not.toContain(PASSWORD);
    expect(out).not.toContain(EMAIL);
    expect(out).not.toContain("businessId");
    expect(out).not.toContain("11111111-2222");
    expect(out).not.toContain("SECRET-BODY-MARKER");
    expect(out).toContain('"destination":"/owner/*"');
  });

  it("refuses to print a line that would contain a secret (defence in depth)", async () => {
    fake = await startFake();
    // An identity that collides with a printed token proves emit() blocks instead of leaking.
    await expect(
      runProbe({ baseUrl: fake.origin, email: "health", password: PASSWORD, env: ENV, print: () => undefined }),
    ).rejects.toThrow(/refusing to print/);
  });

  it("refuses to print a line that would contain the session cookie value, and still revokes the session", async () => {
    // A cookie value that collides with a printed token ("dashboard") proves emit() blocks instead of leaking.
    fake = await startFake({ cookieValue: "dashboard" });
    await expect(
      runProbe({ baseUrl: fake.origin, email: EMAIL, password: PASSWORD, env: ENV, print: () => undefined }),
    ).rejects.toThrow(/session cookie/);
    expect(fake.state.logouts).toBe(1);
  });

  it("requires https for any non-loopback host and rejects malformed URLs", () => {
    expect(validateBaseUrl("https://o-ps-iq.vercel.app", {})).toBe("https://o-ps-iq.vercel.app");
    expect(() => validateBaseUrl("http://o-ps-iq.vercel.app", {})).toThrow(/https/);
    expect(() => validateBaseUrl("http://127.0.0.1:3000", {})).toThrow(/https/);
    expect(() => validateBaseUrl("http://o-ps-iq.vercel.app", { PROBE_ALLOW_LOOPBACK_HTTP: "1" })).toThrow(/https/);
    expect(validateBaseUrl("http://127.0.0.1:3000", { PROBE_ALLOW_LOOPBACK_HTTP: "1" })).toBe("http://127.0.0.1:3000");
    expect(() => validateBaseUrl("not a url", {})).toThrow(/valid URL/);
  });
});

describe("production root probe — workflow safety", () => {
  const wfPath = path.join(process.cwd(), ".github/workflows/production-root-probe.yml");
  const raw = fs.readFileSync(wfPath, "utf8");
  const wf = YAML.load(raw) as {
    on: Record<string, unknown>;
    permissions: Record<string, string>;
    jobs: Record<string, { environment?: string; if?: string; steps: Array<{ name?: string; uses?: string; run?: string }> }>;
  };

  it("is manual-only with an explicit confirmation phrase (no schedule/push/pull_request trigger)", () => {
    expect(Object.keys(wf.on)).toEqual(["workflow_dispatch"]);
    expect(raw).toContain("RUN ROOT PROBE");
    expect(wf.jobs.probe.if).toContain("RUN ROOT PROBE");
  });

  it("is least-privilege, runs in the production environment, and uploads no artifact", () => {
    expect(wf.permissions).toEqual({ contents: "read" });
    expect(wf.jobs.probe.environment).toBe("production");
    expect(wf.jobs.probe.steps.some((s) => (s.uses ?? "").startsWith("actions/upload-artifact"))).toBe(false);
  });

  it("verifies the exact deployed main commit before touching the app, and checks for secret leakage after", () => {
    const names = wf.jobs.probe.steps.map((s) => s.name ?? "");
    const shaIdx = names.findIndex((n) => n.includes("BLOCKED_STALE_PRODUCTION_TARGET"));
    const runIdx = names.findIndex((n) => n.includes("Run read-only authenticated root probe"));
    const leakIdx = names.findIndex((n) => n.includes("no credential or session material"));
    expect(shaIdx).toBeGreaterThanOrEqual(0);
    expect(runIdx).toBeGreaterThan(shaIdx);
    expect(leakIdx).toBeGreaterThan(runIdx);
  });

  it("never runs the broad acceptance suite, never echoes a secret", () => {
    expect(raw).not.toMatch(/playwright|production-safe-specs/);
    expect(raw).not.toMatch(/echo[^\n]*secrets\./);
    expect(raw).toContain("node scripts/production-root-probe.mjs");
  });
});
