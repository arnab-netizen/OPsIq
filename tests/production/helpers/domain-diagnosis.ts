/**
 * Runs a domain diagnosis and waits for its deterministic outcome.
 *
 * Generalizes the fix from finance-diagnosis.ts (run #32528037515, 01-06)
 * for reuse by every domain whose Owner page follows the same client
 * pattern: a runDiagnosis() handler that does `await api(POST .../diagnoses)`
 * then a SEPARATE `await load(businessId)` GET, so Playwright's generic
 * page.waitForLoadState("networkidle") can settle in the gap between those
 * two requests -- well before the page has re-rendered with the actual
 * diagnosis result. A one-shot textContent() check right after networkidle
 * can therefore observe the pre-diagnosis placeholder text even though the
 * diagnosis itself succeeded (or before its real outcome is known at all) --
 * an INDETERMINATE_TEST_SYNCHRONIZATION_DEFECT, not evidence of a product
 * defect either way.
 *
 * This races the actual diagnosis POST response, classifies a non-2xx
 * response as a real product/API failure with sanitized evidence (no
 * request/response bodies beyond the server's own `error` field), and only
 * on success waits -- via Playwright's auto-retrying `expect`, not a fixed
 * timing window -- for the owner-visible canonical result state.
 */
import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

export async function runDomainDiagnosisAndAwaitResult(
  page: Page,
  diagnosisUrlSubstring: string,
  runButtonName: string,
  resultTextPattern: RegExp
): Promise<void> {
  const [diagnosisResponse] = await Promise.all([
    page.waitForResponse(
      (res) => res.url().includes(diagnosisUrlSubstring) && res.request().method() === "POST",
      { timeout: 20000 }
    ),
    page.getByRole("button", { name: runButtonName }).click(),
  ]);

  if (!diagnosisResponse.ok()) {
    let detail = "unknown";
    try {
      const body = await diagnosisResponse.json();
      detail = body?.error ?? "unknown";
    } catch {
      // Response body wasn't JSON -- detail stays "unknown".
    }
    throw new Error(
      `PRODUCT/API FAILURE: diagnosis POST rejected -- HTTP ${diagnosisResponse.status()} / ${detail}`
    );
  }

  // 2xx: wait for the owner-visible canonical result state, not a fixed
  // network-idle window -- this auto-retries until the client's follow-up
  // GET has actually re-rendered.
  await expect(page.locator("body")).toContainText(resultTextPattern, { timeout: 15000 });
}
