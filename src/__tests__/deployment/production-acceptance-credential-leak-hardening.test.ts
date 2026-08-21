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
 *  (c) evidence teardown never throws when setup failed before tracing
 *      started (or before a context even existed)
 *  (d) automatic Playwright trace/screenshot capture is disabled at the
 *      config level, so no credential-bearing page state can ever be
 *      captured before this suite's own explicit tracing begins
 *  (e) the downstream existing-business suite classifies itself
 *      BLOCKED_UPSTREAM (not an unrelated crash) when the upstream
 *      handoff fixture is missing or unsuccessful
 *  (g) explicit tracing is started only after login succeeds, in both
 *      spec files, so the login request itself is never inside a trace
 */
import { readFileSync, rmSync } from "fs";
import { join } from "path";
import type { BrowserContext, Page, TestInfo } from "@playwright/test";
import {
  captureOnFailure,
  checkpointScreenshot,
  finalizeTracing,
  startTracing,
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
// (g) startTracing() is called only after authenticateProductionOwner()
//     resolves, in both spec files that create their own context
// ---------------------------------------------------------------------------
describe("(g) explicit tracing starts only after login succeeds", () => {
  it("10-startup-mode-acceptance.spec.ts: authenticateProductionOwner() precedes startTracing() in beforeAll", () => {
    const authIdx = STARTUP_SPEC_SRC.indexOf("await authenticateProductionOwner(page)");
    const traceIdx = STARTUP_SPEC_SRC.indexOf("await startTracing(context)");
    expect(authIdx).toBeGreaterThan(-1);
    expect(traceIdx).toBeGreaterThan(-1);
    expect(traceIdx).toBeGreaterThan(authIdx);
  });

  it("20-existing-business-acceptance.spec.ts: authenticateProductionOwner() precedes startTracing() in beforeAll", () => {
    const authIdx = EXISTING_BUSINESS_SPEC_SRC.indexOf("await authenticateProductionOwner(page)");
    const traceIdx = EXISTING_BUSINESS_SPEC_SRC.indexOf("await startTracing(context)");
    expect(authIdx).toBeGreaterThan(-1);
    expect(traceIdx).toBeGreaterThan(-1);
    expect(traceIdx).toBeGreaterThan(authIdx);
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

  // captureOnFailure() writes real evidence directories under
  // production-test-results/evidence/<specName> when tracing IS tracked for
  // the context (see the "a context IS tracked" case below) -- clean that up
  // so this unit test never leaves stray output in the working tree.
  afterEach(() => {
    rmSync(join(process.cwd(), "production-test-results", "evidence", "spec-tracked"), {
      recursive: true,
      force: true,
    });
  });

  it("captureOnFailure() resolves without throwing when context/page are undefined (context never created)", async () => {
    await expect(captureOnFailure(undefined, undefined, fakeTestInfo(), "spec")).resolves.toBeUndefined();
  });

  it("finalizeTracing() resolves without throwing when context is undefined (context never created)", async () => {
    await expect(finalizeTracing(undefined)).resolves.toBeUndefined();
  });

  it("captureOnFailure() resolves without throwing when a context exists but startTracing() was never called on it (login rejected before tracing started)", async () => {
    const untrackedContext = {} as BrowserContext;
    const page = {} as Page;
    await expect(
      captureOnFailure(untrackedContext, page, fakeTestInfo(), "spec")
    ).resolves.toBeUndefined();
  });

  it("finalizeTracing() resolves without throwing when a context exists but tracing was never started on it", async () => {
    const untrackedContext = {} as BrowserContext;
    await expect(finalizeTracing(untrackedContext)).resolves.toBeUndefined();
  });

  it("checkpointScreenshot() resolves without throwing / without calling page.screenshot when tracing was never started for the context", async () => {
    const untrackedContext = {} as BrowserContext;
    const screenshot = vi.fn();
    const page = { screenshot } as unknown as Page;
    await expect(
      checkpointScreenshot(untrackedContext, page, "spec", "checkpoint")
    ).resolves.toBeUndefined();
    expect(screenshot).not.toHaveBeenCalled();
  });

  it("a context IS tracked once startTracing() succeeds, so teardown on a real failure still captures evidence (not a no-op for the success path)", async () => {
    const tracingStart = vi.fn().mockResolvedValue(undefined);
    const tracingStartChunk = vi.fn().mockResolvedValue(undefined);
    const tracingStopChunk = vi.fn().mockResolvedValue(undefined);
    const context = {
      tracing: {
        start: tracingStart,
        startChunk: tracingStartChunk,
        stopChunk: tracingStopChunk,
      },
    } as unknown as BrowserContext;

    await startTracing(context);
    expect(tracingStart).toHaveBeenCalledTimes(1);
    expect(tracingStartChunk).toHaveBeenCalledTimes(1);

    const page = { screenshot: vi.fn().mockResolvedValue(undefined) } as unknown as Page;
    await captureOnFailure(context, page, fakeTestInfo("failed"), "spec-tracked");
    expect(tracingStopChunk).toHaveBeenCalledTimes(1);
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
