import { describe, it, expect, vi, afterEach } from "vitest";
import { resolveQboConfig, type QboProviderConfig } from "@/domain/quickbooks/qbo-config";
import { QboProviderError } from "@/domain/quickbooks/qbo-errors";
import {
  buildQboAuthorizationUrl,
  createQboAuthorizationRequest,
  exchangeQboAuthorizationCode,
  hashQboOAuthState,
  refreshQboTokens,
  revokeQboToken,
  toOAuthToken,
} from "@/services/quickbooks/qbo-oauth.service";
import { encryptOAuthToken, decryptOAuthToken } from "@/services/external-systems/oauth-token.service";

const SECRET = "client-secret-DO-NOT-LEAK-0123";
const ACCESS = "access.token.value.SENSITIVE-aaa";
const REFRESH = "refresh.token.value.SENSITIVE-bbb";
const CODE = "AB11-authorization-code-SENSITIVE";

function config(over: Record<string, string> = {}): QboProviderConfig {
  const r = resolveQboConfig({
    QUICKBOOKS_CLIENT_ID: "client-id-123",
    QUICKBOOKS_CLIENT_SECRET: SECRET,
    QUICKBOOKS_REDIRECT_URI: "https://app.opsiq.example/qbo/callback",
    QUICKBOOKS_ENVIRONMENT: "sandbox",
    ...over,
  });
  if (!r.available) throw new Error("test config invalid");
  return r.config;
}

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string;
}
function fakeFetch(respond: (call: Call) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const impl = async (url: string, init?: RequestInit) => {
    const call: Call = {
      url,
      method: String(init?.method),
      headers: Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>)),
      body: String(init?.body ?? ""),
    };
    calls.push(call);
    return respond(call);
  };
  return { impl, calls };
}
const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
const tokenBody = (over: Record<string, unknown> = {}) => ({
  access_token: ACCESS,
  refresh_token: REFRESH,
  token_type: "bearer",
  expires_in: 3600,
  x_refresh_token_expires_in: 8726400,
  ...over,
});

afterEach(() => vi.restoreAllMocks());

describe("authorization request", () => {
  it("builds the exact Intuit URL: client id, code flow, accounting scope, exact redirect URI, state", () => {
    const state = "a".repeat(64);
    const url = new URL(buildQboAuthorizationUrl(config(), state));
    expect(`${url.origin}${url.pathname}`).toBe("https://appcenter.intuit.com/connect/oauth2");
    expect(url.searchParams.get("client_id")).toBe("client-id-123");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("scope")).toBe("com.intuit.quickbooks.accounting");
    expect(url.searchParams.get("redirect_uri")).toBe("https://app.opsiq.example/qbo/callback");
    expect(url.searchParams.get("state")).toBe(state);
    expect([...url.searchParams.keys()].sort()).toEqual(["client_id", "redirect_uri", "response_type", "scope", "state"]);
  });

  it("sends no PKCE parameters and no secret", () => {
    const url = buildQboAuthorizationUrl(config(), "b".repeat(64));
    expect(url).not.toMatch(/code_challenge|code_verifier/);
    expect(url).not.toContain(SECRET);
    expect(url).not.toContain(Buffer.from(`client-id-123:${SECRET}`).toString("base64"));
  });

  it("host and scope cannot be influenced by the caller: the builder takes only config + state", () => {
    expect(buildQboAuthorizationUrl.length).toBe(2);
    expect(buildQboAuthorizationUrl(config({ QUICKBOOKS_ENVIRONMENT: "production" }), "c".repeat(40))).toMatch(/^https:\/\/appcenter\.intuit\.com\/connect\/oauth2\?/);
  });

  it("refuses malformed or injection-shaped state before it reaches a URL", () => {
    for (const bad of ["", "short", "has space ".repeat(8), "a".repeat(31), "a".repeat(257), `${"a".repeat(40)}&redirect_uri=https://evil.example`, `${"a".repeat(40)}\n`]) {
      expect(() => buildQboAuthorizationUrl(config(), bad)).toThrow(QboProviderError);
    }
  });

  it("createQboAuthorizationRequest uses shared random state: unique, hashed for storage, 10-minute expiry, state preserved exactly", () => {
    const now = () => new Date("2026-10-07T12:00:00Z");
    const a = createQboAuthorizationRequest(config(), { now });
    const b = createQboAuthorizationRequest(config(), { now });
    expect(a.state).not.toBe(b.state);
    expect(a.state).toMatch(/^[0-9a-f]{64}$/);
    expect(new URL(a.authorizationUrl).searchParams.get("state")).toBe(a.state);
    expect(a.stateHash).toBe(hashQboOAuthState(a.state));
    expect(a.stateHash).toMatch(/^[0-9a-f]{64}$/);
    expect(a.stateHash).not.toBe(a.state);
    expect(a.stateExpiresAt.toISOString()).toBe("2026-10-07T12:10:00.000Z");
    expect(Object.keys(a).sort()).toEqual(["authorizationUrl", "state", "stateExpiresAt", "stateHash"]);
  });
});

describe("authorization code exchange", () => {
  it("posts form-encoded grant to the Intuit token endpoint with Basic client auth and the exact redirect URI", async () => {
    const f = fakeFetch(() => json(200, tokenBody(), { intuit_tid: "tid-ex-1" }));
    const now = new Date("2026-10-07T12:00:00Z");
    const grant = await exchangeQboAuthorizationCode(config(), CODE, { fetchImpl: f.impl, now: () => now });
    expect(f.calls).toHaveLength(1);
    const c = f.calls[0];
    expect(c.url).toBe("https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer");
    expect(c.method).toBe("POST");
    expect(c.headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
    expect(c.headers.Authorization).toBe(`Basic ${Buffer.from(`client-id-123:${SECRET}`).toString("base64")}`);
    const body = new URLSearchParams(c.body);
    expect(Object.fromEntries(body)).toEqual({ grant_type: "authorization_code", code: CODE, redirect_uri: "https://app.opsiq.example/qbo/callback" });
    expect(c.body).not.toContain(SECRET);
    expect(grant.accessToken).toBe(ACCESS);
    expect(grant.refreshToken).toBe(REFRESH);
    expect(grant.tokenType).toBe("Bearer");
    expect(grant.intuitTid).toBe("tid-ex-1");
    expect(grant.issuedAt).toEqual(now);
  });

  it("derives expiries from the provider's response, not from assumptions", async () => {
    const f = fakeFetch(() => json(200, tokenBody({ expires_in: 1800, x_refresh_token_expires_in: 100000, x_refresh_token_hard_expires_in: 5000000 })));
    const now = new Date("2026-10-07T12:00:00Z");
    const g = await exchangeQboAuthorizationCode(config(), CODE, { fetchImpl: f.impl, now: () => now });
    expect(g.accessTokenExpiresAt.getTime() - now.getTime()).toBe(1800 * 1000);
    expect(g.refreshTokenExpiresAt.getTime() - now.getTime()).toBe(100000 * 1000);
    expect(g.refreshTokenHardExpiresAt!.getTime() - now.getTime()).toBe(5000000 * 1000);
    const noHard = await exchangeQboAuthorizationCode(config(), CODE, { fetchImpl: fakeFetch(() => json(200, tokenBody())).impl, now: () => now });
    expect(noHard.refreshTokenHardExpiresAt).toBeNull();
    expect(noHard.accessTokenExpiresAt.getTime() - now.getTime()).toBe(3600 * 1000);
  });

  it.each([
    ["missing access_token", tokenBody({ access_token: undefined })],
    ["empty access_token", tokenBody({ access_token: "" })],
    ["missing refresh_token on initial exchange", tokenBody({ refresh_token: undefined })],
    ["missing expires_in", tokenBody({ expires_in: undefined })],
    ["non-numeric expires_in", tokenBody({ expires_in: "3600" })],
    ["zero expires_in", tokenBody({ expires_in: 0 })],
    ["missing refresh expiry", tokenBody({ x_refresh_token_expires_in: undefined })],
    ["wrong token_type", tokenBody({ token_type: "mac" })],
  ])("rejects a malformed 2xx response: %s", async (_name, body) => {
    const f = fakeFetch(() => json(200, body));
    const err = await exchangeQboAuthorizationCode(config(), CODE, { fetchImpl: f.impl }).catch((e) => e);
    expect(err).toBeInstanceOf(QboProviderError);
    expect(err.kind).toBe("MALFORMED_RESPONSE");
  });

  it("rejects non-JSON, empty and array bodies as malformed", async () => {
    for (const make of [() => new Response("<html>oops</html>", { status: 200 }), () => new Response("", { status: 200 }), () => json(200, [1, 2])]) {
      const err = await exchangeQboAuthorizationCode(config(), CODE, { fetchImpl: fakeFetch(make).impl }).catch((e) => e);
      expect(err.kind).toBe("MALFORMED_RESPONSE");
    }
  });

  it("classifies invalid_grant as AUTHORIZATION_INVALID and never leaks the provider body", async () => {
    const f = fakeFetch(() => json(400, { error: "invalid_grant", error_description: `bad code ${CODE} ${SECRET}` }, { intuit_tid: "tid-bad" }));
    const err = (await exchangeQboAuthorizationCode(config(), CODE, { fetchImpl: f.impl }).catch((e) => e)) as QboProviderError;
    expect(err.kind).toBe("AUTHORIZATION_INVALID");
    expect(err.providerCode).toBe("invalid_grant");
    expect(err.intuitTid).toBe("tid-bad");
    const dump = JSON.stringify({ m: err.message, s: err.stack, k: Object.entries(err) });
    for (const secret of [CODE, SECRET, ACCESS, REFRESH, "error_description"]) expect(dump).not.toContain(secret);
  });

  it("maps 5xx to a retryable transient failure and a stalled endpoint to TIMEOUT", async () => {
    const e5 = await exchangeQboAuthorizationCode(config(), CODE, { fetchImpl: fakeFetch(() => json(503, { error: "x" })).impl }).catch((e) => e);
    expect(e5.kind).toBe("TRANSIENT_PROVIDER_FAILURE");
    expect(e5.retryable).toBe(true);
    const hang = (async (_u: string, init?: RequestInit) =>
      new Promise<Response>((_res, rej) => init?.signal?.addEventListener("abort", () => rej(new Error("aborted"))))) as never;
    const t = await exchangeQboAuthorizationCode(config(), CODE, { fetchImpl: hang, timeoutMs: 20 }).catch((e) => e);
    expect(t.kind).toBe("TIMEOUT");
  });

  it("rejects obviously invalid codes locally without calling Intuit", async () => {
    const f = fakeFetch(() => json(200, tokenBody()));
    for (const bad of ["", "with space", "a".repeat(2049), "line\nbreak"]) {
      const err = await exchangeQboAuthorizationCode(config(), bad, { fetchImpl: f.impl }).catch((e) => e);
      expect(err.kind).toBe("AUTHORIZATION_INVALID");
    }
    expect(f.calls).toHaveLength(0);
  });

  it("never logs token material or the secret", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
    await exchangeQboAuthorizationCode(config(), CODE, { fetchImpl: fakeFetch(() => json(200, tokenBody())).impl });
    await exchangeQboAuthorizationCode(config(), CODE, { fetchImpl: fakeFetch(() => json(400, { error: "invalid_grant" })).impl }).catch(() => {});
    const out = JSON.stringify(spies.flatMap((s) => s.mock.calls));
    for (const secret of [ACCESS, REFRESH, SECRET, CODE]) expect(out).not.toContain(secret);
  });
});

describe("refresh", () => {
  it("posts the refresh grant and returns the ROTATED refresh token with parsed expiries", async () => {
    const f = fakeFetch(() => json(200, tokenBody({ access_token: "new-access-token-1", refresh_token: "ROTATED-refresh-token-2", expires_in: 3599 })));
    const now = new Date("2026-10-07T12:00:00Z");
    const g = await refreshQboTokens(config(), REFRESH, { fetchImpl: f.impl, now: () => now });
    expect(Object.fromEntries(new URLSearchParams(f.calls[0].body))).toEqual({ grant_type: "refresh_token", refresh_token: REFRESH });
    expect(f.calls[0].headers.Authorization).toMatch(/^Basic /);
    expect(g.refreshToken).toBe("ROTATED-refresh-token-2");
    expect(g.refreshToken).not.toBe(REFRESH);
    expect(g.accessToken).toBe("new-access-token-1");
    expect(g.accessTokenExpiresAt.getTime() - now.getTime()).toBe(3599 * 1000);
  });

  it("no assumed 100-day policy: refresh expiry is whatever the provider says", async () => {
    const f = fakeFetch(() => json(200, tokenBody({ x_refresh_token_expires_in: 12345 })));
    const now = new Date("2026-10-07T12:00:00Z");
    const g = await refreshQboTokens(config(), REFRESH, { fetchImpl: f.impl, now: () => now });
    expect(g.refreshTokenExpiresAt.getTime() - now.getTime()).toBe(12345 * 1000);
  });

  it("invalid_grant is REFRESH_INVALID: terminal, owner action, distinct from transient failures", async () => {
    const e = (await refreshQboTokens(config(), REFRESH, { fetchImpl: fakeFetch(() => json(400, { error: "invalid_grant" })).impl }).catch((x) => x)) as QboProviderError;
    expect(e.kind).toBe("REFRESH_INVALID");
    expect(e.retryable).toBe(false);
    expect(e.requiresOwnerAction).toBe(true);
    const t = (await refreshQboTokens(config(), REFRESH, { fetchImpl: fakeFetch(() => json(502, {})).impl }).catch((x) => x)) as QboProviderError;
    expect(t.kind).toBe("TRANSIENT_PROVIDER_FAILURE");
    expect(t.retryable).toBe(true);
    expect(t.requiresOwnerAction).toBe(false);
  });

  it("handles a rate-limited refresh with Retry-After guidance", async () => {
    const e = (await refreshQboTokens(config(), REFRESH, { fetchImpl: fakeFetch(() => json(429, {}, { "retry-after": "30" })).impl }).catch((x) => x)) as QboProviderError;
    expect(e.kind).toBe("RATE_LIMITED");
    expect(e.retryAfterMs).toBe(30_000);
  });

  it("times out, can be aborted, and does not retry on its own (the caller owns persistence)", async () => {
    const f = fakeFetch(() => json(503, {}));
    await refreshQboTokens(config(), REFRESH, { fetchImpl: f.impl }).catch(() => {});
    expect(f.calls).toHaveLength(1);
    const hang = (async (_u: string, init?: RequestInit) =>
      new Promise<Response>((_r, rej) => init?.signal?.addEventListener("abort", () => rej(new Error("aborted"))))) as never;
    const timed = await refreshQboTokens(config(), REFRESH, { fetchImpl: hang, timeoutMs: 15 }).catch((x) => x);
    expect(timed.kind).toBe("TIMEOUT");
    const ac = new AbortController();
    const p = refreshQboTokens(config(), REFRESH, { fetchImpl: hang, timeoutMs: 5000, signal: ac.signal }).catch((x) => x);
    ac.abort();
    expect((await p).kind).toBe("CANCELLED");
  });

  it("does not leak tokens in logs or error text", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
    const e = await refreshQboTokens(config(), REFRESH, { fetchImpl: fakeFetch(() => json(400, { error: "invalid_grant", error_description: REFRESH })).impl }).catch((x) => x);
    const out = JSON.stringify([e.message, e.stack, ...spies.flatMap((s) => s.mock.calls)]);
    expect(out).not.toContain(REFRESH);
    expect(out).not.toContain(SECRET);
  });

  it("rejects an obviously invalid refresh token locally", async () => {
    const f = fakeFetch(() => json(200, tokenBody()));
    const e = await refreshQboTokens(config(), "has space", { fetchImpl: f.impl }).catch((x) => x);
    expect(e.kind).toBe("REFRESH_INVALID");
    expect(f.calls).toHaveLength(0);
  });
});

describe("revocation", () => {
  it("posts a JSON {token} body with Basic auth to the revoke endpoint and reports REVOKED on 2xx", async () => {
    const f = fakeFetch(() => new Response("", { status: 200, headers: { intuit_tid: "tid-rv" } }));
    const r = await revokeQboToken(config(), REFRESH, { fetchImpl: f.impl });
    expect(r).toEqual({ outcome: "REVOKED", intuitTid: "tid-rv" });
    const c = f.calls[0];
    expect(c.url).toBe("https://developer.api.intuit.com/v2/oauth2/tokens/revoke");
    expect(c.method).toBe("POST");
    expect(c.headers["Content-Type"]).toBe("application/json");
    expect(c.headers.Authorization).toMatch(/^Basic /);
    expect(JSON.parse(c.body)).toEqual({ token: REFRESH });
  });

  it("a provider rejection is a typed error, not success, and carries no token", async () => {
    const e = (await revokeQboToken(config(), REFRESH, { fetchImpl: fakeFetch(() => json(400, { error: "invalid_token", detail: REFRESH })).impl }).catch((x) => x)) as QboProviderError;
    expect(e.kind).toBe("REFRESH_INVALID");
    expect(JSON.stringify([e.message, e.stack])).not.toContain(REFRESH);
    const t = (await revokeQboToken(config(), REFRESH, { fetchImpl: fakeFetch(() => json(500, {})).impl }).catch((x) => x)) as QboProviderError;
    expect(t.kind).toBe("TRANSIENT_PROVIDER_FAILURE");
  });

  it("never logs the token", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
    await revokeQboToken(config(), REFRESH, { fetchImpl: fakeFetch(() => new Response("", { status: 200 })).impl });
    await revokeQboToken(config(), REFRESH, { fetchImpl: fakeFetch(() => json(400, {})).impl }).catch(() => {});
    expect(JSON.stringify(spies.flatMap((s) => s.mock.calls))).not.toContain(REFRESH);
  });
});

describe("generic OAuth crypto is reused", () => {
  it("a grant maps onto the generic OAuthToken and round-trips through the shared AES-256-GCM/HKDF encryption", async () => {
    const prev = process.env.OAUTH_TOKEN_ENCRYPTION_KEY;
    process.env.OAUTH_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
    try {
      const f = fakeFetch(() => json(200, tokenBody()));
      const grant = await exchangeQboAuthorizationCode(config(), CODE, { fetchImpl: f.impl });
      const generic = toOAuthToken(grant);
      expect(generic).toEqual({ accessToken: ACCESS, refreshToken: REFRESH, expiresAt: grant.accessTokenExpiresAt, tokenType: "Bearer" });
      const enc = encryptOAuthToken(generic, "ws-1");
      expect(enc.accessToken).toMatch(/^v1gcm\./);
      expect(enc.accessToken).not.toContain(ACCESS);
      expect(decryptOAuthToken(enc, "ws-1").refreshToken).toBe(REFRESH);
      expect(() => decryptOAuthToken(enc, "ws-2")).toThrow();
    } finally {
      if (prev === undefined) delete process.env.OAUTH_TOKEN_ENCRYPTION_KEY;
      else process.env.OAUTH_TOKEN_ENCRYPTION_KEY = prev;
    }
  });
});

describe("only configs produced by resolveQboConfig are accepted (no caller-controlled provider host)", () => {
  const forged = (): QboProviderConfig => ({
    ...config(),
    authorizationUrl: "https://evil.example/oauth",
    tokenUrl: "https://evil.example/token",
    revokeUrl: "https://evil.example/revoke",
  });

  it("every entry point refuses a forged config before any request is made", async () => {
    const f = fakeFetch(() => json(200, tokenBody()));
    expect(() => buildQboAuthorizationUrl(forged(), "a".repeat(40))).toThrow(QboProviderError);
    expect(() => createQboAuthorizationRequest(forged())).toThrow(QboProviderError);
    for (const call of [
      () => exchangeQboAuthorizationCode(forged(), CODE, { fetchImpl: f.impl }),
      () => refreshQboTokens(forged(), REFRESH, { fetchImpl: f.impl }),
      () => revokeQboToken(forged(), REFRESH, { fetchImpl: f.impl }),
    ]) {
      const e = await call().catch((x) => x);
      expect(e.kind).toBe("CONFIGURATION_ERROR");
      expect(e.localReason).toBe("UNRESOLVED_CONFIG");
    }
    expect(f.calls).toHaveLength(0);
  });

  it("a plain object copy of a resolved config is also refused", () => {
    expect(() => buildQboAuthorizationUrl({ ...config() }, "a".repeat(40))).toThrow(QboProviderError);
  });
});
