/* eslint-disable @typescript-eslint/no-explicit-any -- dynamic capture object + untyped API JSON bodies in a test-only baseline */
/**
 * PRE-TRAINING REALISTIC SCENARIO BASELINE — capture, not improvement.
 *
 * Logs in as the seeded Kolkata laundry owner and captures exactly what OpsIQ surfaces today across
 * the real command center + budget/cashflow/operations pages and the real owner action routes. It
 * writes a machine-readable artifact (no secrets) for before/after comparison after training, and
 * asserts ONLY harness invariants (login worked, real data rendered, server enforcement active) so
 * weak/generic output is RECORDED honestly rather than failing the run.
 */
import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import { authenticateUser, waitForPageReady, captureScreenshot } from "./helpers";
import {
  BASELINE_OWNER,
  BASELINE_PROOF_TASK_ID,
  BASELINE_ARTIFACT_DIR,
  BASELINE_ARTIFACT_FILE,
} from "./baseline-fixtures";

// Fetch an owner API as JSON from inside the authenticated browser context (cookies sent; no secrets returned).
async function apiJson(page: import("@playwright/test").Page, url: string) {
  return page.evaluate(async (u) => {
    try {
      const r = await fetch(u, { headers: { "Content-Type": "application/json" } });
      let body: unknown = null;
      try { body = await r.json(); } catch { body = null; }
      return { url: u, status: r.status, ok: r.ok, body };
    } catch (e) {
      return { url: u, status: 0, ok: false, error: (e as Error).message };
    }
  }, url);
}

async function postJson(page: import("@playwright/test").Page, url: string, payload: unknown) {
  return page.evaluate(async ({ u, p }) => {
    try {
      const r = await fetch(u, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(p) });
      let body: unknown = null;
      try { body = await r.json(); } catch { body = null; }
      return { url: u, status: r.status, ok: r.ok, body };
    } catch (e) {
      return { url: u, status: 0, ok: false, error: (e as Error).message };
    }
  }, { u: url, p: payload });
}

async function visibleText(page: import("@playwright/test").Page, selector: string): Promise<string | null> {
  const loc = page.locator(selector).first();
  if ((await loc.count()) === 0) return null;
  return (await loc.innerText()).replace(/\s+\n/g, "\n").trim();
}

test.describe("Pre-training realistic baseline — Laundry Cash Squeeze (Kolkata)", () => {
  test("capture OpsIQ's end-to-end response to the messy scenario", async ({ page }) => {
    const capture: Record<string, unknown> = {
      scenario: "Laundry Cash Squeeze + Capacity + Quality Complaint Growth Trap",
      location: "Kolkata, West Bengal, India",
      capturedAtNote: "timestamp stamped by the workflow, not the test (deterministic harness)",
      pages: {} as Record<string, unknown>,
      api: {} as Record<string, unknown>,
      actions: {} as Record<string, unknown>,
    };

    // 1. Login as the seeded owner (real approved test-auth path).
    await authenticateUser(page, BASELINE_OWNER.email, BASELINE_OWNER.password);

    // 2. Command center — wait for real backend data, capture everything visible.
    await page.goto("/owner", { waitUntil: "networkidle" });
    await waitForPageReady(page).catch(() => undefined);
    (capture.pages as any).ownerCommandCenter = await visibleText(page, "main, body");
    (capture.pages as any).controlCenterPanel = await visibleText(page, '[data-testid="owner-control-center"]');
    (capture.api as any).commandCenter = await apiJson(page, "/api/owner/command-center");
    (capture.api as any).controlCenter = await apiJson(page, "/api/owner/control-center");
    (capture.api as any).businesses = await apiJson(page, "/api/owner/businesses");
    await captureScreenshot(page, "baseline-command-center");

    // 3. Domain pages — budget (cash-risk), cashflow, operations (quality/capacity).
    for (const [key, route] of [["budget", "/owner/budget"], ["cashflow", "/owner/cashflow"], ["operations", "/owner/operations"]] as const) {
      await page.goto(route, { waitUntil: "networkidle" });
      await waitForPageReady(page).catch(() => undefined);
      (capture.pages as any)[key] = await visibleText(page, "main, body");
    }
    (capture.api as any).budgetGuidance = await apiJson(page, "/api/owner/budget/guidance");

    // 4. Owner action A — tempting risky discount approval (server decides; never silent).
    (capture.actions as any).riskyDiscountApproval = await postJson(page, "/api/owner/approvals/resolve", {
      scope: "pricing.discount",
      actionType: "apply_discount",
      riskClass: "high",
      content: { note: "Run a 30% monsoon discount + accept the low-margin hotel B2B contract to boost volume." },
    });

    // 5. Owner action B — proof-gated staff task completion WITHOUT proof (before/after state).
    const beforeProofBlocked = (((capture.api as any).controlCenter?.body) as any)?.sections?.proofBlocked ?? null;
    (capture.actions as any).proofGatedCompletion = await postJson(page, "/api/owner/tasks/complete", {
      taskId: BASELINE_PROOF_TASK_ID, ownerOverride: false,
    });
    const afterControl = await apiJson(page, "/api/owner/control-center");
    const afterProofBlocked = ((afterControl.body) as any)?.sections?.proofBlocked ?? null;
    (capture.actions as any).proofBlockedBeforeAfter = { before: beforeProofBlocked, after: afterProofBlocked };

    // 6. Persist the raw capture artifact (no secrets/tokens/cookies).
    const dir = path.resolve(process.cwd(), BASELINE_ARTIFACT_DIR);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, BASELINE_ARTIFACT_FILE), JSON.stringify(capture, null, 2));

    // 7. Harness invariants ONLY (not output-quality judgments):
    //    real data rendered, and server enforcement on the proof gate is active.
    await expect(page.locator("body")).toBeVisible();
    expect((capture.api as any).controlCenter?.status).toBe(200);
    expect((capture.api as any).commandCenter?.status).toBe(200);
    // Server-side proof gate must reject a proofless completion (no fake success).
    expect((capture.actions as any).proofGatedCompletion?.status).toBe(409);
    // Defect 1 (hardening): the risky-approval decision route must return a controlled decision,
    // never a 500. After the audit entity_id fix it resolves to needs_owner_approval (200).
    expect((capture.actions as any).riskyDiscountApproval?.status).not.toBe(500);
    expect((capture.actions as any).riskyDiscountApproval?.status).toBe(200);
  });
});
