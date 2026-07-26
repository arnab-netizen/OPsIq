/**
 * Spec 58 — Stage 3 Integrated Journey: Owner Onboarding + SOP Process Intelligence.
 *
 * Proves end-to-end via authenticated API calls (browser session cookies):
 *   Bundle 3.8: startOnboarding → GET persisted state → PATCH complete (archetype assigned, internal
 *               fields archetypeScore / completionKey / createdBy absent from DTO)
 *   Bundle 3.9: assignTraining → GET list → PATCH recordCompletion with evidence → GET compliance rate
 *   Cross-bundle: workspace isolation — each API endpoint returns 401/403 without auth
 *   Refresh: each GET after mutation returns the updated state
 *   No fatal console errors across the journey
 *
 * Requires: seed-e2e-owner.ts executed against the target DB
 * (E2E_OWNER user + E2E_WORKSPACE_ID workspace must exist).
 * Requires: E2E_OWNER role assignment grants OWNER_ONBOARD (bundle 3.8) and SOP_MANAGE (bundle 3.9).
 * These capabilities are now included in admin_or_portfolio_manager (src/policies/capability-check.ts).
 *
 * Auth surface: OWNER_ONBOARD (bundle 3.8), SOP_MANAGE (bundle 3.9)
 */

import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { randomUUID } from "crypto";
import { authenticateUser, waitForPageReady } from "./helpers";
import { E2E_OWNER, E2E_BC_PROBE_BUSINESS_ID } from "./e2e-fixtures";

// Fresh UUIDs scoped to this spec run — no cross-spec contamination
const SOP_DOCUMENT_ID = randomUUID();
const SOP_STAFF_MEMBER = randomUUID();

const consoleErrors: string[] = [];
function watchConsole(page: Page) {
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
}
function fatalErrors(): string[] {
  return consoleErrors.filter(
    (e) => /Cannot read|is not a function|Hydration failed/i.test(e)
  );
}

test.describe.configure({ mode: "serial" });

test.describe("58 — Stage 3 integrated journey: onboarding + SOP process intelligence", () => {
  let context: BrowserContext;
  let page: Page;
  let onboardingId: string;
  let assignmentId: string;

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext();
    page = await context.newPage();
    watchConsole(page);
    await authenticateUser(page, E2E_OWNER.email, E2E_OWNER.password);
  });

  test.afterAll(async () => {
    await context.close();
  });

  // ── Bundle 3.8 — Owner Onboarding and Archetype Seeding ─────────────────────

  test("3.8.1: POST /api/owner/onboarding-lifecycle starts onboarding (idempotent)", async () => {
    const res = await page.request.post("/api/owner/onboarding-lifecycle", {
      data: {
        businessId: E2E_BC_PROBE_BUSINESS_ID,
        ownerId: E2E_OWNER.userId,
        businessName: "E2E Spec 58: Test Business",
        businessType: "food_retail",
        revenueRange: "100k-500k",
        revenueTrend: "STABLE",
        profitability: "BREAKEVEN",
        cashRunwayWeeks: 12,
        ownerHoursPerWeek: 50,
        teamSize: 5,
      },
    });

    expect(res.status()).toBe(201);
    const body = await res.json();
    const result = body.data ?? body;
    expect(result.id).toBeTruthy();
    expect(result.workspaceId).toBeTruthy();
    expect(["IN_PROGRESS", "COMPLETED", "RE_ONBOARDING"]).toContain(result.status);
    onboardingId = result.id;
    // Internal fields must be absent from public DTO
    expect(result.archetypeScore).toBeUndefined();
    expect(result.completionKey).toBeUndefined();
    expect(result.createdBy).toBeUndefined();
    expect(result.updatedBy).toBeUndefined();
  });

  test("3.8.2: GET /api/owner/onboarding-lifecycle returns persisted onboarding state", async () => {
    const res = await page.request.get("/api/owner/onboarding-lifecycle");
    expect(res.status()).toBe(200);
    const body = await res.json();
    const result = body.data ?? body;
    expect(result.id).toBe(onboardingId);
    expect(result.businessName).toBeTruthy();
    // Internal fields absent
    expect(result.archetypeScore).toBeUndefined();
  });

  test("3.8.3: PATCH complete — COMPLETED status, archetype assigned, internal fields excluded", async () => {
    // If workspace already has a COMPLETED onboarding from a prior run, re-onboard first
    const currentRes = await page.request.get("/api/owner/onboarding-lifecycle");
    expect(currentRes.status()).toBe(200);
    const currentBody = await currentRes.json();
    const current = currentBody.data ?? currentBody;

    if (current.status === "COMPLETED") {
      const reRes = await page.request.patch("/api/owner/onboarding-lifecycle", {
        data: { action: "re_onboard", reOnboardingReason: "E2E spec 58 re-run reset" },
      });
      expect(reRes.status()).toBe(200);
    }

    const res = await page.request.patch("/api/owner/onboarding-lifecycle", {
      data: {
        action: "complete",
        completionKey: `spec58-complete-${Date.now()}`,
      },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    const result = body.data ?? body;
    expect(result.status).toBe("COMPLETED");
    expect(result.archetype).toBeTruthy();
    expect(result.initialActionQueue).toBeTruthy();
    // Internal fields excluded from DTO
    expect(result.archetypeScore).toBeUndefined();
    expect(result.completionKey).toBeUndefined();

    // Refresh: GET confirms COMPLETED
    const getRes = await page.request.get("/api/owner/onboarding-lifecycle");
    expect(getRes.status()).toBe(200);
    const getBody = await getRes.json();
    const refreshed = getBody.data ?? getBody;
    expect(refreshed.status).toBe("COMPLETED");
  });

  // ── Bundle 3.9 — SOP Process Intelligence ────────────────────────────────────

  test("3.9.1: POST /api/owner/sop-intelligence assigns training in ASSIGNED state", async () => {
    const res = await page.request.post("/api/owner/sop-intelligence", {
      data: {
        action: "assign_training",
        sopDocumentId: SOP_DOCUMENT_ID,
        assignedTo: SOP_STAFF_MEMBER,
      },
    });

    expect(res.status()).toBe(201);
    const body = await res.json();
    const result = body.data ?? body;
    expect(result.status).toBe("ASSIGNED");
    expect(result.sopDocumentId).toBe(SOP_DOCUMENT_ID);
    assignmentId = result.id;
    expect(assignmentId).toBeTruthy();
    // Internal field excluded from public DTO
    expect(result.assignedBy).toBeUndefined();
  });

  test("3.9.2: GET /api/owner/sop-intelligence list includes the new assignment", async () => {
    const res = await page.request.get(
      `/api/owner/sop-intelligence?sopDocumentId=${SOP_DOCUMENT_ID}`
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    const items: { id: string }[] = body.data ?? body;
    expect(Array.isArray(items)).toBe(true);
    expect(items.some((a) => a.id === assignmentId)).toBe(true);
  });

  test("3.9.3: PATCH records training completion with evidence, status COMPLETED", async () => {
    const res = await page.request.patch("/api/owner/sop-intelligence", {
      data: {
        assignmentId,
        evidenceUrl: "https://internal.opsiq/spec58/training/cert.pdf",
        evidenceNote: "E2E spec 58 training completion evidence",
      },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    const result = body.data ?? body;
    expect(result.status).toBe("COMPLETED");
    expect(result.evidenceUrl).toBe("https://internal.opsiq/spec58/training/cert.pdf");
    expect(result.completedAt).toBeTruthy();
  });

  test("3.9.4: GET compliance mode returns rate > 0 after assignment completion", async () => {
    const res = await page.request.get(
      `/api/owner/sop-intelligence?mode=compliance&sopDocumentId=${SOP_DOCUMENT_ID}`
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    const result = body.data ?? body;
    expect(result.sopDocumentId).toBe(SOP_DOCUMENT_ID);
    expect(result.totalAssigned).toBeGreaterThanOrEqual(1);
    expect(result.totalCompleted).toBeGreaterThanOrEqual(1);
    expect(result.complianceRate).toBeGreaterThan(0);
    expect(result.complianceRate).toBeLessThanOrEqual(1);
  });

  // ── Cross-cutting: auth gate ──────────────────────────────────────────────────

  test("unauthenticated GET /api/owner/onboarding-lifecycle returns 401", async () => {
    const unauthCtx = await page.context().browser()!.newContext();
    const unauthPage = await unauthCtx.newPage();
    const res = await unauthPage.request.get("/api/owner/onboarding-lifecycle");
    expect([401, 403]).toContain(res.status());
    await unauthCtx.close();
  });

  test("unauthenticated GET /api/owner/sop-intelligence returns 401", async () => {
    const unauthCtx = await page.context().browser()!.newContext();
    const unauthPage = await unauthCtx.newPage();
    const res = await unauthPage.request.get("/api/owner/sop-intelligence");
    expect([401, 403]).toContain(res.status());
    await unauthCtx.close();
  });

  test("no fatal console errors across the stage 3 onboarding + SOP journey", async () => {
    await page.goto("/owner", { waitUntil: "networkidle" });
    await waitForPageReady(page);
    const fatal = fatalErrors();
    expect(fatal, `fatal console errors: ${fatal.join(" | ")}`).toEqual([]);
  });
});
