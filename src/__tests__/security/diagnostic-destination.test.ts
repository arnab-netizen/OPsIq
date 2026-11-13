/**
 * Diagnostic-key exfiltration controls (F-DIAGNOSTIC-KEY-EXFIL). Behavioural tests against REAL loopback HTTP servers:
 * the key must reach only an approved origin, only as a header, and never follow a redirect to another host.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type IncomingMessage, type Server } from "node:http";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  APPROVED_DIAGNOSTIC_ORIGINS,
  DIAGNOSTIC_KEY_HEADER,
  DiagnosticDestinationError,
  assertApprovedDiagnosticOrigin,
  createDiagnosticClient,
} from "@/lib/security/diagnostic-destination";

const KEY = "unit-test-diagnostic-key-0123456789";
type Seen = { url: string; headers: IncomingMessage["headers"] };

function listen(handler: (req: IncomingMessage, seen: Seen[], res: import("node:http").ServerResponse) => void): Promise<{ server: Server; origin: string; seen: Seen[] }> {
  const seen: Seen[] = [];
  const server = createServer((req, res) => {
    seen.push({ url: req.url ?? "", headers: req.headers });
    handler(req, seen, res);
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ server, origin: `http://127.0.0.1:${(server.address() as { port: number }).port}`, seen })));
}

describe("assertApprovedDiagnosticOrigin (strict allow-list)", () => {
  it("accepts exactly the approved canonical origins (optionally one trailing slash)", () => {
    for (const o of APPROVED_DIAGNOSTIC_ORIGINS) {
      expect(assertApprovedDiagnosticOrigin(o)).toBe(o);
      expect(assertApprovedDiagnosticOrigin(`${o}/`)).toBe(o);
    }
  });

  it.each([
    ["http scheme", "http://o-ps-iq.vercel.app"],
    ["userinfo trick", "https://o-ps-iq.vercel.app@evil.example"],
    ["userinfo with credentials", "https://user:pw@o-ps-iq.vercel.app"],
    ["look-alike suffix", "https://o-ps-iq.vercel.app.evil.example"],
    ["look-alike prefix", "https://evil-o-ps-iq.vercel.app"],
    ["attacker host with approved name in the query", "https://evil.example/?https://o-ps-iq.vercel.app"],
    ["port", "https://opsiq.solutions:444"],
    ["explicit default port", "https://opsiq.solutions:443"],
    ["path", "https://opsiq.solutions/app"],
    ["query", "https://opsiq.solutions?x=1"],
    ["fragment", "https://opsiq.solutions#x"],
    ["trailing dot host", "https://opsiq.solutions."],
    ["uppercase (not canonical)", "HTTPS://OPSIQ.SOLUTIONS"],
    ["unlisted subdomain", "https://staging.opsiq.solutions"],
    ["unlisted sibling vercel app", "https://o-ps-iq-git-evil.vercel.app"],
    ["backslash confusion", "https://opsiq.solutions\\@evil.example"],
    ["whitespace", "https://opsiq.solutions /"],
    ["control char", "https://opsiq.solutions\u0000"],
    ["punycode look-alike", "https://xn--opsiq-solutions-x.com"],
    ["IP literal", "https://127.0.0.1"],
    ["localhost", "https://localhost"],
    ["empty", ""],
    ["javascript scheme", "javascript:alert(1)"],
  ])("rejects %s", (_label, raw) => {
    expect(() => assertApprovedDiagnosticOrigin(raw)).toThrow(DiagnosticDestinationError);
  });

  it("the production allow-list can never be widened to loopback http by input", () => {
    expect(() => assertApprovedDiagnosticOrigin("http://127.0.0.1:8080")).toThrow(DiagnosticDestinationError);
  });
});

describe("diagnostic client against real loopback servers", () => {
  let approved: Awaited<ReturnType<typeof listen>>;
  let attacker: Awaited<ReturnType<typeof listen>>;

  beforeAll(async () => {
    attacker = await listen((_req, _seen, res) => { res.statusCode = 200; res.end("attacker"); });
    approved = await listen((req, _seen, res) => {
      if (req.url?.startsWith("/redirect-offsite")) { res.statusCode = 302; res.setHeader("Location", `${attacker.origin}/stolen`); res.end(); return; }
      if (req.url?.startsWith("/redirect-self")) { res.statusCode = 301; res.setHeader("Location", "/ok"); res.end(); return; }
      res.statusCode = 200; res.end("ok");
    });
  });
  afterAll(async () => {
    await Promise.all([approved.server, attacker.server].map((s) => new Promise((r) => s.close(() => r(undefined)))));
  });

  const client = () => createDiagnosticClient(approved.origin, KEY, { allowedOrigins: [approved.origin] });

  it("sends the key only as a header to the approved origin and never in the URL", async () => {
    const before = approved.seen.length;
    const res = await client().fetch("/api/internal/build-info");
    expect(res.status).toBe(200);
    const got = approved.seen[before];
    expect(got.headers[DIAGNOSTIC_KEY_HEADER]).toBe(KEY);
    expect(got.url).not.toContain(KEY);
    expect(got.url).not.toMatch(/key=/i);
  });

  it("does NOT follow a redirect to another host: the attacker server receives zero requests and no key", async () => {
    const before = attacker.seen.length;
    const res = await client().fetch("/redirect-offsite");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain(attacker.origin);
    await new Promise((r) => setTimeout(r, 100));
    expect(attacker.seen.length).toBe(before);
    expect(JSON.stringify(attacker.seen)).not.toContain(KEY);
  });

  it("does not follow even a same-origin redirect (3xx is returned to the caller as a non-success)", async () => {
    const before = approved.seen.length;
    const res = await client().fetch("/redirect-self");
    expect(res.status).toBe(301);
    expect(approved.seen.length).toBe(before + 1);
  });

  it("rejects an unapproved destination BEFORE any connection is made", async () => {
    const before = attacker.seen.length;
    expect(() => createDiagnosticClient(attacker.origin, KEY, { allowedOrigins: [approved.origin] })).toThrow(DiagnosticDestinationError);
    expect(() => createDiagnosticClient(attacker.origin, KEY)).toThrow(DiagnosticDestinationError);
    await new Promise((r) => setTimeout(r, 50));
    expect(attacker.seen.length).toBe(before);
  });

  it.each([
    ["protocol-relative host swap", () => `//${new URL(attacker.origin).host}/x`],
    ["userinfo in path", () => "/@evil.example/x"],
    ["absolute URL", () => `${attacker.origin}/x`],
    ["backslash", () => "/\\evil.example"],
    ["no leading slash", () => "api/internal/x"],
    ["key in the query string", () => "/api/internal/x?key=abc"],
    ["key in a later query parameter", () => "/api/internal/x?a=1&key=abc"],
    ["whitespace", () => "/x y"],
  ])("rejects a path that could leave the origin or carry the key in the URL: %s", async (_l, mk) => {
    const before = [approved.seen.length, attacker.seen.length];
    await expect(client().fetch(mk())).rejects.toBeInstanceOf(DiagnosticDestinationError);
    expect([approved.seen.length, attacker.seen.length]).toEqual(before);
  });

  it("a caller-supplied key header cannot override or duplicate the bound key", async () => {
    const before = approved.seen.length;
    await client().fetch("/api/x", { headers: { [DIAGNOSTIC_KEY_HEADER.toUpperCase()]: "attacker-supplied", "x-other": "1" } });
    expect(approved.seen[before].headers[DIAGNOSTIC_KEY_HEADER]).toBe(KEY);
    expect(approved.seen[before].headers["x-other"]).toBe("1");
  });

  it("errors never contain the key", async () => {
    for (const p of ["//evil.example", "/x?key=abc"]) {
      try { await client().fetch(p); } catch (e) { expect(String((e as Error).message)).not.toContain(KEY); }
    }
  });

  it("an injected fetch is always called with redirect: 'manual'", async () => {
    let init: RequestInit | undefined;
    const c = createDiagnosticClient(approved.origin, KEY, { allowedOrigins: [approved.origin], fetchImpl: (async (_u: unknown, i?: RequestInit) => { init = i; return new Response("x"); }) as typeof fetch });
    await c.fetch("/a", { redirect: "follow" } as RequestInit);
    expect(init?.redirect).toBe("manual");
  });
});

describe("the smoke scripts and workflows use only the hardened client", () => {
  const root = join(__dirname, "..", "..", "..");
  for (const n of ["dashboard", "diagnosis-dashboard", "signup-dashboard"]) {
    const src = readFileSync(join(root, "scripts", `smoke-production-${n}.ts`), "utf8");
    it(`smoke-production-${n}.ts has no raw fetch, no key in a URL, and imports the destination guard`, () => {
      expect(src).toContain('from "../src/lib/security/diagnostic-destination"');
      expect(src).toContain("createDiagnosticClient(");
      expect(src.replace(/safeFetch|__client\.fetch/g, "")).not.toMatch(/[^.\w]fetch\(/);
      expect(src).not.toMatch(/[?&]key=/);
      expect(src).not.toMatch(/console\.\w+\(`[^`]*\$\{(OPSIQ_DIAGNOSTIC_KEY|diagnosticKey)\}/);
    });
  }
});
