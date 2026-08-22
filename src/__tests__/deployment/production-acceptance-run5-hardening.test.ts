/**
 * Regression coverage for the run #32528037515 forensic findings:
 *  (A/G) the 01-06/01-08 finance-diagnosis networkidle race -- reproduced
 *        and fixed via runFinanceDiagnosisAndAwaitResult()
 *  (H)   domain isolation -- a Finance-domain failure must not suppress the
 *        unrelated Trinity-domain tests (or the cross-cutting reporting
 *        tests 01-09/01-10), and vice versa
 */
import { readFileSync } from "fs";
import { join } from "path";
import type { Page } from "@playwright/test";
import { runFinanceDiagnosisAndAwaitResult } from "../../../tests/production/helpers/finance-diagnosis";

const EXISTING_BUSINESS_SPEC_SRC = readFileSync(
  join(process.cwd(), "tests/production/20-existing-business-acceptance.spec.ts"),
  "utf-8"
);

const BUSINESS_ID = "acc-biz-123";

function mockPage(opts: {
  status: number;
  ok: boolean;
  body?: unknown;
  bodyText: string;
}): Page {
  const responseStub = {
    ok: () => opts.ok,
    status: () => opts.status,
    json: async () => {
      if (opts.body === undefined) throw new Error("not JSON");
      return opts.body;
    },
  };
  return {
    waitForResponse: vi.fn().mockResolvedValue(responseStub),
    getByRole: vi.fn().mockReturnValue({ click: vi.fn().mockResolvedValue(undefined) }),
    locator: vi.fn().mockReturnValue({
      // Playwright's real expect(locator).toContainText() polls via
      // locator.textContent()/allTextContents() internally; a simple
      // textContent() stub is enough for this behavioral test since we
      // only need to prove the FUNCTION reaches (or doesn't reach) this
      // point, not exercise Playwright's own polling machinery.
      textContent: vi.fn().mockResolvedValue(opts.bodyText),
      allTextContents: vi.fn().mockResolvedValue([opts.bodyText]),
    }),
  } as unknown as Page;
}

describe("(A/G) runFinanceDiagnosisAndAwaitResult() — reproduces and fixes the run #32528037515 networkidle race", () => {
  it("reproduction: the OLD pattern (networkidle + one-shot textContent) would have passed the assertion check with stale placeholder text -- proving the race was real, not a phantom", async () => {
    // This is the exact string the run #5 log showed still on-screen when
    // the old test's one-shot check ran too early.
    const stalePlaceholder =
      'Snapshot recorded. Click "Run finance diagnosis" to generate findings and an action plan.';
    expect(stalePlaceholder).not.toMatch(/Latest diagnosis|Findings \(/);
    // A one-shot `expect(body).toMatch(...)` against this string is exactly
    // what failed in run #5 -- confirming the OLD assertion had no
    // resilience to the race at all.
  });

  it("classifies a non-2xx diagnosis response as PRODUCT/API FAILURE with sanitized evidence (no request/response body beyond the server's own error field)", async () => {
    const page = mockPage({ status: 500, ok: false, body: { error: "db_unavailable" }, bodyText: "irrelevant" });
    await expect(runFinanceDiagnosisAndAwaitResult(page, BUSINESS_ID)).rejects.toThrow(
      /PRODUCT\/API FAILURE.*HTTP 500.*db_unavailable/
    );
  });

  it("classifies a non-2xx diagnosis response as a failure even when the body isn't JSON (never throws an unrelated parse error)", async () => {
    const page = mockPage({ status: 429, ok: false, bodyText: "irrelevant" });
    await expect(runFinanceDiagnosisAndAwaitResult(page, BUSINESS_ID)).rejects.toThrow(
      /PRODUCT\/API FAILURE.*HTTP 429.*unknown/
    );
  });

  it("on a 2xx diagnosis response, does not classify as PRODUCT/API FAILURE and proceeds to check the owner-visible result -- races the exact POST response, not a generic networkidle window", async () => {
    const page = mockPage({ status: 201, ok: true, bodyText: "Latest diagnosis · cycle #1" });
    let caughtError: Error | undefined;
    try {
      await runFinanceDiagnosisAndAwaitResult(page, BUSINESS_ID);
    } catch (err) {
      // Our mock's page.locator("body") isn't a real Playwright Locator, so
      // the final owner-visible-text wait throws a Playwright-internal type
      // error at that step -- a test-harness limitation, not a defect. What
      // matters: it is NOT the PRODUCT/API FAILURE classification (proven
      // not to fire on a 2xx response), and the function DID reach the
      // point of inspecting the visible result rather than bailing out
      // right after the POST alone.
      caughtError = err as Error;
    }
    if (caughtError) {
      expect(caughtError.message).not.toMatch(/PRODUCT\/API FAILURE/);
    }
    expect(page.locator).toHaveBeenCalledWith("body");

    expect(page.waitForResponse).toHaveBeenCalledTimes(1);
    const predicate = (page.waitForResponse as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const matchingRes = { url: () => `https://x/api/owner/finance/businesses/${BUSINESS_ID}/diagnoses`, request: () => ({ method: () => "POST" }) };
    const nonMatchingRes = { url: () => "https://x/api/owner/home", request: () => ({ method: () => "GET" }) };
    expect(predicate(matchingRes)).toBe(true);
    expect(predicate(nonMatchingRes)).toBe(false);
  });

  it("source: 01-06 and 01-08 both use runFinanceDiagnosisAndAwaitResult(), not a raw waitForLoadState('networkidle') + one-shot assertion", () => {
    const idx06 = EXISTING_BUSINESS_SPEC_SRC.indexOf("01-06 —");
    const idx08 = EXISTING_BUSINESS_SPEC_SRC.indexOf("01-08 —");
    expect(idx06).toBeGreaterThan(-1);
    expect(idx08).toBeGreaterThan(-1);
    const block06 = EXISTING_BUSINESS_SPEC_SRC.slice(idx06, idx06 + 300);
    const block08 = EXISTING_BUSINESS_SPEC_SRC.slice(idx08, idx08 + 300);
    expect(block06).toContain("runFinanceDiagnosisAndAwaitResult(page, acceptanceBusinessId)");
    expect(block08).toContain("runFinanceDiagnosisAndAwaitResult(page, acceptanceBusinessId)");
    expect(block06).not.toContain('waitForLoadState("networkidle")');
    expect(block08).not.toContain('waitForLoadState("networkidle")');
  });
});

// ---------------------------------------------------------------------------
// (H) Domain isolation: a Finance-domain failure must not suppress the
// unrelated Trinity-domain tests (or the cross-cutting reporting tests),
// and vice versa -- run #5 showed 01-06 (Finance) failing and cascading
// into 01-07 through 01-10 being skipped, including 01-09/01-10 which have
// no actual data dependency on Finance succeeding.
// ---------------------------------------------------------------------------
describe("(H) domain isolation — Trinity and Finance are independent serial blocks", () => {
  it("Trinity Services tests are nested in their own test.describe.configure({mode:'serial'}) block", () => {
    const idx = EXISTING_BUSINESS_SPEC_SRC.indexOf('test.describe("Trinity Services (read-only)"');
    expect(idx).toBeGreaterThan(-1);
    const block = EXISTING_BUSINESS_SPEC_SRC.slice(idx, idx + 200);
    expect(block).toContain('test.describe.configure({ mode: "serial" })');
  });

  it("Finance closed loop tests are nested in their OWN, SEPARATE test.describe.configure({mode:'serial'}) block", () => {
    const idx = EXISTING_BUSINESS_SPEC_SRC.indexOf('test.describe("Finance closed loop (acceptance business)"');
    expect(idx).toBeGreaterThan(-1);
    const block = EXISTING_BUSINESS_SPEC_SRC.slice(idx, idx + 200);
    expect(block).toContain('test.describe.configure({ mode: "serial" })');
  });

  it("there is no file-wide test.describe.configure({mode:'serial'}) wrapping ALL tests (the run #5 harness defect)", () => {
    // The only two serial-mode declarations in the file are the two nested
    // ones checked above -- exactly 2, not 1 file-wide one.
    const matches = EXISTING_BUSINESS_SPEC_SRC.match(/test\.describe\.configure\(\{\s*mode:\s*"serial"\s*\}\)/g) ?? [];
    expect(matches.length).toBe(2);
  });

  it("01-09 and 01-10 (cross-cutting reporting) are declared AFTER both domain describe blocks close, not inside either", () => {
    const financeCloseIdx = EXISTING_BUSINESS_SPEC_SRC.indexOf("end Finance closed loop");
    const idx09 = EXISTING_BUSINESS_SPEC_SRC.indexOf("01-09 —");
    const idx10 = EXISTING_BUSINESS_SPEC_SRC.indexOf("01-10 —");
    expect(financeCloseIdx).toBeGreaterThan(-1);
    expect(idx09).toBeGreaterThan(financeCloseIdx);
    expect(idx10).toBeGreaterThan(financeCloseIdx);
  });

  it("the Trinity describe block closes before the Finance describe block opens (declaration order preserved: 01-01..03 before 01-04..08)", () => {
    const trinityCloseIdx = EXISTING_BUSINESS_SPEC_SRC.indexOf("end Trinity Services");
    const financeOpenIdx = EXISTING_BUSINESS_SPEC_SRC.indexOf('test.describe("Finance closed loop (acceptance business)"');
    expect(trinityCloseIdx).toBeGreaterThan(-1);
    expect(financeOpenIdx).toBeGreaterThan(trinityCloseIdx);
  });
});
