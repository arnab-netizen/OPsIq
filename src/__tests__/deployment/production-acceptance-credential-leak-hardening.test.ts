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
  startEvidenceCollection,
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
// (e) BLOCKED_UPSTREAM classification, not an unrelated crash
// ---------------------------------------------------------------------------
describe("(e) 20-existing-business-acceptance.spec.ts — BLOCKED_UPSTREAM when the handoff fixture is absent/unsuccessful", () => {
  it("declares a BLOCKED_UPSTREAM reason string for a missing fixture file", () => {
    expect(EXISTING_BUSINESS_SPEC_SRC).toContain("BLOCKED_UPSTREAM");
    expect(EXISTING_BUSINESS_SPEC_SRC).toMatch(/phase13-startup-mode-ids\.json not found/);
  });

  it("declares a distinct BLOCKED_UPSTREAM reason when the fixture exists but the handoff did not succeed", () => {
    expect(EXISTING_BUSINESS_SPEC_SRC).toMatch(/!handoffIds\.succeeded\s*\|\|\s*!handoffIds\.handoffBusinessId/);
  });

  it("skips via test.skip() in beforeEach, not by throwing out of beforeAll", () => {
    expect(EXISTING_BUSINESS_SPEC_SRC).toMatch(
      /test\.skip\(blockedUpstreamReason !== null, blockedUpstreamReason/
    );
  });

  it("reads the fixture inside a try/catch, so a missing/malformed file cannot throw an unrelated exception out of beforeAll", () => {
    const idx = EXISTING_BUSINESS_SPEC_SRC.indexOf("test.beforeAll(async ({ browser })");
    expect(idx).toBeGreaterThan(-1);
    const block = EXISTING_BUSINESS_SPEC_SRC.slice(idx, idx + 800);
    expect(block).toContain("try {");
    expect(block).toContain("readFileSync(");
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
