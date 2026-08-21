/**
 * Runs a finance diagnosis and waits for its deterministic outcome.
 *
 * Root cause this replaces (run #32528037515, 01-06): the client's
 * runDiagnosis() handler (src/app/(authenticated)/owner/finance/page.tsx)
 * does `await api(POST .../diagnoses)` then a SEPARATE `await
 * load(businessId)` GET, so Playwright's generic page.waitForLoadState
 * ("networkidle") can settle in the gap between those two requests -- well
 * before the page has re-rendered with the actual diagnosis result. A
 * one-shot textContent() check right after networkidle can therefore
 * observe the pre-diagnosis "Snapshot recorded..." placeholder text even
 * though the diagnosis itself succeeded (or before its real outcome is
 * known at all) -- an INDETERMINATE_TEST_SYNCHRONIZATION_DEFECT, not
 * evidence of a product defect either way.
 *
 * This races the actual diagnosis POST response, classifies a non-2xx
 * response as a real product/API failure with sanitized evidence (no
 * request/response bodies beyond the server's own `error` field), and only
 * on success waits -- via Playwright's auto-retrying `expect`, not a fixed
 * timing window -- for the owner-visible canonical result state.
 */
import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

export async function runFinanceDiagnosisAndAwaitResult(page: Page, businessId: string): Promise<void> {
  const [diagnosisResponse] = await Promise.all([
    page.waitForResponse(
      (res) =>
        res.url().includes(`/api/owner/finance/businesses/${businessId}/diagnoses`) &&
        res.request().method() === "POST",
      { timeout: 20000 }
    ),
    page.getByRole("button", { name: "Run finance diagnosis" }).click(),
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
      `PRODUCT/API FAILURE: finance diagnosis POST rejected -- HTTP ${diagnosisResponse.status()} / ${detail}`
    );
  }

  // 2xx: wait for the owner-visible canonical result state, not a fixed
  // network-idle window -- this auto-retries until the client's follow-up
  // GET (runDiagnosis's `await load(businessId)`) has actually re-rendered.
  await expect(page.locator("body")).toContainText(/Latest diagnosis|Findings \(/, { timeout: 15000 });
}
