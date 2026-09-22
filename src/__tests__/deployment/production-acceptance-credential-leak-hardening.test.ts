/**
 * Regression coverage for the run #32509563234 credential-leak incident.
 *
 * Root cause: browser.newContext() inherits use.trace/use.screenshot as
 * context-creation-time defaults regardless of whether the context is
 * created via Playwright's built-in fixtures or manually (as this suite
 * does, to share one authenticated context/page across a serial journey).
 * That meant Playwright's own automatic recording started before
 * authenticateProductionOwner() ever ran, capturing the login POST body
 * (including the plaintext password) in a trace on the 401 rejection.
 *
 * These tests prove, per-property, that the fix holds:
 *  (a) a login 401 is classified immediately, without waiting out an
 *      unrelated navigation timeout
 *  (b) the thrown error never contains the supplied email/password values
 *  (c) evidence teardown never throws when setup failed before evidence
 *      collection started (or before a context even existed)
 *  (d) automatic Playwright trace/screenshot capture is disabled at the
 *      config level, so no credential-bearing page state can ever be
 *      captured before this suite's own explicit evidence collection begins
 *  (e) the downstream existing-business suite classifies itself
 *      BLOCKED_UPSTREAM (not an unrelated crash) when the upstream
 *      handoff fixture is missing or unsuccessful
 *  (f) the sanitized evidence collector never records header/cookie values
 *      into uploaded evidence, and no raw Playwright trace mechanism exists
 *      anywhere in evidence.ts (run #32528037515: an authenticated raw
 *      trace inherently recorded the live session Cookie header)
 *  (g) explicit evidence collection is started only after login succeeds,
 *      in both spec files, so the login request itself is never captured
 */
import { readFileSync, rmSync } from "fs";
import { join } from "path";
import type { BrowserContext, Page, TestInfo } from "@playwright/test";
import {
  captureOnFailure,
  checkpointScreenshot,
  finalizeEvidence,
  recordApiCall,
  startEvidenceCollection,
  timedApiCall,
} from "../../../tests/production/helpers/evidence";
import { authenticateProductionOwner } from "../../../tests/production/helpers/production-auth";

const CONFIG_SRC = readFileSync(join(process.cwd(), "playwright.production.config.ts"), "utf-8");
const STARTUP_SPEC_SRC = readFileSync(
  join(process.cwd(), "tests/production/10-startup-mode-acceptance.spec.ts"),
  "utf-8"
);
const EXISTING_BUSINESS_SPEC_SRC = readFileSync(
  join(process.cwd(), "tests/production/20-existing-business-acceptance.spec.ts"),
  "utf-8"
);

// ---------------------------------------------------------------------------
// (d) Automatic Playwright capture is off at the config level
// ---------------------------------------------------------------------------
describe("(d) playwright.production.config.ts — automatic trace/screenshot capture is disabled", () => {
  it("trace is 'off', not 'retain-on-failure' or any other value that records before login", () => {
    expect(CONFIG_SRC).toMatch(/trace:\s*'off'/);
  });

  it("screenshot is 'off', not 'only-on-failure' or any other automatic value", () => {
    expect(CONFIG_SRC).toMatch(/screenshot:\s*'off'/);
  });
});

// ---------------------------------------------------------------------------
// (g) startEvidenceCollection() is called only after authenticateProductionOwner()
//     resolves, in both spec files that create their own context
// ---------------------------------------------------------------------------
describe("(g) explicit evidence collection starts only after login succeeds", () => {
  it("10-startup-mode-acceptance.spec.ts: authenticateProductionOwner() precedes startEvidenceCollection() in beforeAll", () => {
    const authIdx = STARTUP_SPEC_SRC.indexOf("await authenticateProductionOwner(page)");
    const collectIdx = STARTUP_SPEC_SRC.indexOf("await startEvidenceCollection(context, page, SPEC_NAME)");
    expect(authIdx).toBeGreaterThan(-1);
    expect(collectIdx).toBeGreaterThan(-1);
    expect(collectIdx).toBeGreaterThan(authIdx);
  });

  it("20-existing-business-acceptance.spec.ts: authenticateProductionOwner() precedes startEvidenceCollection() in beforeAll", () => {
    const authIdx = EXISTING_BUSINESS_SPEC_SRC.indexOf("await authenticateProductionOwner(page)");
    const collectIdx = EXISTING_BUSINESS_SPEC_SRC.indexOf("await startEvidenceCollection(context, page, SPEC_NAME)");
    expect(authIdx).toBeGreaterThan(-1);
    expect(collectIdx).toBeGreaterThan(-1);
    expect(collectIdx).toBeGreaterThan(authIdx);
  });
});

// ---------------------------------------------------------------------------
// (e) BLOCKED_SETUP classification, not an unrelated crash
//
// Superseded by the acceptance-business-isolation fix: 20-existing-business-
// acceptance.spec.ts no longer reads the shared Startup handoff fixture (see
// tests/production/helpers/domain-business.ts's header for why sharing one
// business across domains is unsafe) -- it resolves its OWN dedicated
// Finance business instead. The BLOCKED classification behavior these tests
// protect (a setup failure skips cleanly via test.skip(), never crashes out
// of beforeAll with an unrelated exception) still applies, just to a
// different failure source.
// ---------------------------------------------------------------------------
describe("(e) 20-existing-business-acceptance.spec.ts — BLOCKED_SETUP when its dedicated business cannot be created", () => {
  it("declares a BLOCKED_SETUP reason string naming the underlying error", () => {
    expect(EXISTING_BUSINESS_SPEC_SRC).toContain("BLOCKED_SETUP");
    expect(EXISTING_BUSINESS_SPEC_SRC).toMatch(
      /could not create Finance's dedicated acceptance business/
    );
    expect(EXISTING_BUSINESS_SPEC_SRC).toMatch(/e instanceof Error \? e\.message : String\(e\)/);
  });

  it("no longer reads the shared Startup handoff fixture (the root cause this superseded)", () => {
    expect(EXISTING_BUSINESS_SPEC_SRC).not.toContain("phase13-startup-mode-ids.json");
    expect(EXISTING_BUSINESS_SPEC_SRC).not.toMatch(/handoffBusinessId/);
  });

  it("resolves its own dedicated business via resolveOrCreateDomainBusiness", () => {
    expect(EXISTING_BUSINESS_SPEC_SRC).toContain('from "./helpers/domain-business"');
    expect(EXISTING_BUSINESS_SPEC_SRC).toMatch(
      /resolveOrCreateDomainBusiness\(context, page, "finance"\)/
    );
  });

  it("skips via test.skip() in beforeEach, not by throwing out of beforeAll", () => {
    expect(EXISTING_BUSINESS_SPEC_SRC).toMatch(
      /test\.skip\(blockedUpstreamReason !== null, blockedUpstreamReason/
    );
  });

  it("resolves the dedicated business inside a try/catch, so a creation failure cannot throw an unrelated exception out of beforeAll", () => {
    const idx = EXISTING_BUSINESS_SPEC_SRC.indexOf("test.beforeAll(async ({ browser })");
    expect(idx).toBeGreaterThan(-1);
    const block = EXISTING_BUSINESS_SPEC_SRC.slice(idx, idx + 800);
    expect(block).toContain("try {");
    expect(block).toContain("resolveOrCreateDomainBusiness(");
    expect(block).toContain("} catch");
  });
});

// ---------------------------------------------------------------------------
// (c) Evidence teardown never throws when setup failed before tracing
//     started, or before a context ever existed -- real behavioral proof,
//     not just source inspection.
// ---------------------------------------------------------------------------
describe("(c) evidence.ts — safe/idempotent teardown on setup failure", () => {
  function fakeTestInfo(status: TestInfo["status"] = "failed"): TestInfo {
    return { status, title: "synthetic-test" } as unknown as TestInfo;
  }
  function fakePage(): Page {
    return {
      on: vi.fn(),
      screenshot: vi.fn().mockResolvedValue(undefined),
    } as unknown as Page;
  }

  // captureOnFailure()/finalizeEvidence() write real evidence directories
  // under production-test-results/evidence/<specName> when collection IS
  // tracked for the context (see the "a context IS tracked" case below) --
  // clean that up so this unit test never leaves stray output in the tree.
  afterEach(() => {
    rmSync(join(process.cwd(), "production-test-results", "evidence", "spec-tracked"), {
      recursive: true,
      force: true,
    });
  });

  it("captureOnFailure() resolves without throwing when context/page are undefined (context never created)", async () => {
    await expect(captureOnFailure(undefined, undefined, fakeTestInfo(), "spec")).resolves.toBeUndefined();
  });

  it("finalizeEvidence() resolves without throwing when context is undefined (context never created)", async () => {
    await expect(finalizeEvidence(undefined, "spec")).resolves.toBeUndefined();
  });

  it("captureOnFailure() resolves without throwing when a context exists but startEvidenceCollection() was never called on it (login rejected before collection started)", async () => {
    const untrackedContext = {} as BrowserContext;
    const page = fakePage();
    await expect(
      captureOnFailure(untrackedContext, page, fakeTestInfo(), "spec")
    ).resolves.toBeUndefined();
    expect(page.screenshot).not.toHaveBeenCalled();
  });

  it("finalizeEvidence() resolves without throwing when a context exists but collection was never started on it", async () => {
    const untrackedContext = {} as BrowserContext;
    await expect(finalizeEvidence(untrackedContext, "spec")).resolves.toBeUndefined();
  });

  it("checkpointScreenshot() resolves without throwing / without calling page.screenshot when collection was never started for the context", async () => {
    const untrackedContext = {} as BrowserContext;
    const page = fakePage();
    await expect(
      checkpointScreenshot(untrackedContext, page, "spec", "checkpoint")
    ).resolves.toBeUndefined();
    expect(page.screenshot).not.toHaveBeenCalled();
  });

  it("a context IS tracked once startEvidenceCollection() runs, so teardown on a real failure still captures a screenshot (not a no-op for the tracked path)", async () => {
    const context = {} as BrowserContext;
    const page = fakePage();

    startEvidenceCollection(context, page, "spec-tracked");
    expect(page.on).toHaveBeenCalledWith("request", expect.any(Function));
    expect(page.on).toHaveBeenCalledWith("requestfinished", expect.any(Function));
    expect(page.on).toHaveBeenCalledWith("requestfailed", expect.any(Function));
    expect(page.on).toHaveBeenCalledWith("console", expect.any(Function));

    await captureOnFailure(context, page, fakeTestInfo("failed"), "spec-tracked");
    expect(page.screenshot).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// (f) The sanitized evidence collector never captures headers/cookies/
// bodies, even when the underlying request/response objects carry them --
// and no raw Playwright trace mechanism exists anywhere in evidence.ts.
// ---------------------------------------------------------------------------
describe("(f) sanitized evidence collector never leaks headers/cookies into uploaded evidence", () => {
  const SPEC = "spec-sanitize-test";

  afterEach(() => {
    rmSync(join(process.cwd(), "production-test-results", "evidence", SPEC), { recursive: true, force: true });
  });

  it("evidence.ts never calls context.tracing -- no raw trace capture mechanism exists at all (RAW_PLAYWRIGHT_TRACE_UPLOAD=0)", () => {
    const evidenceSrc = readFileSync(
      join(process.cwd(), "tests/production/helpers/evidence.ts"),
      "utf-8"
    );
    // Matches an actual API call site (e.g. `context.tracing.start(`), not
    // this file's own explanatory prose about why such calls are forbidden.
    expect(evidenceSrc).not.toMatch(/\.tracing\.(start|stop|startChunk|stopChunk)\(/);
  });

  it("the written sanitized network log never contains a leaked session cookie value or header name, even though the underlying request/response carried one", async () => {
    const handlers: Record<string, (...args: unknown[]) => unknown> = {};
    const page = {
      on: vi.fn((event: string, handler: (...args: unknown[]) => unknown) => {
        handlers[event] = handler;
      }),
      screenshot: vi.fn().mockResolvedValue(undefined),
    } as unknown as Page;
    const context = {} as BrowserContext;

    startEvidenceCollection(context, page, SPEC);

    const leakedCookieValue = "sess_leaked_TOKEN_9f3a7c21";
    const fakeRequest = {
      method: () => "GET",
      url: () => "https://o-ps-iq.vercel.app/api/owner/home?businessId=abc-123",
      headers: () => ({ cookie: `opsiq_session=${leakedCookieValue}` }),
      response: async () => ({
        status: () => 200,
        headers: () => ({ "set-cookie": `opsiq_session=${leakedCookieValue}` }),
      }),
    };

    handlers.request(fakeRequest);
    await handlers.requestfinished(fakeRequest);

    await finalizeEvidence(context, SPEC);

    const written = readFileSync(
      join(process.cwd(), "production-test-results", "evidence", SPEC, `${SPEC}-network-log.json`),
      "utf-8"
    );
    expect(written).not.toContain(leakedCookieValue);
    expect(written.toLowerCase()).not.toContain("cookie");
    // Sanity: the entry itself WAS recorded (pathname/method/status only).
    expect(written).toContain("/api/owner/home");
    expect(written).toContain("GET");
    expect(written).toContain("200");
  });
});

// ---------------------------------------------------------------------------
// (a) + (b) authenticateProductionOwner() -- real behavioral proof against
// a duck-typed mock Page, not just source inspection.
// ---------------------------------------------------------------------------
describe("(a)+(b) authenticateProductionOwner() — 401 classified immediately, credentials never leaked in the error", () => {
  const EMAIL = "owner@example-acceptance.test";
  const PASSWORD = "S3cretDoNotLeak!";

  beforeEach(() => {
    process.env.PRODUCTION_ACCEPTANCE_EMAIL = EMAIL;
    process.env.PRODUCTION_ACCEPTANCE_PASSWORD = PASSWORD;
  });

  function mockRejectedLoginPage(): Page {
    const responseStub = {
      ok: () => false,
      status: () => 401,
      url: () => "https://example.test/api/auth/login",
      json: async () => ({ error: "Invalid email or password", classification: "invalid_credentials" }),
    };
    return {
      goto: vi.fn().mockResolvedValue(undefined),
      waitForSelector: vi.fn().mockResolvedValue(undefined),
      fill: vi.fn().mockResolvedValue(undefined),
      waitForResponse: vi.fn().mockResolvedValue(responseStub),
      click: vi.fn().mockResolvedValue(undefined),
      waitForURL: vi.fn().mockRejectedValue(new Error("should never be called on a rejected login")),
      context: vi.fn(),
    } as unknown as Page;
  }

  it("throws synchronously off the login response (does not wait for navigation) when the API returns 401", async () => {
    const page = mockRejectedLoginPage();
    await expect(authenticateProductionOwner(page)).rejects.toThrow(/HTTP 401/);
    expect((page as unknown as { waitForURL: ReturnType<typeof vi.fn> }).waitForURL).not.toHaveBeenCalled();
  });

  it("the thrown error includes the server's classification, for truthful reporting", async () => {
    const page = mockRejectedLoginPage();
    await expect(authenticateProductionOwner(page)).rejects.toThrow(/invalid_credentials/);
  });

  it("the thrown error NEVER contains the supplied password value", async () => {
    const page = mockRejectedLoginPage();
    try {
      await authenticateProductionOwner(page);
      throw new Error("expected authenticateProductionOwner to throw");
    } catch (err) {
      expect((err as Error).message).not.toContain(PASSWORD);
    }
  });

  it("the thrown error NEVER contains the supplied email value", async () => {
    const page = mockRejectedLoginPage();
    try {
      await authenticateProductionOwner(page);
      throw new Error("expected authenticateProductionOwner to throw");
    } catch (err) {
      expect((err as Error).message).not.toContain(EMAIL);
    }
  });
});

// ---------------------------------------------------------------------------
// Run #32568877293 (run #6) forensic closure: page.on("request"/...) events
// never fire for page.request.* calls (Playwright's Node-side APIRequestContext
// is invisible to browser-page network events), so any spec dominated by
// direct-API setup/verification calls produced an empty sanitized network
// log. recordApiCall()/timedApiCall() close this gap; every page.request.*
// call site in both production spec files must report itself through them.
// ---------------------------------------------------------------------------
describe("(h) run #6 — page.request.* traffic is captured via recordApiCall()/timedApiCall(), not silently dropped", () => {
  const SPEC = "spec-api-call-capture-test";

  afterEach(() => {
    rmSync(join(process.cwd(), "production-test-results", "evidence", SPEC), { recursive: true, force: true });
  });

  it("recordApiCall() writes a sanitized entry (method/pathname/status/duration only) once collection has started for the context", async () => {
    const page = { on: vi.fn(), screenshot: vi.fn().mockResolvedValue(undefined) } as unknown as Page;
    const context = {} as BrowserContext;
    startEvidenceCollection(context, page, SPEC);

    recordApiCall(context, "GET", "/api/owner/finance/actions/:actionId", 200, 42);
    await finalizeEvidence(context, SPEC);

    const written = readFileSync(
      join(process.cwd(), "production-test-results", "evidence", SPEC, `${SPEC}-network-log.json`),
      "utf-8"
    );
    const entries = JSON.parse(written);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      method: "GET",
      pathname: "/api/owner/finance/actions/:actionId",
      status: 200,
      durationMs: 42,
      label: "page.request",
    });
  });

  it("recordApiCall() is a safe no-op when collection was never started for the context (e.g. login failed before startEvidenceCollection ran)", () => {
    const untrackedContext = {} as BrowserContext;
    expect(() => recordApiCall(untrackedContext, "GET", "/api/x", 200, 1)).not.toThrow();
    expect(() => recordApiCall(undefined, "GET", "/api/x", 200, 1)).not.toThrow();
  });

  it("timedApiCall() times the call, records it via recordApiCall(), and returns the underlying response unchanged", async () => {
    const page = { on: vi.fn(), screenshot: vi.fn().mockResolvedValue(undefined) } as unknown as Page;
    const context = {} as BrowserContext;
    startEvidenceCollection(context, page, SPEC);

    const fakeResponse = { status: () => 201, ok: () => true };
    const result = await timedApiCall(context, "POST", "/api/owner/startup/sessions", async () => fakeResponse);
    expect(result).toBe(fakeResponse);

    await finalizeEvidence(context, SPEC);
    const written = readFileSync(
      join(process.cwd(), "production-test-results", "evidence", SPEC, `${SPEC}-network-log.json`),
      "utf-8"
    );
    const entries = JSON.parse(written);
    expect(entries).toHaveLength(1);
    expect(entries[0].method).toBe("POST");
    expect(entries[0].pathname).toBe("/api/owner/startup/sessions");
    expect(entries[0].status).toBe(201);
    expect(typeof entries[0].durationMs).toBe("number");
  });

  it("every page.request.(get|post|patch|put|delete) call site in both production spec files is wrapped in timedApiCall(...), not called bare", () => {
    // A bare call reads as `page.request.get(` etc. immediately after
    // whitespace/`=`/`(` with no intervening `timedApiCall(` -- approximated
    // here by scanning every page.request.* occurrence and requiring the
    // nearest preceding "timedApiCall(" to be closer than the nearest
    // preceding top-level statement boundary. Simpler and just as precise
    // for this fixed pair of files: every page.request.* occurrence's
    // enclosing line (or the few lines above it, for a multi-line call) must
    // contain "timedApiCall(" somewhere before it within the same statement.
    for (const [name, src] of [
      ["10-startup-mode-acceptance.spec.ts", STARTUP_SPEC_SRC],
      ["20-existing-business-acceptance.spec.ts", EXISTING_BUSINESS_SPEC_SRC],
    ] as const) {
      const callRegex = /page\.request\.(get|post|patch|put|delete)\(/g;
      let match: RegExpExecArray | null;
      let checked = 0;
      while ((match = callRegex.exec(src)) !== null) {
        checked++;
        // Look back up to 200 chars for the nearest "timedApiCall(" -- every
        // real call site in these files wraps page.request.* within a few
        // lines via `timedApiCall(context, METHOD, "route", () => page.request...)`.
        const windowStart = Math.max(0, match.index - 200);
        const preceding = src.slice(windowStart, match.index);
        expect(
          preceding,
          `${name}: page.request.${match[1]}( at offset ${match.index} is not wrapped in timedApiCall(...)`
        ).toContain("timedApiCall(");
      }
      // Sanity: both files genuinely use page.request.* -- this test would
      // pass vacuously (and silently stop proving anything) if it didn't.
      expect(checked, `${name}: expected at least one page.request.* call site`).toBeGreaterThan(0);
    }
  });

  it("logoutProductionOwner() accepts and forwards the BrowserContext so its logout POST is captured too", () => {
    const authSrc = readFileSync(
      join(process.cwd(), "tests/production/helpers/production-auth.ts"),
      "utf-8"
    );
    expect(authSrc).toMatch(/export async function logoutProductionOwner\(page: Page, context\?: BrowserContext\)/);
    expect(authSrc).toContain("timedApiCall(context,");
    expect(STARTUP_SPEC_SRC).toMatch(/logoutProductionOwner\(page,\s*context\)/);
  });
});

// ---------------------------------------------------------------------------
// Run #32568877293 (run #6) forensic closure: 01-07 must never classify a
// completed-action transition by re-inspecting a `.first()`-by-priority
// dashboard/card locator -- action.service.ts's completion side effect
// (automatic re-diagnosis) deterministically regenerates a same-title/
// priority action in a NEW cycle, so a `.first()` locator captured before
// completion can silently re-resolve to a DIFFERENT, still-"proposed" row
// afterward (proven end to end in
// src/__tests__/owner-finance/services.db.test.ts). The fix: capture the
// action's own id before mutating, then verify completion by polling that
// exact id via a direct API GET.
// ---------------------------------------------------------------------------
describe("(i) run #6 — 01-07 verifies action completion by id, not by re-reading a .first() card", () => {
  it("captures the action's own id from the dashboard before clicking Complete", () => {
    const idx = EXISTING_BUSINESS_SPEC_SRC.indexOf('test("01-07');
    expect(idx).toBeGreaterThan(-1);
    const clickIdx = EXISTING_BUSINESS_SPEC_SRC.indexOf('name: "Complete"', idx);
    expect(clickIdx).toBeGreaterThan(idx);
    const setup = EXISTING_BUSINESS_SPEC_SRC.slice(idx, clickIdx);
    expect(setup).toMatch(/const actionId: string = /);
  });

  it("polls the action's own id via a direct GET (not the card) to confirm 'completed', using expect(...).toPass for auto-retry instead of a fixed timing window", () => {
    const idx = EXISTING_BUSINESS_SPEC_SRC.indexOf('test("01-07');
    const block = EXISTING_BUSINESS_SPEC_SRC.slice(idx, idx + 3400);
    expect(block).toMatch(/await expect\(async \(\) => \{[\s\S]*?\}\)\.toPass\(\{ timeout: \d+ \}\)/);
    expect(block).toMatch(/\/api\/owner\/finance\/actions\/\$\{actionId\}/);
  });

  it("does not assert the completed status via card.toContainText('completed') (only 'assigned'/'in_progress', which are pre-reassessment states, use the card)", () => {
    const idx = EXISTING_BUSINESS_SPEC_SRC.indexOf('test("01-07');
    const block = EXISTING_BUSINESS_SPEC_SRC.slice(idx, idx + 3400);
    expect(block).not.toMatch(/expect\(card\)\.toContainText\(["']completed["']\)/);
    expect(block).toMatch(/expect\(card\)\.toContainText\(["']assigned["']\)/);
    expect(block).toMatch(/expect\(card\)\.toContainText\(["']in_progress["']\)/);
  });
});
