#!/usr/bin/env node
/**
 * Read-only authenticated root-route probe for LIVE Production.
 *
 * Purpose: prove, with the existing authorized acceptance identity, that a VALID session reaching `/`
 *   1. is redirected (never rendered as the public landing page, never a 5xx) to an authenticated destination,
 *   2. within a bounded latency (the authenticated root decision is bounded by design; see
 *      src/services/root-redirect.service.ts),
 *   3. that the session is positively valid (GET /api/me -> 200) and is really revoked by logout
 *      (the same cookie then gets the public landing page and /api/me -> 401/403),
 *   4. with no database/runtime error signature anywhere in what the app returned.
 *
 * Side effects (deliberately minimal): exactly ONE login (one session row + its audit events) and ONE logout
 * (revokes that session). No fixture is created, no business is read or written, no other endpoint is called.
 * `/api/me` returns only the acceptance identity's own profile; its body is never logged.
 *
 * Log hygiene: every line this script prints is a small JSON object of step names, HTTP status codes, timings
 * and a redirect PATH CLASS. It never prints a cookie, the password, an email, a query string or any response
 * body. `emit()` additionally refuses (throws) to print any line containing the cookie value or the password.
 *
 * Exit code: 0 only if every assertion holds; otherwise 1. The session is always revoked in `finally`.
 */
import { performance } from "node:perf_hooks";

export const ROOT_BUDGET_MS = 10_000;
export const ROOT_SAMPLES = 3;
const BODY_SCAN_LIMIT = 200_000;

/** Signatures that must never appear in anything the app returns to an ordinary client. */
export const RUNTIME_ERROR_SIGNATURES = [
  /prisma/i,
  /postgres/i,
  /\b25P03\b/,
  /\b57014\b/,
  /statement timeout/i,
  /idle-in-transaction/i,
  /task timed out/i,
  /connection terminated/i,
  /ECONNRESET|ETIMEDOUT|ECONNREFUSED/,
  /FUNCTION_INVOCATION_TIMEOUT/,
  /internal server error/i,
];

/** Authenticated destinations the root decision is allowed to choose (see resolveAuthenticatedRootDecision). */
export function isAllowedAuthenticatedPath(pathname) {
  return pathname === "/dashboard" || pathname.startsWith("/owner/");
}

function pathClass(pathname) {
  if (pathname === "/dashboard") return "/dashboard";
  if (pathname.startsWith("/owner/")) return "/owner/*";
  return "other";
}

function isLoopbackHost(hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]";
}

export function validateBaseUrl(raw, env = process.env) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("BASE_URL is not a valid URL");
  }
  const loopbackHttpAllowed = env.PROBE_ALLOW_LOOPBACK_HTTP === "1" && isLoopbackHost(url.hostname);
  if (url.protocol !== "https:" && !loopbackHttpAllowed) {
    throw new Error("BASE_URL must be https:// (plain http is only permitted for a loopback test server)");
  }
  return url.origin;
}

/**
 * @param {{
 *   baseUrl: string, email: string, password: string,
 *   rootBudgetMs?: number, samples?: number,
 *   fetchImpl?: typeof fetch, now?: () => number,
 *   print?: (line: string) => void, env?: Record<string, string | undefined>,
 * }} opts
 * @returns {Promise<{ pass: boolean, steps: Array<Record<string, unknown>> }>}
 */
export async function runProbe(opts) {
  const {
    email,
    password,
    rootBudgetMs = ROOT_BUDGET_MS,
    samples = ROOT_SAMPLES,
    fetchImpl = fetch,
    now = () => performance.now(),
    print = (line) => console.log(line),
    env = process.env,
  } = opts;
  if (!email || !password) throw new Error("acceptance identity credentials are required");
  const origin = validateBaseUrl(opts.baseUrl, env);

  let cookieHeader = null; // "name=value" -- memory only, never printed
  let loggedIn = false;
  let loggedOut = false;
  const steps = [];

  /** Single choke point for output: refuses any line that contains a secret. */
  const emit = (obj) => {
    const line = JSON.stringify(obj);
    if (password && line.includes(password)) throw new Error("refusing to print: output contains the password");
    if (email && line.includes(email)) throw new Error("refusing to print: output contains the account identifier");
    if (cookieHeader) {
      const value = cookieHeader.slice(cookieHeader.indexOf("=") + 1);
      if (value && line.includes(value)) throw new Error("refusing to print: output contains the session cookie");
    }
    print(line);
  };

  const record = (step, ok, extra = {}) => {
    const entry = { step, ok, ...extra };
    steps.push(entry);
    emit(entry);
    return ok;
  };

  async function call(path, { method = "GET", cookie = null, json = null } = {}) {
    const headers = { accept: "application/json, text/html;q=0.9", "user-agent": "opsiq-root-probe/1" };
    if (cookie) headers.cookie = cookie;
    let body;
    if (json) {
      headers["content-type"] = "application/json";
      body = JSON.stringify(json);
    }
    const started = now();
    let res;
    try {
      res = await fetchImpl(`${origin}${path}`, {
        method,
        headers,
        body,
        redirect: "manual",
        signal: AbortSignal.timeout(rootBudgetMs + 5_000),
      });
    } catch (error) {
      return { status: 0, ms: Math.round(now() - started), error: error?.name === "TimeoutError" ? "timeout" : "network" };
    }
    const ms = Math.round(now() - started);
    let text = "";
    try {
      text = (await res.text()).slice(0, BODY_SCAN_LIMIT);
    } catch {
      text = "";
    }
    const headerBlob = [...res.headers.entries()]
      .filter(([k]) => !/^set-cookie$/i.test(k))
      .map(([k, v]) => `${k}: ${v}`)
      .join("\n");
    const signature = RUNTIME_ERROR_SIGNATURES.find((re) => re.test(text) || re.test(headerBlob));
    return {
      status: res.status,
      ms,
      location: res.headers.get("location"),
      setCookies: typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [],
      hasRuntimeErrorSignature: Boolean(signature),
    };
  }

  const within = (r) => r.status !== 0 && r.ms <= rootBudgetMs;

  try {
    // 0. health / readiness before (status only)
    const health = await call("/api/health");
    const ready = await call("/api/readiness");
    record("preflight_health", health.status === 200 && ready.status === 200, { health: health.status, readiness: ready.status });
    if (health.status !== 200 || ready.status !== 200) return { pass: false, steps };

    // 1. anonymous control: public landing page, no redirect
    const anon = await call("/");
    record("anonymous_root", anon.status === 200 && within(anon) && !anon.hasRuntimeErrorSignature, {
      status: anon.status,
      ms: anon.ms,
      runtimeErrorSignature: anon.hasRuntimeErrorSignature,
    });

    // 2. exactly one login
    const login = await call("/api/auth/login", { method: "POST", json: { email, password } });
    const session = login.setCookies.find((c) => /^[^=;]*session[^=;]*=/i.test(c));
    if (session) {
      cookieHeader = session.split(";")[0];
      loggedIn = true;
    }
    const attrs = session ? session.toLowerCase() : "";
    record("login", login.status === 200 && Boolean(session) && !login.hasRuntimeErrorSignature, {
      status: login.status,
      ms: login.ms,
      sessionCookieIssued: Boolean(session),
      httpOnly: attrs.includes("httponly"),
      secure: attrs.includes("secure"),
      sameSite: /samesite=(lax|strict)/.test(attrs),
    });
    if (!session || login.status !== 200) return { pass: false, steps };
    if (!attrs.includes("httponly") || (origin.startsWith("https:") && !attrs.includes("secure"))) {
      record("session_cookie_flags", false, { httpOnly: attrs.includes("httponly"), secure: attrs.includes("secure") });
      return { pass: false, steps };
    }

    // 3. valid-session root: redirect to an allowed authenticated path, bounded latency, no error signature
    const rootTimes = [];
    for (let i = 0; i < samples; i += 1) {
      const r = await call("/", { cookie: cookieHeader });
      let cls = "none";
      let originOk = false;
      if (r.location) {
        try {
          const target = new URL(r.location, origin);
          originOk = target.origin === origin;
          cls = originOk ? pathClass(target.pathname) : "cross-origin";
        } catch {
          cls = "unparseable";
        }
      }
      const redirected = [301, 302, 303, 307, 308].includes(r.status);
      const allowed = redirected && originOk && cls !== "other" && cls !== "none";
      rootTimes.push(r.ms);
      const ok = allowed && within(r) && !r.hasRuntimeErrorSignature;
      record(`authenticated_root_${i + 1}`, ok, {
        status: r.status,
        ms: r.ms,
        destination: cls,
        runtimeErrorSignature: r.hasRuntimeErrorSignature,
      });
      if (!ok) return { pass: false, steps };
    }
    record("authenticated_root_latency", true, { maxMs: Math.max(...rootTimes), budgetMs: rootBudgetMs, samples: rootTimes.length });

    // 4. session positively valid
    const me = await call("/api/me", { cookie: cookieHeader });
    const meOk = me.status === 200 && !me.hasRuntimeErrorSignature;
    record("session_valid", meOk, { status: me.status, ms: me.ms });
    if (!meOk) return { pass: false, steps };

    // 5. logout revokes the session
    const out = await call("/api/auth/logout", { method: "POST", cookie: cookieHeader });
    loggedOut = out.status >= 200 && out.status < 300;
    record("logout", loggedOut, { status: out.status });
    if (!loggedOut) return { pass: false, steps };

    // 6. revoked session: root is the public landing again (no redirect), session endpoint refuses
    const afterRoot = await call("/", { cookie: cookieHeader });
    const afterMe = await call("/api/me", { cookie: cookieHeader });
    const revoked = afterRoot.status === 200 && (afterMe.status === 401 || afterMe.status === 403);
    record("session_revoked", revoked && !afterRoot.hasRuntimeErrorSignature, {
      rootStatus: afterRoot.status,
      meStatus: afterMe.status,
    });
    if (!revoked) return { pass: false, steps };

    // 7. health after
    const health2 = await call("/api/health");
    record("postflight_health", health2.status === 200, { health: health2.status });
    return { pass: health2.status === 200, steps };
  } finally {
    // Never leave a live session behind, whatever happened above.
    if (loggedIn && !loggedOut && cookieHeader) {
      try {
        const out = await call("/api/auth/logout", { method: "POST", cookie: cookieHeader });
        emit({ step: "cleanup_logout", ok: out.status >= 200 && out.status < 300, status: out.status });
      } catch {
        emit({ step: "cleanup_logout", ok: false });
      }
    }
  }
}

async function main() {
  const baseUrl = process.env.BASE_URL;
  const email = process.env.PRODUCTION_ACCEPTANCE_EMAIL;
  const password = process.env.PRODUCTION_ACCEPTANCE_PASSWORD;
  if (!baseUrl || !email || !password) {
    console.error("Refusing to run: BASE_URL, PRODUCTION_ACCEPTANCE_EMAIL and PRODUCTION_ACCEPTANCE_PASSWORD are required.");
    process.exit(2);
  }
  try {
    const result = await runProbe({ baseUrl, email, password });
    console.log(JSON.stringify({ step: "result", pass: result.pass }));
    process.exit(result.pass ? 0 : 1);
  } catch (error) {
    // Error text can echo inputs from a thrown library error; print only the class.
    console.error(JSON.stringify({ step: "fatal", error: error?.name ?? "Error" }));
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
